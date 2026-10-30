package domain

import "time"

type PoolProgress struct {
	Draws  int `json:"draws"`
	Misses int `json:"misses"`
}

type ParcelDraw struct {
	ID          string    `json:"id"`
	PoolID      string    `json:"poolId"`
	FurnitureID string    `json:"furnitureId"`
	Currency    string    `json:"currency"`
	Cost        int       `json:"cost"`
	Number      int       `json:"number"`
	Duplicate   bool      `json:"duplicate"`
	Guaranteed  bool      `json:"guaranteed"`
	Material    int       `json:"material"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Optional on old saves. Counts and daily claims share the command transaction.
type LotteryState struct {
	Progress    map[string]PoolProgress `json:"progress"`
	History     []ParcelDraw            `json:"history"`
	Day         string                  `json:"day"`
	DailyClaims []string                `json:"dailyClaims"`
	Milestones  []string                `json:"milestones"`
}

type ParcelReward struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Kind         string `json:"kind"`
	Condition    string `json:"condition"`
	RequiredFlag string `json:"requiredFlag,omitempty"`
	Stamp        int    `json:"stamp"`
	Tuna         int    `json:"tuna"`
}
