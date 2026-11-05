package service_test

import (
	"errors"
	"os"
	"strconv"
	"testing"

	"stray-kitty/server/internal/domain"
)

// A service mutation is speculative until Store commits. Cover the credit entry
// point as well as its retry, so service-local emitters cannot double-count the
// repository observer or leak QA transactions into the untagged series.
func TestEconomyApplyChargeObservedOnlyOnceAfterCommit(t *testing.T) {
	for _, qa := range []bool{false, true} {
		t.Run(strconv.FormatBool(qa), func(t *testing.T) {
			g, _, playerID, token, path := setupWithPlayer(t)
			if qa {
				setObservedState(t, g, token, func(state *domain.GameState) { state.QACheckpointID = "economy-observation" })
			}
			txn := domain.Txn{ID: "durable-credit", Status: "confirmed"}
			pack := domain.RechargePack{TunaGranted: 60}
			wire := captureGameplayMetrics(t, func() {
				if err := os.Rename(path, path+".backup"); err != nil {
					t.Fatal(err)
				}
				if err := os.Mkdir(path, 0700); err != nil {
					t.Fatal(err)
				}
				if _, err := g.ApplyCharge(playerID, txn, pack); err == nil {
					t.Fatal("expected persistence failure")
				}
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
				if err := os.Rename(path+".backup", path); err != nil {
					t.Fatal(err)
				}
				for range 2 {
					balance, err := g.ApplyCharge(playerID, txn, pack)
					if err != nil || balance != 60 {
						t.Fatalf("credit balance=%d err=%v", balance, err)
					}
				}
			})
			qaTag := "qa:" + strconv.FormatBool(qa)
			if got := gameplayMetricCount(t, wire, "kitty.economy.delta"); got != 1 {
				t.Fatalf("failed write/replay/service emitter inflated economy: %d\n%s", got, wire)
			}
			if got := gameplayMetricCount(t, wire, "kitty.economy.delta", "currency:tuna", "direction:gain", qaTag); got != 1 {
				t.Fatalf("credit QA attribution lost: %d\n%s", got, wire)
			}
			if got := gameplayMetricCount(t, wire, "kitty.economy.amount", "currency:tuna", "direction:gain", qaTag); got != 60 {
				t.Fatalf("credit amount=%d\n%s", got, wire)
			}
			if got := gameplayMetricCount(t, wire, "kitty.payment.funnel", "step:charge_success", qaTag); got != 1 {
				t.Fatalf("credit terminal count=%d\n%s", got, wire)
			}
		})
	}
}

// A ten-draw command is one committed net currency change. Failed partial
// batches and replayed receipts must not contribute either events or quantity.
func TestEconomyParcelBatchObservesOneCommittedSpend(t *testing.T) {
	g, _, _, token, _ := setupWithPlayer(t)
	toHomeAfterRescue(t, g, token)
	fundParcelBatch(t, g, token, 20)
	before, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	ten := 10
	request := domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "DRAW_FURNITURE", PoolID: "moss_letters", Count: &ten}}
	spent := 0
	wire := captureGameplayMetrics(t, func() {
		calls := 0
		g.Random = func(int) (int, error) {
			calls++
			if calls == 5 {
				return 0, errors.New("interrupted draw")
			}
			return 0, nil
		}
		if _, err := g.Execute(token, "observed-draw-failure", request); err == nil {
			t.Fatal("expected partial-batch failure")
		}
		g.Random = func(int) (int, error) { return 0, nil }
		first, err := g.Execute(token, "observed-ten-draws", request)
		if err != nil || first.Replayed || len(first.State.LastResult.Draws) != 10 {
			t.Fatalf("batch failed: %+v %v", first, err)
		}
		spent = before.Currencies["stamp"] - first.State.Currencies["stamp"]
		if replay, err := g.Execute(token, "observed-ten-draws", request); err != nil || !replay.Replayed {
			t.Fatalf("batch replay failed: %+v %v", replay, err)
		}
	})
	if spent <= 0 {
		t.Fatal("batch did not spend currency")
	}
	if got := gameplayMetricCount(t, wire, "kitty.economy.delta"); got != 1 {
		t.Fatalf("partial/per-draw/replayed metrics inflated committed spend: %d\n%s", got, wire)
	}
	if got := gameplayMetricCount(t, wire, "kitty.economy.delta", "currency:stamps", "direction:spend", "qa:false"); got != 1 {
		t.Fatalf("batch currency mapping=%d\n%s", got, wire)
	}
	if got := gameplayMetricCount(t, wire, "kitty.economy.amount", "currency:stamps", "direction:spend", "qa:false"); got != spent {
		t.Fatalf("batch amount=%d want=%d\n%s", got, spent, wire)
	}
	if got := gameplayMetricCount(t, wire, "kitty.payment.funnel"); got != 0 {
		t.Fatalf("parcel receipts counted as recharge: %d\n%s", got, wire)
	}
}
