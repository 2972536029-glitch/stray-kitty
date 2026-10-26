package service_test

import (
	"strings"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
)

func useMarketRandomPool(t *testing.T, g *service.Game, token string) domain.GameState {
	t.Helper()
	for index := range g.Catalog.Events {
		if domain.Contains(g.Catalog.Events[index].Triggers, "random") {
			g.Catalog.Events[index].Maps = domain.Add(g.Catalog.Events[index].Maps, "market")
		}
	}
	return execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "market"})
}

// 进入探索后有保护里程;保护期内上报不触发,过保护后危险度 1 必触发(随机数恒为 0)。
func TestRandomEventTriggersAfterGraceAndReturnsToExplore(t *testing.T) {
	g, token, _ := setup(t)
	s := finishStory(t, g, token)
	s = useMarketRandomPool(t, g, token)
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
	if !domain.Contains(s.DrawnEvents, "market:rats_grain_event") {
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
	dropRepeatable(g)
	finishStory(t, g, token)
	// 雨巷已禁用 REPORT_MOVE 触发(改区域判定),无放回语义在 market 池上验证。
	useMarketRandomPool(t, g, token)
	// 恒 0 骰子永远是 fail 档,RequiresFlags 集不齐的卡不进池,池大小按无门槛卡算。
	poolSize := 0
	for _, e := range g.Catalog.Events {
		if domain.Contains(e.Triggers, "random") && domain.Contains(e.Maps, "market") && len(e.RequiresFlags) == 0 {
			poolSize++
		}
	}
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
			s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "market"})
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
	dropRepeatable(g)
	// 临时克隆一张双区域随机卡进目录(不影响磁盘内容;设为 risk 以进入恒 0 随机数必选的风险池)。
	g.Catalog.Events = append(g.Catalog.Events, g.Catalog.Events[len(g.Catalog.Events)-1])
	dual := &g.Catalog.Events[len(g.Catalog.Events)-1]
	dual.ID = "shared_event"
	dual.Triggers = []string{"random"}
	dual.Category = "risk"
	dual.RequiresFlags = nil // 克隆源可能带门槛,清掉避免继承
	dual.Repeatable = false  // 克隆源可能是回响卡,清掉保持无放回语义
	for i := range dual.Options {
		dual.Options[i].ID = dual.Options[i].ID + "_s"
	}
	dual.Maps = []string{"market", "market_copy"}
	g.Catalog.Maps = append(g.Catalog.Maps, domain.Map{ID: "market_copy", DangerLevel: 1})
	finishStory(t, g, token)
	useMarketRandomPool(t, g, token)
	// 在 market 抽到共享卡。
	found := false
	for i := 0; i < 60 && !found; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase != "event" {
			continue
		}
		if s.PendingEventID == "shared_event" {
			found = true
			if !domain.Contains(s.DrawnEvents, "market:shared_event") {
				t.Fatal("shared event not keyed by region")
			}
			s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "shared_event", OptionID: dual.Options[0].ID})
			if s.Phase == "dialogue" {
				s = finishStory(t, g, token)
			}
			if s.Phase == "preparation" {
				s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "market"})
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
				s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "market"})
			}
		}
	}
	if !found {
		t.Fatal("shared event never drawn in market")
	}
	// 换到 market_copy,同一张卡必须还能抽到。
	execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "market_copy"})
	drewAgain := false
	for i := 0; i < 60 && !drewAgain; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase == "event" && s.PendingEventID == "shared_event" {
			drewAgain = true
			if !domain.Contains(s.DrawnEvents, "market_copy:shared_event") {
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
	useMarketRandomPool(t, g, token)
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
	if !domain.Contains(s.Flags, "tuanzi_provided") || !strings.Contains(s.LastResult.Message, "翻找了一圈") {
		t.Fatal("fallback flag or appended message missing (message must reach client)")
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
	useMarketRandomPool(t, g, token)
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

// 事件链:前置 flag 未集齐时后续卡不进池;集齐(麻袋 crit 放走小猫)后可抽到。
// 随机数定制:骰子恒 [6,6](crit);抽卡按段内序——触发必中、配比恒选机遇池、索引取第一张。
func TestEventChainRequiresFlags(t *testing.T) {
	g, token, _ := setup(t)
	dropRepeatable(g)
	seq := 0
	g.Random = func(max int) (int, error) {
		if max == 6 {
			return 5, nil
		}
		seq++
		if seq%3 == 2 {
			return max - 1, nil
		}
		return 0, nil
	}
	finishStory(t, g, token)
	useMarketRandomPool(t, g, token)
	optionFor := func(id string) string {
		if id == "moving_sack_event" {
			return "watch_first" // crit 档写 sack_cat_freed
		}
		for _, e := range g.Catalog.Events {
			if e.ID == id {
				return e.Options[0].ID
			}
		}
		return ""
	}
	sawChain := false
	var saw string
	for i := 0; i < 70; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase != "event" {
			continue
		}
		id := s.PendingEventID
		if id == "wall_kitten_event" {
			if !domain.Contains(s.Flags, "sack_cat_freed") {
				t.Fatal("chain card drawn before its flag")
			}
			sawChain = true
			break
		}
		if saw == "" {
			saw = id
		}
		s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: id, OptionID: optionFor(id)})
		for s.Phase == "dialogue" {
			s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
		}
		if s.Phase == "preparation" {
			s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "market"})
		}
	}
	if !sawChain {
		t.Fatal("chain card never became drawable after flag was set")
	}
	_ = saw
}

