package service_test

import (
	"errors"
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func TestFourEventTiersPersistAndAllLeadToRescue(t *testing.T) {
	for _, tc := range []struct {
		tier               string
		dice               [2]int
		material, pressure int
	}{
		{"crit", [2]int{6, 6}, 4, -1}, {"success", [2]int{4, 5}, 3, 0}, {"partial", [2]int{3, 4}, 2, 1}, {"fail", [2]int{1, 1}, 0, 1},
	} {
		t.Run(tc.tier, func(t *testing.T) {
			g, token, path := setup(t)
			finishStory(t, g, token)
			before := execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
			rolls := 0
			g.Random = func(int) (int, error) {
				if rolls >= 2 {
					t.Fatal("event rolled again")
				}
				value := tc.dice[rolls] - 1
				rolls++
				return value, nil
			}
			request := domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"}}
			result, err := g.Execute(token, "event-once-only", request)
			if err != nil {
				t.Fatal(err)
			}
			s := result.State
			if rolls != 2 || s.EventState.LastResolution.Dice != tc.dice || s.EventState.LastResolution.Tier != tc.tier || s.Inventory["material"] != tc.material {
				t.Fatal("wrong dice, tier or resource grant")
			}
			store, err := repository.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			restarted := service.New(store, g.Catalog)
			restarted.Random = func(int) (int, error) { t.Fatal("durable replay re-rolled dice"); return 0, nil }
			replay, err := restarted.Execute(token, "event-once-only", request)
			if err != nil || !replay.Replayed || !reflect.DeepEqual(replay.State, s) {
				t.Fatalf("event replay after restart failed: %v", err)
			}
			if tc.tier == "fail" {
				if s.Phase != "dialogue" || s.StoryNodeID != "event_forced_chase" || !domain.Contains(s.Flags, "emergency_withdrawal") {
					t.Fatal("failure did not advance the situation")
				}
				if _, err = g.Execute(token, "skip-withdrawal", domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"}}); err == nil {
					t.Fatal("withdrawal story was skipped")
				}
			}
			finishStory(t, g, token)
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
			if s.ActiveBattle.Modifiers == nil || s.ActiveBattle.Modifiers.ShadowPressure != tc.pressure {
				t.Fatal("battle did not receive event pressure")
			}
			// 失败重试沿用后果，不重掷；胜利后清除待应用压力。
			execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "lost"})
			execute(t, g, token, domain.Command{Type: "CONTINUE"})
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
			if s.ActiveBattle.Modifiers.ShadowPressure != tc.pressure {
				t.Fatal("retry lost event pressure")
			}
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"})
			if !domain.Contains(s.Cats, "diandian") || s.Currencies["stamp"] != 2 || s.EventState.PendingModifiers.ShadowPressure != 0 {
				t.Fatal("mainline rescue or modifier cleanup failed")
			}
		})
	}
}

func TestSecondDieErrorDoesNotPartiallyCommit(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	before := execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
	count := 0
	g.Random = func(int) (int, error) {
		count++
		if count == 2 {
			return 0, errors.New("random source unavailable")
		}
		return 5, nil
	}
	_, err := g.Execute(token, "random-source-error", domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"}})
	if err == nil {
		t.Fatal("random error accepted")
	}
	after, _ := g.State(token)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("partially rolled event changed the save")
	}
}

func TestRewardChannelsAndDetourStory(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
	// 参考卡的局势配上全部资源通道，验证未来卡片不需要 UI 自行发奖。
	outcome := g.Catalog.Events[0].Options[1].Outcomes["partial"]
	outcome.Reward = &domain.EventReward{Fish: 3, Stamps: 1, Clue: 2, Material: 1}
	g.Catalog.Events[0].Options[1].Outcomes["partial"] = outcome
	g.Random = func(int) (int, error) { return 2, nil }
	s := execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "comfort"})
	if s.Phase != "dialogue" || s.StoryNodeID != "event_detour" || s.Inventory["food"] != 3 || s.Currencies["stamp"] != 1 || s.Inventory["clue"] != 2 || s.Inventory["material"] != 1 || !domain.Contains(s.Flags, "diandian_trust") {
		t.Fatal("outcome channels not applied together")
	}
	s = finishStory(t, g, token)
	if s.Phase != "preparation" || !domain.Contains(s.Flags, "detour_completed") {
		t.Fatal("detour did not reconnect to preparation")
	}
}

func TestLegacySingleDiePreparationStillStartsBattle(t *testing.T) {
	g, token, path := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "preparation"
		p.State.Flags = domain.Add(p.State.Flags, "event_success")
		p.State.LastResult = domain.Result{Message: "旧存档已完成单骰判定", Roll: 6}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	s := execute(t, service.New(store, g.Catalog), token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
	if s.Phase != "battle" || s.EventState != nil || s.ActiveBattle.Modifiers != nil || !domain.Contains(s.Flags, "event_success") {
		t.Fatal("legacy preparation changed or failed")
	}
}
