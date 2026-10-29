package service_test

import (
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func warehouseQA(t *testing.T, checkpoint string) (*service.Game, string, domain.GameState) {
	t.Helper()
	g, token, _ := setup(t)
	g.QAVictoryEnabled = true
	return g, token, execute(t, g, token, domain.Command{Type: "QA_CHECKPOINT", CheckpointID: checkpoint})
}
func warehouseE(id, floor string, x, y float64) domain.Command {
	return domain.Command{Type: "INTERACT", InteractionID: id, Layer: floor, Position: &domain.WorldPoint{X: x, Y: y}}
}

func TestWarehouseMainlineLightsRetryAndExit(t *testing.T) {
	g, token, s := warehouseQA(t, "finale.story")
	for i := 0; i < 4; i++ {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	if s.Phase != "explore" || s.MapID != "warehouse" {
		t.Fatalf("intro did not enter warehouse: %+v", s)
	}
	rejectUnchanged(t, g, token, warehouseE("entry_lamp", "L1", 316, 582))
	rejectUnchanged(t, g, token, warehouseE("bunker_exit", "L0", 1310, 126))
	rejectUnchanged(t, g, token, domain.Command{Type: "START_STORY", NodeID: "finale_intro_7"})
	rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "finale_boss"})
	s = execute(t, g, token, warehouseE("entry_lamp", "L0", 316, 582))
	s = execute(t, g, token, warehouseE("secondary_lamp", "L0", 1420, 775))
	s = execute(t, g, token, warehouseE("central_spotlight", "L0", 833, 557))
	if !domain.Contains(s.Flags, "entry_lamp") || !domain.Contains(s.Flags, "secondary_lamp") || !domain.Contains(s.Flags, "central_spotlight") {
		t.Fatal("authored light states missing")
	}
	for _, lamp := range []struct {
		id   string
		x, y float64
	}{{"entry_lamp", 316, 582}, {"central_spotlight", 833, 557}, {"secondary_lamp", 1420, 775}} {
		s = execute(t, g, token, warehouseE(lamp.id, "L0", lamp.x, lamp.y))
		if domain.Contains(s.Flags, lamp.id) {
			t.Fatalf("%s did not toggle off", lamp.id)
		}
		s = execute(t, g, token, warehouseE(lamp.id, "L0", lamp.x, lamp.y))
		if !domain.Contains(s.Flags, lamp.id) {
			t.Fatalf("%s did not toggle back on", lamp.id)
		}
	}
	// No optional fixed event is required to enter the mandatory boss.
	s = execute(t, g, token, warehouseE("finale_boss", "L0", 1302, 294))
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	if s.Phase != "preparation" {
		t.Fatal("boss dialogue did not open preparation")
	}
	s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "finale_boss"})
	if !s.ActiveBattle.Mainline {
		t.Fatal("warehouse battle incorrectly became a home trial")
	}
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "lost", Report: finaleReport(3, false)})
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.Phase != "preparation" || domain.Contains(s.Flags, "finale_boss_victory") {
		t.Fatal("loss unlocked exit or lost retry")
	}
	s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "finale_boss"})
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: finaleReport(0, true)})
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	if s.StoryNodeID != "finale_intro_6" {
		t.Fatal("missing post-win story")
	}
	s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	if s.Phase != "explore" || s.MapID != "warehouse" || !domain.Contains(s.Flags, "finale_boss_victory") || domain.Contains(s.Flags, "finale_completed") {
		t.Fatal("victory did not return to the gated warehouse exit")
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "START_STORY", NodeID: "finale_intro_7"})
	s = execute(t, g, token, warehouseE("bunker_exit", "L0", 1310, 126))
	for i := 0; i < 3; i++ {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	if s.Phase != "home" || !domain.Contains(s.Flags, "kingdom_founded") {
		t.Fatal("exit did not finish the original ending")
	}
}

