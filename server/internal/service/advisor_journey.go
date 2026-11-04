package service

import (
	"context"
	"encoding/json"
	"stray-kitty/server/internal/domain"
)

// The key describes the semantic scene, not movement distance or a UI-only panel.
// Keep the array order in sync with the client journey snapshot builder.
func advisorSceneKey(s domain.GameState) string {
	attemptID := ""
	if s.ActiveBattle != nil {
		attemptID = s.ActiveBattle.ID
	}
	key, _ := json.Marshal([]string{s.Phase, s.ChapterID, s.MapID, s.StoryNodeID, s.PendingEventID, attemptID})
	return string(key)
}

func advisorContextChanged() error {
	return domain.Fail("ADVISOR_CONTEXT_CHANGED", "当前位置或进度已经变化，请根据当前画面重新询问阿策", 409)
}

// advisorJourneyProgress explicitly selects already-known facts. It must never
// serialize GameState, Catalog, EventOption or EventOutcome wholesale: those
// objects include private transactions or unrevealed branches and outcomes.
func (g *Game) advisorJourneyProgress(s domain.GameState) map[string]any {
	return g.advisorJourneyProgressWithTexts(s, advisorVisibleTexts)
}

func (g *Game) advisorJourneyProgressWithTexts(s domain.GameState, texts advisorDisplayTexts) map[string]any {
	progress := map[string]any{
		"phase": s.Phase, "chapterId": s.ChapterID, "mapId": s.MapID,
		"knownCompanionIds": s.Cats, "knownFlags": s.Flags, "completedStages": s.CompletedStages,
		"companionListMeaning": "仅表示旅程中已结识的伙伴，不是本场出战名单。未提供实际战斗阵容时，不能推断谁上场或有几位主力。",
		"fixedCharacterRoles":  map[string]string{"喵喵": "全程不参战的保护目标，在后方指挥，不计入战斗主力。", "阿策": "场外顾问，不参战、不计入战斗主力。"},
		"resources":            map[string]int{"food": s.Inventory["food"], "material": s.Inventory["material"], "clue": s.Inventory["clue"], "stamp": s.Currencies["stamp"], "tuna": s.Currencies["tuna"]},
		"resourceNames":        map[string]string{"food": "鱼干", "material": "修缮材料", "clue": "线索", "stamp": "猫爪邮票", "tuna": "金枪鱼罐头"},
		"pushTokens":           s.PushTokens,
	}
	if s.ActiveBattle != nil {
		progress["battle"] = map[string]any{"stageId": s.ActiveBattle.StageID, "status": s.ActiveBattle.Status, "mainline": s.ActiveBattle.Mainline}
	}
	if s.MapID == "market" && (s.Phase == "explore" || s.Phase == "preparation") {
		progress["navigationRules"] = map[string]any{
			"canReturnHomeDirectly":  false,
			"marketDefenseCompleted": domain.Contains(s.Flags, "market_cleared"),
			"explanation":            "集市探索或准备阶段禁止通过回家按钮直接离开，按钮是否可见不改变此规则。需要完成集市防卫，并从北侧木箱翻越至出口。",
		}
	}
	if s.Phase == "dialogue" {
		for _, node := range g.Catalog.Story {
			if node.ID == s.StoryNodeID {
				visible := texts.Story[node.ID]
				progress["currentStory"] = map[string]string{"id": node.ID, "speaker": visible.Speaker, "text": visible.Text}
				break
			}
		}
	}
	if s.Phase == "event" && s.PendingEventID != "" {
		for _, event := range g.Catalog.Events {
			if event.ID != s.PendingEventID {
				continue
			}
			options := []map[string]string{}
			visible := texts.Events[event.ID]
			hintsVisible := len(event.Maps) == 0 || domain.Contains(event.Maps, s.MapID)
			for _, option := range event.Options {
				if option.RequireCat == "" || domain.Contains(s.Cats, option.RequireCat) {
					display := map[string]string{"id": option.ID, "label": visible.optionLabel(option.ID)}
					if hint := visible.optionHint(option.ID); hintsVisible && hint != "" {
						display["advisorHint"] = hint
					}
					options = append(options, display)
				}
			}
			progress["currentEvent"] = map[string]any{
				"id": event.ID, "title": event.Title, "text": visible.Text, "options": options,
				"selectionInventoryCost": map[string]int{},
				"selectionRules":         "当前可见普通选项没有库存数量门槛，不扣除鱼干、材料等库存资源。选项中放下鱼干等叙事动作不代表库存成本，不能绑定到玩家现有库存。只有主动选择使用伙伴鼓励时，才在掷骰前单独消耗1次鼓励次数。",
				"encouragementCost":      map[string]int{"pushTokens": 1},
			}
			if hint := advisorPublicHint(visible.AdvisorHint, 120); hintsVisible && hint != "" {
				progress["currentEvent"].(map[string]any)["advisorHint"] = hint
			}
			break
		}
	}
	if s.EventState != nil {
		modifiers := s.EventState.PendingModifiers
		progress["pendingSupport"] = map[string]any{"carry": modifiers.Carry, "shadowPressure": modifiers.ShadowPressure, "situation": modifiers.Situation}
		last := s.EventState.LastResolution
		if last.EventID != "" {
			// Only the result which the player actually received is visible here.
			progress["lastEvent"] = map[string]any{"eventId": last.EventID, "optionId": last.OptionID, "dice": last.Dice, "tier": last.Tier, "text": last.Outcome.Text, "reward": last.Outcome.Reward}
		}
	}
	if s.Phase == "settlement" {
		progress["battleResult"] = map[string]any{"stageId": s.LastResult.StageID, "message": s.LastResult.Message, "outcome": s.LastResult.Outcome, "firstClear": s.LastResult.FirstClear}
	}
	ownedFurniture := []map[string]string{}
	for _, id := range s.Furniture {
		name := id
		for _, item := range g.Catalog.Furniture {
			if item.ID == id {
				name = item.Name
				break
			}
		}
		ownedFurniture = append(ownedFurniture, map[string]string{"id": id, "name": name})
	}
	progress["ownedFurniture"] = ownedFurniture
	progress["placements"] = s.Placements
	progress["completedHomeRepairs"] = s.HomeRepairs
	if s.Phase == "home" {
		progress["homeKnowledge"] = g.advisorHomeKnowledge(s, texts)
		layout := map[string]any{}
		for key, placement := range s.HomeLayout {
			layout[key] = map[string]any{"x": placement.X, "y": placement.Y, "stored": placement.Stored}
		}
		progress["homeLayout"] = layout
		if domain.Contains(s.Flags, "finale_completed") || domain.Contains(s.Flags, "kingdom_founded") {
			return progress
		}
		for _, renovation := range g.renovationsByStage() {
			if domain.Contains(s.Flags, renovation.GrantsFlag) {
				continue
			}
			if renovation.RequiredFlag != "" && !domain.Contains(s.Flags, renovation.RequiredFlag) {
				break
			}
			parts := []map[string]any{}
			for _, part := range renovation.Parts {
				completed, unlocked, affordable := domain.Contains(s.HomeRepairs, part.ID), true, true
				for _, required := range part.Requires {
					if !domain.Contains(s.HomeRepairs, required) {
						unlocked = false
					}
				}
				for item, amount := range part.Cost {
					if g.walletOf(&s, item)[item] < amount {
						affordable = false
					}
				}
				parts = append(parts, map[string]any{"id": part.ID, "name": part.Name, "description": part.Description, "cost": part.Cost, "completed": completed, "unlocked": unlocked, "affordable": affordable, "requires": part.Requires,
					"remainingPlan": g.advisorRepairPlan(s, renovation.Parts, []string{part.ID})})
			}
			current := map[string]any{"name": renovation.Name, "description": renovation.Description, "parts": parts}
			// Older catalogs may have only a whole-stage cost; current catalogs use parts.
			if len(renovation.Parts) == 0 {
				current["cost"] = renovation.Cost
				current["remainingPlan"] = g.advisorRepairPlan(s, []domain.HomeRepairPart{{ID: renovation.ID, Name: renovation.Name, Cost: renovation.Cost}}, []string{renovation.ID})
			} else {
				targets := make([]string, 0, len(renovation.Parts))
				for _, part := range renovation.Parts {
					targets = append(targets, part.ID)
				}
				current["remainingPlan"] = g.advisorRepairPlan(s, renovation.Parts, targets)
			}
			progress["currentHomeRenovation"] = current
			break
		}
	}
	return progress
}

