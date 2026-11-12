package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
)

func testServer(t *testing.T, gameFile, payFile, backend string) (string, string) {
	t.Helper()
	store, err := repository.Open(gameFile)
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	ledger, err := payment.OpenLedger(payFile)
	if err != nil {
		t.Fatal(err)
	}
	// The HTTP scenario is exercised against the real handlers and file-backed
	// reopen. MySQL persistence itself is covered by repository integration tests.
	ready := func(handler http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/readyz" {
				json.NewEncoder(w).Encode(map[string]string{"status": "ready", "storage": backend})
				return
			}
			handler.ServeHTTP(w, r)
		})
	}
	payServer := httptest.NewServer(ready(payment.NewServiceHTTP(payment.NewDecider(catalog), ledger)))
	t.Cleanup(payServer.Close)
	game := service.New(store, catalog)
	game.QAVictoryEnabled = true
	gameServer := httptest.NewServer(ready(transport.New(game, transport.NewRemotePayment(payServer.URL, game), "")))
	t.Cleanup(gameServer.Close)
	return gameServer.URL, payServer.URL
}
func TestSmokeAccountCommandsPaymentAndReopen(t *testing.T) {
	t.Setenv("INTERNAL_TOKEN", "test-internal-token")
	dir := t.TempDir()
	gamePath, payPath := filepath.Join(dir, "game.json"), filepath.Join(dir, "payments.json")
	base, pay := testServer(t, gamePath, payPath, "single-process-file")
	cfg := config{Phase: "prepare", BaseURL: base, PaymentURL: pay, ExpectedStorage: "single-process-file", InternalToken: "test-internal-token"}
	var prepared bytes.Buffer
	if err := run(cfg, &prepared); err != nil {
		t.Fatal(err)
	}
	statePath := filepath.Join(dir, "private-state.json")
	if err := os.WriteFile(statePath, prepared.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	var before saved
	if err := json.Unmarshal(prepared.Bytes(), &before); err != nil {
		t.Fatal(err)
	}
	if before.State.QACheckpointID != "prologue.story" || before.State.Revision != 2 || before.LoginToken == "" {
		t.Fatal("prepare did not create QA account and persisted receipt")
	}
	base, pay = testServer(t, gamePath, payPath, "mysql")
	cfg = config{Phase: "verify", BaseURL: base, PaymentURL: pay, ExpectedStorage: "mysql", InternalToken: "test-internal-token", StateFile: statePath}
	var verified bytes.Buffer
	if err := run(cfg, &verified); err != nil {
		t.Fatal(err)
	}
	var after saved
	if err := json.Unmarshal(verified.Bytes(), &after); err != nil {
		t.Fatal(err)
	}
	if after.PlayerID != before.PlayerID || after.State.Revision != 3 || after.Txn == nil || after.State.Currencies["tuna"] != before.State.Currencies["tuna"]+after.Pack.TunaGranted {
		t.Fatal("verify changed identity or incorrect credit")
	}
	if err := os.WriteFile(statePath, verified.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	base, pay = testServer(t, gamePath, payPath, "mysql")
	cfg.BaseURL, cfg.PaymentURL, cfg.Phase = base, pay, "recheck"
	var summary bytes.Buffer
	if err := run(cfg, &summary); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(summary.String(), `"status":"passed"`) || strings.Contains(summary.String(), after.Password) || strings.Contains(summary.String(), after.Token) || strings.Contains(summary.String(), after.Username) {
		t.Fatal("recheck output is missing result or includes private identity")
	}
	// A stale expected state must fail rather than reporting migration success.
	after.State.Currencies["tuna"]++
	raw, _ := json.Marshal(after)
	os.WriteFile(statePath, raw, 0600)
	if err := run(cfg, io.Discard); err == nil {
		t.Fatal("state mismatch was accepted")
	}
}
func TestAuditBlocksAmbiguousXsollaWithoutPrintingIdentities(t *testing.T) {
	dir := t.TempDir()
	gp, pp := filepath.Join(dir, "game.json"), filepath.Join(dir, "payments.json")
	player := &repository.Player{ID: "sensitive-player", State: domain.InitialState("test"), Receipts: map[string]repository.Receipt{}}
	game := repository.Database{SchemaVersion: 1, Players: map[string]*repository.Player{"sensitive-token": player}}
	ledger := map[string]any{"players": map[string][]domain.Txn{player.ID: {{ID: "xs-legacy", PlayerID: player.ID, Status: "confirmed"}}}}
	write := func() {
		raw, _ := json.Marshal(game)
		os.WriteFile(gp, raw, 0600)
		raw, _ = json.Marshal(ledger)
		os.WriteFile(pp, raw, 0600)
	}
	write()
	var output bytes.Buffer
	cfg := config{Phase: "audit", GameFile: gp, PaymentsFile: pp}
	if err := run(cfg, &output); err == nil {
		t.Fatal("ambiguous callback accepted")
	}
	if strings.Contains(output.String(), "sensitive") || strings.Contains(output.String(), "xs-legacy") || !strings.Contains(output.String(), `"ambiguousXsolla":1`) {
		t.Fatal("audit did not sanitize or classify source")
	}
	player.AppliedPayments = map[string]bool{"xs-legacy": true}
	write()
	output.Reset()
	if err := run(cfg, &output); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), `"status":"passed"`) {
		t.Fatal("known applied record did not pass")
	}
}
func TestReadSavedSupportsStdin(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stdin.json")
	raw, _ := json.Marshal(saved{Version: 1, Username: "dbqa_test", PlayerID: "player", Token: "token"})
	os.WriteFile(path, raw, 0600)
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	old := os.Stdin
	os.Stdin = file
	defer func() { os.Stdin = old }()
	if _, err := readSaved("-"); err != nil {
		t.Fatal(err)
	}
}

