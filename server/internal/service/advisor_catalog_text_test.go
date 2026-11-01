package service

import (
	"encoding/json"
	"reflect"
	"stray-kitty/server/internal/domain"
	"strings"
	"testing"
)

func TestAdvisorOptionalHintValidityDoesNotBreakLegacyDisplay(t *testing.T) {
	for _, tc := range []struct {
		name  string
		value any
		limit int
		want  bool
	}{
		{"valid", " 当前公开解释 ", 120, true},
		{"missing/null", nil, 120, false},
		{"empty", " ", 120, false},
		{"object", map[string]string{"hint": "invalid"}, 120, false},
		{"number", 7, 120, false},
		{"line feed", "一行\n另一行", 120, false},
		{"carriage return", "一行\r另一行", 120, false},
		{"unicode separator", "一行\u2028另一行", 120, false},
		{"card bound", strings.Repeat("字", 120), 120, true},
		{"long card", strings.Repeat("字", 121), 120, false},
		{"option bound", strings.Repeat("字", 60), 60, true},
		{"long option", strings.Repeat("字", 61), 60, false},
		{"UTF16 bound", strings.Repeat("😀", 30), 60, true},
		{"UTF16 overflow", strings.Repeat("😀", 31), 60, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			raw, _ := json.Marshal(tc.value)
			got := advisorPublicHint(raw, tc.limit)
			if (got != "") != tc.want {
				t.Fatalf("unexpected optional hint: %q", got)
			}
			catalog, _ := json.Marshal(map[string]any{"events": []any{map[string]any{"id": "current", "text": "卡面保留", "advisorHint": tc.value, "options": []any{map[string]any{"id": "visible", "label": "可见行动", "advisorHint": tc.value}}}}, "story": []any{map[string]string{"id": "now", "text": "台词保留"}}})
			index := readAdvisorVisibleTexts(catalog)
			if index.Events["current"].Text != "卡面保留" || index.Events["current"].optionLabel("visible") != "可见行动" || index.Story["now"].Text != "台词保留" {
				t.Fatal("optional metadata broke ordinary display text")
			}
		})
	}
	if advisorPublicHint(nil, 120) != "" {
		t.Fatal("missing field must be omitted")
	}
}

func TestAdvisorHintProjectionUsesOnlyOpenCardAndVisibleOptions(t *testing.T) {
	texts := readAdvisorVisibleTexts([]byte(`{"events":[
	 {"id":"current","text":"眼前卡面","advisorHint":"当前公开解释","options":[
	  {"id":"normal","label":"当前行动","advisorHint":"可见行动说明","outcomes":{"crit":{"text":"SECRET_RESULT"}}},
	  {"id":"momo","label":"墨墨侦查","advisorHint":"HIDDEN_COMPANION_HINT"}]},
	 {"id":"future","advisorHint":"UNOPENED_CARD_HINT"}
	]}`))
	g := &Game{Catalog: domain.Catalog{Events: []domain.Event{
		{ID: "current", Title: "眼前事件", Maps: []string{"market"}, Options: []domain.EventOption{{ID: "normal"}, {ID: "momo", RequireCat: "momo"}}},
		{ID: "future", Title: "其他事件"},
	}}}
	s := domain.GameState{Phase: "event", MapID: "market", PendingEventID: "current", Cats: []string{"tuanzi"}, Inventory: map[string]int{}, Currencies: map[string]int{}}
	before, _ := json.Marshal(s)
	project := g.advisorJourneyProgressWithTexts(s, texts)
	event := project["currentEvent"].(map[string]any)
	options := event["options"].([]map[string]string)
	if event["advisorHint"] != "当前公开解释" || len(options) != 1 || options[0]["advisorHint"] != "可见行动说明" {
		t.Fatal("public explanation was not attached to the visible card/option")
	}
	raw, _ := json.Marshal(project)
	for _, forbidden := range []string{"HIDDEN_COMPANION_HINT", "UNOPENED_CARD_HINT", "SECRET_RESULT"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("private explanation leaked: %s", forbidden)
		}
	}
	s.Cats = append(s.Cats, "momo")
	withMomo := g.advisorJourneyProgressWithTexts(s, texts)["currentEvent"].(map[string]any)["options"].([]map[string]string)
	if len(withMomo) != 2 || withMomo[1]["advisorHint"] != "HIDDEN_COMPANION_HINT" {
		t.Fatal("newly visible companion option hint missing")
	}
	s.Cats = []string{"tuanzi"}
	after, _ := json.Marshal(s)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("hint projection mutated the game state")
	}
	s.Phase = "explore"
	out, _ := json.Marshal(g.advisorJourneyProgressWithTexts(s, texts))
	if strings.Contains(string(out), "advisorHint") || strings.Contains(string(out), "当前公开解释") {
		t.Fatal("stale card hint survived leaving the event")
	}
	s.Phase = "event"
	s.MapID = "alley"
	out, _ = json.Marshal(g.advisorJourneyProgressWithTexts(s, texts))
	if strings.Contains(string(out), "advisorHint") {
		t.Fatal("hint from another map leaked")
	}
	s.MapID = "market"
	legacy := readAdvisorVisibleTexts([]byte(`{"events":[{"id":"current","text":"卡面","options":[{"id":"normal","label":"行动"}]}]}`))
	s.Phase = "event"
	out, _ = json.Marshal(g.advisorJourneyProgressWithTexts(s, legacy))
	if strings.Contains(string(out), "advisorHint") {
		t.Fatal("legacy card should omit optional metadata")
	}
}
