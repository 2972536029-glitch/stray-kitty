package service

import "stray-kitty/server/internal/domain"

var supplyIDs = []string{"warm-can", "bouncy-treat"}

func validateSupplies(supplies map[string]int, warmLimit, energyLimit int) error {
	for id, quantity := range supplies {
		limit := 0
		switch id {
		case "warm-can":
			limit = warmLimit
		case "bouncy-treat":
			limit = energyLimit
		default:
			return domain.Fail("INVALID_BATTLE_SUPPLIES", "包含不支持的战斗补给", 400)
		}
		if quantity < 0 || quantity > limit {
			return domain.Fail("INVALID_BATTLE_SUPPLIES", "补给数量超过本关携带上限", 400)
		}
	}
	return nil
}

func battleDifficulty(modifiers *domain.BattleModifiers) (string, int, error) {
	pressure := 0
	if modifiers != nil {
		pressure = modifiers.ShadowPressure
	}
	switch pressure {
	case -1:
		return "low", 2, nil
	case 0:
		return "medium", 3, nil
	case 1:
		return "high", 4, nil
	default:
		return "", 0, domain.Fail("INVALID_BATTLE_PRESSURE", "战斗难度数据无效", 400)
	}
}

func (g *Game) startBattle(s *domain.GameState, c domain.Command) error {
	if err := domain.RequirePhase(*s, "preparation", "home", "explore"); err != nil {
		return err
	}
	if (s.Phase != "preparation" || c.StageID == "alley_boss") && !domain.Contains(s.Flags, "alley_rescued") {
		return domain.Fail("STAGE_LOCKED", "请先完成序章救援，再挑战小巷首领", 409)
	}
	if c.StageID != "alley_rescue" && c.StageID != "alley_boss" {
		return domain.Fail("INVALID_COMMAND", "关卡尚未开放", 400)
	}
	found := false
	for _, stage := range g.Catalog.Stages {
		if stage.ID == c.StageID && stage.Status == "demo" {
			found = true
		}
	}
	if !found {
		return domain.Fail("INVALID_COMMAND", "关卡尚未开放", 400)
	}
	warmLimit, energyLimit := 4, 2
	if c.StageID == "alley_rescue" {
		warmLimit, energyLimit = 2, 1
	}
	if err := validateSupplies(c.Supplies, warmLimit, energyLimit); err != nil {
		return err
	}
	for id, quantity := range c.Supplies {
		if s.Inventory[id] < quantity {
			return domain.Fail("INSUFFICIENT_SUPPLIES", "仓库补给不足，请调整携带数量", 409)
		}
	}
	id, err := ID()
	if err != nil {
		return err
	}
	attempt := &domain.Attempt{ID: id, StageID: c.StageID, Status: "active"}
	if s.EventState != nil {
		modifiers := s.EventState.PendingModifiers
		attempt.Modifiers = &modifiers
	}
	if _, _, err := battleDifficulty(attempt.Modifiers); err != nil {
		return err
	}
	if len(c.Supplies) != 0 {
		attempt.Supplies = map[string]int{}
		for id, quantity := range c.Supplies {
			attempt.Supplies[id] = quantity
			s.Inventory[id] -= quantity
		}
	}
	s.ActiveBattle = attempt
	s.Phase = "battle"
	return nil
}

