package service

import (
	"context"
	"encoding/json"
	"io"
	"stray-kitty/server/internal/domain"
	"strings"
	"time"
	"unicode/utf8"
)

func readExploreHint(raw string) (string, error) {
	var observation struct {
		Hint string `json:"hint"`
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if utf8.RuneCountInString(raw) > 2048 || decoder.Decode(&observation) != nil || decoder.Decode(new(any)) != io.EOF || !utf8.ValidString(observation.Hint) || strings.TrimSpace(observation.Hint) == "" || utf8.RuneCountInString(observation.Hint) > 240 {
		return "", domain.Fail("INVALID_ADVISOR_REQUEST", "只允许当前有效的本地提示文字，不接收地图目录、坐标或目标ID", 400)
	}
	return strings.TrimSpace(observation.Hint), nil
}

func exploreHintMap(id string) bool {
	return id == "alley" || id == "market" || id == "tunnel" || id == "warehouse"
}

// Only used to reject stale results. No flags, event IDs, inventory, catalog or
// internal target IDs from this fingerprint are sent to the model.
func (g *Game) exploreHintFingerprint(s domain.GameState) string {
	raw, _ := json.Marshal([]any{g.advisorJourneyProgress(s), s.DrawnEvents})
	return string(raw)
}

func (g *Game) adviseExploreHint(ctx context.Context, token string, input domain.AdvisorRequest) (domain.AdvisorResponse, error) {
	before, err := g.advisorSceneSnapshot(token, input)
	if err != nil {
		return domain.AdvisorResponse{}, err
	}
	if before.Phase != "explore" || !exploreHintMap(before.MapID) {
		return domain.AdvisorResponse{}, domain.Fail("INVALID_ADVISOR_REQUEST", "当前不是第一、二、四或五章的地图探索", 400)
	}
	hint, err := readExploreHint(input.Context)
	if err != nil {
		return domain.AdvisorResponse{}, err
	}
	fingerprint := g.exploreHintFingerprint(before)
	// Map eligibility and distance bands stay in the map. The model only sees
	// the sentence which the map has already approved for the current player.
	visible, _ := json.Marshal(map[string]string{"approvedHint": hint})
	input.Context = string(visible)
	input.Question = "将这句当前已核实的本地提示组织成一句简短、自然的阿策提示。"
	input.History = nil
	bounded, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	// Separate automatic-hint and manual-chat session slots; global concurrency
	// and daily budgets still apply to both. No retry or game command is issued.
	result := g.Advisor.Reply(bounded, Hash(token)+":explore_hint", input)
	if err := g.advisorSceneUnchanged(token, input.SceneKey, func(after domain.GameState) bool {
		return g.exploreHintFingerprint(after) == fingerprint
	}); err != nil {
		return domain.AdvisorResponse{}, err
	}
	return result, nil
}
