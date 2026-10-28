package service_test

import (
	"fmt"
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"strings"
	"testing"
)

func bossReport(leaks int, defeated bool) *domain.BattleReport {
	return &domain.BattleReport{Leaks: &leaks, BossDefeated: &defeated}
}

func prepareBoss(t *testing.T, pressure int, inventory map[string]int) (*service.Game, string, string) {
	t.Helper()
	g, token, path := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "home"
		p.State.MapID = "greenhouse"
		p.State.Flags = domain.Add(p.State.Flags, "alley_rescued")
		p.State.Flags = domain.Add(p.State.Flags, "rescue_story_done")
		p.State.Flags = domain.Add(p.State.Flags, "chapter_3_started")
		p.State.Flags = domain.Add(p.State.Flags, "momo_joined")
		p.State.EventState = &domain.EventState{PendingModifiers: domain.BattleModifiers{ShadowPressure: pressure}}
		for id, quantity := range inventory {
			p.State.Inventory[id] = quantity
		}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return g, token, path
}

func rejectUnchanged(t *testing.T, g *service.Game, token string, c domain.Command) {
	t.Helper()
	before, _ := g.State(token)
	_, err := g.Execute(token, fmt.Sprintf("invalid-%d", before.Revision), domain.CommandRequest{ExpectedRevision: &before.Revision, Command: c})
	if err == nil {
		t.Fatalf("invalid command accepted: %#v", c)
	}
	after, _ := g.State(token)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("rejected command changed saved state")
	}
}

func TestBattleNeverReservesConsumesOrAwardsSupplies(t *testing.T) {
	for _, pressure := range []int{-1, 0, 1} {
		t.Run(fmt.Sprint(pressure), func(t *testing.T) {
			g, token, _ := prepareBoss(t, pressure, map[string]int{"warm-can": 5, "bouncy-treat": 3, "food": 4, "material": 7})
			before, _ := g.State(token)
			g.Random = func(int) (int, error) { t.Fatal("battle requested random supply rewards"); return 0, nil }
			s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss"})
			if !reflect.DeepEqual(before.Inventory, s.Inventory) || len(s.ActiveBattle.Supplies) != 0 || s.ActiveBattle.Modifiers.ShadowPressure != pressure {
				t.Fatal("entry changed inventory or lost saved difficulty")
			}
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
			if !reflect.DeepEqual(before.Inventory, s.Inventory) || !reflect.DeepEqual(before.Cats, s.Cats) || !s.LastResult.FirstClear || s.EventState.PendingModifiers.ShadowPressure != 0 {
				t.Fatal("victory changed existing resources or failed progression")
			}
			s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
			if s.Phase != "home" || s.MapID != "greenhouse" {
				t.Fatal("replay returned to rescue story")
			}
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss"})
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(2, true)})
			if s.LastResult.FirstClear || !reflect.DeepEqual(before.Inventory, s.Inventory) {
				t.Fatal("repeat victory granted resources")
			}
		})
	}
}

func TestBothFirstChapterStagesRequireValidBossReports(t *testing.T) {
	for _, stage := range []string{"alley_rescue", "alley_boss"} {
		t.Run(stage, func(t *testing.T) {
			g, token, _ := prepareBoss(t, 1, nil)
			s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: stage})
			base := domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)}
			for _, report := range []*domain.BattleReport{nil, {}, bossReport(-1, true), bossReport(0, false), bossReport(3, true), bossReport(10001, true), {Leaks: new(int)}} {
				command := base
				command.Report = report
				rejectUnchanged(t, g, token, command)
			}
			wrong := base
			wrong.AttemptID = "another-attempt"
			rejectUnchanged(t, g, token, wrong)
			_, err := g.Execute(token, "old-client", domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"}})
			if err == nil || !strings.Contains(err.Error(), "刷新") {
				t.Fatal("old client needs a refresh hint")
			}
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "lost", Report: bossReport(3, false)})
			if s.EventState.PendingModifiers.ShadowPressure != 1 {
				t.Fatal("loss changed pending difficulty")
			}
			s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
			if s.Phase != "preparation" || s.LastResult.StageID != stage || s.ActiveBattle == nil || s.ActiveBattle.Status != "lost" || s.ActiveBattle.StageID != stage {
				t.Fatal("retry lost first-chapter stage")
			}
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: stage})
			if s.ActiveBattle.Modifiers.ShadowPressure != 1 {
				t.Fatal("retry lost difficulty")
			}
		})
	}
}

