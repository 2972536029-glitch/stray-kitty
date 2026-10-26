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
	// Existing service scenarios begin in Rainy Alley. Complete the real L00
	// attempt here; focused transition tests below inspect each intermediate state.
	if s.Phase == "battle" && s.ActiveBattle != nil && s.ActiveBattle.StageID == "l00_tutorial" {
		s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"})
		s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	}
	return s
}

func TestPrologueStartsAndCompletesDistinctL00Tutorial(t *testing.T) {
	g, token, _ := setup(t)
	s, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	for s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	if s.Phase != "battle" || s.ActiveBattle == nil || s.ActiveBattle.StageID != "l00_tutorial" {
		t.Fatalf("prologue ended at phase=%s battle=%+v", s.Phase, s.ActiveBattle)
	}
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"})
	if !domain.Contains(s.Flags, "l00_completed") || domain.Contains(s.Flags, "alley_rescued") || domain.Contains(s.Cats, "diandian") || s.Currencies["stamp"] != 0 || s.Inventory["material"] != 0 {
		t.Fatalf("tutorial completion leaked rescue state: %+v", s)
	}
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Phase != "explore" || s.MapID != "alley" || s.ActiveBattle != nil {
		t.Fatalf("tutorial did not hand off to Rainy Alley: %+v", s)
	}
}

func TestL00LossRetriesWithNewServerAttempt(t *testing.T) {
	g, token, _ := setup(t)
	s, _ := g.State(token)
	for s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	firstID := s.ActiveBattle.ID
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: firstID, Outcome: "lost"})
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Phase != "battle" || s.ActiveBattle == nil || s.ActiveBattle.StageID != "l00_tutorial" || s.ActiveBattle.ID == firstID || domain.Contains(s.Flags, "l00_completed") {
		t.Fatalf("tutorial retry was not a fresh authoritative attempt: %+v", s)
	}
}
func TestFullJourneyAndDurableIdempotency(t *testing.T) {
	g, token, path := setup(t)
	s := toBattle(t, g, token)
	req := domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)}}
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
	s = execute(t, restarted, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	if s.Currencies["stamp"] != 2 {
		t.Fatal("repeat win granted first-clear reward")
	}
}
func TestFailureAndInvalidTargetsDoNotGrantRewards(t *testing.T) {
	g, token, _ := setup(t)
	s := toBattle(t, g, token)
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "lost", Report: bossReport(3, false)})
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

func TestChapter1TuanziEncounterAndReplay(t *testing.T) {
	g, token, _ := setup(t)
	s, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	// 推进至序章末尾
	for s.StoryNodeID != "prologue_lost" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	if s.ChapterID != "prologue" {
		t.Fatalf("expected prologue chapter before intro, got %s", s.ChapterID)
	}

	// 序章结束，进入第一章小巷导言
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "prologue_lost"})
	if s.StoryNodeID != "chapter1_intro" || s.ChapterID != "alley" {
		t.Fatalf("expected chapter1_intro in alley, got node=%s, chapter=%s", s.StoryNodeID, s.ChapterID)
	}

	// 第一章开端：团子登场与相遇
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "chapter1_intro"})
	if s.StoryNodeID != "prologue_tuanzi" || s.ChapterID != "alley" {
		t.Fatalf("expected prologue_tuanzi in alley, got node=%s, chapter=%s", s.StoryNodeID, s.ChapterID)
	}

	// 完成教学战并回放第一章
	s = finishStory(t, g, token)
	if s.Phase != "explore" {
		t.Fatalf("expected explore after finishStory, got %s", s.Phase)
	}
	// 重温第一章剧情
	s = execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "chapter1_intro"})
	if s.Phase != "dialogue" || s.StoryNodeID != "chapter1_intro" || s.ChapterID != "alley" {
		t.Fatalf("replay failed: phase=%s, node=%s", s.Phase, s.StoryNodeID)
	}
	for s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	// 教学战已通关，重温剧情结束平稳回到小巷探索阶段，无需重复打教学战
	if s.Phase != "explore" || s.MapID != "alley" {
		t.Fatalf("expected return to explore after replay, got phase=%s, map=%s", s.Phase, s.MapID)
	}
}

func TestFinaleKingdomFounded(t *testing.T) {
	g, token, _ := setup(t)
	s := toBattle(t, g, token)
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	s = finishStory(t, g, token)
	if s.Phase != "home" {
		t.Fatalf("expected home phase, got %s", s.Phase)
	}

	// 开启终章剧情
	s = execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "finale_intro_1"})
	if s.Phase != "dialogue" || s.StoryNodeID != "finale_intro_1" || s.ChapterID != "finale" {
		t.Fatalf("expected finale dialogue, got phase=%s, node=%s, chapter=%s", s.Phase, s.StoryNodeID, s.ChapterID)
	}
	if !domain.Contains(s.Flags, "finale_started") {
		t.Fatalf("expected finale_started flag")
	}

	// 步进终章全部剧情节点 1~9
	for s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}

	// 终章结束返回花房家园，落成流浪猫王国
	if s.Phase != "home" || s.ChapterID != "finale" || s.MapID != "greenhouse" {
		t.Fatalf("expected home in finale chapter, got phase=%s, chapter=%s, map=%s", s.Phase, s.ChapterID, s.MapID)
	}
	if !domain.Contains(s.Flags, "finale_completed") || !domain.Contains(s.Flags, "kingdom_founded") {
		t.Fatalf("expected finale_completed and kingdom_founded flags, got %v", s.Flags)
	}

	// 探索后再次回家，应保持终章 ChapterID
	s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "alley"})
	s = execute(t, g, token, domain.Command{Type: "GO_HOME"})
	if s.ChapterID != "finale" {
		t.Fatalf("expected finale chapter after returning home, got %s", s.ChapterID)
	}
}
