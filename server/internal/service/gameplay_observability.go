package service

import (
	_ "embed"
	"encoding/json"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/obs"
	"strings"
)

// Gameplay flags created in Go (rather than the content catalog) have an
// explicit, finite registry. A malformed observability registry degrades to
// unknown tags instead of preventing the game from starting.
//
//go:embed gameplay_observability_flags.json
var gameplayFlagsJSON []byte

var gameplayFlags = func() []string {
	var flags []string
	_ = json.Unmarshal(gameplayFlagsJSON, &flags)
	return flags
}()

// All success observations run after the repository has persisted the command.
// They never become part of gameplay or affect a transaction's result.
func (g *Game) observeGameplay(before, after domain.GameState, command domain.Command) {
	qa := isQAObservation(before, after, command)
	g.observeStoryEntry(before, after, qa)
	if command.Type == "ADVANCE_STORY" && validStoryChoice(before.StoryNodeID, command.OptionID) {
		if node, ok := g.observedStoryNode(before.StoryNodeID); ok {
			gameplayCount("kitty.story.choice", qa, "node:"+node.ID, "option:"+command.OptionID)
		}
	}
	if after.StoryNodeID == "finale_clue_insufficient" && before.StoryNodeID != after.StoryNodeID && after.Inventory["clue"] < 3 {
		observeClueGate(qa)
	}
	previous, current := before.ActiveBattle, after.ActiveBattle
	if current != nil && current.Status == "active" && (previous == nil || previous.ID != current.ID) {
		gameplayCount("kitty.battle.start", qa, g.observedBattleTags(current)...)
	}
	if previous != nil && previous.Status == "active" && current != nil && previous.ID == current.ID && current.Status != "active" &&
		(command.Type == "COMPLETE_BATTLE" || command.Type == "QA_SIMULATE_VICTORY" || command.Type == "QA_SIMULATE_DEFEAT") {
		tags := append(g.observedBattleTags(previous), "outcome:"+observedBattleOutcome(current.Status))
		gameplayCount("kitty.battle.settle", qa, tags...)
	}
	if target, phase, check := g.observedBattleReturn(before, command); check {
		// Completion only opens the result screen. Check the later navigation
		// against an independently derived destination, not its previous map.
		// This observes server region/phase only, never client coordinates.
		result := "ok"
		if target == "unknown" || after.MapID != target || after.Phase != phase || after.ActiveBattle != nil {
			result = "deviation"
		}
		gameplayCount("kitty.battle.return_check", qa, "map:"+g.observedMap(target), "result:"+result)
	}
	if command.Type == "CHOOSE_EVENT" && after.EventState != nil {
		resolution := after.EventState.LastResolution
		event, option := g.observedEventOption(resolution.EventID, resolution.OptionID)
		gameplayCount("kitty.event.resolve", qa, "event:"+event, "option:"+option, "tier:"+observedEnum(resolution.Tier, "fail", "partial", "success", "crit"))
	}
	// Diff the durable state, rather than individual reward branches, so each
	// newly attained flag is counted once even when several branches add it.
	// Most commands (including movement reports) add no flag. Build the
	// catalog allowlist only when there is an actual new value to observe.
	var knownFlags map[string]bool
	seen := make(map[string]bool, len(before.Flags)+len(after.Flags))
	for _, flag := range before.Flags {
		seen[flag] = true
	}
	for _, flag := range after.Flags {
		if seen[flag] {
			continue
		}
		seen[flag] = true
		if knownFlags == nil {
			knownFlags = g.observedFlags()
		}
		value := "unknown"
		if knownFlags[flag] {
			value = flag
		}
		gameplayCount("kitty.event.flag", qa, "flag:"+value)
	}
}

func gameplayCount(name string, qa bool, tags ...string) {
	if qa {
		tags = append(tags, "qa:true")
	} else {
		tags = append(tags, "qa:false")
	}
	obs.Incr(name, tags...)
}