// A plan includes the unfinished targets and all unfinished prerequisites once.
// It describes current costs; it never spends resources or predicts future income.
func (g *Game) advisorRepairPlan(s domain.GameState, parts []domain.HomeRepairPart, targets []string) map[string]any {
	invalid := func(reason string) map[string]any {
		return map[string]any{"calculable": false, "reason": reason, "explanation": "无法完整核对修缮前置或成本，不提供可能遗漏部分工程的总数。"}
	}
	index := map[string]domain.HomeRepairPart{}
	for _, part := range parts {
		if _, duplicate := index[part.ID]; part.ID == "" || duplicate {
			return invalid("invalid_part_graph")
		}
		index[part.ID] = part
	}
	visited := map[string]int{}
	ordered := []map[string]string{}
	cost := map[string]int{}
	maxInt := int(^uint(0) >> 1)
	var visit func(string) string
	visit = func(id string) string {
		if domain.Contains(s.HomeRepairs, id) {
			return ""
		}
		part, exists := index[id]
		if !exists {
			return "missing_dependency"
		}
		if visited[id] == 1 {
			return "dependency_cycle"
		}
		if visited[id] == 2 {
			return ""
		}
		visited[id] = 1
		for _, required := range part.Requires {
			if reason := visit(required); reason != "" {
				return reason
			}
		}
		for resource, amount := range part.Cost {
			if amount < 0 || cost[resource] > maxInt-amount {
				return "invalid_cost"
			}
			cost[resource] += amount
		}
		ordered = append(ordered, map[string]string{"id": part.ID, "name": part.Name})
		visited[id] = 2
		return ""
	}
	for _, target := range targets {
		if reason := visit(target); reason != "" {
			return invalid(reason)
		}
	}
	available, missing := map[string]int{}, map[string]int{}
	for resource, amount := range cost {
		balance := g.walletOf(&s, resource)[resource]
		if balance < 0 {
			return invalid("invalid_resource_balance")
		}
		available[resource] = balance
		missing[resource] = 0
		if amount > balance {
			missing[resource] = amount - balance
		}
	}
	return map[string]any{"calculable": true, "parts": ordered, "cost": cost, "available": available, "missing": missing}
}

