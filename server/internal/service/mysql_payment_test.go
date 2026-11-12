package service_test

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
)

func TestMySQLPaymentReplayAfterHistoryTrimAndReconnect(t *testing.T) {
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
	defer admin.Close()
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
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := admin.ExecContext(ctx, "DROP DATABASE `"+name+"`"); err != nil {
			t.Error(err)
		}
	}()
	cfg.DBName = name
	store, err := repository.OpenMySQL(cfg.FormatDSN())
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
	reopened, err := repository.OpenMySQL(cfg.FormatDSN())
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
