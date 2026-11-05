package service

import (
	"log/slog"

	"stray-kitty/server/internal/domain"
)

func (g *Game) chooseEvent(s *domain.GameState, eventID, optionID string, usePush bool) error {
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
			if option.RequireCat != "" && !domain.Contains(s.Cats, option.RequireCat) {
				return domain.Fail("OPTION_LOCKED", "队伍中没有能执行这个行动的伙伴", 400)
			}
			rollPair := func() ([2]int, error) {
				var pair [2]int
				for i := range pair {
					value, err := g.Random(6)
					if err != nil {
						return pair, err
					}
					pair[i] = value + 1
				}
				return pair, nil
			}
			dice, err := rollPair()
			if err != nil {
				return err
			}
			// 伙伴鼓励:掷两组 2d6 取总和高的一组,消耗一枚;无库存时明确拒绝。
			if usePush {
				if s.PushTokens <= 0 {
					return domain.Fail("NO_PUSH_TOKEN", "伙伴的鼓励已经用完了，守护成功后会再攒起来的", 409)
				}
				alt, altErr := rollPair()
				if altErr != nil {
					return altErr
				}
				if alt[0]+alt[1] > dice[0]+dice[1] {
					dice = alt
				}
				s.PushTokens--
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
			if s.EventState != nil {
				modifiers.Carry = s.EventState.PendingModifiers.Carry
			}
			if outcome.TDMod != nil {
				modifiers.ShadowPressure = outcome.TDMod.ShadowPressure
				if modifiers.ShadowPressure < -1 || modifiers.ShadowPressure > 1 {
					return domain.Fail("INVALID_CONTENT", "事件压力配置无效", 500)
				}
			}
			// No new carry leaves the previous one intact. Only configured awards
			// replace it; carry never grants or consumes inventory resources.
			if outcome.Carry != "" {
				if !domain.IsBattleCarryID(outcome.Carry) {
					return domain.Fail("INVALID_CONTENT", "未知的战备物: "+string(outcome.Carry), 500)
				}
				modifiers.Carry = outcome.Carry
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
				economyDelta("fish", "gain", reward.Fish)
				s.Inventory["clue"] += reward.Clue
				s.Inventory["material"] += reward.Material
				s.Currencies["stamp"] += reward.Stamps
				economyDelta("stamps", "gain", reward.Stamps)
			}
			// 团子·讨生活:觅食类事件失败时,老江湖仍保底拿到成功档奖励的一半(向上取整)。
			// 放在主 LastResult 赋值之后,追加文案不被覆盖。
			tuanziFallback := ""
			if tier == "fail" && domain.Contains(event.Tags, "foraging") && domain.Contains(s.Cats, "tuanzi") {
				if success, ok := option.Outcomes["success"]; ok && success.Reward != nil {
					half := func(v int) int { return (v + 1) / 2 }
					s.Inventory["food"] += half(success.Reward.Fish)
					economyDelta("fish", "gain", half(success.Reward.Fish))
					s.Inventory["clue"] += half(success.Reward.Clue)
					s.Inventory["material"] += half(success.Reward.Material)
					s.Currencies["stamp"] += half(success.Reward.Stamps)
					economyDelta("stamps", "gain", half(success.Reward.Stamps))
					s.Flags = domain.Add(s.Flags, "tuanzi_provided")
					tuanziFallback = " 团子带着大家在附近又翻找了一圈,老江湖没让你们空手而归。"
				}
			}
			for _, flag := range outcome.Flags {
				s.Flags = domain.Add(s.Flags, flag)
			}
			if eventID == "crow_intel_event" {
				s.Flags = domain.Add(s.Flags, "market_crow_clue_completed")
			}
			if eventID == "pigeon_rumor_event" {
				s.Flags = domain.Add(s.Flags, "market_pigeon_clue_completed")
			}
			s.EventState = &domain.EventState{LastResolution: domain.EventResolution{EventID: eventID, OptionID: optionID, Dice: dice, Tier: tier, Outcome: outcome}, PendingModifiers: modifiers}
			s.LastResult = domain.Result{Message: outcome.Text + tuanziFallback, Roll: dice[0] + dice[1]}
			// 节点事件一次性:结算即记录,INTERACT 侧据此拒绝重触发。
			if s.PendingEventSource == "node" {
				s.DrawnEvents = domain.Add(s.DrawnEvents, "node:"+eventID)
			}
			// 观测埋点:档位分布/选项偏好/压力输出,不含玩家身份。
			slog.Info("event_resolve", "eventId", eventID, "optionId", optionID, "source", s.PendingEventSource, "dice", dice[0]+dice[1], "tier", tier, "pressure", modifiers.ShadowPressure, "situation", modifiers.Situation)
			s.PendingEventID = ""
			s.Phase = "preparation"
			if outcome.Situation != nil {
				s.Phase = "dialogue"
				s.StoryNodeID = outcome.Situation.StoryNodeID
			} else if s.PendingEventSource == "random" || ((s.MapID == "tunnel" || s.MapID == "warehouse") && s.PendingEventSource == "node") || eventID == "moving_blanket_event" || eventID == "alley_dog_friend" {
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
