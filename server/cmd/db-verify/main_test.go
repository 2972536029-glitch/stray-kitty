package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/repository"
)

func TestSemanticComparisonPreservesNumberPrecision(t *testing.T) {
	want := map[string]any{"large": int64(9007199254740993), "number": 1, "list": []any{true, nil}}
	if !equalJSON(want, []byte(`{"list":[true,null],"number":1.0,"large":9007199254740993}`)) {
		t.Fatal("equivalent JSON formatting must compare equal")
	}
	if equalJSON(want, []byte(`{"list":[true,null],"number":1,"large":9007199254740992}`)) {
		t.Fatal("large integer differences must not be lost to float64")
	}
	if equalJSON(want, []byte(`{"list":[true,null],"number":1,"large":9007199254740993,"extra":true}`)) {
		t.Fatal("extra stored fields must fail comparison")
	}
}

func TestAccountTimeComparisonAllowsOnlyMicrosecondPrecision(t *testing.T) {
	source := time.Date(2026, 11, 12, 1, 2, 3, 123456789, time.FixedZone("test", 8*3600))
	if !equalAccountTime(source, source.UTC().Round(time.Microsecond)) || !equalAccountTime(source, source.UTC().Truncate(time.Microsecond)) {
		t.Fatal("database microsecond precision should be supported")
	}
	if equalAccountTime(source, source.UTC().Add(time.Millisecond)) {
		t.Fatal("meaningful timestamp differences must fail")
	}
}

func verifyTestDSN(t *testing.T) (string, *sql.DB) {
	t.Helper()
	dsn := os.Getenv("TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("TEST_MYSQL_DSN is not configured")
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		t.Fatal("invalid TEST_MYSQL_DSN")
	}
	cfg.DBName = ""
	admin, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	var entropy [10]byte
	if _, err = rand.Read(entropy[:]); err != nil {
		t.Fatal(err)
	}
	name := "kitty_verify_test_" + hex.EncodeToString(entropy[:])
	if _, err = admin.Exec("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec("DROP DATABASE `" + name + "`"); err != nil {
			t.Error(err)
		}
		admin.Close()
	})
	cfg.DBName, cfg.ParseTime = name, true
	db, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return cfg.FormatDSN(), db
}

func snapshotFile(t *testing.T, value any) string {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "snapshot.json")
	if err = os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func requireMismatch(t *testing.T, source, file string) {
	t.Helper()
	result, err := run(source, file)
	if err == nil || result.Match {
		t.Fatal("changed database unexpectedly passed verification")
	}
	for _, sensitive := range []string{"secret-hash", "secret-salt", "primary-session", "alias-session", "player-one", "cat-owner"} {
		if strings.Contains(err.Error(), sensitive) {
			t.Fatal("verification error leaked record contents")
		}
	}
}

