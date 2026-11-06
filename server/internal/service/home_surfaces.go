package service

import "stray-kitty/server/internal/domain"

func (g *Game) validateHomeSurfaces(s *domain.GameState, selection domain.HomeSurfaces) error {
	for kind, id := range map[string]string{"wallpaper": selection.Wallpaper, "floor": selection.Floor} {
		valid := false
		for _, item := range g.Catalog.HomeSurfaces {
			if item.ID == id && item.Kind == kind && (item.Default || domain.Contains(s.HomeSurfacesOwned, id)) {
				valid = true
				break
			}
		}
		if !valid {
			return domain.Fail("SURFACE_NOT_OWNED", "请先在家具收藏中领取对应墙纸或地板", 409)
		}
	}
	return nil
}

func (g *Game) acquireHomeSurface(s *domain.GameState, id string) error {
	if err := domain.RequirePhase(*s, "home"); err != nil {
		return err
	}
	for _, item := range g.Catalog.HomeSurfaces {
		if item.ID != id {
			continue
		}
		if item.Default || domain.Contains(s.HomeSurfacesOwned, id) {
			return domain.Fail("ALREADY_OWNED", "已拥有这款墙纸或地板", 409)
		}
		if item.RequiredOwned < 1 {
			return domain.Fail("SURFACE_LOCKED", "这款墙纸或地板尚未开放", 409)
		}
		for _, pool := range g.Catalog.Pools {
			if pool.ID != item.PoolID {
				continue
			}
			owned := 0
			for _, entry := range pool.Entries {
				if domain.Contains(s.Furniture, entry.FurnitureID) {
					owned++
				}
			}
			if owned < item.RequiredOwned {
				return domain.Fail("COLLECTION_INCOMPLETE", "集齐对应主题家具后即可领取", 409)
			}
			s.HomeSurfacesOwned = domain.Add(s.HomeSurfacesOwned, id)
			s.LastResult = domain.Result{Message: "收藏奖励已放入背包，可以在布置中更换。", Outcome: id}
			return nil
		}
	}
	return domain.Fail("SURFACE_LOCKED", "这款墙纸或地板尚未开放", 409)
}
