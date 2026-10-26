package service_test

import (
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func TestRainyAlleyFishClaimPersistsExactlyOnce(t *testing.T) {
	g, token, path := setup(t)
	finishStory(t, g, token)
	s := execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_fish_dry"})
	if s.Inventory["food"] != 1 || !domain.Contains(s.Flags, "alley_fish_collected") {
		t.Fatal("first fish claim did not grant and persist exactly one food")
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	restarted := service.New(store, g.Catalog)
	s = execute(t, restarted, token, domain.Command{Type: "INTERACT", InteractionID: "alley_fish_dry"})
	if s.Inventory["food"] != 1 {
		t.Fatalf("repeat fish claim granted food again: %d", s.Inventory["food"])
	}
}

func TestRainyAlleyZoneAttemptsArePersistentAndSingleUse(t *testing.T) {
	g, token, path := setup(t)
	finishStory(t, g, token)
	if g.RainyZoneChance != 550 {
		t.Fatalf("normal zone chance = %d, want 550", g.RainyZoneChance)
	}
	g.RainyZoneChance = 0
	s := execute(t, g, token, domain.Command{Type: "CHECK_RANDOM_ZONE", ZoneID: "rainy_random_west"})
	if s.Phase != "explore" || !domain.Contains(s.Flags, "attempted_rainy_random_west") {
		t.Fatal("failed probability did not consume the west-zone attempt")
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	g = service.New(store, g.Catalog)
	g.Random = func(int) (int, error) { t.Fatal("duplicate zone request rolled again"); return 0, nil }
	s = execute(t, g, token, domain.Command{Type: "CHECK_RANDOM_ZONE", ZoneID: "rainy_random_west"})
	if s.Phase != "explore" || s.PendingEventID != "" {
		t.Fatal("duplicate west-zone request changed encounter state")
	}

	g.RainyZoneChance = 1000
	g.Random = func(int) (int, error) { return 0, nil }
	s = execute(t, g, token, domain.Command{Type: "CHECK_RANDOM_ZONE", ZoneID: "rainy_random_central"})
	if s.Phase != "event" || s.PendingEventID != "rats_grain_event" || !domain.Contains(s.Flags, "attempted_rainy_random_central") {
		t.Fatalf("controlled zone trigger did not use existing event pipeline: phase=%s event=%s", s.Phase, s.PendingEventID)
	}
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: s.PendingEventID, OptionID: "negotiate_share"})
	if s.Phase != "explore" || s.EventState == nil || s.EventState.LastResolution.Dice != [2]int{1, 1} {
		t.Fatal("zone event did not retain the original 2d6 resolution")
	}
}

func TestRainyAlleyCrateGateOpensOnlyAfterRescueWin(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	s := execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
	if s.Phase != "event" || s.PendingEventID != "crate_event" || domain.Contains(s.Flags, "alley_rescued") {
		t.Fatal("crate did not remain a mandatory event gate before rescue")
	}
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"})
	s = finishStory(t, g, token)
	s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"})
	if !domain.Contains(s.Flags, "alley_rescued") {
		t.Fatal("crate gate rescue flag was not set by the Chapter 1 battle win")
	}
}

func TestRainyAlleyBlanketUsesExistingEventAndReturnsToExplore(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	s := execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_blanket_stack"})
	if s.Phase != "event" || s.PendingEventID != "moving_blanket_event" {
		t.Fatal("blanket did not open the registered existing event")
	}
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "moving_blanket_event", OptionID: "haul_together"})
	if s.Phase != "explore" || !domain.Contains(s.Flags, "blanket_lost") {
		t.Fatal("blanket result did not persist and return to exploration")
	}
}

func TestRainyAlleyReportMoveDoesNotDoubleTrigger(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	g.Random = func(int) (int, error) { t.Fatal("alley REPORT_MOVE invoked random selection"); return 0, nil }
	for i := 0; i < 8; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase != "explore" || s.PendingEventID != "" {
			t.Fatal("alley distance report generated an extra encounter")
		}
	}
}
