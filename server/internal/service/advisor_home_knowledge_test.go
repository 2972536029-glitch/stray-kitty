package service

import (
	"encoding/json"
	"reflect"
	"stray-kitty/server/internal/domain"
	"strings"
	"testing"
)

func TestHomeAdvisorKnowledgeFiltersCatalogAndNeverSerializesPrivateHistory(t *testing.T) {
	texts := readAdvisorVisibleTexts([]byte(`{
	 "cats":[{"id":"tuanzi","name":"团子","description":"公开伙伴档案","skill":"寻找物资"},{"id":"momo","name":"UNOWNED_CAT_NAME","skill":"SECRET_SKILL"}],
	 "stages":[{"id":"alley_rescue","name":"已完成守护"},{"id":"finale_boss","name":"UNFINISHED_STAGE_TITLE"}],
	 "story":[{"id":"future","text":"UNREVEALED_STORY"}]
	}`))
	g := &Game{Catalog: domain.Catalog{
		Stages:    []domain.Stage{{ID: "alley_rescue"}, {ID: "finale_boss"}},
		Events:    []domain.Event{{ID: "current", Options: []domain.EventOption{{ID: "normal", Outcomes: map[string]domain.EventOutcome{"fail": {Reward: &domain.EventReward{Clue: 1}}}}}}},
		Furniture: []domain.Furniture{{ID: "bowl", Name: "公开家具"}, {ID: "locked", Name: "LOCKED_PRODUCT"}},
		Products:  []domain.Product{{FurnitureID: "bowl", Price: 2, CurrencyID: "stamp", Status: "available"}, {FurnitureID: "locked", Price: 3, CurrencyID: "stamp", Status: "available", RequiredFlag: "later"}},
		Pools:     []domain.Pool{{ID: "open", Name: "公开包裹", Cost: 1, PityEvery: 3, DuplicateMaterial: 2, Entries: []domain.Entry{{FurnitureID: "SECRET_RANDOM_ENTRY", Weight: 500}}}, {ID: "later", Name: "LOCKED_POOL", Cost: 1, PityEvery: 3, RequiredFlag: "later"}},
	}}
	s := domain.GameState{Phase: "home", Cats: []string{"tuanzi"}, Flags: []string{"alley_rescued", "future_mystery_flag"}, CompletedStages: []string{"alley_rescue", "unknown-old-stage"}, Inventory: map[string]int{"material": 2}, Currencies: map[string]int{"stamp": 3}, Furniture: []string{"bowl"}, LastResult: domain.Result{StageID: "alley_rescue", Outcome: "won"}, Txns: []domain.Txn{{PackID: "PRIVATE_TXN"}}, Lottery: &domain.LotteryState{History: []domain.ParcelDraw{{FurnitureID: "PRIVATE_HISTORY"}}}}
	before, _ := json.Marshal([]any{s, g.Catalog})
	knowledge := g.advisorHomeKnowledge(s, texts)
	raw, _ := json.Marshal(knowledge)
	for _, required := range []string{"公开伙伴档案", "寻找物资", "已完成守护", "公开家具", "公开包裹", "16.67%", "完整已读台词"} {
		if !strings.Contains(string(raw), required) {
			t.Errorf("missing public home knowledge: %s", required)
		}
	}
	for _, forbidden := range []string{"UNOWNED_CAT_NAME", "SECRET_SKILL", "UNFINISHED_STAGE_TITLE", "UNREVEALED_STORY", "PRIVATE_TXN", "PRIVATE_HISTORY", "SECRET_RANDOM_ENTRY", "LOCKED_POOL", "LOCKED_PRODUCT", "future_mystery_flag", "unknown-old-stage"} {
		if strings.Contains(string(raw), forbidden) {
			t.Errorf("home index exposed unavailable/private data: %s", forbidden)
		}
	}
	if knowledge["liveBattle"].(map[string]any)["available"] != false {
		t.Fatal("home must not advertise live combat facts")
	}
	after, _ := json.Marshal([]any{s, g.Catalog})
	if !reflect.DeepEqual(before, after) {
		t.Fatal("knowledge projection modified state or gameplay content")
	}
}

func TestHomeAdvisorDoesNotRevealLaterCompanionAbilitiesFromChapterStartFlags(t *testing.T) {
	s := domain.GameState{Phase: "home", Cats: []string{"momo"}, Flags: []string{"momo_joined", "chapter_4_started", "finale_started"}}
	raw, _ := json.Marshal(advisorKnownBattleAbilities(s, "momo"))
	if !strings.Contains(string(raw), "巡光护行") || strings.Contains(string(raw), "夜视") || strings.Contains(string(raw), "影幕") {
		t.Fatal("chapter start flags revealed an unexperienced awakening")
	}
	// A recorded loss also proves the player has already seen that battle's rules.
	s.LastResult = domain.Result{StageID: "tunnel_boss", Outcome: "lost"}
	raw, _ = json.Marshal(advisorKnownBattleAbilities(s, "momo"))
	if !strings.Contains(string(raw), "夜视") || strings.Contains(string(raw), "影幕") {
		t.Fatal("experienced tunnel mechanic missing or future finale mechanic leaked")
	}
	s.CompletedStages = []string{"tunnel_boss", "finale_boss"}
	raw, _ = json.Marshal(advisorKnownBattleAbilities(s, "momo"))
	if !strings.Contains(string(raw), "影幕") || !strings.Contains(string(raw), "已到场援军") {
		t.Fatal("completed finale's public ability was not available at home")
	}
}

