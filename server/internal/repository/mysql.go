package repository

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"reflect"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
	"stray-kitty/server/internal/database"
	"stray-kitty/server/internal/domain"
)

const operationTimeout = 15 * time.Second

func OpenMySQL(dsn string) (*Store, error) {
	db, err := database.OpenMySQL(dsn)
	if err != nil {
		return nil, err
	}
	return &Store{sqlDB: db}, nil
}

func operationContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), operationTimeout)
}

func missingPlayer(byID bool) error {
	if byID {
		return domain.Fail("PLAYER_NOT_FOUND", "玩家不存在，请先开始新的旅程", 404)
	}
	return domain.Fail("UNAUTHORIZED", "会话不存在，请开始新的旅程", 401)
}

func duplicate(err error) bool {
	var e *mysql.MySQLError
	return errors.As(err, &e) && e.Number == 1062
}

// Every writer takes a shared gate before touching rows; an explicit import
// takes it exclusively. Thus even an empty import cannot race a new account.
func gameWriteTx(ctx context.Context, db *sql.DB) (*sql.Tx, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return nil, err
	}
	var imported bool
	if err = tx.QueryRowContext(ctx, "SELECT imported FROM game_store_meta WHERE id=1 FOR SHARE").Scan(&imported); err != nil {
		tx.Rollback()
		return nil, err
	}
	return tx, nil
}

func validIdentifier(value string) bool {
	if value == "" || len(value) > 128 {
		return false
	}
	for _, r := range value {
		if r < 33 || r > 126 {
			return false
		}
	}
	return true
}

func validatePlayer(hash string, p *Player) error {
	if p == nil || !validIdentifier(hash) || !validIdentifier(p.ID) {
		return errors.New("invalid player or session identity")
	}
	seen := map[string]bool{hash: true}
	for _, alias := range p.SessionAliases {
		if !validIdentifier(alias) || seen[alias] {
			return errors.New("invalid or duplicate session alias")
		}
		seen[alias] = true
	}
	if p.State.SchemaVersion != 1 || p.State.Revision < 0 || p.State.Inventory == nil || p.State.Currencies == nil {
		return errors.New("invalid player state")
	}
	if p.Receipts == nil {
		return errors.New("missing command receipt map")
	}
	receipts := make(map[string]bool, len(p.ReceiptOrder))
	for _, key := range p.ReceiptOrder {
		if _, ok := p.Receipts[key]; !ok || receipts[key] {
			return errors.New("invalid command receipt order")
		}
		receipts[key] = true
	}
	if len(receipts) != len(p.Receipts) {
		return errors.New("command receipt order is incomplete")
	}
	return nil
}

func insertPlayer(ctx context.Context, tx *sql.Tx, hash string, p *Player) error {
	if err := validatePlayer(hash, p); err != nil {
		return err
	}
	raw, err := json.Marshal(p)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO game_players(player_id,primary_hash,player_json,is_qa) VALUES (?,?,?,?)", p.ID, hash, raw, playerObservationQA(p)); err != nil {
		return err
	}
	for _, token := range append([]string{hash}, p.SessionAliases...) {
		if _, err = tx.ExecContext(ctx, "INSERT INTO game_sessions(token_hash,player_id) VALUES (?,?)", token, p.ID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) mysqlCreate(hash string, p *Player) error {
	ctx, cancel := operationContext()
	defer cancel()
	tx, err := gameWriteTx(ctx, s.sqlDB)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = insertPlayer(ctx, tx, hash, p); err != nil {
		if duplicate(err) {
			return domain.Fail("SESSION_CONFLICT", "会话冲突", 409)
		}
		return err
	}
	return tx.Commit()
}

func decodePlayer(raw []byte) (*Player, error) {
	var p Player
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, fmt.Errorf("invalid stored player: %w", err)
	}
	return &p, nil
}

func (s *Store) mysqlGet(key string, byID bool) (*Player, error) {
	ctx, cancel := operationContext()
	defer cancel()
	query := "SELECT p.player_json FROM game_players p JOIN game_sessions s ON s.player_id=p.player_id WHERE s.token_hash=?"
	if byID {
		query = "SELECT player_json FROM game_players WHERE player_id=?"
	}
	var raw []byte
	err := s.sqlDB.QueryRowContext(ctx, query, key).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, missingPlayer(byID)
	}
	if err != nil {
		return nil, err
	}
	return decodePlayer(raw)
}

