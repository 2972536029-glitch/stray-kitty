package service

import (
	"math"
	"stray-kitty/server/internal/domain"
	"strings"
)

func homeStage(s *domain.GameState) int {
	if domain.Contains(s.Flags, "finale_completed") || domain.Contains(s.Flags, "kingdom_founded") {
		return 4
	}
	if domain.Contains(s.Flags, "greenhouse_fortified_full") {
		return 3
	}
	if domain.Contains(s.Flags, "greenhouse_sealed") {
		return 2
	}
	return 1
}

func homeFurnished(s *domain.GameState) bool {
	for _, id := range s.Placements {
		if p, ok := s.HomeLayout["furniture:"+id]; !ok || !p.Stored {
			return true
		}
	}
	for key, p := range s.HomeLayout {
		if strings.HasPrefix(key, "furniture:") && !p.Stored {
			return true
		}
	}
	return false
}

// All edits validate before any mutation. The store commits the whole draft with
// its existing revision and idempotency receipt, so a lost response is retryable.
func (g *Game) saveHomeLayout(s *domain.GameState, changes []domain.HomeLayoutChange) error {
	if err := domain.RequirePhase(*s, "home"); err != nil {
		return err
	}
	if len(changes) < 1 || len(changes) > 96 {
		return domain.Fail("INVALID_LAYOUT", "一次布置需要 1 到 96 项改动", 400)
	}
	seen := map[string]bool{}
	for _, c := range changes {
		if seen[c.Key] {
			return domain.Fail("INVALID_LAYOUT", "同一件家具只能布置一次", 400)
		}
		seen[c.Key] = true
		width, wall, found := 0.0, false, false
		if strings.HasPrefix(c.Key, "furniture:") {
			id := strings.TrimPrefix(c.Key, "furniture:")
			if !domain.Contains(s.Furniture, id) {
				return domain.Fail("NOT_OWNED", "背包里还没有这件家具", 409)
			}
			for _, f := range g.Catalog.Furniture {
				if f.ID == id {
					width = math.Round(f.WidthCm * 1.7)
					found = true
				}
			}
			if width == 0 {
				width = map[string]float64{"cardboard_nest": 186, "box_castle": 192, "blue_bowl": 114, "soft_blanket": 150, "snack_cushion": 112, "red_cushion": 112, "cloud_nest": 154, "moon_hammock": 194, "tin_lamp": 52, "sun_lamp": 64, "star_glass": 66}[id]
			}
			wall = domain.Contains([]string{"star_glass", "postmark_clock", "lunar_clock", "comet_mobile"}, id)
		} else {
			for _, d := range g.Catalog.HomeDecor {
				if d.ID == c.Key && d.Stage == homeStage(s) {
					if !g.ownsHomeDecor(s, d) {
						return domain.Fail("NOT_OWNED", "请先在家具收藏中制作或领取这件家具", 409)
					}
					width = d.Width
					wall = d.Wall
					found = true
					break
				}
			}
		}
		if !found {
			return domain.Fail("DECOR_LOCKED", "这件阶段家具还没有解锁", 409)
		}
		if math.IsNaN(c.X) || math.IsNaN(c.Y) || math.IsInf(c.X, 0) || math.IsInf(c.Y, 0) || c.X != math.Round(c.X) || c.Y != math.Round(c.Y) {
			return domain.Fail("INVALID_LAYOUT", "家具坐标需要有效整数", 400)
		}
		// Stored items retain their last anchor for restoration. Front wall vines
		// and hanging ornaments have their own vertical mounting area.
		minY, maxY := 355.0, 728.0
		if wall {
			minY, maxY = 150, 890
		}
		if c.X < 80+width/2 || c.X > 1592-width/2 || c.Y < minY || c.Y > maxY {
			return domain.Fail("INVALID_LAYOUT", "请把家具放在花房可布置范围内", 400)
		}
	}
	if s.HomeLayout == nil {
		s.HomeLayout = map[string]domain.HomePlacement{}
	}
	for _, c := range changes {
		s.HomeLayout[c.Key] = c.HomePlacement
	}
	s.LastResult = domain.Result{Message: "家具已经摆好了，伙伴们会去新的位置找它们。"}
	return nil
}
