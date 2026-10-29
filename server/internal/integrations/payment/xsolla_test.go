package payment_test

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
)

// newXsollaService 组一套带假 Xsolla 渠道与假游戏入账口的支付服务;
// 返回 handler 与两个假服务的引用供断言。
func newXsollaService(t *testing.T) (http.Handler, *[]map[string]any, *[]domain.Txn, *int) {
	t.Helper()
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	var tokenRequests []map[string]any
	xsollaAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != "42" || pass != "api-key" {
			w.WriteHeader(401)
			return
		}
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		if json.Unmarshal(raw, &body) != nil {
			w.WriteHeader(400)
			return
		}
		tokenRequests = append(tokenRequests, body)
		w.WriteHeader(200)
		w.Write([]byte(`{"token":"fake-token"}`))
	}))
	t.Cleanup(xsollaAPI.Close)
	ledger, err := payment.OpenLedger(filepath.Join(t.TempDir(), "payments.json"))
	if err != nil {
		t.Fatal(err)
	}
	var credits []domain.Txn
	creditStatus := 200
	gameServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Token") != "internal-secret" {
			w.WriteHeader(401)
			return
		}
		var body struct {
			PlayerID string              `json:"playerId"`
			Txn      domain.Txn          `json:"txn"`
			Pack     domain.RechargePack `json:"pack"`
		}
		raw, _ := io.ReadAll(r.Body)
		if json.Unmarshal(raw, &body) != nil {
			w.WriteHeader(400)
			return
		}
		credits = append(credits, body.Txn)
		if creditStatus != 200 {
			w.WriteHeader(creditStatus)
			w.Write([]byte(`{"error":{"code":"BOOM","message":"游戏侧开小差"}}`))
			return
		}
		w.WriteHeader(200)
		w.Write([]byte(`{"tunaBalance":60}`))
	}))
	t.Cleanup(gameServer.Close)
	creditFn := payment.NewGameCreditCaller(gameServer.URL, "internal-secret")
	client := payment.NewXsollaClient(payment.XsollaConfig{
		MerchantID:    "42",
		ProjectID:     "123",
		APIKey:        "api-key",
		WebhookSecret: "webhook-secret",
		Sandbox:       true,
		APIBaseURL:    xsollaAPI.URL,
		PaystationURL: "https://sandbox-secure.example/paystation4/",
		ReturnURL:     "https://game.example/?payment=return",
	})
	handler := payment.NewXsollaServiceHTTP(payment.NewDecider(catalog), ledger, client, creditFn)
	return handler, &tokenRequests, &credits, &creditStatus
}

func signWebhook(secret string, body []byte) string {
	buf := make([]byte, 0, len(body)+len(secret))
	buf = append(buf, body...)
	buf = append(buf, secret...)
	sum := sha1.Sum(buf)
	return "Signature " + hex.EncodeToString(sum[:])
}