// 叙事门控卡:rats_truce(与鼠群分粮)集齐后,《鼠群的回礼》才可能出现在巷子池里。
func TestNarrativeGatedCardDrawnAfterFlag(t *testing.T) {
	g, token, _ := setup(t)
	dropRepeatable(g) // market 池里的回响卡会挤占恒定骰子的抽卡位,滤掉保持确定性
	g.Random = func(max int) (int, error) {
		if max == 6 {
			return 5, nil // 骰子恒 [6,6] crit
		}
		return 0, nil // 触发必中、配比选风险池、索引取第一张
	}
	finishStory(t, g, token)
	useMarketRandomPool(t, g, token)
	optionFor := func(id string) string {
		switch id {
		case "rats_grain_event":
			return "negotiate_share" // crit 写 rats_truce
		case "moving_sack_event":
			return "watch_first"
		default:
			for _, e := range g.Catalog.Events {
				if e.ID == id {
					return e.Options[0].ID
				}
			}
			return ""
		}
	}
	gotGift := false
	for i := 0; i < 80 && !gotGift; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase != "event" {
			continue
		}
		if s.PendingEventID == "rats_gift_event" {
			if !domain.Contains(s.Flags, "rats_truce") {
				t.Fatal("gift card drawn before truce flag")
			}
			gotGift = true
			break
		}
		s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: s.PendingEventID, OptionID: optionFor(s.PendingEventID)})
		for s.Phase == "dialogue" {
			s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
		}
		if s.Phase == "preparation" {
			s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "market"})
		}
	}
	if !gotGift {
		t.Fatal("narrative-gated card never drawn after flag was set")
	}
}

// 节点事件一次性:market 的摊位事件结算后重触发被拒(修复无限重掷刷奖励)。
func TestNodeEventOneShot(t *testing.T) {
	g, token, _ := setup(t)
	execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	s, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	for s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "market_crow_stall"})
	if s.Phase != "event" || s.PendingEventID != "crow_intel_event" {
		t.Fatalf("first interact failed: %s %s", s.Phase, s.PendingEventID)
	}
	s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crow_intel_event", OptionID: "trade_fish"})
	if s.Phase == "dialogue" {
		s = finishStory(t, g, token)
	}
	s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "market"})
	rev := s.Revision
	if _, err = g.Execute(token, "crow-again", domain.CommandRequest{ExpectedRevision: &rev, Command: domain.Command{Type: "INTERACT", InteractionID: "market_crow_stall"}}); err == nil {
		t.Fatal("repeat interact with crow stall was accepted")
	}
}

