package service_test

import (
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func TestHomeSurfacesCollectionRewardsAndAtomicSave(t *testing.T) {
	g, _, _, token, path := setupWithPlayer(t)
	reachHome(t, g, token)
	expectCode(t, g, token, domain.Command{Type: "ACQUIRE_HOME_SURFACE", SurfaceID: "moss_wall"}, "COLLECTION_INCOMPLETE")
	grant := func(count int) {
		_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
			for _, pool := range g.Catalog.Pools {
				if pool.ID == "moss_letters" {
					for _, entry := range pool.Entries[:count] {
						p.State.Furniture = domain.Add(p.State.Furniture, entry.FurnitureID)
					}
				}
			}
			return domain.CommandResponse{State: p.State}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	grant(6)
	before, _ := g.State(token)
	s := execute(t, g, token, domain.Command{Type: "ACQUIRE_HOME_SURFACE", SurfaceID: "moss_wall"})
	if !domain.Contains(s.HomeSurfacesOwned, "moss_wall") || s.HomeSurfaces != nil || !reflect.DeepEqual(s.Currencies, before.Currencies) || !reflect.DeepEqual(s.Inventory, before.Inventory) {
		t.Fatal("collection reward must be free and not apply itself")
	}
	expectCode(t, g, token, domain.Command{Type: "ACQUIRE_HOME_SURFACE", SurfaceID: "moss_wall"}, "ALREADY_OWNED")
	expectCode(t, g, token, domain.Command{Type: "ACQUIRE_HOME_SURFACE", SurfaceID: "moss_floor"}, "COLLECTION_INCOMPLETE")
	good := domain.HomeLayoutChange{Key: "stage:1:rain-bucket", HomePlacement: domain.HomePlacement{X: 700, Y: 500}}
	before, _ = g.State(token)
	expectCode(t, g, token, domain.Command{Type: "SAVE_HOME_LAYOUT", Changes: []domain.HomeLayoutChange{good}, Surfaces: &domain.HomeSurfaces{Wallpaper: "moss_wall", Floor: "moon_floor"}}, "SURFACE_NOT_OWNED")
	after, _ := g.State(token)
	if !sameStateJSON(before, after) {
		t.Fatal("invalid finish partially moved furniture")
	}
	grant(12)
	s = execute(t, g, token, domain.Command{Type: "ACQUIRE_HOME_SURFACE", SurfaceID: "moss_floor"})
	req := domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "SAVE_HOME_LAYOUT", Surfaces: &domain.HomeSurfaces{Wallpaper: "moss_wall", Floor: "moss_floor"}}}
	first, err := g.Execute(token, "save-finishes-once", req)
	if err != nil {
		t.Fatal(err)
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	restart := service.New(store, g.Catalog)
	replay, err := restart.Execute(token, "save-finishes-once", req)
	if err != nil || !replay.Replayed || !sameStateJSON(first.State, replay.State) || replay.State.HomeSurfaces.Wallpaper != "moss_wall" {
		t.Fatalf("finish save did not persist/replay: %v", err)
	}
	expectCode(t, restart, token, domain.Command{Type: "SAVE_HOME_LAYOUT", Surfaces: &domain.HomeSurfaces{Wallpaper: "moss_floor", Floor: "moss_wall"}}, "SURFACE_NOT_OWNED")
	s = execute(t, restart, token, domain.Command{Type: "SAVE_HOME_LAYOUT", Surfaces: &domain.HomeSurfaces{Wallpaper: "original_wall", Floor: "original_floor"}})
	if s.HomeSurfaces.Floor != "original_floor" {
		t.Fatal("legacy native finishes should always be available")
	}
}
