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
	poolSize := 5 // alley 随机池:鼠群/黑影/捕兽夹/麻袋(风险)+ 猫粮碗(机遇)
	drawn := map[string]bool{}
	for i := 0; i < 90 && len(drawn) < poolSize; i++ {
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
		// 带局势的失败(如麻袋诱饵)会跳剧情节点:推完剧情、回探索继续抽。
		if s.Phase == "dialogue" {
			s = finishStory(t, g, token)
		}
		if s.Phase == "preparation" {
			s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "alley"})
		}
		if s.Phase != "explore" {
			t.Fatalf("expected explore after resolving %s, got %s", id, s.Phase)
		}
	}
	if len(drawn) != poolSize {
		t.Fatalf("expected %d unique draws, got %v", poolSize, drawn)
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
			if s.Phase == "dialogue" {
				s = finishStory(t, g, token)
			}
			if s.Phase == "preparation" {
				s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "alley"})
			}
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
			s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: other, OptionID: optionID})
			if s.Phase == "dialogue" {
				s = finishStory(t, g, token)
			}
			if s.Phase == "preparation" {
				s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "alley"})
			}
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

// 团子·讨生活:觅食类失败保底成功奖励一半(向上取整);非觅食事件不保底。
func TestTuanziForageFallbackOnFail(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	// 随机数恒 0:过完保护期(4 段)后必触发风险池第一张 rats_grain_event。
	s := domain.GameState{}
	for i := 0; i < 10; i++ {
		s = execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase == "event" {
			break
		}
	}
	if s.PendingEventID != "rats_grain_event" {
		t.Fatalf("expected rats card, got %q phase=%s", s.PendingEventID, s.Phase)
	}
	base := s.Inventory["food"] + s.Inventory["material"] + s.Currencies["stamp"]
	// 骰出 [1,1] 失败档;negotiate_share 成功档 material:2 → 保底 (2+1)/2 = 1。
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "rats_grain_event", OptionID: "negotiate_share"})
	if s.Inventory["material"] != base+1 || s.Phase != "explore" {
		t.Fatalf("forage fallback not granted: material=%d(+want 1) phase=%s", s.Inventory["material"], s.Phase)
	}
	if !domain.Contains(s.Flags, "tuanzi_provided") || s.LastResult.Message == "" {
		t.Fatal("fallback flag or message missing")
	}
	// 对照:非觅食(shadow)失败不保底——shadow_glimpse fail 无奖励、无标记。
	for i := 0; i < 60; i++ {
		s = execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase == "event" {
			break
		}
	}
	if s.PendingEventID != "shadow_glimpse_event" {
		t.Fatalf("expected shadow card, got %s", s.PendingEventID)
	}
	materials := s.Inventory["material"]
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "shadow_glimpse_event", OptionID: "take_detour"})
	if s.Inventory["material"] != materials || s.Phase != "explore" {
		t.Fatal("non-forage fail should not grant fallback")
	}
}

// 平衡表内容驱动:catalog 里 eventsBalance 优先于代码常量——把触发概率设为 1(千分之一),
// 骰点恒 1 时不应触发;若回落到常量 120,恒 1 必触发,测试即失败。
func TestEventsBalanceFromCatalogTakesPrecedence(t *testing.T) {
	g, token, _ := setup(t)
	g.Catalog.EventsBalance = []domain.EventBalance{
		{DangerLevel: 0, TriggerChance: 1, RiskShare: 1},
		{DangerLevel: 1, TriggerChance: 1, RiskShare: 1},
		{DangerLevel: 2, TriggerChance: 1, RiskShare: 1},
		{DangerLevel: 3, TriggerChance: 1, RiskShare: 1},
	}
	g.Random = func(int) (int, error) { return 1, nil }
	finishStory(t, g, token)
	for i := 0; i < 20; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase == "event" {
			t.Fatal("catalog balance (1/1000) should beat roll=1; constant fallback (120) would have fired")
		}
	}
}

// 选项级 requireCat:队伍没有对应伙伴时服务端拒绝(前端同样隐藏);有伙伴时放行。
func TestRequireCatOptionGating(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
	// 队伍是 miaomiao+tuanzi;把 crate 首选项临时标记需要 momo → 拒绝。
	for i := range g.Catalog.Events {
		if g.Catalog.Events[i].ID == "crate_event" {
			g.Catalog.Events[i].Options[0].RequireCat = "momo"
		}
	}
	s, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	rev := s.Revision
	if _, err = g.Execute(token, "locked-option", domain.CommandRequest{ExpectedRevision: &rev, Command: domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"}}); err == nil {
		t.Fatal("requireCat option accepted without the cat")
	}
	// 换成队伍已有的 tuanzi → 放行并正常结算。
	for i := range g.Catalog.Events {
		if g.Catalog.Events[i].ID == "crate_event" {
			g.Catalog.Events[i].Options[0].RequireCat = "tuanzi"
		}
	}
	rev = s.Revision
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"})
	// 恒 0 骰出 [1,1] 失败档,crate 的 fail 带局势跳转剧情;关键是命令被接受并正常结算。
	if s.Phase != "preparation" && s.Phase != "dialogue" {
		t.Fatalf("requireCat option with the cat should resolve, got %s", s.Phase)
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
