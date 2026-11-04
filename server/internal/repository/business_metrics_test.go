package repository_test

import (
	"errors"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/obs"
	"stray-kitty/server/internal/repository"
)

// Exercise the real DogStatsD wire and persistence boundary, including failures.
func captureBusinessMetrics(t *testing.T, run func()) string {
	t.Helper()
	conn, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	t.Setenv("DD_DOGSTATSD_PORT_8125_ADDR", conn.LocalAddr().String())
	t.Setenv("DD_TRACE_ENABLED", "false")
	t.Setenv("DD_INSTRUMENTATION_TELEMETRY_ENABLED", "false")
	t.Setenv("DD_LOGS_INTAKE_KEY", "")
	obs.Init("kitty-api")
	run()
	obs.Shutdown() // flush the asynchronous metric client before reading
	if err := conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	var lines strings.Builder
	buf := make([]byte, 65535)
	for {
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			break
		}
		lines.Write(buf[:n])
		lines.WriteByte('\n')
	}
	return lines.String()
}

func businessCount(t *testing.T, wire, metric string, tags ...string) int64 {
	t.Helper()
	var total int64
	for _, line := range strings.Split(wire, "\n") {
		if !strings.HasPrefix(line, metric+":") {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) < 3 || parts[1] != "c" {
			t.Fatalf("not a count: %s", line)
		}
		present := map[string]bool{}
		for _, part := range parts[2:] {
			if strings.HasPrefix(part, "#") {
				for _, tag := range strings.Split(part[1:], ",") {
					present[tag] = true
				}
			}
		}
		match := true
		for _, tag := range tags {
			if !present[tag] {
				match = false
			}
		}
		if match {
			value, err := strconv.ParseInt(strings.TrimPrefix(parts[0], metric+":"), 10, 64)
			if err != nil {
				t.Fatal(err)
			}
			total += value
		}
	}
	return total
}

func businessStore(t *testing.T) (*repository.Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "save", "game.json")
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	err = store.Create("hash", &repository.Player{ID: "player", State: domain.InitialState("test"), Receipts: map[string]repository.Receipt{}})
	if err != nil {
		t.Fatal(err)
	}
	return store, path
}

