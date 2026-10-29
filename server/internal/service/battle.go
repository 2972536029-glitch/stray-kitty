package service

import (
	"math"
	"stray-kitty/server/internal/domain"
)

// Standalone trials share battle contracts without changing mainline progression.
func isStandaloneBattle(stageID string) bool {
	return stageID == "market_boss" || stageID == "greenhouse_boss" || stageID == "tunnel_boss" || stageID == "finale_boss"
}

func battleDifficulty(modifiers *domain.BattleModifiers) (string, error) {
	pressure := 0
	if modifiers != nil {
		pressure = modifiers.ShadowPressure
	}
	switch pressure {
	case -1:
		return "low", nil
	case 0:
		return "medium", nil
	case 1:
		return "high", nil
	default:
		return "", domain.Fail("INVALID_BATTLE_PRESSURE", "战斗难度数据无效", 400)
	}
}

func (g *Game) startBattle(s *domain.GameState, c domain.Command) error {
	if c.StageID == "l00_tutorial" {
		if s.Phase != "settlement" || s.ActiveBattle == nil || s.ActiveBattle.StageID != "l00_tutorial" || s.ActiveBattle.Status != "lost" {
			return domain.Fail("STAGE_LOCKED", "教学战仅可从序章剧情进入或在失败后重新挑战", 409)
		}
		return g.retryTutorialBattle(s)
	}
	if err := domain.RequirePhase(*s, "preparation", "home", "explore"); err != nil {
		return err
	}
	battleRetry := s.Phase == "preparation" && s.ActiveBattle != nil && s.ActiveBattle.Status == "lost"
	finaleStoryBattle := c.StageID == "finale_boss" && s.MapID == "warehouse"
	if finaleStoryBattle && (!warehouseUnlocked(s) || s.Phase != "preparation" || domain.Contains(s.Flags, "finale_boss_victory")) {
		return domain.Fail("STAGE_LOCKED", "请先抵达仓库首领并完成开战对白", 409)
	}
	mainlineMarket := c.StageID == "market_boss" && ((s.Phase == "explore" && s.MapID == "market" && domain.Contains(s.Flags, "chapter_2_started")) || (battleRetry && s.ActiveBattle.Mainline))
	if mainlineMarket && !battleRetry && domain.Contains(s.Flags, "market_cleared") {
		return domain.Fail("STAGE_LOCKED", "集市防线已经守住", 409)
	}
	if mainlineMarket && !battleRetry && (c.Layer != "L0" || c.ReturnPosition == nil || math.Hypot(c.ReturnPosition.X-1310, c.ReturnPosition.Y-169) > 58) {
		return domain.Fail("STAGE_LOCKED", "请抵达集市北侧防线入口", 409)
	}
	tunnelStoryBattle := c.StageID == "tunnel_boss" && s.MapID == "tunnel" && (s.Phase == "explore" || (battleRetry && s.ActiveBattle.Mainline))
	if tunnelStoryBattle && (!domain.Contains(s.Flags, "chapter_4_started") || !domain.Contains(s.Flags, "tunnel_false_kitten_trap_found") || !domain.Contains(s.Flags, "valve_three_investigated") || domain.Contains(s.Flags, "tunnel_boss_cleared")) {
		return domain.Fail("STAGE_LOCKED", "请先调查诱饵与第三泄洪阀，或返回已经完成的通道", 409)
	}
	if tunnelStoryBattle && !battleRetry {
		p := c.ReturnPosition
		if p == nil || math.IsNaN(p.X) || math.IsNaN(p.Y) || math.IsInf(p.X, 0) || math.IsInf(p.Y, 0) || p.X < 1475 || p.X > 1602 || p.Y < 721 || p.Y > 798 {
			return domain.Fail("INVALID_COMMAND", "地下通道战斗触发位置无效", 400)
		}
	}
	if battleRetry && s.ActiveBattle.StageID != c.StageID {
		return domain.Fail("INVALID_PHASE", "请重试当前关卡，或先离开准备页再选择其他关卡", 409)
	}
	if isStandaloneBattle(c.StageID) && !tunnelStoryBattle && !finaleStoryBattle {
		if !domain.Contains(s.Flags, "alley_rescued") {
			return domain.Fail("STAGE_LOCKED", "请先完成第一章救援，再从家园进入独立试玩", 409)
		}
		if c.StageID == "market_boss" && mainlineMarket {
			if !domain.Contains(s.Flags, "market_crow_clue_completed") || !domain.Contains(s.Flags, "market_pigeon_clue_completed") {
				return domain.Fail("STAGE_LOCKED", "先取得老黑羽与咕咕大盗的两条线索", 409)
			}
		} else if s.Phase != "home" && !battleRetry {
			return domain.Fail("INVALID_PHASE", "独立试玩请从家园进入", 409)
		}
	}
	if c.StageID == "greenhouse_boss" && (!domain.Contains(s.Flags, "chapter_3_started") || !domain.Contains(s.Flags, "momo_joined")) {
		return domain.Fail("STAGE_LOCKED", "请先完成第三章启程并与墨墨汇合", 409)
	}
	if c.StageID == "alley_rescue" && s.MapID == "alley" && !domain.Contains(s.Flags, "alley_rescued") && !domain.Contains(s.DrawnEvents, "node:crate_event") {
		return domain.Fail("STAGE_LOCKED", "请先发现纸箱里的伙伴", 409)
	}
	if (s.Phase != "preparation" || c.StageID == "alley_boss") && !domain.Contains(s.Flags, "alley_rescued") {
		return domain.Fail("STAGE_LOCKED", "请先完成第一章救援，再从家园重玩小巷首领", 409)
	}
	if c.StageID != "alley_rescue" && c.StageID != "alley_boss" && !isStandaloneBattle(c.StageID) {
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
	id, err := ID()
	if err != nil {
		return err
	}
	attempt := &domain.Attempt{ID: id, StageID: c.StageID, Status: "active"}
	attempt.Mainline = mainlineMarket || tunnelStoryBattle || finaleStoryBattle
	if battleRetry {
		if s.ActiveBattle.Modifiers != nil {
			modifiers := *s.ActiveBattle.Modifiers
			attempt.Modifiers = &modifiers
		}
	} else if s.EventState != nil {
		modifiers := s.EventState.PendingModifiers
		attempt.Modifiers = &modifiers
	}
	if _, err := battleDifficulty(attempt.Modifiers); err != nil {
		return err
	}
	if c.StageID == "alley_rescue" && s.MapID == "alley" && c.ReturnPosition != nil {
		p := c.ReturnPosition
		if math.IsNaN(p.X) || math.IsNaN(p.Y) || math.IsInf(p.X, 0) || math.IsInf(p.Y, 0) || p.X < 0 || p.X >= 1188 || p.Y < 0 || p.Y >= 726 {
			return domain.Fail("INVALID_COMMAND", "救援返回位置无效", 400)
		}
		s.AlleyBattleReturn = &domain.WorldPoint{X: p.X, Y: p.Y}
	}
	s.ActiveBattle = attempt
	s.Phase = "battle"
	return nil
}

func (g *Game) retryTutorialBattle(s *domain.GameState) error {
	previousModifiers := s.ActiveBattle.Modifiers
	if _, err := battleDifficulty(previousModifiers); err != nil {
		return err
	}
	if err := g.startTutorialBattle(s, "l00_tutorial", false); err != nil {
		return err
	}
	if previousModifiers != nil {
		modifiers := *previousModifiers
		// Tutorials preserve their difficulty on retry but never enable carry.
		modifiers.Carry = ""
		s.ActiveBattle.Modifiers = &modifiers
	}
	return nil
}

// The client still runs combat; report validation is not authoritative simulation.
func (g *Game) completeBattle(s *domain.GameState, c domain.Command) error {
	if err := domain.RequirePhase(*s, "battle"); err != nil {
		return err
	}
	attempt := s.ActiveBattle
	if attempt == nil || attempt.ID != c.AttemptID || attempt.Status != "active" || (c.Outcome != "won" && c.Outcome != "lost") {
		return domain.Fail("INVALID_COMMAND", "战斗场次或结果无效", 400)
	}
	// Preserve the current story sequence: tutorial completion opens exploration.
	if attempt.StageID == "l00_tutorial" {
		attempt.Status = c.Outcome
		s.Phase = "settlement"
		s.LastResult = domain.Result{Outcome: c.Outcome, StageID: attempt.StageID, Message: "调整伙伴站位与技能时机，再开始一场新的教学挑战。"}
		if c.Outcome == "won" {
			s.LastResult.Message = "教学防线守住了。小巷的入口就在前方。"
			s.CompletedStages = domain.Add(s.CompletedStages, "l00_tutorial")
			s.Flags = domain.Add(s.Flags, "l00_completed")
		}
		return nil
	}
	if c.Report != nil && (c.Report.Leaks == nil || c.Report.BossDefeated == nil || *c.Report.Leaks < 0 || *c.Report.Leaks > 10000) {
		return domain.Fail("INVALID_BATTLE_REPORT", "战斗报告字段无效", 400)
	}
	if attempt.StageID == "alley_rescue" || attempt.StageID == "alley_boss" || isStandaloneBattle(attempt.StageID) {
		if c.Report == nil {
			return domain.Fail("INVALID_BATTLE_REPORT", "首领关卡需要完整的战斗报告，请刷新页面后重新挑战当前场次", 400)
		}
		if c.Outcome == "won" && (!*c.Report.BossDefeated || *c.Report.Leaks >= 3) {
			return domain.Fail("INVALID_BATTLE_REPORT", "必须击败首领并守住防线才能通关", 400)
		}
	}
	if c.Report != nil && c.Report.ElitesDefeated != nil && (*c.Report.ElitesDefeated < 0 || *c.Report.ElitesDefeated > 2) {
		return domain.Fail("INVALID_BATTLE_REPORT", "精英战斗报告字段无效", 400)
	}
	if attempt.StageID == "finale_boss" && (c.Report == nil || c.Report.ElitesDefeated == nil || (c.Outcome == "won" && *c.Report.ElitesDefeated != 2)) {
		return domain.Fail("INVALID_BATTLE_REPORT", "终局需要报告精英击败数，胜利须击败两名护卫", 400)
	}
	_, err := battleDifficulty(attempt.Modifiers)
	if err != nil {
		return err
	}
	result := domain.Result{Outcome: c.Outcome, StageID: attempt.StageID, Message: "防线需要再调整一下。伙伴仍在等待，准备好就再试一次。"}
	if s.Inventory == nil {
		s.Inventory = map[string]int{}
	}
	// Old active saves may still hold reserved player-owned supplies. The new
	// battle cannot consume them, so return the whole reservation exactly once.
	// Terminal attempts never reach this path; the existing transaction/receipt
	// keeps refunds atomic and durable across failed writes and request retries.
	for id, quantity := range attempt.Supplies {
		if (id != "warm-can" && id != "bouncy-treat") || quantity < 0 {
			return domain.Fail("INVALID_LEGACY_RESERVATION", "旧版预留记录无效，请保留存档后检查", 409)
		}
		s.Inventory[id] += quantity
	}
	attempt.Supplies = nil
	if c.Outcome == "won" {
		first := !domain.Contains(s.CompletedStages, attempt.StageID)
		if first && !isStandaloneBattle(attempt.StageID) {
			// 鼓励只在首次守护成功发放:重复通关不回(否则稀缺性可零成本刷满)。
			if s.PushTokens < 2 {
				s.PushTokens++
			}
		}
		result.FirstClear = first
		s.CompletedStages = domain.Add(s.CompletedStages, attempt.StageID)
		if s.EventState != nil && !isStandaloneBattle(attempt.StageID) {
			s.EventState.PendingModifiers = domain.BattleModifiers{}
		}
		if attempt.StageID == "alley_rescue" {
			result.Message = "再次守护成功！首次救援奖励不重复发放。"
			if first {
				result.Message = "撤离路线已经照亮，点点安全了！"
				s.Cats = domain.Add(s.Cats, "diandian")
				s.Furniture = domain.Add(s.Furniture, "cardboard_nest")
				s.Currencies["stamp"] += 2
				s.Inventory["material"] += 3
				s.Flags = domain.Add(s.Flags, "alley_rescued")
			}
		} else if attempt.StageID == "market_boss" {
			if attempt.Mainline {
				s.Flags = domain.Add(s.Flags, "market_cleared")
			}
			result.Message = "午夜集市的防线守住了，六位伙伴击退了首领。"
		} else if attempt.StageID == "finale_boss" {
			if attempt.Mainline {
				s.Flags = domain.Add(s.Flags, "finale_boss_victory")
			}
			result.Message = "伙伴们共同守住了光之归路，永夜之王与两名精英护卫已被击退。"
		} else if attempt.StageID == "tunnel_boss" {
			result.Message = "地下通道的归路守住了，六位伙伴击退了断灯监守。"
			if attempt.Mainline {
				s.Flags = domain.Add(s.Flags, "tunnel_boss_cleared")
			}
		} else if attempt.StageID == "greenhouse_boss" {
			s.Flags = domain.Add(s.Flags, "greenhouse_fortified")
			result.Message = "废弃花房的防线守住了，六位伙伴击退了首领。"
		} else {
			result.Message = "小巷首领已被击退，伙伴们守住了撤离路线。"
		}
	}
	attempt.Status = c.Outcome
	s.Phase = "settlement"
	s.LastResult = result
	return nil
}

func qaVictoryResult(attempt *domain.Attempt) domain.Command {
	leaks, bossDefeated := 0, true
	report := &domain.BattleReport{Leaks: &leaks, BossDefeated: &bossDefeated}
	if attempt.StageID == "finale_boss" {
		elites := 2
		report.ElitesDefeated = &elites
	}
	return domain.Command{Type: "COMPLETE_BATTLE", AttemptID: attempt.ID, Outcome: "won", Report: report}
}
