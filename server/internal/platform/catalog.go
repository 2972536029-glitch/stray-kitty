package platform

import (
	_ "embed"
	"encoding/json"
	"stray-kitty/server/internal/domain"
)

//go:embed catalog.json
var CatalogJSON []byte

func LoadCatalog() (domain.Catalog, error) {
	var c domain.Catalog
	err := json.Unmarshal(CatalogJSON, &c)
	return c, err
}
