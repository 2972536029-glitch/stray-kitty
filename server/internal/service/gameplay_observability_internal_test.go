package service

import (
	"encoding/json"
	"reflect"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/platform"
)

func TestGameplayHistoricalValuesCannotCreateMetricTags(t *testing.T) {
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	game := New(nil, catalog)
	untrusted := "player-99999,user:injected"
	tags := game.observedBattleTags(&domain.Attempt{StageID: untrusted, Modifiers: &domain.BattleModifiers{ShadowPressure: 888}})
	if !reflect.DeepEqual(tags, []string{"chapter:unknown", "difficulty:unknown"}) {
		t.Fatalf("unbounded battle tags: %v", tags)
	}
	if got := observedBattleOutcome(untrusted); got != "unknown" {
		t.Fatalf("unbounded outcome tag: %q", got)
	}
	if got := game.observedMap(untrusted); got != "unknown" {
		t.Fatalf("unbounded map tag: %q", got)
	}
	if event, option := game.observedEventOption("crate_event", untrusted); event != "crate_event" || option != "unknown" {
		t.Fatalf("unbounded option tags: %q %q", event, option)
	}
	if event, option := game.observedEventOption(untrusted, "search"); event != "unknown" || option != "unknown" {
		t.Fatalf("unbounded event tags: %q %q", event, option)
	}
	if game.observedFlags()[untrusted] || validStoryChoice("prologue_banter", untrusted) {
		t.Fatal("untrusted flag or choice accepted")
	}
}

func TestGameplayFlagRegistryKeepsCoreMilestones(t *testing.T) {
	var registry []string
	if err := json.Unmarshal(gameplayFlagsJSON, &registry); err != nil {
		t.Fatal(err)
	}
	seen := make(map[string]bool)
	for _, flag := range registry {
		if flag == "" || seen[flag] {
			t.Fatalf("invalid or duplicate registry flag: %q", flag)
		}
		seen[flag] = true
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	flags := New(nil, catalog).observedFlags()
	for _, flag := range []string{"l00_completed", "alley_rescued", "lost_poster_found", "sack_cat_freed", "momo_joined", "tuanzi_provided", "finale_boss_victory", "kingdom_founded"} {
		if !flags[flag] {
			t.Errorf("core milestone is missing from the tag registry: %s", flag)
		}
	}
}
