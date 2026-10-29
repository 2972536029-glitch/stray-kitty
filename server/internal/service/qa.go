package service

import (
	"encoding/json"
	"strings"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
)

type QACheckpoint struct {
	ID        string `json:"id"`
	ChapterID string `json:"chapterId"`
	Title     string `json:"title"`
	Phase     string `json:"phase"`
	MapID     string `json:"mapId"`
	Kind      string `json:"kind"`
	Detail    string `json:"detail"`
}

type QATools struct {
	Enabled     bool           `json:"enabled"`
	Checkpoints []QACheckpoint `json:"checkpoints"`
}

func (g *Game) QATools(token string) (QATools, error) {
	if _, err := g.State(token); err != nil {
		return QATools{}, err
	}
	tools := QATools{Enabled: g.QAVictoryEnabled, Checkpoints: []QACheckpoint{}}
	if tools.Enabled {
		tools.Checkpoints = g.qaCheckpoints()
	}
	return tools, nil
}

// These are test fixtures, not alternative game rules. All battle entry and
// settlement still run the existing service functions with their real gates.
func (g *Game) qaCheckpoints() []QACheckpoint {
	list := []QACheckpoint{
		{"prologue.story", "prologue", "金枪鱼故事", "dialogue", "alley", "story", "从开场对白开始，读完后进入教学战。"},
		{"prologue.battle", "prologue", "六波教学战", "battle", "alley", "battle", "直接进入序章教学，胜负后继续正常结算。"},
		{"alley.story", "alley", "遇见团子", "dialogue", "alley", "story", "教学已完成，开始第一章对白。"},
		{"alley.explore", "alley", "雨巷探索", "explore", "alley", "explore", "点点尚未获救，可调查纸箱、经历事件与救援。"},
		{"alley.battle", "alley", "营救点点", "battle", "alley", "battle", "已发现纸箱里的伙伴，进入真实救援场次。"},
		{"alley.poster", "alley", "寻猫启事与安家", "dialogue", "alley", "story", "救援已完成，从寻猫启事走到第一次返回花房。"},
		{"market.story", "market", "午夜集市剧情", "dialogue", "market", "story", "已完成小巷救援与寻猫启事。"},
		{"market.explore", "market", "三层集市探索", "explore", "market", "explore", "从南侧入口开始，调查两条情报和墨墨踪迹。"},
		{"market.battle", "market", "集市保卫战", "battle", "market", "battle", "补齐两条情报并从北侧防线启动主线战斗。"},
		{"market.exit", "market", "北街出口", "explore", "market", "explore", "集市防线已守住，可实际走向北街出口开启第三章。"},
		{"greenhouse.story", "greenhouse", "墨墨登场与伙伴分工", "dialogue", "greenhouse", "story", "集市已通关并离开北街，从第三章第一句对白开始。"},
		{"greenhouse.home_1", "greenhouse", "初建花房 · 漏雨", "home", "greenhouse", "home", "伙伴已汇合，备有修缮材料，可从第一阶实际修缮。"},
		{"greenhouse.home_2", "greenhouse", "封窗止水 · 二阶", "home", "greenhouse", "home", "已完成第一项修缮，可继续搭建原木温室。"},
		{"greenhouse.home_3", "greenhouse", "原木温室 · 三阶", "home", "greenhouse", "home", "家具与全部位置已备齐，可验收摆放、猫咪互动和地图。"},
		{"greenhouse.battle", "greenhouse", "花房防御试玩", "battle", "greenhouse", "battle", "独立战斗试玩，结算保持现有主线规则。"},
		{"rescue.story", "rescue", "进入地下暗道", "dialogue", "tunnel", "story", "花房防线前置已满足，读完后进入实际暗道地图。"},
		{"rescue.explore", "rescue", "暗道探索", "explore", "tunnel", "explore", "调查诱饵与第三阀，走到出口后触发主线战斗。"},
		{"rescue.battle", "rescue", "暗道出口守护", "battle", "tunnel", "battle", "已调查诱饵与第三阀，从真实出口位置启动主线场次。"},
		{"rescue.after", "rescue", "营救后护送回家", "dialogue", "tunnel", "story", "暗道战已完成，验收第十段对白及护送回家。"},
		{"finale.clue", "finale", "线索不足分支", "dialogue", "market", "story", "只有零条线索，听阿策分析后继续集市探索。"},
		{"finale.story", "finale", "终章剧情", "dialogue", "greenhouse", "story", "暗道救援结束且线索齐备，开始终章叙事。"},
		{"finale.explore", "finale", "仓库探索与灯光", "explore", "warehouse", "explore", "从仓库入口测试 L0/L1、灯光、事件与首领；固定事件可选。"},
		{"finale.exit", "finale", "仓库胜利后出口", "explore", "warehouse", "explore", "首领已击败，测试北侧闸门、隔间出口与花房结局。"},
		{"finale.battle", "finale", "总仓库决战试玩", "battle", "greenhouse", "battle", "进入已接入的独立终局战斗；仓库自由探索尚未开放。"},
		{"finale.celebration", "finale", "王国庆典与告别", "dialogue", "greenhouse", "story", "从庆典开始，检查告别站位与故事结束后的自由活动。"},
		{"finale.home", "finale", "流浪猫王国 · 四阶", "home", "greenhouse", "home", "终章已结束，检查庆典家园、家具和伙伴日常。"},
	}
	// Node cards get their map from the real interaction catalog; random cards
	// already declare their maps. No client coordinates or flags are trusted.
	chapters := map[string]string{"alley": "alley", "market": "market", "greenhouse": "greenhouse", "tunnel": "rescue", "warehouse": "finale"}
	for _, event := range g.Catalog.Events {
		maps := append([]string{}, event.Maps...)
		for _, m := range g.Catalog.Maps {
			for _, interaction := range m.Interactions {
				if interaction.EventID == event.ID {
					maps = domain.Add(maps, m.ID)
				}
			}
		}
		for _, mapID := range maps {
			if chapter := chapters[mapID]; chapter != "" {
				list = append(list, QACheckpoint{"event:" + mapID + ":" + event.ID, chapter, event.Title, "event", mapID, "event", "直接验收这张事件卡，自动备齐所需伙伴与条件；掷骰和后果仍走正常规则。"})
			}
		}
	}
	return list
}

