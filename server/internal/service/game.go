package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math/big"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
)

type Game struct {
	Store           *repository.Store
	Catalog         domain.Catalog
	Random          func(int) (int, error)
	RainyZoneChance int
}

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
	return g.Store.Transact(Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
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
		if err := g.apply(&p.State, req.Command); err != nil {
			return domain.CommandResponse{}, err
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
}
func (g *Game) apply(s *domain.GameState, c domain.Command) error {
	invalid := func() error { return domain.Fail("INVALID_COMMAND", "命令参数或目标无效", 400) }
	// An active attempt cannot be abandoned through a story or map command.
	if s.ActiveBattle != nil && s.ActiveBattle.Status == "active" && c.Type != "COMPLETE_BATTLE" {
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
	case "START_STORY":
		for _, n := range g.Catalog.Story {
			if n.ID == c.NodeID {
				s.Phase = "dialogue"
				s.StoryNodeID = n.ID
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
				if n.ChapterID == "greenhouse" {
					s.MapID = "greenhouse"
					s.Flags = domain.Add(s.Flags, "chapter_3_started")
				}
				if n.ChapterID == "rescue" {
					s.MapID = "tunnel"
					s.Flags = domain.Add(s.Flags, "chapter_4_started")
					s.Flags = domain.Add(s.Flags, "tunnel_unlocked")
				}
				if n.ChapterID == "finale" {
					s.MapID = "greenhouse"
					s.Flags = domain.Add(s.Flags, "finale_started")
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
		for _, n := range g.Catalog.Story {
			if n.ID == c.NodeID {
				for _, flag := range n.SetFlags {
					s.Flags = domain.Add(s.Flags, flag)
				}
				// 注意:章节内 ADVANCE(含局势跳转节点,其 chapterId 可能属于别的章节)
				// 不触发重置——只有 START_STORY 主动开启新章节才清空已抽卡。
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
					if n.ChapterID == "greenhouse" || n.ID == "greenhouse_intro_7" {
						s.Flags = domain.Add(s.Flags, "chapter_3_started")
						s.Flags = domain.Add(s.Flags, "greenhouse_fortified")
						s.Flags = domain.Add(s.Flags, "momo_joined")
						s.Cats = domain.Add(s.Cats, "momo")
					}
					if n.ChapterID == "rescue" || n.ID == "rescue_intro_7" {
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
				return nil
			}
		}
		return invalid()
	case "INTERACT":
		if err := domain.RequirePhase(*s, "explore"); err != nil {
			return err
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
			case "alley_blanket_stack":
				if domain.Contains(s.Flags, "blanket_secured") || domain.Contains(s.Flags, "blanket_half") || domain.Contains(s.Flags, "blanket_lost") {
					return domain.Fail("ALREADY_COMPLETED", "旧毛毯已经检查过了", 409)
				}
			default:
				return invalid()
			}
		}
		for _, m := range g.Catalog.Maps {
			if m.ID == s.MapID {
				for _, p := range m.Interactions {
					if p.ID == c.InteractionID {
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
		return g.checkRandomZone(s, c.ZoneID)
	case "CHOOSE_EVENT":
		return g.chooseEvent(s, c.EventID, c.OptionID, c.UsePush)
	case "START_BATTLE":
		return g.startBattle(s, c)
	case "COMPLETE_BATTLE":
		return g.completeBattle(s, c)
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
		s.Phase = "home"
		s.MapID = "greenhouse"
		if domain.Contains(s.Flags, "finale_started") {
			s.ChapterID = "finale"
		} else if domain.Contains(s.Flags, "chapter_4_started") {
			s.ChapterID = "rescue"
		} else if domain.Contains(s.Flags, "chapter_3_started") {
			s.ChapterID = "greenhouse"
		}
		return nil
	case "GO_EXPLORE":
		targetMap := "alley"
		if c.MapID != "" {
			targetMap = c.MapID
		} else if s.MapID == "market" {
			targetMap = "market"
		} else if s.MapID == "tunnel" {
			targetMap = "tunnel"
		}
		s.Phase = "explore"
		s.MapID = targetMap
		s.ExploreDistance = -randomGrace
		if targetMap == "market" {
			s.Flags = domain.Add(s.Flags, "market_unlocked")
			s.Flags = domain.Add(s.Flags, "chapter_2_started")
		} else if targetMap == "tunnel" {
			s.Flags = domain.Add(s.Flags, "chapter_4_started")
			s.Flags = domain.Add(s.Flags, "tunnel_unlocked")
		}
		return nil
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
		// 一件家具只占一个位置；目标位置原家具回到持有列表。
		for slot, id := range s.Placements {
			if id == c.FurnitureID {
				delete(s.Placements, slot)
			}
		}
		s.Placements[c.SlotID] = c.FurnitureID
		return nil
	case "DRAW_FURNITURE":
		if err := domain.RequirePhase(*s, "home"); err != nil {
			return err
		}
		for _, p := range g.Catalog.Pools {
			if p.ID == c.PoolID {
				if !domain.Contains(s.Flags, p.RequiredFlag) {
					return domain.Fail("POOL_LOCKED", "尚未解锁这个主题", 409)
				}
				if s.Currencies["stamp"] < p.Cost {
					return domain.Fail("INSUFFICIENT_CURRENCY", "猫爪邮票不足", 409)
				}
				total := 0
				for _, e := range p.Entries {
					total += e.Weight
				}
				if total <= 0 {
					return invalid()
				}
				n, err := g.Random(total)
				if err != nil {
					return err
				}
				id := ""
				for _, e := range p.Entries {
					n -= e.Weight
					if n < 0 {
						id = e.FurnitureID
						break
					}
				}
				s.Currencies["stamp"] -= p.Cost
				if domain.Contains(s.Furniture, id) {
					s.Inventory["material"] += 2
					s.LastResult = domain.Result{Message: "收到了重复家具，转化为 2 份修缮材料。", Outcome: id}
				} else {
					s.Furniture = domain.Add(s.Furniture, id)
					s.LastResult = domain.Result{Message: "猫国包裹里有一件新家具！", Outcome: id}
				}
				return nil
			}
		}
		return invalid()
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
