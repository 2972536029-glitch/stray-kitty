package domain

import "fmt"

type Fault struct {
	Code, Message string
	Status        int
}

func (e *Fault) Error() string                    { return e.Message }
func Fail(code, message string, status int) error { return &Fault{code, message, status} }

type Attempt struct {
	ID        string           `json:"id"`
	StageID   string           `json:"stageId"`
	Status    string           `json:"status"`
	Modifiers *BattleModifiers `json:"modifiers,omitempty"`
	// Supplies are reserved from available inventory once, for this attempt.
	Supplies map[string]int `json:"supplies,omitempty"`
}
type BattleReport struct {
	Leaks        *int  `json:"leaks"`
	BossDefeated *bool `json:"bossDefeated"`
}
type BattleRewards struct {
	Supplies        map[string]int `json:"supplies"`
	BaseCount       int            `json:"baseCount"`
	FirstClearBonus int            `json:"firstClearBonus"`
	PerfectBonus    int            `json:"perfectBonus"`
	Difficulty      string         `json:"difficulty"`
}
type Result struct {
	Message       string         `json:"message"`
	Roll          int            `json:"roll,omitempty"`
	Outcome       string         `json:"outcome,omitempty"`
	FirstClear    bool           `json:"firstClear,omitempty"`
	StageID       string         `json:"stageId,omitempty"`
	BattleRewards *BattleRewards `json:"battleRewards,omitempty"`
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
	// 随机事件:来源标记(node=交互点/random=随机触发)、本局已抽卡与探索里程。
	PendingEventSource string      `json:"pendingEventSource,omitempty"`
	DrawnEvents        []string    `json:"drawnEvents,omitempty"`
	ExploreDistance    int         `json:"exploreDistance,omitempty"`
	ActiveBattle       *Attempt    `json:"activeBattle"`
	LastResult         Result      `json:"lastResult"`
	EventState         *EventState `json:"eventState,omitempty"`
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
	ProductID     string `json:"productId,omitempty"`
	MapID         string `json:"mapId,omitempty"`
	// REPORT_MOVE 携带的本次行走里程(画布像素)。
	Distance     int            `json:"distance,omitempty"`
	Supplies     map[string]int `json:"supplies,omitempty"`
	UsedSupplies map[string]int `json:"usedSupplies,omitempty"`
	Report       *BattleReport  `json:"report,omitempty"`
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
	ID        string   `json:"id"`
	ChapterID string   `json:"chapterId"`
	Next      string   `json:"next"`
	Exit      string   `json:"exit"`
	SetFlags  []string `json:"setFlags,omitempty"`
}
type Interaction struct {
	ID      string `json:"id"`
	EventID string `json:"eventId"`
}
type Map struct {
	ID           string        `json:"id"`
	Interactions []Interaction `json:"interactions"`
	DangerLevel  int           `json:"dangerLevel"`
}
type EventOption struct {
	ID       string                  `json:"id"`
	Outcomes map[string]EventOutcome `json:"outcomes"`
}
type Event struct {
	ID       string        `json:"id"`
	Options  []EventOption `json:"options"`
	Category string        `json:"category"`
	Triggers []string      `json:"triggers"`
	Maps     []string      `json:"maps"`
}
type Stage struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	ChapterID string `json:"chapterId,omitempty"`
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
type Furniture struct {
	ID string `json:"id"`
}
type Product struct {
	ID           string `json:"id"`
	FurnitureID  string `json:"furnitureId"`
	Price        int    `json:"price"`
	CurrencyID   string `json:"currencyId"`
	RequiredFlag string `json:"requiredFlag"`
	Status       string `json:"status"`
}
type Catalog struct {
	Version   string      `json:"version"`
	Story     []StoryNode `json:"story"`
	Maps      []Map       `json:"maps"`
	Events    []Event     `json:"events"`
	Stages    []Stage     `json:"stages"`
	Pools     []Pool      `json:"pools"`
	Slots     []Slot      `json:"slots"`
	Furniture []Furniture `json:"furniture"`
	Products  []Product   `json:"products"`
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
