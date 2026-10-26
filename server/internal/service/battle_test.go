package service_test

import (
	"errors"
	"fmt"
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func bossReport(leaks int, defeated bool) *domain.BattleReport {
	return &domain.BattleReport{Leaks: &leaks, BossDefeated: &defeated}
}

func prepareBoss(t *testing.T, pressure int, supplies map[string]int) (*service.Game, string, string) {
	t.Helper()
	g, token, path := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "home"
		p.State.MapID = "greenhouse"
		p.State.Flags = domain.Add(p.State.Flags, "alley_rescued")
		p.State.EventState = &domain.EventState{PendingModifiers: domain.BattleModifiers{ShadowPressure: pressure}}
		for id, quantity := range supplies {
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

func TestBattleReservationsSurviveReloadAndFailureReturnsOnlyUnused(t *testing.T) {
	g, token, path := prepareBoss(t, 1, map[string]int{"warm-can": 5, "bouncy-treat": 3})
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss", Supplies: map[string]int{"warm-can": 4, "bouncy-treat": 2}})
	if s.Inventory["warm-can"] != 1 || s.Inventory["bouncy-treat"] != 1 {
		t.Fatal("supplies were not reserved once")
	}
	before := s
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	g = service.New(store, g.Catalog)
	s, err = g.State(token)
	if err != nil || !reflect.DeepEqual(before, s) {
		t.Fatalf("active reservation did not survive restart: %v", err)
	}
	for _, command := range []domain.Command{{Type: "GO_EXPLORE"}, {Type: "START_STORY", NodeID: "market_intro_1"}, {Type: "START_BATTLE", StageID: "alley_boss"}} {
		rejectUnchanged(t, g, token, command)
	}
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "lost", UsedSupplies: map[string]int{"warm-can": 1, "bouncy-treat": 1}, Report: bossReport(3, false)})
	if s.Inventory["warm-can"] != 4 || s.Inventory["bouncy-treat"] != 2 || s.LastResult.BattleRewards != nil || len(s.CompletedStages) != 0 {
		t.Fatalf("failure did not refund unused units without rewards: %#v", s)
	}
	if s.EventState.PendingModifiers.ShadowPressure != 1 {
		t.Fatal("failure changed pending difficulty")
	}
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Phase != "preparation" || s.LastResult.StageID != "alley_boss" || s.ActiveBattle != nil {
		t.Fatal("failure retry did not retain the chapter identity")
	}
	s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss"})
	if s.ActiveBattle.Modifiers.ShadowPressure != 1 || len(s.ActiveBattle.Supplies) != 0 {
		t.Fatal("new attempt did not inherit pressure with an explicitly empty loadout")
	}
}

func TestBattleRejectsInvalidLoadoutsAndUnownedSupplies(t *testing.T) {
	g, token, _ := prepareBoss(t, 0, map[string]int{"warm-can": 2, "bouncy-treat": 1})
	for _, supplies := range []map[string]int{{"warm-can": -1}, {"warm-can": 5}, {"bouncy-treat": 3}, {"warm-can": 3}, {"bouncy-treat": 2}, {"food": 0}, {"__proto__": 1}} {
		rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss", Supplies: supplies})
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "future_stage"})
	g2, token2, _ := setup(t)
	rejectUnchanged(t, g2, token2, domain.Command{Type: "START_BATTLE", StageID: "alley_boss"})
}

func TestBossReportsAndUsageCannotBypassResultContract(t *testing.T) {
	g, token, _ := prepareBoss(t, 0, map[string]int{"warm-can": 2})
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss", Supplies: map[string]int{"warm-can": 2}})
	base := domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", UsedSupplies: map[string]int{}, Report: bossReport(0, true)}
	for _, report := range []*domain.BattleReport{nil, {}, bossReport(-1, true), bossReport(0, false), bossReport(3, true), {Leaks: new(int)}} {
		command := base
		command.Report = report
		rejectUnchanged(t, g, token, command)
	}
	for _, used := range []map[string]int{nil, {"warm-can": 3}, {"bouncy-treat": 1}, {"warm-can": -1}, {"food": 0}} {
		command := base
		command.UsedSupplies = used
		rejectUnchanged(t, g, token, command)
	}
	command := base
	command.AttemptID = "another-attempt"
	rejectUnchanged(t, g, token, command)
}

