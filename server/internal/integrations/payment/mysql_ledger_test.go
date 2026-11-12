package payment

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/platform"
)

// The DSN must be test-only and allow creating databases. Tests never erase
// tables in the supplied database; each uses its own generated database name.
func paymentTestDSN(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("TEST_MYSQL_DSN is not configured")
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		t.Fatal("invalid TEST_MYSQL_DSN")
	}
	admin, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	random := make([]byte, 10)
	if _, err = rand.Read(random); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	name := "kitty_payment_test_" + hex.EncodeToString(random)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err = admin.ExecContext(ctx, "CREATE DATABASE `"+name+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := admin.ExecContext(ctx, "DROP DATABASE `"+name+"`"); err != nil {
			t.Error(err)
		}
		admin.Close()
	})
	cfg.DBName = name
	return cfg.FormatDSN()
}

func openPaymentTestLedger(t *testing.T, dsn string) *mysqlLedger {
	t.Helper()
	ledger, err := OpenMySQLLedger(dsn)
	if err != nil {
		t.Fatal(err)
	}
	l := ledger.(*mysqlLedger)
	t.Cleanup(func() { l.Close() })
	return l
}

func ledgerFixture(t *testing.T, players map[string][]domain.Txn) string {
	t.Helper()
	raw, err := json.Marshal(ledgerData{Players: players})
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "payments.json")
	if err = os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestMySQLLedgerPersistsAndDeduplicatesAcrossConnections(t *testing.T) {
	dsn := paymentTestDSN(t)
	first := openPaymentTestLedger(t, dsn)
	second := openPaymentTestLedger(t, dsn)
	txn := domain.Txn{ID: "xsolla-100", PlayerID: "player-1", PackID: "pack_small", Amount: 600, Currency: "USD", Status: "confirmed", CreatedAt: time.Now().UTC().Truncate(time.Microsecond)}
	var added atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			ledger := first
			if index%2 == 1 {
				ledger = second
			}
			isNew, err := ledger.RecordIfNew(txn)
			if err != nil {
				t.Error(err)
			} else if isNew {
				added.Add(1)
			}
		}(i)
	}
	wg.Wait()
	if added.Load() != 1 {
		t.Fatalf("expected one durable insert, got %d", added.Load())
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := openPaymentTestLedger(t, dsn)
	got, err := reopened.History(txn.PlayerID)
	if err != nil || len(got) != 1 || !reflect.DeepEqual(got[0], txn) {
		t.Fatalf("stored transaction mismatch: %+v, %v", got, err)
	}
	txn.CreatedAt = txn.CreatedAt.Add(time.Minute)
	if isNew, err := reopened.RecordIfNew(txn); err != nil || isNew {
		t.Fatalf("timestamp-only webhook replay must deduplicate: %t %v", isNew, err)
	}
	txn.PlayerID = "different-player"
	if isNew, err := reopened.RecordIfNew(txn); err == nil || isNew {
		t.Fatal("same transaction ID for another player must fail")
	}
	if _, err := first.RecordIfNew(txn); err == nil {
		t.Fatal("closed database must return an error, not a successful duplicate")
	}
}

func TestMySQLLedgerImportsFullHistoryAndRefusesOverwrite(t *testing.T) {
	l := openPaymentTestLedger(t, paymentTestDSN(t))
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	// Preserve insertion order even when timestamps are out of chronological order.
	txns := []domain.Txn{
		{ID: "old-1", PlayerID: "player-1", Status: "confirmed", Currency: "USD", Spent: 3, Reason: "legacy", Amount: 600, PackID: "pack_small", CardSuffix: "4242", CreatedAt: base.Add(time.Hour)},
		{ID: "old-2", PlayerID: "player-1", Status: "declined", Reason: "declined", CreatedAt: base},
	}
	path := ledgerFixture(t, map[string][]domain.Txn{"player-1": txns})
	before, _ := os.ReadFile(path)
	if err := l.ImportJSON(path); err != nil {
		t.Fatal(err)
	}
	got, err := l.History("player-1")
	want := []domain.Txn{txns[1], txns[0]}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("import mismatch: %+v, %v", got, err)
	}
	if err := l.ImportJSON(path); err == nil {
		t.Fatal("repeat import must refuse to overwrite live data")
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("migration changed its source file")
	}
	if err := l.Record(domain.Txn{ID: "new-3", PlayerID: "player-1", Status: "confirmed", CreatedAt: base}); err != nil {
		t.Fatal(err)
	}
	got, err = l.History("player-1")
	if err != nil || len(got) != 3 || got[0].ID != "new-3" {
		t.Fatalf("writing after import: %+v, %v", got, err)
	}
}