func TestLegacyReservationsRefundFullyOnceAcrossReload(t *testing.T) {
	for _, stage := range []string{"alley_rescue", "alley_boss"} {
		for _, outcome := range []string{"won", "lost"} {
			t.Run(stage+"/"+outcome, func(t *testing.T) {
				g, token, path := prepareBoss(t, 1, map[string]int{"warm-can": 1, "bouncy-treat": 2, "food": 6})
				_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
					p.State.Phase = "battle"
					p.State.ActiveBattle = &domain.Attempt{ID: "old-reserved-attempt", StageID: stage, Status: "active", Modifiers: &domain.BattleModifiers{ShadowPressure: 1}, Supplies: map[string]int{"warm-can": 4, "bouncy-treat": 2}}
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
				g.Random = func(int) (int, error) { t.Fatal("migration awarded random supplies"); return 0, nil }
				s, _ := g.State(token)
				if s.ActiveBattle.Modifiers.ShadowPressure != 1 || s.ActiveBattle.ID != "old-reserved-attempt" {
					t.Fatal("legacy attempt changed on reload")
				}
				for _, command := range []domain.Command{{Type: "GO_HOME"}, {Type: "GO_EXPLORE"}, {Type: "START_STORY", NodeID: "market_intro_1"}, {Type: "START_BATTLE", StageID: stage}} {
					rejectUnchanged(t, g, token, command)
				}
				report := bossReport(0, true)
				if outcome == "lost" {
					report = bossReport(3, false)
				}
				req := domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: outcome, Report: report}}
				first, err := g.Execute(token, "legacy-refund", req)
				if err != nil {
					t.Fatal(err)
				}
				if first.State.Inventory["warm-can"] != 5 || first.State.Inventory["bouncy-treat"] != 4 || first.State.Inventory["food"] != 6 || len(first.State.ActiveBattle.Supplies) != 0 {
					t.Fatal("reservation was not fully returned")
				}
				store, err = repository.Open(path)
				if err != nil {
					t.Fatal(err)
				}
				g = service.New(store, g.Catalog)
				replay, err := g.Execute(token, "legacy-refund", req)
				if err != nil || !replay.Replayed || !reflect.DeepEqual(first.State, replay.State) {
					t.Fatal("durable replay changed refund")
				}
				rejectUnchanged(t, g, token, req.Command)
			})
		}
	}
}

func TestInvalidLegacyReservationRollsBackAndTerminalSaveIsUntouched(t *testing.T) {
	for _, reserved := range []map[string]int{{"warm-can": 2, "food": 1}, {"warm-can": -1}} {
		g, token, _ := prepareBoss(t, 0, map[string]int{"warm-can": 3})
		_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.Phase = "battle"
			p.State.ActiveBattle = &domain.Attempt{ID: "old-invalid", StageID: "alley_boss", Status: "active", Supplies: reserved}
			return domain.CommandResponse{State: p.State}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		rejectUnchanged(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: "old-invalid", Outcome: "lost", Report: bossReport(3, false)})
	}
	g, token, _ := prepareBoss(t, 0, map[string]int{"warm-can": 3})
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "settlement"
		p.State.ActiveBattle = &domain.Attempt{ID: "already-settled", StageID: "alley_boss", Status: "won", Supplies: map[string]int{"warm-can": 2}}
		p.State.LastResult = domain.Result{StageID: "alley_boss", Outcome: "won"}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	s := execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Inventory["warm-can"] != 3 {
		t.Fatal("already-settled historical reservation was refunded twice")
	}
}

func TestFirstRescueKeepsStoryRewardsWithoutSupplies(t *testing.T) {
	g, token, _ := setup(t)
	s := toBattle(t, g, token)
	g.Random = func(int) (int, error) { t.Fatal("rescue requested supply rewards"); return 0, nil }
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	if !domain.Contains(s.Cats, "diandian") || !domain.Contains(s.Furniture, "cardboard_nest") || !domain.Contains(s.Flags, "alley_rescued") || s.Currencies["stamp"] != 2 || s.Inventory["material"] != 3 || s.Inventory["warm-can"] != 0 || s.Inventory["bouncy-treat"] != 0 {
		t.Fatal("rescue story rewards changed")
	}
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Phase != "dialogue" {
		t.Fatal("first rescue did not continue its story")
	}
}

func TestBattleEntryRejectsLockedAndInvalidStages(t *testing.T) {
	g, token, _ := setup(t)
	rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "l00_tutorial"})
	rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss"})
	g, token, _ = prepareBoss(t, 0, nil)
	rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "future_stage"})
}

func TestTutorialRetryKeepsAttemptTierWithoutConsumingPendingEvent(t *testing.T) {
	for _, commandType := range []string{"START_BATTLE", "CONTINUE"} {
		for _, pressure := range []int{-1, 0, 1} {
			t.Run(fmt.Sprintf("%s/%d", commandType, pressure), func(t *testing.T) {
				g, token, _ := setup(t)
				_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
					p.State.Phase = "battle"
					p.State.ActiveBattle = &domain.Attempt{ID: "failed-tutorial", StageID: "l00_tutorial", Status: "active", Modifiers: &domain.BattleModifiers{ShadowPressure: pressure}}
					p.State.EventState = &domain.EventState{PendingModifiers: domain.BattleModifiers{ShadowPressure: 1 - pressure}}
					return domain.CommandResponse{State: p.State}, nil
				})
				if err != nil {
					t.Fatal(err)
				}
				s := execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: "failed-tutorial", Outcome: "lost"})
				pending := s.EventState.PendingModifiers
				command := domain.Command{Type: commandType}
				if commandType == "START_BATTLE" {
					command.StageID = "l00_tutorial"
				}
				s = execute(t, g, token, command)
				if s.Phase != "battle" || s.ActiveBattle.ID == "failed-tutorial" || s.ActiveBattle.StageID != "l00_tutorial" || s.ActiveBattle.Modifiers.ShadowPressure != pressure || s.EventState.PendingModifiers != pending {
					t.Fatal("retry changed identity, tier or pending event")
				}
			})
		}
	}
}
