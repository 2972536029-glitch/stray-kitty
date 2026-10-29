package service_test

import (
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
)

func chapter4Explore(t *testing.T) (*service.Game, string, domain.GameState) {
	t.Helper()
	g, token, _ := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "home"
		p.State.MapID = "greenhouse"
		p.State.ChapterID = "greenhouse"
		p.State.Flags = append(p.State.Flags, "alley_rescued", "rescue_story_done", "chapter_2_started", "chapter_3_started", "greenhouse_fortified")
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	s := execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "rescue_intro_1"})
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	if s.Phase != "explore" || s.MapID != "tunnel" || s.ChapterID != "rescue" {
		t.Fatalf("Chapter 4 entry did not open tunnel exploration: %+v", s)
	}
	return g, token, s
}

func TestChapter4DValveBattleAndPostBattleStory(t *testing.T) {
	g, token, s := chapter4Explore(t)
	rejectUnchanged(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "tunnel_valve_three"})
	rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "tunnel_boss"})
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "tunnel_false_kitten_trap"})
	if s.Phase != "event" || s.PendingEventID != "tunnel_false_kitten_trap" {
		t.Fatalf("D event not dispatched: %+v", s)
	}
	g.Random = func(max int) (int, error) { return max - 1, nil }
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "tunnel_false_kitten_trap", OptionID: "mark_a_safe_route"})
	if !domain.Contains(s.Flags, "tunnel_false_kitten_trap_found") {
		t.Fatal("D event did not unlock the route")
	}
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "tunnel_valve_three"})
	if s.Phase != "event" || s.PendingEventID != "valve_three_event" {
		t.Fatalf("F valve event not dispatched: %+v", s)
	}
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "valve_three_event", OptionID: "answer_the_purr"})
	if !domain.Contains(s.Flags, "valve_three_investigated") {
		t.Fatal("F investigation was not recorded")
	}
	s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "tunnel_boss", ReturnPosition: &domain.WorldPoint{X: 1520, Y: 759}})
	if s.Phase != "battle" || s.ActiveBattle.StageID != "tunnel_boss" {
		t.Fatalf("G did not start tunnel_boss: %+v", s)
	}
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	if !domain.Contains(s.Flags, "tunnel_boss_cleared") {
		t.Fatal("battle win did not record chapter completion")
	}
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Phase != "dialogue" || s.StoryNodeID != "rescue_intro_10" {
		t.Fatalf("battle did not enter authored post-battle story: %+v", s)
	}
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "rescue_intro_10"})
	if s.Phase != "home" || !domain.Contains(s.Flags, "tunnel_explored") || !domain.Contains(s.Flags, "cats_rescued_batch1") {
		t.Fatalf("post-battle story did not complete Chapter 4: %+v", s)
	}
}

func TestChapter4RandomZonesAndNodeEventsRespectProgression(t *testing.T) {
	g, token, _ := chapter4Explore(t)
	s := execute(t, g, token, domain.Command{Type: "CHECK_RANDOM_ZONE", ZoneID: "tunnel_random_west"})
	if s.Phase != "explore" {
		t.Fatal("random encounter interrupted the mandatory D investigation")
	}
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "tunnel_momo_marks"})
	if s.PendingEventID != "tunnel_momo_marks" {
		t.Fatalf("optional Momo event missing: %+v", s)
	}
	if _, err := g.Execute(token, "chapter4-r4", domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "CHECK_RANDOM_ZONE", ZoneID: "tunnel_random_lower"}}); err == nil {
		t.Fatal("unbound R4 was treated as a server random zone")
	}
}
