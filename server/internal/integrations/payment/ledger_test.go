package payment_test

import (
	"path/filepath"
	"testing"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
)

func TestFileLedgerRecordAndHistoryNewestFirst(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "payments.json")
	ledger, err := payment.OpenLedger(path)
	if err != nil {
		t.Fatal(err)
	}
	base := time.Now()
	for i, id := range []string{"txn-a", "txn-b", "txn-c"} {
		if err := ledger.Record(domain.Txn{ID: id, PlayerID: "p1", Status: "confirmed", CreatedAt: base.Add(time.Duration(i) * time.Minute)}); err != nil {
			t.Fatal(err)
		}
	}
	got, err := ledger.History("p1")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"txn-c", "txn-b", "txn-a"}
	for i, txn := range got {
		if txn.ID != want[i] {
			t.Fatalf("history not newest-first: %+v", got)
		}
	}
	// 其他玩家互不可见
	other, _ := ledger.History("p2")
	if len(other) != 0 {
		t.Fatalf("expected empty history for unknown player, got %+v", other)
	}
}

func TestFileLedgerPersistsAcrossReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "payments.json")
	ledger, err := payment.OpenLedger(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := ledger.Record(domain.Txn{ID: "txn-x", PlayerID: "p1", Status: "declined", CreatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	reopened, err := payment.OpenLedger(path)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := reopened.History("p1")
	if len(got) != 1 || got[0].ID != "txn-x" || got[0].Status != "declined" {
		t.Fatalf("ledger did not persist: %+v", got)
	}
}
