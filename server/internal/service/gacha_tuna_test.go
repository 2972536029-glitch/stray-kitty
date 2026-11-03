package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
)

// setupWithPlayer 额外返回 playerId,供支付网关入账使用。
func setupWithPlayer(t *testing.T) (*service.Game, *payment.Gateway, string, string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "save.json")
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	g := service.New(store, catalog)
	g.Random = func(int) (int, error) { return 0, nil }
	playerID, token, err := g.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	return g, payment.New(store, catalog), playerID, token, path
}

func recharge(t *testing.T, gateway *payment.Gateway, playerID string, packID string) {
	t.Helper()
	if _, err := gateway.Charge(context.Background(), playerID, packID, "4242424242424242"); err != nil {
		t.Fatal(err)
	}
}

func toHomeAfterRescue(t *testing.T, g *service.Game, token string) domain.GameState {
	t.Helper()
	s := toBattle(t, g, token)
	execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
	execute(t, g, token, domain.Command{Type: "CONTINUE"})
	return finishStory(t, g, token)
}

func TestParcelTunaChargeAndReplay(t *testing.T) {
	g, gateway, player, token, path := setupWithPlayer(t)
	s := toHomeAfterRescue(t, g, token)
	expectCode(t, g, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: "moonsea_observatory"}, "INSUFFICIENT_CURRENCY")
	recharge(t, gateway, player, "pack_small")
	s, _ = g.State(token)
	request := domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "DRAW_FURNITURE", PoolID: "moonsea_observatory"}}
	first, err := g.Execute(token, "parcel-once-only", request)
	if err != nil {
		t.Fatal(err)
	}
	if first.State.Currencies["tuna"] != 0 || first.State.Currencies["stamp"] != 2 || !domain.Contains(first.State.Furniture, "luna_boat") {
		t.Fatalf("wrong draw: %+v", first.State)
	}
	if len(first.State.Txns) != 2 || first.State.Txns[1].Spent != 60 || first.State.Txns[1].Currency != "tuna" || len(first.State.Lottery.History) != 1 {
		t.Fatal("missing receipt")
	}
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	restart := service.New(store, g.Catalog)
	replay, err := restart.Execute(token, "parcel-once-only", request)
	if err != nil || !replay.Replayed || !sameStateJSON(replay.State, first.State) {
		t.Fatalf("replay charged twice or changed result: %v", err)
	}
	expectCode(t, restart, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: "rainy_box"}, "POOL_UNAVAILABLE")
}

func TestParcelStampAndIndependentPity(t *testing.T) {
	for _, pool := range []string{"moss_letters", "moonsea_observatory"} {
		t.Run(pool, func(t *testing.T) {
			g, _, _, token, path := setupWithPlayer(t)
			toHomeAfterRescue(t, g, token)
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Currencies["stamp"] = 100
				p.State.Currencies["tuna"] = 5000
				return domain.CommandResponse{}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			for i := 0; i < 3; i++ {
				execute(t, g, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: pool})
			}
			before, _ := g.State(token)
			if before.Lottery.Progress[pool].Misses != 2 || before.Inventory["material"] != 7 {
				t.Fatalf("duplicate compensation or counter wrong: %+v", before.Lottery)
			}
			other := "moss_letters"
			if pool == other {
				other = "moonsea_observatory"
			}
			execute(t, g, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: other})
			store, err := repository.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			restart := service.New(store, g.Catalog)
			restart.Random = func(int) (int, error) { return 0, nil }
			s := execute(t, restart, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: pool})
			draw := s.LastResult.Draw
			if draw == nil || !draw.Guaranteed || draw.Duplicate || s.Lottery.Progress[pool].Misses != 0 {
				t.Fatalf("pity lost across pools/restart: %+v", draw)
			}
			// Each pool completes in at most 34 draws under the worst repeated roll.
			for s.Lottery.Progress[pool].Draws < 34 {
				s = execute(t, restart, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: pool})
			}
			for _, p := range g.Catalog.Pools {
				if p.ID == pool {
					for _, entry := range p.Entries {
						if !domain.Contains(s.Furniture, entry.FurnitureID) {
							t.Fatal("set not completed by guarantee")
						}
					}
				}
			}
			s = execute(t, restart, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: pool})
			if !s.LastResult.Draw.Duplicate || s.LastResult.Draw.Guaranteed {
				t.Fatal("completed collection guarantee incorrect")
			}
		})
	}
}

func TestParcelDailyAndMilestoneClaims(t *testing.T) {
	g, _, _, token, _ := setupWithPlayer(t)
	now := time.Date(2026, 10, 30, 15, 59, 59, 0, time.UTC)
	g.Now = func() time.Time { return now }
	toHomeAfterRescue(t, g, token)
	s := execute(t, g, token, domain.Command{Type: "CLAIM_PARCEL_REWARD", RewardID: "daily_letter"})
	if s.Currencies["stamp"] != 3 || s.Lottery.Day != "2026-10-30" {
		t.Fatal("daily credit wrong")
	}
	expectCode(t, g, token, domain.Command{Type: "CLAIM_PARCEL_REWARD", RewardID: "daily_letter"}, "REWARD_CLAIMED")
	expectCode(t, g, token, domain.Command{Type: "CLAIM_PARCEL_REWARD", RewardID: "daily_wish"}, "WISH_UNFINISHED")
	execute(t, g, token, domain.Command{Type: "PLACE_FURNITURE", FurnitureID: "soft_blanket", SlotID: "corner"})
	execute(t, g, token, domain.Command{Type: "CLAIM_PARCEL_REWARD", RewardID: "daily_wish"})
	execute(t, g, token, domain.Command{Type: "CLAIM_PARCEL_REWARD", RewardID: "rescue_letter"})
	expectCode(t, g, token, domain.Command{Type: "CLAIM_PARCEL_REWARD", RewardID: "finale_letter"}, "REWARD_LOCKED")
	now = now.Add(2 * time.Second)
	s = execute(t, g, token, domain.Command{Type: "CLAIM_PARCEL_REWARD", RewardID: "daily_letter"})
	if s.Lottery.Day != "2026-10-31" || s.Currencies["stamp"] != 8 {
		t.Fatalf("day reset wrong: %+v", s.Lottery)
	}
	expectCode(t, g, token, domain.Command{Type: "CLAIM_PARCEL_REWARD", RewardID: "rescue_letter"}, "REWARD_CLAIMED")
}

func TestParcelRejectsWithoutCharging(t *testing.T) {
	g, _, _, token, _ := setupWithPlayer(t)
	s := toHomeAfterRescue(t, g, token)
	g.Random = func(int) (int, error) { return 0, errors.New("rng unavailable") }
	_, err := g.Execute(token, "parcel-failed-rng", domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "DRAW_FURNITURE", PoolID: "moss_letters"}})
	if err == nil {
		t.Fatal("RNG error accepted")
	}
	after, _ := g.State(token)
	if !reflect.DeepEqual(s, after) {
		t.Fatal("failed draw changed wallet or pity")
	}
	s = execute(t, g, token, domain.Command{Type: "GO_EXPLORE", MapID: "alley"})
	expectCode(t, g, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: "moss_letters"}, "INVALID_PHASE")
}

func sameStateJSON(a, b domain.GameState) bool {
	aa, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(aa) == string(bb)
}
