package service

import "stray-kitty/server/internal/domain"

// 单件家具购买复用 Execute 的版本检查、事务和持久幂等收据。
// 前端只提交商品 ID，价格、解锁和发货对象均从服务端目录读取。
func (g *Game) buyFurniture(s *domain.GameState, productID string) error {
	if err := domain.RequirePhase(*s, "home"); err != nil {
		return err
	}
	for _, p := range g.Catalog.Products {
		if p.ID != productID {
			continue
		}
		for _, f := range g.Catalog.Furniture {
			if f.ID == p.FurnitureID && f.Source == "story" {
				return domain.Fail("STORY_GIFT", "这件家具随剧情免费赠送，不需要购买。", 409)
			}
		}
		if p.Status != "available" || p.Price < 1 || p.CurrencyID != "stamp" {
			return domain.Fail("PRODUCT_UNAVAILABLE", "这件商品暂时不能购买", 409)
		}
		if p.RequiredFlag != "" && !domain.Contains(s.Flags, p.RequiredFlag) {
			return domain.Fail("PRODUCT_LOCKED", "完成首次救援后再来看看吧", 409)
		}
		if domain.Contains(s.Furniture, p.FurnitureID) {
			return domain.Fail("ALREADY_OWNED", "已经拥有这件家具，无需重复购买", 409)
		}
		valid := false
		for _, f := range g.Catalog.Furniture {
			if f.ID == p.FurnitureID {
				valid = true
				break
			}
		}
		if !valid {
			return domain.Fail("PRODUCT_UNAVAILABLE", "商品配置暂时不可用", 409)
		}
		if s.Currencies[p.CurrencyID] < p.Price {
			return domain.Fail("INSUFFICIENT_CURRENCY", "猫爪邮票不足，完成救援可以获得更多", 409)
		}
		s.Currencies[p.CurrencyID] -= p.Price
		s.Furniture = domain.Add(s.Furniture, p.FurnitureID)
		s.LastResult = domain.Result{Message: "购买成功，家具已送达花房，可以选择位置摆放。", Outcome: p.FurnitureID}
		return nil
	}
	return domain.Fail("INVALID_COMMAND", "商品不存在", 400)
}
