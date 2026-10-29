package service_test

import (
	"errors"
	"path/filepath"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
)

// setupWithPlayer 额外返回 playerId,供支付网关入账使用。
func setupWithPlayer(t *testing.T) (*service.Game, *payment.Gateway, string, string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "save.json")
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	g := service.New(store, catalog)
	g.Random = func(int) (int, error) { return 0, nil }
	playerID, token, err := g.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	return g, payment.New(store, catalog), playerID, token, path
}

func recharge(t *testing.T, gateway *payment.Gateway, playerID string, packID string) {
	t.Helper()
	if _, err := gateway.Charge(playerID, packID, "4242424242424242"); err != nil {
		t.Fatal(err)
	}
}

func toHomeAfterRescue(t *testing.T, g *service.Game, token string) domain.GameState {
	t.Helper()
	s := toBattle(t, g, token)
	execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	execute(t, g, token, domain.Command{Type: "CONTINUE"})
	return finishStory(t, g, token)
}

func TestTunaPoolDrawsDeductTunaAndRecordSpend(t *testing.T) {
	g, gateway, playerID, token, _ := setupWithPlayer(t)
	s := toHomeAfterRescue(t, g, token)
	if s.Phase != "home" {
		t.Fatalf("expected home phase, got %s", s.Phase)
	}
	// 没充过钱:金枪鱼不足要被拒绝,且不产生流水。
	_, err := g.Execute(token, "tuna-draw-broke", domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "DRAW_FURNITURE", PoolID: "starlight_greenhouse"}})
	var fault *domain.Fault
	if !errors.As(err, &fault) || fault.Code != "INSUFFICIENT_CURRENCY" {
		t.Fatalf("expected INSUFFICIENT_CURRENCY, got %v", err)
	}
	s, _ = g.State(token)
	if len(s.Txns) != 0 {
		t.Fatal("rejected draw should not append txn")
	}
	// 充值 60 罐后抽取:Random=0 命中首个月亮吊床。
	recharge(t, gateway, playerID, "pack_small")
	s, _ = g.State(token)
	if s.Currencies["tuna"] != 60 {
		t.Fatalf("recharge did not land in state, tuna=%d", s.Currencies["tuna"])
	}
	s = execute(t, g, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: "starlight_greenhouse"})
	if s.Currencies["tuna"] != 0 {
		t.Fatalf("tuna was not deducted: %d", s.Currencies["tuna"])
	}
	if !domain.Contains(s.Furniture, "moon_hammock") {
		t.Fatalf("expected moon_hammock from first entry, furniture=%v", s.Furniture)
	}
	if len(s.Txns) != 2 || s.Txns[1].PackID != "starlight_greenhouse" || s.Txns[1].Status != "confirmed" || s.Txns[1].Amount != 0 {
		t.Fatalf("spend txn missing or malformed: %+v", s.Txns)
	}
	// 邮票余额不应被付费池动过(首次救援结算 +2)。
	if s.Currencies["stamp"] != 2 {
		t.Fatalf("stamp currency should be untouched, got %d", s.Currencies["stamp"])
	}
	// 再抽一次:重复家具转化为 2 份材料。
	recharge(t, gateway, playerID, "pack_small")
	s = execute(t, g, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: "starlight_greenhouse"})
	if s.Inventory["material"] != 5 { // 救援结算已给 3 份,重复转化再 +2。
		t.Fatalf("duplicate conversion did not add materials: %d", s.Inventory["material"])
	}
	if s.LastResult.Outcome != "moon_hammock" || s.LastResult.Message != "星空温室的包裹里是熟悉的家具，化作了 2 份修缮材料。" {
		t.Fatalf("duplicate message mismatch: %+v", s.LastResult)
	}
}

func TestStampPoolUnchangedByTunaIntroduction(t *testing.T) {
	g, _, _, token, _ := setupWithPlayer(t)
	s := toHomeAfterRescue(t, g, token)
	before := s.Currencies["stamp"]
	s = execute(t, g, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: "rainy_box"})
	if s.Currencies["stamp"] != before-1 {
		t.Fatalf("stamp pool should still cost stamps: %d -> %d", before, s.Currencies["stamp"])
	}
	if s.Currencies["tuna"] != 0 || len(s.Txns) != 0 {
		t.Fatalf("stamp draw should not touch tuna or txns: %+v", s)
	}
}