func TestCreateSessionSandbox(t *testing.T) {
	handler, tokenRequests, _, _ := newXsollaService(t)
	r := httptest.NewRequest("POST", "/internal/session", strings.NewReader(`{"playerId":"p1","packId":"pack_small"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("session: %d %s", w.Code, w.Body.String())
	}
	var out struct {
		Provider string `json:"provider"`
		TxnID    string `json:"txnId"`
		URL      string `json:"url"`
		Sandbox  bool   `json:"sandbox"`
	}
	json.Unmarshal(w.Body.Bytes(), &out)
	if out.Provider != "xsolla" || !out.Sandbox || !strings.HasPrefix(out.TxnID, "xs-") {
		t.Fatalf("unexpected session body: %s", w.Body.String())
	}
	if out.URL != "https://sandbox-secure.example/paystation4/?token=fake-token" {
		t.Fatalf("unexpected paystation url: %s", out.URL)
	}
	if len(*tokenRequests) != 1 {
		t.Fatalf("expected 1 token request, got %d", len(*tokenRequests))
	}
	body := (*tokenRequests)[0]
	settings := body["settings"].(map[string]any)
	if settings["mode"] != "sandbox" || settings["external_id"] != out.TxnID || settings["project_id"].(float64) != 123 {
		t.Fatalf("unexpected settings: %v", settings)
	}
	checkout := body["purchase"].(map[string]any)["checkout"].(map[string]any)
	if checkout["currency"] != "CNY" || checkout["amount"].(float64) != 6 {
		t.Fatalf("unexpected checkout: %v", checkout)
	}
	custom := body["custom_parameters"].(map[string]any)
	if custom["playerId"] != "p1" || custom["packId"] != "pack_small" {
		t.Fatalf("unexpected custom_parameters: %v", custom)
	}
	redirect := settings["redirect_policy"].(map[string]any)["redirect_urls"].(map[string]any)
	if redirect["return_url"] != "https://game.example/?payment=return" {
		t.Fatalf("unexpected return_url: %v", redirect)
	}
}

func TestWebhookPaymentHappyPathAndReplay(t *testing.T) {
	handler, _, credits, _ := newXsollaService(t)
	body := []byte(`{"notification_type":"payment","purchase":{"checkout":{"amount":6,"currency":"CNY"}},"transaction":{"id":987654,"external_id":"xs-txn-1"},"user":{"id":"ignored"},"custom_parameters":{"playerId":"p1","packId":"pack_small"}}`)
	call := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/webhook/xsolla", strings.NewReader(string(body)))
		r.Header.Set("Authorization", signWebhook("webhook-secret", body))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	w := call()
	if w.Code != 200 {
		t.Fatalf("first webhook: %d %s", w.Code, w.Body.String())
	}
	// 渠道重发同一笔通知:不能重复入账(游戏侧还会按流水号再兜底一次)。
	if w = call(); w.Code != 200 {
		t.Fatalf("replayed webhook must still 200: %d %s", w.Code, w.Body.String())
	}
	if len(*credits) != 2 {
		t.Fatalf("expected credit called on both deliveries, got %d", len(*credits))
	}
	for _, txn := range *credits {
		if txn.ID != "xs-txn-1" || txn.Status != "confirmed" || txn.PlayerID != "p1" || txn.Amount != 600 {
			t.Fatalf("unexpected credited txn: %+v", txn)
		}
	}
}

func TestWebhookCreditFailureTriggersRetry(t *testing.T) {
	handler, _, credits, creditStatus := newXsollaService(t)
	body := []byte(`{"notification_type":"payment","purchase":{"checkout":{"amount":6,"currency":"CNY"}},"transaction":{"id":987654,"external_id":"xs-txn-1"},"custom_parameters":{"playerId":"p1","packId":"pack_small"}}`)
	call := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/webhook/xsolla", strings.NewReader(string(body)))
		r.Header.Set("Authorization", signWebhook("webhook-secret", body))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	*creditStatus = 500
	if w := call(); w.Code != 502 {
		t.Fatalf("credit failure must surface as 502 for xsolla retry: %d %s", w.Code, w.Body.String())
	}
	// 游戏侧恢复:重试同一通知,入账补上并回 200。
	*creditStatus = 200
	if w := call(); w.Code != 200 {
		t.Fatalf("retry after recovery: %d %s", w.Code, w.Body.String())
	}
	if len(*credits) != 2 {
		t.Fatalf("expected 2 credit calls (failed + retried), got %d", len(*credits))
	}
}

func TestWebhookSignatureAndTypes(t *testing.T) {
	handler, _, credits, _ := newXsollaService(t)
	body := []byte(`{"notification_type":"user_validation","user":{"id":"p1"}}`)
	post := func(b []byte, sig string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/webhook/xsolla", strings.NewReader(string(b)))
		if sig != "" {
			r.Header.Set("Authorization", sig)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	// 签名不对必须 401,渠道会停发或人工排查,绝不入账。
	if w := post(body, "Signature deadbeef"); w.Code != 401 {
		t.Fatalf("bad signature: %d", w.Code)
	}
	if w := post(body, ""); w.Code != 401 {
		t.Fatalf("missing signature: %d", w.Code)
	}
	// 签名对但密钥错也不行。
	if w := post(body, signWebhook("wrong-secret", body)); w.Code != 401 {
		t.Fatalf("wrong secret: %d", w.Code)
	}
	// user_validation / refund / 未知类型都是确认收到(200)且不入账。
	for _, b := range []string{
		`{"notification_type":"user_validation","user":{"id":"p1"}}`,
		`{"notification_type":"refund","transaction":{"id":1,"external_id":"xs-txn-1"}}`,
		`{"notification_type":"something_new","transaction":{"id":2}}`,
	} {
		raw := []byte(b)
		if w := post(raw, signWebhook("webhook-secret", raw)); w.Code != 200 {
			t.Fatalf("type %s must ack with 200: %d %s", b, w.Code, w.Body.String())
		}
	}
	if len(*credits) != 0 {
		t.Fatalf("no credit expected, got %d", len(*credits))
	}
}

func TestGameCreditCaller(t *testing.T) {
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	pack := catalog.RechargePacks[0]
	txn := domain.Txn{ID: "xs-1", PlayerID: "p1", PackID: pack.ID, Amount: pack.PriceCents, Status: "confirmed"}
	game := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Token") != "tok" {
			w.WriteHeader(401)
			return
		}
		w.WriteHeader(200)
		w.Write([]byte(`{"tunaBalance":60}`))
	}))
	defer game.Close()
	caller := payment.NewGameCreditCaller(game.URL, "tok")
	if err := caller("p1", txn, pack); err != nil {
		t.Fatalf("credit ok path: %v", err)
	}
	badCaller := payment.NewGameCreditCaller(game.URL, "wrong")
	if err := badCaller("p1", txn, pack); err == nil {
		t.Fatal("credit with wrong token must fail")
	}
	deadCaller := payment.NewGameCreditCaller("http://127.0.0.1:1", "tok")
	if err := deadCaller("p1", txn, pack); err == nil {
		t.Fatal("credit to dead endpoint must fail")
	}
}
