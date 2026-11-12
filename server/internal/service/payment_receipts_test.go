package service

import (
	"fmt"
	"path/filepath"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
)

func TestPaymentReplayAfterHistoryTrimAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "game.json")
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	game := New(store, catalog)
	id, _, err := game.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	initial, err := store.GetByPlayerID(id)
	if err != nil {
		t.Fatal(err)
	}
	pack := catalog.RechargePacks[0]
	first := domain.Txn{ID: "durable-payment-first", PlayerID: id, PackID: pack.ID, Status: "confirmed", Amount: pack.PriceCents}
	for i := 0; i <= domain.MaxTxns; i++ {
		txn := first
		if i > 0 {
			txn.ID = fmt.Sprintf("durable-payment-%d", i)
		}
		if _, err = game.ApplyCharge(id, txn, pack); err != nil {
			t.Fatal(err)
		}
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	game = New(store, catalog)
	want := initial.State.Currencies["tuna"] + (domain.MaxTxns+1)*pack.TunaGranted
	got, err := game.ApplyCharge(id, first, pack)
	if err != nil || got != want {
		t.Fatalf("replay after restart: balance %d want %d, error %v", got, want, err)
	}
	player, err := store.GetByPlayerID(id)
	if err != nil || len(player.State.Txns) != domain.MaxTxns || !player.AppliedPayments[first.ID] {
		t.Fatalf("durable payment receipt missing: %v", err)
	}
}
