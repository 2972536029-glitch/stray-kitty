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

func journeyRequest(t *testing.T, g *service.Game, token string) domain.AdvisorRequest {
	t.Helper()
	s, err := g.State(token)
	if err != nil {
		t.Fatal(err)
	}
	attempt := ""
	if s.ActiveBattle != nil {
		attempt = s.ActiveBattle.ID
	}
	key, _ := json.Marshal([]string{s.Phase, s.ChapterID, s.MapID, s.StoryNodeID, s.PendingEventID, attempt})
	return domain.AdvisorRequest{Scope: "journey", SceneKey: string(key), ExpectedRevision: &s.Revision, Question: "现在我可以做什么？", Context: `{"visibleLabel":"眼前的路灯"}`}
}

func journeyCompletion(w http.ResponseWriter) {
	json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]string{"role": "assistant", "content": `{"title":"看看眼前","text":"可以先查看眼前已经显示的交互。"}`}}}})
}

func TestJourneyAdvisorSelectsVisibleCatalogFactsWithoutMutatingSave(t *testing.T) {
	for _, phase := range []string{"dialogue", "explore", "event", "preparation", "battle", "settlement", "home"} {
		t.Run(phase, func(t *testing.T) {
			g, token, file := setup(t)
			g.Catalog.Story = []domain.StoryNode{{ID: "prologue_1", Next: "hidden-next"}, {ID: "future-node"}}
			g.Catalog.Events = []domain.Event{{ID: "crate_event", Title: "眼前的相遇", Options: []domain.EventOption{{ID: "search", Outcomes: map[string]domain.EventOutcome{"crit": {Text: "UNROLLED_RESULT"}}}, {ID: "secret", RequireCat: "unowned"}}}, {ID: "future-event", Title: "UNDRAWN_EVENT"}}
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Phase, p.State.StoryNodeID = phase, "prologue_1"
				p.State.PendingEventID = ""
				if phase == "event" {
					p.State.PendingEventID = "crate_event"
				}
				p.State.Txns = []domain.Txn{{ID: "PRIVATE_TRANSACTION", CardSuffix: "PRIVATE_CARD"}}
				p.State.QACheckpointID = "PRIVATE_QA_CHECKPOINT"
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			input := journeyRequest(t, g, token)
			before, _ := g.Store.Get(service.Hash(token))
			diskBefore, _ := os.ReadFile(file)
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					Messages []map[string]string `json:"messages"`
				}
				if json.NewDecoder(r.Body).Decode(&request) != nil || len(request.Messages) != 2 {
					t.Error("invalid provider request")
					w.WriteHeader(500)
					return
				}
				content := request.Messages[1]["content"]
				for _, hidden := range []string{"hidden-next", "future-node", "UNROLLED_RESULT", "secret", "UNDRAWN_EVENT", "PRIVATE_TRANSACTION", "PRIVATE_CARD", "PRIVATE_QA_CHECKPOINT", token} {
					if strings.Contains(content, hidden) {
						t.Errorf("hidden/private data entered model context: %s", hidden)
					}
				}
				var payload struct {
					Scope   string `json:"scope"`
					Context struct {
						Progress map[string]any `json:"serverProgress"`
						Visible  map[string]any `json:"visibleContext"`
					} `json:"context"`
				}
				if json.Unmarshal([]byte(content), &payload) != nil || payload.Scope != "journey" || payload.Context.Progress["phase"] != phase || payload.Context.Visible["visibleLabel"] != "眼前的路灯" {
					t.Error("server progress and visible client information were not separated")
				}
				_, hasStory := payload.Context.Progress["currentStory"]
				_, hasEvent := payload.Context.Progress["currentEvent"]
				if hasStory != (phase == "dialogue") || hasEvent != (phase == "event") {
					t.Error("story/event from another phase leaked into current context")
				}
				if hasStory && payload.Context.Progress["currentStory"].(map[string]any)["text"] == "" {
					t.Error("current story text was not read from the display catalog")
				}
				if hasEvent {
					event := payload.Context.Progress["currentEvent"].(map[string]any)
					options := event["options"].([]any)
					if event["text"] == "" || len(options) != 1 || options[0].(map[string]any)["label"] == "" {
						t.Error("current event display text or visible option filter was lost")
					}
				}
				if !strings.Contains(request.Messages[0]["content"], "serverProgress") {
					t.Error("journey scope still used the battle-only prompt")
				}
				journeyCompletion(w)
			}))
			defer provider.Close()
			g.Advisor = advisor.New(advisor.Config{APIKey: "test-journey-key", BaseURL: provider.URL})
			response, err := g.Advise(context.Background(), token, input)
			if err != nil || response.Source != "model" {
				t.Fatalf("journey advice failed: %+v %v", response, err)
			}
			after, _ := g.Store.Get(service.Hash(token))
			diskAfter, _ := os.ReadFile(file)
			if !reflect.DeepEqual(before, after) || string(diskBefore) != string(diskAfter) {
				t.Fatal("journey question changed the saved game")
			}
		})
	}
}

