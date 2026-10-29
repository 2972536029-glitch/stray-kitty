package transport_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
)

func TestPaymentEndpoints(t *testing.T) {
	store, _ := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	catalog, _ := platform.LoadCatalog()
	handler := transport.New(service.New(store, catalog), payment.New(store, catalog), "")
	call := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	created := call("POST", "/api/v1/sessions", "")
	if created.Code != 201 {
		t.Fatal(created.Body.String())
	}
	var session struct{ PlayerID, Token string }
	json.Unmarshal(created.Body.Bytes(), &session)

	// 成功路径:4242 入账 60 罐。
	w := call("POST", "/api/payment/charge", `{"playerId":"`+session.PlayerID+`","packId":"pack_small","cardNumber":"4242424242424242"}`)
	if w.Code != 200 {
		t.Fatalf("charge confirmed: %d %s", w.Code, w.Body.String())
	}
	var confirmed struct {
		TxnID       string `json:"txnId"`
		Status      string `json:"status"`
		TunaBalance int    `json:"tunaBalance"`
		TunaGranted int    `json:"tunaGranted"`
	}
	json.Unmarshal(w.Body.Bytes(), &confirmed)
	if confirmed.Status != "confirmed" || confirmed.TunaBalance != 60 || confirmed.TunaGranted != 60 || !strings.HasPrefix(confirmed.TxnID, "txn-") {
		t.Fatalf("unexpected confirmed body: %s", w.Body.String())
	}

	// 失败路径:0000 温和拒绝并带治愈文案,同样是 HTTP 200。
	w = call("POST", "/api/payment/charge", `{"playerId":"`+session.PlayerID+`","packId":"pack_small","cardNumber":"0000123412341234"}`)
	if w.Code != 200 {
		t.Fatalf("charge declined should stay 200: %d %s", w.Code, w.Body.String())
	}
	var declined struct {
		Status     string `json:"status"`
		Reason     string `json:"reason"`
		HealingMsg string `json:"healingMsg"`
	}
	json.Unmarshal(w.Body.Bytes(), &declined)
	if declined.Status != "declined" || declined.HealingMsg == "" || declined.Reason == "" {
		t.Fatalf("unexpected declined body: %s", w.Body.String())
	}

	// 输入校验:未知档位 404、坏卡号 400、缺 playerId 400、未知玩家 404。
	for _, tc := range []struct {
		body string
		want int
	}{
		{`{"playerId":"` + session.PlayerID + `","packId":"pack_huge","cardNumber":"4242424242424242"}`, 404},
		{`{"playerId":"` + session.PlayerID + `","packId":"pack_small","cardNumber":"42"}`, 400},
		{`{"packId":"pack_small","cardNumber":"4242424242424242"}`, 400},
		{`{"playerId":"ghost","packId":"pack_small","cardNumber":"4242424242424242"}`, 404},
		{`{"playerId":"` + session.PlayerID + `","packId":"pack_small","cardNumber":"4242424242424242","extra":1}`, 400},
	} {
		if w = call("POST", "/api/payment/charge", tc.body); w.Code != tc.want {
			t.Fatalf("body %s: want %d got %d %s", tc.body, tc.want, w.Code, w.Body.String())
		}
	}

	// 历史查询:最新在前,含失败一笔。
	w = call("GET", "/api/payment/history?playerId="+session.PlayerID, "")
	if w.Code != 200 {
		t.Fatalf("history: %d %s", w.Code, w.Body.String())
	}
	var history struct {
		PlayerID string        `json:"playerId"`
		Txns     []interface{} `json:"txns"`
	}
	json.Unmarshal(w.Body.Bytes(), &history)
	if history.PlayerID != session.PlayerID || len(history.Txns) != 2 {
		t.Fatalf("unexpected history: %s", w.Body.String())
	}
	if w = call("GET", "/api/payment/history", ""); w.Code != 400 {
		t.Fatalf("history without playerId should 400: %d", w.Code)
	}

	// 充值入账后,状态端点可见金枪鱼余额。
	r := httptest.NewRequest("GET", "/api/v1/state", nil)
	r.Header.Set("Authorization", "Bearer "+session.Token)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	var state struct {
		Currencies map[string]int `json:"currencies"`
	}
	json.Unmarshal(w.Body.Bytes(), &state)
	if state.Currencies["tuna"] != 60 {
		t.Fatalf("tuna not visible in state: %s", w.Body.String())
	}
	if w = call("GET", "/healthz", ""); w.Code != http.StatusOK {
		t.Fatal("health failed")
	}
}
