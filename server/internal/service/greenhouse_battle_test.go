package service_test

import (
	"fmt"
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func greenhouseProgress(s domain.GameState) map[string]any {
	return map[string]any{"inventory": s.Inventory, "currencies": s.Currencies, "cats": s.Cats, "furniture": s.Furniture, "flags": s.Flags, "push": s.PushTokens, "chapter": s.ChapterID, "story": s.StoryNodeID, "placements": s.Placements}
}

func TestGreenhouseTrialRetryAndCompletionPreserveMainline(t *testing.T) {
	for _, pressure := range []int{-1, 0, 1} {
		t.Run(fmt.Sprint(pressure), func(t *testing.T) {
			g, token, path := prepareBoss(t, pressure, map[string]int{"food": 5, "material": 6, "clue": 3, "warm-can": 2})
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.PushTokens = 0
				p.State.Currencies["stamp"] = 4
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			before, _ := g.State(token)
			if domain.Contains(before.CompletedStages, "market_boss") {
				t.Fatal("fixture incorrectly requires L02 completion")
			}
			startReq := domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "START_BATTLE", StageID: "greenhouse_boss"}}
			first, err := g.Execute(token, "greenhouse-start", startReq)
			if err != nil {
				t.Fatal(err)
			}
			replay, err := g.Execute(token, "greenhouse-start", startReq)
			if err != nil || !replay.Replayed || !reflect.DeepEqual(first.State, replay.State) {
				t.Fatal("start retry created another attempt")
			}
			s := first.State
			firstID := s.ActiveBattle.ID
			if s.ActiveBattle.Modifiers.ShadowPressure != pressure || len(s.ActiveBattle.Supplies) != 0 || !reflect.DeepEqual(before.EventState, s.EventState) {
				t.Fatal("entry changed pressure, pending event or inventory contract")
			}
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: firstID, Outcome: "lost", Report: bossReport(3, false)})
			if !reflect.DeepEqual(greenhouseProgress(before), greenhouseProgress(s)) || !reflect.DeepEqual(before.EventState, s.EventState) || domain.Contains(s.CompletedStages, "greenhouse_boss") {
				t.Fatal("loss changed mainline state")
			}
			s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
			if s.Phase != "preparation" || s.ActiveBattle == nil || s.ActiveBattle.ID != firstID || s.ActiveBattle.Status != "lost" || s.LastResult.StageID != "greenhouse_boss" {
				t.Fatal("greenhouse retry lost stage or original attempt")
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
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "greenhouse_boss"})
			if s.ActiveBattle.ID == firstID || s.ActiveBattle.StageID != "greenhouse_boss" || s.ActiveBattle.Modifiers.ShadowPressure != pressure {
				t.Fatal("retry did not create a new attempt with locked difficulty")
			}
			settlementRevision := s.Revision
			req := domain.CommandRequest{ExpectedRevision: &settlementRevision, Command: domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(2, true)}}
			won, err := g.Execute(token, "greenhouse-settlement", req)
			if err != nil {
				t.Fatal(err)
			}
			s = won.State
			if s.EventState.PendingModifiers.ShadowPressure != pending || !domain.Contains(s.Flags, "greenhouse_fortified") {
				t.Fatal("victory must fortify the greenhouse without consuming pending event")
			}
			if !s.LastResult.FirstClear || !reflect.DeepEqual(s.CompletedStages, []string{"greenhouse_boss"}) {
				t.Fatal("only greenhouse completion should be added")
			}
			store, err = repository.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			g = service.New(store, g.Catalog)
			replay, err = g.Execute(token, "greenhouse-settlement", req)
			if err != nil || !replay.Replayed || !reflect.DeepEqual(s, replay.State) {
				t.Fatal("durable settlement replay changed state")
			}
			rejectUnchanged(t, g, token, req.Command)
			s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
			if s.Phase != "home" || s.MapID != "greenhouse" || s.ActiveBattle != nil || s.StoryNodeID != before.StoryNodeID {
				t.Fatal("trial victory entered a mainline story")
			}
			fortifiedHome := s
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "greenhouse_boss"})
			if s.ActiveBattle.Modifiers.ShadowPressure != pending {
				t.Fatal("new home trial reused an obsolete retry tier")
			}
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
			if s.LastResult.FirstClear || !reflect.DeepEqual(greenhouseProgress(fortifiedHome), greenhouseProgress(s)) || s.EventState.PendingModifiers.ShadowPressure != pending {
				t.Fatal("repeat victory changed rewards or pending event")
			}
		})
	}
}

func TestGreenhouseEntryReportAndPressureBoundaries(t *testing.T) {
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
		rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "greenhouse_boss"})
	}
	for _, pressure := range []int{-2, 2} {
		g, token, _ := prepareBoss(t, pressure, nil)
		rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "greenhouse_boss"})
	}
	g, token, _ := prepareBoss(t, 0, nil)
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "greenhouse_boss"})
	for _, report := range []*domain.BattleReport{nil, {}, bossReport(-1, true), bossReport(3, true), bossReport(0, false), bossReport(10001, true), {Leaks: new(int)}} {
		rejectUnchanged(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: report})
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: "another-attempt", Outcome: "won", Report: bossReport(0, true)})
	rejectUnchanged(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
}

func TestGreenhouseRetryNavigationLeavesNoStaleBattle(t *testing.T) {
	for _, command := range []domain.Command{{Type: "GO_HOME"}, {Type: "GO_EXPLORE", MapID: "market"}, {Type: "START_STORY", NodeID: "market_intro_1"}} {
		t.Run(command.Type, func(t *testing.T) {
			g, token, _ := prepareBoss(t, 1, nil)
			s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "greenhouse_boss"})
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "lost", Report: bossReport(3, false)})
			execute(t, g, token, domain.Command{Type: "CONTINUE"})
			s = execute(t, g, token, command)
			if s.ActiveBattle != nil || s.EventState.PendingModifiers.ShadowPressure != 1 {
				t.Fatal("navigation retained trial snapshot or consumed pending event")
			}
		})
	}
}

func TestGreenhouseTrialDoesNotReplaceExistingStoryExits(t *testing.T) {
	g, token, _ := setup(t)
	s := toBattle(t, g, token)
	if s.ActiveBattle.StageID != "alley_rescue" {
		t.Fatal("first rescue was replaced by greenhouse trial")
	}
	g, token, _ = prepareBoss(t, 0, nil)
	execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	s = finishStory(t, g, token)
	if s.ActiveBattle != nil || s.Phase == "battle" || domain.Contains(s.CompletedStages, "greenhouse_boss") {
		t.Fatal("market story automatically opened greenhouse trial")
	}
}

func TestGreenhouseBossRequiresChapterThreeAndMomo(t *testing.T) {
	for _, missingFlag := range []string{"chapter_3_started", "momo_joined"} {
		t.Run(missingFlag, func(t *testing.T) {
			g, token, _ := prepareBoss(t, 0, nil)
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				flags := p.State.Flags[:0]
				for _, flag := range p.State.Flags {
					if flag != missingFlag {
						flags = append(flags, flag)
					}
				}
				p.State.Flags = flags
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "greenhouse_boss"})
		})
	}
}