func TestJourneyAdvisorRejectsMissingOrStaleSceneBeforeProvider(t *testing.T) {
	g, token, _ := setup(t)
	input := journeyRequest(t, g, token)
	var calls atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); journeyCompletion(w) }))
	defer provider.Close()
	g.Advisor = advisor.New(advisor.Config{APIKey: "test-journey-key", BaseURL: provider.URL})
	for _, tc := range []struct {
		name   string
		change func(*domain.AdvisorRequest)
		status int
	}{
		{"missing scene", func(r *domain.AdvisorRequest) { r.SceneKey = "" }, 400},
		{"missing revision", func(r *domain.AdvisorRequest) { r.ExpectedRevision = nil }, 400},
		{"wrong scene", func(r *domain.AdvisorRequest) { r.SceneKey = "other" }, 409},
		{"wrong revision", func(r *domain.AdvisorRequest) { n := *r.ExpectedRevision + 1; r.ExpectedRevision = &n }, 409},
		{"unknown scope", func(r *domain.AdvisorRequest) { r.Scope = "everything" }, 400},
		{"mixed battle fields", func(r *domain.AdvisorRequest) { r.AttemptID = "battle" }, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := input
			tc.change(&changed)
			_, err := g.Advise(context.Background(), token, changed)
			advisorFault(t, err, tc.status)
		})
	}
	if calls.Load() != 0 {
		t.Fatal("invalid journey requests spent model budget")
	}
}

func TestJourneyAdvisorAllowsMovementButDiscardsChangedProgress(t *testing.T) {
	for _, change := range []string{"movement", "scene", "resources", "known-event", "home-repair"} {
		t.Run(change, func(t *testing.T) {
			g, token, _ := setup(t)
			input := journeyRequest(t, g, token)
			entered, release := make(chan struct{}), make(chan struct{})
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(entered); <-release; journeyCompletion(w) }))
			defer provider.Close()
			g.Advisor = advisor.New(advisor.Config{APIKey: "test-journey-key", BaseURL: provider.URL})
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
				switch change {
				case "movement":
					p.State.ExploreDistance += 50
				case "scene":
					p.State.StoryNodeID = "next-node"
				case "resources":
					p.State.Inventory["clue"]++
				case "known-event":
					p.State.Flags = append(p.State.Flags, "newly-resolved-event")
				case "home-repair":
					p.State.HomeRepairs = append(p.State.HomeRepairs, "newly-repaired-window")
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
					t.Fatalf("harmless movement discarded answer: %+v %v", got.response, got.err)
				}
			} else {
				advisorFault(t, got.err, 409)
				if got.response.Text != "" {
					t.Fatal("stale journey answer escaped")
				}
			}
		})
	}
}

func TestJourneyAdvisorUsesCurrentHomePartsAndRealPrerequisites(t *testing.T) {
	g, token, _ := setup(t)
	g.Catalog.Renovations = []domain.Renovation{
		{ID: "current", Name: "当前修补", Stage: 2, GrantsFlag: "current-done", Cost: map[string]int{"material": 99}, Parts: []domain.HomeRepairPart{
			{ID: "window", Name: "窗户", Cost: map[string]int{"material": 2}},
			{ID: "roof", Name: "屋顶", Cost: map[string]int{"material": 3}, Requires: []string{"window"}},
			{ID: "shelf", Name: "架子", Cost: map[string]int{"material": 8}, Requires: []string{"roof"}},
		}},
		{ID: "later", Name: "UNREVEALED_RENOVATION", Stage: 3, RequiredFlag: "current-done", GrantsFlag: "later-done", Cost: map[string]int{"material": 100}},
	}
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "home"
		p.State.HomeRepairs = []string{"window"}
		p.State.Inventory["material"] = 4
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Messages []map[string]string `json:"messages"`
		}
		if json.NewDecoder(r.Body).Decode(&request) != nil || len(request.Messages) != 2 {
			t.Error("invalid provider request")
			w.WriteHeader(500)
			return
		}
		var payload struct {
			Context struct {
				Progress struct {
					Home struct {
						Name  string         `json:"name"`
						Cost  map[string]int `json:"cost"`
						Parts []struct {
							ID         string `json:"id"`
							Completed  bool   `json:"completed"`
							Unlocked   bool   `json:"unlocked"`
							Affordable bool   `json:"affordable"`
						} `json:"parts"`
					} `json:"currentHomeRenovation"`
				} `json:"serverProgress"`
			} `json:"context"`
		}
		content := request.Messages[1]["content"]
		if json.Unmarshal([]byte(content), &payload) != nil {
			t.Error("invalid journey payload")
		}
		home := payload.Context.Progress.Home
		if home.Name != "当前修补" || home.Cost != nil || len(home.Parts) != 3 {
			t.Error("part-based home used old whole-stage cost or lost current parts")
		} else {
			if !home.Parts[0].Completed || !home.Parts[1].Unlocked || !home.Parts[1].Affordable || home.Parts[2].Unlocked || home.Parts[2].Affordable {
				t.Error("home part prerequisites or actual resources misrepresented")
			}
		}
		if strings.Contains(content, "UNREVEALED_RENOVATION") {
			t.Error("future home project leaked")
		}
		journeyCompletion(w)
	}))
	defer provider.Close()
	g.Advisor = advisor.New(advisor.Config{APIKey: "test-journey-key", BaseURL: provider.URL})
	response, err := g.Advise(context.Background(), token, journeyRequest(t, g, token))
	if err != nil || response.Source != "model" {
		t.Fatalf("home advice failed: %+v %v", response, err)
	}
}
