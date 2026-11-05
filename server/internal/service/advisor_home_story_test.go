package service

import (
	"encoding/json"
	"reflect"
	"stray-kitty/server/internal/domain"
	"strings"
	"testing"
)

func TestHomeStorySummariesRequireEveryAuthoredCondition(t *testing.T) {
	if len(advisorHomeStories) != 5 {
		t.Fatal("the five reviewed home story summaries were not embedded")
	}
	for _, note := range advisorHomeStories {
		t.Run(note.ID, func(t *testing.T) {
			s := domain.GameState{Phase: "home", Flags: append([]string{}, note.RequiredFlags...), Cats: append([]string{}, note.RequiredCats...)}
			hasSummary := func(state domain.GameState) bool {
				for _, summary := range advisorKnownHomeStorySummaries(state) {
					if summary.ID == note.ID {
						if summary.Title != note.Title || summary.Text != note.Text {
							t.Fatal("authored summary text changed in projection")
						}
						return true
					}
				}
				return false
			}
			if !hasSummary(s) {
				t.Fatal("matching real story progress did not unlock its summary")
			}
			for i, flag := range note.RequiredFlags {
				missing := s
				missing.Flags = append(append([]string{}, s.Flags[:i]...), s.Flags[i+1:]...)
				if hasSummary(missing) {
					t.Errorf("summary exposed without required flag %s", flag)
				}
			}
			for i, cat := range note.RequiredCats {
				missing := s
				missing.Cats = append(append([]string{}, s.Cats[:i]...), s.Cats[i+1:]...)
				if hasSummary(missing) {
					t.Errorf("summary exposed without required companion %s", cat)
				}
			}
			for _, phase := range []string{"dialogue", "explore", "event", "preparation", "battle", "settlement"} {
				outside := s
				outside.Phase = phase
				if hasSummary(outside) {
					t.Errorf("home summary escaped into %s", phase)
				}
			}
			s.QACheckpointID = "manufactured-progress"
			if hasSummary(s) {
				t.Fatal("QA checkpoint was treated as autobiographical progress")
			}
		})
	}
}

func TestHomeStorySummariesIgnoreBattleTrialHistoryAndNeverExposeGates(t *testing.T) {
	s := domain.GameState{Phase: "home", Cats: []string{"diandian", "momo"},
		Flags:           []string{"alley_rescued", "market_cleared", "greenhouse_fortified", "finale_boss_victory"},
		CompletedStages: []string{"alley_rescue", "market_boss", "greenhouse_boss", "tunnel_boss", "finale_boss"},
		LastResult:      domain.Result{StageID: "finale_boss", Outcome: "won"}}
	if len(advisorKnownHomeStorySummaries(s)) != 0 {
		t.Fatal("battle trials unlocked unplayed story summaries")
	}
	for _, note := range advisorHomeStories {
		s.Flags = append(s.Flags, note.RequiredFlags...)
	}
	before, _ := json.Marshal(s)
	got := advisorKnownHomeStorySummaries(s)
	if len(got) != len(advisorHomeStories) {
		t.Fatal("completed mainline milestones lost a summary")
	}
	raw, _ := json.Marshal(got)
	var entries []map[string]any
	json.Unmarshal(raw, &entries)
	for _, entry := range entries {
		if len(entry) != 3 || entry["id"] == nil || entry["title"] == nil || entry["text"] == nil {
			t.Fatalf("summary must contain only id/title/text: %v", entry)
		}
	}
	for _, forbidden := range []string{"requiredFlags", "requiredCats", "sourceNodes", "sourceRule", "greenhouse_intro_6", "finale_intro_9"} {
		if strings.Contains(string(raw), forbidden) {
			t.Errorf("authoring metadata reached the model: %s", forbidden)
		}
	}
	after, _ := json.Marshal(s)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("story projection changed saved progress")
	}
}

func TestHomeStoryParserFailsClosedOnMissingConditions(t *testing.T) {
	for _, raw := range []string{
		`[{"id":"x","title":"标题","text":"文本","requiredFlags":[],"requiredCats":[]}]`,
		`[{"id":"x","title":"标题","text":"文本","requiredCats":[]}]`,
		`[{"id":"x","title":"标题","text":"文本","requiredFlags":["done"]}]`,
		`[{"id":"x","title":"标题","text":"文本","requiredFlags":[""],"requiredCats":[]}]`,
		`[{"id":"x","title":"标题","text":"文本","requiredFlags":["done"],"requiredCats":[""]}]`,
		`[{"id":"x","title":"标题","text":"文本","requiredFlags":["done"],"requiredCats":[]},{"id":"x","title":"另一个","text":"文本","requiredFlags":["later"],"requiredCats":[]}]`,
	} {
		if got := readAdvisorHomeStories([]byte(raw)); len(got) != 0 {
			t.Fatalf("invalid conditions were made visible: %s", raw)
		}
	}
}

func TestHomeGoalSeparatesRenovationFromBattleAndUsesCurrentClues(t *testing.T) {
	for _, tc := range []struct {
		name  string
		flags []string
		clue  int
		want  string
	}{
		{"fully decorated but defense pending", []string{"chapter_3_started", "momo_joined", "greenhouse_fortified_full"}, 0, "先完成花房保卫战"},
		{"defense won without decoration", []string{"greenhouse_fortified"}, 0, "开启第四章"},
		{"return to tunnel", []string{"greenhouse_fortified", "chapter_4_started"}, 0, "继续地下通道"},
		{"not enough clues", []string{"tunnel_explored", "cats_rescued_batch1"}, 2, "当前2条"},
		{"ready for warehouse", []string{"tunnel_explored", "cats_rescued_batch1"}, 3, "第五章入口"},
		{"return to warehouse", []string{"tunnel_explored", "cats_rescued_batch1", "finale_started"}, 3, "继续探索仓库"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := advisorHomeGoal(domain.GameState{Phase: "home", Flags: tc.flags, Inventory: map[string]int{"clue": tc.clue}})
			if !strings.Contains(got, tc.want) {
				t.Fatalf("wrong current home goal: %s", got)
			}
		})
	}
}