func copyQAState(state domain.GameState) (domain.GameState, error) {
	data, err := json.Marshal(state)
	if err != nil {
		return domain.GameState{}, err
	}
	var copy domain.GameState
	err = json.Unmarshal(data, &copy)
	return copy, err
}

func finishQAEventPreview(s *domain.GameState) {
	if strings.HasPrefix(s.QACheckpointID, "event:") && s.Phase == "explore" && !domain.Contains([]string{"alley", "market", "tunnel", "warehouse"}, s.MapID) {
		// Cards for planned exploration maps return to the actual home scene.
		// Their rewards, flags and event result remain available for inspection.
		s.Phase, s.MapID = "home", "greenhouse"
	}
}

func (g *Game) applyQACheckpoint(p *repository.Player, command domain.Command) error {
	if command.Type == "QA_RESTORE" {
		if p.QARestore == nil {
			return domain.Fail("QA_NOT_ACTIVE", "当前没有需要返回的验收前进度", 409)
		}
		// Returning one's own progress remains possible if QA is later disabled.
		restored, err := copyQAState(*p.QARestore)
		if err != nil {
			return err
		}
		restored.Revision = p.State.Revision
		p.State, p.QARestore = restored, nil
		return nil
	}
	if !g.QAVictoryEnabled {
		return domain.Fail("QA_DISABLED", "服务端未开启验收工具", 403)
	}
	var checkpoint *QACheckpoint
	for _, item := range g.qaCheckpoints() {
		if item.ID == command.CheckpointID {
			copy := item
			checkpoint = &copy
			break
		}
	}
	if checkpoint == nil {
		return domain.Fail("INVALID_COMMAND", "验收节点不存在，请刷新验收面板", 400)
	}
	next, err := g.qaFixture(*checkpoint)
	if err != nil {
		return err
	}
	if p.QARestore == nil {
		original, err := copyQAState(p.State)
		if err != nil {
			return err
		}
		p.QARestore = &original
	}
	next.Revision = p.State.Revision
	next.QACheckpointID = checkpoint.ID
	p.State = next
	return nil
}

