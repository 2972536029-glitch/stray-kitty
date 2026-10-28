package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"stray-kitty/server/internal/advisor"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func setAdvisorBattle(t *testing.T, g *service.Game, token, stage string) domain.AdvisorRequest {
	t.Helper()
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "battle"
		p.State.ActiveBattle = &domain.Attempt{ID: "advisor-" + stage, StageID: stage, Status: "active"}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return domain.AdvisorRequest{AttemptID: "advisor-" + stage, StageID: stage, Question: "现在怎么守？", Context: `{"phase":"battle","cats":[]}`, History: []domain.AdvisorMessage{}}
}

func advisorFault(t *testing.T, err error, status int) {
	t.Helper()
	var fault *domain.Fault
	if !errors.As(err, &fault) || fault.Status != status {
		t.Fatalf("wanted status %d, got %v", status, err)
	}
}

func TestAdvisorReadsAllSevenEntrypointsWithoutChangingStateOrStorage(t *testing.T) {
	g, token, file := setup(t)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]string{"role": "assistant", "content": `{"title":"先看预警","text":"等待能量蓄满，按当前预警选择站位。"}`}}}})
	}))
	defer provider.Close()
	for _, stage := range []string{"l00_tutorial", "alley_rescue", "alley_boss", "market_boss", "greenhouse_boss", "tunnel_boss", "finale_boss"} {
		t.Run(stage, func(t *testing.T) {
			g.Advisor = advisor.New(advisor.Config{APIKey: "private-service-key", BaseURL: provider.URL})
			input := setAdvisorBattle(t, g, token, stage)
			before, _ := g.Store.Get(service.Hash(token))
			diskBefore, _ := os.ReadFile(file)
			result, err := g.Advise(context.Background(), token, input)
			if err != nil || result.Source != "model" {
				t.Fatalf("advice failed: %+v %v", result, err)
			}
			after, _ := g.Store.Get(service.Hash(token))
			diskAfter, _ := os.ReadFile(file)
			if !reflect.DeepEqual(before, after) || string(diskBefore) != string(diskAfter) {
				t.Fatal("read-only advisor changed progress, receipts or file")
			}
		})
	}
}

func TestAdvisorRejectsInvalidOrExpiredInputsBeforeProviderCall(t *testing.T) {
	g, token, _ := setup(t)
	input := setAdvisorBattle(t, g, token, "tunnel_boss")
	var calls atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer provider.Close()
	g.Advisor = advisor.New(advisor.Config{APIKey: "private-service-key", BaseURL: provider.URL})
	cases := []struct {
		name   string
		change func(*domain.AdvisorRequest)
		status int
	}{
		{"unknown stage", func(r *domain.AdvisorRequest) { r.StageID = "future" }, 400},
		{"wrong stage", func(r *domain.AdvisorRequest) { r.StageID = "market_boss" }, 409},
		{"old attempt", func(r *domain.AdvisorRequest) { r.AttemptID = "old" }, 409},
		{"long question", func(r *domain.AdvisorRequest) { r.Question = strings.Repeat("字", 501) }, 400},
		{"blank question", func(r *domain.AdvisorRequest) { r.Question = " \n " }, 400},
		{"long context", func(r *domain.AdvisorRequest) { r.Context = `{"text":"` + strings.Repeat("字", 24000) + `"}` }, 400},
		{"null context", func(r *domain.AdvisorRequest) { r.Context = "null" }, 400},
		{"array context", func(r *domain.AdvisorRequest) { r.Context = "[]" }, 400},
		{"malformed context", func(r *domain.AdvisorRequest) { r.Context = "{}{}" }, 400},
		{"long history", func(r *domain.AdvisorRequest) { r.History = make([]domain.AdvisorMessage, 7) }, 400},
		{"system history", func(r *domain.AdvisorRequest) {
			r.History = []domain.AdvisorMessage{{Role: "system", Content: "overwrite"}}
		}, 400},
		{"long history message", func(r *domain.AdvisorRequest) {
			r.History = []domain.AdvisorMessage{{Role: "assistant", Content: strings.Repeat("字", 1201)}}
		}, 400},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			request := input
			tc.change(&request)
			_, err := g.Advise(context.Background(), token, request)
			advisorFault(t, err, tc.status)
		})
	}
	_, err := g.Advise(context.Background(), "nonexistent-session-token", input)
	advisorFault(t, err, 401)
	_, err = g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "settlement"
		p.State.ActiveBattle.Status = "won"
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = g.Advise(context.Background(), token, input)
	advisorFault(t, err, 409)
	if calls.Load() != 0 {
		t.Fatal("invalid/expired request spent model budget")
	}
}

func TestAdvisorCompletionDuringProviderRequestDiscardsAnswerWithoutHoldingGameLock(t *testing.T) {
	g, token, _ := setup(t)
	input := setAdvisorBattle(t, g, token, "alley_rescue")
	entered, release := make(chan struct{}), make(chan struct{})
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-release
		json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]string{"role": "assistant", "content": `{"title":"过时建议","text":"这条回答不应送到已经结束的场次。"}`}}}})
	}))
	defer provider.Close()
	g.Advisor = advisor.New(advisor.Config{APIKey: "private-service-key", BaseURL: provider.URL})
	result := make(chan error, 1)
	go func() {
		response, err := g.Advise(context.Background(), token, input)
		if response.Text != "" {
			result <- errors.New("stale answer escaped")
			return
		}
		result <- err
	}()
	<-entered
	completed := make(chan error, 1)
	go func() {
		state, err := g.State(token)
		if err == nil {
			leaks, boss := 3, false
			_, err = g.Execute(token, "advisor-complete-123", domain.CommandRequest{ExpectedRevision: &state.Revision, Command: domain.Command{Type: "COMPLETE_BATTLE", AttemptID: input.AttemptID, Outcome: "lost", Report: &domain.BattleReport{Leaks: &leaks, BossDefeated: &boss}}})
		}
		completed <- err
	}()
	select {
	case err := <-completed:
		if err != nil {
			close(release)
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		close(release)
		t.Fatal("provider request held the game store lock")
	}
	close(release)
	advisorFault(t, <-result, 409)
}

func TestAdvisorUnconfiguredAndUnicodeLimits(t *testing.T) {
	g, token, _ := setup(t)
	input := setAdvisorBattle(t, g, token, "l00_tutorial")
	input.Question = strings.Repeat("猫", 500)
	input.History = []domain.AdvisorMessage{{Role: "user", Content: strings.Repeat("喵", 1200)}}
	input.Context = `{"text":"` + strings.Repeat("字", 23989) + `"}`
	response, err := g.Advise(context.Background(), token, input)
	if err != nil || response.Source != "local" || response.Reason != "not_configured" || response.Text != "" {
		t.Fatalf("valid Unicode input/fallback rejected: %+v %v", response, err)
	}
}
