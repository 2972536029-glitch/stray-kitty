package domain

type BattleCarryID string

const (
	CarryLantern BattleCarryID = "lantern"
	CarryMirror  BattleCarryID = "mirror"
	CarryBell    BattleCarryID = "bell"
	CarryBox     BattleCarryID = "box"
	CarryDog     BattleCarryID = "dog"
	CarryDove    BattleCarryID = "dove"
	CarryRats    BattleCarryID = "rats"
	CarryKitten  BattleCarryID = "kitten"
)

// Only new event content is validated; unknown historical save IDs remain readable.
func IsBattleCarryID(id BattleCarryID) bool {
	switch id {
	case CarryLantern, CarryMirror, CarryBell, CarryBox, CarryDog, CarryDove, CarryRats, CarryKitten:
		return true
	default:
		return false
	}
}

// 判定与 Outcome 契约来自余尧设计 v0.3；经济、流程和持久化由 service 接入。
type EventReward struct {
	Fish     int `json:"fish,omitempty"`
	Stamps   int `json:"stamps,omitempty"`
	Clue     int `json:"clue,omitempty"`
	Material int `json:"material,omitempty"`
}
type TowerDefenseModifier struct {
	ShadowPressure int `json:"shadowPressure"`
}
type EventSituation struct {
	Kind        string `json:"kind"`
	StoryNodeID string `json:"storyNodeId"`
}
type EventOutcome struct {
	Text      string                `json:"text"`
	Reward    *EventReward          `json:"reward,omitempty"`
	TDMod     *TowerDefenseModifier `json:"tdMod,omitempty"`
	Situation *EventSituation       `json:"situation,omitempty"`
	Flags     []string              `json:"flags,omitempty"`
	// A new carry replaces the pending one; an outcome without carry preserves it.
	Carry BattleCarryID `json:"carry,omitempty"`
}
type EventResolution struct {
	EventID  string       `json:"eventId"`
	OptionID string       `json:"optionId"`
	Dice     [2]int       `json:"dice"`
	Tier     string       `json:"tier"`
	Outcome  EventOutcome `json:"outcome"`
}
type BattleModifiers struct {
	ShadowPressure int    `json:"shadowPressure"`
	Situation      string `json:"situation,omitempty"`
	// Single temporary carry, snapshotted per attempt. L01 wins clear pending;
	// tutorials and standalone trials do not consume the mainline pending carry.
	Carry BattleCarryID `json:"carry,omitempty"`
}
type EventState struct {
	LastResolution   EventResolution `json:"lastResolution"`
	PendingModifiers BattleModifiers `json:"pendingModifiers"`
}

// 四档互斥，12 不重复计入成功：1/36、9/36、16/36、10/36。
func EventTier(dice [2]int) (string, error) {
	for _, die := range dice {
		if die < 1 || die > 6 {
			return "", Fail("INVALID_ROLL", "骰点必须在 1 到 6 之间", 500)
		}
	}
	switch total := dice[0] + dice[1]; {
	case total == 12:
		return "crit", nil
	case total >= 9:
		return "success", nil
	case total >= 6:
		return "partial", nil
	default:
		return "fail", nil
	}
}
