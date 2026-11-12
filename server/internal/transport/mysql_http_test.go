package transport_test

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
)

func TestMySQLHTTPRestartAndReadiness(t *testing.T) {
	dsn := os.Getenv("TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("TEST_MYSQL_DSN is not configured")
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.DBName = ""
	admin, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	name := fmt.Sprintf("kitty_http_%d", time.Now().UnixNano())
	if _, err = admin.Exec("CREATE DATABASE " + name + " CHARACTER SET utf8mb4"); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec("DROP DATABASE " + name)
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
	handler := transport.New(service.New(store, catalog), payment.New(store, catalog), "")
	request := func(method, path, body, token string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", "mysql-http-replay-1")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	w := request("POST", "/api/v1/sessions", "", "")
	if w.Code != 201 {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	var session struct{ PlayerID, Token string }
	if err = json.Unmarshal(w.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	w = request("POST", "/api/auth/register", `{"username":"DatabaseCat","password":"fish-and-chips-1"}`, session.Token)
	if w.Code != 201 {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	command := `{"expectedRevision":0,"command":{"type":"ADVANCE_STORY","nodeId":"prologue_1"}}`
	w = request("POST", "/api/v1/commands", command, session.Token)
	if w.Code != 200 {
		t.Fatalf("command: %d %s", w.Code, w.Body.String())
	}
	var first domain.CommandResponse
	if err = json.Unmarshal(w.Body.Bytes(), &first); err != nil {
		t.Fatal(err)
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	if w = request("GET", "/readyz", "", ""); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("closed DB readiness: %d %s", w.Code, w.Body.String())
	}
	if w = request("GET", "/healthz", "", ""); w.Code != http.StatusOK {
		t.Fatalf("liveness: %d", w.Code)
	}
	store, err = repository.OpenMySQL(cfg.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	handler = transport.New(service.New(store, catalog), payment.New(store, catalog), "")
	if w = request("GET", "/readyz", "", ""); w.Code != 200 || !strings.Contains(w.Body.String(), "mysql") {
		t.Fatalf("reopened readiness: %d %s", w.Code, w.Body.String())
	}
	w = request("POST", "/api/auth/login", `{"username":"databasecat","password":"fish-and-chips-1"}`, "")
	if w.Code != 200 {
		t.Fatalf("login after restart: %d %s", w.Code, w.Body.String())
	}
	var login struct{ PlayerID, Token string }
	if err = json.Unmarshal(w.Body.Bytes(), &login); err != nil || login.PlayerID != session.PlayerID {
		t.Fatalf("login identity: %v %s", err, w.Body.String())
	}
	w = request("POST", "/api/v1/commands", command, login.Token)
	var replay domain.CommandResponse
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &replay) != nil || !replay.Replayed || replay.State.Revision != first.State.Revision {
		t.Fatalf("persistent replay: %d %s", w.Code, w.Body.String())
	}
	if w = request("GET", "/api/v1/state", "", session.Token); w.Code != 200 {
		t.Fatalf("original session: %d %s", w.Code, w.Body.String())
	}
}
