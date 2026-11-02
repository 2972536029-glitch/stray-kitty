package service

import (
	"fmt"
	"stray-kitty/server/internal/domain"
)

// Home answers may cross game modules, but this is a public, progress-filtered
// index, never a copy of the catalog, battle engine, story graph or save file.
// Current resource balances and repair budgets remain in serverProgress.
func (g *Game) advisorHomeKnowledge(s domain.GameState, texts advisorDisplayTexts) map[string]any {
	if s.Phase != "home" {
		return nil
	}
	companions := []map[string]any{}
	seen := map[string]bool{}
	for _, id := range s.Cats {
		profile, exists := texts.Companions[id]
		if !exists || seen[id] || profile.Name == "" {
			continue
		}
		seen[id] = true
		companions = append(companions, map[string]any{
			"id": id, "name": profile.Name, "profile": profile.Description,
			"explorationRole": profile.Skill,
			"roleBoundary":    "角色档案中的探索能力不等于战斗技能，也不代表当前出战。战斗能力只引用下面已核实的章节说明。",
			"battleAbilities": advisorKnownBattleAbilities(s, id),
		})
		if len(companions) == 16 {
			break
		}
	}
	completed := []map[string]string{}
	seen = map[string]bool{}
	for _, id := range s.CompletedStages {
		if name := g.advisorKnownStageName(texts, id); name != "" && !seen[id] {
			seen[id] = true
			completed = append(completed, map[string]string{"id": id, "name": name})
			if len(completed) == 32 {
				break
			}
		}
	}
	knownProgress := map[string]any{
		"completedBattles":    completed,
		"historyCompleteness": "通关记录只证明完成过这些关卡，包含可能的独立试玩，不证明对应主线对白已经发生。最近事件以serverProgress.lastEvent为准；没有完整已读台词或全部历史选择日志，不补写未记录的经历，不凭knownFlags名称编故事。",
	}
	if name := g.advisorKnownStageName(texts, s.LastResult.StageID); name != "" && (s.LastResult.Outcome == "won" || s.LastResult.Outcome == "lost") {
		knownProgress["lastBattle"] = map[string]string{"name": name, "outcome": s.LastResult.Outcome, "recordMeaning": "仅记录已经结算的胜负，不是当前战况，也不证明发生过未记录的主线剧情。"}
	}
	return map[string]any{
		"scope":      "家园入口可以解释战斗、家园、已结识伙伴、事件公开规则、资源和能核实的已知进度。只答问题涉及的内容，不主动列举未解锁章节、伙伴或结果。",
		"liveBattle": map[string]any{"available": false, "explanation": "家园没有正在运行的战斗快照，不能报告实时血量、能量、站位、敌人数量或推荐眼前战术。历史聊天和已经结算的战斗记录也不能充当实时状态；需要进入当前战斗查看。"},
		"battleRules": []string{
			"战斗猫会按自身攻击范围自动攻击；按阻挡容量拦住接触的普通敌人，超出容量的敌人继续前进。移位不会把已越过防线的敌人拉回来。",
			"技能依靠在场伙伴随战斗模拟时间积攒能量，蓄满后由玩家手动释放；不是等待技能冷却，也不会由阿策自动代放。具体能量速度、技能数值与范围按对应关卡已经公开的说明。",
			"暂停停止战斗计时和蓄能；不能在暂停中等技能、黑暗或其他计时自然结束。",
			"体力归零的战斗猫本场退场，不能复活、治疗回场或重新部署。护盾吸收伤害，不等于治疗；同类护盾不直接相加，具体覆盖方式按关卡规则。",
			"喵喵是受保护的主角，阿策是场外顾问，两者均不参战、不计入战斗主力。旅程中结识的伙伴不等于某场实际阵容。",
			"胜负取决于对应关卡的已公开条件，包括守住防线、处理波次和必要首领；不同关卡的阈值、技能与首领规则不能混用，不预测隐藏波表或保证胜利。",
			"战斗内没有库存补给、背包或休整；家园仍有家具收纳和修缮功能。事件提供的临时支援按当前关卡携带规则生效，不等于可购买或叠加的库存道具。",
		},
		"companions":             companions,
		"battleReference":        g.advisorKnownBattleReferences(s),
		"battleReferenceMeaning": "这些是玩家已有通关或最近战斗结算记录所对应的静态关卡主力资料，包含可能的独立试玩；不是旅程伙伴名单，也不是当前战场。maxHp是基础体力上限，不是当前体力；技能数值按对应章节引用，不跨关卡套用。只凭这些资料不能声称主线对白已经发生。",
		"eventRules":             g.advisorHomeEventRules(),
		"resourceGuide": map[string]string{
			"food":     "鱼干，是库存资源；不能把事件选项里叙事性的放鱼干动作当成实际库存扣费。",
			"material": "修缮材料；当前部件和前置总成本、已有余额与缺口读取serverProgress.currentHomeRenovation，不重复抵扣同一余额。",
			"clue":     "线索；当前数量读取serverProgress.resources.clue，已解锁旅程的资格按当前入口规则判断，不能承诺每种结果都获得同样线索。",
			"stamp":    "猫爪邮票，记录在currencies中，是目录中使用邮票的家具与包裹消费货币。",
			"tuna":     "金枪鱼罐头，记录在currencies中，与鱼干完全不同；不根据数量推断购买历史或劝玩家付费。",
		},
		"homeRules": []string{
			"修缮按当前阶段、部件前置和资源成本推进；已完成部件不重复收费。AI可以解释现有预算，但不会执行修缮或预测未来收入。",
			"只能摆放已拥有家具；布局记录区分摆放与收纳，收纳不等于丢失所有权。家具需要符合家园当前可用区域与摆放规则，阿策不会代移动或购买。",
			"家园可解释已解锁商店与包裹规则；真实消费需玩家在原功能中确认。包裹结果随机，只能说明公开保底机制，不能预测下一件家具或承诺抽到指定物品。",
		},
		"homeServices":  g.advisorHomeServices(s),
		"knownProgress": knownProgress,
	}
}