func TestHomeKnowledgeIsOnlyAttachedToHomeAndSurvivesCompletedRenovations(t *testing.T) {
	g := &Game{}
	for _, phase := range []string{"dialogue", "explore", "event", "preparation", "battle", "settlement", "home"} {
		s := domain.GameState{Phase: phase, Flags: []string{"kingdom_founded"}}
		progress := g.advisorJourneyProgressWithTexts(s, advisorDisplayTexts{})
		_, exists := progress["homeKnowledge"]
		if exists != (phase == "home") {
			t.Fatalf("home knowledge scope mismatch in %s", phase)
		}
	}
}

func TestHomeEventProbabilitiesTrackGameRuleAndDoNotGuaranteeMissingFailureRewards(t *testing.T) {
	g := &Game{Catalog: domain.Catalog{Events: []domain.Event{{Options: []domain.EventOption{{Outcomes: map[string]domain.EventOutcome{"fail": {Text: "无资源"}}}}}}}}
	rules := g.advisorHomeEventRules()
	probabilities := rules["tierProbabilities"].(map[string]string)
	if !reflect.DeepEqual(probabilities, map[string]string{"crit": "2.78%", "success": "25.00%", "partial": "55.56%", "fail": "16.67%"}) {
		t.Fatalf("probabilities no longer follow actual EventTier: %v", probabilities)
	}
	ranges := rules["pointRanges"].(map[string]advisorEventPointRange)
	wantRanges := map[string]advisorEventPointRange{
		"crit":    {Min: 12, Max: 12, Sums: []int{12}, Probability: "2.78%"},
		"success": {Min: 9, Max: 11, Sums: []int{9, 10, 11}, Probability: "25.00%"},
		"partial": {Min: 5, Max: 8, Sums: []int{5, 6, 7, 8}, Probability: "55.56%"},
		"fail":    {Min: 2, Max: 4, Sums: []int{2, 3, 4}, Probability: "16.67%"},
	}
	if !reflect.DeepEqual(ranges, wantRanges) {
		t.Fatalf("point ranges must be derived from actual EventTier, especially crit=12 and fail=2–4: %+v", ranges)
	}
	if strings.Contains(rules["failure"].(string), "保底1") {
		t.Fatal("knowledge promised a reward not provided by every current outcome")
	}
}

func TestHomeBattleReferencesUseOnlyExperiencedStagesAndActualStaticSkillFields(t *testing.T) {
	g := &Game{Catalog: domain.Catalog{Stages: []domain.Stage{{ID: "l00_tutorial"}, {ID: "alley_boss"}, {ID: "tunnel_boss"}, {ID: "finale_boss"}}}}
	s := domain.GameState{Phase: "home", CompletedStages: []string{"l00_tutorial", "alley_rescue"}, Flags: []string{"momo_joined", "chapter_4_started", "finale_started"}}
	refs := g.advisorKnownBattleReferences(s)
	if len(refs) != 2 || refs[0].StageID != "l00_tutorial" || refs[1].StageID != "alley_boss" {
		t.Fatalf("unexperienced chapter reference leaked or rescue alias was lost: %+v", refs)
	}
	if !refs[0].ReferenceOnly || refs[0].PublicRules.MaxCats != 2 || len(refs[0].Cats) != 2 {
		t.Fatal("actual tutorial rules were not projected as static reference")
	}
	s.LastResult = domain.Result{StageID: "tunnel_boss", Outcome: "lost"}
	refs = g.advisorKnownBattleReferences(s)
	if len(refs) != 3 || refs[2].StageID != "tunnel_boss" {
		t.Fatal("recorded failed attempt did not unlock its already-seen public rules")
	}
	var found bool
	for _, cat := range refs[2].Cats {
		if cat.ID == "momo" {
			found = cat.Skill.NightVision != nil && *cat.Skill.NightVision == 10 && cat.Skill.Shield != nil && *cat.Skill.Shield == 45 && cat.Skill.Duration != nil && *cat.Skill.Duration == 8
		}
	}
	if !found {
		t.Fatal("static Momo skill fields were lost or confused with live combat state")
	}
}

func TestHomeBattleReferenceProjectionDoesNotPassThroughUnknownGeneratorFields(t *testing.T) {
	parsed := readAdvisorBattleReference([]byte(`[{"stageId":"tunnel_boss","referenceOnly":true,"name":"公开关卡","waves":["SECRET_SPAWN"],"cats":[{"id":"momo","name":"墨墨","initial":{"hidden":"SECRET_POSITION"},"skill":{"name":"公开技能","nextAwakening":"SECRET_ABILITY"}}]}]`))
	raw, _ := json.Marshal(parsed)
	for _, forbidden := range []string{"SECRET_SPAWN", "SECRET_POSITION", "SECRET_ABILITY"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("nonwhitelisted reference data reached projection: %s", forbidden)
		}
	}
}
