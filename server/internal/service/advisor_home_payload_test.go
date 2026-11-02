package service_test

import (
	"encoding/json"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"strings"
	"testing"
)

func TestHomeProviderReceivesCrossModuleKnowledgeWithoutInventedLiveBattleOrWholeStory(t *testing.T) {
	g, token, _ := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "home"
		p.State.Cats = []string{"miaomiao", "tuanzi", "diandian", "momo"}
		p.State.Flags = []string{"alley_rescued", "momo_joined", "chapter_4_started"}
		p.State.CompletedStages = []string{"l00_tutorial", "alley_rescue"}
		p.State.LastResult = domain.Result{StageID: "tunnel_boss", Outcome: "lost"}
		p.State.Txns = []domain.Txn{{PackID: "PRIVATE_TRANSACTION_SENTINEL"}}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	before, _ := g.State(token)
	progress := captureJourneyProgress(t, g, token)
	var knowledge struct {
		LiveBattle struct {
			Available bool `json:"available"`
		} `json:"liveBattle"`
		BattleRules []string `json:"battleRules"`
		Companions  []struct {
			Name string `json:"name"`
		} `json:"companions"`
		EventRules map[string]json.RawMessage `json:"eventRules"`
		HomeRules  []string                   `json:"homeRules"`
	}
	if json.Unmarshal(progress["homeKnowledge"], &knowledge) != nil || knowledge.LiveBattle.Available || len(knowledge.BattleRules) == 0 || len(knowledge.HomeRules) == 0 || len(knowledge.Companions) != 4 || len(knowledge.EventRules) == 0 {
		t.Fatalf("provider did not receive bounded cross-module home knowledge: %s", progress["homeKnowledge"])
	}
	raw, _ := json.Marshal(progress)
	for _, required := range []string{"夜视", "16.67%", "金枪鱼罐头", "只证明完成过这些关卡"} {
		if !strings.Contains(string(raw), required) {
			t.Errorf("real home provider projection is missing %s", required)
		}
	}
	for _, forbidden := range []string{"PRIVATE_TRANSACTION_SENTINEL", "影幕", "prologue_1", "finale_intro_9"} {
		if strings.Contains(string(raw), forbidden) {
			t.Errorf("provider saw private/future/whole-story data: %s", forbidden)
		}
	}
	after, _ := g.State(token)
	beforeJSON, _ := json.Marshal(before)
	afterJSON, _ := json.Marshal(after)
	if string(beforeJSON) != string(afterJSON) {
		t.Fatal("home explanation changed saved state")
	}
}
