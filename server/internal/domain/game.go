package domain

import (
	"errors"
	"fmt"
	"time"
)

type Fault struct {
	Code, Message string
	Status        int
}

func (e *Fault) Error() string                    { return e.Message }
func Fail(code, message string, status int) error { return &Fault{code, message, status} }

// ClassifyFault 把错误落到观测四分类:已知 4xx Fault → rejected(业务/请求拒绝),
// 5xx 与未知错误 → error(系统故障)。success/replayed 由调用点在无错时判定。
// 只有 error 进故障告警;rejected 是正常玩法或客户端问题,告警它们就是狼来了。
func ClassifyFault(err error) string {
	fault := &Fault{}
	if errors.As(err, &fault) && fault.Status < 500 {
		return "rejected"
	}
	return "error"
}

// FaultCode 返回已知 Fault 的错误码(有限枚举,可进 metric tag),未知错误归 internal。
func FaultCode(err error) string {
	fault := &Fault{}
	if errors.As(err, &fault) {
		return fault.Code
	}
	return "internal"
}

type Attempt struct {
	ID        string           `json:"id"`
	StageID   string           `json:"stageId"`
	Status    string           `json:"status"`
	Modifiers *BattleModifiers `json:"modifiers,omitempty"`
	// Legacy storage only: old active reservations are fully returned at settlement.
	// New battles never reserve or consume supplies.
	Supplies map[string]int `json:"supplies,omitempty"`
	// Mainline identifies a chapter mission begun from its gated map trigger.
	Mainline bool `json:"mainline,omitempty"`
}
type BattleReport struct {
	Leaks          *int  `json:"leaks"`
	BossDefeated   *bool `json:"bossDefeated"`
	ElitesDefeated *int  `json:"elitesDefeated,omitempty"`
}
type Result struct {
	Message    string       `json:"message"`
	Roll       int          `json:"roll,omitempty"`
	Outcome    string       `json:"outcome,omitempty"`
	FirstClear bool         `json:"firstClear,omitempty"`
	StageID    string       `json:"stageId,omitempty"`
	Draw       *ParcelDraw  `json:"draw,omitempty"`
	Draws      []ParcelDraw `json:"draws,omitempty"`
}
type WorldPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
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
	PushTokens        int         `json:"pushTokens,omitempty"`
	ActiveBattle      *Attempt    `json:"activeBattle"`
	LastResult        Result      `json:"lastResult"`
	EventState        *EventState `json:"eventState,omitempty"`
	AlleyBattleReturn *WorldPoint `json:"alleyBattleReturn,omitempty"`
	// Txns:金枪鱼充值与消费流水(最新的在末尾),供 /api/payment/history 展示;超出上限丢弃最旧。
	Txns           []Txn                    `json:"txns,omitempty"`
	QACheckpointID string                   `json:"qaCheckpointId,omitempty"`
	Lottery        *LotteryState            `json:"lottery,omitempty"`
	HomeLayout     map[string]HomePlacement `json:"homeLayout,omitempty"`
	HomeRepairs    []string                 `json:"homeRepairs,omitempty"`
}

func InitialState(version string) GameState {
	return GameState{SchemaVersion: 1, ContentVersion: version, Phase: "dialogue", ChapterID: "prologue", StoryNodeID: "prologue_1", MapID: "alley", Flags: []string{}, Cats: []string{"miaomiao", "tuanzi"}, Inventory: map[string]int{"material": 0, "food": 0}, Currencies: map[string]int{"stamp": 0, "tuna": 0}, Furniture: []string{}, Placements: map[string]string{}, CompletedStages: []string{}, PushTokens: 1, LastResult: Result{Message: "旅程从一缕金枪鱼的香味开始。"}}
}

// MaxTxns 流水账本保留的最大条数;超出后丢弃最旧,防存档无限膨胀。
const MaxTxns = 50

// AppendTxn 追加一笔流水并裁剪到上限。
func AppendTxn(s *GameState, t Txn) {
	s.Txns = append(s.Txns, t)
	if len(s.Txns) > MaxTxns {
		s.Txns = s.Txns[len(s.Txns)-MaxTxns:]
	}
}

