package service_test

import (
	"fmt"
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func TestMarketTrialOnlyMarksCompletionAndKeepsMainlineState(t *testing.T) {
	for _, pressure := range []int{-1, 0, 1} {
		t.Run(fmt.Sprint(pressure), func(t *testing.T) {
			g, token, _ := prepareBoss(t, pressure, map[string]int{"food": 6, "material": 7, "clue": 2, "warm-can": 4})
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.PushTokens = 0
				p.State.Currencies["stamp"] = 5
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			before, _ := g.State(token)
			g.Random = func(int) (int, error) { t.Fatal("trial called event or reward random source"); return 0, nil }
			for clear := 0; clear < 2; clear++ {
				s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
				if s.ActiveBattle.Modifiers.ShadowPressure != pressure || len(s.ActiveBattle.Supplies) != 0 {
					t.Fatal("wrong attempt tier or inventory reservation")
				}
				s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(2, true)})
				if !domain.Contains(s.CompletedStages, "market_boss") || s.LastResult.FirstClear != (clear == 0) {
					t.Fatal("trial completion was not recorded once")
				}
				if !reflect.DeepEqual(before.Inventory, s.Inventory) || !reflect.DeepEqual(before.Currencies, s.Currencies) || !reflect.DeepEqual(before.Cats, s.Cats) || !reflect.DeepEqual(before.Furniture, s.Furniture) || !reflect.DeepEqual(before.Flags, s.Flags) || before.PushTokens != s.PushTokens || before.ChapterID != s.ChapterID || before.StoryNodeID != s.StoryNodeID || !reflect.DeepEqual(before.EventState, s.EventState) {
					t.Fatal("standalone trial mutated mainline progress, pending event or resources")
				}
				s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
				if s.Phase != "home" || s.MapID != "greenhouse" || s.ActiveBattle != nil || s.StoryNodeID != before.StoryNodeID {
					t.Fatal("trial victory entered rescue story instead of home")
				}
			}
		})
	}
}

func TestMarketMainlineBattleRequiresCluesAndCExit(t *testing.T) {
	g, token, _ := prepareBoss(t, 0, nil)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "explore"
		p.State.MapID = "market"
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
	_, err = g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Flags = domain.Add(p.State.Flags, "market_crow_clue_completed")
		p.State.Flags = domain.Add(p.State.Flags, "market_pigeon_clue_completed")
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss", Layer: "L0", ReturnPosition: &domain.WorldPoint{X: 1310, Y: 169}})
	if s.ActiveBattle == nil || !s.ActiveBattle.Mainline {
		t.Fatal("market field battle was not recorded as mainline")
	}
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	if !domain.Contains(s.Flags, "market_cleared") {
		t.Fatal("mainline victory did not unlock exit")
	}
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Phase != "explore" || s.MapID != "market" {
		t.Fatal("mainline victory did not return to market")
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "GO_HOME"})
	rejectUnchanged(t, g, token, domain.Command{Type: "EXIT_MARKET", Layer: "L0", Position: &domain.WorldPoint{X: 1300, Y: 90}})
	s = execute(t, g, token, domain.Command{Type: "EXIT_MARKET", Layer: "L0", Position: &domain.WorldPoint{X: 1365, Y: 88}})
	if s.Phase != "dialogue" || s.MapID != "greenhouse" || s.ChapterID != "greenhouse" || s.StoryNodeID != "greenhouse_intro_1" || !domain.Contains(s.Flags, "market_exit_crossed") || !domain.Contains(s.Flags, "chapter_3_started") {
		t.Fatal("valid climbed exit did not start Chapter 3 in the existing greenhouse scene")
	}
}

