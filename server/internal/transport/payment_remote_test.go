package transport_test

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
)

// 拆分形态的端到端链路:前端形状不变,充值经远程支付服务判定记账,游戏侧入账并落展示流水。
func TestRemotePaymentChargeFlow(t *testing.T) {
	store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	game := service.New(store, catalog)

	// 起一个真实的支付服务实例当远端。
	ledger, err := payment.OpenLedger(filepath.Join(t.TempDir(), "payments.json"))
	if err != nil {
		t.Fatal(err)
	}
	paymentSrv := httptest.NewServer(payment.NewServiceHTTP(payment.NewDecider(catalog), ledger))
	defer paymentSrv.Close()

	remote := transport.NewRemotePayment(paymentSrv.URL, game)
	handler := transport.New(game, remote, "")

	created := httptest.NewRecorder()
	handler.ServeHTTP(created, httptest.NewRequest("POST", "/api/v1/sessions", nil))
	if created.Code != 201 {
		t.Fatal(created.Body.String())
	}
	var session struct{ PlayerID string }
	json.Unmarshal(created.Body.Bytes(), &session)

	call := func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/payment/charge", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	// 成功路径:4242 入账 60,权威账本与游戏展示流水各落一笔。
	w := call(`{"playerId":"` + session.PlayerID + `","packId":"pack_small","cardNumber":"4242424242424242"}`)
	if w.Code != 200 {
		t.Fatalf("charge: %d %s", w.Code, w.Body.String())
	}
	var confirmed struct {
		Status      string `json:"status"`
		TunaBalance int    `json:"tunaBalance"`
		TunaGranted int    `json:"tunaGranted"`
	}
	json.Unmarshal(w.Body.Bytes(), &confirmed)
	if confirmed.Status != "confirmed" || confirmed.TunaBalance != 60 || confirmed.TunaGranted != 60 {
		t.Fatalf("unexpected confirmed body: %s", w.Body.String())
	}
	ledgerTxns, err := ledger.History(session.PlayerID)
	if err != nil || len(ledgerTxns) != 1 || ledgerTxns[0].Status != "confirmed" {
		t.Fatalf("authoritative ledger missing txn: %+v err=%v", ledgerTxns, err)
	}

	// 失败路径:0000 温柔拒绝,余额不动,流水仍记录。
	w = call(`{"playerId":"` + session.PlayerID + `","packId":"pack_small","cardNumber":"0000111122223333"}`)
	if w.Code != 200 {
		t.Fatalf("declined must stay 200: %d %s", w.Code, w.Body.String())
	}
	var declined struct {
		Status      string `json:"status"`
		Reason      string `json:"reason"`
		HealingMsg  string `json:"healingMsg"`
		TunaBalance int    `json:"tunaBalance"`
	}
	json.Unmarshal(w.Body.Bytes(), &declined)
	if declined.Status != "declined" || declined.Reason == "" || declined.HealingMsg == "" || declined.TunaBalance != 60 {
		t.Fatalf("unexpected declined body: %s", w.Body.String())
	}

	// 展示流水历史(经游戏存档,含成功与失败两笔,最新在前)。
	hist := httptest.NewRecorder()
	hr := httptest.NewRequest("GET", "/api/payment/history?playerId="+session.PlayerID, nil)
	handler.ServeHTTP(hist, hr)
	if hist.Code != 200 {
		t.Fatal(hist.Body.String())
	}
	var history struct {
		Txns []domain.Txn
	}
	json.Unmarshal(hist.Body.Bytes(), &history)
	if len(history.Txns) != 2 || history.Txns[0].Status != "declined" || history.Txns[0].PlayerID != session.PlayerID {
		t.Fatalf("unexpected display history: %s", hist.Body.String())
	}

	// 支付服务不可达时:明确 503,不碰余额。
	dead := transport.NewRemotePayment("http://127.0.0.1:1", game)
	if _, err := dead.Charge(session.PlayerID, "pack_small", "4242424242424242"); err == nil {
		t.Fatal("expected error when payment service unreachable")
	} else {
		var fault *domain.Fault
		if !errors.As(err, &fault) || fault.Status != 503 {
			t.Fatalf("expected PAYMENT_UNAVAILABLE 503, got %v", err)
		}
	}
}
