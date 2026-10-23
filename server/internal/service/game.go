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
	Store   *repository.Store
	Catalog domain.Catalog
	Random  func(int) (int, error)
}

func New(store *repository.Store, c domain.Catalog) *Game {
	return &Game{Store: store, Catalog: c, Random: func(max int) (int, error) {
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
	switch c.Type {
	case "BUY_FURNITURE":
		return g.buyFurniture(s, c.ProductID)
	case "START_STORY":
		for _, n := range g.Catalog.Story {
			if n.ID == c.NodeID {
				s.Phase = "dialogue"
				s.StoryNodeID = n.ID
				s.ChapterID = n.ChapterID
				if n.ChapterID == "market" {
					s.MapID = "market"
					s.Flags = domain.Add(s.Flags, "market_unlocked")
					s.Flags = domain.Add(s.Flags, "chapter_2_started")
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
				s.ChapterID = n.ChapterID
				if n.Next != "" {
					s.StoryNodeID = n.Next
					return nil
				}
				s.StoryNodeID = ""
				s.Phase = n.Exit
				if n.Exit == "explore" {
					s.ExploreDistance = -randomGrace
				}
				if n.Exit == "home" {
					s.MapID = "greenhouse"
					s.Flags = domain.Add(s.Flags, "rescue_story_done")
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
		if s.MapID == "alley" && domain.Contains(s.Flags, "alley_rescued") {
			return domain.Fail("ALREADY_COMPLETED", "伙伴已经获救，可以回花房看看", 409)
		}
		for _, m := range g.Catalog.Maps {
			if m.ID == s.MapID {
				for _, p := range m.Interactions {
					if p.ID == c.InteractionID {
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
	case "CHOOSE_EVENT":
		return g.chooseEvent(s, c.EventID, c.OptionID)
	case "START_BATTLE":
		if err := domain.RequirePhase(*s, "preparation", "home", "explore"); err != nil {
			return err
		}
		if s.Phase != "preparation" && !domain.Contains(s.Flags, "alley_rescued") {
			return domain.Fail("STAGE_LOCKED", "请先探索小巷并完成事件", 409)
		}
		for _, stage := range g.Catalog.Stages {
			if stage.ID == c.StageID && stage.Status == "demo" {
				id, err := ID()
				if err != nil {
					return err
				}
				s.ActiveBattle = &domain.Attempt{ID: id, StageID: stage.ID, Status: "active"}
				if s.EventState != nil {
					modifiers := s.EventState.PendingModifiers
					s.ActiveBattle.Modifiers = &modifiers
				}
				s.Phase = "battle"
				return nil
			}
		}
		return invalid()
	case "COMPLETE_BATTLE":
		if err := domain.RequirePhase(*s, "battle"); err != nil {
			return err
		}
		if s.ActiveBattle == nil || s.ActiveBattle.ID != c.AttemptID || s.ActiveBattle.Status != "active" || (c.Outcome != "won" && c.Outcome != "lost") {
			return invalid()
		}
		s.ActiveBattle.Status = c.Outcome
		s.Phase = "settlement"
		s.LastResult = domain.Result{Outcome: c.Outcome, Message: "防线需要再调整一下。伙伴仍在等待，准备好就再试一次。"}
		if c.Outcome == "won" {
			s.LastResult.Message = "撤离路线已经照亮，点点安全了！"
			if s.EventState != nil {
				s.EventState.PendingModifiers = domain.BattleModifiers{}
			}
			if !domain.Contains(s.CompletedStages, s.ActiveBattle.StageID) {
				s.LastResult.FirstClear = true
				s.CompletedStages = domain.Add(s.CompletedStages, s.ActiveBattle.StageID)
				s.Cats = domain.Add(s.Cats, "diandian")
				s.Furniture = domain.Add(s.Furniture, "cardboard_nest")
				s.Currencies["stamp"] += 2
				s.Inventory["material"] += 3
				s.Flags = domain.Add(s.Flags, "alley_rescued")
			} else {
				s.LastResult.Message = "再次守护成功！首次救援奖励已领取，本次不重复发放。"
			}
		}
		return nil
	case "CONTINUE":
		if err := domain.RequirePhase(*s, "settlement"); err != nil {
			return err
		}
		if s.LastResult.Outcome == "lost" {
			s.Phase = "preparation"
		} else if !domain.Contains(s.Flags, "rescue_story_done") {
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
		return nil
	case "GO_EXPLORE":
		targetMap := "alley"
		if c.MapID != "" {
			targetMap = c.MapID
		} else if s.MapID == "market" {
			targetMap = "market"
		}
		s.Phase = "explore"
		s.MapID = targetMap
		s.ExploreDistance = -randomGrace
		if targetMap == "market" {
			s.Flags = domain.Add(s.Flags, "market_unlocked")
			s.Flags = domain.Add(s.Flags, "chapter_2_started")
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
