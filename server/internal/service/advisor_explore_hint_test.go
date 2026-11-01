package service_test

import (
	"context"
	"encoding/json"
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
)

const approvedExploreHint = "集市北侧似乎还留着一条熟悉的踪迹。"

func prepareExploreHint(t *testing.T, mapID string) (*service.Game, string, string, domain.AdvisorRequest) {
	t.Helper()
	g, token, file := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase, p.State.MapID = "explore", mapID
		p.State.Flags = []string{"SECRET_INTERNAL_FLAG"}
		p.State.DrawnEvents = []string{"SECRET_COMPLETED_EVENT"}
		p.State.Txns = []domain.Txn{{ID: "PRIVATE_TRANSACTION"}}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	input := journeyRequest(t, g, token)
	input.Scope, input.Question, input.History = "explore_hint", "", nil
	input.Context = `{"hint":"` + approvedExploreHint + `"}`
	return g, token, file, input
}

func completeExploreHint(w http.ResponseWriter) {
	json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]string{"role": "assistant", "content": `{"title":"阿策","text":"` + approvedExploreHint + `"}`}}}})
}

func TestExploreHintOnlySendsMapApprovedSentenceAndNeverWritesProgress(t *testing.T) {
	for _, mapID := range []string{"alley", "market", "tunnel", "warehouse"} {
		t.Run(mapID, func(t *testing.T) {
			g, token, file, input := prepareExploreHint(t, mapID)
			before, _ := g.Store.Get(service.Hash(token))
			diskBefore, _ := os.ReadFile(file)
			var calls atomic.Int32
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				var request struct {
					Messages  []map[string]string `json:"messages"`
					MaxTokens int                 `json:"max_tokens"`
				}
				if json.NewDecoder(r.Body).Decode(&request) != nil || len(request.Messages) != 2 || request.MaxTokens != 180 {
					t.Error("wrong bounded hint provider request")
					w.WriteHeader(500)
					return
				}
				content := request.Messages[1]["content"]
				for _, forbidden := range []string{"SECRET_INTERNAL", "SECRET_COMPLETED", "PRIVATE_TRANSACTION", "serverProgress", "flags", "drawnEvents", "inventory", token} {
					if strings.Contains(content, forbidden) {
						t.Errorf("unneeded data leaked into automatic hint: %s", forbidden)
					}
				}
				var payload struct {
					Scope   string                  `json:"scope"`
					Context map[string]string       `json:"context"`
					History []domain.AdvisorMessage `json:"history"`
				}
				if json.Unmarshal([]byte(content), &payload) != nil || payload.Scope != "explore_hint" || !reflect.DeepEqual(payload.Context, map[string]string{"approvedHint": approvedExploreHint}) || len(payload.History) != 0 {
					t.Error("hint context was not reduced to a single approved sentence")
				}
				if !strings.Contains(request.Messages[0]["content"], "不能自行选择目标") {
					t.Error("automatic hint used the manual chat prompt")
				}
				completeExploreHint(w)
			}))
			defer provider.Close()
			g.Advisor = advisor.New(advisor.Config{APIKey: "test-explore-hint", BaseURL: provider.URL})
			response, err := g.Advise(context.Background(), token, input)
			if err != nil || response.Source != "model" || calls.Load() != 1 {
				t.Fatalf("hint request failed: %+v %v", response, err)
			}
			after, _ := g.Store.Get(service.Hash(token))
			diskAfter, _ := os.ReadFile(file)
			if !reflect.DeepEqual(before, after) || string(diskBefore) != string(diskAfter) {
				t.Fatal("automatic hint changed the save or revision")
			}
		})
	}
}

