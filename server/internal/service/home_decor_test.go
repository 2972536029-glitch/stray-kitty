package service_test

import (
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func TestHomeDecorAcquisitionOwnershipAndPersistence(t *testing.T) {
	g, _, _, token, path := setupWithPlayer(t)
	reachHome(t, g, token)
	expectCode(t, g, token, domain.Command{Type: "ACQUIRE_HOME_DECOR", DecorID: "stage:3:citrus-tree"}, "DECOR_LOCKED")
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Flags = domain.Add(p.State.Flags, "greenhouse_fortified_full")
		p.State.Inventory["material"] = 3
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	change := domain.HomeLayoutChange{Key: "stage:3:citrus-tree", HomePlacement: domain.HomePlacement{X: 800, Y: 500}}
	expectCode(t, g, token, domain.Command{Type: "SAVE_HOME_LAYOUT", Changes: []domain.HomeLayoutChange{change}}, "NOT_OWNED")
	expectCode(t, g, token, domain.Command{Type: "ACQUIRE_HOME_DECOR", DecorID: change.Key}, "INSUFFICIENT_MATERIAL")
	setStock(t, g, token, 4, 0)
	before, _ := g.State(token)
	req := domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "ACQUIRE_HOME_DECOR", DecorID: change.Key}}
	first, err := g.Execute(token, "craft-citrus-once", req)
	if err != nil {
		t.Fatal(err)
	}
	if first.State.Inventory["material"] != 0 || !domain.Contains(first.State.HomeDecorOwned, "citrus-tree") || len(first.State.HomeLayout) != 0 {
		t.Fatal("craft should debit once, grant ownership and leave furniture in backpack")
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	restart := service.New(store, g.Catalog)
	replay, err := restart.Execute(token, "craft-citrus-once", req)
	if err != nil || !replay.Replayed || !sameStateJSON(first.State, replay.State) {
		t.Fatalf("craft receipt did not survive restart: %v", err)
	}
	expectCode(t, restart, token, req.Command, "ALREADY_OWNED")
	execute(t, restart, token, domain.Command{Type: "SAVE_HOME_LAYOUT", Changes: []domain.HomeLayoutChange{change}})
	_, err = restart.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Flags = domain.Add(p.State.Flags, "kingdom_founded")
		// A legacy player explicitly arranged this optional furnishing before acquisition existed.
		p.State.HomeLayout["stage:3:reading-hammock"] = domain.HomePlacement{X: 600, Y: 500, Stored: true}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	change.Key = "stage:4:citrus-tree"
	execute(t, restart, token, domain.Command{Type: "SAVE_HOME_LAYOUT", Changes: []domain.HomeLayoutChange{change}})
	change.Key = "stage:4:reading-hammock"
	execute(t, restart, token, domain.Command{Type: "SAVE_HOME_LAYOUT", Changes: []domain.HomeLayoutChange{change}})
	s := execute(t, restart, token, domain.Command{Type: "ACQUIRE_HOME_DECOR", DecorID: "stage:4:entry-wreath"})
	if s.Inventory["material"] != 0 || !domain.Contains(s.HomeDecorOwned, "entry-wreath") {
		t.Fatal("celebration gift should be free")
	}
	expectCode(t, restart, token, domain.Command{Type: "ACQUIRE_HOME_DECOR", DecorID: "stage:4:entry-wreath"}, "ALREADY_OWNED")
}
