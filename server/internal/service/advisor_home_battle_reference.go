package service

import (
	_ "embed"
	"encoding/json"
	"stray-kitty/server/internal/domain"
)

// Generated from the same six chapter configs as the actual battle engines.
// This AI-only index is not read by gameplay.
//
//go:embed advisor_battle_reference.json
var advisorBattleReferenceJSON []byte

type advisorBattleReference struct {
	StageID       string `json:"stageId"`
	Name          string `json:"name"`
	ReferenceOnly bool   `json:"referenceOnly"`
	RuleSummary   string `json:"ruleSummary"`
	PublicRules   struct {
		EnergyPerSecond float64 `json:"energyPerSecond"`
		MaxEnergy       float64 `json:"maxEnergy"`
		MaxLeaks        float64 `json:"maxLeaks"`
		MaxCats         float64 `json:"maxCats"`
	} `json:"publicRules"`
	Cats []struct {
		ID             string  `json:"id"`
		Name           string  `json:"name"`
		Role           string  `json:"role"`
		MaxHP          float64 `json:"maxHp"`
		Damage         float64 `json:"damage"`
		AttackInterval float64 `json:"attackInterval"`
		Block          float64 `json:"block"`
		Range          string  `json:"range,omitempty"`
		Skill          struct {
			Name             string   `json:"name"`
			Description      string   `json:"description,omitempty"`
			Targeting        string   `json:"targeting"`
			Cost             float64  `json:"cost"`
			Damage           *float64 `json:"damage,omitempty"`
			Shield           *float64 `json:"shield,omitempty"`
			Duration         *float64 `json:"duration,omitempty"`
			Heal             *float64 `json:"heal,omitempty"`
			AttackMultiplier *float64 `json:"attackMultiplier,omitempty"`
			SlowMultiplier   *float64 `json:"slowMultiplier,omitempty"`
			SlowDuration     *float64 `json:"slowDuration,omitempty"`
			NightVision      *float64 `json:"nightVision,omitempty"`
			ClearHazards     *bool    `json:"clearHazards,omitempty"`
		} `json:"skill"`
	} `json:"cats"`
}

// A typed projection keeps future generator fields such as waves or unshown
// boss data from silently becoming model knowledge through this index.
func readAdvisorBattleReference(raw []byte) []advisorBattleReference {
	var references []advisorBattleReference
	if json.Unmarshal(raw, &references) != nil {
		return nil
	}
	return references
}

var advisorBattleReferences = readAdvisorBattleReference(advisorBattleReferenceJSON)

func (g *Game) advisorKnownBattleReferences(s domain.GameState) []advisorBattleReference {
	known := []advisorBattleReference{}
	for _, reference := range advisorBattleReferences {
		if !reference.ReferenceOnly || reference.StageID == "" {
			continue
		}
		catalogHasStage, experienced := false, advisorExperiencedBattle(s, reference.StageID)
		for _, stage := range g.Catalog.Stages {
			if stage.ID == reference.StageID {
				catalogHasStage = true
			}
		}
		// The first rescue and the replay boss use the same L01 battle engine.
		if reference.StageID == "alley_boss" && advisorExperiencedBattle(s, "alley_rescue") {
			experienced = true
		}
		if catalogHasStage && experienced {
			known = append(known, reference)
		}
	}
	return known
}
