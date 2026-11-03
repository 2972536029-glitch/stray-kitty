package payment_test

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
)

func setup(t *testing.T) (*payment.Gateway, *repository.Store, string, string) {
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
	playerID := "player-gateway-test"
	err = store.Create("hash-"+playerID, &repository.Player{ID: playerID, State: domain.InitialState(catalog.Version), Receipts: map[string]repository.Receipt{}, ReceiptOrder: []string{}})
	if err != nil {
		t.Fatal(err)
	}
	return payment.New(store, catalog), store, path, playerID
}

func codeOf(t *testing.T, err error) string {
	t.Helper()
	var fault *domain.Fault
	if !errors.As(err, &fault) {
		t.Fatalf("expected domain fault, got %v", err)
	}
	return fault.Code
}

func TestCatalogHasTunaPacks(t *testing.T) {
	gateway, _, _, _ := setup(t)
	packs := gateway.Catalog()
	if len(packs) != 3 {
		t.Fatalf("expected 3 recharge packs, got %d", len(packs))
	}
	want := map[string]struct {
		priceCents, tuna int
	}{
		"pack_small":  {600, 60},
		"pack_medium": {1200, 150},
		"pack_large":  {3000, 400},
	}
	for _, p := range packs {
		w, ok := want[p.ID]
		if !ok {
			t.Fatalf("unexpected pack %s", p.ID)
		}
		if p.PriceCents != w.priceCents || p.TunaGranted != w.tuna {
			t.Fatalf("%s: price/tuna mismatch: %+v", p.ID, p)
		}
	}
	if _, ok := gateway.FindPack("pack_small"); !ok {
		t.Fatal("FindPack could not find pack_small")
	}
}

func TestCharge4242AlwaysConfirmsAndGrantsTuna(t *testing.T) {
	gateway, _, path, playerID := setup(t)
	// 卡号带空格与横线也应被清洗后接受。
	result, err := gateway.Charge(context.Background(), playerID, "pack_small", "4242 4242-4242 4242")
	if err != nil {
		t.Fatal(err)
	}
	if result.Txn.Status != "confirmed" || result.Txn.Amount != 600 || result.Txn.CardSuffix != "4242" {
		t.Fatalf("unexpected confirmed txn: %+v", result.Txn)
	}
	if result.TunaBalance != 60 {
		t.Fatalf("expected tuna balance 60, got %d", result.TunaBalance)
	}
	result, err = gateway.Charge(context.Background(), playerID, "pack_medium", "4242424242424242")
	if err != nil || result.TunaBalance != 210 {
		t.Fatalf("second charge did not stack: %+v err=%v", result, err)
	}
	// 重启后余额与流水仍在存档里。
	reopened, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	p, err := reopened.GetByPlayerID(playerID)
	if err != nil {
		t.Fatal(err)
	}
	if p.State.Currencies["tuna"] != 210 || len(p.State.Txns) != 2 {
		t.Fatalf("charges were not persisted: %+v", p.State)
	}
}

func TestCharge0000AlwaysDeclinesWithHealingCopy(t *testing.T) {
	gateway, _, _, playerID := setup(t)
	result, err := gateway.Charge(context.Background(), playerID, "pack_large", "0000123412341234")
	if err != nil {
		t.Fatal(err)
	}
	if result.Txn.Status != "declined" || result.Txn.CardSuffix != "1234" {
		t.Fatalf("unexpected declined txn: %+v", result.Txn)
	}
	if result.Txn.Reason == "" {
		t.Fatal("declined txn should carry a reason")
	}
	if result.TunaBalance != 0 {
		t.Fatalf("declined charge must not grant tuna, got %d", result.TunaBalance)
	}
	if msg := gateway.HealingMessage(); strings.TrimSpace(msg) == "" {
		t.Fatal("healing message must not be empty")
	}
}

func TestChargeOtherCardsAreGentlyDeclined(t *testing.T) {
	gateway, _, _, playerID := setup(t)
	result, err := gateway.Charge(context.Background(), playerID, "pack_small", "1234567812345678")
	if err != nil {
		t.Fatal(err)
	}
	if result.Txn.Status != "declined" || result.TunaBalance != 0 {
		t.Fatalf("non-demo card should decline deterministically: %+v", result)
	}
}

func TestChargeValidation(t *testing.T) {
	gateway, _, _, playerID := setup(t)
	if _, err := gateway.Charge(context.Background(), playerID, "pack_huge", "4242424242424242"); codeOf(t, err) != "PACK_NOT_FOUND" {
		t.Fatal("unknown pack should be rejected")
	}
	for _, card := range []string{"424", "abcd4242424242", "4242424242424242424242", ""} {
		if _, err := gateway.Charge(context.Background(), playerID, "pack_small", card); codeOf(t, err) != "INVALID_CARD" {
			t.Fatalf("card %q should be rejected", card)
		}
	}
	if _, err := gateway.Charge(context.Background(), "ghost-player", "pack_small", "4242424242424242"); codeOf(t, err) != "PLAYER_NOT_FOUND" {
		t.Fatal("unknown player should be rejected")
	}
}

func TestHistoryNewestFirstAndIncludesConsumption(t *testing.T) {
	gateway, store, _, playerID := setup(t)
	if _, err := gateway.Charge(context.Background(), playerID, "pack_small", "4242424242424242"); err != nil {
		t.Fatal(err)
	}
	if _, err := gateway.Charge(context.Background(), playerID, "pack_small", "0000123412341234"); err != nil {
		t.Fatal(err)
	}
	// 直接落一笔消费流水,模拟抽卡扣费的历史展示。
	err := store.TransactByPlayer(playerID, func(p *repository.Player) error {
		domain.AppendTxn(&p.State, domain.Txn{ID: "txn-spend", PackID: "starlight_greenhouse", Amount: 0, Status: "confirmed", Reason: "🥫 星空温室抽取 · 消耗 60 罐"})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	txns, err := gateway.History(context.Background(), playerID)
	if err != nil {
		t.Fatal(err)
	}
	if len(txns) != 3 {
		t.Fatalf("expected 3 txns, got %d", len(txns))
	}
	if txns[0].ID != "txn-spend" || txns[1].Status != "declined" || txns[2].Status != "confirmed" {
		t.Fatalf("history is not newest-first: %+v", txns)
	}
	if !reflect.DeepEqual(txns[0].PlayerID, playerID) {
		t.Fatalf("spend txn should be stamped with playerId, got %q", txns[0].PlayerID)
	}
	if _, err := gateway.History(context.Background(), "ghost-player"); codeOf(t, err) != "PLAYER_NOT_FOUND" {
		t.Fatal("history for unknown player should 404")
	}
}