func TestMarketFailureRetryKeepsSavedTierAndStageAcrossRestart(t *testing.T) {
	for _, pressure := range []int{-1, 0, 1} {
		t.Run(fmt.Sprint(pressure), func(t *testing.T) {
			g, token, path := prepareBoss(t, pressure, nil)
			s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
			firstID := s.ActiveBattle.ID
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: firstID, Outcome: "lost", Report: bossReport(3, false)})
			s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
			if s.Phase != "preparation" || s.ActiveBattle == nil || s.ActiveBattle.Status != "lost" || s.ActiveBattle.ID != firstID || s.LastResult.StageID != "market_boss" {
				t.Fatal("failed trial lost its preparation snapshot")
			}
			// A different pending event must not replace the failed attempt's locked tier.
			changedPressure := 1
			if pressure == 1 {
				changedPressure = -1
			}
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.EventState.PendingModifiers.ShadowPressure = changedPressure
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			store, err := repository.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			g = service.New(store, g.Catalog)
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
			if s.ActiveBattle.ID == firstID || s.ActiveBattle.StageID != "market_boss" || s.ActiveBattle.Modifiers.ShadowPressure != pressure || s.EventState.PendingModifiers.ShadowPressure != changedPressure {
				t.Fatal("retry did not preserve original tier independently of pending event")
			}
			for _, command := range []domain.Command{{Type: "GO_HOME"}, {Type: "START_STORY", NodeID: "market_intro_1"}, {Type: "START_BATTLE", StageID: "alley_boss"}} {
				rejectUnchanged(t, g, token, command)
			}
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
			if s.EventState.PendingModifiers.ShadowPressure != changedPressure {
				t.Fatal("trial victory consumed a pending mainline event")
			}
		})
	}
}

func TestMarketBattleRejectsInvalidReportsAndPressure(t *testing.T) {
	g, token, _ := prepareBoss(t, 0, nil)
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
	for _, report := range []*domain.BattleReport{nil, {}, bossReport(-1, true), bossReport(3, true), bossReport(0, false), bossReport(10001, true), {Leaks: new(int)}} {
		rejectUnchanged(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: report})
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: "other-attempt", Outcome: "won", Report: bossReport(0, true)})
	for _, pressure := range []int{-2, 2} {
		invalid, invalidToken, _ := prepareBoss(t, pressure, nil)
		rejectUnchanged(t, invalid, invalidToken, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
	}
}

func TestMarketEntryIsSeparateFromMainlineAndLockedBeforeRescue(t *testing.T) {
	g, token, _ := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "home"
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
	for _, phase := range []string{"explore", "preparation"} {
		g, token, _ = prepareBoss(t, 0, nil)
		_, err = g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.Phase = phase
			p.State.MapID = "market"
			return domain.CommandResponse{State: p.State}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
	}
	g, token, _ = prepareBoss(t, 0, nil)
	execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	s := finishStory(t, g, token)
	if s.ActiveBattle != nil || s.Phase == "battle" || domain.Contains(s.CompletedStages, "market_boss") {
		t.Fatal("market story was automatically connected to the standalone trial")
	}
}

func TestGreenhouseChapterTwoEntryAndExplorationResumeDoNotStartBattle(t *testing.T) {
	g, token, path := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "home"
		p.State.ChapterID = "greenhouse"
		p.State.MapID = "greenhouse"
		p.State.Flags = domain.Add(p.State.Flags, "alley_rescued")
		p.State.Flags = domain.Add(p.State.Flags, "rescue_story_done")
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	s := execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	if s.Phase != "dialogue" || s.ChapterID != "market" || s.MapID != "market" || s.StoryNodeID != "market_intro_1" || s.ActiveBattle != nil {
		t.Fatalf("greenhouse chapter action did not enter Chapter 2 dialogue: %+v", s)
	}
	s = finishStory(t, g, token)
	if s.Phase != "explore" || s.ChapterID != "market" || s.MapID != "market" || s.ActiveBattle != nil || !domain.Contains(s.Flags, "chapter_2_started") {
		t.Fatalf("Chapter 2 introduction did not enter market exploration: %+v", s)
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	g = service.New(store, g.Catalog)
	s, err = g.State(token)
	if err != nil || s.Phase != "explore" || s.MapID != "market" || s.ActiveBattle != nil {
		t.Fatalf("reloaded Chapter 2 exploration restored the wrong state: state=%+v err=%v", s, err)
	}
	s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "market"})
	if s.Phase != "explore" || s.ChapterID != "market" || s.MapID != "market" || s.ActiveBattle != nil {
		t.Fatalf("direct market exploration test path started or resumed battle: %+v", s)
	}
}

