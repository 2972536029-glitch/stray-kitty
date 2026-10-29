package service_test

import (
	"fmt"
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func finaleReport(leaks int, defeated bool) *domain.BattleReport {
	report := bossReport(leaks, defeated)
	elites := 2
	report.ElitesDefeated = &elites
	return report
}

func TestFinaleTrialRetryAndCompletionPreserveMainline(t *testing.T) {
	for _, pressure := range []int{-1, 0, 1} {
		t.Run(fmt.Sprint(pressure), func(t *testing.T) {
			g, token, path := prepareBoss(t, pressure, map[string]int{"food": 5, "material": 6, "clue": 3, "warm-can": 2})
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.PushTokens = 0
				p.State.Currencies["stamp"] = 4
				p.State.ChapterID = "finale"
				p.State.StoryNodeID = "finale_intro_9"
				p.State.Flags = domain.Add(p.State.Flags, "finale_completed")
				p.State.Flags = domain.Add(p.State.Flags, "kingdom_founded")
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			before, _ := g.State(token)
			if domain.Contains(before.CompletedStages, "market_boss") {
				t.Fatal("fixture incorrectly requires L02 completion")
			}
			startReq := domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "START_BATTLE", StageID: "finale_boss"}}
			first, err := g.Execute(token, "finale-start", startReq)
			if err != nil {
				t.Fatal(err)
			}
			replay, err := g.Execute(token, "finale-start", startReq)
			if err != nil || !replay.Replayed || !reflect.DeepEqual(first.State, replay.State) {
				t.Fatal("start retry created another attempt")
			}
			s := first.State
			firstID := s.ActiveBattle.ID
			if s.ActiveBattle.Modifiers.ShadowPressure != pressure || len(s.ActiveBattle.Supplies) != 0 || !reflect.DeepEqual(before.EventState, s.EventState) {
				t.Fatal("entry changed pressure, pending event or inventory contract")
			}
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: firstID, Outcome: "lost", Report: finaleReport(3, false)})
			if !reflect.DeepEqual(greenhouseProgress(before), greenhouseProgress(s)) || !reflect.DeepEqual(before.EventState, s.EventState) || domain.Contains(s.CompletedStages, "finale_boss") {
				t.Fatal("loss changed mainline state")
			}
			s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
			if s.Phase != "preparation" || s.ActiveBattle == nil || s.ActiveBattle.ID != firstID || s.ActiveBattle.Status != "lost" || s.LastResult.StageID != "finale_boss" {
				t.Fatal("finale retry lost stage or original attempt")
			}
			rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
			pending := -1
			if pressure == -1 {
				pending = 1
			}
			_, err = g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.EventState.PendingModifiers.ShadowPressure = pending
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
			g.Random = func(int) (int, error) { t.Fatal("trial requested event or reward draws"); return 0, nil }
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "finale_boss"})
			if s.ActiveBattle.ID == firstID || s.ActiveBattle.StageID != "finale_boss" || s.ActiveBattle.Modifiers.ShadowPressure != pressure {
				t.Fatal("retry did not create a new attempt with locked difficulty")
			}
			settlementRevision := s.Revision
			req := domain.CommandRequest{ExpectedRevision: &settlementRevision, Command: domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: finaleReport(2, true)}}
			won, err := g.Execute(token, "finale-settlement", req)
			if err != nil {
				t.Fatal(err)
			}
			s = won.State
			if !reflect.DeepEqual(greenhouseProgress(before), greenhouseProgress(s)) || s.EventState.PendingModifiers.ShadowPressure != pending {
				t.Fatal("victory granted rewards, changed story or consumed pending event")
			}
			if !s.LastResult.FirstClear || !reflect.DeepEqual(s.CompletedStages, []string{"finale_boss"}) {
				t.Fatal("only finale completion should be added")
			}
			store, err = repository.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			g = service.New(store, g.Catalog)
			replay, err = g.Execute(token, "finale-settlement", req)
			if err != nil || !replay.Replayed || !reflect.DeepEqual(s, replay.State) {
				t.Fatal("durable settlement replay changed state")
			}
			rejectUnchanged(t, g, token, req.Command)
			s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
			if s.Phase != "home" || s.MapID != "greenhouse" || s.ActiveBattle != nil || s.StoryNodeID != before.StoryNodeID {
				t.Fatal("trial victory entered a mainline story")
			}
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "finale_boss"})
			if s.ActiveBattle.Modifiers.ShadowPressure != pending {
				t.Fatal("new home trial reused an obsolete retry tier")
			}
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: finaleReport(0, true)})
			if s.LastResult.FirstClear || !reflect.DeepEqual(greenhouseProgress(before), greenhouseProgress(s)) || s.EventState.PendingModifiers.ShadowPressure != pending {
				t.Fatal("repeat victory changed rewards or pending event")
			}
		})
	}
}

