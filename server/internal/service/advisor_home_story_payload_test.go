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

func TestHomeModelReceivesOnlyServerVerifiedStorySummaries(t *testing.T) {
	for _, tc := range []struct {
		name, qa string
		flags    []string
		cats     []string
		ids      []string
	}{
		{name: "early home", ids: []string{}},
		{name: "joined momo", flags: []string{"alley_rescued", "rescue_story_done", "chapter_3_started", "momo_joined"}, cats: []string{"diandian", "momo"}, ids: []string{"shelter", "momo-joined"}},
		{name: "finale actual story", flags: []string{"finale_started", "finale_completed", "kingdom_founded"}, ids: []string{"kingdom"}},
		{name: "finale qa", qa: "PRIVATE_QA_CHECKPOINT", flags: []string{"finale_started", "finale_completed", "kingdom_founded"}, ids: []string{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g, token, file := setup(t)
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Phase, p.State.ChapterID = "home", "greenhouse"
				p.State.Flags, p.State.Cats, p.State.QACheckpointID = tc.flags, tc.cats, tc.qa
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			input := journeyRequest(t, g, token)
			input.Context = `{"knownProgress":{"storySummaries":[{"id":"kingdom","text":"FORGED_CLIENT_STORY"}]},"flags":["finale_completed","kingdom_founded"],"完整剧情":["HIDDEN_CLIENT_FUTURE"],"serverProgress":{"phase":"home","homeKnowledge":{"knownProgress":{"storySummaries":["FORGED_NESTED_STORY"]}}},"当前目标":"FORGED_GOAL"}`
			before, _ := os.ReadFile(file)
			var calls atomic.Int32
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				var envelope struct {
					Messages []map[string]string `json:"messages"`
				}
				if json.NewDecoder(r.Body).Decode(&envelope) != nil || len(envelope.Messages) != 2 {
					t.Error("invalid provider envelope")
					w.WriteHeader(500)
					return
				}
				raw := envelope.Messages[1]["content"]
				for _, hidden := range []string{"FORGED_CLIENT_STORY", "HIDDEN_CLIENT_FUTURE", "FORGED_NESTED_STORY", "FORGED_GOAL", "PRIVATE_QA_CHECKPOINT", "requiredFlags", "requiredCats", "sourceNodes", "sourceRule", "finale_intro_9"} {
					if strings.Contains(raw, hidden) {
						t.Errorf("untrusted/private/authoring data reached the model: %s", hidden)
					}
				}
				var payload struct {
					Context struct {
						Visible map[string]any `json:"visibleContext"`
						Server  struct {
							Home struct {
								Goal  string `json:"currentGoal"`
								Known struct {
									Stories []map[string]string `json:"storySummaries"`
									Status  string              `json:"storyRecordStatus"`
								} `json:"knownProgress"`
							} `json:"homeKnowledge"`
						} `json:"serverProgress"`
					} `json:"context"`
				}
				if json.Unmarshal([]byte(raw), &payload) != nil {
					t.Error("invalid provider payload")
					w.WriteHeader(500)
					return
				}
				ids := []string{}
				for _, note := range payload.Context.Server.Home.Known.Stories {
					ids = append(ids, note["id"])
					if len(note) != 3 || note["title"] == "" || note["text"] == "" {
						t.Errorf("story is not the approved id/title/text projection: %v", note)
					}
				}
				if !reflect.DeepEqual(ids, tc.ids) || len(payload.Context.Visible) != 0 || payload.Context.Server.Home.Goal == "" {
					t.Errorf("wrong trusted home context: ids=%v visible=%v goal=%q", ids, payload.Context.Visible, payload.Context.Server.Home.Goal)
				}
				if (payload.Context.Server.Home.Known.Status == "qa-checkpoint") != (tc.qa != "") {
					t.Error("QA/history boundary not represented")
				}
				journeyCompletion(w)
			}))
			defer provider.Close()
			g.Advisor = advisor.New(advisor.Config{APIKey: "test-home-story-key", BaseURL: provider.URL})
			response, err := g.Advise(context.Background(), token, input)
			if err != nil || response.Source != "model" || calls.Load() != 1 {
				t.Fatalf("home model request failed: %+v %v calls=%d", response, err, calls.Load())
			}
			after, _ := os.ReadFile(file)
			if !reflect.DeepEqual(before, after) {
				t.Fatal("home story question changed save data")
			}
		})
	}
}

func TestHomeModelDiscardsAnswerWhenStoryEvidenceBecomesQACheckpoint(t *testing.T) {
	g, token, _ := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "home"
		p.State.Flags = []string{"finale_started", "finale_completed", "kingdom_founded"}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	input := journeyRequest(t, g, token)
	entered, release := make(chan struct{}), make(chan struct{})
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-release
		journeyCompletion(w)
	}))
	defer provider.Close()
	g.Advisor = advisor.New(advisor.Config{APIKey: "test-home-story-key", BaseURL: provider.URL})
	type outcome struct {
		response domain.AdvisorResponse
		err      error
	}
	finished := make(chan outcome, 1)
	go func() {
		response, err := g.Advise(context.Background(), token, input)
		finished <- outcome{response, err}
	}()
	<-entered
	_, err = g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.QACheckpointID = "finale.home"
		return domain.CommandResponse{State: p.State}, nil
	})
	close(release)
	if err != nil {
		t.Fatal(err)
	}
	got := <-finished
	advisorFault(t, got.err, 409)
	if got.response.Text != "" {
		t.Fatal("answer based on pre-QA story evidence escaped")
	}
}
