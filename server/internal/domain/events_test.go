package domain_test

import (
	"reflect"
	"stray-kitty/server/internal/domain"
	"testing"
)

func TestTwoDiceTiersPartitionAll36Outcomes(t *testing.T) {
	counts := map[string]int{}
	for a := 1; a <= 6; a++ {
		for b := 1; b <= 6; b++ {
			tier, err := domain.EventTier([2]int{a, b})
			if err != nil {
				t.Fatal(err)
			}
			counts[tier]++
		}
	}
	if !reflect.DeepEqual(counts, map[string]int{"crit": 1, "success": 9, "partial": 16, "fail": 10}) {
		t.Fatalf("incorrect non-overlapping probabilities: %v", counts)
	}
	for _, dice := range [][2]int{{0, 6}, {7, 1}, {1, -1}} {
		if _, err := domain.EventTier(dice); err == nil {
			t.Fatalf("invalid dice accepted: %v", dice)
		}
	}
}
