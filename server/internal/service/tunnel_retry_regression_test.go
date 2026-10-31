package service_test

import (
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func TestTunnelMainlineRetryPreservesProgressionAfterReload(t *testing.T) {
	g, token, path := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase, p.State.MapID, p.State.ChapterID = "home", "greenhouse", "greenhouse"
		p.State.Flags = append(p.State.Flags, "alley_rescued", "rescue_story_done", "chapter_2_started", "chapter_3_started", "greenhouse_fortified")
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	s := execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "rescue_intro_1"})
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	g.Random = func(max int) (int, error) { return max - 1, nil }
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "tunnel_false_kitten_trap"})
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "tunnel_false_kitten_trap", OptionID: "mark_a_safe_route"})
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "tunnel_valve_three"})
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "valve_three_event", OptionID: "answer_the_purr"})
	s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "tunnel_boss", ReturnPosition: &domain.WorldPoint{X: 1520, Y: 759}})
	for i := 0; i < 2; i++ {
		previous := *s.ActiveBattle
		if !previous.Mainline {
			t.Fatal("attempt lost its mainline identity")
		}
		s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: previous.ID, Outcome: "lost", Report: bossReport(3, false)})
		s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
		// Reopen the persisted store, as after an API restart.
		store, err := repository.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		g = service.New(store, g.Catalog)
		s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "tunnel_boss"})
		if !s.ActiveBattle.Mainline || s.ActiveBattle.ID == previous.ID || !reflect.DeepEqual(s.ActiveBattle.Modifiers, previous.Modifiers) {
			t.Fatal("retry did not retain mainline identity and difficulty in a new attempt")
		}
	}
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	if !domain.Contains(s.Flags, "tunnel_boss_cleared") {
		t.Fatal("retry victory did not clear the mainline boss")
	}
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Phase != "dialogue" || s.StoryNodeID != "rescue_intro_10" {
		t.Fatal("retry victory skipped the authored rescue story")
	}
}
