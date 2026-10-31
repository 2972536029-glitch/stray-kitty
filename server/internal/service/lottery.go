package service

import (
	"fmt"
	"stray-kitty/server/internal/domain"
	"time"
)

// Old story furniture stays deterministic, including for returning saves.
func (g *Game) prepareLottery(s *domain.GameState) {
	for _, gift := range []struct {
		flag  string
		items []string
	}{
		{"alley_rescued", []string{"cardboard_nest", "soft_blanket", "tin_lamp"}},
		{"market_cleared", []string{"snack_cushion", "blue_bowl", "red_cushion"}},
		{"greenhouse_fortified_full", []string{"sun_lamp", "box_castle"}},
		{"tunnel_explored", []string{"moon_hammock"}},
		{"finale_completed", []string{"star_glass", "cloud_nest"}},
	} {
		if domain.Contains(s.Flags, gift.flag) {
			for _, id := range gift.items {
				s.Furniture = domain.Add(s.Furniture, id)
			}
		}
	}
	if s.Lottery == nil {
		s.Lottery = &domain.LotteryState{Progress: map[string]domain.PoolProgress{}, History: []domain.ParcelDraw{}, Milestones: []string{}}
	}
	if s.Lottery.Progress == nil {
		s.Lottery.Progress = map[string]domain.PoolProgress{}
	}
	now := time.Now()
	if g.Now != nil {
		now = g.Now()
	}
	day := now.In(time.FixedZone("Asia/Shanghai", 8*60*60)).Format("2006-01-02")
	if s.Lottery.Day != day {
		s.Lottery.Day = day
		s.Lottery.DailyClaims = []string{}
	}
}

func (g *Game) drawParcel(s *domain.GameState, poolID string) error {
	if err := domain.RequirePhase(*s, "home"); err != nil {
		return err
	}
	var pool *domain.Pool
	for i := range g.Catalog.Pools {
		if g.Catalog.Pools[i].ID == poolID {
			pool = &g.Catalog.Pools[i]
			break
		}
	}
	if pool == nil {
		return domain.Fail("POOL_UNAVAILABLE", "这个旧包裹已收进剧情纪念册，请选择新的主题包裹。", 409)
	}
	if pool.RequiredFlag != "" && !domain.Contains(s.Flags, pool.RequiredFlag) {
		return domain.Fail("POOL_LOCKED", "先完成点点的救援，再回花房签收主题包裹。", 409)
	}
	currency := pool.Currency
	if currency == "" {
		currency = "stamp"
	}
	if pool.Cost <= 0 || (currency != "stamp" && currency != "tuna") || pool.PityEvery < 1 || pool.DuplicateMaterial < 0 {
		return domain.Fail("INVALID_POOL", "包裹目录暂时没有准备好。", 500)
	}
	if s.Currencies[currency] < pool.Cost {
		return domain.Fail("INSUFFICIENT_CURRENCY", map[string]string{"stamp": "邮票不足，可以先领取今日来信或完成猫咪心愿。", "tuna": "金枪鱼罐头不足，去补给小站看看吧。"}[currency], 409)
	}
	progress := s.Lottery.Progress[pool.ID]
	missing := []domain.Entry{}
	for _, entry := range pool.Entries {
		if !domain.Contains(s.Furniture, entry.FurnitureID) {
			missing = append(missing, entry)
		}
	}
	guaranteed := len(missing) > 0 && progress.Misses >= pool.PityEvery-1
	entries := pool.Entries
	if guaranteed {
		entries = missing
	}
	total := 0
	for _, entry := range entries {
		if entry.Weight <= 0 {
			return domain.Fail("INVALID_POOL", "包裹概率配置无效。", 500)
		}
		total += entry.Weight
	}
	if total <= 0 {
		return domain.Fail("INVALID_POOL", "包裹目录是空的。", 500)
	}
	roll, err := g.Random(total)
	if err != nil {
		return err
	}
	if roll < 0 || roll >= total {
		return domain.Fail("INVALID_ROLL", "包裹正在重新整理，请稍后再试。", 500)
	}
	id := ""
	for _, entry := range entries {
		roll -= entry.Weight
		if roll < 0 {
			id = entry.FurnitureID
			break
		}
	}
	drawID, err := ID()
	if err != nil {
		return err
	}
	name := id
	for _, item := range g.Catalog.Furniture {
		if item.ID == id {
			name = item.Name
			break
		}
	}
	now := time.Now()
	if g.Now != nil {
		now = g.Now()
	}
	draw := domain.ParcelDraw{ID: drawID, PoolID: pool.ID, FurnitureID: id, Currency: currency, Cost: pool.Cost, Number: progress.Draws + 1, Duplicate: domain.Contains(s.Furniture, id), Guaranteed: guaranteed, CreatedAt: now}
	s.Currencies[currency] -= pool.Cost
	progress.Draws++
	message := fmt.Sprintf("%s送来了「%s」，去花房给它找个位置吧。", pool.Name, name)
	if draw.Duplicate {
		draw.Material = pool.DuplicateMaterial
		s.Inventory["material"] += draw.Material
		if len(missing) > 0 {
			progress.Misses++
		} else {
			progress.Misses = 0
		}
		message = fmt.Sprintf("熟悉的「%s」化作了 %d 份修缮材料，心意没有浪费。", name, draw.Material)
	} else {
		s.Furniture = domain.Add(s.Furniture, id)
		progress.Misses = 0
	}
	if guaranteed {
		message = "暖心保底送达！" + message
	}
	s.Lottery.Progress[pool.ID] = progress
	s.Lottery.History = append(s.Lottery.History, draw)
	if len(s.Lottery.History) > 50 {
		s.Lottery.History = s.Lottery.History[len(s.Lottery.History)-50:]
	}
	// Both currencies have an auditable receipt; no charge amount is invented.
	domain.AppendTxn(s, domain.Txn{ID: "draw-" + drawID, PackID: pool.ID, Status: "confirmed", Reason: fmt.Sprintf("%s · 消耗 %d %s · %s", pool.Name, pool.Cost, currency, name), CreatedAt: now, Currency: currency, Spent: pool.Cost})
	s.LastResult = domain.Result{Message: message, Outcome: id, Draw: &draw}
	return nil
}

