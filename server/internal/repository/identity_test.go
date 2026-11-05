package repository_test

import (
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
)

func TestObservationIdentityResolvesAliasesAndAllQAStates(t *testing.T) {
	store, _ := businessStore(t)
	if err := store.AttachAlias("player", "login-alias"); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name string
		edit func(*repository.Player)
		qa   bool
	}{
		{"normal", func(p *repository.Player) {}, false},
		{"checkpoint", func(p *repository.Player) { p.State.QACheckpointID = "prologue.story" }, true},
		{"restore backup", func(p *repository.Player) { p.State.QACheckpointID = ""; p.QARestore = &domain.GameState{} }, true},
		{"active QA battle", func(p *repository.Player) {
			p.QARestore = nil
			p.State.ActiveBattle = &domain.Attempt{Status: "active", QA: true}
		}, true},
		{"settled QA battle", func(p *repository.Player) { p.State.ActiveBattle.Status = "won" }, true},
		{"cleared battle", func(p *repository.Player) { p.State.ActiveBattle = nil }, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := store.TransactByPlayer("player", func(p *repository.Player) error { tc.edit(p); return nil }); err != nil {
				t.Fatal(err)
			}
			for _, hash := range []string{"hash", "login-alias"} {
				id, qa, err := store.ObservationIdentity(hash)
				if err != nil || id != "player" || qa != tc.qa {
					t.Fatalf("%s: got %q, %t, %v", hash, id, qa, err)
				}
			}
			id, qa, err := store.ObservationIdentityByPlayer("player")
			if err != nil || id != "player" || qa != tc.qa {
				t.Fatalf("by player: got %q, %t, %v", id, qa, err)
			}
		})
	}
	if _, _, err := store.ObservationIdentity("unknown"); domain.FaultCode(err) != "UNAUTHORIZED" {
		t.Fatalf("changed unknown session semantics: %v", err)
	}
	if _, _, err := store.ObservationIdentityByPlayer("unknown"); domain.FaultCode(err) != "PLAYER_NOT_FOUND" {
		t.Fatalf("changed unknown player semantics: %v", err)
	}
}
