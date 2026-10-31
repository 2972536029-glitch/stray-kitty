package service

import (
	"fmt"
	"sort"
	"stray-kitty/server/internal/domain"
)

// 花房四阶修缮:阶段 1 漏雨避雨处是初始状态,阶段 2/3 由 REPAIR_HOME 逐段推进,
// 阶段 4(流浪猫王国庆典)由剧情 flag finale_completed/kingdom_founded 自动点亮,不走本命令。
// 推进路径、材料消耗与解锁槽位全部来自目录 renovations,按 stage 升序执行。

// repairHome 结算场景部位；不带部位 ID 的旧命令结算剩余工程，全部完成才追加阶段 flag。
func (g *Game) repairHome(s *domain.GameState, repairID string) error {
	if err := domain.RequirePhase(*s, "home"); err != nil {
		return err
	}
	if repairID != "" {
		known := false
		for _, r := range g.Catalog.Renovations {
			for _, part := range r.Parts {
				if part.ID == repairID {
					known = true
					if domain.Contains(s.HomeRepairs, repairID) || domain.Contains(s.Flags, r.GrantsFlag) {
						return domain.Fail("REPAIR_ALREADY_COMPLETE", "这里已经修好了", 409)
					}
				}
			}
		}
		if !known {
			return domain.Fail("INVALID_REPAIR", "找不到这处修补工程", 400)
		}
	}
	for _, r := range g.renovationsByStage() {
		if domain.Contains(s.Flags, r.GrantsFlag) {
			continue
		}
		if r.RequiredFlag != "" && !domain.Contains(s.Flags, r.RequiredFlag) {
			return domain.Fail("RENOVATION_LOCKED", "上一阶段的花房修缮还没有完成", 409)
		}
		cost, completed, label := r.Cost, []string{}, r.Name
		if len(r.Parts) > 0 {
			cost = map[string]int{}
			for _, part := range r.Parts {
				if domain.Contains(s.HomeRepairs, part.ID) || repairID != "" && part.ID != repairID {
					continue
				}
				if repairID != "" {
					for _, required := range part.Requires {
						if !domain.Contains(s.HomeRepairs, required) {
							return domain.Fail("REPAIR_LOCKED", "先修好相邻的窗、屋顶或地板，再来整理这里吧", 409)
						}
					}
					label = part.Name
				}
				completed = append(completed, part.ID)
				for item, amount := range part.Cost {
					cost[item] += amount
				}
			}
		}
		if repairID != "" && len(completed) == 0 {
			return domain.Fail("REPAIR_LOCKED", "先完成上一阶段的修缮", 409)
		}
		for item, amount := range cost {
			if amount > 0 && g.walletOf(s, item)[item] < amount {
				if item == "stamp" {
					return domain.Fail("INSUFFICIENT_CURRENCY", "猫爪邮票不足，完成救援可以获得更多", 409)
				}
				return domain.Fail("INSUFFICIENT_MATERIAL", "修缮材料不足，去小巷与集市再收集一些吧", 409)
			}
		}
		for item, amount := range cost {
			wallet := g.walletOf(s, item)
			wallet[item] -= amount
		}
		for _, id := range completed {
			s.HomeRepairs = domain.Add(s.HomeRepairs, id)
		}
		complete := true
		for _, part := range r.Parts {
			if !domain.Contains(s.HomeRepairs, part.ID) {
				complete = false
			}
		}
		message := fmt.Sprintf("修好了：%s。花房又暖和了一点。", label)
		outcome := repairID
		if complete {
			s.Flags = domain.Add(s.Flags, r.GrantsFlag)
			message = r.Message
			outcome = r.ID
		}
		if message == "" {
			message = fmt.Sprintf("花房修缮完成：%s。", r.Name)
		}
		s.LastResult = domain.Result{Message: message, Outcome: outcome}
		return nil
	}
	return domain.Fail("RENOVATION_COMPLETE", "花房已经修缮完毕，就等街坊们送来庆典装饰啦。", 409)
}

// requireSlotUnlocked 校验槽位未被某个未完成的修缮工程锁住(如高空横梁需先完成原木温室)。
func (g *Game) requireSlotUnlocked(s *domain.GameState, slotID string) error {
	for _, r := range g.Catalog.Renovations {
		if !domain.Contains(r.UnlockSlots, slotID) {
			continue
		}
		if !domain.Contains(s.Flags, r.GrantsFlag) {
			return domain.Fail("SLOT_LOCKED", fmt.Sprintf("先完成「%s」修缮，才能使用%s", r.Name, slotLabel(g, slotID)), 409)
		}
	}
	return nil
}

// renovationsByStage 返回按 stage 升序的修缮目录,顺序推进不依赖 JSON 声明顺序。
func (g *Game) renovationsByStage() []domain.Renovation {
	list := make([]domain.Renovation, len(g.Catalog.Renovations))
	copy(list, g.Catalog.Renovations)
	sort.SliceStable(list, func(i, j int) bool { return list[i].Stage < list[j].Stage })
	return list
}

// walletOf 返回该成本键对应的账本:material/food 走背包,stamp/tuna 等货币走钱包。
func (g *Game) walletOf(s *domain.GameState, item string) map[string]int {
	if item == "stamp" || item == "tuna" {
		return s.Currencies
	}
	return s.Inventory
}

func slotLabel(g *Game, slotID string) string {
	for _, slot := range g.Catalog.Slots {
		if slot.ID == slotID {
			if slot.Name != "" {
				return slot.Name
			}
			return slotID
		}
	}
	return slotID
}