func TestFinaleEntryReportAndPressureBoundaries(t *testing.T) {
	for _, phase := range []string{"home", "explore", "preparation"} {
		g, token, _ := prepareBoss(t, 0, nil)
		_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.Phase = phase
			if phase == "home" {
				p.State.Flags = nil
			}
			return domain.CommandResponse{State: p.State}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "finale_boss"})
	}
	for _, pressure := range []int{-2, 2} {
		g, token, _ := prepareBoss(t, pressure, nil)
		rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "finale_boss"})
	}
	g, token, _ := prepareBoss(t, 0, nil)
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "finale_boss"})
	for _, report := range []*domain.BattleReport{nil, {}, finaleReport(-1, true), finaleReport(3, true), finaleReport(0, false), finaleReport(10001, true), {Leaks: new(int)}} {
		rejectUnchanged(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: report})
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: "another-attempt", Outcome: "won", Report: finaleReport(0, true)})
	rejectUnchanged(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
}

func TestFinaleRetryNavigationLeavesNoStaleBattle(t *testing.T) {
	for _, command := range []domain.Command{{Type: "GO_HOME"}, {Type: "GO_EXPLORE", MapID: "market"}, {Type: "START_STORY", NodeID: "market_intro_1"}} {
		t.Run(command.Type, func(t *testing.T) {
			g, token, _ := prepareBoss(t, 1, nil)
			s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "finale_boss"})
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "lost", Report: finaleReport(3, false)})
			execute(t, g, token, domain.Command{Type: "CONTINUE"})
			s = execute(t, g, token, command)
			if s.ActiveBattle != nil || s.EventState.PendingModifiers.ShadowPressure != 1 {
				t.Fatal("navigation retained trial snapshot or consumed pending event")
			}
		})
	}
}

func TestFinaleTrialDoesNotReplaceExistingStoryExits(t *testing.T) {
	g, token, _ := setup(t)
	s := toBattle(t, g, token)
	if s.ActiveBattle.StageID != "alley_rescue" {
		t.Fatal("first rescue was replaced by finale trial")
	}
	g, token, _ = prepareBoss(t, 0, nil)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Flags = domain.Add(domain.Add(p.State.Flags, "tunnel_explored"), "cats_rescued_batch1")
		p.State.Inventory["clue"] = 3
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "finale_intro_1"})
	s = finishStory(t, g, token)
	if s.ActiveBattle != nil || s.Phase == "battle" || domain.Contains(s.CompletedStages, "finale_boss") {
		t.Fatal("market story automatically opened finale trial")
	}
}

func TestFinaleReportRequiresBothEliteGuards(t *testing.T) {
	g, token, _ := prepareBoss(t, 0, nil)
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "finale_boss"})
	for _, outcome := range []string{"won", "lost"} {
		rejectUnchanged(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: outcome, Report: bossReport(0, true)})
	}
	for _, defeated := range []int{-1, 0, 1, 3} {
		report := finaleReport(0, true)
		report.ElitesDefeated = &defeated
		rejectUnchanged(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: report})
	}
	zero := 0
	report := finaleReport(0, false)
	report.ElitesDefeated = &zero
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "lost", Report: report})
	if s.Phase != "settlement" || s.LastResult.Outcome != "lost" {
		t.Fatal("retreat with no elite kills must remain a valid loss")
	}
}
