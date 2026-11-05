package service

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"stray-kitty/server/internal/domain"
	"strings"
)

// This AI-only mirror is generated from the story owner's advisor-home.json by
// content:sync and checked by content:check. It is not a gameplay catalog field.
//
//go:embed advisor_home_story.json
var advisorHomeStoryJSON []byte

var advisorHomeStories = readAdvisorHomeStories(advisorHomeStoryJSON)

type advisorHomeStory struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Text          string   `json:"text"`
	RequiredFlags []string `json:"requiredFlags"`
	RequiredCats  []string `json:"requiredCats"`
}

// A separate output type makes it impossible to serialize future gates or
// authoring metadata along with a visible summary.
type advisorHomeStorySummary struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Text  string `json:"text"`
}

func readAdvisorHomeStories(raw []byte) []advisorHomeStory {
	var notes []advisorHomeStory
	if json.Unmarshal(raw, &notes) != nil {
		return nil
	}
	seen := map[string]bool{}
	for _, note := range notes {
		if strings.TrimSpace(note.ID) == "" || seen[note.ID] || strings.TrimSpace(note.Title) == "" || strings.TrimSpace(note.Text) == "" || len(note.RequiredFlags) == 0 || note.RequiredCats == nil {
			return nil
		}
		seen[note.ID] = true
		for _, condition := range append(append([]string{}, note.RequiredFlags...), note.RequiredCats...) {
			if strings.TrimSpace(condition) == "" {
				return nil
			}
		}
	}
	return notes
}

func advisorKnownHomeStorySummaries(s domain.GameState) []advisorHomeStorySummary {
	result := []advisorHomeStorySummary{}
	// Checkpoint flags manufacture a scene; they do not record a played story.
	if s.Phase != "home" || s.QACheckpointID != "" {
		return result
	}
	for _, note := range advisorHomeStories {
		known := true
		for _, flag := range note.RequiredFlags {
			known = known && domain.Contains(s.Flags, flag)
		}
		for _, cat := range note.RequiredCats {
			known = known && domain.Contains(s.Cats, cat)
		}
		if known {
			result = append(result, advisorHomeStorySummary{ID: note.ID, Title: note.Title, Text: note.Text})
		}
	}
	return result
}

// Match the existing home journey target rules, using the authenticated state
// instead of the client-provided description of its progress.
func advisorHomeGoal(s domain.GameState) string {
	has := func(flag string) bool { return domain.Contains(s.Flags, flag) }
	if has("finale_completed") || has("kingdom_founded") {
		return "家园已经落成，可以整理家具、和伙伴相处，或重访已解锁的地图。"
	}
	if has("tunnel_explored") && has("cats_rescued_batch1") {
		if has("finale_started") {
			return "在家园旅程入口继续探索仓库。"
		}
		clues := max(0, s.Inventory["clue"])
		if clues < 3 {
			return fmt.Sprintf("仓库启程还需至少3条线索，当前%d条；回集市继续打听情报。", clues)
		}
		return "救援与线索条件已满足，可以从家园的第五章入口开始仓库旅程。"
	}
	if has("chapter_3_started") && has("momo_joined") && !has("greenhouse_fortified") {
		return "墨墨已经加入，下一步先完成花房保卫战，守住花房防线后才能进入地下通道。"
	}
	if has("greenhouse_fortified") {
		if has("chapter_4_started") {
			return "通过家园旅程入口继续地下通道探索。"
		}
		return "花房防线已守住，通过家园旅程入口开启第四章。"
	}
	if has("market_cleared") && has("market_exit_crossed") {
		return "继续第三章花房故事，和伙伴一起准备守护家园。"
	}
	if has("rescue_story_done") {
		return "通过家园旅程入口前往午夜集市，寻找伙伴与线索。"
	}
	return "整理家园，并按当前旅程入口继续已解锁的故事。"
}
