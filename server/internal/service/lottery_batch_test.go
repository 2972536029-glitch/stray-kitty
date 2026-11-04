package service_test

import (
	"errors"
	"reflect"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
)

func fundParcelBatch(t *testing.T, g *service.Game, token string, stamps int) {
	t.Helper()
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Currencies["stamp"] = stamps
		p.State.Currencies["tuna"] = 6000
		return domain.CommandResponse{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestParcelBatchMatchesSequentialDrawsAndReplays(t *testing.T) {
	for _, pool := range []string{"moss_letters", "moonsea_observatory"} {
		t.Run(pool, func(t *testing.T) {
			batch, _, _, token, path := setupWithPlayer(t)
			toHomeAfterRescue(t, batch, token)
			fundParcelBatch(t, batch, token, 20)
			before, _ := batch.State(token)
			ten := 10
			request := domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "DRAW_FURNITURE", PoolID: pool, Count: &ten}}
			response, err := batch.Execute(token, "ten-parcels-once", request)
			if err != nil {
				t.Fatal(err)
			}
			state := response.State
			if state.Revision != before.Revision+1 || len(state.LastResult.Draws) != 10 || len(state.Lottery.History) != 10 || len(state.Txns) != len(before.Txns)+10 {
				t.Fatal("batch must commit one revision and ten receipts")
			}
			ids := map[string]bool{}
			for i, draw := range state.LastResult.Draws {
				if ids[draw.ID] || draw.Number != i+1 || draw.PoolID != pool {
					t.Fatalf("invalid ordered receipt: %+v", draw)
				}
				ids[draw.ID] = true
			}
			if !reflect.DeepEqual(*state.LastResult.Draw, state.LastResult.Draws[9]) {
				t.Fatal("legacy single receipt must remain the final draw")
			}
			single, _, _, singleToken, _ := setupWithPlayer(t)
			toHomeAfterRescue(t, single, singleToken)
			fundParcelBatch(t, single, singleToken, 20)
			var expected domain.GameState
			for i := 0; i < 10; i++ {
				expected = execute(t, single, singleToken, domain.Command{Type: "DRAW_FURNITURE", PoolID: pool})
				actual, want := state.LastResult.Draws[i], *expected.LastResult.Draw
				actual.ID, actual.CreatedAt = want.ID, want.CreatedAt
				if !reflect.DeepEqual(actual, want) {
					t.Fatalf("draw %d changed weights, pity or compensation: %+v != %+v", i, actual, want)
				}
			}
			if !reflect.DeepEqual(state.Currencies, expected.Currencies) || !reflect.DeepEqual(state.Furniture, expected.Furniture) || !reflect.DeepEqual(state.Inventory, expected.Inventory) || !reflect.DeepEqual(state.Lottery.Progress, expected.Lottery.Progress) {
				t.Fatal("batch differs from ten original single draws")
			}
			store, err := repository.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			restarted := service.New(store, batch.Catalog)
			replay, err := restarted.Execute(token, "ten-parcels-once", request)
			if err != nil || !replay.Replayed || !sameStateJSON(state, replay.State) {
				t.Fatalf("batch replay changed receipts or charged again: %v", err)
			}
		})
	}
}

func TestParcelBatchFailureRollsBackEveryDraw(t *testing.T) {
	for _, failure := range []string{"insufficient-stamps", "rng-after-four-draws"} {
		t.Run(failure, func(t *testing.T) {
			g, _, _, token, _ := setupWithPlayer(t)
			toHomeAfterRescue(t, g, token)
			stamps := 9
			if failure == "rng-after-four-draws" {
				stamps = 20
				calls := 0
				g.Random = func(int) (int, error) {
					calls++
					if calls == 5 {
						return 0, errors.New("RNG interrupted")
					}
					return 0, nil
				}
			}
			fundParcelBatch(t, g, token, stamps)
			before, _ := g.State(token)
			ten := 10
			_, err := g.Execute(token, failure, domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "DRAW_FURNITURE", PoolID: "moss_letters", Count: &ten}})
			if err == nil {
				t.Fatal("partial batch accepted")
			}
			after, _ := g.State(token)
			if !sameStateJSON(before, after) {
				t.Fatal("failed batch changed currency, furniture, pity or receipts")
			}
		})
	}
}

func TestParcelBatchRejectsUnsupportedCounts(t *testing.T) {
	g, _, _, token, _ := setupWithPlayer(t)
	toHomeAfterRescue(t, g, token)
	for _, count := range []int{-1, 0, 2, 11} {
		expectCode(t, g, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: "moss_letters", Count: &count}, "INVALID_COMMAND")
	}
}