// 随机卡结算选项速查(测试用:各卡第一个温和选项)。
func resolveOption(id string) string {
	switch id {
	case "moving_sack_event":
		return "watch_first"
	case "feeder_bowl_event":
		return "feast_here"
	case "shadow_glimpse_event":
		return "stand_ground"
	case "trap_snap_event":
		return "climb_wall"
	case "dark_meow_event":
		return "follow_voice"
	case "fish_thief_event":
		return "track_pawprints"
	default:
		return "intercept"
	}
}

// 无放回/链语义的老测试滤掉 repeatable 回响卡(它们永不抽干,是另一套语义)。
func dropRepeatable(g *service.Game) {
	kept := g.Catalog.Events[:0]
	for _, e := range g.Catalog.Events {
		if !e.Repeatable {
			kept = append(kept, e)
		}
	}
	g.Catalog.Events = kept
}

// 伙伴鼓励:usePush 掷两组取优(低组 [1,1] 被高组 [6,6] 替换→crit),消耗 token;无 token 明确拒绝。
func TestCompanionPushTakesBetterPair(t *testing.T) {
	g, token, _ := setup(t)
	calls := 0
	g.Random = func(max int) (int, error) {
		calls++
		if calls <= 2 {
			return 0, nil // 第一组 [1,1]
		}
		return 5, nil // 鼓励组 [6,6]
	}
	finishStory(t, g, token)
	execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
	s := execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search", UsePush: true})
	res := s.EventState.LastResolution
	if res.Tier != "crit" || res.Dice != [2]int{6, 6} {
		t.Fatalf("push should take the better pair, got %v (%s)", res.Dice, res.Tier)
	}
	if s.PushTokens != 0 {
		t.Fatalf("push token not spent, left %d", s.PushTokens)
	}
	// 同一局再触发一个事件,无 token 时 usePush 被明确拒绝(409)。
	s = execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	for s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	s = execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "market_crow_stall"})
	rev := s.Revision
	if _, err := g.Execute(token, "push-empty", domain.CommandRequest{ExpectedRevision: &rev, Command: domain.Command{Type: "CHOOSE_EVENT", EventID: "crow_intel_event", OptionID: "trade_fish", UsePush: true}}); err == nil {
		t.Fatal("push without token accepted")
	}
}

// 回响卡 repeatable:不占无放回名额,可重复抽到。
func TestRepeatableEchoCard(t *testing.T) {
	g, token, _ := setup(t)
	for i := range g.Catalog.Events {
		if g.Catalog.Events[i].ID == "feeder_bowl_event" {
			g.Catalog.Events[i].Repeatable = true
		}
	}
	finishStory(t, g, token)
	useMarketRandomPool(t, g, token)
	seen := 0
	for i := 0; i < 120 && seen < 2; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase != "event" {
			continue
		}
		if s.PendingEventID == "feeder_bowl_event" {
			seen++
			if domain.Contains(s.DrawnEvents, "market:feeder_bowl_event") {
				t.Fatal("repeatable card should not enter drawnEvents")
			}
		}
		s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: s.PendingEventID, OptionID: resolveOption(s.PendingEventID)})
		for s.Phase == "dialogue" {
			s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
		}
		if s.Phase == "preparation" {
			s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "market"})
		}
	}
	if seen < 2 {
		t.Fatal("repeatable card not drawn twice")
	}
}

// 换章重置:进入第二章后,小巷已抽卡清空(区域换了新鲜事)。
func TestChapterSwitchResetsDrawn(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	useMarketRandomPool(t, g, token)
	for i := 0; i < 60; i++ {
		s := execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase == "event" {
			execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: s.PendingEventID, OptionID: resolveOption(s.PendingEventID)})
			break
		}
	}
	before, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	if len(before.DrawnEvents) == 0 {
		t.Skip("no card drawn before chapter switch")
	}
	s := execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	if s.ChapterID != "market" || len(s.DrawnEvents) != 0 {
		t.Fatalf("chapter switch should reset drawn events: chapter=%s drawn=%v", s.ChapterID, s.DrawnEvents)
	}
}

