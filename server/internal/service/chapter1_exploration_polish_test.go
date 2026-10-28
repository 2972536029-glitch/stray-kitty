package service_test

import (
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func TestCrateEventLeadsToRescuePreparation(t *testing.T) {
	g, token, _ := setup(t)
	s := finishStory(t, g, token)
	if s.Phase != "explore" || s.MapID != "alley" {
		t.Fatalf("expected Rainy Alley exploration after L00, got %+v", s)
	}
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
	if s.Phase != "event" || s.PendingEventID != "crate_event" {
		t.Fatalf("crate did not start its event: %+v", s)
	}
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"})
	s = finishStory(t, g, token)
	if s.Phase != "preparation" || s.MapID != "alley" || domain.Contains(s.Flags, "alley_rescued") {
		t.Fatalf("crate event did not lead to rescue preparation: %+v", s)
	}
}

func TestPosterRequiresPhysicalInteractionAfterRescue(t *testing.T) {
	g, token, _ := setup(t)
	s := toBattle(t, g, token)
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.StoryNodeID != "rescue_1" {
		t.Fatalf("expected rescue dialogue, got %s", s.StoryNodeID)
	}
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "rescue_1"})
	if s.Phase != "explore" || domain.Contains(s.Flags, "lost_poster_found") {
		t.Fatalf("expected physical poster discovery, got %+v", s)
	}
	rev := s.Revision
	if _, err := g.Execute(token, "poster-gate-guard", domain.CommandRequest{ExpectedRevision: &rev, Command: domain.Command{Type: "GO_HOME"}}); err == nil {
		t.Fatal("home must not bypass the first required poster discovery")
	}
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_poster"})
	if s.Phase != "dialogue" || s.StoryNodeID != "poster_1" {
		t.Fatalf("poster did not start its authored story: %+v", s)
	}
	if domain.Contains(s.Flags, "lost_poster_found") {
		t.Fatal("poster flag must wait for story advance")
	}
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "poster_1"})
	if !domain.Contains(s.Flags, "lost_poster_found") {
		t.Fatal("poster flag missing after story progression")
	}
}

func TestOldHuangUsesExistingEventAndReturnsToExploration(t *testing.T) {
	g, token, _ := setup(t)
	s := toBattle(t, g, token)
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "rescue_1"})
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_dog_friend_point"})
	if s.Phase != "event" || s.PendingEventID != "alley_dog_friend" {
		t.Fatalf("old Huang node not routed: %+v", s)
	}
	g.Random = func(max int) (int, error) { return max - 1, nil } // both dice max: success/crit
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "alley_dog_friend", OptionID: "push_debris"})
	if s.Phase != "explore" {
		t.Fatalf("ordinary outcome should return to explore, got %s", s.Phase)
	}
	rev := s.Revision
	if _, err := g.Execute(token, "dog-duplicate", domain.CommandRequest{ExpectedRevision: &rev, Command: domain.Command{Type: "INTERACT", InteractionID: "alley_dog_friend_point"}}); err == nil {
		t.Fatal("resolved Old Huang node must be one-shot")
	}
}