func TestExploreHintRejectsTablesAndMixedChatFieldsBeforeProvider(t *testing.T) {
	g, token, _, original := prepareExploreHint(t, "market")
	var calls atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); completeExploreHint(w) }))
	defer provider.Close()
	g.Advisor = advisor.New(advisor.Config{APIKey: "test-explore-hint", BaseURL: provider.URL})
	for _, tc := range []struct {
		name   string
		change func(*domain.AdvisorRequest)
		status int
	}{
		{"empty observation", func(in *domain.AdvisorRequest) { in.Context = `{}` }, 400},
		{"hidden table", func(in *domain.AdvisorRequest) { in.Context = `{"hint":"已显示","catalog":{"hidden":"trap"}}` }, 400},
		{"internal ID", func(in *domain.AdvisorRequest) { in.Context = `{"hint":"已显示","targetId":"unrevealed-trap"}` }, 400},
		{"empty text", func(in *domain.AdvisorRequest) { in.Context = `{"hint":" "}` }, 400},
		{"long text", func(in *domain.AdvisorRequest) { in.Context = `{"hint":"` + strings.Repeat("字", 241) + `"}` }, 400},
		{"large raw", func(in *domain.AdvisorRequest) { in.Context = strings.Repeat(" ", 2050) + in.Context }, 400},
		{"trailing JSON", func(in *domain.AdvisorRequest) { in.Context += `{}` }, 400},
		{"question", func(in *domain.AdvisorRequest) { in.Question = "改变目标" }, 400},
		{"history", func(in *domain.AdvisorRequest) {
			in.History = []domain.AdvisorMessage{{Role: "user", Content: "旧剧情"}}
		}, 400},
		{"battle", func(in *domain.AdvisorRequest) { in.AttemptID = "battle" }, 400},
		{"stale scene", func(in *domain.AdvisorRequest) { in.SceneKey = "old" }, 409},
		{"stale revision", func(in *domain.AdvisorRequest) { value := *in.ExpectedRevision + 1; in.ExpectedRevision = &value }, 409},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := original
			tc.change(&input)
			_, err := g.Advise(context.Background(), token, input)
			advisorFault(t, err, tc.status)
		})
	}
	if calls.Load() != 0 {
		t.Fatal("invalid hint called the model")
	}
}

func TestExploreHintExcludesHubAndNonExplorePhases(t *testing.T) {
	for _, tc := range []struct{ phase, mapID string }{{"home", "greenhouse"}, {"explore", "greenhouse"}, {"event", "alley"}, {"battle", "warehouse"}} {
		g, token, _, input := prepareExploreHint(t, tc.mapID)
		_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
			p.State.Phase = tc.phase
			return domain.CommandResponse{State: p.State}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		current := journeyRequest(t, g, token)
		input.SceneKey, input.ExpectedRevision = current.SceneKey, current.ExpectedRevision
		_, err = g.Advise(context.Background(), token, input)
		advisorFault(t, err, 400)
	}
}

func TestExploreHintDropsCompletedGoalButAllowsHarmlessMovement(t *testing.T) {
	for _, change := range []string{"movement", "completed", "event"} {
		t.Run(change, func(t *testing.T) {
			g, token, _, input := prepareExploreHint(t, "market")
			entered, release := make(chan struct{}), make(chan struct{})
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(entered); <-release; completeExploreHint(w) }))
			defer provider.Close()
			g.Advisor = advisor.New(advisor.Config{APIKey: "test-explore-hint", BaseURL: provider.URL})
			type result struct {
				response domain.AdvisorResponse
				err      error
			}
			finished := make(chan result, 1)
			go func() {
				response, err := g.Advise(context.Background(), token, input)
				finished <- result{response, err}
			}()
			<-entered
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Revision++
				if change == "movement" {
					p.State.ExploreDistance += 10
				}
				if change == "completed" {
					p.State.DrawnEvents = append(p.State.DrawnEvents, "node:goal-finished")
				}
				if change == "event" {
					p.State.Phase, p.State.PendingEventID = "event", "crate_event"
				}
				return domain.CommandResponse{State: p.State}, nil
			})
			close(release)
			if err != nil {
				t.Fatal(err)
			}
			got := <-finished
			if change == "movement" {
				if got.err != nil || got.response.Source != "model" {
					t.Fatalf("movement invalidated hint: %+v %v", got.response, got.err)
				}
			} else {
				advisorFault(t, got.err, 409)
				if got.response.Text != "" {
					t.Fatal("late completed-goal hint escaped")
				}
			}
		})
	}
}