type Command struct {
	RepairID      string             `json:"repairId,omitempty"`
	Changes       []HomeLayoutChange `json:"changes,omitempty"`
	Type          string             `json:"type"`
	NodeID        string             `json:"nodeId,omitempty"`
	InteractionID string             `json:"interactionId,omitempty"`
	EventID       string             `json:"eventId,omitempty"`
	OptionID      string             `json:"optionId,omitempty"`
	StageID       string             `json:"stageId,omitempty"`
	AttemptID     string             `json:"attemptId,omitempty"`
	Outcome       string             `json:"outcome,omitempty"`
	FurnitureID   string             `json:"furnitureId,omitempty"`
	SlotID        string             `json:"slotId,omitempty"`
	PoolID        string             `json:"poolId,omitempty"`
	Count         *int               `json:"count,omitempty"`
	ProductID     string             `json:"productId,omitempty"`
	MapID         string             `json:"mapId,omitempty"`
	ZoneID        string             `json:"zoneId,omitempty"`
	CheckpointID  string             `json:"checkpointId,omitempty"`
	RewardID      string             `json:"rewardId,omitempty"`
	Layer         string             `json:"layer,omitempty"`
	Position      *WorldPoint        `json:"position,omitempty"`
	// REPORT_MOVE 携带的本次行走里程(画布像素)。
	Distance       int           `json:"distance,omitempty"`
	ReturnPosition *WorldPoint   `json:"returnPosition,omitempty"`
	Report         *BattleReport `json:"report,omitempty"`
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
	Scene     string   `json:"scene,omitempty"`
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
	Title    string        `json:"title"`
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
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Theme             string  `json:"theme"`
	PityEvery         int     `json:"pityEvery"`
	DuplicateMaterial int     `json:"duplicateMaterial"`
	Cost              int     `json:"cost"`
	RequiredFlag      string  `json:"requiredFlag"`
	Entries           []Entry `json:"entries"`
	// Currency:该池扣哪种货币——stamp(免费)/tuna(付费);空值按 stamp 处理,旧目录无需迁移。
	Currency string `json:"currency,omitempty"`
}
type Slot struct {
	ID string `json:"id"`
	// Name:槽位展示名(如"高空横梁"),供服务端错误信息与前端面板使用。
	Name string `json:"name,omitempty"`
}
type Furniture struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Source  string  `json:"source,omitempty"`
	WidthCm float64 `json:"widthCm,omitempty"`
}

// Renovation:花房四阶修缮工程。按 stage 升序推进;cost 键 material 走背包、stamp 走邮票;
// unlockSlots 列出的槽位在 grantsFlag 记录前保持锁定。
type Renovation struct {
	Parts        []HomeRepairPart `json:"parts,omitempty"`
	ID           string           `json:"id"`
	Stage        int              `json:"stage"`
	Name         string           `json:"name"`
	Description  string           `json:"description,omitempty"`
	Message      string           `json:"message,omitempty"`
	RequiredFlag string           `json:"requiredFlag,omitempty"`
	GrantsFlag   string           `json:"grantsFlag"`
	Cost         map[string]int   `json:"cost,omitempty"`
	UnlockSlots  []string         `json:"unlockSlots,omitempty"`
}
type HomeRepairPart struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	X           float64        `json:"x"`
	Y           float64        `json:"y"`
	Cost        map[string]int `json:"cost"`
	Requires    []string       `json:"requires,omitempty"`
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
	HomeDecor     []HomeDecor    `json:"homeDecor"`
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
	// Renovations:花房四阶修缮工程目录,按 stage 升序声明 REPAIR_HOME 的推进路径。
	Renovations []Renovation `json:"renovations,omitempty"`
	// RechargePacks:金枪鱼充值礼包目录(模拟支付网关的商品来源)。
	RechargePacks []RechargePack `json:"rechargePacks"`
	ParcelRewards []ParcelReward `json:"parcelRewards"`
}
type Chapter struct {
	ID string `json:"id"`
}

// RechargePack 一档金枪鱼充值礼包;PriceCents 为人民币分。
type RechargePack struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Desc        string `json:"desc"`
	PriceCents  int    `json:"priceCents"`
	TunaGranted int    `json:"tunaGranted"`
	Icon        string `json:"icon"`
}

// Txn 一笔充值或消费流水。充值:Amount=实付分、Status=confirmed/declined;
// 消费(抽卡扣金枪鱼):Amount=0、Status=confirmed、Reason 记录去向。
type Txn struct {
	Currency   string    `json:"currency,omitempty"`
	Spent      int       `json:"spent,omitempty"`
	ID         string    `json:"id"`
	PlayerID   string    `json:"playerId"`
	PackID     string    `json:"packId"`
	Amount     int       `json:"amount"`
	Status     string    `json:"status"`
	Reason     string    `json:"reason,omitempty"`
	CardSuffix string    `json:"cardSuffix,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
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
