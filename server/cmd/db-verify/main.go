// db-verify compares stopped-writer JSON snapshots against an imported MySQL
// database. It uses a read-only consistent transaction and never runs migrations.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math/big"
	"os"
	"reflect"
	"time"

	"github.com/go-sql-driver/mysql"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
)

type report struct {
	Source       string `json:"source"`
	Match        bool   `json:"match"`
	Players      int    `json:"players"`
	Accounts     int    `json:"accounts,omitempty"`
	Sessions     int    `json:"sessions,omitempty"`
	Receipts     int    `json:"receipts,omitempty"`
	Transactions int    `json:"transactions,omitempty"`
	SourceSHA256 string `json:"sourceSha256"`
}

func decodeStrict(raw []byte, out any) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(out); err != nil {
		// Decoder errors can quote unknown field names or source values.
		return errors.New("snapshot structure is invalid or unsupported")
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return errors.New("snapshot must contain exactly one JSON document")
	}
	return nil
}

func semanticJSON(raw []byte) (any, error) {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var value any
	if err := d.Decode(&value); err != nil {
		return nil, errors.New("stored JSON is invalid")
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return nil, errors.New("stored JSON contains multiple documents")
	}
	return normalizeNumbers(value), nil
}

// MySQL may format JSON numbers differently (1.0 versus 1). Compare their exact
// rational values without passing large integers through float64.
func normalizeNumbers(value any) any {
	switch v := value.(type) {
	case json.Number:
		if n, ok := new(big.Rat).SetString(string(v)); ok {
			return n
		}
	case map[string]any:
		for key, child := range v {
			v[key] = normalizeNumbers(child)
		}
	case []any:
		for i, child := range v {
			v[i] = normalizeNumbers(child)
		}
	}
	return value
}

func equalJSON(want any, raw []byte) bool {
	expected, err := json.Marshal(want)
	if err != nil {
		return false
	}
	a, err := semanticJSON(expected)
	if err != nil {
		return false
	}
	b, err := semanticJSON(raw)
	return err == nil && reflect.DeepEqual(a, b)
}

func equalAccountTime(expected, stored time.Time) bool {
	expected, stored = expected.UTC(), stored.UTC()
	// DATETIME(6) loses nanoseconds. Accept either MySQL rounding or driver
	// truncation to the exact microsecond, but no larger timestamp difference.
	return stored.Equal(expected.Truncate(time.Microsecond)) || stored.Equal(expected.Round(time.Microsecond))
}

func openReadOnly(ctx context.Context, dsn string) (*sql.DB, *sql.Tx, error) {
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil || cfg.DBName == "" {
		return nil, nil, errors.New("invalid database configuration")
	}
	cfg.ParseTime, cfg.MultiStatements, cfg.Loc = true, false, time.UTC
	cfg.Timeout, cfg.ReadTimeout, cfg.WriteTimeout = 5*time.Second, 30*time.Second, 10*time.Second
	connector, err := mysql.NewConnector(cfg)
	if err != nil {
		return nil, nil, errors.New("invalid database configuration")
	}
	db := sql.OpenDB(connector)
	db.SetMaxOpenConns(1)
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		db.Close()
		return nil, nil, errors.New("cannot begin read-only database verification")
	}
	return db, tx, nil
}

func verifyGame(ctx context.Context, tx *sql.Tx, raw []byte) (report, error) {
	out := report{Source: "game"}
	var source repository.Database
	if err := decodeStrict(raw, &source); err != nil {
		return out, err
	}
	if source.SchemaVersion != 1 || source.Players == nil {
		return out, errors.New("unsupported game snapshot")
	}
	players := map[string]*repository.Player{}
	primary := map[string]string{}
	sessions := map[string]string{}
	for hash, p := range source.Players {
		if p == nil || p.ID == "" || hash == "" || players[p.ID] != nil {
			return out, errors.New("invalid or duplicate source player identity")
		}
		// ImportJSON deliberately promotes retained confirmed transaction IDs
		// into durable deduplication evidence before traffic can trim history.
		// This is the only player aggregate transformation accepted here.
		for _, txn := range p.State.Txns {
			if txn.Status == "confirmed" && txn.ID != "" {
				if p.AppliedPayments == nil {
					p.AppliedPayments = map[string]bool{}
				}
				p.AppliedPayments[txn.ID] = true
			}
		}
		players[p.ID], primary[p.ID] = p, hash
		for _, session := range append([]string{hash}, p.SessionAliases...) {
			if session == "" || sessions[session] != "" {
				return out, errors.New("invalid or duplicate source session identity")
			}
			sessions[session] = p.ID
		}
		out.Receipts += len(p.Receipts)
	}
	rows, err := tx.QueryContext(ctx, "SELECT player_id,primary_hash,player_json,is_qa FROM game_players")
	if err != nil {
		return out, errors.New("cannot read game player records")
	}
	for rows.Next() {
		var id, hash string
		var aggregate []byte
		var qa bool
		if err = rows.Scan(&id, &hash, &aggregate, &qa); err != nil {
			rows.Close()
			return out, errors.New("cannot decode game player record")
		}
		p := players[id]
		if p == nil || primary[id] != hash || !equalJSON(p, aggregate) {
			rows.Close()
			return out, errors.New("game player aggregate or primary session differs")
		}
		expectedQA := p.QARestore != nil || p.State.QACheckpointID != "" || (p.State.ActiveBattle != nil && p.State.ActiveBattle.QA)
		if qa != expectedQA {
			rows.Close()
			return out, errors.New("game player QA index differs")
		}
		out.Players++
	}
	err = rows.Err()
	rows.Close()
	if err != nil || out.Players != len(players) {
		return out, errors.New("game player counts differ or read is incomplete")
	}
	rows, err = tx.QueryContext(ctx, "SELECT token_hash,player_id FROM game_sessions")
	if err != nil {
		return out, errors.New("cannot read game session records")
	}
	for rows.Next() {
		var hash, id string
		if err = rows.Scan(&hash, &id); err != nil || sessions[hash] != id || id == "" {
			rows.Close()
			return out, errors.New("game session mapping differs")
		}
		out.Sessions++
	}
	err = rows.Err()
	rows.Close()
	if err != nil || out.Sessions != len(sessions) {
		return out, errors.New("game session counts differ or read is incomplete")
	}
	rows, err = tx.QueryContext(ctx, "SELECT username,player_id,password_hash,password_salt,created_at FROM game_accounts")
	if err != nil {
		return out, errors.New("cannot read game account records")
	}
	for rows.Next() {
		var account repository.Account
		if err = rows.Scan(&account.Username, &account.PlayerID, &account.PasswordHash, &account.PasswordSalt, &account.CreatedAt); err != nil {
			rows.Close()
			return out, errors.New("cannot decode game account record")
		}
		expected := source.Accounts[account.Username]
		if expected == nil || expected.Username != account.Username || players[expected.PlayerID] == nil || expected.PlayerID != account.PlayerID || expected.PasswordHash != account.PasswordHash || expected.PasswordSalt != account.PasswordSalt || !equalAccountTime(expected.CreatedAt, account.CreatedAt) {
			rows.Close()
			return out, errors.New("game account credentials, link, or creation time differs")
		}
		out.Accounts++
	}
	err = rows.Err()
	rows.Close()
	if err != nil || out.Accounts != len(source.Accounts) {
		return out, errors.New("game account counts differ or read is incomplete")
	}
	var imported bool
	if err = tx.QueryRowContext(ctx, "SELECT imported FROM game_store_meta WHERE id=1").Scan(&imported); err != nil || !imported {
		return out, errors.New("game import completion marker is absent")
	}
	return out, nil
}