func TestWarehouseOptionalFailureAndZoneReentry(t *testing.T) {
	g, token, _ := warehouseQA(t, "finale.explore")
	g.Random = func(int) (int, error) { return 0, nil }
	for _, point := range []struct {
		id   string
		x, y float64
	}{{"warehouse_lookout", 316, 287}, {"warehouse_light_crate", 574, 292}} {
		rejectUnchanged(t, g, token, warehouseE(point.id, "L0", point.x, point.y))
		s := execute(t, g, token, warehouseE(point.id, "L1", point.x, point.y))
		option := ""
		for _, event := range g.Catalog.Events {
			if event.ID == point.id {
				option = event.Options[0].ID
			}
		}
		s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: point.id, OptionID: option})
		for i := 0; s.Phase == "dialogue" && i < 4; i++ {
			s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
		}
		if s.Phase != "explore" || s.MapID != "warehouse" || !domain.Contains(s.DrawnEvents, "node:"+point.id) {
			t.Fatal("optional failure left exploration or lost one-shot record")
		}
		rejectUnchanged(t, g, token, warehouseE(point.id, "L1", point.x, point.y))
	}
	zone := domain.Command{Type: "CHECK_RANDOM_ZONE", ZoneID: "R1", Layer: "L1", Position: &domain.WorldPoint{X: 657, Y: 765}}
	rejectUnchanged(t, g, token, zone)
	zone.Layer = "L0"
	// A pre-fix save may contain attempts even though no card was drawn.
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.DrawnEvents = domain.Add(p.State.DrawnEvents, "zone:warehouse:R1")
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	rolls := 0
	g.Random = func(max int) (int, error) { rolls++; return max - 1, nil }
	s := execute(t, g, token, zone)
	first := rolls
	s = execute(t, g, token, zone)
	if first == 0 || rolls <= first || s.Phase != "explore" {
		t.Fatal("missed or legacy zone attempt prevented a later entry roll")
	}
	// All four spots use the six authored cards, persisted without replacement.
	g.Random = func(int) (int, error) { return 0, nil }
	pool := map[string]bool{"fake_meow_event": true, "moving_shelves_event": true, "warm_nest_event": true, "sack_row_event": true, "shadow_captain_event": true, "box_haul_event": true}
	seen := map[string]bool{}
	zones := []domain.Command{
		zone,
		{Type: "CHECK_RANDOM_ZONE", ZoneID: "R2", Layer: "L0", Position: &domain.WorldPoint{X: 266, Y: 404}},
		{Type: "CHECK_RANDOM_ZONE", ZoneID: "R3", Layer: "L0", Position: &domain.WorldPoint{X: 1364, Y: 566}},
		{Type: "CHECK_RANDOM_ZONE", ZoneID: "R4", Layer: "L0", Position: &domain.WorldPoint{X: 1094, Y: 402}},
	}
	for i := 0; i < len(pool); i++ {
		s = execute(t, g, token, zones[i%len(zones)])
		id := s.PendingEventID
		if s.Phase != "event" || !pool[id] || seen[id] {
			t.Fatalf("missing, repeated or unexpected random card: %s (%s)", id, s.Phase)
		}
		seen[id] = true
		saved, err := g.State(token)
		if err != nil || saved.PendingEventID != id || !domain.Contains(saved.DrawnEvents, "warehouse:"+id) {
			t.Fatalf("random card was not saved: %s, %v", id, err)
		}
		option := ""
		for _, event := range g.Catalog.Events {
			if event.ID == id {
				option = event.Options[0].ID
			}
		}
		s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: id, OptionID: option})
		for j := 0; s.Phase == "dialogue" && j < 20; j++ {
			s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
		}
		if s.Phase != "explore" || s.MapID != "warehouse" {
			t.Fatalf("random event %s did not return to warehouse exploration", id)
		}
	}
	s = execute(t, g, token, zone)
	if s.Phase != "explore" || len(seen) != len(pool) {
		t.Fatal("exhausted one-time deck repeated a card")
	}
}