func isQAObservation(before, after domain.GameState, command domain.Command) bool {
	return strings.HasPrefix(command.Type, "QA_") || before.QACheckpointID != "" || after.QACheckpointID != "" ||
		before.ActiveBattle != nil && before.ActiveBattle.QA || after.ActiveBattle != nil && after.ActiveBattle.QA
}

func snapshotGameplayObservation(state domain.GameState) domain.GameState {
	copy := state
	copy.Flags = append([]string(nil), state.Flags...)
	copy.Inventory = make(map[string]int, len(state.Inventory))
	for key, value := range state.Inventory {
		copy.Inventory[key] = value
	}
	if state.ActiveBattle != nil {
		attempt := *state.ActiveBattle
		if state.ActiveBattle.Modifiers != nil {
			modifiers := *state.ActiveBattle.Modifiers
			attempt.Modifiers = &modifiers
		}
		copy.ActiveBattle = &attempt
	}
	return copy
}

func (g *Game) observedBattleReturn(before domain.GameState, command domain.Command) (target, phase string, check bool) {
	attempt := before.ActiveBattle
	if attempt == nil || (attempt.Status != "won" && attempt.Status != "lost") ||
		(before.Phase != "settlement" && before.Phase != "preparation") {
		return "", "", false
	}
	switch command.Type {
	case "CONTINUE":
		if attempt.Status == "lost" {
			// Losing returns to preparation (or immediately retries L00).
			// Neither is a completed return to the world.
			return "", "", false
		}
		switch attempt.StageID {
		case "l00_tutorial":
			return "alley", "dialogue", true
		case "alley_rescue":
			if !domain.Contains(before.Flags, "rescue_story_done") {
				return "alley", "dialogue", true
			}
			return "greenhouse", "home", true
		case "alley_boss", "greenhouse_boss":
			return "greenhouse", "home", true
		case "market_boss":
			if attempt.Mainline {
				return "market", "explore", true
			}
			return "greenhouse", "home", true
		case "tunnel_boss":
			if attempt.Mainline {
				return "tunnel", "dialogue", true
			}
			return "greenhouse", "home", true
		case "finale_boss":
			if attempt.Mainline {
				return "warehouse", "dialogue", true
			}
			return "greenhouse", "home", true
		default:
			return "unknown", "unknown", true
		}
	case "GO_HOME":
		return "greenhouse", "home", true
	case "GO_EXPLORE":
		target := command.MapID
		if target == "" {
			target = "alley"
			if before.MapID == "market" || before.MapID == "tunnel" {
				target = before.MapID
			}
		}
		return g.observedMap(target), "explore", true
	case "START_STORY":
		if command.NodeID == "finale_clue_insufficient" {
			return "market", "dialogue", true
		}
		if node, ok := g.observedStoryNode(command.NodeID); ok {
			switch node.ChapterID {
			case "alley":
				return "alley", "dialogue", true
			case "market":
				return "market", "dialogue", true
			case "greenhouse":
				return "greenhouse", "dialogue", true
			case "rescue":
				return "tunnel", "dialogue", true
			case "finale":
				return "warehouse", "dialogue", true
			}
		}
		// Legacy prologue/story nodes have no authored map transition.
		return g.observedMap(before.MapID), "dialogue", true
	default:
		return "", "", false
	}
}

func validStoryChoice(nodeID, optionID string) bool {
	return (nodeID == "prologue_banter" || nodeID == "prologue_sneak") && (optionID == "proud" || optionID == "honest")
}

func (g *Game) observedStoryNode(id string) (domain.StoryNode, bool) {
	for _, node := range g.Catalog.Story {
		if node.ID == id {
			return node, true
		}
	}
	return domain.StoryNode{}, false
}

