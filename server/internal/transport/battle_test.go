package transport_test

import (
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
	"strings"
	"testing"
)

func TestBattleRejectsRemovedSupplyFieldsAndRequiresBossReport(t *testing.T) {
	store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	g := service.New(store, catalog)
	g.Random = func(int) (int, error) { return 0, nil }
	_, token, err := g.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "home"
		p.State.Flags = domain.Add(p.State.Flags, "alley_rescued")
		p.State.Inventory["warm-can"] = 3
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	handler := transport.New(g, "")
	requestNumber := 0
	request := func(body string) *httptest.ResponseRecorder {
		requestNumber++
		r := httptest.NewRequest("POST", "/api/v1/commands", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Idempotency-Key", fmt.Sprintf("battle-http-key-%d", requestNumber))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	for _, supplies := range []string{`null`, `[]`, `{"warm-can":null}`, `{"warm-can":1.5}`, `{"warm-can":"1"}`, `{"unknown":0}`, `{}`, `{"warm-can":2}`} {
		w := request(`{"expectedRevision":0,"command":{"type":"START_BATTLE","stageId":"alley_boss","supplies":` + supplies + `}}`)
		if w.Code != 400 {
			t.Fatalf("invalid supplies %s returned %d", supplies, w.Code)
		}
	}
	w := request(`{"expectedRevision":0,"command":{"type":"START_BATTLE","stageId":"alley_boss"}}`)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	s, _ := g.State(token)
	if s.Inventory["warm-can"] != 3 || len(s.ActiveBattle.Supplies) != 0 {
		t.Fatal("new battle changed inventory")
	}
	for _, report := range []string{`null`, `{}`, `{"leaks":null,"bossDefeated":true}`, `{"leaks":0,"bossDefeated":true,"extra":1}`} {
		body := fmt.Sprintf(`{"expectedRevision":1,"command":{"type":"COMPLETE_BATTLE","attemptId":%q,"outcome":"won","report":%s}}`, s.ActiveBattle.ID, report)
		w = request(body)
		if w.Code != 400 {
			t.Fatalf("invalid report %s returned %d", report, w.Code)
		}
	}
	body := fmt.Sprintf(`{"expectedRevision":1,"command":{"type":"COMPLETE_BATTLE","attemptId":%q,"outcome":"won","usedSupplies":{},"report":{"leaks":0,"bossDefeated":true}}}`, s.ActiveBattle.ID)
	if w = request(body); w.Code != 400 {
		t.Fatalf("obsolete usage accepted: %s", w.Body.String())
	}
	body = fmt.Sprintf(`{"expectedRevision":1,"command":{"type":"COMPLETE_BATTLE","attemptId":%q,"outcome":"won","report":{"leaks":0,"bossDefeated":true}}}`, s.ActiveBattle.ID)
	if w = request(body); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	s, _ = g.State(token)
	if s.Inventory["warm-can"] != 3 || strings.Contains(w.Body.String(), "battleRewards") {
		t.Fatal("settlement consumed or awarded supplies")
	}
}
