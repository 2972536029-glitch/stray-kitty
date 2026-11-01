package service

import (
	"encoding/json"
	"stray-kitty/server/internal/platform"
	"strings"
	"unicode/utf16"
)

// Read display text from the same embedded catalog used to start the game.
// Keeping this AI-only projection separate leaves the story/event domain and
// gameplay contracts unchanged. Only the current node/event is ever serialized
// by advisorJourneyProgress; this index is never included in model requests.
var advisorVisibleTexts = readAdvisorVisibleTexts(platform.CatalogJSON)

type advisorStoryText struct {
	ID      string `json:"id"`
	Speaker string `json:"speaker"`
	Text    string `json:"text"`
}

type advisorEventText struct {
	ID          string              `json:"id"`
	Text        string              `json:"text"`
	AdvisorHint json.RawMessage     `json:"advisorHint"`
	Options     []advisorOptionText `json:"options"`
}

type advisorOptionText struct {
	ID          string          `json:"id"`
	Label       string          `json:"label"`
	AdvisorHint json.RawMessage `json:"advisorHint"`
}

type advisorDisplayTexts struct {
	Story  map[string]advisorStoryText
	Events map[string]advisorEventText
}

func readAdvisorVisibleTexts(raw []byte) advisorDisplayTexts {
	result := advisorDisplayTexts{Story: map[string]advisorStoryText{}, Events: map[string]advisorEventText{}}
	var display struct {
		Story  []advisorStoryText `json:"story"`
		Events []advisorEventText `json:"events"`
	}
	if json.Unmarshal(raw, &display) != nil {
		return result
	}
	for _, story := range display.Story {
		result.Story[story.ID] = story
	}
	for _, event := range display.Events {
		result.Events[event.ID] = event
	}
	return result
}

func (event advisorEventText) optionLabel(id string) string {
	for _, option := range event.Options {
		if option.ID == id {
			return option.Label
		}
	}
	return ""
}

// Invalid optional metadata must not discard the event's ordinary display text.
// Match content lint's JS string length (UTF-16 units), not a truncated value.
func advisorPublicHint(raw json.RawMessage, limit int) string {
	var hint string
	if len(raw) == 0 || json.Unmarshal(raw, &hint) != nil || strings.TrimSpace(hint) == "" || len(utf16.Encode([]rune(hint))) > limit || strings.ContainsAny(hint, "\r\n\u2028\u2029") {
		return ""
	}
	return hint
}

func (event advisorEventText) optionHint(id string) string {
	for _, option := range event.Options {
		if option.ID == id {
			return advisorPublicHint(option.AdvisorHint, 60)
		}
	}
	return ""
}
