package transport_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
	"strings"
	"testing"
)

func TestHTTPBoundaries(t *testing.T) {
	store, _ := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	catalog, _ := platform.LoadCatalog()
	handler := transport.New(service.New(store, catalog), payment.New(store, catalog), "")
	request := func(method, path, body, token string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", "http-test-123")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	if w := request("GET", "/api/v1/state", "", ""); w.Code != 401 {
		t.Fatalf("auth: %d", w.Code)
	}
	w := request("POST", "/api/v1/sessions", "", "")
	if w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	var session map[string]string
	json.Unmarshal(w.Body.Bytes(), &session)
	token := session["token"]
	for _, body := range []string{`{"expectedRevision":0,"command":{"type":"REPAIR_HOME","cost":0}}`, `{"expectedRevision":0,"command":{"type":"REPAIR_HOME","grantsFlag":"kingdom_founded"}}`} {
		if w = request("POST", "/api/v1/commands", body, token); w.Code != 400 {
			t.Fatalf("repair accepts client-owned costs or rewards: %d %s", w.Code, w.Body.String())
		}
	}
	if w = request("POST", "/api/v1/commands", `{"expectedRevision":0,"command":{"type":"REPAIR_HOME"}}`, token); w.Code != 409 || !strings.Contains(w.Body.String(), "INVALID_PHASE") {
		t.Fatalf("repair must reach the service phase check: %d %s", w.Code, w.Body.String())
	}
	for _, body := range []string{`{"command":{"type":"GO_HOME"}}`, `{"expectedRevision":0,"command":{"type":"ADVANCE_STORY","nodeId":"prologue_1","outcome":"won"}}`, `{"expectedRevision":0,"command":{"type":"ADVANCE_STORY","nodeId":"prologue_1"}} {}`, `{"expectedRevision":0,"command":{"type":"BUY_FURNITURE","productId":"blue_bowl","price":0}}`, `{"expectedRevision":0,"command":{"type":"BUY_FURNITURE"}}`} {
		if w = request("POST", "/api/v1/commands", body, token); w.Code != 400 {
			t.Fatalf("invalid body accepted: %s %d", body, w.Code)
		}
	}
	if w = request("POST", "/api/v1/commands", `{"expectedRevision":0,"command":{"type":"ADVANCE_STORY","nodeId":"prologue_1"}}`, token); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = request("POST", "/api/v1/commands", strings.Repeat("x", 9000), token); w.Code != 413 {
		t.Fatalf("body limit: %d", w.Code)
	}
	if w.Header().Get("X-Request-Id") == "" {
		t.Fatal("missing request id")
	}
	if w = request("GET", "/healthz", "", ""); w.Code != http.StatusOK {
		t.Fatal("health failed")
	}
}