// The client still runs combat. This validates the result contract and inventory
// transaction; it is not a server-authoritative combat or anti-cheat simulation.
func (g *Game) completeBattle(s *domain.GameState, c domain.Command) error {
	if err := domain.RequirePhase(*s, "battle"); err != nil {
		return err
	}
	attempt := s.ActiveBattle
	if attempt == nil || attempt.ID != c.AttemptID || attempt.Status != "active" || (c.Outcome != "won" && c.Outcome != "lost") {
		return domain.Fail("INVALID_COMMAND", "战斗场次或结果无效", 400)
	}
	if err := validateSupplies(c.UsedSupplies, 4, 2); err != nil {
		return err
	}
	for _, id := range supplyIDs {
		if c.UsedSupplies[id] > attempt.Supplies[id] {
			return domain.Fail("INVALID_BATTLE_USAGE", "消耗数量超过本场预留物资", 400)
		}
		if attempt.Supplies[id] > 0 && c.UsedSupplies == nil {
			return domain.Fail("INVALID_BATTLE_USAGE", "本场有自带补给，必须提供有效耗用清单", 400)
		}
	}
	if c.Report != nil && (c.Report.Leaks == nil || c.Report.BossDefeated == nil || *c.Report.Leaks < 0 || *c.Report.Leaks > 10000) {
		return domain.Fail("INVALID_BATTLE_REPORT", "战斗报告字段无效", 400)
	}
	if attempt.StageID == "alley_boss" {
		if c.Report == nil || c.UsedSupplies == nil {
			return domain.Fail("INVALID_BATTLE_REPORT", "第一章需要完整的战斗报告和有效耗用清单", 400)
		}
		if c.Outcome == "won" && (!*c.Report.BossDefeated || *c.Report.Leaks >= 3) {
			return domain.Fail("INVALID_BATTLE_REPORT", "必须击败首领并守住防线才能通关", 400)
		}
	}
	difficulty, baseCount, err := battleDifficulty(attempt.Modifiers)
	if err != nil {
		return err
	}
	result := domain.Result{Outcome: c.Outcome, StageID: attempt.StageID, Message: "防线需要再调整一下。伙伴仍在等待，准备好就再试一次。"}
	if s.Inventory == nil {
		s.Inventory = map[string]int{}
	}
	// START_BATTLE deducted the reservation. Only unused, player-owned units return.
	// A refreshed client restarts this attempt from ready with the same reservation;
	// uncommitted combat and consumption are rolled back, not saved frame by frame.
	for _, id := range supplyIDs {
		s.Inventory[id] += attempt.Supplies[id] - c.UsedSupplies[id]
	}
	if c.Outcome == "won" {
		first := !domain.Contains(s.CompletedStages, attempt.StageID)
		rewards := &domain.BattleRewards{Supplies: map[string]int{"warm-can": 0, "bouncy-treat": 0}, BaseCount: baseCount, Difficulty: difficulty}
		if first {
			rewards.FirstClearBonus = 2
			// 鼓励只在首次守护成功发放:重复通关不回(否则稀缺性可零成本刷满)。
			if s.PushTokens < 2 {
				s.PushTokens++
			}
		}
		if attempt.StageID == "alley_boss" && *c.Report.Leaks == 0 {
			rewards.PerfectBonus = 1
		}
		for i := 0; i < rewards.BaseCount+rewards.FirstClearBonus+rewards.PerfectBonus; i++ {
			draw, err := g.Random(100)
			if err != nil {
				return err
			}
			if draw < 0 || draw >= 100 {
				return domain.Fail("INVALID_REWARD_DRAW", "补给抽取结果无效", 500)
			}
			id := "warm-can"
			if draw >= 70 {
				id = "bouncy-treat"
			}
			rewards.Supplies[id]++
			s.Inventory[id]++
		}
		result.BattleRewards = rewards
		result.FirstClear = first
		s.CompletedStages = domain.Add(s.CompletedStages, attempt.StageID)
		if s.EventState != nil {
			s.EventState.PendingModifiers = domain.BattleModifiers{}
		}
		if attempt.StageID == "alley_rescue" {
			result.Message = "再次守护成功！本场补给已保存，首次救援奖励不重复发放。"
			if first {
				result.Message = "撤离路线已经照亮，点点安全了！本场补给已保存。"
				s.Cats = domain.Add(s.Cats, "diandian")
				s.Furniture = domain.Add(s.Furniture, "cardboard_nest")
				s.Currencies["stamp"] += 2
				s.Inventory["material"] += 3
				s.Flags = domain.Add(s.Flags, "alley_rescued")
			}
		} else {
			result.Message = "小巷首领已被击退，伙伴们守住了撤离路线。本场补给已保存。"
		}
	}
	attempt.Status = c.Outcome
	s.Phase = "settlement"
	s.LastResult = result
	return nil
}
