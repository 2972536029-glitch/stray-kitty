package service

import "stray-kitty/server/internal/domain"

// 随机事件触发协议:玩家在探索阶段行走,里程每累计一个检查段,服务端按当前
// 区域危险度掷一次概率;危险度同时决定触发概率与机遇/风险配比;同区域无放回。
const (
	randomCheckSegment = 150 // 里程检查段(画布像素)
	randomMaxReport    = 300 // 单次上报允许的最大里程
	randomGrace        = 600 // 进入探索/触发后的保护里程(约 3~4 秒行走,兼作 e2e 走位缓冲)
)

// 回落平衡表(content 里没有 eventsBalance 时使用);正式数值在
// web/content/events/balance.json,调参不用重编译。
var randomTriggerChance = [4]int{30, 120, 160, 280}
var randomRiskShare = [4]int{200, 400, 600, 800}

func (g *Game) triggerChance(danger int) int {
	for _, b := range g.Catalog.EventsBalance {
		if b.DangerLevel == danger && b.TriggerChance > 0 {
			return b.TriggerChance
		}
	}
	return randomTriggerChance[danger]
}

func (g *Game) riskShare(danger int) int {
	for _, b := range g.Catalog.EventsBalance {
		if b.DangerLevel == danger && b.RiskShare > 0 {
			return b.RiskShare
		}
	}
	return randomRiskShare[danger]
}

func (g *Game) reportMove(s *domain.GameState, distance int) error {
	if err := domain.RequirePhase(*s, "explore"); err != nil {
		return err
	}
	if distance <= 0 || distance > randomMaxReport {
		return domain.Fail("INVALID_COMMAND", "里程上报无效", 400)
	}
	s.ExploreDistance += distance
	for s.ExploreDistance >= randomCheckSegment {
		s.ExploreDistance -= randomCheckSegment
		id, triggered, err := g.drawRandomEvent(*s)
		if err != nil {
			return err
		}
		if triggered {
			s.Phase = "event"
			s.PendingEventID = id
			s.PendingEventSource = "random"
			s.DrawnEvents = domain.Add(s.DrawnEvents, drawnKey(s.MapID, id))
			s.ExploreDistance = -randomGrace // 触发后的冷却保护
			s.LastResult = domain.Result{Message: "巷子里的风停了一下——好像有什么要发生了。"}
			return nil
		}
	}
	return nil
}

// drawnEvents 按"区域:事件"记录:无放回是区域池语义,同一事件挂多个区域时互不影响。
// 旧存档的裸事件 ID 不匹配新键,等于该卡可再抽一次,无迁移成本。
func drawnKey(mapID, eventID string) string { return mapID + ":" + eventID }

// 从当前区域的随机池抽卡:排除已抽卡的机遇/风险事件,危险度决定是否触发与抽哪一类。
func (g *Game) drawRandomEvent(s domain.GameState) (string, bool, error) {
	danger := 0
	for _, m := range g.Catalog.Maps {
		if m.ID == s.MapID {
			danger = m.DangerLevel
		}
	}
	if danger < 0 {
		danger = 0
	}
	if danger > 3 {
		danger = 3
	}
	var risks, opportunities []string
	for _, e := range g.Catalog.Events {
		if !domain.Contains(e.Triggers, "random") || !domain.Contains(e.Maps, s.MapID) {
			continue
		}
		if domain.Contains(s.DrawnEvents, drawnKey(s.MapID, e.ID)) {
			continue
		}
		switch e.Category {
		case "risk":
			risks = append(risks, e.ID)
		case "opportunity":
			opportunities = append(opportunities, e.ID)
		}
	}
	if len(risks)+len(opportunities) == 0 {
		return "", false, nil // 区域池已抽干,这段路安全了。
	}
	roll, err := g.Random(1000)
	if err != nil {
		return "", false, err
	}
	if roll >= g.triggerChance(danger) {
		return "", false, nil
	}
	pool := opportunities
	roll, err = g.Random(1000)
	if err != nil {
		return "", false, err
	}
	if roll < g.riskShare(danger) {
		pool = risks
	}
	if len(pool) == 0 {
		pool = opportunities
	}
	if len(pool) == 0 {
		return "", false, nil
	}
	index, err := g.Random(len(pool))
	if err != nil {
		return "", false, err
	}
	return pool[index], true, nil
}
