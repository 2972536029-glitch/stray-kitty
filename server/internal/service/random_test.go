package service_test

import (
	"stray-kitty/server/internal/domain"
	"testing"
)

// 进入探索后有保护里程;保护期内上报不触发,过保护后危险度 1 必触发(随机数恒为 0)。
func TestRandomEventTriggersAfterGraceAndReturnsToExplore(t *testing.T) {
	g, token, _ := setup(t)
	s := finishStory(t, g, token)
	if s.Phase != "explore" {
		t.Fatalf("expected explore, got %s", s.Phase)
	}
	// 保护距离 600:四段上报(600)都在保护期内,不触发。
	for i := 0; i < 4; i++ {
		s = execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
	}
	if s.Phase != "explore" || s.PendingEventID != "" {
		t.Fatal("random event fired inside grace distance")
	}
	s = execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
	if s.Phase != "event" || s.PendingEventID != "rats_grain_event" || s.PendingEventSource != "random" {
		t.Fatalf("random event did not trigger as expected: phase=%s pending=%s source=%s", s.Phase, s.PendingEventID, s.PendingEventSource)
	}
	if !domain.Contains(s.DrawnEvents, "rats_grain_event") {
		t.Fatal("drawn event not recorded")
	}
	// 随机数恒 0 → 骰出 [1,1] 失败档;失败无局势时应回到探索并重新进入保护期。
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "rats_grain_event", OptionID: "negotiate_share"})
	if s.Phase != "explore" {
		t.Fatalf("random event should return to explore, got %s", s.Phase)
	}
	if s.PendingEventSource != "" {
		t.Fatal("pending source not cleared after resolution")
	}
}

// 无放回:区域池抽干后不再触发;节点事件(来源 node)结算仍走向准备阶段。
func TestRandomPoolDrainsWithoutRepeat(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	drawn := map[string]bool{}
	for i := 0; i < 40 && len(drawn) < 3; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase != "event" {
			continue
		}
		id := s.PendingEventID
		if drawn[id] {
			t.Fatalf("event %s drawn twice", id)
		}
		drawn[id] = true
		optionID := ""
		for _, e := range g.Catalog.Events {
			if e.ID == id {
				optionID = e.Options[0].ID
			}
		}
		s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: id, OptionID: optionID})
		if s.Phase != "explore" {
			t.Fatalf("expected explore after resolving %s, got %s", id, s.Phase)
		}
	}
	if len(drawn) != 3 {
		t.Fatalf("expected 3 unique draws, got %v", drawn)
	}
	for i := 0; i < 6; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase == "event" {
			t.Fatal("empty pool still triggered")
		}
	}
}

// 概率未中时里程照常累积,阶段保持探索。
func TestReportMoveNoTriggerKeepsExploring(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	g.Random = func(max int) (int, error) { return max - 1, nil } // 触发概率掷出最大值,永不命中
	for i := 0; i < 10; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase != "explore" || s.PendingEventID != "" {
			t.Fatal("no-trigger roll still fired an event")
		}
	}
}

// 里程参数与阶段校验。
func TestReportMoveRejectsInvalidInput(t *testing.T) {
	g, token, _ := setup(t)
	fresh, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	rev := fresh.Revision // 序章对话阶段
	if _, err = g.Execute(token, "move-in-dialogue", domain.CommandRequest{ExpectedRevision: &rev, Command: domain.Command{Type: "REPORT_MOVE", Distance: 150}}); err == nil {
		t.Fatal("REPORT_MOVE accepted outside explore")
	}
	finishStory(t, g, token)
	base, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	for _, distance := range []int{0, -10, 301} {
		attempt := base.Revision
		if _, err = g.Execute(token, "invalid-move", domain.CommandRequest{ExpectedRevision: &attempt, Command: domain.Command{Type: "REPORT_MOVE", Distance: distance}}); err == nil {
			t.Fatalf("distance %d accepted", distance)
		}
	}
}
