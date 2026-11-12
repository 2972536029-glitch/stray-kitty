package service_test

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
)

func mysqlCreditTestDSN(t *testing.T) string {
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
	name := "kitty_credit_test_" + hex.EncodeToString(entropy[:])
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err = admin.ExecContext(ctx, "CREATE DATABASE `"+name+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"); err != nil {
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

func TestMySQLPaymentReplayAfterHistoryTrimAndReconnect(t *testing.T) {
	dsn := mysqlCreditTestDSN(t)
	store, err := repository.OpenMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { store.Close() }()
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	game := service.New(store, catalog)
	playerID, token, err := game.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	initial, err := game.State(token)
	if err != nil {
		t.Fatal(err)
	}
	pack := domain.RechargePack{ID: "test-pack", TunaGranted: 7, PriceCents: 600}
	var first domain.Txn
	for i := 0; i < domain.MaxTxns+1; i++ {
		txn := domain.Txn{ID: fmt.Sprintf("mysql-credit-%d", i), PlayerID: playerID, PackID: pack.ID, Amount: pack.PriceCents, Status: "confirmed", CreatedAt: time.Now().UTC()}
		if i == 0 {
			first = txn
		}
		balance, err := game.ApplyCharge(playerID, txn, pack)
		if err != nil || balance != initial.Currencies["tuna"]+(i+1)*pack.TunaGranted {
			t.Fatalf("credit %d: balance=%d, error=%v", i, balance, err)
		}
	}
	before, err := game.State(token)
	if err != nil || len(before.Txns) != domain.MaxTxns {
		t.Fatalf("visible history must be bounded: count=%d, error=%v", len(before.Txns), err)
	}
	for _, txn := range before.Txns {
		if txn.ID == first.ID {
			t.Fatal("first payment must have left the visible history before replay")
		}
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := repository.OpenMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	store = reopened
	game = service.New(store, catalog)
	balance, err := game.ApplyCharge(playerID, first, pack)
	if err != nil || balance != before.Currencies["tuna"] {
		t.Fatalf("old webhook replay after reconnect credited again: balance=%d want=%d, error=%v", balance, before.Currencies["tuna"], err)
	}
	after, err := game.State(token)
	if err != nil || len(after.Txns) != len(before.Txns) || after.Txns[0].ID != before.Txns[0].ID {
		t.Fatalf("replay changed the visible transaction history: error=%v", err)
	}
}

func TestMySQLImportedPaymentSurvivesTrimBeforeFirstCallback(t *testing.T) {
	dsn := mysqlCreditTestDSN(t)
	store, err := repository.OpenMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { store.Close() }()
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	p := &repository.Player{ID: "legacy-player", State: domain.InitialState(catalog.Version), Receipts: map[string]repository.Receipt{}, AppliedPayments: map[string]bool{"older-known": true}}
	p.State.Currencies["tuna"] = 700
	legacy := domain.Txn{ID: "xs-legacy-confirmed", PlayerID: p.ID, PackID: "test-pack", Status: "confirmed", Amount: 600, CreatedAt: time.Now().UTC()}
	p.State.Txns = []domain.Txn{legacy, {ID: "legacy-declined", PlayerID: p.ID, Status: "declined"}}
	raw, err := json.Marshal(repository.Database{SchemaVersion: 1, Players: map[string]*repository.Player{"legacy-session": p}})
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "game.json")
	if err = os.WriteFile(file, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if err = store.ImportJSON(file); err != nil {
		t.Fatal(err)
	}
	unchanged, err := os.ReadFile(file)
	if err != nil || string(unchanged) != string(raw) {
		t.Fatal("import modified the legacy snapshot")
	}
	imported, err := store.GetByPlayerID(p.ID)
	if err != nil || !imported.AppliedPayments[legacy.ID] || !imported.AppliedPayments["older-known"] || imported.AppliedPayments["legacy-declined"] {
		t.Fatalf("confirmed legacy evidence was not seeded correctly: %v", err)
	}
	// Simulate ordinary gameplay transactions, with no ApplyCharge invocation
	// before the legacy payment disappears from the bounded display history.
	for i := 0; i < domain.MaxTxns+1; i++ {
		_, err = store.Transact("legacy-session", func(player *repository.Player) (domain.CommandResponse, error) {
			domain.AppendTxn(&player.State, domain.Txn{ID: fmt.Sprintf("gameplay-%d", i), Status: "confirmed", Spent: 1, Currency: "fish"})
			return domain.CommandResponse{}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	trimmed, err := store.GetByPlayerID(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, txn := range trimmed.State.Txns {
		if txn.ID == legacy.ID {
			t.Fatal("legacy payment must leave display history before first callback")
		}
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := repository.OpenMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	store = reopened
	game := service.New(store, catalog)
	balance, err := game.ApplyCharge(p.ID, legacy, domain.RechargePack{ID: legacy.PackID, TunaGranted: 60})
	if err != nil || balance != 700 {
		t.Fatalf("first callback after import and history trim credited twice: balance=%d, error=%v", balance, err)
	}
}