func TestMySQLVerifyGameExactComparisonAndReadOnlyTransaction(t *testing.T) {
	dsn, db := verifyTestDSN(t)
	t.Setenv("GAME_MYSQL_DSN", dsn)
	p := &repository.Player{ID: "player-one", State: domain.InitialState("verify"), SessionAliases: []string{"alias-session"}, Receipts: map[string]repository.Receipt{}, ReceiptOrder: []string{"receipt-one"}, AppliedPayments: map[string]bool{"payment-one": true}}
	p.Receipts["receipt-one"] = repository.Receipt{Fingerprint: "request-hash", Response: domain.CommandResponse{State: p.State}}
	backup := domain.InitialState("qa-restore")
	p.QARestore = &backup
	a := &repository.Account{Username: "cat-owner", PlayerID: p.ID, PasswordHash: "secret-hash", PasswordSalt: "secret-salt", CreatedAt: time.Date(2026, 11, 12, 1, 2, 3, 123456789, time.UTC)}
	file := snapshotFile(t, repository.Database{SchemaVersion: 1, Players: map[string]*repository.Player{"primary-session": p}, Accounts: map[string]*repository.Account{a.Username: a}})
	store, err := repository.OpenMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err = store.ImportJSON(file); err != nil {
		t.Fatal(err)
	}
	result, err := run("game", file)
	if err != nil || !result.Match || result.Players != 1 || result.Accounts != 1 || result.Sessions != 2 || result.Receipts != 1 {
		t.Fatalf("verification did not match expected counts: %+v %v", result, err)
	}
	raw, _ := os.ReadFile(file)
	digest := sha256.Sum256(raw)
	if result.SourceSHA256 != hex.EncodeToString(digest[:]) {
		t.Fatal("source digest mismatch")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	readDB, tx, err := openReadOnly(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tx.ExecContext(ctx, "UPDATE game_store_meta SET imported=FALSE WHERE id=1"); err == nil {
		t.Fatal("verification transaction must reject writes")
	}
	tx.Rollback()
	readDB.Close()
	if _, err = db.Exec("UPDATE game_accounts SET password_hash='changed' WHERE username=?", a.Username); err != nil {
		t.Fatal(err)
	}
	requireMismatch(t, "game", file)
	if _, err = db.Exec("UPDATE game_accounts SET password_hash=? WHERE username=?", a.PasswordHash, a.Username); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("DELETE FROM game_sessions WHERE token_hash='alias-session'"); err != nil {
		t.Fatal(err)
	}
	requireMismatch(t, "game", file)
	if _, err = db.Exec("INSERT INTO game_sessions(token_hash,player_id) VALUES ('alias-session',?)", p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("UPDATE game_players SET player_json=JSON_SET(player_json,'$.state.currencies.tuna',999999)"); err != nil {
		t.Fatal(err)
	}
	requireMismatch(t, "game", file)
	aggregate, _ := json.Marshal(p)
	if _, err = db.Exec("UPDATE game_players SET player_json=? WHERE player_id=?", aggregate, p.ID); err != nil {
		t.Fatal(err)
	}
	if err = store.Create("extra-session", &repository.Player{ID: "extra-player", State: domain.InitialState("verify"), Receipts: map[string]repository.Receipt{}}); err != nil {
		t.Fatal(err)
	}
	requireMismatch(t, "game", file)
}

func TestMySQLVerifyPaymentHistoryAndRejectsExtras(t *testing.T) {
	dsn, db := verifyTestDSN(t)
	t.Setenv("PAYMENT_MYSQL_DSN", dsn)
	timestamp := time.Date(2026, 11, 12, 1, 2, 3, 456789123, time.UTC)
	source := map[string]any{"players": map[string][]domain.Txn{
		"player-one": {{ID: "txn-one", PlayerID: "player-one", Status: "confirmed", Amount: 1234, Currency: "USD", CardSuffix: "4242", Reason: "reason", CreatedAt: timestamp}, {ID: "txn-two", PlayerID: "player-one", Status: "declined", CreatedAt: timestamp.Add(-time.Hour)}},
		"player-two": {{ID: "txn-three", PlayerID: "player-two", Status: "confirmed", CreatedAt: timestamp}},
	}}
	file := snapshotFile(t, source)
	ledger, err := payment.OpenMySQLLedger(dsn)
	if err != nil {
		t.Fatal(err)
	}
	importer := ledger.(interface {
		ImportJSON(string) error
		Close() error
	})
	defer importer.Close()
	if err = importer.ImportJSON(file); err != nil {
		t.Fatal(err)
	}
	result, err := run("payments", file)
	if err != nil || !result.Match || result.Transactions != 3 || result.Players != 2 {
		t.Fatalf("payment verification mismatch: %+v %v", result, err)
	}
	if _, err = db.Exec("UPDATE payment_transactions SET txn_json=JSON_SET(txn_json,'$.amount',9999) WHERE txn_id='txn-one'"); err != nil {
		t.Fatal(err)
	}
	requireMismatch(t, "payments", file)
	if _, err = db.Exec("UPDATE payment_transactions SET txn_json=JSON_SET(txn_json,'$.amount',1234) WHERE txn_id='txn-one'"); err != nil {
		t.Fatal(err)
	}
	if err = ledger.Record(domain.Txn{ID: "extra", PlayerID: "player-one", Status: "confirmed"}); err != nil {
		t.Fatal(err)
	}
	requireMismatch(t, "payments", file)
}

func TestMySQLVerifyAcceptsOnlyDocumentedPaymentBackfill(t *testing.T) {
	dsn, db := verifyTestDSN(t)
	t.Setenv("GAME_MYSQL_DSN", dsn)
	p := &repository.Player{ID: "legacy-player", State: domain.InitialState("verify"), Receipts: map[string]repository.Receipt{}}
	p.State.Txns = []domain.Txn{{ID: "legacy-confirmed", Status: "confirmed"}, {ID: "legacy-declined", Status: "declined"}}
	file := snapshotFile(t, repository.Database{SchemaVersion: 1, Players: map[string]*repository.Player{"legacy-session": p}})
	store, err := repository.OpenMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err = store.ImportJSON(file); err != nil {
		t.Fatal(err)
	}
	if result, err := run("game", file); err != nil || !result.Match {
		t.Fatalf("documented confirmed-payment backfill must verify: %v", err)
	}
	if _, err = db.Exec(`UPDATE game_players SET player_json=JSON_REMOVE(player_json,'$.appliedPayments')`); err != nil {
		t.Fatal(err)
	}
	requireMismatch(t, "game", file)
}

func TestVerifierRejectsUnknownFieldsWithoutLeakingThem(t *testing.T) {
	var value repository.Database
	err := decodeStrict([]byte(`{"schemaVersion":1,"players":{},"private-account-field":"secret-hash"}`), &value)
	if err == nil || strings.Contains(err.Error(), "private-account-field") || strings.Contains(err.Error(), "secret-hash") {
		t.Fatal("strict decoder must fail without quoting source data")
	}
}