func TestEconomyCountsCommittedAmountsAndSkipsReplayAndRejected(t *testing.T) {
	store, _ := businessStore(t)
	wire := captureBusinessMetrics(t, func() {
		_, err := store.Transact("hash", func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.Currencies["tuna"] += 60
			p.State.Currencies["stamp"] += 5
			p.State.Currencies["user-controlled-currency"] += 999
			return domain.CommandResponse{State: p.State}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		_, err = store.Transact("hash", func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.Currencies["tuna"] -= 21
			return domain.CommandResponse{State: p.State}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		_, err = store.Transact("hash", func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.Currencies["tuna"] += 1000
			return domain.CommandResponse{State: p.State, Replayed: true}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		_, _ = store.Transact("hash", func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.Currencies["tuna"] += 1000
			return domain.CommandResponse{}, errors.New("rejected")
		})
	})
	for _, tc := range []struct {
		metric string
		amount int64
		tags   []string
	}{
		{"kitty.economy.delta", 1, []string{"currency:tuna", "direction:gain", "bucket:21-100", "qa:false"}},
		{"kitty.economy.delta", 1, []string{"currency:stamps", "direction:gain", "bucket:2-5", "qa:false"}},
		{"kitty.economy.amount", 60, []string{"currency:tuna", "direction:gain"}},
		{"kitty.economy.amount", 21, []string{"currency:tuna", "direction:spend"}},
		{"kitty.economy.amount", 5, []string{"currency:stamps", "direction:gain"}},
	} {
		if got := businessCount(t, wire, tc.metric, tc.tags...); got != tc.amount {
			t.Fatalf("%s %v: got %d want %d\n%s", tc.metric, tc.tags, got, tc.amount, wire)
		}
	}
	if strings.Contains(wire, "user-controlled") || strings.Contains(wire, "player_id:") || strings.Contains(wire, "session_id:") {
		t.Fatalf("unbounded labels: %s", wire)
	}
}

func TestPaymentFunnelOnlyAfterFirstCreditCommit(t *testing.T) {
	store, _ := businessStore(t)
	wire := captureBusinessMetrics(t, func() {
		for _, status := range []string{"confirmed", "declined"} {
			for range 2 {
				err := store.TransactByPlayer("player", func(p *repository.Player) error {
					for _, txn := range p.State.Txns {
						if txn.ID == status {
							return nil
						}
					}
					if status == "confirmed" {
						p.State.Currencies["tuna"] += 60
					}
					domain.AppendTxn(&p.State, domain.Txn{ID: status, Status: status})
					return nil
				})
				if err != nil {
					t.Fatal(err)
				}
			}
		}
		err := store.TransactByPlayer("player", func(p *repository.Player) error {
			domain.AppendTxn(&p.State, domain.Txn{ID: "draw", Status: "confirmed", Currency: "tuna", Spent: 20})
			p.State.Currencies["tuna"] -= 20
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	})
	for _, step := range []string{"charge_success", "charge_declined"} {
		if got := businessCount(t, wire, "kitty.payment.funnel", "step:"+step, "qa:false"); got != 1 {
			t.Fatalf("%s counted %d times\n%s", step, got, wire)
		}
	}
	if got := businessCount(t, wire, "kitty.economy.amount", "direction:gain"); got != 60 {
		t.Fatalf("credit amount %d\n%s", got, wire)
	}
}

func TestFailedPersistenceEmitsNoBusinessMetrics(t *testing.T) {
	store, path := businessStore(t)
	// Replace just this test's save directory with a file to make persist fail.
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Dir(path)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Dir(path), []byte("blocked"), 0600); err != nil {
		t.Fatal(err)
	}
	wire := captureBusinessMetrics(t, func() {
		_, err := store.Transact("hash", func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.Currencies["tuna"] += 60
			return domain.CommandResponse{State: p.State}, nil
		})
		if err == nil {
			t.Fatal("write unexpectedly succeeded")
		}
		err = store.TransactByPlayer("player", func(p *repository.Player) error {
			p.State.Currencies["tuna"] += 60
			domain.AppendTxn(&p.State, domain.Txn{ID: "failed", Status: "confirmed"})
			return nil
		})
		if err == nil {
			t.Fatal("credit unexpectedly succeeded")
		}
	})
	if strings.Contains(wire, "kitty.economy.") || strings.Contains(wire, "kitty.payment.funnel") {
		t.Fatalf("failed transaction was observed: %s", wire)
	}
}

func TestEconomyQAAndBucketBoundaries(t *testing.T) {
	for _, tc := range []struct {
		amount int
		bucket string
	}{{1, "1"}, {2, "2-5"}, {5, "2-5"}, {6, "6-20"}, {20, "6-20"}, {21, "21-100"}, {100, "21-100"}, {101, "100+"}} {
		t.Run(strconv.Itoa(tc.amount), func(t *testing.T) {
			store, _ := businessStore(t)
			wire := captureBusinessMetrics(t, func() {
				_, err := store.TransactWithQA("hash", true, func(p *repository.Player) (domain.CommandResponse, error) {
					p.State.Inventory["food"] += tc.amount
					return domain.CommandResponse{State: p.State}, nil
				})
				if err != nil {
					t.Fatal(err)
				}
			})
			if got := businessCount(t, wire, "kitty.economy.delta", "currency:fish", "bucket:"+tc.bucket, "qa:true"); got != 1 {
				t.Fatalf("bucket %s failed: %s", tc.bucket, wire)
			}
		})
	}
	store, _ := businessStore(t)
	wire := captureBusinessMetrics(t, func() {
		_, err := store.Transact("hash", func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.QACheckpointID = "test"
			p.State.Currencies["tuna"] = 300
			return domain.CommandResponse{State: p.State}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		_, err = store.Transact("hash", func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.QACheckpointID = ""
			p.State.Currencies["tuna"] = 0
			return domain.CommandResponse{State: p.State}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
	})
	if businessCount(t, wire, "kitty.economy.delta", "qa:true") != 2 || businessCount(t, wire, "kitty.economy.delta", "qa:false") != 0 {
		t.Fatalf("QA setup or restore polluted player data: %s", wire)
	}
}