func (g *Game) adviseJourney(ctx context.Context, token string, input domain.AdvisorRequest) (domain.AdvisorResponse, error) {
	before, err := g.advisorSceneSnapshot(token, input)
	if err != nil {
		return domain.AdvisorResponse{}, err
	}
	progress := g.advisorJourneyProgress(before)
	fingerprint, err := json.Marshal(progress)
	if err != nil {
		return domain.AdvisorResponse{}, domain.Fail("INVALID_ADVISOR_REQUEST", "当前进度暂时无法读取", 400)
	}
	visible := json.RawMessage(input.Context)
	combined, err := json.Marshal(struct {
		ServerProgress map[string]any  `json:"serverProgress"`
		VisibleContext json.RawMessage `json:"visibleContext"`
	}{progress, visible})
	if err != nil {
		return domain.AdvisorResponse{}, domain.Fail("INVALID_ADVISOR_REQUEST", "当前可见信息无效", 400)
	}
	input.Context = string(combined)
	result := g.Advisor.Reply(ctx, Hash(token), input)
	if err := g.advisorSceneUnchanged(token, input.SceneKey, func(after domain.GameState) bool {
		afterFingerprint, err := json.Marshal(g.advisorJourneyProgress(after))
		return err == nil && string(afterFingerprint) == string(fingerprint)
	}); err != nil {
		return domain.AdvisorResponse{}, err
	}
	return result, nil
}
