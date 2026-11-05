package transport_test

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/obs"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
)

type checkoutGateway struct {
	transport.PaymentGateway
	fail       bool
	chargeFail bool
}

func (g *checkoutGateway) Charge(ctx context.Context, playerID, packID, card string) (payment.ChargeResult, error) {
	if g.chargeFail {
		return payment.ChargeResult{}, domain.Fail("TEST_PAYMENT_ERROR", "test failure", 500)
	}
	return g.PaymentGateway.Charge(ctx, playerID, packID, card)
}

func (g *checkoutGateway) Session(context.Context, string, string) (payment.SessionResult, error) {
	if g.fail {
		return payment.SessionResult{}, domain.Fail("PAYMENT_UNAVAILABLE", "test failure", 503)
	}
	return payment.SessionResult{Provider: "xsolla", TxnID: "checkout-only", URL: "https://example.com/checkout", Sandbox: true}, nil
}

func TestPaymentFunnelCommitsAndWebhookReplay(t *testing.T) {
	listener, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	t.Setenv("DD_DOGSTATSD_PORT_8125_ADDR", listener.LocalAddr().String())
	t.Setenv("DD_TRACE_ENABLED", "false")
	t.Setenv("DD_INSTRUMENTATION_TELEMETRY_ENABLED", "false")
	t.Setenv("INTERNAL_TOKEN", "test-credit-secret")
	obs.Init("kitty-api")
	t.Cleanup(obs.Shutdown)
	store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	game := service.New(store, catalog)
	gateway := &checkoutGateway{PaymentGateway: payment.New(store, catalog)}
	handler := transport.New(game, gateway, "")
	playerID, _, err := game.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	call := func(path string, body any, want int) {
		t.Helper()
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(string(raw)))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Internal-Token", "test-credit-secret")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
	}
	call("/api/payment/charge", map[string]string{"playerId": playerID, "packId": "pack_small", "cardNumber": "4242424242424242"}, 200)
	call("/api/payment/charge", map[string]string{"playerId": playerID, "packId": "pack_small", "cardNumber": "0000123412341234"}, 200)
	call("/api/payment/charge", map[string]string{"packId": "pack_small"}, 400)
	call("/api/payment/session", map[string]string{"playerId": playerID, "packId": "pack_small"}, 200)
	gateway.fail = true
	call("/api/payment/session", map[string]string{"playerId": playerID, "packId": "pack_small"}, 503)
	credit := map[string]any{
		"playerId": playerID,
		"txn":      domain.Txn{ID: "xs-webhook-test", PlayerID: playerID, PackID: "pack_small", Status: "confirmed"},
		"pack":     domain.RechargePack{ID: "pack_small", TunaGranted: 60},
	}
	call("/internal/credit", credit, 200)
	call("/internal/credit", credit, 200)
	obs.Shutdown()
	counts := map[string]int{}
	buffer := make([]byte, 65535)
	listener.SetReadDeadline(time.Now().Add(250 * time.Millisecond))
	for {
		n, _, err := listener.ReadFrom(buffer)
		if err != nil {
			break
		}
		for _, line := range strings.Split(string(buffer[:n]), "\n") {
			if !strings.HasPrefix(line, "kitty.payment.funnel:") {
				continue
			}
			parts := strings.Split(line, "|")
			amount, err := strconv.Atoi(strings.TrimPrefix(parts[0], "kitty.payment.funnel:"))
			if err != nil {
				t.Fatal(err)
			}
			for _, field := range parts {
				if strings.HasPrefix(field, "#") {
					for _, tag := range strings.Split(strings.TrimPrefix(field, "#"), ",") {
						if strings.HasPrefix(tag, "step:") {
							counts[strings.TrimPrefix(tag, "step:")] += amount
						}
					}
				}
			}
		}
	}
	for step, want := range map[string]int{"session_created": 1, "charge_attempt": 3, "charge_success": 2, "charge_declined": 1} {
		if counts[step] != want {
			t.Errorf("%s = %d, want %d; all steps: %v", step, counts[step], want, counts)
		}
	}
}

func TestExistingPaymentMetricsCarryQAForEveryOutcome(t *testing.T) {
	listener, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	t.Setenv("DD_DOGSTATSD_PORT_8125_ADDR", listener.LocalAddr().String())
	t.Setenv("DD_TRACE_ENABLED", "false")
	t.Setenv("DD_INSTRUMENTATION_TELEMETRY_ENABLED", "false")
	obs.Init("kitty-api")
	t.Cleanup(obs.Shutdown)
	store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	game := service.New(store, catalog)
	playerID, _, err := game.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	gateway := &checkoutGateway{PaymentGateway: payment.New(store, catalog)}
	handler := transport.New(game, gateway, "")
	call := func(path, pack, card string, want int) {
		t.Helper()
		body := map[string]string{"playerId": playerID, "packId": pack}
		if card != "" {
			body["cardNumber"] = card
		}
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(string(raw)))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
	}
	for _, qa := range []bool{false, true} {
		if err := store.TransactByPlayer(playerID, func(p *repository.Player) error {
			// The settled battle tag must work even without a QA checkpoint.
			p.State.ActiveBattle = &domain.Attempt{Status: "won", QA: qa}
			return nil
		}); err != nil {
			t.Fatal(err)
		}
		gateway.chargeFail = false
		call("/api/payment/charge", "pack_small", "4242424242424242", 200)
		call("/api/payment/charge", "pack_small", "0000123412341234", 200)
		call("/api/payment/charge", "unknown-pack", "4242424242424242", 404)
		gateway.chargeFail = true
		call("/api/payment/charge", "pack_small", "4242424242424242", 500)
		gateway.fail = false
		call("/api/payment/session", "pack_small", "", 200)
		gateway.fail = true
		call("/api/payment/session", "pack_small", "", 503)
	}
	obs.Shutdown()
	counts := map[string]int{}
	buffer := make([]byte, 65535)
	listener.SetReadDeadline(time.Now().Add(250 * time.Millisecond))
	for {
		n, _, err := listener.ReadFrom(buffer)
		if err != nil {
			break
		}
		for _, line := range strings.Split(string(buffer[:n]), "\n") {
			parts := strings.Split(line, "|")
			name, rawAmount, found := strings.Cut(parts[0], ":")
			if !found || (name != "kitty.payment.charge" && name != "kitty.payment.session") {
				continue
			}
			amount, err := strconv.Atoi(rawAmount)
			if err != nil {
				t.Fatal(err)
			}
			result, qa := "", ""
			for _, field := range parts {
				if !strings.HasPrefix(field, "#") {
					continue
				}
				for _, tag := range strings.Split(field[1:], ",") {
					if strings.HasPrefix(tag, "result:") {
						result = strings.TrimPrefix(tag, "result:")
					}
					if strings.HasPrefix(tag, "qa:") {
						qa = strings.TrimPrefix(tag, "qa:")
					}
				}
			}
			if qa == "" {
				t.Fatalf("legacy payment metric omitted QA isolation: %s", line)
			}
			counts[name+"/"+result+"/"+qa] += amount
		}
	}
	for _, qa := range []string{"false", "true"} {
		for name, results := range map[string][]string{
			"kitty.payment.charge":  {"success", "declined", "rejected", "error"},
			"kitty.payment.session": {"success", "error"},
		} {
			for _, result := range results {
				key := name + "/" + result + "/" + qa
				if counts[key] != 1 {
					t.Errorf("%s = %d, expected 1; all=%v", key, counts[key], counts)
				}
			}
		}
	}
}