func (s *Store) mysqlObservationIdentity(key string, byID bool) (string, bool, error) {
	ctx, cancel := operationContext()
	defer cancel()
	query := "SELECT p.player_id,p.is_qa FROM game_players p JOIN game_sessions s ON s.player_id=p.player_id WHERE s.token_hash=?"
	if byID {
		query = "SELECT player_id,is_qa FROM game_players WHERE player_id=?"
	}
	var id string
	var qa bool
	err := s.sqlDB.QueryRowContext(ctx, query, key).Scan(&id, &qa)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, missingPlayer(byID)
	}
	return id, qa, err
}

func lockedPlayer(ctx context.Context, tx *sql.Tx, key string, byID bool) (*Player, string, error) {
	id := key
	if !byID {
		err := tx.QueryRowContext(ctx, "SELECT player_id FROM game_sessions WHERE token_hash=?", key).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, "", missingPlayer(false)
		}
		if err != nil {
			return nil, "", err
		}
	}
	var raw []byte
	var primary string
	err := tx.QueryRowContext(ctx, "SELECT player_json,primary_hash FROM game_players WHERE player_id=? FOR UPDATE", id).Scan(&raw, &primary)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", missingPlayer(byID)
	}
	if err != nil {
		return nil, "", err
	}
	p, err := decodePlayer(raw)
	if err != nil {
		return nil, "", err
	}
	// Alias removal may commit between resolving the session and taking the
	// player lock. Recheck against the locked aggregate before invoking code.
	if !byID && key != primary {
		found := false
		for _, alias := range p.SessionAliases {
			if alias == key {
				found = true
				break
			}
		}
		if !found {
			return nil, "", missingPlayer(false)
		}
	}
	return p, primary, nil
}