// 鼓励稀缺性:token 只在首次守护成功发放,重复通关不回(防零成本刷满)。
func TestRepeatWinDoesNotRefundPush(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
	// 掷骰用掉初始 1 枚(token→0),fail 档进 chase 剧情后推进到布防。
	s := execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search", UsePush: true})
	for s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	if s.PushTokens != 0 {
		t.Fatalf("initial token should be spent, got %d", s.PushTokens)
	}
	s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"})
	if s.PushTokens != 1 {
		t.Fatalf("first win should refund to 1, got %d", s.PushTokens)
	}
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	for s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	// 第二次胜利:非首通,不回 token。
	s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"})
	if s.PushTokens != 1 {
		t.Fatalf("repeat win must not refund push, got %d", s.PushTokens)
	}
}

// 回跳章节不清池:只有章节序前进才重置,来回跳无法刷新鲜度。
func TestBackwardChapterJumpKeepsDrawn(t *testing.T) {
	g, token, _ := setup(t)
	dropRepeatable(g)
	execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	s, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	for s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	for i := 0; i < 60; i++ {
		s = execute(t, g, token, domain.Command{Type: "REPORT_MOVE", Distance: 150})
		if s.Phase == "event" {
			execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: s.PendingEventID, OptionID: resolveOption(s.PendingEventID)})
			break
		}
	}
	before, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	if len(before.DrawnEvents) == 0 {
		t.Skip("no card drawn")
	}
	// 回跳到序章/小巷的节点:章节序后退,已抽卡保留。
	s = execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "prologue_tuanzi"})
	if len(s.DrawnEvents) != len(before.DrawnEvents) {
		t.Fatalf("backward jump must keep drawn events: %d -> %d", len(before.DrawnEvents), len(s.DrawnEvents))
	}
}

// 概率未中时里程照常累积,阶段保持探索。
func TestReportMoveNoTriggerKeepsExploring(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	useMarketRandomPool(t, g, token)
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

// 第三章废弃花房剧情推进与墨墨入队解锁测试。
func TestChapter3GreenhouseProgressionAndMomoUnlock(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Flags = domain.Add(p.State.Flags, "alley_rescued")
		p.State.Flags = domain.Add(p.State.Flags, "rescue_story_done")
		p.State.Phase = "home"
		p.State.MapID = "greenhouse"
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	// 解锁第二章集市
	s := execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	for s.StoryNodeID != "" && s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	if !domain.Contains(s.Flags, "chapter_2_started") {
		t.Fatal("expected chapter_2_started")
	}
	// 回到花房
	s = execute(t, g, token, domain.Command{Type: "GO_HOME"})
	if s.Phase != "home" || s.MapID != "greenhouse" {
		t.Fatalf("expected home phase in greenhouse, got phase=%s map=%s", s.Phase, s.MapID)
	}
	// 启程第三章
	s = execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "greenhouse_intro_1"})
	if s.Phase != "dialogue" || s.ChapterID != "greenhouse" {
		t.Fatalf("expected dialogue phase in greenhouse, got phase=%s chapter=%s", s.Phase, s.ChapterID)
	}
	for s.StoryNodeID != "" && s.Phase == "dialogue" {
		s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	if s.Phase != "home" {
		t.Fatalf("expected return to home phase after chapter 3 story, got %s", s.Phase)
	}
	if !domain.Contains(s.Flags, "chapter_3_started") {
		t.Fatal("expected chapter_3_started flag")
	}
	if !domain.Contains(s.Flags, "momo_joined") {
		t.Fatal("expected momo_joined flag")
	}
	if !domain.Contains(s.Cats, "momo") {
		t.Fatal("expected momo in cats list")
	}
}
