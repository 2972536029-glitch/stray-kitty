package repository

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	"stray-kitty/server/internal/domain"
)

// TEST_MYSQL_DSN must be an administrative test connection with CREATE DATABASE.
// Each test owns a random database; tests never truncate the supplied database.
func mysqlTestDSN(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set TEST_MYSQL_DSN to run real MySQL integration tests")
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.DBName = ""
	connector, err := mysql.NewConnector(cfg)
	if err != nil {
		t.Fatal(err)
	}
	admin := sql.OpenDB(connector)
	var entropy [8]byte
	if _, err = rand.Read(entropy[:]); err != nil {
		t.Fatal(err)
	}
	name := "kitty_game_test_" + hex.EncodeToString(entropy[:])
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
	cfg.DBName = name
	return cfg.FormatDSN()
}
func openMySQLTest(t *testing.T, dsn string) *Store {
	t.Helper()
	store, err := OpenMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}
func mysqlPlayer() *Player {
	return &Player{ID: "player", State: domain.InitialState("integration"), Receipts: map[string]Receipt{}, ReceiptOrder: []string{}}
}

func TestMySQLPreservesStateAccountsSessionsAndReceiptsAcrossReopen(t *testing.T) {
	dsn := mysqlTestDSN(t)
	store := openMySQLTest(t, dsn)
	p := mysqlPlayer()
	backup := domain.InitialState("restore")
	p.QARestore = &backup
	p.SessionAliases = []string{"alias-old", "alias-new"}
	p.Receipts["request"] = Receipt{Fingerprint: "fingerprint", Response: domain.CommandResponse{State: p.State}}
	p.ReceiptOrder = []string{"request"}
	if err := store.Create("primary", p); err != nil {
		t.Fatal(err)
	}
	account := &Account{Username: "小猫主人", PlayerID: p.ID, PasswordHash: "hash", PasswordSalt: "salt", CreatedAt: time.Now().UTC()}
	if err := store.SaveAccount(account); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveAccount(account); domain.FaultCode(err) != "USERNAME_TAKEN" {
		t.Fatalf("duplicate username: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := openMySQLTest(t, dsn)
	for _, token := range []string{"primary", "alias-old", "alias-new"} {
		got, err := reopened.Get(token)
		if err != nil || !reflect.DeepEqual(p, got) {
			t.Fatalf("round trip differs for %s: %v", token, err)
		}
		id, qa, err := reopened.ObservationIdentity(token)
		if err != nil || id != p.ID || !qa {
			t.Fatalf("identity: %s %v %v", id, qa, err)
		}
	}
	got, err := reopened.FindAccountWithError(account.Username)
	if err != nil || got == nil || got.PasswordHash != account.PasswordHash || got.PlayerID != p.ID {
		t.Fatalf("account: %+v %v", got, err)
	}
	if err := reopened.TrimAliases(p.ID, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := reopened.Get("alias-old"); domain.FaultCode(err) != "UNAUTHORIZED" {
		t.Fatalf("trimmed alias still usable: %v", err)
	}
	if _, err := reopened.Get("primary"); err != nil {
		t.Fatal(err)
	}
}

func TestMySQLCrossConnectionTransactionsRollbackAndReplay(t *testing.T) {
	dsn := mysqlTestDSN(t)
	a := openMySQLTest(t, dsn)
	b := openMySQLTest(t, dsn)
	if err := a.Create("primary", mysqlPlayer()); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 40)
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			store := a
			if i%2 != 0 {
				store = b
			}
			_, err := store.Transact("primary", func(p *Player) (domain.CommandResponse, error) {
				p.State.Revision++
				p.State.Currencies["tuna"]++
				return domain.CommandResponse{State: p.State}, nil
			})
			errs <- err
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	p, err := a.Get("primary")
	if err != nil || p.State.Revision != 40 || p.State.Currencies["tuna"] != 40 {
		t.Fatalf("lost update: %+v %v", p, err)
	}
	_, err = a.Transact("primary", func(p *Player) (domain.CommandResponse, error) {
		p.State.Currencies["tuna"] += 100
		return domain.CommandResponse{}, errors.New("reject")
	})
	if err == nil {
		t.Fatal("callback rejection accepted")
	}
	_, err = b.Transact("primary", func(p *Player) (domain.CommandResponse, error) {
		p.State.Currencies["tuna"] += 100
		return domain.CommandResponse{Replayed: true}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	err = a.TransactByPlayer("player", func(p *Player) error { p.State.Currencies["tuna"] += 100; return errors.New("reject payment") })
	if err == nil {
		t.Fatal("payment rejection accepted")
	}
	p, err = a.Get("primary")
	if err != nil || p.State.Currencies["tuna"] != 40 {
		t.Fatalf("rollback/replay mutated state: %v", err)
	}
}

func TestMySQLSessionUniquenessRollsBackAggregate(t *testing.T) {
	store := openMySQLTest(t, mysqlTestDSN(t))
	if err := store.Create("primary", mysqlPlayer()); err != nil {
		t.Fatal(err)
	}
	other := mysqlPlayer()
	other.ID = "other"
	if err := store.Create("other-primary", other); err != nil {
		t.Fatal(err)
	}
	if err := store.AttachAlias("other", "primary"); domain.FaultCode(err) != "SESSION_CONFLICT" {
		t.Fatalf("alias collision: %v", err)
	}
	got, err := store.GetByPlayerID("other")
	if err != nil || len(got.SessionAliases) != 0 {
		t.Fatalf("failed alias write persisted: %+v %v", got, err)
	}
	if err := store.AttachAlias("player", "alias"); err != nil {
		t.Fatal(err)
	}
	third := mysqlPlayer()
	third.ID = "third"
	if err := store.Create("alias", third); domain.FaultCode(err) != "SESSION_CONFLICT" {
		t.Fatalf("primary collision: %v", err)
	}
	if _, err := store.GetByPlayerID("third"); domain.FaultCode(err) != "PLAYER_NOT_FOUND" {
		t.Fatalf("orphan persisted: %v", err)
	}
}

func TestMySQLImportIsValidatedAtomicAndNeverOverwrites(t *testing.T) {
	store := openMySQLTest(t, mysqlTestDSN(t))
	source := Database{SchemaVersion: 1, Players: map[string]*Player{"primary": mysqlPlayer()}, Accounts: map[string]*Account{"cat": {Username: "cat", PlayerID: "missing", PasswordHash: "hash", PasswordSalt: "salt", CreatedAt: time.Now().UTC()}}}
	path := filepath.Join(t.TempDir(), "game.json")
	if err := os.WriteFile(path, []byte(`{"schemaVersion":1,"players":{},"unrecognizedProgress":{"level":9}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := store.ImportJSON(path); err == nil {
		t.Fatal("unknown data would be silently lost by import")
	}
	write := func() {
		t.Helper()
		raw, err := json.Marshal(source)
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(path, raw, 0600); err != nil {
			t.Fatal(err)
		}
	}
	write()
	if err := store.ImportJSON(path); err == nil {
		t.Fatal("dangling account accepted")
	}
	if _, err := store.Get("primary"); domain.FaultCode(err) != "UNAUTHORIZED" {
		t.Fatalf("partial import: %v", err)
	}
	source.Accounts["cat"].PlayerID = "player"
	source.Players["primary"].SessionAliases = []string{"alias"}
	write()
	before, _ := os.ReadFile(path)
	if err := store.ImportJSON(path); err != nil {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(path)
	if string(after) != string(before) {
		t.Fatal("source changed")
	}
	if _, err := store.Get("alias"); err != nil {
		t.Fatal(err)
	}
	if err := store.ImportJSON(path); err == nil {
		t.Fatal("nonempty target overwritten")
	}
}

func TestMySQLEmptyImportMarkerAndWriteGate(t *testing.T) {
	store := openMySQLTest(t, mysqlTestDSN(t))
	path := filepath.Join(t.TempDir(), "game.json")
	if err := os.WriteFile(path, []byte(`{"schemaVersion":1,"players":{}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := store.ImportJSON(path); err != nil {
		t.Fatal(err)
	}
	if err := store.ImportJSON(path); err == nil {
		t.Fatal("empty import unexpectedly repeatable")
	}
	tx, err := store.sqlDB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	var imported bool
	if err = tx.QueryRow("SELECT imported FROM game_store_meta WHERE id=1 FOR UPDATE").Scan(&imported); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() { result <- store.Create("primary", mysqlPlayer()) }()
	select {
	case err := <-result:
		t.Fatalf("write passed exclusive import gate: %v", err)
	case <-time.After(150 * time.Millisecond):
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("write remained blocked after gate released")
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	if err = store.Ping(context.Background()); err == nil {
		t.Fatal("closed database reported ready")
	}
	if _, err = store.FindAccountWithError("cat"); err == nil {
		t.Fatal("database outage treated as missing account")
	}
}
