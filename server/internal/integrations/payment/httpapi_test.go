package payment_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
)

func newService(t *testing.T) http.Handler {
	t.Helper()
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	ledger, err := payment.OpenLedger(filepath.Join(t.TempDir(), "payments.json"))
	if err != nil {
		t.Fatal(err)
	}
	return payment.NewServiceHTTP(payment.NewDecider(catalog), ledger)
}

func TestServiceHTTPChargeBothPaths(t *testing.T) {
	handler := newService(t)
	call := func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/internal/charge", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	// 4242 必成功:落账本并返回档位。
	w := call(`{"playerId":"p1","packId":"pack_small","cardNumber":"4242 4242 4242 4242"}`)
	if w.Code != 200 {
		t.Fatalf("confirmed charge: %d %s", w.Code, w.Body.String())
	}
	var confirmed struct {
		Txn  domain.Txn
		Pack domain.RechargePack
	}
	json.Unmarshal(w.Body.Bytes(), &confirmed)
	if confirmed.Txn.Status != "confirmed" || confirmed.Txn.CardSuffix != "4242" || confirmed.Pack.TunaGranted != 60 {
		t.Fatalf("unexpected confirmed body: %s", w.Body.String())
	}
	// 0000 必失败:同样是正常业务,流水记 declined。
	w = call(`{"playerId":"p1","packId":"pack_small","cardNumber":"0000111122223333"}`)
	if w.Code != 200 {
		t.Fatalf("declined charge must stay business-200: %d %s", w.Code, w.Body.String())
	}
	var declined struct {
		Txn domain.Txn
	}
	json.Unmarshal(w.Body.Bytes(), &declined)
	if declined.Txn.Status != "declined" || declined.Txn.Reason == "" {
		t.Fatalf("unexpected declined body: %s", w.Body.String())
	}
	// 历史包含两笔,最新在前。
	r := httptest.NewRequest("GET", "/internal/history?playerId=p1", nil)
	hw := httptest.NewRecorder()
	handler.ServeHTTP(hw, r)
	if hw.Code != 200 {
		t.Fatal(hw.Body.String())
	}
	var hist struct {
		Txns []domain.Txn
	}
	json.Unmarshal(hw.Body.Bytes(), &hist)
	if len(hist.Txns) != 2 || hist.Txns[0].Status != "declined" {
		t.Fatalf("unexpected history: %s", hw.Body.String())
	}
}

func TestServiceHTTPRejectsBadInput(t *testing.T) {
	handler := newService(t)
	cases := []struct {
		name, body string
		code       int
		errorCode  string
	}{
		{"unknown pack", `{"playerId":"p1","packId":"nope","cardNumber":"4242424242424242"}`, 404, "PACK_NOT_FOUND"},
		{"bad card", `{"playerId":"p1","packId":"pack_small","cardNumber":"12"}`, 400, "INVALID_CARD"},
		{"missing player", `{"playerId":"","packId":"pack_small","cardNumber":"4242424242424242"}`, 400, "INVALID_REQUEST"},
		{"unknown field", `{"playerId":"p1","packId":"pack_small","cardNumber":"4242424242424242","extra":1}`, 400, "INVALID_REQUEST"},
	}
	for _, tc := range cases {
		r := httptest.NewRequest("POST", "/internal/charge", strings.NewReader(tc.body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		var body struct {
			Error struct{ Code string }
		}
		json.Unmarshal(w.Body.Bytes(), &body)
		if w.Code != tc.code || body.Error.Code != tc.errorCode {
			t.Fatalf("%s: got %d/%s, want %d/%s; body=%s", tc.name, w.Code, body.Error.Code, tc.code, tc.errorCode, w.Body.String())
		}
	}
}

func TestServiceHTTPHealth(t *testing.T) {
	handler := newService(t)
	for _, path := range []string{"/healthz", "/readyz"} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 {
			t.Fatalf("%s: %d", path, w.Code)
		}
	}
}
