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

func TestStoryChoiceHTTPContract(t *testing.T) {
	for _, tc := range []struct {
		name, node, option string
		want               int
	}{
		{"proud", "prologue_banter", "proud", 200},
		{"honest", "prologue_sneak", "honest", 200},
		{"legacy without option", "prologue_banter", "", 200},
		{"arbitrary option", "prologue_banter", "untrusted-dynamic-option", 400},
		{"option on ordinary node", "prologue_1", "proud", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
			if err != nil {
				t.Fatal(err)
			}
			catalog, err := platform.LoadCatalog()
			if err != nil {
				t.Fatal(err)
			}
			game := service.New(store, catalog)
			playerID, token, err := game.CreateSession()
			if err != nil {
				t.Fatal(err)
			}
			if err := store.TransactByPlayer(playerID, func(player *repository.Player) error {
				player.State.Phase = "dialogue"
				player.State.StoryNodeID = tc.node
				return nil
			}); err != nil {
				t.Fatal(err)
			}
			command := map[string]string{"type": "ADVANCE_STORY", "nodeId": tc.node}
			if tc.option != "" {
				command["optionId"] = tc.option
			}
			raw, err := json.Marshal(map[string]any{"expectedRevision": 0, "command": command})
			if err != nil {
				t.Fatal(err)
			}
			r := httptest.NewRequest("POST", "/api/v1/commands", strings.NewReader(string(raw)))
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("Authorization", "Bearer "+token)
			r.Header.Set("Idempotency-Key", "story-choice-contract")
			w := httptest.NewRecorder()
			transport.New(game, payment.New(store, catalog), "").ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("got %d %s, want %d", w.Code, w.Body.String(), tc.want)
			}
			if tc.want != 200 {
				state, err := game.State(token)
				if err != nil || state.Revision != 0 || state.StoryNodeID != tc.node {
					t.Fatalf("rejected choice changed progress: %+v, %v", state, err)
				}
			}
		})
	}
}