func TestChapterRewardsUseLockedTierPerfectAndFirstClearOnce(t *testing.T) {
	for _, pressure := range []int{-1, 0, 1} {
		t.Run(fmt.Sprint(pressure), func(t *testing.T) {
			g, token, _ := prepareBoss(t, pressure, map[string]int{})
			s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss"})
			cats, stamps, materials := append([]string{}, s.Cats...), s.Currencies["stamp"], s.Inventory["material"]
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", UsedSupplies: map[string]int{}, Report: bossReport(0, true)})
			r := s.LastResult.BattleRewards
			if r == nil || r.BaseCount != 3+pressure || r.FirstClearBonus != 2 || r.PerfectBonus != 1 || r.Supplies["warm-can"] != 6+pressure || !s.LastResult.FirstClear {
				t.Fatalf("wrong first perfect rewards: %#v", r)
			}
			if !reflect.DeepEqual(cats, s.Cats) || stamps != s.Currencies["stamp"] || materials != s.Inventory["material"] {
				t.Fatal("chapter fight modified old rescue rewards or long-term companions")
			}
			if s.EventState.PendingModifiers.ShadowPressure != 0 {
				t.Fatal("victory did not clear pending difficulty")
			}
			s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
			if s.Phase != "home" || s.MapID != "greenhouse" {
				t.Fatal("chapter victory started old rescue dialogue")
			}
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss"})
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", UsedSupplies: map[string]int{}, Report: bossReport(2, true)})
			r = s.LastResult.BattleRewards
			if r.BaseCount != 3 || r.FirstClearBonus != 0 || r.PerfectBonus != 0 || s.LastResult.FirstClear || s.Inventory["warm-can"] != 9+pressure {
				t.Fatalf("repeat rewards or inherited normal tier incorrect: %#v", r)
			}
		})
	}
}

func TestRewardPoolBoundaryAndAtomicRollback(t *testing.T) {
	g, token, path := prepareBoss(t, 0, map[string]int{"warm-can": 2})
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss", Supplies: map[string]int{"warm-can": 2}})
	req := domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", UsedSupplies: map[string]int{"warm-can": 1}, Report: bossReport(0, true)}}
	calls := 0
	g.Random = func(max int) (int, error) {
		calls++
		if max != 100 {
			t.Fatal("reward draw uses unexpected range")
		}
		if calls == 2 {
			return 0, errors.New("random source unavailable")
		}
		return 69, nil
	}
	if _, err := g.Execute(token, "atomic-reward-test", req); err == nil {
		t.Fatal("random failure accepted")
	}
	after, _ := g.State(token)
	if !reflect.DeepEqual(s, after) {
		t.Fatal("failed draw committed returns, reward or victory")
	}
	calls = 0
	g.Random = func(int) (int, error) {
		calls++
		if calls%2 == 1 {
			return 69, nil
		}
		return 70, nil
	}
	first, err := g.Execute(token, "atomic-reward-test", req)
	if err != nil {
		t.Fatal(err)
	}
	if first.State.LastResult.BattleRewards.Supplies["warm-can"] != 3 || first.State.LastResult.BattleRewards.Supplies["bouncy-treat"] != 3 || first.State.Inventory["warm-can"] != 4 || first.State.Inventory["bouncy-treat"] != 3 {
		t.Fatal("70/30 boundary or effective consumption incorrect")
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	g = service.New(store, g.Catalog)
	g.Random = func(int) (int, error) { t.Fatal("replay redrew rewards"); return 0, nil }
	replay, err := g.Execute(token, "atomic-reward-test", req)
	if err != nil || !replay.Replayed || !reflect.DeepEqual(first.State, replay.State) {
		t.Fatal("durable replay changed the receipt")
	}
	rejectUnchanged(t, g, token, req.Command)
}

func TestLegacyPrologueGetsSuppliesWithoutChangingItsOutcomeContract(t *testing.T) {
	g, token, _ := setup(t)
	s := toBattle(t, g, token)
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"})
	if s.LastResult.BattleRewards == nil || s.LastResult.BattleRewards.FirstClearBonus != 2 || s.LastResult.BattleRewards.PerfectBonus != 0 || !domain.Contains(s.Cats, "diandian") || s.Currencies["stamp"] != 2 {
		t.Fatal("legacy prologue result lost compatibility or rewards")
	}
}
