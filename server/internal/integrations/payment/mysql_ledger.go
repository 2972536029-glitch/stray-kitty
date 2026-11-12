package payment

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"time"

	"github.com/go-sql-driver/mysql"
	"stray-kitty/server/internal/database"
	"stray-kitty/server/internal/domain"
)

// mysqlLedger stores the complete authoritative payment history. It deliberately
// has no foreign key to game players: paymentd owns its ledger independently.
type mysqlLedger struct{ db *sql.DB }

func OpenMySQLLedger(dsn string) (Ledger, error) {
	db, err := database.OpenMySQL(dsn)
	if err != nil {
		return nil, err
	}
	return &mysqlLedger{db: db}, nil
}

func (l *mysqlLedger) Close() error                   { return l.db.Close() }
func (l *mysqlLedger) Ping(ctx context.Context) error { return l.db.PingContext(ctx) }
func (l *mysqlLedger) Backend() string                { return "mysql" }

func validateLedgerTxn(txn domain.Txn) error {
	for _, field := range []struct {
		name, value string
		limit       int
	}{{"transaction ID", txn.ID, 128}, {"player ID", txn.PlayerID, 48}} {
		if len(field.value) == 0 || len(field.value) > field.limit {
			return fmt.Errorf("invalid payment %s length", field.name)
		}
		for _, ch := range field.value {
			if ch < 33 || ch > 126 {
				return fmt.Errorf("payment %s must contain printable ASCII without spaces", field.name)
			}
		}
	}
	return nil
}

func (l *mysqlLedger) Record(txn domain.Txn) error {
	inserted, err := l.RecordIfNew(txn)
	if err == nil && !inserted {
		return domain.Fail("PAYMENT_ID_CONFLICT", "支付流水号已存在", 409)
	}
	return err
}

func (l *mysqlLedger) RecordIfNew(txn domain.Txn) (bool, error) {
	if err := validateLedgerTxn(txn); err != nil {
		return false, err
	}
	raw, err := json.Marshal(txn)
	if err != nil {
		return false, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tx, err := l.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	// Shared locks let writers proceed concurrently but prevent an import from
	// checking an empty ledger while a writer is about to insert its first row.
	var imported bool
	if err = tx.QueryRowContext(ctx, "SELECT imported FROM payment_ledger_meta WHERE id = 1 FOR SHARE").Scan(&imported); err != nil {
		return false, err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO payment_transactions (txn_id, player_id, txn_json) VALUES (?, ?, ?)", txn.ID, txn.PlayerID, raw)
	if err != nil {
		var mysqlErr *mysql.MySQLError
		if !errors.As(err, &mysqlErr) || mysqlErr.Number != 1062 {
			return false, err
		}
		// A duplicate must belong to the same payment. The webhook retries with
		// a new CreatedAt value, so timestamps are intentionally not compared.
		var stored []byte
		if err = tx.QueryRowContext(ctx, "SELECT txn_json FROM payment_transactions WHERE txn_id = ? FOR SHARE", txn.ID).Scan(&stored); err != nil {
			return false, err
		}
		var existing domain.Txn
		if err = json.Unmarshal(stored, &existing); err != nil {
			return false, err
		}
		if existing.PlayerID != txn.PlayerID || existing.PackID != txn.PackID || existing.Amount != txn.Amount || existing.Status != txn.Status || existing.Currency != txn.Currency || existing.Spent != txn.Spent {
			return false, domain.Fail("PAYMENT_ID_CONFLICT", "支付流水号与已有记录不一致", 409)
		}
		return false, tx.Commit()
	}
	if err = tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func (l *mysqlLedger) History(playerID string) ([]domain.Txn, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rows, err := l.db.QueryContext(ctx, "SELECT txn_json FROM payment_transactions WHERE player_id = ? ORDER BY sequence_id DESC", playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Txn{}
	for rows.Next() {
		var raw []byte
		var txn domain.Txn
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &txn); err != nil {
			return nil, err
		}
		out = append(out, txn)
	}
	return out, rows.Err()
}

// ImportJSON imports a legacy payments.json once into an empty payment ledger.
// It does not alter the source file, and validation or SQL failures roll back all
// rows. The importing process and paymentd must connect to the same database.
func (l *mysqlLedger) ImportJSON(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	var data ledgerData
	decoder := json.NewDecoder(f)
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&data); err != nil {
		return fmt.Errorf("decode payment ledger: %w", err)
	}
	if err = decoder.Decode(new(any)); err != io.EOF {
		return errors.New("payment ledger must contain exactly one JSON object")
	}
	if data.Players == nil {
		return errors.New("payment ledger is missing its players object")
	}
	seen := map[string]bool{}
	playerIDs := make([]string, 0, len(data.Players))
	for playerID, txns := range data.Players {
		playerIDs = append(playerIDs, playerID)
		for _, txn := range txns {
			if err = validateLedgerTxn(txn); err != nil {
				return err
			}
			if txn.PlayerID != playerID {
				return errors.New("payment ledger transaction does not match its player")
			}
			if seen[txn.ID] {
				return errors.New("payment ledger contains duplicate transaction IDs")
			}
			seen[txn.ID] = true
		}
	}
	sort.Strings(playerIDs)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	tx, err := l.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var imported bool
	if err = tx.QueryRowContext(ctx, "SELECT imported FROM payment_ledger_meta WHERE id = 1 FOR UPDATE").Scan(&imported); err != nil {
		return err
	}
	var count int64
	if err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM payment_transactions").Scan(&count); err != nil {
		return err
	}
	if imported || count != 0 {
		return errors.New("payment import requires an empty ledger that has not already been imported")
	}
	for _, playerID := range playerIDs {
		// Legacy slices are oldest-first; sequence_id retains that exact order,
		// including transactions whose CreatedAt values are equal or out of order.
		for _, txn := range data.Players[playerID] {
			raw, marshalErr := json.Marshal(txn)
			if marshalErr != nil {
				return marshalErr
			}
			if _, err = tx.ExecContext(ctx, "INSERT INTO payment_transactions (txn_id, player_id, txn_json) VALUES (?, ?, ?)", txn.ID, playerID, raw); err != nil {
				return err
			}
		}
	}
	if _, err = tx.ExecContext(ctx, "UPDATE payment_ledger_meta SET imported = TRUE WHERE id = 1"); err != nil {
		return err
	}
	return tx.Commit()
}
