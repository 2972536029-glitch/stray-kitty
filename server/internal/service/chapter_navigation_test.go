package service_test

import (
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func TestExploreRoutesClearStaleStoryAndTerminalBattle(t *testing.T) {
	for _, route := range []struct{ mapID, chapter string }{{"alley", "alley"}, {"market", "market"}, {"tunnel", "rescue"}} {
		t.Run(route.mapID, func(t *testing.T) {
			g, token, _ := setup(t)
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Phase = "home"
				p.State.ChapterID = "finale"
				p.State.MapID = "greenhouse"
				p.State.StoryNodeID = "finale_intro_1"
				p.State.Flags = []string{"alley_rescued", "lost_poster_found", "rescue_story_done", "chapter_2_started", "greenhouse_fortified"}
				p.State.ActiveBattle = &domain.Attempt{ID: "old-terminal-battle", StageID: "finale_boss", Status: "won"}
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			s := execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: route.mapID})
			if s.Phase != "explore" || s.MapID != route.mapID || s.ChapterID != route.chapter || s.StoryNodeID != "" || s.ActiveBattle != nil || s.PendingEventID != "" {
				t.Fatalf("inconsistent exploration route: %+v", s)
			}
			if route.mapID == "market" {
				rejectUnchanged(t, g, token, domain.Command{Type: "GO_HOME"})
				return
			}
			s = execute(t, g, token, domain.Command{Type: "GO_HOME"})
			if !domain.Contains(s.Flags, "greenhouse_fortified") {
				t.Fatal("return home erased progression")
			}
		})
	}
}

func TestUnavailableExploreMapsRejectWithoutChangingState(t *testing.T) {
	g, token, _ := setup(t)
	for _, id := range []string{"unknown", "greenhouse", "warehouse", "__proto__"} {
		rejectUnchanged(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: id})
	}
}

func TestSharedSituationReturnsToOriginAndKeepsMissionPreparation(t *testing.T) {
	for _, entry := range []struct{ mapID, eventID, phase string }{{"alley", "moving_sack_event", "explore"}, {"market", "dark_meow_event", "explore"}, {"alley", "crate_event", "preparation"}, {"market", "crow_intel_event", "preparation"}} {
		t.Run(entry.mapID+entry.eventID, func(t *testing.T) {
			g, token, _ := setup(t)
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Phase = "dialogue"
				p.State.MapID = entry.mapID
				p.State.StoryNodeID = "event_forced_chase"
				p.State.EventState = &domain.EventState{LastResolution: domain.EventResolution{EventID: entry.eventID}}
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			s := execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "event_forced_chase"})
			if s.Phase != entry.phase || s.MapID != entry.mapID || s.ChapterID != entry.mapID || s.ActiveBattle != nil {
				t.Fatalf("situation lost originating route: %+v", s)
			}
		})
	}
}

func TestRandomFailureSituationCannotStrandExplorationBeforeMission(t *testing.T) {
	for _, entry := range []struct{ mapID, eventID, optionID string }{
		{"alley", "moving_sack_event", "rush_untie"},
		{"market", "dark_meow_event", "follow_voice"},
	} {
		t.Run(entry.eventID, func(t *testing.T) {
			g, token, _ := setup(t) // Random always returns 0: both dice are 1.
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Phase = "event"
				p.State.MapID = entry.mapID
				p.State.ChapterID = entry.mapID
				p.State.StoryNodeID = ""
				p.State.PendingEventID = entry.eventID
				p.State.PendingEventSource = "random"
				p.State.Cats = []string{"miaomiao", "tuanzi"}
				p.State.Flags = nil
				p.State.DrawnEvents = []string{entry.mapID + ":" + entry.eventID}
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			s := execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: entry.eventID, OptionID: entry.optionID})
			if s.EventState == nil || s.EventState.LastResolution.Tier != "fail" || s.EventState.LastResolution.Dice != [2]int{1, 1} || s.Phase != "dialogue" {
				t.Fatalf("expected real failed dice resolution and authored situation dialogue: %+v", s)
			}
			s = finishStory(t, g, token)
			if s.Phase != "explore" || s.MapID != entry.mapID || s.ChapterID != entry.mapID || s.StoryNodeID != "" || s.ActiveBattle != nil || s.ExploreDistance >= 0 {
				t.Fatalf("random failure stranded exploration: %+v", s)
			}
			if domain.Contains(s.DrawnEvents, "node:crate_event") || !domain.Contains(s.DrawnEvents, entry.mapID+":"+entry.eventID) {
				t.Fatalf("random failure fabricated mission discovery: %v", s.DrawnEvents)
			}
			if entry.mapID == "market" {
				s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "market_crow_stall", Layer: "L0", Position: &domain.WorldPoint{X: 910, Y: 245}})
				if s.Phase != "event" || s.PendingEventID != "crow_intel_event" {
					t.Fatal("Market's authored clue interaction is inaccessible after random failure")
				}
				return
			}
			// The original mission gates remain intact; the escape is exploration,
			// not an unearned battle or Home unlock.
			rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
			rejectUnchanged(t, g, token, domain.Command{Type: "GO_HOME"})
			execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
			execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"})
			s = finishStory(t, g, token)
			if s.Phase != "preparation" || !domain.Contains(s.DrawnEvents, "node:crate_event") {
				t.Fatal("the real crate mission no longer reaches rescue preparation")
			}
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
			if s.Phase != "battle" || s.ActiveBattle == nil || s.ActiveBattle.StageID != "alley_rescue" {
				t.Fatal("rescue battle is inaccessible after discovering the real crate")
			}
		})
	}
}