func TestMySQLLedgerInvalidImportLeavesDatabaseEmpty(t *testing.T) {
	l := openPaymentTestLedger(t, paymentTestDSN(t))
	for _, players := range []map[string][]domain.Txn{
		{"player-1": {{ID: "txn-1", PlayerID: "wrong-player"}}},
		{"player-1": {{ID: "same", PlayerID: "player-1"}, {ID: "same", PlayerID: "player-1"}}},
	} {
		if err := l.ImportJSON(ledgerFixture(t, players)); err == nil {
			t.Fatal("invalid import unexpectedly succeeded")
		}
	}
	got, err := l.History("player-1")
	if err != nil || len(got) != 0 {
		t.Fatalf("invalid import left rows: %+v, %v", got, err)
	}
	empty := ledgerFixture(t, map[string][]domain.Txn{})
	if err := l.ImportJSON(empty); err != nil {
		t.Fatal(err)
	}
	if err := l.ImportJSON(empty); err == nil {
		t.Fatal("empty import must still record completion")
	}
}

func TestMySQLLedgerImportRefusesExistingWrites(t *testing.T) {
	l := openPaymentTestLedger(t, paymentTestDSN(t))
	if err := l.Record(domain.Txn{ID: "live-1", PlayerID: "player-1", Status: "confirmed"}); err != nil {
		t.Fatal(err)
	}
	if err := l.ImportJSON(ledgerFixture(t, map[string][]domain.Txn{})); err == nil {
		t.Fatal("import into a ledger with live writes must fail")
	}
	got, err := l.History("player-1")
	if err != nil || len(got) != 1 || got[0].ID != "live-1" {
		t.Fatalf("existing write changed: %+v, %v", got, err)
	}
}

func TestMySQLLedgerImportRollsBackOnDatabaseFailure(t *testing.T) {
	l := openPaymentTestLedger(t, paymentTestDSN(t))
	// Force a database-side failure after the first INSERT has succeeded. This
	// exercises rollback, rather than only the importer's preflight validation.
	_, err := l.db.Exec(`CREATE TRIGGER reject_import BEFORE INSERT ON payment_transactions
FOR EACH ROW BEGIN IF NEW.txn_id = 'reject-me' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'test failure'; END IF; END`)
	if err != nil {
		t.Fatal(err)
	}
	path := ledgerFixture(t, map[string][]domain.Txn{"player-1": {
		{ID: "insert-first", PlayerID: "player-1", Status: "confirmed"},
		{ID: "reject-me", PlayerID: "player-1", Status: "confirmed"},
	}})
	if err = l.ImportJSON(path); err == nil {
		t.Fatal("database-side import failure was hidden")
	}
	got, err := l.History("player-1")
	if err != nil || len(got) != 0 {
		t.Fatalf("failed import left partial records: %+v, %v", got, err)
	}
	if _, err = l.db.Exec("DROP TRIGGER reject_import"); err != nil {
		t.Fatal(err)
	}
	if err = l.ImportJSON(path); err != nil {
		t.Fatalf("rolled-back import must be safely retryable: %v", err)
	}
}

type unavailableLedger struct{ Ledger }

func (unavailableLedger) Ping(context.Context) error { return errors.New("database unavailable") }
func (unavailableLedger) Backend() string            { return "mysql" }

func TestPaymentReadinessChecksStorageButLivenessDoesNot(t *testing.T) {
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	handler := NewServiceHTTP(NewDecider(catalog), unavailableLedger{})
	for _, tc := range []struct {
		path string
		code int
	}{{"/readyz", http.StatusServiceUnavailable}, {"/healthz", http.StatusOK}} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", tc.path, nil))
		if w.Code != tc.code {
			t.Fatalf("%s returned %d, want %d", tc.path, w.Code, tc.code)
		}
	}
}
