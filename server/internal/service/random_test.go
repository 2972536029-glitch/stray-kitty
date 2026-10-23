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
	if !domain.Contains(s.DrawnEvents, "alley:rats_grain_event") {
		t.Fatal("drawn event not recorded with region key")
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

// 同一事件挂两个区域:在一个区域抽过,另一个区域仍可抽到(区域池语义)。
func TestDrawnEventsArePerRegion(t *testing.T) {
	g, token, _ := setup(t)
	// 临时克隆一张双区域随机卡进目录(不影响磁盘内容;设为 risk 以进入恒 0 随机数必选的风险池)。
	g.Catalog.Events = append(g.Catalog.Events, g.Catalog.Events[len(g.Catalog.Events)-1])
	dual := &g.Catalog.Events[len(g.Catalog.Events)-1]
	dual.ID = "shared_event"
	dual.Triggers = []string{"random"}
	dual.Category = "risk"
	for i := range dual.Options {
		dual.Options[i].ID = dual.Options[i].ID + "_s"
	}
	dual.Maps = []string{"alley", "alley_copy"}
	g.Catalog.Maps = append(g.Catalog.Maps, domain.Map{ID: "alley_copy", DangerLevel: 1})
	finishStory(t, g, token)
	// 在 alley 抽到共享卡。
	found := false
	for i := 0; i < 60 && !found; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase != "event" {
			continue
		}
		if s.PendingEventID == "shared_event" {
			found = true
			if !domain.Contains(s.DrawnEvents, "alley:shared_event") {
				t.Fatal("shared event not keyed by region")
			}
			s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "shared_event", OptionID: dual.Options[0].ID})
			if s.Phase != "explore" {
				t.Fatal("expected explore after resolving shared event")
			}
		} else {
			other := s.PendingEventID
			optionID := ""
			for _, e := range g.Catalog.Events {
				if e.ID == other {
					optionID = e.Options[0].ID
				}
			}
			execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: other, OptionID: optionID})
		}
	}
	if !found {
		t.Fatal("shared event never drawn in alley")
	}
	// 换到 alley_copy,同一张卡必须还能抽到。
	execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "alley_copy"})
	drewAgain := false
	for i := 0; i < 60 && !drewAgain; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase == "event" && s.PendingEventID == "shared_event" {
			drewAgain = true
			if !domain.Contains(s.DrawnEvents, "alley_copy:shared_event") {
				t.Fatal("second region draw not keyed correctly")
			}
		} else if s.Phase == "event" {
			execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: s.PendingEventID, OptionID: "intercept"})
		}
	}
	if !drewAgain {
		t.Fatal("shared event should be drawable again in another region")
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
