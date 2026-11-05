package transport_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
)

func TestQARequestsAndCheckpointLogsAreIsolated(t *testing.T) {
	var output bytes.Buffer
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(original) })
	store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	game := service.New(store, catalog)
	player, token, err := game.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	handler := transport.New(game, payment.New(store, catalog), "")
	sequence := 0
	call := func(method, path, body string, wantStatus int, wantQA bool) {
		t.Helper()
		output.Reset()
		sequence++
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Idempotency-Key", fmt.Sprintf("qa-observation-%d", sequence))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != wantStatus {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
		decoder := json.NewDecoder(bytes.NewReader(output.Bytes()))
		accessLogs := 0
		for {
			var entry map[string]any
			if err := decoder.Decode(&entry); err == io.EOF {
				break
			} else if err != nil {
				t.Fatalf("invalid request log %q: %v", output.String(), err)
			}
			// Both payment business logs and the ending HTTP access log must
			// retain the same server-derived player/session/QA attribution.
			if entry["qa"] != wantQA || entry["player_id"] != player || entry["session_id"] != service.LogSessionID(token) {
				t.Fatalf("wrong QA identity for %s: %v", path, entry)
			}
			if entry["msg"] == "http request" {
				accessLogs++
			}
		}
		if accessLogs != 1 {
			t.Fatalf("expected one ending HTTP log for %s, got %d", path, accessLogs)
		}
	}
	// Gate rejection and field rejection must still be identifiable as QA.
	call("POST", "/api/v1/commands", `{"expectedRevision":0,"command":{"type":"QA_CHECKPOINT","checkpointId":"prologue.battle"}}`, 403, true)
	call("POST", "/api/v1/commands", `{"expectedRevision":0,"command":{"type":"QA_CHECKPOINT","checkpointId":"prologue.battle","injected":true}}`, 400, true)
	call("GET", "/api/v1/state", "", 200, false)
	game.QAVictoryEnabled = true
	call("POST", "/api/v1/commands", `{"expectedRevision":0,"command":{"type":"QA_CHECKPOINT","checkpointId":"prologue.battle"}}`, 200, true)
	call("GET", "/api/v1/state", "", 200, true)
	state, err := game.State(token)
	if err != nil {
		t.Fatal(err)
	}
	advisorBody, err := json.Marshal(map[string]any{"attemptId": state.ActiveBattle.ID, "stageId": state.ActiveBattle.StageID, "question": "守护哪里？", "context": "{}"})
	if err != nil {
		t.Fatal(err)
	}
	call("POST", "/api/v1/advisor", string(advisorBody), 200, true)
	call("POST", "/api/payment/charge", fmt.Sprintf(`{"playerId":%q,"packId":"pack_small","cardNumber":"0000123412341234"}`, player), 200, true)
	call("GET", "/api/payment/history?playerId="+player, "", 200, true)
	call("POST", "/api/v1/commands", `{"expectedRevision":1,"command":{"type":"QA_RESTORE"}}`, 200, true)
	call("GET", "/api/v1/state", "", 200, false)
	// QA simulator marks the attempt independently of checkpoints. Its later
	// state/read/advisor/payment/continue requests must retain that origin.
	if err := store.TransactByPlayer(player, func(p *repository.Player) error {
		p.State.Phase = "battle"
		p.State.ActiveBattle = &domain.Attempt{ID: "qa-origin", StageID: "l00_tutorial", Status: "active", QA: true}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	call("GET", "/api/v1/state", "", 200, true)
	call("POST", "/api/v1/advisor", `{"attemptId":"qa-origin","stageId":"l00_tutorial","question":"守护哪里？","context":"{}"}`, 200, true)
	if err := store.TransactByPlayer(player, func(p *repository.Player) error {
		p.State.Phase = "settlement"
		p.State.ActiveBattle.Status = "won"
		p.State.LastResult = domain.Result{Outcome: "won", StageID: "l00_tutorial"}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	call("POST", "/api/payment/charge", fmt.Sprintf(`{"playerId":%q,"packId":"pack_small","cardNumber":"0000123412341234"}`, player), 200, true)
	call("POST", "/api/v1/commands", `{"expectedRevision":2,"command":{"type":"CONTINUE"}}`, 200, true)
	call("GET", "/api/v1/state", "", 200, false)
}