func TestMarketMomoOptionalEventUsesAuthoredLocationAndNarrativeState(t *testing.T) {
	g, token, _ := setup(t)
	s := exploreMarketForTest(t, g, token)
	if _, err := g.Execute(token, "momo-wrong-location", domain.CommandRequest{Command: domain.Command{Type: "INTERACT", InteractionID: "market_momo_trace", Layer: "L0", Position: &domain.WorldPoint{X: 900, Y: 240}}}); err == nil {
		t.Fatal("Momo interaction accepted outside its authored radius")
	}
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "market_momo_trace", Layer: "L0", Position: &domain.WorldPoint{X: 947, Y: 160}})
	if s.Phase != "event" || s.PendingEventID != "momo_trail_event" || s.PendingEventSource != "node" {
		t.Fatalf("optional clue did not open its narrative event: phase=%s event=%s source=%s", s.Phase, s.PendingEventID, s.PendingEventSource)
	}
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "momo_trail_event", OptionID: "follow_trail"})
	if !domain.Contains(s.DrawnEvents, "node:momo_trail_event") {
		t.Fatalf("optional event completion was not recorded authoritatively: %v", s.DrawnEvents)
	}
}

func TestMarketStoryEntryStaysInExplorationUntilCluesAndAuthoredPoint(t *testing.T) {
	g, token, _ := prepareBoss(t, 0, nil)
	s := execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	if s.ChapterID != "market" || s.MapID != "market" || s.Phase != "dialogue" || s.ActiveBattle != nil {
		t.Fatalf("market introduction entered an invalid state: chapter=%q map=%q phase=%q battle=%v", s.ChapterID, s.MapID, s.Phase, s.ActiveBattle)
	}
	s = finishStory(t, g, token)
	if s.ChapterID != "market" || s.MapID != "market" || s.Phase != "explore" || s.ActiveBattle != nil {
		t.Fatalf("market introduction did not end in exploration: chapter=%q map=%q phase=%q battle=%v", s.ChapterID, s.MapID, s.Phase, s.ActiveBattle)
	}
	for _, flag := range []string{"market_crow_clue_completed", "market_pigeon_clue_completed"} {
		rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss", Layer: "L0", ReturnPosition: &domain.WorldPoint{X: 1310, Y: 169}})
		_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.Flags = domain.Add(p.State.Flags, flag)
			return domain.CommandResponse{State: p.State}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss", Layer: "L0", ReturnPosition: &domain.WorldPoint{X: 670, Y: 781}})
	s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss", Layer: "L0", ReturnPosition: &domain.WorldPoint{X: 1310, Y: 169}})
	if s.ActiveBattle == nil || !s.ActiveBattle.Mainline || s.Phase != "battle" {
		t.Fatal("market boss did not start at the authored point after both clues")
	}
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Phase != "explore" || s.MapID != "market" || !domain.Contains(s.Flags, "market_cleared") {
		t.Fatal("market victory did not return to cleared exploration")
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss", Layer: "L0", ReturnPosition: &domain.WorldPoint{X: 1310, Y: 169}})
}

func TestMarketTrialStartAndSettlementAreDurablyIdempotent(t *testing.T) {
	g, token, path := prepareBoss(t, 1, nil)
	before, _ := g.State(token)
	startReq := domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "START_BATTLE", StageID: "market_boss"}}
	first, err := g.Execute(token, "market-start-once", startReq)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := g.Execute(token, "market-start-once", startReq)
	if err != nil || !replay.Replayed || !reflect.DeepEqual(first.State, replay.State) {
		t.Fatal("retried entry created another attempt")
	}
	req := domain.CommandRequest{ExpectedRevision: &first.State.Revision, Command: domain.Command{Type: "COMPLETE_BATTLE", AttemptID: first.State.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)}}
	settled, err := g.Execute(token, "market-settle-once", req)
	if err != nil {
		t.Fatal(err)
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	g = service.New(store, g.Catalog)
	replay, err = g.Execute(token, "market-settle-once", req)
	if err != nil || !replay.Replayed || !reflect.DeepEqual(settled.State, replay.State) {
		t.Fatal("replayed settlement changed saved state")
	}
	rejectUnchanged(t, g, token, req.Command)
}

func TestLeavingMarketRetryClearsOnlyItsTemporaryAttempt(t *testing.T) {
	g, token, _ := prepareBoss(t, -1, nil)
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "lost", Report: bossReport(3, false)})
	execute(t, g, token, domain.Command{Type: "CONTINUE"})
	s = execute(t, g, token, domain.Command{Type: "GO_HOME"})
	if s.ActiveBattle != nil || s.Phase != "home" || s.EventState.PendingModifiers.ShadowPressure != -1 {
		t.Fatal("leaving retry retained stale attempt or changed mainline pressure")
	}
	s = execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	if s.ActiveBattle != nil || s.Phase != "dialogue" {
		t.Fatal("standalone retry contaminated mainline story")
	}
}
