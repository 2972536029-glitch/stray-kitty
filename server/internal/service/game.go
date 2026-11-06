package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"math/big"
	"stray-kitty/server/internal/advisor"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"strings"
	"time"
)

type Game struct {
	Store            *repository.Store
	Catalog          domain.Catalog
	Random           func(int) (int, error)
	RainyZoneChance  int
	Advisor          *advisor.Client
	Now              func() time.Time
	QAVictoryEnabled bool
}

var chapterByExplorationMap = map[string]string{"alley": "alley", "market": "market", "tunnel": "rescue", "warehouse": "finale"}

func New(store *repository.Store, c domain.Catalog) *Game {
	return &Game{Store: store, Catalog: c, RainyZoneChance: 550, Random: func(max int) (int, error) {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(max)))
		if err != nil {
			return 0, err
		}
		return int(n.Int64()), nil
	}}
}
func ID() (string, error) {
	b := make([]byte, 24)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}
func Hash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func (g *Game) CreateSession() (string, string, error) {
	token, err := ID()
	if err != nil {
		return "", "", err
	}
	id, err := ID()
	if err != nil {
		return "", "", err
	}
	p := &repository.Player{ID: id, State: domain.InitialState(g.Catalog.Version), Receipts: map[string]repository.Receipt{}, ReceiptOrder: []string{}}
	err = g.Store.Create(Hash(token), p)
	if err == nil {
		g.observeStoryEntry(domain.GameState{}, p.State, false)
	}
	return id, token, err
}
func (g *Game) State(token string) (domain.GameState, error) {
	p, err := g.Store.Get(Hash(token))
	if err != nil {
		return domain.GameState{}, err
	}
	if p.State.ContentVersion != g.Catalog.Version {
		return domain.GameState{}, domain.Fail("CONTENT_VERSION_MISMATCH", "存档内容版本需要迁移，请保留旧存档", 409)
	}
	g.prepareLottery(&p.State)
	return p.State, nil
}
func (g *Game) Execute(token, key string, req domain.CommandRequest) (domain.CommandResponse, error) {
	if len(key) < 8 || len(key) > 128 {
		return domain.CommandResponse{}, domain.Fail("INVALID_IDEMPOTENCY_KEY", "需要 8–128 字符的幂等键", 400)
	}
	for _, char := range key {
		if !((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '_' || char == '-') {
			return domain.CommandResponse{}, domain.Fail("INVALID_IDEMPOTENCY_KEY", "幂等键只接受字母、数字、下划线和连字符", 400)
		}
	}
	if req.ExpectedRevision == nil || *req.ExpectedRevision < 0 {
		return domain.CommandResponse{}, domain.Fail("INVALID_REQUEST", "expectedRevision 必须为非负整数", 400)
	}
	raw, _ := json.Marshal(req)
	sum := sha256.Sum256(raw)
	fingerprint := hex.EncodeToString(sum[:])
	var before domain.GameState
	var clueGateRejected bool
	response, err := g.Store.TransactWithQA(Hash(token), strings.HasPrefix(req.Command.Type, "QA_"), func(p *repository.Player) (domain.CommandResponse, error) {
		if p.State.ContentVersion != g.Catalog.Version {
			return domain.CommandResponse{}, domain.Fail("CONTENT_VERSION_MISMATCH", "存档内容版本需要迁移", 409)
		}
		if r, ok := p.Receipts[key]; ok {
			if r.Fingerprint != fingerprint {
				return domain.CommandResponse{}, domain.Fail("IDEMPOTENCY_CONFLICT", "同一个幂等键不能用于不同请求", 409)
			}
			r.Response.Replayed = true
			return r.Response, nil
		}
		if p.State.Revision != *req.ExpectedRevision {
			return domain.CommandResponse{}, domain.Fail("REVISION_CONFLICT", "进度已变化，请重新加载后操作", 409)
		}
		// Snapshot only observation fields; this cannot fail a game command
		// and does not serialize the player's full receipt/history payload.
		before = snapshotGameplayObservation(p.State)
		g.prepareLottery(&p.State)
		var applyErr error
		if req.Command.Type == "QA_CHECKPOINT" || req.Command.Type == "QA_RESTORE" {
			applyErr = g.applyQACheckpoint(p, req.Command)
		} else {
			applyErr = g.apply(&p.State, req.Command)
		}
		if applyErr != nil {
			clueGateRejected = isClueGateRejection(before, req.Command, applyErr)
			return domain.CommandResponse{}, applyErr
		}
		g.prepareLottery(&p.State)
		finishQAEventPreview(&p.State)
		if req.Command.Type != "QA_RESTORE" && p.State.ActiveBattle != nil && isQAObservation(before, p.State, req.Command) {
			p.State.ActiveBattle.QA = true
		}
		p.State.Revision++
		response := domain.CommandResponse{State: p.State}
		p.Receipts[key] = repository.Receipt{Fingerprint: fingerprint, Response: response}
		p.ReceiptOrder = append(p.ReceiptOrder, key)
		if len(p.ReceiptOrder) > 256 {
			delete(p.Receipts, p.ReceiptOrder[0])
			p.ReceiptOrder = p.ReceiptOrder[1:]
		}
		return response, nil
	})
	if clueGateRejected {
		observeClueGate(isQAObservation(before, before, req.Command))
	}
	if err == nil && !response.Replayed {
		g.observeGameplay(before, response.State, req.Command)
	}
	return response, err
}
func (g *Game) apply(s *domain.GameState, c domain.Command) error {
	invalid := func() error { return domain.Fail("INVALID_COMMAND", "命令参数或目标无效", 400) }
	// An active attempt cannot be abandoned through a story or map command.
	if s.ActiveBattle != nil && s.ActiveBattle.Status == "active" && c.Type != "COMPLETE_BATTLE" && c.Type != "QA_SIMULATE_VICTORY" && c.Type != "QA_SIMULATE_DEFEAT" {
		return domain.Fail("INVALID_PHASE", "请先完成当前战斗；返回标题可暂停并保留本场。", 409)
	}
	// A failed battle keeps its modifiers only while the player is retrying.
	if s.ActiveBattle != nil && s.ActiveBattle.Status == "lost" && domain.Contains([]string{"GO_HOME", "GO_EXPLORE", "START_STORY"}, c.Type) {
		s.ActiveBattle = nil
	}
	// 换章=区域换了新鲜事:仅在章节序"前进"时清空已抽卡(回看旧章节不清,防来回跳刷池子);
	// 节点一次性(node: 前缀)随章重置。
	chapterOrder := func(id string) int {
		for i, ch := range g.Catalog.Chapters {
			if ch.ID == id {
				return i
			}
		}
		return -1
	}
	switchChapter := func(next string) {
		if next != "" && next != s.ChapterID && chapterOrder(next) > chapterOrder(s.ChapterID) {
			s.DrawnEvents = nil
		}
	}
	switch c.Type {
	case "BUY_FURNITURE":
		return g.buyFurniture(s, c.ProductID)
	case "REPAIR_HOME":
		return g.repairHome(s, c.RepairID)
	case "START_STORY":
		if domain.Contains([]string{"finale_intro_2", "finale_intro_3", "finale_intro_4", "finale_intro_5", "finale_intro_6", "finale_intro_7", "finale_intro_8", "finale_intro_9"}, c.NodeID) {
			return domain.Fail("STORY_LOCKED", "这段仓库剧情由地图与战斗流程推进", 409)
		}
		switch c.NodeID {
		case "rescue_intro_2", "rescue_intro_3", "rescue_intro_4", "rescue_intro_5", "rescue_intro_6", "rescue_intro_7", "rescue_intro_8", "rescue_intro_9":
			return domain.Fail("STORY_LOCKED", "这段地下通道叙事已由地图交互与战斗流程接管", 409)
		case "rescue_intro_10":
			if !domain.Contains(s.Flags, "tunnel_boss_cleared") {
				return domain.Fail("STORY_LOCKED", "先守住地下通道的战斗", 409)
			}
		}
		if c.NodeID == "market_intro_1" && !domain.Contains(s.Flags, "rescue_story_done") {
			return domain.Fail("STORY_LOCKED", "请先完成小巷救援与寻猫启事", 409)
		}
		if c.NodeID == "greenhouse_intro_1" && !domain.Contains(s.Flags, "market_cleared") {
			return domain.Fail("STORY_LOCKED", "请先完成午夜集市的探索", 409)
		}
		if c.NodeID == "greenhouse_intro_1" && !domain.Contains(s.Flags, "market_exit_crossed") {
			return domain.Fail("STORY_LOCKED", "请先从午夜集市北侧出口离开", 409)
		}
		if c.NodeID == "rescue_intro_1" && !domain.Contains(s.Flags, "greenhouse_fortified") {
			return domain.Fail("STORY_LOCKED", "请先守住花房防线", 409)
		}
		if c.NodeID == "finale_intro_1" && (!domain.Contains(s.Flags, "tunnel_explored") || !domain.Contains(s.Flags, "cats_rescued_batch1") || s.Inventory["clue"] < 3) {
			return domain.Fail("STORY_LOCKED", "请先完成地下通道救援并收集三条线索", 409)
		}
		for _, n := range g.Catalog.Story {
			if n.ID == c.NodeID {
				s.Phase = "dialogue"
				s.StoryNodeID = n.ID
				s.ActiveBattle = nil
				s.PendingEventID = ""
				s.PendingEventSource = ""
				switchChapter(n.ChapterID)
				s.ChapterID = n.ChapterID
				if n.ChapterID == "alley" || n.ID == "chapter1_intro" {
					s.MapID = "alley"
				}
				if n.ChapterID == "market" {
					s.MapID = "market"
					s.Flags = domain.Add(s.Flags, "market_unlocked")
					s.Flags = domain.Add(s.Flags, "chapter_2_started")
				}
				if n.ID == "greenhouse_intro_1" {
					s.MapID = "greenhouse"
					s.Flags = domain.Add(s.Flags, "chapter_3_started")
				}
				if n.ChapterID == "rescue" {
					s.MapID = "tunnel"
					s.Flags = domain.Add(s.Flags, "chapter_4_started")
					s.Flags = domain.Add(s.Flags, "tunnel_unlocked")
				}
				if n.ChapterID == "finale" {
					s.MapID = "warehouse"
					s.Flags = domain.Add(s.Flags, "finale_started")
				}
				if n.ID == "finale_clue_insufficient" {
					s.MapID = "market"
					s.ChapterID = "market"
				}
				return nil
			}
		}
		return invalid()
	case "ADVANCE_STORY":
		if err := domain.RequirePhase(*s, "dialogue"); err != nil {
			return err
		}
		if c.NodeID != s.StoryNodeID {
			return invalid()
		}
		// Older clients omit optionId. Explicit selections must match the
		// existing prologue attitude controls; arbitrary user tags never pass.
		if c.OptionID != "" && !validStoryChoice(c.NodeID, c.OptionID) {
			return invalid()
		}
		for _, n := range g.Catalog.Story {
			if n.ID == c.NodeID {
				for _, flag := range n.SetFlags {
					s.Flags = domain.Add(s.Flags, flag)
					if flag == "momo_joined" {
						s.Cats = domain.Add(s.Cats, "momo")
					}
				}
				// 注意:章节内 ADVANCE(含局势跳转节点,其 chapterId 可能属于别的章节)
				// 不触发重置——只有 START_STORY 主动开启新章节才清空已抽卡。
				// Shared event dialogue keeps the originating map. Only authored
				// mission/intel events lead to preparation; random encounters resume.
				if (n.ID == "event_forced_chase" || n.ID == "event_detour") && s.EventState != nil {
					s.StoryNodeID = ""
					if chapter, ok := chapterByExplorationMap[s.MapID]; ok {
						s.ChapterID = chapter
					}
					s.Phase = "explore"
					s.ExploreDistance = -randomGrace
					switch s.EventState.LastResolution.EventID {
					case "crate_event", "crow_intel_event", "pigeon_rumor_event", "momo_trail_event":
						s.Phase = "preparation"
					}
					return nil
				}
				s.ChapterID = n.ChapterID
				if n.Next != "" {
					s.StoryNodeID = n.Next
					for _, nextNode := range g.Catalog.Story {
						if nextNode.ID == n.Next {
							s.ChapterID = nextNode.ChapterID
							break
						}
					}
					return nil
				}
				if n.ID == "prologue_advisor" {
					s.StoryNodeID = ""
					if domain.Contains(s.CompletedStages, "l00_tutorial") {
						s.Phase = "dialogue"
						s.ChapterID = "alley"
						s.StoryNodeID = "chapter1_intro"
						return nil
					}
					return g.startTutorialBattle(s, "l00_tutorial", false)
				}
				if n.ID == "prologue_2" {
					s.StoryNodeID = ""
					if domain.Contains(s.CompletedStages, "l00_tutorial") {
						s.Phase = "explore"
						s.MapID = "alley"
						s.ExploreDistance = -randomGrace
						return nil
					}
					return g.startTutorialBattle(s, "l00_tutorial", false)
				}
				s.StoryNodeID = ""
				s.Phase = n.Exit
				if n.Exit == "explore" {
					s.ExploreDistance = -randomGrace
					if n.ChapterID == "alley" {
						s.MapID = "alley"
					}
				}
				if n.Exit == "home" {
					s.MapID = "greenhouse"
					s.Flags = domain.Add(s.Flags, "rescue_story_done")
					if n.ChapterID == "rescue" || n.ID == "rescue_intro_10" || n.ID == "rescue_intro_7" {
						s.Flags = domain.Add(s.Flags, "chapter_4_started")
						s.Flags = domain.Add(s.Flags, "tunnel_explored")
						s.Flags = domain.Add(s.Flags, "cats_rescued_batch1")
					}
					if n.ChapterID == "finale" || n.ID == "finale_intro_9" {
						s.Flags = domain.Add(s.Flags, "finale_started")
						s.Flags = domain.Add(s.Flags, "finale_completed")
						s.Flags = domain.Add(s.Flags, "kingdom_founded")
					}
				}
				if n.Exit == "explore" && n.ChapterID == "market" {
					s.MapID = "market"
					s.Flags = domain.Add(s.Flags, "market_unlocked")
					s.Flags = domain.Add(s.Flags, "chapter_2_started")
				}
				if n.Exit == "explore" && n.ChapterID == "finale" {
					s.MapID = "warehouse"
				}
				if n.ID == "finale_clue_insufficient" {
					s.MapID = "market"
					s.ChapterID = "market"
				}
				return nil
			}
		}
		return invalid()
	case "INTERACT":
		if err := domain.RequirePhase(*s, "explore"); err != nil {
			return err
		}
		if s.MapID == "warehouse" {
			return g.warehouseInteract(s, c)
		}
		if s.MapID == "alley" {
			switch c.InteractionID {
			case "alley_fish_dry":
				if !domain.Contains(s.Flags, "alley_fish_collected") {
					s.Inventory["food"]++
					s.Flags = domain.Add(s.Flags, "alley_fish_collected")
					s.LastResult = domain.Result{Message: "找到了一条鱼干。"}
				}
				return nil
			case "alley_poster":
				if !domain.Contains(s.Flags, "alley_rescued") {
					return domain.Fail("INTERACTION_LOCKED", "先帮助纸箱里的伙伴", 409)
				}
				if domain.Contains(s.Flags, "lost_poster_found") {
					return nil
				}
				s.Phase = "dialogue"
				s.StoryNodeID = "poster_1"
				return nil
			case "alley_crate":
				if domain.Contains(s.Flags, "alley_rescued") {
					return domain.Fail("ALREADY_COMPLETED", "伙伴已经获救", 409)
				}
			case "alley_dog_friend_point":
				// Existing event card owns the outcome; the map only supplies its anchor.
			case "alley_blanket_stack":
				if domain.Contains(s.Flags, "blanket_secured") || domain.Contains(s.Flags, "blanket_half") || domain.Contains(s.Flags, "blanket_lost") {
					return domain.Fail("ALREADY_COMPLETED", "旧毛毯已经检查过了", 409)
				}
			default:
				return invalid()
			}
		}
		if s.MapID == "market" {
			if c.Position == nil || (c.InteractionID == "market_crow_stall" && (c.Layer != "L0" || math.Hypot(c.Position.X-910, c.Position.Y-245) > 75)) || (c.InteractionID == "market_pigeon_perch" && (c.Layer != "L1" || math.Hypot(c.Position.X-1310, c.Position.Y-426) > 75)) || (c.InteractionID == "market_momo_trace" && (c.Layer != "L0" || math.Hypot(c.Position.X-947, c.Position.Y-160) > 75)) {
				return domain.Fail("INTERACTION_WRONG_FLOOR", "请在正确楼层调查线索", 409)
			}
		}
		for _, m := range g.Catalog.Maps {
			if m.ID == s.MapID {
				for _, p := range m.Interactions {
					if p.ID == c.InteractionID {
						if s.MapID == "tunnel" && p.ID == "tunnel_valve_three" && !domain.Contains(s.Flags, "tunnel_false_kitten_trap_found") {
							return domain.Fail("INTERACTION_LOCKED", "先确认假猫叫诱饵与绊线，再调查第三泄洪阀", 409)
						}
						// 节点事件一次性:结算过的卡记入 drawnEvents("node:" 前缀),防无限重掷刷奖励。
						if domain.Contains(s.DrawnEvents, "node:"+p.EventID) {
							return domain.Fail("ALREADY_COMPLETED", "这件事今天已经办过了，先去别处转转吧。", 409)
						}
						s.Phase = "event"
						s.PendingEventID = p.EventID
						s.PendingEventSource = "node"
						return nil
					}
				}
			}
		}
		return invalid()
	case "REPORT_MOVE":
		return g.reportMove(s, c.Distance)
	case "CHECK_RANDOM_ZONE":
		return g.checkRandomZone(s, c.ZoneID, c.Layer, c.Position)
	case "CHOOSE_EVENT":
		return g.chooseEvent(s, c.EventID, c.OptionID, c.UsePush)
	case "START_BATTLE":
		return g.startBattle(s, c)
	case "COMPLETE_BATTLE":
		return g.completeBattle(s, c)
	case "QA_SIMULATE_VICTORY", "QA_SIMULATE_DEFEAT":
		if !g.QAVictoryEnabled {
			return domain.Fail("QA_DISABLED", "服务端未启用战斗验收模拟", 403)
		}
		if err := domain.RequirePhase(*s, "battle"); err != nil {
			return err
		}
		attempt := s.ActiveBattle
		if attempt == nil || attempt.Status != "active" || attempt.ID != c.AttemptID {
			return domain.Fail("INVALID_COMMAND", "战斗场次无效", 400)
		}
		result := qaVictoryResult(attempt)
		if c.Type == "QA_SIMULATE_DEFEAT" {
			result.Outcome = "lost"
			leaks, boss := 3, false
			result.Report = &domain.BattleReport{Leaks: &leaks, BossDefeated: &boss}
			if attempt.StageID == "finale_boss" {
				elites := 0
				result.Report.ElitesDefeated = &elites
			}
		}
		return g.completeBattle(s, result)
	case "CONTINUE":
		if err := domain.RequirePhase(*s, "settlement"); err != nil {
			return err
		}
		if s.ActiveBattle != nil && s.ActiveBattle.StageID == "l00_tutorial" {
			if s.LastResult.Outcome == "lost" {
				return g.retryTutorialBattle(s)
			}
			s.Phase = "dialogue"
			s.ChapterID = "alley"
			s.StoryNodeID = "chapter1_intro"
			s.MapID = "alley"
			s.ActiveBattle = nil
			return nil
		}
		if s.LastResult.Outcome == "lost" {
			s.Phase = "preparation"
			if s.ActiveBattle != nil && s.ActiveBattle.Status == "lost" {
				return nil
			}
		} else if s.LastResult.StageID == "market_boss" && s.ActiveBattle != nil && s.ActiveBattle.Mainline {
			s.Phase = "explore"
			s.MapID = "market"
			s.ActiveBattle = nil
			return nil
		} else if s.LastResult.StageID == "finale_boss" && s.MapID == "warehouse" && s.ActiveBattle != nil && s.ActiveBattle.Mainline {
			s.Phase = "dialogue"
			s.ChapterID = "finale"
			s.StoryNodeID = "finale_intro_6"
		} else if s.LastResult.StageID == "tunnel_boss" && s.MapID == "tunnel" && s.ActiveBattle != nil && s.ActiveBattle.Mainline && domain.Contains(s.Flags, "tunnel_boss_cleared") {
			s.Phase = "dialogue"
			s.ChapterID = "rescue"
			s.StoryNodeID = "rescue_intro_10"
		} else if s.LastResult.StageID != "alley_boss" && !isStandaloneBattle(s.LastResult.StageID) && !domain.Contains(s.Flags, "rescue_story_done") {
			s.Phase = "dialogue"
			s.StoryNodeID = "rescue_1"
		} else {
			s.Phase = "home"
			s.MapID = "greenhouse"
		}
		s.ActiveBattle = nil
		return nil
	case "GO_HOME":
		if err := domain.RequirePhase(*s, "explore", "preparation"); err != nil {
			return err
		}
		if !domain.Contains(s.Flags, "alley_rescued") {
			return domain.Fail("HOME_LOCKED", "先帮助小巷里的伙伴", 409)
		}
		if s.MapID == "market" {
			return domain.Fail("EXIT_LOCKED", "完成集市防卫并从北侧出口离开", 409)
		}
		if s.MapID == "alley" && !domain.Contains(s.Flags, "lost_poster_found") {
			return domain.Fail("POSTER_NOT_FOUND", "先看看巷尾墙上的寻猫启事", 409)
		}
		s.Phase = "home"
		s.MapID = "greenhouse"
		s.ActiveBattle = nil
		s.StoryNodeID = ""
		s.PendingEventID = ""
		s.PendingEventSource = ""
		if domain.Contains(s.Flags, "finale_started") {
			s.ChapterID = "finale"
		} else if domain.Contains(s.Flags, "chapter_4_started") {
			s.ChapterID = "rescue"
		} else if domain.Contains(s.Flags, "chapter_3_started") {
			s.ChapterID = "greenhouse"
		}
		return nil
	case "EXIT_MARKET":
		if err := domain.RequirePhase(*s, "explore"); err != nil {
			return err
		}
		p := c.Position
		if s.MapID != "market" || !domain.Contains(s.Flags, "market_cleared") || c.Layer != "L0" || p == nil || math.IsNaN(p.X) || math.IsNaN(p.Y) || math.Abs(p.X-1365) > 48 || math.Abs(p.Y-88) > 48 {
			return domain.Fail("EXIT_LOCKED", "需守住集市防线，并从北侧木箱翻越离开", 409)
		}
		s.Flags = domain.Add(s.Flags, "market_exit_crossed")
		return g.apply(s, domain.Command{Type: "START_STORY", NodeID: "greenhouse_intro_1"})
	case "GO_EXPLORE":
		targetMap := "alley"
		if c.MapID != "" {
			targetMap = c.MapID
		} else if s.MapID == "market" {
			targetMap = "market"
		} else if s.MapID == "tunnel" {
			targetMap = "tunnel"
		}
		chapter, supported := chapterByExplorationMap[targetMap]
		if !supported {
			return domain.Fail("MAP_UNAVAILABLE", "这个地图尚未开放探索", 400)
		}
		if err := domain.RequirePhase(*s, "home", "explore", "preparation", "dialogue", "settlement"); err != nil {
			return err
		}
		if targetMap == "market" && !domain.Contains(s.Flags, "chapter_2_started") {
			return domain.Fail("MAP_LOCKED", "请先开启第二章剧情", 409)
		}
		if targetMap == "tunnel" && !domain.Contains(s.Flags, "greenhouse_fortified") {
			return domain.Fail("MAP_LOCKED", "先完成废弃花房的防线，再进入地下通道", 409)
		}
		if targetMap == "warehouse" && (!warehouseUnlocked(s) || !domain.Contains(s.Flags, "finale_started")) {
			return domain.Fail("MAP_LOCKED", "先完成地下通道救援并开启终章", 409)
		}
		s.Phase = "explore"
		s.MapID = targetMap
		s.ChapterID = chapter
		s.StoryNodeID = ""
		s.PendingEventID = ""
		s.PendingEventSource = ""
		s.ActiveBattle = nil
		s.ExploreDistance = -randomGrace
		if targetMap == "market" {
			s.Flags = domain.Add(s.Flags, "market_unlocked")
			s.Flags = domain.Add(s.Flags, "chapter_2_started")
		} else if targetMap == "tunnel" {
			s.Flags = domain.Add(s.Flags, "tunnel_unlocked")
			s.Flags = domain.Add(s.Flags, "chapter_4_started")
		}
		return nil
	case "SAVE_HOME_LAYOUT":
		return g.saveHomeLayout(s, c.Changes, c.Surfaces)
	case "ACQUIRE_HOME_DECOR":
		return g.acquireHomeDecor(s, c.DecorID)
	case "ACQUIRE_HOME_SURFACE":
		return g.acquireHomeSurface(s, c.SurfaceID)
	case "PLACE_FURNITURE":
		if err := domain.RequirePhase(*s, "home"); err != nil {
			return err
		}
		if !domain.Contains(s.Furniture, c.FurnitureID) {
			return domain.Fail("NOT_OWNED", "尚未拥有这件家具", 409)
		}
		found := false
		for _, slot := range g.Catalog.Slots {
			if slot.ID == c.SlotID {
				found = true
			}
		}
		if !found {
			return invalid()
		}
		if err := g.requireSlotUnlocked(s, c.SlotID); err != nil {
			return err
		}
		// 一件家具只占一个位置；目标位置原家具回到持有列表。
		for slot, id := range s.Placements {
			if id == c.FurnitureID {
				delete(s.Placements, slot)
			}
		}
		delete(s.HomeLayout, "furniture:"+c.FurnitureID)
		if previous := s.Placements[c.SlotID]; previous != "" {
			delete(s.HomeLayout, "furniture:"+previous)
		}
		s.Placements[c.SlotID] = c.FurnitureID
		return nil
	case "DRAW_FURNITURE":
		return g.drawParcels(s, c.PoolID, c.Count)
	case "CLAIM_PARCEL_REWARD":
		return g.claimParcelReward(s, c.RewardID)
	default:
		return domain.Fail("UNSUPPORTED_COMMAND", "此命令尚未实现", 400)
	}
}

// startTutorialBattle creates a fresh attempt for story entry or a failed tutorial retry.
func (g *Game) startTutorialBattle(s *domain.GameState, stageID string, includeModifiers bool) error {
	for _, stage := range g.Catalog.Stages {
		if stage.ID != stageID || stage.Status != "demo" {
			continue
		}
		id, err := ID()
		if err != nil {
			return err
		}
		s.ActiveBattle = &domain.Attempt{ID: id, StageID: stage.ID, Status: "active"}
		if includeModifiers && s.EventState != nil {
			modifiers := s.EventState.PendingModifiers
			modifiers.Carry = ""
			s.ActiveBattle.Modifiers = &modifiers
		}
		s.Phase = "battle"
		return nil
	}
	return domain.Fail("INVALID_COMMAND", "命令参数或目标无效", 400)
}

// ApplyCharge 应用一笔已由支付服务判定并记账的充值:确认则入账金枪鱼,
// 流水以展示副本落在游戏存档(权威账本在支付侧),返回到账后的最新余额。
// 同 ID 流水幂等:Xsolla webhook 重试可能重复触达入账口,已入账的不再加罐头。
func (g *Game) ApplyCharge(playerID string, txn domain.Txn, pack domain.RechargePack) (int, error) {
	balance := 0
	err := g.Store.TransactByPlayer(playerID, func(p *repository.Player) error {
		for _, existing := range p.State.Txns {
			if existing.ID == txn.ID {
				balance = p.State.Currencies["tuna"]
				return nil
			}
		}
		if txn.Status == "confirmed" {
			p.State.Currencies["tuna"] += pack.TunaGranted
		}
		domain.AppendTxn(&p.State, txn)
		balance = p.State.Currencies["tuna"]
		return nil
	})
	return balance, err
}
