package repository_test

import (
	"os"
	"path/filepath"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"testing"
)

func TestWriteFailureDoesNotCommitMemory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "progress")
	path := filepath.Join(dir, "game.json")
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	err = store.Create("hash", &repository.Player{ID: "player", State: domain.InitialState("test"), Receipts: map[string]repository.Receipt{}, ReceiptOrder: []string{}})
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err = os.Remove(dir); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(dir, []byte("blocked"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err = store.Transact("hash", func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Revision++
		return domain.CommandResponse{State: p.State}, nil
	})
	if err == nil {
		t.Fatal("unwritable path accepted")
	}
	p, err := store.Get("hash")
	if err != nil || p.State.Revision != 0 {
		t.Fatal("failed write committed memory")
	}
}
func TestCorruptSaveIsPreserved(t *testing.T) {
	path := filepath.Join(t.TempDir(), "game.json")
	raw := []byte("{broken")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Open(path); err == nil {
		t.Fatal("corrupt save accepted")
	}
	after, _ := os.ReadFile(path)
	if string(after) != string(raw) {
		t.Fatal("corrupt source was overwritten")
	}
}
