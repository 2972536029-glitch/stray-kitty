package transport_test

import (
	"fmt"
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

func TestMarketPhysicalExitAcceptsTypedPositionOverHTTP(t *testing.T) {
	store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	game := service.New(store, catalog)
	_, token, err := game.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "explore"
		p.State.MapID = "market"
		p.State.ChapterID = "market"
		p.State.Flags = []string{"market_cleared"}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	handler := transport.New(game, payment.New(store, catalog), "")
	for i, position := range []string{"null", `"not-a-point"`, `{}`, `{"x":1365}`, `{"x":"1365","y":88}`, `{"x":1365,"y":null}`, `{"x":1365,"y":88}`} {
		body := fmt.Sprintf(`{"expectedRevision":0,"command":{"type":"EXIT_MARKET","layer":"L0","position":%s}}`, position)
		r := httptest.NewRequest("POST", "/api/v1/commands", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Idempotency-Key", fmt.Sprintf("market-exit-http-%d", i))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		expected := 400
		if i == 6 {
			expected = 200
		}
		if w.Code != expected {
			t.Fatalf("position %s: status %d: %s", position, w.Code, w.Body.String())
		}
	}
	s, err := game.State(token)
	if err != nil {
		t.Fatal(err)
	}
	if s.Phase != "dialogue" || s.MapID != "greenhouse" || s.ChapterID != "greenhouse" || s.StoryNodeID != "greenhouse_intro_1" || !domain.Contains(s.Flags, "market_exit_crossed") || !domain.Contains(s.Flags, "chapter_3_started") {
		t.Fatalf("physical exit did not start Chapter 3: %+v", s)
	}
}
