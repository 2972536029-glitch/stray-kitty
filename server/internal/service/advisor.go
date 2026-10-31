package service

import (
	"context"
	"encoding/json"
	"stray-kitty/server/internal/domain"
	"strings"
	"unicode/utf8"
)

func validateAdvisor(input domain.AdvisorRequest) error {
	validText := func(text string, limit int) bool {
		return utf8.ValidString(text) && strings.TrimSpace(text) != "" && utf8.RuneCountInString(text) <= limit
	}
	if !validText(input.Question, 500) || !validText(input.Context, 24000) || len(input.History) > 6 {
		return domain.Fail("INVALID_ADVISOR_REQUEST", "军师请求内容为空或超过长度限制", 400)
	}
	switch input.Scope {
	case "", "battle":
		if !validText(input.AttemptID, 128) {
			return domain.Fail("INVALID_ADVISOR_REQUEST", "军师请求缺少有效战斗场次", 400)
		}
		switch input.StageID {
		case "l00_tutorial", "alley_rescue", "alley_boss", "market_boss", "greenhouse_boss", "tunnel_boss", "finale_boss":
		default:
			return domain.Fail("INVALID_ADVISOR_REQUEST", "军师不支持这个关卡", 400)
		}
	case "journey":
		if !validText(input.SceneKey, 1024) || input.ExpectedRevision == nil || *input.ExpectedRevision < 0 || input.AttemptID != "" || input.StageID != "" {
			return domain.Fail("INVALID_ADVISOR_REQUEST", "旅程问答需要有效的当前场景和进度版本", 400)
		}
	default:
		return domain.Fail("INVALID_ADVISOR_REQUEST", "军师请求场景无效", 400)
	}
	var snapshot map[string]json.RawMessage
	if json.Unmarshal([]byte(input.Context), &snapshot) != nil || snapshot == nil {
		return domain.Fail("INVALID_ADVISOR_REQUEST", "当前可见信息必须为 JSON 对象", 400)
	}
	for _, message := range input.History {
		if (message.Role != "user" && message.Role != "assistant") || !validText(message.Content, 1200) {
			return domain.Fail("INVALID_ADVISOR_REQUEST", "军师历史消息格式或长度无效", 400)
		}
	}
	return nil
}

func (g *Game) advisorAttempt(token string, input domain.AdvisorRequest) error {
	state, err := g.State(token)
	if err != nil {
		return err
	}
	attempt := state.ActiveBattle
	if state.Phase != "battle" || attempt == nil || attempt.Status != "active" || attempt.ID != input.AttemptID || attempt.StageID != input.StageID {
		return domain.Fail("ADVISOR_ATTEMPT_EXPIRED", "战斗场次已经变化，请在当前战斗中重新询问", 409)
	}
	return nil
}

// Advise reads two snapshots; the repository mutex is never held while waiting
// for a model. The answer is discarded if the battle ended or changed meanwhile.
func (g *Game) Advise(ctx context.Context, token string, input domain.AdvisorRequest) (domain.AdvisorResponse, error) {
	if err := validateAdvisor(input); err != nil {
		return domain.AdvisorResponse{}, err
	}
	if input.Scope == "journey" {
		return g.adviseJourney(ctx, token, input)
	}
	if err := g.advisorAttempt(token, input); err != nil {
		return domain.AdvisorResponse{}, err
	}
	result := g.Advisor.Reply(ctx, Hash(token), input)
	if err := g.advisorAttempt(token, input); err != nil {
		return domain.AdvisorResponse{}, err
	}
	return result, nil
}
