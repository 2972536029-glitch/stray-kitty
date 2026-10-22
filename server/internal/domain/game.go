package domain

import "fmt"

type Fault struct {
	Code, Message string
	Status        int
}

func (e *Fault) Error() string                    { return e.Message }
func Fail(code, message string, status int) error { return &Fault{code, message, status} }

type Attempt struct {
	ID      string `json:"id"`
	StageID string `json:"stageId"`
	Status  string `json:"status"`
}
type Result struct {
	Message    string `json:"message"`
	Roll       int    `json:"roll,omitempty"`
	Outcome    string `json:"outcome,omitempty"`
	FirstClear bool   `json:"firstClear,omitempty"`
}
type GameState struct {
	SchemaVersion   int               `json:"schemaVersion"`
	ContentVersion  string            `json:"contentVersion"`
	Revision        int               `json:"revision"`
	Phase           string            `json:"phase"`
	ChapterID       string            `json:"chapterId"`
	StoryNodeID     string            `json:"storyNodeId"`
	MapID           string            `json:"mapId"`
	Flags           []string          `json:"flags"`
	Cats            []string          `json:"cats"`
	Inventory       map[string]int    `json:"inventory"`
	Currencies      map[string]int    `json:"currencies"`
	Furniture       []string          `json:"furniture"`
	Placements      map[string]string `json:"placements"`
	CompletedStages []string          `json:"completedStages"`
	PendingEventID  string            `json:"pendingEventId"`
	ActiveBattle    *Attempt          `json:"activeBattle"`
	LastResult      Result            `json:"lastResult"`
}

func InitialState(version string) GameState {
	return GameState{SchemaVersion: 1, ContentVersion: version, Phase: "dialogue", ChapterID: "prologue", StoryNodeID: "prologue_1", MapID: "alley", Flags: []string{}, Cats: []string{"miaomiao", "tuanzi"}, Inventory: map[string]int{"material": 0, "food": 0}, Currencies: map[string]int{"stamp": 0}, Furniture: []string{}, Placements: map[string]string{}, CompletedStages: []string{}, LastResult: Result{Message: "旅程从一缕金枪鱼的香味开始。"}}
}

type Command struct {
	Type          string `json:"type"`
	NodeID        string `json:"nodeId,omitempty"`
	InteractionID string `json:"interactionId,omitempty"`
	EventID       string `json:"eventId,omitempty"`
	OptionID      string `json:"optionId,omitempty"`
	StageID       string `json:"stageId,omitempty"`
	AttemptID     string `json:"attemptId,omitempty"`
	Outcome       string `json:"outcome,omitempty"`
	FurnitureID   string `json:"furnitureId,omitempty"`
	SlotID        string `json:"slotId,omitempty"`
	PoolID        string `json:"poolId,omitempty"`
}
type CommandRequest struct {
	ExpectedRevision *int    `json:"expectedRevision"`
	Command          Command `json:"command"`
}
type CommandResponse struct {
	State    GameState `json:"state"`
	Replayed bool      `json:"replayed"`
}
type StoryNode struct {
	ID        string `json:"id"`
	ChapterID string `json:"chapterId"`
	Next      string `json:"next"`
	Exit      string `json:"exit"`
}
type Interaction struct {
	ID      string `json:"id"`
	EventID string `json:"eventId"`
}
type Map struct {
	ID           string        `json:"id"`
	Interactions []Interaction `json:"interactions"`
}
type EventOption struct {
	ID        string `json:"id"`
	Threshold int    `json:"threshold"`
	Material  int    `json:"material"`
}
type Event struct {
	ID      string        `json:"id"`
	Options []EventOption `json:"options"`
}
type Stage struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}
type Entry struct {
	FurnitureID string `json:"furnitureId"`
	Weight      int    `json:"weight"`
}
type Pool struct {
	ID           string  `json:"id"`
	Cost         int     `json:"cost"`
	RequiredFlag string  `json:"requiredFlag"`
	Entries      []Entry `json:"entries"`
}
type Slot struct {
	ID string `json:"id"`
}
type Catalog struct {
	Version string      `json:"version"`
	Story   []StoryNode `json:"story"`
	Maps    []Map       `json:"maps"`
	Events  []Event     `json:"events"`
	Stages  []Stage     `json:"stages"`
	Pools   []Pool      `json:"pools"`
	Slots   []Slot      `json:"slots"`
}

func Contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}
func Add(values []string, value string) []string {
	if Contains(values, value) {
		return values
	}
	return append(values, value)
}
func RequirePhase(state GameState, phases ...string) error {
	if !Contains(phases, state.Phase) {
		return Fail("INVALID_PHASE", fmt.Sprintf("当前阶段 %s 不能执行此操作", state.Phase), 409)
	}
	return nil
}
