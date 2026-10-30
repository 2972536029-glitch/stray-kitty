package transport_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
)

// TestInternalCreditGuardAndIdempotency:Xsolla webhook 链路的游戏侧入账口——
// 令牌是唯一门禁,同号流水重复入账必须被幂等吞掉(余额不变)。
func TestInternalCreditGuardAndIdempotency(t *testing.T) {
	t.Setenv("INTERNAL_TOKEN", "s3cret")
	store, _ := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	catalog, _ := platform.LoadCatalog()
	handler := transport.New(service.New(store, catalog), payment.New(store, catalog), "")
	pack := domain.RechargePack{ID: "pack_small", Name: "小份罐头", PriceCents: 600, TunaGranted: 60}
	txn := domain.Txn{ID: "xs-test-1", PlayerID: "", PackID: pack.ID, Amount: 600, Status: "confirmed", CreatedAt: time.Now()}
	body := `{"playerId":"PLAYER","txn":` + mustJSON(t, txn) + `,"pack":` + mustJSON(t, pack) + `}`
	call := func(token, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/internal/credit", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("X-Internal-Token", token)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	// 无令牌端点整体 404(未配置 INTERNAL_TOKEN 时不应存在),令牌错 401。
	t.Setenv("INTERNAL_TOKEN", "")
	openHandler := transport.New(service.New(store, catalog), payment.New(store, catalog), "")
	r := httptest.NewRequest("POST", "/internal/credit", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	openHandler.ServeHTTP(w, r)
	if w.Code != 404 {
		t.Fatalf("credit endpoint must be disabled without token: %d", w.Code)
	}
	if w = call("wrong", body); w.Code != 401 {
		t.Fatalf("wrong token: %d", w.Code)
	}
	// 首次入账:60 罐到账。
	playerID := createPlayer(t, handler)
	w = call("s3cret", strings.Replace(body, "PLAYER", playerID, 1))
	if w.Code != 200 {
		t.Fatalf("first credit: %d %s", w.Code, w.Body.String())
	}
	var out struct {
		TunaBalance int `json:"tunaBalance"`
	}
	json.Unmarshal(w.Body.Bytes(), &out)
	if out.TunaBalance != 60 {
		t.Fatalf("expected balance 60, got %d", out.TunaBalance)
	}
	// 重放入账(渠道重试场景):余额必须不变。
	w = call("s3cret", strings.Replace(body, "PLAYER", playerID, 1))
	if w.Code != 200 {
		t.Fatalf("replayed credit: %d %s", w.Code, w.Body.String())
	}
	json.Unmarshal(w.Body.Bytes(), &out)
	if out.TunaBalance != 60 {
		t.Fatalf("replayed credit must not double-grant, balance %d", out.TunaBalance)
	}
}

// TestPaymentConfigAndSessionMock:mock 形态下 config 报 mock,session 明确拒绝(前端保持卡号 UI)。
func TestPaymentConfigAndSessionMock(t *testing.T) {
	store, _ := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	catalog, _ := platform.LoadCatalog()
	handler := transport.New(service.New(store, catalog), payment.New(store, catalog), "")
	r := httptest.NewRequest("GET", "/api/payment/config", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"mock"`) {
		t.Fatalf("config: %d %s", w.Code, w.Body.String())
	}
	r = httptest.NewRequest("POST", "/api/payment/session", strings.NewReader(`{"playerId":"p1","packId":"pack_small"}`))
	r.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 409 {
		t.Fatalf("mock session must be rejected with 409: %d %s", w.Code, w.Body.String())
	}
}

func createPlayer(t *testing.T, handler http.Handler) string {
	t.Helper()
	r := httptest.NewRequest("POST", "/api/v1/sessions", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 201 {
		t.Fatalf("create session: %d %s", w.Code, w.Body.String())
	}
	var s struct {
		PlayerID string `json:"playerId"`
	}
	json.Unmarshal(w.Body.Bytes(), &s)
	return s.PlayerID
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}
