package service

import "stray-kitty/server/internal/domain"

// Saved arrangements predate optional furnishing acquisition. Keep those items
// owned, including when their later renovation uses a new stage layout key.
func (g *Game) ownsHomeDecor(s *domain.GameState, d domain.HomeDecor) bool {
	if d.Acquisition == nil || domain.Contains(s.HomeDecorOwned, d.ObjectID) {
		return true
	}
	for _, previous := range g.Catalog.HomeDecor {
		if previous.ObjectID == d.ObjectID && previous.Stage <= homeStage(s) {
			if _, saved := s.HomeLayout[previous.ID]; saved {
				return true
			}
		}
	}
	return false
}

func (g *Game) acquireHomeDecor(s *domain.GameState, decorID string) error {
	if err := domain.RequirePhase(*s, "home"); err != nil {
		return err
	}
	for _, d := range g.Catalog.HomeDecor {
		if d.ID != decorID || d.Stage != homeStage(s) {
			continue
		}
		if g.ownsHomeDecor(s, d) {
			return domain.Fail("ALREADY_OWNED", "已经拥有这件家具，可以直接布置", 409)
		}
		a := d.Acquisition
		if a.Kind != "craft" && a.Kind != "gift" || a.Kind == "craft" && a.Material < 1 || a.Kind == "gift" && (d.Stage != 4 || a.Material != 0) {
			return domain.Fail("DECOR_LOCKED", "这件家具暂时无法获取", 409)
		}
		if s.Inventory["material"] < a.Material {
			return domain.Fail("INSUFFICIENT_MATERIAL", "材料不足，探索时收集材料后再来制作", 409)
		}
		s.Inventory["material"] -= a.Material
		s.HomeDecorOwned = domain.Add(s.HomeDecorOwned, d.ObjectID)
		s.LastResult = domain.Result{Message: d.Name + "已放入家具背包，可自行选择位置布置。", Outcome: d.ObjectID}
		return nil
	}
	return domain.Fail("DECOR_LOCKED", "完成对应阶段的花房修缮后再来看看", 409)
}
