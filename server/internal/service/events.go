package service

import "stray-kitty/server/internal/domain"

func (g *Game) chooseEvent(s *domain.GameState, eventID, optionID string) error {
	if err := domain.RequirePhase(*s, "event"); err != nil {
		return err
	}
	if eventID != s.PendingEventID {
		return domain.Fail("INVALID_COMMAND", "事件目标无效", 400)
	}
	for _, event := range g.Catalog.Events {
		if event.ID != eventID {
			continue
		}
		for _, option := range event.Options {
			if option.ID != optionID {
				continue
			}
			var dice [2]int
			for i := range dice {
				value, err := g.Random(6)
				if err != nil {
					return err
				}
				dice[i] = value + 1
			}
			tier, err := domain.EventTier(dice)
			if err != nil {
				return err
			}
			outcome, ok := option.Outcomes[tier]
			if !ok || outcome.Text == "" {
				return domain.Fail("INVALID_CONTENT", "事件结果配置不完整", 500)
			}
			modifiers := domain.BattleModifiers{}
			if outcome.TDMod != nil {
				modifiers.ShadowPressure = outcome.TDMod.ShadowPressure
				if modifiers.ShadowPressure < -1 || modifiers.ShadowPressure > 1 {
					return domain.Fail("INVALID_CONTENT", "事件压力配置无效", 500)
				}
			}
			if outcome.Situation != nil {
				if outcome.Situation.Kind != "detour" && outcome.Situation.Kind != "forced_chase" {
					return domain.Fail("INVALID_CONTENT", "局势类型无效", 500)
				}
				valid := false
				for _, node := range g.Catalog.Story {
					if node.ID == outcome.Situation.StoryNodeID && node.Exit == "preparation" {
						valid = true
						break
					}
				}
				if !valid {
					return domain.Fail("INVALID_CONTENT", "局势缺少有效的后续剧情", 500)
				}
				modifiers.Situation = outcome.Situation.Kind
			}
			if reward := outcome.Reward; reward != nil {
				if reward.Fish < 0 || reward.Stamps < 0 || reward.Clue < 0 || reward.Material < 0 {
					return domain.Fail("INVALID_CONTENT", "事件资源配置无效", 500)
				}
				s.Inventory["food"] += reward.Fish
				s.Inventory["clue"] += reward.Clue
				s.Inventory["material"] += reward.Material
				s.Currencies["stamp"] += reward.Stamps
			}
			for _, flag := range outcome.Flags {
				s.Flags = domain.Add(s.Flags, flag)
			}
			s.EventState = &domain.EventState{LastResolution: domain.EventResolution{EventID: eventID, OptionID: optionID, Dice: dice, Tier: tier, Outcome: outcome}, PendingModifiers: modifiers}
			s.LastResult = domain.Result{Message: outcome.Text, Roll: dice[0] + dice[1]}
			s.PendingEventID = ""
			s.Phase = "preparation"
			if outcome.Situation != nil {
				s.Phase = "dialogue"
				s.StoryNodeID = outcome.Situation.StoryNodeID
			} else if s.PendingEventSource == "random" || eventID == "moving_blanket_event" {
				// 随机相遇结束后回到探索继续赶路;局势除外(它接管后续走向)。
				s.Phase = "explore"
				s.ExploreDistance = -randomGrace
			}
			s.PendingEventSource = ""
			return nil
		}
	}
	return domain.Fail("INVALID_COMMAND", "事件选项无效", 400)
}
