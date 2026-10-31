package service_test

import (
	"fmt"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

// reachHome 走完序章与第一章救援,停在花房家园阶段。
func reachHome(t *testing.T, g *service.Game, token string) domain.GameState {
	t.Helper()
	s := toBattle(t, g, token)
	s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
	s = finishStory(t, g, token)
	if s.Phase != "home" || s.MapID != "greenhouse" {
		t.Fatalf("expected home phase in greenhouse, got phase=%s map=%s", s.Phase, s.MapID)
	}
	return s
}

// setStock 把材料与邮票设为精确值,屏蔽剧情流程自带的战利品存量。
func setStock(t *testing.T, g *service.Game, token string, material, stamp int) {
	t.Helper()
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Inventory["material"] = material
		p.State.Currencies["stamp"] = stamp
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// expectCode 断言命令以指定错误码被拒,且存档状态未被污染。
func expectCode(t *testing.T, g *service.Game, token string, c domain.Command, code string) {
	t.Helper()
	before, _ := g.State(token)
	_, err := g.Execute(token, fmt.Sprintf("reject-%d-%s", before.Revision, c.Type), domain.CommandRequest{ExpectedRevision: &before.Revision, Command: c})
	if err == nil {
		t.Fatalf("%s accepted, expected %s", c.Type, code)
	}
	fault, ok := err.(*domain.Fault)
	if !ok || fault.Code != code {
		t.Fatalf("%s rejected with %v, expected %s", c.Type, err, code)
	}
	after, _ := g.State(token)
	if after.Revision != before.Revision {
		t.Fatalf("rejected %s still bumped revision", c.Type)
	}
}

func TestRepairHomeAdvancesThroughStages(t *testing.T) {
	g, token, _ := setup(t)
	reachHome(t, g, token)

	// 阶段 2:材料不足时拒绝且不扣存档。
	setStock(t, g, token, 9, 0)
	expectCode(t, g, token, domain.Command{Type: "REPAIR_HOME"}, "INSUFFICIENT_MATERIAL")

	setStock(t, g, token, 10, 0)
	s := execute(t, g, token, domain.Command{Type: "REPAIR_HOME"})
	if !domain.Contains(s.Flags, "greenhouse_sealed") || s.Inventory["material"] != 0 {
		t.Fatalf("seal_windows did not consume 10 material: %+v", s)
	}

	// 阶段 3:材料与邮票双重门槛。
	setStock(t, g, token, 19, 1)
	expectCode(t, g, token, domain.Command{Type: "REPAIR_HOME"}, "INSUFFICIENT_MATERIAL")
	setStock(t, g, token, 20, 0)
	expectCode(t, g, token, domain.Command{Type: "REPAIR_HOME"}, "INSUFFICIENT_CURRENCY")

	setStock(t, g, token, 20, 1)
	s = execute(t, g, token, domain.Command{Type: "REPAIR_HOME"})
	if !domain.Contains(s.Flags, "greenhouse_fortified_full") || s.Inventory["material"] != 0 || s.Currencies["stamp"] != 0 {
		t.Fatalf("timber_greenhouse did not consume 20 material + 1 stamp: %+v", s)
	}

	// 目录工程全部完成后拒绝重复修缮。
	expectCode(t, g, token, domain.Command{Type: "REPAIR_HOME"}, "RENOVATION_COMPLETE")
}

func TestRepairHomeRequiresHomePhase(t *testing.T) {
	g, token, _ := setup(t)
	expectCode(t, g, token, domain.Command{Type: "REPAIR_HOME"}, "INVALID_PHASE")
}

func TestRepairHomePartsPersistRetryAndChargeOnlyRemainingWork(t *testing.T) {
	g, _, _, token, path := setupWithPlayer(t)
	reachHome(t, g, token)
	setStock(t, g, token, 30, 1)
	expectCode(t, g, token, domain.Command{Type: "REPAIR_HOME", RepairID: "dry_bedding"}, "REPAIR_LOCKED")
	expectCode(t, g, token, domain.Command{Type: "REPAIR_HOME", RepairID: "restore_skylight"}, "REPAIR_LOCKED")
	expectCode(t, g, token, domain.Command{Type: "REPAIR_HOME", RepairID: "unknown"}, "INVALID_REPAIR")
	before, _ := g.State(token)
	req := domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "REPAIR_HOME", RepairID: "patch_windows"}}
	first, err := g.Execute(token, "repair-window-once", req)
	if err != nil {
		t.Fatal(err)
	}
	if first.State.Inventory["material"] != 26 || domain.Contains(first.State.Flags, "greenhouse_sealed") || !domain.Contains(first.State.HomeRepairs, "patch_windows") {
		t.Fatal("part did not consume exactly its own cost or advanced stage early")
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	restart := service.New(store, g.Catalog)
	replay, err := restart.Execute(token, "repair-window-once", req)
	if err != nil || !replay.Replayed || !sameStateJSON(first.State, replay.State) {
		t.Fatalf("repair retry after restart: %v", err)
	}
	expectCode(t, restart, token, domain.Command{Type: "REPAIR_HOME", RepairID: "patch_windows"}, "REPAIR_ALREADY_COMPLETE")
	s := execute(t, restart, token, domain.Command{Type: "REPAIR_HOME"})
	if s.Inventory["material"] != 20 || len(s.HomeRepairs) != 3 || !domain.Contains(s.Flags, "greenhouse_sealed") {
		t.Fatal("legacy command charged completed work twice")
	}
	setStock(t, restart, token, 6, 1)
	expectCode(t, restart, token, domain.Command{Type: "REPAIR_HOME", RepairID: "restore_skylight"}, "INSUFFICIENT_MATERIAL")
	setStock(t, restart, token, 20, 0)
	expectCode(t, restart, token, domain.Command{Type: "REPAIR_HOME", RepairID: "restore_skylight"}, "INSUFFICIENT_CURRENCY")
	setStock(t, restart, token, 20, 1)
	for _, id := range []string{"restore_skylight", "reinforce_floor", "revive_garden"} {
		s = execute(t, restart, token, domain.Command{Type: "REPAIR_HOME", RepairID: id})
	}
	if s.Inventory["material"] != 0 || s.Currencies["stamp"] != 0 || len(s.HomeRepairs) != 6 || !domain.Contains(s.Flags, "greenhouse_fortified_full") {
		t.Fatal("individual work did not complete greenhouse at original total cost")
	}
	// A pre-existing stage flag makes its old damage implicitly repaired.
	expectCode(t, restart, token, domain.Command{Type: "REPAIR_HOME", RepairID: "patch_windows"}, "REPAIR_ALREADY_COMPLETE")
}

func TestRenovationSlotsStayLockedUntilStageThree(t *testing.T) {
	g, token, _ := setup(t)
	reachHome(t, g, token)
	setStock(t, g, token, 30, 1)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Furniture = domain.Add(p.State.Furniture, "moon_hammock")
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}

	// 阶段 2 之前:高空横梁与阳光地板都锁着,基础槽位照常可用。
	s := execute(t, g, token, domain.Command{Type: "PLACE_FURNITURE", FurnitureID: "moon_hammock", SlotID: "corner"})
	if s.Placements["corner"] != "moon_hammock" {
		t.Fatal("basic slot placement failed")
	}
	expectCode(t, g, token, domain.Command{Type: "PLACE_FURNITURE", FurnitureID: "moon_hammock", SlotID: "beam"}, "SLOT_LOCKED")
	expectCode(t, g, token, domain.Command{Type: "PLACE_FURNITURE", FurnitureID: "moon_hammock", SlotID: "sun_spot"}, "SLOT_LOCKED")

	// 推进到阶段 3 后高空槽位解锁,吊床可以挂上横梁。
	s = execute(t, g, token, domain.Command{Type: "REPAIR_HOME"})
	s = execute(t, g, token, domain.Command{Type: "REPAIR_HOME"})
	if !domain.Contains(s.Flags, "greenhouse_fortified_full") {
		t.Fatalf("stage 3 flag missing: %+v", s.Flags)
	}
	s = execute(t, g, token, domain.Command{Type: "PLACE_FURNITURE", FurnitureID: "moon_hammock", SlotID: "beam"})
	if s.Placements["beam"] != "moon_hammock" || s.Placements["corner"] != "" {
		t.Fatalf("moon_hammock did not move to beam: %+v", s.Placements)
	}
}