func savePlayer(ctx context.Context, tx *sql.Tx, primary string, old, p *Player) error {
	if p.ID != old.ID {
		return errors.New("player identity cannot change")
	}
	if err := validatePlayer(primary, p); err != nil {
		return err
	}
	raw, err := json.Marshal(p)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE game_players SET player_json=?,is_qa=? WHERE player_id=?", raw, playerObservationQA(p), p.ID); err != nil {
		return err
	}
	if !reflect.DeepEqual(old.SessionAliases, p.SessionAliases) {
		if _, err = tx.ExecContext(ctx, "DELETE FROM game_sessions WHERE player_id=? AND token_hash<>?", p.ID, primary); err != nil {
			return err
		}
		for _, alias := range p.SessionAliases {
			if _, err = tx.ExecContext(ctx, "INSERT INTO game_sessions(token_hash,player_id) VALUES (?,?)", alias, p.ID); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Store) mysqlTransact(key string, byID, qa, payment bool, fn func(*Player) (domain.CommandResponse, error)) (domain.CommandResponse, error) {
	ctx, cancel := operationContext()
	defer cancel()
	tx, err := gameWriteTx(ctx, s.sqlDB)
	if err != nil {
		return domain.CommandResponse{}, err
	}
	defer tx.Rollback()
	old, primary, err := lockedPlayer(ctx, tx, key, byID)
	if err != nil {
		return domain.CommandResponse{}, err
	}
	p, err := clone(old)
	if err != nil {
		return domain.CommandResponse{}, err
	}
	response, err := fn(p)
	if err != nil {
		return domain.CommandResponse{}, err
	}
	if response.Replayed {
		return response, nil
	}
	if err = savePlayer(ctx, tx, primary, old, p); err != nil {
		return domain.CommandResponse{}, err
	}
	if err = tx.Commit(); err != nil {
		return domain.CommandResponse{}, err
	}
	observeCommittedEconomy(old, p, qa)
	if payment {
		observeCommittedPayment(old, p)
	}
	return response, nil
}

func (s *Store) mysqlAttachAlias(playerID, alias string) error {
	_, err := s.mysqlTransact(playerID, true, false, false, func(p *Player) (domain.CommandResponse, error) {
		for _, existing := range p.SessionAliases {
			if existing == alias {
				return domain.CommandResponse{Replayed: true}, nil
			}
		}
		p.SessionAliases = append(p.SessionAliases, alias)
		return domain.CommandResponse{}, nil
	})
	if duplicate(err) {
		return domain.Fail("SESSION_CONFLICT", "会话冲突", 409)
	}
	return err
}

func (s *Store) mysqlTrimAliases(playerID string, limit int) error {
	_, err := s.mysqlTransact(playerID, true, false, false, func(p *Player) (domain.CommandResponse, error) {
		if len(p.SessionAliases) <= limit {
			return domain.CommandResponse{Replayed: true}, nil
		}
		p.SessionAliases = append([]string{}, p.SessionAliases[len(p.SessionAliases)-limit:]...)
		return domain.CommandResponse{}, nil
	})
	return err
}

func validateAccount(a *Account) error {
	if a == nil || a.Username == "" || len(a.Username) > 384 || a.Username != strings.ToLower(a.Username) || !validIdentifier(a.PlayerID) || a.PasswordHash == "" || len(a.PasswordHash) > 128 || a.PasswordSalt == "" || len(a.PasswordSalt) > 128 || a.CreatedAt.IsZero() {
		return errors.New("invalid account")
	}
	return nil
}
func insertAccount(ctx context.Context, tx *sql.Tx, a *Account) error {
	if err := validateAccount(a); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, "INSERT INTO game_accounts(username,player_id,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)", a.Username, a.PlayerID, a.PasswordHash, a.PasswordSalt, a.CreatedAt.UTC())
	return err
}
func (s *Store) mysqlSaveAccount(a *Account) error {
	ctx, cancel := operationContext()
	defer cancel()
	tx, err := gameWriteTx(ctx, s.sqlDB)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = insertAccount(ctx, tx, a); err != nil {
		if duplicate(err) {
			return domain.Fail("USERNAME_TAKEN", "这个名字已经有小猫主人用了，换一个吧", 409)
		}
		return err
	}
	return tx.Commit()
}
func (s *Store) mysqlFindAccount(username string) (*Account, error) {
	ctx, cancel := operationContext()
	defer cancel()
	var a Account
	err := s.sqlDB.QueryRowContext(ctx, "SELECT username,player_id,password_hash,password_salt,created_at FROM game_accounts WHERE username=?", username).Scan(&a.Username, &a.PlayerID, &a.PasswordHash, &a.PasswordSalt, &a.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// ImportJSON is an explicit, all-or-nothing migration for an empty MySQL game
// store. The source is read without modification; no startup auto-import occurs.
func (s *Store) ImportJSON(path string) error {
	if s.sqlDB == nil {
		return errors.New("JSON import requires MySQL storage")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var source Database
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&source); err != nil {
		return err
	}
	if err = decoder.Decode(new(any)); err != io.EOF {
		return errors.New("game save must contain exactly one JSON document")
	}
	if source.SchemaVersion != 1 || source.Players == nil {
		return errors.New("unsupported game save schema")
	}
	ids := map[string]bool{}
	sessions := map[string]bool{}
	for hash, p := range source.Players {
		if err = validatePlayer(hash, p); err != nil {
			return err
		}
		// Legacy saves only retained a bounded display history. Preserve the
		// confirmed payment evidence before subsequent gameplay can trim it,
		// even if no payment callback arrives immediately after migration.
		for _, txn := range p.State.Txns {
			if txn.Status == "confirmed" && txn.ID != "" {
				if p.AppliedPayments == nil {
					p.AppliedPayments = map[string]bool{}
				}
				p.AppliedPayments[txn.ID] = true
			}
		}
		if ids[p.ID] {
			return errors.New("duplicate player identity in source")
		}
		ids[p.ID] = true
		for _, token := range append([]string{hash}, p.SessionAliases...) {
			if sessions[token] {
				return errors.New("duplicate session identity in source")
			}
			sessions[token] = true
		}
	}
	for key, a := range source.Accounts {
		if err = validateAccount(a); err != nil {
			return err
		}
		if key != a.Username || !ids[a.PlayerID] {
			return errors.New("invalid account link in source")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	tx, err := s.sqlDB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var imported bool
	if err = tx.QueryRowContext(ctx, "SELECT imported FROM game_store_meta WHERE id=1 FOR UPDATE").Scan(&imported); err != nil {
		return err
	}
	var count int
	if err = tx.QueryRowContext(ctx, "SELECT (SELECT COUNT(*) FROM game_players)+(SELECT COUNT(*) FROM game_accounts)+(SELECT COUNT(*) FROM game_sessions)").Scan(&count); err != nil {
		return err
	}
	if imported || count != 0 {
		return errors.New("game import requires an empty, never-imported target")
	}
	for hash, p := range source.Players {
		if err = insertPlayer(ctx, tx, hash, p); err != nil {
			return err
		}
	}
	for _, a := range source.Accounts {
		if err = insertAccount(ctx, tx, a); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, "UPDATE game_store_meta SET imported=TRUE WHERE id=1"); err != nil {
		return err
	}
	return tx.Commit()
}