func TestEqualStateAllowsOnlyCurrentBeijingDailyRollover(t *testing.T) {
	now := time.Date(2026, 11, 12, 16, 1, 0, 0, time.UTC) // Beijing Nov 13, 00:01.
	original := domain.InitialState("test")
	original.Lottery = &domain.LotteryState{Day: "2026-11-12", DailyClaims: []string{"daily-letter"}, Progress: map[string]domain.PoolProgress{"pool": {Draws: 3, Misses: 1}}, History: []domain.ParcelDraw{{ID: "draw"}}, Milestones: []string{"milestone"}}
	cloneState := func(source domain.GameState) domain.GameState {
		raw, _ := json.Marshal(source)
		var copy domain.GameState
		if err := json.Unmarshal(raw, &copy); err != nil {
			t.Fatal(err)
		}
		return copy
	}
	current := cloneState(original)
	current.Lottery.Day = "2026-11-13"
	current.Lottery.DailyClaims = []string{}
	if err := equalStateAt(current, original, now); err != nil {
		t.Fatal(err)
	}
	if original.Lottery.Day != "2026-11-12" || len(original.Lottery.DailyClaims) != 1 {
		t.Fatal("comparison mutated private expected state")
	}
	for _, tc := range []struct {
		name string
		edit func(*domain.GameState)
	}{
		{"balance", func(s *domain.GameState) { s.Currencies["tuna"]++ }},
		{"revision", func(s *domain.GameState) { s.Revision++ }},
		{"lottery progress", func(s *domain.GameState) { s.Lottery.Progress["pool"] = domain.PoolProgress{Draws: 4} }},
		{"lottery history", func(s *domain.GameState) { s.Lottery.History = nil }},
		{"milestones", func(s *domain.GameState) { s.Lottery.Milestones = nil }},
		{"claims on new day", func(s *domain.GameState) { s.Lottery.DailyClaims = []string{"unexpected"} }},
		{"future day", func(s *domain.GameState) { s.Lottery.Day = "2026-11-14" }},
		{"wrong old day", func(s *domain.GameState) { s.Lottery.Day = "2026-11-11" }},
		{"missing lottery", func(s *domain.GameState) { s.Lottery = nil }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := cloneState(current)
			tc.edit(&changed)
			if err := equalStateAt(changed, original, now); err == nil {
				t.Fatal("unexpected state difference accepted")
			}
		})
	}
	sameDay := cloneState(original)
	sameDay.Lottery.DailyClaims = []string{}
	if err := equalStateAt(sameDay, original, now.Add(-2*time.Minute)); err == nil {
		t.Fatal("same-day claim loss accepted")
	}
	futureExpected := cloneState(original)
	futureExpected.Lottery.Day = "2026-11-14"
	if err := equalStateAt(current, futureExpected, now); err == nil {
		t.Fatal("backward rollover accepted")
	}
}
