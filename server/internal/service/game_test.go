package service_test

import (
	"fmt"
	"path/filepath"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"sync"
	"testing"
)

func setup(t *testing.T) (*service.Game, string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "save.json")
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	g := service.New(store, catalog)
	g.Random = func(int) (int, error) { return 0, nil }
	_, token, err := g.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	return g, token, path
}
func execute(t *testing.T, g *service.Game, token string, c domain.Command) domain.GameState {
	t.Helper()
	s, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	req := domain.CommandRequest{ExpectedRevision: &s.Revision, Command: c}
	res, err := g.Execute(token, fmt.Sprintf("test-key-%d", s.Revision), req)
	if err != nil {
		t.Fatalf("%s: %v", c.Type, err)
	}
	return res.State
}
func toBattle(t *testing.T, g *service.Game, token string) domain.GameState {
	t.Helper()
	finishStory(t, g, token)
	execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
	execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"})
	finishStory(t, g, token)
	return execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
}
func finishStory(t *testing.T, g *service.Game, token string) domain.GameState {
	t.Helper()
	s, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; s.Phase == "dialogue"; i++ {
		if i >= 20 {
			t.Fatal("story did not reach an exit")
		}
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	return s
}
func TestFullJourneyAndDurableIdempotency(t *testing.T) {
	g, token, path := setup(t)
	s := toBattle(t, g, token)
	req := domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"}}
	first, err := g.Execute(token, "settle-once-123", req)
	if err != nil {
		t.Fatal(err)
	}
	if first.State.Currencies["stamp"] != 2 || !domain.Contains(first.State.Cats, "diandian") {
		t.Fatal("first clear missing rewards")
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	restarted := service.New(store, g.Catalog)
	second, err := restarted.Execute(token, "settle-once-123", req)
	if err != nil || !second.Replayed || second.State.Revision != first.State.Revision {
		t.Fatalf("durable replay failed: %v", err)
	}
	req.Command.Outcome = "lost"
	if _, err = restarted.Execute(token, "settle-once-123", req); err == nil {
		t.Fatal("same key different payload accepted")
	}
	s = execute(t, restarted, token, domain.Command{Type: "CONTINUE"})
	s = finishStory(t, restarted, token)
	if s.Phase != "home" {
		t.Fatal("home not reached")
	}
	s = execute(t, restarted, token, domain.Command{Type: "PLACE_FURNITURE", FurnitureID: "cardboard_nest", SlotID: "corner"})
	if s.Placements["corner"] != "cardboard_nest" {
		t.Fatal("placement failed")
	}
	s = execute(t, restarted, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
	s = execute(t, restarted, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"})
	if s.Currencies["stamp"] != 2 {
		t.Fatal("repeat win granted first-clear reward")
	}
}
func TestFailureAndInvalidTargetsDoNotGrantRewards(t *testing.T) {
	g, token, _ := setup(t)
	s := toBattle(t, g, token)
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "lost"})
	if s.Currencies["stamp"] != 0 || domain.Contains(s.Cats, "diandian") {
		t.Fatal("failure rewarded")
	}
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Phase != "preparation" {
		t.Fatal("cannot retry")
	}
}
func TestOptimisticConcurrency(t *testing.T) {
	g, token, _ := setup(t)
	revision := 0
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := 0
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := g.Execute(token, fmt.Sprintf("parallel-%d", i), domain.CommandRequest{ExpectedRevision: &revision, Command: domain.Command{Type: "ADVANCE_STORY", NodeID: "prologue_1"}})
			if err == nil {
				mu.Lock()
				success++
				mu.Unlock()
			}
		}(i)
	}
	wg.Wait()
	if success != 1 {
		t.Fatalf("expected one commit, got %d", success)
	}
}
func TestFailedCommandRollsBack(t *testing.T) {
	g, token, _ := setup(t)
	s, _ := g.State(token)
	_, err := g.Execute(token, "invalid-command", domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "DRAW_FURNITURE", PoolID: "rainy_box"}})
	if err == nil {
		t.Fatal("phase bypass accepted")
	}
	after, _ := g.State(token)
	if after.Revision != s.Revision || after.Currencies["stamp"] != 0 {
		t.Fatal("failed request changed state")
	}
}