func TestRescueAndPosterFlagsPersistAndRepeatInteractionsStayOneShot(t *testing.T) {
	g, token, path := setup(t)
	s := toBattle(t, g, token)
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "rescue_1"})
	if s.Phase != "explore" || !domain.Contains(s.Flags, "alley_rescued") || domain.Contains(s.Flags, "lost_poster_found") {
		t.Fatalf("rescue state before poster is wrong: %+v", s)
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	restarted := service.New(store, catalog)
	s, err = restarted.State(token)
	if err != nil || s.Phase != "explore" || !domain.Contains(s.Flags, "alley_rescued") || domain.Contains(s.Flags, "lost_poster_found") {
		t.Fatalf("rescue state did not survive reload: state=%+v err=%v", s, err)
	}
	s = execute(t, restarted, token, domain.Command{Type: "INTERACT", InteractionID: "alley_poster"})
	if s.Phase != "dialogue" || s.StoryNodeID != "poster_1" {
		t.Fatalf("poster did not start after reload: %+v", s)
	}
	s = execute(t, restarted, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "poster_1"})
	if !domain.Contains(s.Flags, "lost_poster_found") {
		t.Fatal("poster completion flag missing")
	}
	store, err = repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	restarted = service.New(store, catalog)
	s, err = restarted.State(token)
	if err != nil || !domain.Contains(s.Flags, "alley_rescued") || !domain.Contains(s.Flags, "lost_poster_found") {
		t.Fatalf("rescue/poster flags did not survive reload: state=%+v err=%v", s, err)
	}
	for s.Phase == "dialogue" {
		s = execute(t, restarted, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	if s.Phase != "home" {
		t.Fatalf("poster story should complete to home, got %s", s.Phase)
	}
	s = execute(t, restarted, token, domain.Command{Type: "GO_EXPLORE", MapID: "alley"})
	beforeFlags := append([]string(nil), s.Flags...)
	beforeStamp, beforeMaterial := s.Currencies["stamp"], s.Inventory["material"]
	s = execute(t, restarted, token, domain.Command{Type: "INTERACT", InteractionID: "alley_poster"})
	if s.Phase != "explore" || !domain.Contains(s.Flags, "lost_poster_found") || len(s.Flags) != len(beforeFlags) || s.Currencies["stamp"] != beforeStamp || s.Inventory["material"] != beforeMaterial {
		t.Fatalf("repeat poster interaction changed progression/rewards: %+v", s)
	}
}

func TestRandomForcedChaseCannotSkipMandatoryCrateDiscovery(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	var movingSack *domain.Event
	for i := range g.Catalog.Events {
		if g.Catalog.Events[i].ID == "moving_sack_event" {
			movingSack = &g.Catalog.Events[i]
			break
		}
	}
	if movingSack == nil {
		t.Fatal("moving sack random card missing")
	}
	g.Catalog.Events = []domain.Event{*movingSack}
	g.RainyZoneChance = 1000
	rolls := []int{0, 0, 0, 0, 1}
	roll := 0
	g.Random = func(max int) (int, error) {
		value := rolls[roll]
		roll++
		if value >= max {
			t.Fatalf("invalid fixture roll %d for max %d", value, max)
		}
		return value, nil
	}
	s := execute(t, g, token, domain.Command{Type: "CHECK_RANDOM_ZONE", ZoneID: "rainy_random_west"})
	if s.Phase != "event" || s.PendingEventID != "moving_sack_event" {
		t.Fatalf("expected forced random card, got %+v", s)
	}
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "moving_sack_event", OptionID: "rush_untie"})
	if s.Phase != "dialogue" || s.StoryNodeID != "event_forced_chase" {
		t.Fatalf("random forced chase did not follow authored story: %+v", s)
	}
	s = finishStory(t, g, token)
	rev := s.Revision
	_, err := g.Execute(token, "random-chase-battle-gate", domain.CommandRequest{ExpectedRevision: &rev, Command: domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"}})
	if err == nil {
		t.Fatal("random forced chase must not skip the mandatory crate discovery story")
	}
}

func TestRescueBattlePositionPersistsForNormalAndSimulatedVictory(t *testing.T) {
	for _, mode := range []string{"normal", "development-simulated"} {
		t.Run(mode, func(t *testing.T) {
			g, token, path := setup(t)
			finishStory(t, g, token)
			execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
			execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"})
			finishStory(t, g, token)
			entry := &domain.WorldPoint{X: 111, Y: 626}
			s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue", ReturnPosition: entry})
			if s.AlleyBattleReturn == nil || *s.AlleyBattleReturn != *entry {
				t.Fatalf("battle entry position was not saved: %+v", s.AlleyBattleReturn)
			}
			store, err := repository.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			restarted := service.New(store, g.Catalog)
			s, err = restarted.State(token)
			if err != nil || s.AlleyBattleReturn == nil || *s.AlleyBattleReturn != *entry {
				t.Fatalf("saved battle position did not survive reload: %+v err=%v", s.AlleyBattleReturn, err)
			}
			s = execute(t, restarted, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
			s = execute(t, restarted, token, domain.Command{Type: "CONTINUE"})
			s = execute(t, restarted, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "rescue_1"})
			if s.Phase != "explore" || s.AlleyBattleReturn == nil || *s.AlleyBattleReturn != *entry {
				t.Fatalf("%s victory lost exact return position: %+v", mode, s.AlleyBattleReturn)
			}
			s = execute(t, restarted, token, domain.Command{Type: "INTERACT", InteractionID: "alley_poster"})
			if s.Phase != "dialogue" || s.StoryNodeID != "poster_1" {
				t.Fatalf("poster was inaccessible after return: %+v", s)
			}
		})
	}
}

func TestChapterOnePosterToFirstFlowerhouseUnlocksChapterTwo(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
	execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"})
	finishStory(t, g, token)
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue", ReturnPosition: &domain.WorldPoint{X: 333, Y: 179}})
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "rescue_1"})
	if s.Phase != "explore" {
		t.Fatalf("rescue dialogue should return to exploration: %+v", s)
	}
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_poster"})
	if s.StoryNodeID != "poster_1" {
		t.Fatalf("poster interaction did not start poster_1: %+v", s)
	}
	for s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	if s.Phase != "home" || s.MapID != "greenhouse" || s.ChapterID != "alley" || !domain.Contains(s.Flags, "rescue_story_done") {
		t.Fatalf("first Flowerhouse visit must remain Chapter 1 home: %+v", s)
	}
	for _, premature := range []string{"chapter_3_started", "momo_joined", "greenhouse_fortified"} {
		if domain.Contains(s.Flags, premature) {
			t.Fatalf("first Flowerhouse visit prematurely set %s", premature)
		}
	}
	if domain.Contains(s.Flags, "chapter_2_started") {
		t.Fatal("Chapter 2 should be eligible but not started yet")
	}
	s = execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	if s.Phase != "dialogue" || s.ChapterID != "market" || s.MapID != "market" || !domain.Contains(s.Flags, "chapter_2_started") {
		t.Fatalf("Chapter 2 was not eligible after the first Flowerhouse visit: %+v", s)
	}
}