func (g *Game) advisorKnownStageName(texts advisorDisplayTexts, id string) string {
	for _, stage := range g.Catalog.Stages {
		if stage.ID == id {
			return texts.Stages[id].Name
		}
	}
	return ""
}

func advisorExperiencedBattle(s domain.GameState, id string) bool {
	return domain.Contains(s.CompletedStages, id) || (s.LastResult.StageID == id && (s.LastResult.Outcome == "won" || s.LastResult.Outcome == "lost"))
}

// These qualitative summaries are audited against the chapter config/engine
// and deliberately omit copied skill numbers. A later chapter's ability is not
// exposed simply because the companion joined or the chapter-start flag exists.
func advisorKnownBattleAbilities(s domain.GameState, id string) []map[string]string {
	abilities := []map[string]string{}
	add := func(chapter, explanation string) {
		abilities = append(abilities, map[string]string{"chapter": chapter, "explanation": explanation})
	}
	switch id {
	case "miaomiao":
		add("公开角色定位", "喵喵是后方指挥和受保护目标，不攻击、阻挡、蓄能或释放战斗技能。")
	case "tuanzi":
		if advisorExperiencedBattle(s, "alley_rescue") || advisorExperiencedBattle(s, "alley_boss") || domain.Contains(s.Flags, "alley_rescued") {
			add("已体验的小巷战斗", "团子使用橘影连爪，攻击自身前方范围中的敌人；范围与伤害看具体关卡说明，不从此档案推断实时站位或能量。")
		}
	case "diandian":
		if domain.Contains(s.Flags, "alley_rescued") || advisorExperiencedBattle(s, "alley_rescue") {
			add("已公开的治疗机制", "点点的安心呼噜治疗仍在场的战斗伙伴，不超过其体力上限，不能复活已经退场的猫；不同关卡阵容以实际战斗为准。")
		}
	case "momo":
		if domain.Contains(s.Flags, "momo_joined") || advisorExperiencedBattle(s, "greenhouse_boss") {
			add("已公开的花房能力", "墨墨在花房战斗中以巡光护行提供全队护盾，并清除已经生成的荆棘；不取消尚未落地的预告，不治疗、不复活。")
		}
		if advisorExperiencedBattle(s, "tunnel_boss") || domain.Contains(s.Flags, "tunnel_boss_cleared") || domain.Contains(s.Flags, "tunnel_explored") || domain.Contains(s.Flags, "cats_rescued_batch1") {
			add("已体验的地下通道能力", "墨墨在地下通道的夜视护行恢复全场视野并给在场伙伴加盾；本章不再清荆棘。断灯会自然结束，不要求墨墨存活才能继续。")
		}
		if advisorExperiencedBattle(s, "finale_boss") || domain.Contains(s.Flags, "finale_boss_victory") || domain.Contains(s.Flags, "finale_completed") || domain.Contains(s.Flags, "kingdom_founded") {
			add("已体验的终章能力", "墨墨在终章以夜视暂时照破首领影幕，同时给在场主力和已到场援军加盾；本章没有断灯，也不召来等待中的援军。")
		}
	}
	return abilities
}

type advisorEventPointRange struct {
	Min         int    `json:"min"`
	Max         int    `json:"max"`
	Sums        []int  `json:"sums"`
	Probability string `json:"probability"`
}

