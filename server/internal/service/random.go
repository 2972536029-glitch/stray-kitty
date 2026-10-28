package service

import (
	"log/slog"

	"stray-kitty/server/internal/domain"
)

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

func (g *Game) echoShare() int {
	for _, b := range g.Catalog.EventsBalance {
		if b.EchoShare > 0 {
			return b.EchoShare
		}
	}
	return 333
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
	if s.MapID == "alley" {
		return nil
	}
	s.ExploreDistance += distance
	for s.ExploreDistance >= randomCheckSegment {
		s.ExploreDistance -= randomCheckSegment
		id, triggered, repeatable, err := g.drawRandomEvent(*s)
		if err != nil {
			return err
		}
		if triggered {
			s.Phase = "event"
			s.PendingEventID = id
			s.PendingEventSource = "random"
			if !repeatable {
				s.DrawnEvents = domain.Add(s.DrawnEvents, drawnKey(s.MapID, id))
			}
			s.ExploreDistance = -randomGrace // 触发后的冷却保护
			s.LastResult = domain.Result{Message: "巷子里的风停了一下——好像有什么要发生了。"}
			// 观测埋点(README §9):不含玩家身份,后续接 Datadog 时替换 handler 即可。
			slog.Info("event_random_trigger", "mapId", s.MapID, "eventId", id)
			return nil
		}
	}
	return nil
}

// drawnEvents 按"区域:事件"记录:无放回是区域池语义,同一事件挂多个区域时互不影响。
// 旧存档的裸事件 ID 不匹配新键,等于该卡可再抽一次,无迁移成本。
func drawnKey(mapID, eventID string) string { return mapID + ":" + eventID }

// 从当前区域的随机池抽卡:排除已抽卡的机遇/风险事件,危险度决定是否触发与抽哪一类。
func (g *Game) drawRandomEvent(s domain.GameState) (string, bool, bool, error) {
	return g.drawRandomEventWithChance(s, -1)
}

// checkRandomZone rolls when the player enters a Rainy Alley random zone.
// The client edge-triggers entry; the shared deck enforces card prerequisites and no-replacement.
func (g *Game) checkRandomZone(s *domain.GameState, zoneID string) error {
	if err := domain.RequirePhase(*s, "explore"); err != nil {
		return err
	}
	if s.MapID != "alley" {
		return domain.Fail("INVALID_COMMAND", "随机区域不属于当前地图", 400)
	}
	switch zoneID {
	case "rainy_random_west", "rainy_random_central", "rainy_random_east":
	default:
		return domain.Fail("INVALID_COMMAND", "随机区域无效", 400)
	}
	id, triggered, repeatable, err := g.drawRandomEventWithChance(*s, g.RainyZoneChance)
	if err != nil {
		return err
	}
	if triggered {
		s.Phase = "event"
		s.PendingEventID = id
		s.PendingEventSource = "random"
		if !repeatable {
			s.DrawnEvents = domain.Add(s.DrawnEvents, drawnKey(s.MapID, id))
		}
		s.LastResult = domain.Result{Message: "巷子里的风停了一下——好像有什么要发生了。"}
	}
	return nil
}

// 第三个返回值:该卡是否为可重复的回响卡(repeatable,不占无放回名额)。
// triggerChance<0 时按危险度取默认/balance 覆盖值,>=0 时强制指定(雨巷区域判定用)。
func (g *Game) drawRandomEventWithChance(s domain.GameState, triggerChance int) (string, bool, bool, error) {
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
	// 回响卡参与门槛(balance.json 的 echoShare,千分比):近零奖励的氛围卡不稀释主要遭遇。
	echoShare := g.echoShare()
	isEcho := map[string]bool{}
	for _, e := range g.Catalog.Events {
		if !domain.Contains(e.Triggers, "random") || !domain.Contains(e.Maps, s.MapID) {
			continue
		}
		isEcho[e.ID] = e.Repeatable
		if e.Repeatable {
			roll, err := g.Random(1000)
			if err != nil {
				return "", false, false, err
			}
			if roll >= echoShare {
				continue
			}
		}
		// 事件链:前置 flag 未集齐的后续卡不进池(与已抽卡一样跳过)。
		chainReady := true
		for _, flag := range e.RequiresFlags {
			if !domain.Contains(s.Flags, flag) {
				chainReady = false
				break
			}
		}
		if !chainReady {
			continue
		}
		if domain.Contains(s.DrawnEvents, drawnKey(s.MapID, e.ID)) && !e.Repeatable {
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
		return "", false, false, nil // 区域池已抽干,这段路安全了。
	}
	if triggerChance < 0 {
		triggerChance = g.triggerChance(danger)
	}
	if triggerChance < 0 {
		triggerChance = 0
	}
	if triggerChance > 1000 {
		triggerChance = 1000
	}
	roll, err := g.Random(1000)
	if err != nil {
		return "", false, false, err
	}
	if roll >= triggerChance {
		return "", false, false, nil
	}
	pool := opportunities
	roll, err = g.Random(1000)
	if err != nil {
		return "", false, false, err
	}
	if roll < g.riskShare(danger) {
		pool = risks
	}
	if len(pool) == 0 {
		pool = opportunities
	}
	if len(pool) == 0 {
		return "", false, false, nil
	}
	index, err := g.Random(len(pool))
	if err != nil {
		return "", false, false, err
	}
	id := pool[index]
	return id, true, isEcho[id], nil
}
