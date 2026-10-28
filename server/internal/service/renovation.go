package service

import (
	"fmt"
	"sort"
	"stray-kitty/server/internal/domain"
)

// 花房四阶修缮:阶段 1 漏雨避雨处是初始状态,阶段 2/3 由 REPAIR_HOME 逐段推进,
// 阶段 4(流浪猫王国庆典)由剧情 flag finale_completed/kingdom_founded 自动点亮,不走本命令。
// 推进路径、材料消耗与解锁槽位全部来自目录 renovations,按 stage 升序执行。

// repairHome 推进花房的下一个修缮工程:校验前置 flag 与材料,扣除后追加 grantsFlag。
func (g *Game) repairHome(s *domain.GameState) error {
	if err := domain.RequirePhase(*s, "home"); err != nil {
		return err
	}
	for _, r := range g.renovationsByStage() {
		if domain.Contains(s.Flags, r.GrantsFlag) {
			continue
		}
		if r.RequiredFlag != "" && !domain.Contains(s.Flags, r.RequiredFlag) {
			return domain.Fail("RENOVATION_LOCKED", "上一阶段的花房修缮还没有完成", 409)
		}
		for item, amount := range r.Cost {
			if amount > 0 && g.walletOf(s, item)[item] < amount {
				if item == "stamp" {
					return domain.Fail("INSUFFICIENT_CURRENCY", "猫爪邮票不足，完成救援可以获得更多", 409)
				}
				return domain.Fail("INSUFFICIENT_MATERIAL", "修缮材料不足，去小巷与集市再收集一些吧", 409)
			}
		}
		for item, amount := range r.Cost {
			wallet := g.walletOf(s, item)
			wallet[item] -= amount
		}
		s.Flags = domain.Add(s.Flags, r.GrantsFlag)
		message := r.Message
		if message == "" {
			message = fmt.Sprintf("花房修缮完成：%s。", r.Name)
		}
		s.LastResult = domain.Result{Message: message, Outcome: r.ID}
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