func verifyPayments(ctx context.Context, tx *sql.Tx, raw []byte) (report, error) {
	out := report{Source: "payments"}
	var source struct {
		Players map[string][]domain.Txn `json:"players"`
	}
	if err := decodeStrict(raw, &source); err != nil {
		return out, err
	}
	if source.Players == nil {
		return out, errors.New("unsupported payment snapshot")
	}
	expectedTotal := 0
	for _, records := range source.Players {
		expectedTotal += len(records)
	}
	seen := map[string]int{}
	rows, err := tx.QueryContext(ctx, "SELECT txn_id,player_id,txn_json FROM payment_transactions ORDER BY sequence_id DESC")
	if err != nil {
		return out, errors.New("cannot read payment records")
	}
	defer rows.Close()
	for rows.Next() {
		var id, playerID string
		var record []byte
		if err = rows.Scan(&id, &playerID, &record); err != nil {
			return out, errors.New("cannot decode payment record")
		}
		history := source.Players[playerID]
		index := len(history) - seen[playerID] - 1
		if index < 0 || history[index].ID != id || history[index].PlayerID != playerID || !equalJSON(history[index], record) {
			return out, errors.New("payment record, player link, or history order differs")
		}
		seen[playerID]++
		out.Transactions++
	}
	err = rows.Err()
	rows.Close()
	if err != nil || out.Transactions != expectedTotal {
		return out, errors.New("payment transaction counts differ or read is incomplete")
	}
	for id, records := range source.Players {
		if seen[id] != len(records) {
			return out, errors.New("payment player history count differs")
		}
		if len(records) > 0 {
			out.Players++
		}
	}
	var imported bool
	if err = tx.QueryRowContext(ctx, "SELECT imported FROM payment_ledger_meta WHERE id=1").Scan(&imported); err != nil || !imported {
		return out, errors.New("payment import completion marker is absent")
	}
	return out, nil
}

func run(source, file string) (report, error) {
	var out report
	var envKey string
	switch source {
	case "game":
		envKey = "GAME_MYSQL_DSN"
	case "payments":
		envKey = "PAYMENT_MYSQL_DSN"
	default:
		return out, errors.New("-source must be game or payments")
	}
	if file == "" {
		return out, errors.New("-file is required")
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		return out, errors.New("cannot read verification snapshot")
	}
	dsn := os.Getenv(envKey)
	if dsn == "" {
		return out, fmt.Errorf("%s is required", envKey)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	db, tx, err := openReadOnly(ctx, dsn)
	if err != nil {
		return out, err
	}
	defer db.Close()
	defer tx.Rollback()
	if source == "game" {
		out, err = verifyGame(ctx, tx, raw)
	} else {
		out, err = verifyPayments(ctx, tx, raw)
	}
	if err != nil {
		return out, err
	}
	if err = tx.Commit(); err != nil {
		return out, errors.New("read-only verification did not complete")
	}
	digest := sha256.Sum256(raw)
	out.SourceSHA256 = hex.EncodeToString(digest[:])
	out.Match = true
	return out, nil
}

func main() {
	source := flag.String("source", "", "snapshot source: game or payments")
	file := flag.String("file", "", "path to a stopped-writer JSON snapshot")
	flag.Parse()
	result, err := run(*source, *file)
	if err != nil {
		fmt.Fprintln(os.Stderr, "verification failed:", err)
		os.Exit(1)
	}
	json.NewEncoder(os.Stdout).Encode(result)
}