func (g *Game) claimParcelReward(s *domain.GameState, rewardID string) error {
	if err := domain.RequirePhase(*s, "home"); err != nil {
		return err
	}
	if !domain.Contains(s.Flags, "alley_rescued") {
		return domain.Fail("REWARD_LOCKED", "先把点点接回家，再签收来信。", 409)
	}
	for _, reward := range g.Catalog.ParcelRewards {
		if reward.ID != rewardID {
			continue
		}
		if reward.Kind != "daily" && reward.Kind != "milestone" {
			return domain.Fail("INVALID_REWARD", "来信配置无效。", 500)
		}
		claimed := s.Lottery.Milestones
		if reward.Kind == "daily" {
			claimed = s.Lottery.DailyClaims
		}
		if domain.Contains(claimed, reward.ID) {
			return domain.Fail("REWARD_CLAIMED", "这份心意已经签收啦。", 409)
		}
		if reward.RequiredFlag != "" && !domain.Contains(s.Flags, reward.RequiredFlag) {
			return domain.Fail("REWARD_LOCKED", "完成对应的旅程后，这封来信就会送达。", 409)
		}
		if reward.Condition == "furnished" && !homeFurnished(s) {
			return domain.Fail("WISH_UNFINISHED", "先在花房摆上一件喜欢的家具，再来听猫咪道谢。", 409)
		}
		if reward.Stamp < 0 || reward.Tuna < 0 {
			return domain.Fail("INVALID_REWARD", "来信奖励配置无效。", 500)
		}
		s.Currencies["stamp"] += reward.Stamp
		s.Currencies["tuna"] += reward.Tuna
		if reward.Kind == "daily" {
			s.Lottery.DailyClaims = domain.Add(s.Lottery.DailyClaims, reward.ID)
		} else {
			s.Lottery.Milestones = domain.Add(s.Lottery.Milestones, reward.ID)
		}
		s.LastResult = domain.Result{Message: fmt.Sprintf("%s已签收：猫爪邮票 +%d，金枪鱼罐头 +%d。", reward.Name, reward.Stamp, reward.Tuna), Outcome: reward.ID}
		return nil
	}
	return domain.Fail("INVALID_REWARD", "没有找到这封来信。", 400)
}
