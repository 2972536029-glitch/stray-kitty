package service

import (
	"context"
	"encoding/json"
	"stray-kitty/server/internal/domain"
)

// The key describes the semantic scene, not movement distance or a UI-only panel.
// Keep the array order in sync with the client journey snapshot builder.
func advisorSceneKey(s domain.GameState) string {
	attemptID := ""
	if s.ActiveBattle != nil {
		attemptID = s.ActiveBattle.ID
	}
	key, _ := json.Marshal([]string{s.Phase, s.ChapterID, s.MapID, s.StoryNodeID, s.PendingEventID, attemptID})
	return string(key)
}

func advisorContextChanged() error {
	return domain.Fail("ADVISOR_CONTEXT_CHANGED", "当前位置或进度已经变化，请根据当前画面重新询问阿策", 409)
}

// advisorJourneyProgress explicitly selects already-known facts. It must never
// serialize GameState, Catalog, EventOption or EventOutcome wholesale: those
// objects include private transactions or unrevealed branches and outcomes.
func (g *Game) advisorJourneyProgress(s domain.GameState) map[string]any {
	progress := map[string]any{
		"phase": s.Phase, "chapterId": s.ChapterID, "mapId": s.MapID,
		"cats": s.Cats, "knownFlags": s.Flags, "completedStages": s.CompletedStages,
		"resources":  map[string]int{"food": s.Inventory["food"], "material": s.Inventory["material"], "clue": s.Inventory["clue"], "stamp": s.Currencies["stamp"], "tuna": s.Currencies["tuna"]},
		"pushTokens": s.PushTokens,
	}
	if s.ActiveBattle != nil {
		progress["battle"] = map[string]string{"stageId": s.ActiveBattle.StageID, "status": s.ActiveBattle.Status}
	}
	if s.Phase == "dialogue" {
		for _, node := range g.Catalog.Story {
			if node.ID == s.StoryNodeID {
				visible := advisorVisibleTexts.Story[node.ID]
				progress["currentStory"] = map[string]string{"id": node.ID, "speaker": visible.Speaker, "text": visible.Text}
				break
			}
		}
	}
	if s.Phase == "event" && s.PendingEventID != "" {
		for _, event := range g.Catalog.Events {
			if event.ID != s.PendingEventID {
				continue
			}
			options := []map[string]string{}
			visible := advisorVisibleTexts.Events[event.ID]
			for _, option := range event.Options {
				if option.RequireCat == "" || domain.Contains(s.Cats, option.RequireCat) {
					options = append(options, map[string]string{"id": option.ID, "label": visible.optionLabel(option.ID)})
				}
			}
			progress["currentEvent"] = map[string]any{"id": event.ID, "title": event.Title, "text": visible.Text, "options": options}
			break
		}
	}
	if s.EventState != nil {
		modifiers := s.EventState.PendingModifiers
		progress["pendingSupport"] = map[string]any{"carry": modifiers.Carry, "shadowPressure": modifiers.ShadowPressure, "situation": modifiers.Situation}
		last := s.EventState.LastResolution
		if last.EventID != "" {
			// Only the result which the player actually received is visible here.
			progress["lastEvent"] = map[string]any{"eventId": last.EventID, "optionId": last.OptionID, "dice": last.Dice, "tier": last.Tier, "text": last.Outcome.Text, "reward": last.Outcome.Reward}
		}
	}
	if s.Phase == "settlement" {
		progress["battleResult"] = map[string]any{"stageId": s.LastResult.StageID, "message": s.LastResult.Message, "outcome": s.LastResult.Outcome, "firstClear": s.LastResult.FirstClear}
	}
	ownedFurniture := []map[string]string{}
	for _, id := range s.Furniture {
		name := id
		for _, item := range g.Catalog.Furniture {
			if item.ID == id {
				name = item.Name
				break
			}
		}
		ownedFurniture = append(ownedFurniture, map[string]string{"id": id, "name": name})
	}
	progress["ownedFurniture"] = ownedFurniture
	progress["placements"] = s.Placements
	progress["completedHomeRepairs"] = s.HomeRepairs
	if s.Phase == "home" {
		layout := map[string]any{}
		for key, placement := range s.HomeLayout {
			layout[key] = map[string]any{"x": placement.X, "y": placement.Y, "stored": placement.Stored}
		}
		progress["homeLayout"] = layout
		if domain.Contains(s.Flags, "finale_completed") || domain.Contains(s.Flags, "kingdom_founded") {
			return progress
		}
		for _, renovation := range g.renovationsByStage() {
			if domain.Contains(s.Flags, renovation.GrantsFlag) {
				continue
			}
			if renovation.RequiredFlag != "" && !domain.Contains(s.Flags, renovation.RequiredFlag) {
				break
			}
			parts := []map[string]any{}
			for _, part := range renovation.Parts {
				completed, unlocked, affordable := domain.Contains(s.HomeRepairs, part.ID), true, true
				for _, required := range part.Requires {
					if !domain.Contains(s.HomeRepairs, required) {
						unlocked = false
					}
				}
				for item, amount := range part.Cost {
					if g.walletOf(&s, item)[item] < amount {
						affordable = false
					}
				}
				parts = append(parts, map[string]any{"id": part.ID, "name": part.Name, "description": part.Description, "cost": part.Cost, "completed": completed, "unlocked": unlocked, "affordable": affordable, "requires": part.Requires})
			}
			current := map[string]any{"name": renovation.Name, "description": renovation.Description, "parts": parts}
			// Older catalogs may have only a whole-stage cost; current catalogs use parts.
			if len(renovation.Parts) == 0 {
				current["cost"] = renovation.Cost
			}
			progress["currentHomeRenovation"] = current
			break
		}
	}
	return progress
}

func (g *Game) adviseJourney(ctx context.Context, token string, input domain.AdvisorRequest) (domain.AdvisorResponse, error) {
	before, err := g.State(token)
	if err != nil {
		return domain.AdvisorResponse{}, err
	}
	if input.SceneKey != advisorSceneKey(before) || input.ExpectedRevision == nil || *input.ExpectedRevision != before.Revision {
		return domain.AdvisorResponse{}, advisorContextChanged()
	}
	progress := g.advisorJourneyProgress(before)
	fingerprint, err := json.Marshal(progress)
	if err != nil {
		return domain.AdvisorResponse{}, domain.Fail("INVALID_ADVISOR_REQUEST", "当前进度暂时无法读取", 400)
	}
	visible := json.RawMessage(input.Context)
	combined, err := json.Marshal(struct {
		ServerProgress map[string]any  `json:"serverProgress"`
		VisibleContext json.RawMessage `json:"visibleContext"`
	}{progress, visible})
	if err != nil {
		return domain.AdvisorResponse{}, domain.Fail("INVALID_ADVISOR_REQUEST", "当前可见信息无效", 400)
	}
	input.Context = string(combined)
	result := g.Advisor.Reply(ctx, Hash(token), input)
	after, err := g.State(token)
	if err != nil {
		return domain.AdvisorResponse{}, err
	}
	afterFingerprint, err := json.Marshal(g.advisorJourneyProgress(after))
	// A harmless REPORT_MOVE can increment revision while an answer is pending.
	// Actual scene changes, selected events and changed resources still invalidate it.
	if err != nil || advisorSceneKey(after) != input.SceneKey || string(afterFingerprint) != string(fingerprint) {
		return domain.AdvisorResponse{}, advisorContextChanged()
	}
	return result, nil
}
