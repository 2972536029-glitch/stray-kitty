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
	// Legacy storage only: old active reservations are fully returned at settlement.
	// New battles never reserve or consume supplies.
	Supplies map[string]int `json:"supplies,omitempty"`
}
type BattleReport struct {
	Leaks          *int  `json:"leaks"`
	BossDefeated   *bool `json:"bossDefeated"`
	ElitesDefeated *int  `json:"elitesDefeated,omitempty"`
}
type Result struct {
	Message    string `json:"message"`
	Roll       int    `json:"roll,omitempty"`
	Outcome    string `json:"outcome,omitempty"`
	FirstClear bool   `json:"firstClear,omitempty"`
	StageID    string `json:"stageId,omitempty"`
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
	PendingEventSource string   `json:"pendingEventSource,omitempty"`
	DrawnEvents        []string `json:"drawnEvents,omitempty"`
	ExploreDistance    int      `json:"exploreDistance,omitempty"`
	// PushTokens:伙伴鼓励次数——掷骰前声明使用,掷两组 2d6 取优;初始 1,每关首次守护成功恢复 1(上限 2,重复通关不回)。
	PushTokens   int         `json:"pushTokens,omitempty"`
	ActiveBattle *Attempt    `json:"activeBattle"`
	LastResult   Result      `json:"lastResult"`
	EventState   *EventState `json:"eventState,omitempty"`
}

func InitialState(version string) GameState {
	return GameState{SchemaVersion: 1, ContentVersion: version, Phase: "dialogue", ChapterID: "prologue", StoryNodeID: "prologue_1", MapID: "alley", Flags: []string{}, Cats: []string{"miaomiao", "tuanzi"}, Inventory: map[string]int{"material": 0, "food": 0}, Currencies: map[string]int{"stamp": 0}, Furniture: []string{}, Placements: map[string]string{}, CompletedStages: []string{}, PushTokens: 1, LastResult: Result{Message: "旅程从一缕金枪鱼的香味开始。"}}
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
	ZoneID        string `json:"zoneId,omitempty"`
	// REPORT_MOVE 携带的本次行走里程(画布像素)。
	Distance int           `json:"distance,omitempty"`
	Report   *BattleReport `json:"report,omitempty"`
	// CHOOSE_EVENT 的伙伴鼓励声明:掷两组 2d6 取优,消耗一枚 PushTokens。
	UsePush bool `json:"usePush,omitempty"`
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
	ID string `json:"id"`
	// RequireCat:仅当队伍里有这只猫时该选项可选(前端隐藏,服务端拒绝);伙伴"隐藏选项"型技能的地基。
	RequireCat string                  `json:"requireCat,omitempty"`
	Outcomes   map[string]EventOutcome `json:"outcomes"`
}
type Event struct {
	ID       string        `json:"id"`
	Options  []EventOption `json:"options"`
	Category string        `json:"category"`
	Triggers []string      `json:"triggers"`
	Maps     []string      `json:"maps"`
	Tags     []string      `json:"tags"`
	// RequiresFlags:事件链——全部 flag 都已记录时该卡才进随机池;空=无条件。
	RequiresFlags []string `json:"requiresFlags,omitempty"`
	// Repeatable:回响卡——可重复抽到,不占用无放回名额;奖励应保持近零,防资源刷取。
	Repeatable bool `json:"repeatable,omitempty"`
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
	Version       string         `json:"version"`
	Chapters      []Chapter      `json:"chapters"`
	Story         []StoryNode    `json:"story"`
	Maps          []Map          `json:"maps"`
	Events        []Event        `json:"events"`
	Stages        []Stage        `json:"stages"`
	Pools         []Pool         `json:"pools"`
	Slots         []Slot         `json:"slots"`
	Furniture     []Furniture    `json:"furniture"`
	Products      []Product      `json:"products"`
	EventsBalance []EventBalance `json:"eventsBalance"`
}
type Chapter struct {
	ID string `json:"id"`
}

// EventsBalance:随机事件平衡表,内容驱动(危险度→触发概率/风险占比,千分比;echoShare 为回响卡参与门槛,取首个非零)。
type EventBalance struct {
	DangerLevel   int `json:"dangerLevel"`
	TriggerChance int `json:"triggerChance"`
	RiskShare     int `json:"riskShare"`
	EchoShare     int `json:"echoShare"`
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
