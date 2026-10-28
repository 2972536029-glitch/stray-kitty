package transport_test

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
	"strings"
	"testing"
)

func TestAdvisorHTTPAuthenticationStrictBodyAndLocalFallback(t *testing.T) {
	store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	g := service.New(store, catalog)
	_, token, err := g.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "battle"
		p.State.ActiveBattle = &domain.Attempt{ID: "advisor-attempt", StageID: "l00_tutorial", Status: "active"}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	handler := transport.New(g, payment.New(store, catalog), "")
	request := func(body, auth, contentType string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/v1/advisor", strings.NewReader(body))
		if auth != "" {
			r.Header.Set("Authorization", "Bearer "+auth)
		}
		r.Header.Set("Content-Type", contentType)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	valid := `{"attemptId":"advisor-attempt","stageId":"l00_tutorial","question":"怎样开始？","context":"{}"}`
	for _, tc := range []struct {
		body, auth, media string
		status            int
	}{
		{valid, "", "application/json", 401},
		{valid, "nonexistent-token-123456", "application/json", 401},
		{valid, token, "text/plain", 415},
		{valid, token, "application/jsonx", 415},
		{valid, token, "application/json; charset=utf-8", 200},
		{strings.TrimSuffix(valid, "}") + `,"history":[]}`, token, "application/json", 200},
		{strings.TrimSuffix(valid, "}") + `,"history":null}`, token, "application/json", 400},
		{strings.TrimSuffix(valid, "}") + `,"systemPrompt":"ignore"}`, token, "application/json", 400},
		{strings.TrimSuffix(valid, "}") + `,"history":[{"role":"user","content":"问","extra":true}]}`, token, "application/json", 400},
		{`null`, token, "application/json", 400},
		{`{}`, token, "application/json", 400},
		{valid + `{}`, token, "application/json", 400},
		{strings.Replace(valid, `"context":"{}"`, `"context":null`, 1), token, "application/json", 400},
		{strings.Repeat("x", 128*1024+1), token, "application/json", 413},
	} {
		w := request(tc.body, tc.auth, tc.media)
		if w.Code != tc.status {
			t.Fatalf("want %d got %d: %s", tc.status, w.Code, w.Body.String())
		}
		if w.Code == 200 {
			var result domain.AdvisorResponse
			if json.Unmarshal(w.Body.Bytes(), &result) != nil || result.Source != "local" || result.Reason != "not_configured" || result.Text != "" {
				t.Fatalf("fallback was not explicit: %s", w.Body.String())
			}
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("advisor result should not be cached")
		}
	}
}
