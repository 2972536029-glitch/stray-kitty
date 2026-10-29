package transport_test

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
)

func TestHTTPQAReadsActualGateAndAcceptsOnlyWhitelistedCommands(t *testing.T) {
	store, _ := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	catalog, _ := platform.LoadCatalog()
	game := service.New(store, catalog)
	_, token, _ := game.CreateSession()
	handler := transport.New(game, payment.New(store, catalog), "")
	request := func(method, path, body, bearer, key string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", key)
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	if w := request("GET", "/api/v1/qa", "", "", ""); w.Code != 401 {
		t.Fatalf("unauthenticated QA: %d", w.Code)
	}
	w := request("GET", "/api/v1/qa", "", token, "")
	var tools service.QATools
	if err := json.Unmarshal(w.Body.Bytes(), &tools); err != nil || w.Code != 200 || tools.Enabled || len(tools.Checkpoints) != 0 {
		t.Fatal("wrong gate response")
	}
	valid := `{"expectedRevision":0,"command":{"type":"QA_CHECKPOINT","checkpointId":"market.story"}}`
	if w = request("POST", "/api/v1/commands", valid, token, "qa-gate-disabled"); w.Code != 403 {
		t.Fatalf("disabled checkpoint: %d %s", w.Code, w.Body.String())
	}
	game.QAVictoryEnabled = true
	for _, command := range []string{`{"type":"QA_CHECKPOINT"}`, `{"type":"QA_CHECKPOINT","checkpointId":""}`, `{"type":"QA_CHECKPOINT","checkpointId":"market.story","flags":["market_cleared"]}`, `{"type":"QA_RESTORE","inventory":{"material":999}}`, `{"type":"QA_SIMULATE_DEFEAT"}`} {
		if w = request("POST", "/api/v1/commands", `{"expectedRevision":0,"command":`+command+`}`, token, "qa-bad-parameters"); w.Code != 400 {
			t.Fatalf("invalid command accepted: %d %s", w.Code, w.Body.String())
		}
	}
	if w = request("POST", "/api/v1/commands", valid, token, "qa-allowed-load"); w.Code != 200 {
		t.Fatalf("checkpoint failed: %d %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "qaRestore") {
		t.Fatal("private restore snapshot leaked into HTTP state")
	}
}
