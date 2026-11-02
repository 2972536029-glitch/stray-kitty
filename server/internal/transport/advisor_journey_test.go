package transport_test

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
	"strings"
	"testing"
)

func TestJourneyAdvisorHTTPAcceptsNonBattleSceneAndRejectsIncompleteIdentity(t *testing.T) {
	store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	g := service.New(store, catalog)
	_, token, err := g.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	state, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	key, _ := json.Marshal([]string{state.Phase, state.ChapterID, state.MapID, state.StoryNodeID, state.PendingEventID, ""})
	handler := transport.New(g, payment.New(store, catalog), "")
	for _, tc := range []struct {
		name   string
		change func(map[string]any)
		status int
	}{
		{"journey outside battle", func(map[string]any) {}, 200},
		{"missing scene", func(body map[string]any) { delete(body, "sceneKey") }, 400},
		{"null scene", func(body map[string]any) { body["sceneKey"] = nil }, 400},
		{"missing revision", func(body map[string]any) { delete(body, "expectedRevision") }, 400},
		{"null revision", func(body map[string]any) { body["expectedRevision"] = nil }, 400},
		{"wrong scene", func(body map[string]any) { body["sceneKey"] = "old scene" }, 409},
		{"wrong revision", func(body map[string]any) { body["expectedRevision"] = state.Revision + 1 }, 409},
		{"mixed scope", func(body map[string]any) { body["attemptId"] = "old battle" }, 400},
		{"unknown extra", func(body map[string]any) { body["serverProgress"] = map[string]any{} }, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body := map[string]any{"scope": "journey", "sceneKey": string(key), "expectedRevision": state.Revision, "question": "这里发生了什么？", "context": "{}", "history": []domain.AdvisorMessage{}}
			tc.change(body)
			raw, _ := json.Marshal(body)
			r := httptest.NewRequest("POST", "/api/v1/advisor", strings.NewReader(string(raw)))
			r.Header.Set("Authorization", "Bearer "+token)
			r.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("want %d got %d: %s", tc.status, w.Code, w.Body.String())
			}
			if w.Code == 200 {
				var response domain.AdvisorResponse
				if json.Unmarshal(w.Body.Bytes(), &response) != nil || response.Source != "local" || response.Reason != "not_configured" {
					t.Fatalf("journey fallback was not explicit: %s", w.Body.String())
				}
			}
			if w.Code == 409 && !strings.Contains(w.Body.String(), "ADVISOR_CONTEXT_CHANGED") {
				t.Fatal("stale journey identity used the wrong error contract")
			}
		})
	}
}