// node counts entries, not dialogue-button presses. It includes automatic
// story transitions and session creation and does not recount an unchanged node.
func (g *Game) observeStoryEntry(before, after domain.GameState, qa bool) {
	if after.StoryNodeID == "" || after.StoryNodeID == before.StoryNodeID {
		return
	}
	nodeTag, chapterTag := "unknown", "unknown"
	if node, ok := g.observedStoryNode(after.StoryNodeID); ok {
		nodeTag = node.ID
		for _, chapter := range g.Catalog.Chapters {
			if chapter.ID == node.ChapterID {
				chapterTag = chapter.ID
				break
			}
		}
	}
	gameplayCount("kitty.story.node", qa, "chapter:"+chapterTag, "node:"+nodeTag)
}

func isClueGateRejection(before domain.GameState, command domain.Command, err error) bool {
	return command.Type == "START_STORY" && command.NodeID == "finale_intro_1" &&
		domain.FaultCode(err) == "STORY_LOCKED" && before.Inventory["clue"] < 3 &&
		domain.Contains(before.Flags, "tunnel_explored") && domain.Contains(before.Flags, "cats_rescued_batch1")
}

func observeClueGate(qa bool) {
	gameplayCount("kitty.story.gate_hit", qa, "gate:finale_clue_insufficient")
}

func (g *Game) observedBattleTags(attempt *domain.Attempt) []string {
	chapter := "unknown"
	for _, stage := range g.Catalog.Stages {
		if stage.ID == attempt.StageID {
			switch stage.ID {
			case "l00_tutorial":
				chapter = "L00"
			case "alley_rescue", "alley_boss":
				chapter = "L01"
			case "market_boss":
				chapter = "L02"
			case "greenhouse_boss":
				chapter = "L03"
			case "tunnel_boss":
				chapter = "L04"
			case "finale_boss":
				chapter = "L05"
			}
			break
		}
	}
	difficulty, err := battleDifficulty(attempt.Modifiers)
	if err != nil {
		difficulty = "unknown"
	}
	return []string{"chapter:" + chapter, "difficulty:" + observedEnum(difficulty, "low", "medium", "high")}
}

func observedBattleOutcome(outcome string) string {
	switch outcome {
	case "won":
		return "win"
	case "lost":
		return "lose"
	case "retreat":
		return "retreat"
	default:
		return "unknown"
	}
}

func observedEnum(value string, allowed ...string) string {
	for _, candidate := range allowed {
		if value == candidate {
			return value
		}
	}
	return "unknown"
}

func (g *Game) observedMap(id string) string {
	for _, m := range g.Catalog.Maps {
		if m.ID == id {
			return id
		}
	}
	return "unknown"
}

func (g *Game) observedEventOption(eventID, optionID string) (string, string) {
	for _, event := range g.Catalog.Events {
		if event.ID == eventID {
			for _, option := range event.Options {
				if option.ID == optionID {
					return event.ID, option.ID
				}
			}
			return event.ID, "unknown"
		}
	}
	return "unknown", "unknown"
}

func (g *Game) observedFlags() map[string]bool {
	flags := make(map[string]bool)
	add := func(values ...string) {
		for _, value := range values {
			if value != "" {
				flags[value] = true
			}
		}
	}
	add(gameplayFlags...)
	for _, node := range g.Catalog.Story {
		add(node.SetFlags...)
	}
	for _, event := range g.Catalog.Events {
		add(event.RequiresFlags...)
		for _, option := range event.Options {
			for _, outcome := range option.Outcomes {
				add(outcome.Flags...)
			}
		}
	}
	for _, pool := range g.Catalog.Pools {
		add(pool.RequiredFlag)
	}
	for _, product := range g.Catalog.Products {
		add(product.RequiredFlag)
	}
	for _, reward := range g.Catalog.ParcelRewards {
		add(reward.RequiredFlag)
	}
	for _, renovation := range g.Catalog.Renovations {
		add(renovation.RequiredFlag, renovation.GrantsFlag)
	}
	for _, anchor := range warehouseSpatial.Interactions {
		if anchor.Kind == "light" {
			add(anchor.ID)
		}
	}
	return flags
}
