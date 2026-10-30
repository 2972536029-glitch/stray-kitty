package service_test

import (
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func TestHomeLayoutAtomicPersistentAndRetryable(t *testing.T) {
	g, _, _, token, path := setupWithPlayer(t)
	s := toHomeAfterRescue(t, g, token)
	changes := []domain.HomeLayoutChange{{Key: "stage:1:rain-bucket", HomePlacement: domain.HomePlacement{X: 750, Y: 530}}, {Key: "stage:1:old-rag", HomePlacement: domain.HomePlacement{X: 292, Y: 427, Stored: true}}, {Key: "furniture:soft_blanket", HomePlacement: domain.HomePlacement{X: 930, Y: 620}}}
	req := domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "SAVE_HOME_LAYOUT", Changes: changes}}
	first, err := g.Execute(token, "home-layout-save-once", req)
	if err != nil {
		t.Fatal(err)
	}
	if first.State.Revision != s.Revision+1 || len(first.State.HomeLayout) != 3 || !reflect.DeepEqual(first.State.Furniture, s.Furniture) || !reflect.DeepEqual(first.State.Currencies, s.Currencies) {
		t.Fatal("layout changed ownership/currency or did not commit atomically")
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	restart := service.New(store, g.Catalog)
	replay, err := restart.Execute(token, "home-layout-save-once", req)
	if err != nil || !replay.Replayed || !sameStateJSON(first.State, replay.State) {
		t.Fatalf("lost response replay: %v", err)
	}
	// A free-position item counts for the daily cat wish, without a legacy slot.
	execute(t, restart, token, domain.Command{Type: "CLAIM_PARCEL_REWARD", RewardID: "daily_wish"})
	stored := []domain.HomeLayoutChange{{Key: "furniture:soft_blanket", HomePlacement: domain.HomePlacement{X: 930, Y: 620, Stored: true}}}
	execute(t, restart, token, domain.Command{Type: "SAVE_HOME_LAYOUT", Changes: stored})
}
func TestHomeLayoutRejectsUnownedLockedDuplicateAndInvalidWithoutPartialWrites(t *testing.T) {
	g, _, _, token, _ := setupWithPlayer(t)
	toHomeAfterRescue(t, g, token)
	good := domain.HomeLayoutChange{Key: "stage:1:rain-bucket", HomePlacement: domain.HomePlacement{X: 700, Y: 500}}
	for _, tc := range []struct {
		change domain.HomeLayoutChange
		code   string
	}{
		{domain.HomeLayoutChange{Key: "furniture:crescent_sofa", HomePlacement: good.HomePlacement}, "NOT_OWNED"},
		{domain.HomeLayoutChange{Key: "stage:4:gifts", HomePlacement: good.HomePlacement}, "DECOR_LOCKED"},
		{domain.HomeLayoutChange{Key: "stage:1:old-rag", HomePlacement: domain.HomePlacement{X: 4, Y: 500}}, "INVALID_LAYOUT"},
		{domain.HomeLayoutChange{Key: "stage:1:old-rag", HomePlacement: domain.HomePlacement{X: 800, Y: 500.5}}, "INVALID_LAYOUT"},
		{good, "INVALID_LAYOUT"},
	} {
		before, _ := g.State(token)
		expectCode(t, g, token, domain.Command{Type: "SAVE_HOME_LAYOUT", Changes: []domain.HomeLayoutChange{good, tc.change}}, tc.code)
		after, _ := g.State(token)
		if !sameStateJSON(before, after) {
			t.Fatal("rejected layout partially changed save")
		}
	}
	expectCode(t, g, token, domain.Command{Type: "SAVE_HOME_LAYOUT"}, "INVALID_LAYOUT")
}
