package service_test

import (
	"errors"
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func TestFurniturePurchasePersistsAndCannotDoubleCharge(t *testing.T) {
	g, token, path := setup(t)
	// Exercise the generic single-item purchase service with a non-story product.
	for i := range g.Catalog.Furniture {
		g.Catalog.Furniture[i].Source = ""
	}
	s, _ := g.State(token)
	request := domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "BUY_FURNITURE", ProductID: "blue_bowl"}}
	if _, err := g.Execute(token, "early-purchase", request); err == nil {
		t.Fatal("purchase before home accepted")
	}
	s = toBattle(t, g, token)
	execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	execute(t, g, token, domain.Command{Type: "CONTINUE"})
	s = finishStory(t, g, token)
	request.ExpectedRevision = &s.Revision
	first, err := g.Execute(token, "buy-bowl-once", request)
	if err != nil {
		t.Fatal(err)
	}
	if first.State.Currencies["stamp"] != 1 || !domain.Contains(first.State.Furniture, "blue_bowl") {
		t.Fatal("price and furniture were not committed together")
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	restarted := service.New(store, g.Catalog)
	replay, err := restarted.Execute(token, "buy-bowl-once", request)
	if err != nil || !replay.Replayed || !reflect.DeepEqual(replay.State, first.State) {
		t.Fatalf("purchase replay after restart failed: %v", err)
	}
	for _, tc := range []struct{ id, code string }{{"blue_bowl", "ALREADY_OWNED"}, {"box_castle", "INSUFFICIENT_CURRENCY"}, {"unknown", "INVALID_COMMAND"}} {
		before, _ := restarted.State(token)
		_, err = restarted.Execute(token, "rejected-"+tc.id, domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "BUY_FURNITURE", ProductID: tc.id}})
		var fault *domain.Fault
		if !errors.As(err, &fault) || fault.Code != tc.code {
			t.Fatalf("%s: unexpected rejection %v", tc.id, err)
		}
		after, _ := restarted.State(token)
		if !reflect.DeepEqual(before, after) {
			t.Fatalf("rejected purchase changed save: %s", tc.id)
		}
	}
	s = execute(t, restarted, token, domain.Command{Type: "PLACE_FURNITURE", FurnitureID: "blue_bowl", SlotID: "window"})
	if s.Placements["window"] != "blue_bowl" {
		t.Fatal("purchased furniture cannot be placed")
	}
}

func TestStoryGiftsCannotBeSold(t *testing.T) {
	g, _, _, token, _ := setupWithPlayer(t)
	s := toHomeAfterRescue(t, g, token)
	for _, id := range []string{"cardboard_nest", "soft_blanket", "tin_lamp"} {
		if !domain.Contains(s.Furniture, id) {
			t.Fatalf("missing story gift %s", id)
		}
	}
	expectCode(t, g, token, domain.Command{Type: "BUY_FURNITURE", ProductID: "blue_bowl"}, "STORY_GIFT")
	after, _ := g.State(token)
	if !reflect.DeepEqual(s, after) {
		t.Fatal("story gift attempted purchase changed state")
	}
}