func (g *Game) advisorHomeEventRules() map[string]any {
	counts := map[string]int{}
	tierSums := map[string]map[int]bool{}
	for first := 1; first <= 6; first++ {
		for second := 1; second <= 6; second++ {
			tier, _ := domain.EventTier([2]int{first, second})
			counts[tier]++
			if tierSums[tier] == nil {
				tierSums[tier] = map[int]bool{}
			}
			tierSums[tier][first+second] = true
		}
	}
	probabilities := map[string]string{}
	pointRanges := map[string]advisorEventPointRange{}
	for tier, total := range counts {
		probabilities[tier] = fmt.Sprintf("%.2f%%", float64(total)*100/36)
		sums := []int{}
		for sum := 2; sum <= 12; sum++ {
			if tierSums[tier][sum] {
				sums = append(sums, sum)
			}
		}
		pointRanges[tier] = advisorEventPointRange{Min: sums[0], Max: sums[len(sums)-1], Sums: sums, Probability: probabilities[tier]}
	}
	failure := "失败仍可能产生黑影压力或剧情代价；具体资源以实际结算为准，不保证没有代价。"
	allClueFloor, checkedOptions := len(g.Catalog.Events) > 0, 0
	for _, event := range g.Catalog.Events {
		for _, option := range event.Options {
			checkedOptions++
			outcome, exists := option.Outcomes["fail"]
			if !exists || outcome.Reward == nil || outcome.Reward.Clue < 1 {
				allClueFloor = false
			}
		}
	}
	if allClueFloor && checkedOptions > 0 {
		failure = "当前事件失败档至少保底1条线索，但仍可能产生黑影压力或剧情代价；不能说失败完全没有代价。"
	}
	return map[string]any{
		"dice":               "普通判定掷两颗六面骰并相加；只有公开档位和概率，不预报下一次骰点。",
		"tierProbabilities":  probabilities,
		"pointRanges":        pointRanges,
		"probabilityMeaning": "这是普通一组2d6的基础概率，不是使用鼓励后的两组取高概率。",
		"encouragement":      "在掷骰前主动声明使用，消耗1次鼓励，掷两组两颗六面骰取总和较高的一组；不是结算后重掷。初始1次，上限2次；首次完成可恢复鼓励的非教学、非独立守护关卡补1次，同关重复通关与独立试玩不恢复，不承诺每赢一场都补。",
		"inventoryCost":      "当前普通事件选项不因鱼干、材料等库存数量锁定，也不因选项里的叙事动作扣除库存；鼓励次数与库存资源分开计费。",
		"neutrality":         "只解释事件公开机制、已经记录的实际结果和已公开选项字面行动；不推荐、排名或代选具体选项，不揭示未触发卡片、未显示选项或未结算后果。",
		"failure":            failure,
		"repeatability":      "普通无放回卡按区域记录，少量回响卡允许按配置重复；章节前进会刷新遭遇池，不能据此列出尚未解锁的卡池。",
		"support":            "黑影压力影响下一场战斗难度，临时carry按实际支援规则带入；新的携带物会替换已有待用携带物，不是库存叠加。支援是否消费和清空按当前关卡规则，不承诺获得某件支援。",
	}
}

func (g *Game) advisorHomeServices(s domain.GameState) map[string]any {
	names := map[string]string{}
	storyGifts := map[string]bool{}
	for _, furniture := range g.Catalog.Furniture {
		names[furniture.ID] = furniture.Name
		storyGifts[furniture.ID] = furniture.Source == "story"
	}
	products := []map[string]any{}
	for _, product := range g.Catalog.Products {
		if product.Status != "available" || product.Price < 1 || product.CurrencyID != "stamp" || (product.RequiredFlag != "" && !domain.Contains(s.Flags, product.RequiredFlag)) || names[product.FurnitureID] == "" || storyGifts[product.FurnitureID] {
			continue
		}
		products = append(products, map[string]any{"name": names[product.FurnitureID], "cost": product.Price, "currency": "猫爪邮票", "owned": domain.Contains(s.Furniture, product.FurnitureID)})
		if len(products) == 24 {
			break
		}
	}
	pools := []map[string]any{}
	for _, pool := range g.Catalog.Pools {
		currency := pool.Currency
		if currency == "" {
			currency = "stamp"
		}
		if (pool.RequiredFlag != "" && !domain.Contains(s.Flags, pool.RequiredFlag)) || pool.Cost < 1 || pool.PityEvery < 1 || pool.DuplicateMaterial < 0 || (currency != "stamp" && currency != "tuna") {
			continue
		}
		pools = append(pools, map[string]any{"name": pool.Name, "cost": pool.Cost, "currency": map[string]string{"stamp": "猫爪邮票", "tuna": "金枪鱼罐头"}[currency], "pityEvery": pool.PityEvery, "duplicateMaterial": pool.DuplicateMaterial,
			"pityMeaning": "有未拥有家具时，连续未获新品达到保底门槛后从未拥有项中随机抽取，不保证指定家具；具体当前进度以原包裹界面为准。"})
		if len(pools) == 12 {
			break
		}
	}
	return map[string]any{"products": products, "parcelPools": pools, "dataBoundary": "只含已解锁服务的公开成本和机制，不含抽取权重、未来结果、支付记录或购买历史。"}
}
