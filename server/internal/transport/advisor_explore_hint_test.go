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

func TestExploreHintHTTPRequiresIdentityAndForbidsQuestionHistoryAndTables(t *testing.T) {
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
	_, err = store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase, p.State.MapID = "explore", "market"
		return domain.CommandResponse{State: p.State}, nil
	})
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
		{"approved sentence", func(map[string]any) {}, 200},
		{"no scene", func(b map[string]any) { delete(b, "sceneKey") }, 400},
		{"null revision", func(b map[string]any) { b["expectedRevision"] = nil }, 400},
		{"stale", func(b map[string]any) { b["expectedRevision"] = state.Revision + 1 }, 409},
		{"question even empty", func(b map[string]any) { b["question"] = "" }, 400},
		{"history even empty", func(b map[string]any) { b["history"] = []any{} }, 400},
		{"null history", func(b map[string]any) { b["history"] = nil }, 400},
		{"empty battle ID", func(b map[string]any) { b["attemptId"] = "" }, 400},
		{"hidden ID", func(b map[string]any) { b["context"] = `{"hint":"有条线索。","targetId":"hidden_trap"}` }, 400},
		{"catalog", func(b map[string]any) { b["context"] = `{"hint":"有条线索。","events":[]}` }, 400},
		{"extra field", func(b map[string]any) { b["approvedHint"] = "forged" }, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body := map[string]any{"scope": "explore_hint", "sceneKey": string(key), "expectedRevision": state.Revision, "context": `{"hint":"集市北侧似乎留有踪迹。"}`}
			tc.change(body)
			raw, _ := json.Marshal(body)
			r := httptest.NewRequest("POST", "/api/v1/advisor", strings.NewReader(string(raw)))
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("want %d got %d: %s", tc.status, w.Code, w.Body.String())
			}
			if tc.status == 200 && !strings.Contains(w.Body.String(), "not_configured") {
				t.Fatal("model fallback was not explicit")
			}
		})
	}
}