func (g *Game) qaFixture(checkpoint QACheckpoint) (domain.GameState, error) {
	s := domain.InitialState(g.Catalog.Version)
	rank := map[string]int{"prologue": 0, "alley": 1, "market": 2, "greenhouse": 3, "rescue": 4, "finale": 5}[checkpoint.ChapterID]
	s.Phase, s.ChapterID, s.MapID, s.StoryNodeID = checkpoint.Phase, checkpoint.ChapterID, checkpoint.MapID, ""
	s.Inventory = map[string]int{"material": 40, "food": 10, "clue": 3, "warm-can": 4, "bouncy-treat": 2}
	s.Currencies = map[string]int{"stamp": 10, "tuna": 120}
	s.PushTokens = 2
	addFlags := func(flags ...string) {
		for _, flag := range flags {
			s.Flags = domain.Add(s.Flags, flag)
		}
	}
	if rank >= 1 {
		addFlags("l00_completed")
		s.CompletedStages = domain.Add(s.CompletedStages, "l00_tutorial")
	}
	if rank >= 2 {
		addFlags("alley_rescued", "lost_poster_found", "rescue_story_done")
		s.Cats = domain.Add(s.Cats, "diandian")
		s.Furniture = domain.Add(s.Furniture, "cardboard_nest")
		s.CompletedStages = domain.Add(s.CompletedStages, "alley_rescue")
	}
	if rank >= 3 {
		addFlags("market_unlocked", "chapter_2_started", "market_crow_clue_completed", "market_pigeon_clue_completed", "market_cleared", "market_exit_crossed")
		s.CompletedStages = domain.Add(s.CompletedStages, "market_boss")
	}
	if rank >= 4 {
		addFlags("chapter_3_started", "momo_joined", "greenhouse_fortified", "greenhouse_sealed", "greenhouse_fortified_full")
		s.Cats = domain.Add(s.Cats, "momo")
	}
	if rank >= 5 {
		addFlags("chapter_4_started", "tunnel_unlocked", "tunnel_false_kitten_trap_found", "valve_three_investigated", "tunnel_boss_cleared", "tunnel_explored", "cats_rescued_batch1")
		s.CompletedStages = domain.Add(s.CompletedStages, "tunnel_boss")
	}
	if checkpoint.ChapterID == "market" {
		addFlags("market_unlocked", "chapter_2_started")
	}
	if checkpoint.ChapterID == "greenhouse" {
		addFlags("chapter_3_started")
	}
	if checkpoint.ChapterID == "rescue" {
		addFlags("chapter_4_started", "tunnel_unlocked")
	}
	story := map[string]string{
		"prologue.story": "prologue_1", "alley.story": "chapter1_intro", "alley.poster": "poster_1",
		"market.story": "market_intro_1", "greenhouse.story": "greenhouse_intro_1", "rescue.story": "rescue_intro_1",
		"rescue.after": "rescue_intro_10", "finale.clue": "finale_clue_insufficient", "finale.story": "finale_intro_1", "finale.celebration": "finale_intro_7",
	}
	if id := story[checkpoint.ID]; id != "" {
		found := false
		for _, node := range g.Catalog.Story {
			if node.ID == id {
				found = true
				s.ChapterID = node.ChapterID
			}
		}
		if !found {
			return s, domain.Fail("INVALID_CONTENT", "验收剧情节点尚未接入", 409)
		}
		s.StoryNodeID = id
	}
	if checkpoint.ID == "alley.poster" {
		addFlags("alley_rescued")
		s.Cats = domain.Add(s.Cats, "diandian")
		s.Furniture = domain.Add(s.Furniture, "cardboard_nest")
		s.CompletedStages = domain.Add(s.CompletedStages, "alley_rescue")
	}
	if checkpoint.ID == "market.battle" || checkpoint.ID == "market.exit" {
		addFlags("market_crow_clue_completed", "market_pigeon_clue_completed")
	}
	if checkpoint.ID == "market.exit" {
		addFlags("market_cleared")
		s.CompletedStages = domain.Add(s.CompletedStages, "market_boss")
	}
	if strings.HasPrefix(checkpoint.ID, "greenhouse.home_") || checkpoint.ID == "greenhouse.battle" {
		addFlags("momo_joined", "greenhouse_fortified")
		s.Cats = domain.Add(s.Cats, "momo")
		for _, furniture := range g.Catalog.Furniture {
			s.Furniture = domain.Add(s.Furniture, furniture.ID)
		}
	}
	if checkpoint.ID == "greenhouse.home_2" || checkpoint.ID == "greenhouse.home_3" {
		addFlags("greenhouse_sealed")
	}
	if checkpoint.ID == "greenhouse.home_3" {
		addFlags("greenhouse_fortified_full")
	}
	if checkpoint.ID == "rescue.battle" || checkpoint.ID == "rescue.after" {
		addFlags("tunnel_false_kitten_trap_found", "valve_three_investigated")
	}
	if checkpoint.ID == "rescue.after" {
		addFlags("tunnel_boss_cleared")
		s.CompletedStages = domain.Add(s.CompletedStages, "tunnel_boss")
	}
	if strings.HasPrefix(checkpoint.ID, "finale.") {
		addFlags("finale_started")
	}
	if checkpoint.ID == "finale.clue" {
		s.Inventory["clue"] = 0
	}
	if checkpoint.ID == "finale.home" {
		addFlags("finale_completed", "kingdom_founded")
	}
	if checkpoint.ID == "finale.exit" || checkpoint.ID == "finale.celebration" {
		addFlags("finale_boss_victory")
		s.CompletedStages = domain.Add(s.CompletedStages, "finale_boss")
	}
	if checkpoint.Kind == "event" {
		parts := strings.Split(checkpoint.ID, ":")
		if len(parts) != 3 {
			return s, domain.Fail("INVALID_COMMAND", "事件验收节点无效", 400)
		}
		for _, event := range g.Catalog.Events {
			if event.ID != parts[2] {
				continue
			}
			s.PendingEventID, s.PendingEventSource = event.ID, "node"
			if domain.Contains(event.Triggers, "random") {
				s.PendingEventSource = "random"
			}
			addFlags(event.RequiresFlags...)
			if event.ID == "valve_three_event" {
				addFlags("tunnel_false_kitten_trap_found")
			}
			for _, option := range event.Options {
				if option.RequireCat != "" {
					s.Cats = domain.Add(s.Cats, option.RequireCat)
				}
			}
		}
	}
	if checkpoint.Kind == "battle" {
		var err error
		switch checkpoint.ID {
		case "prologue.battle":
			err = g.startTutorialBattle(&s, "l00_tutorial", false)
		case "alley.battle":
			s.Phase = "preparation"
			s.DrawnEvents = []string{"node:crate_event"}
			err = g.startBattle(&s, domain.Command{StageID: "alley_rescue"})
		case "market.battle":
			s.Phase = "explore"
			err = g.startBattle(&s, domain.Command{StageID: "market_boss", Layer: "L0", ReturnPosition: &domain.WorldPoint{X: 1310, Y: 169}})
		case "greenhouse.battle":
			s.Phase = "home"
			err = g.startBattle(&s, domain.Command{StageID: "greenhouse_boss"})
		case "rescue.battle":
			s.Phase = "explore"
			err = g.startBattle(&s, domain.Command{StageID: "tunnel_boss", ReturnPosition: &domain.WorldPoint{X: 1520, Y: 759}})
		case "finale.battle":
			s.Phase = "home"
			err = g.startBattle(&s, domain.Command{StageID: "finale_boss"})
		}
		if err != nil {
			return s, err
		}
	}
	s.LastResult = domain.Result{Message: "验收进度：" + checkpoint.Title + "。可从验收面板返回原进度。"}
	return s, nil
}
