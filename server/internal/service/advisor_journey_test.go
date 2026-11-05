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
				if json.Unmarshal([]byte(content), &payload) != nil || payload.Scope != "journey" || payload.Context.Progress["phase"] != phase {
					t.Error("server progress and visible client information were not separated")
				}
				if phase == "home" {
					if len(payload.Context.Visible) != 0 {
						t.Error("home must use server facts instead of duplicate client context")
					}
				} else if payload.Context.Visible["visibleLabel"] != "眼前的路灯" {
					t.Error("legacy non-home current observation was lost")
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

// Capture the actual provider payload, so these checks cover the service's
// whitelist and plan generation rather than a duplicate test implementation.
func captureJourneyProgress(t *testing.T, g *service.Game, token string) map[string]json.RawMessage {
	t.Helper()
	observed := make(chan map[string]json.RawMessage, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Messages []map[string]string `json:"messages"`
		}
		if json.NewDecoder(r.Body).Decode(&request) != nil || len(request.Messages) != 2 {
			t.Error("invalid provider envelope")
			w.WriteHeader(500)
			return
		}
		var payload struct {
			Context struct {
				Progress map[string]json.RawMessage `json:"serverProgress"`
			} `json:"context"`
		}
		if json.Unmarshal([]byte(request.Messages[1]["content"]), &payload) != nil {
			t.Error("invalid provider payload")
			w.WriteHeader(500)
			return
		}
		observed <- payload.Context.Progress
		journeyCompletion(w)
	}))
	defer provider.Close()
	g.Advisor = advisor.New(advisor.Config{APIKey: "test-journey-key", BaseURL: provider.URL})
	response, err := g.Advise(context.Background(), token, journeyRequest(t, g, token))
	if err != nil || response.Source != "model" {
		t.Fatalf("cannot inspect journey payload: %+v %v", response, err)
	}
	select {
	case progress := <-observed:
		return progress
	default:
		t.Fatal("provider was not called")
		return nil
	}
}

type journeyRepairPlan struct {
	Calculable bool   `json:"calculable"`
	Reason     string `json:"reason"`
	Parts      []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"parts"`
	Cost      map[string]int `json:"cost"`
	Available map[string]int `json:"available"`
	Missing   map[string]int `json:"missing"`
}

func captureJourneyRepairPlans(t *testing.T, g *service.Game, token string) (journeyRepairPlan, map[string]journeyRepairPlan) {
	t.Helper()
	progress := captureJourneyProgress(t, g, token)
	var home struct {
		RemainingPlan journeyRepairPlan `json:"remainingPlan"`
		Parts         []struct {
			ID   string            `json:"id"`
			Plan journeyRepairPlan `json:"remainingPlan"`
		} `json:"parts"`
	}
	if json.Unmarshal(progress["currentHomeRenovation"], &home) != nil {
		t.Fatal("missing current home plan")
	}
	plans := map[string]journeyRepairPlan{}
	for _, part := range home.Parts {
		plans[part.ID] = part.Plan
	}
	return home.RemainingPlan, plans
}

func TestJourneyAdvisorNamesResourcesAndSeparatesKnownCompanionsFromBattleRoster(t *testing.T) {
	g, token, _ := setup(t)
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "preparation"
		p.State.Cats = []string{"miaomiao", "tuanzi", "diandian"}
		p.State.Inventory["food"], p.State.Currencies["tuna"] = 1, 0
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	progress := captureJourneyProgress(t, g, token)
	var names, roles map[string]string
	var resources map[string]int
	var companions []string
	var meaning string
	if json.Unmarshal(progress["resourceNames"], &names) != nil || json.Unmarshal(progress["resources"], &resources) != nil || names["food"] != "鱼干" || names["tuna"] != "金枪鱼罐头" || names["stamp"] != "猫爪邮票" || resources["food"] != 1 || resources["tuna"] != 0 {
		t.Fatal("resource balances lost their authoritative Chinese names")
	}
	if json.Unmarshal(progress["knownCompanionIds"], &companions) != nil || len(companions) != 3 || json.Unmarshal(progress["companionListMeaning"], &meaning) != nil || !strings.Contains(meaning, "不是本场出战名单") {
		t.Fatal("known companion list still masquerades as battle roster")
	}
	if json.Unmarshal(progress["fixedCharacterRoles"], &roles) != nil || !strings.Contains(roles["喵喵"], "不参战") || !strings.Contains(roles["阿策"], "不参战") {
		t.Fatal("noncombat character roles were lost outside battle")
	}
	if _, ambiguous := progress["cats"]; ambiguous {
		t.Fatal("ambiguous cats field must not compete with the known companion definition")
	}
}

func TestJourneyAdvisorMarksMarketReturnHomeAsForbiddenEvenOnRevisit(t *testing.T) {
	for _, phase := range []string{"explore", "preparation"} {
		t.Run(phase, func(t *testing.T) {
			g, token, _ := setup(t)
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Phase, p.State.MapID, p.State.ChapterID = phase, "market", "rescue"
				p.State.Flags = []string{"market_cleared", "market_exit_crossed", "chapter_4_started"}
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			progress := captureJourneyProgress(t, g, token)
			var rules struct {
				CanReturn   *bool  `json:"canReturnHomeDirectly"`
				Cleared     bool   `json:"marketDefenseCompleted"`
				Explanation string `json:"explanation"`
			}
			if json.Unmarshal(progress["navigationRules"], &rules) != nil || rules.CanReturn == nil || *rules.CanReturn || !rules.Cleared || !strings.Contains(rules.Explanation, "北侧") {
				t.Fatal("revisited market lost the explicit no-direct-home rule")
			}
		})
	}
}

func TestJourneyAdvisorRealDryBeddingPlanDeductsCurrentStockOnlyOnce(t *testing.T) {
	for _, tc := range []struct {
		name          string
		completed     []string
		cost, missing int
		parts         int
	}{
		{"all prerequisites pending", nil, 10, 9, 3},
		{"window already repaired", []string{"patch_windows"}, 6, 5, 2},
		{"both prerequisites repaired", []string{"patch_windows", "stop_roof_leaks"}, 2, 1, 1},
		{"already completed", []string{"patch_windows", "stop_roof_leaks", "dry_bedding"}, 0, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g, token, _ := setup(t)
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Phase = "home"
				p.State.HomeRepairs = tc.completed
				p.State.Inventory["material"] = 1
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			project, plans := captureJourneyRepairPlans(t, g, token)
			plan, found := plans["dry_bedding"]
			if !found || !plan.Calculable || plan.Cost["material"] != tc.cost || plan.Missing["material"] != tc.missing || len(plan.Parts) != tc.parts {
				t.Fatalf("wrong real-catalog prerequisite budget: %+v", plan)
			}
			if tc.parts > 0 && plan.Available["material"] != 1 {
				t.Fatal("current material balance was not preserved")
			}
			if !project.Calculable || project.Cost["material"] != tc.cost || project.Missing["material"] != tc.missing {
				t.Fatalf("whole current project budget disagrees: %+v", project)
			}
		})
	}
}

func TestJourneyAdvisorRepairPlanDeduplicatesSharedPrerequisitesAndKeepsWalletsSeparate(t *testing.T) {
	g, token, _ := setup(t)
	g.Catalog.Renovations = []domain.Renovation{{ID: "shared", Stage: 2, Parts: []domain.HomeRepairPart{
		{ID: "foundation", Cost: map[string]int{"material": 4, "stamp": 2}},
		{ID: "roof", Requires: []string{"foundation"}, Cost: map[string]int{"material": 3, "tuna": 2}},
		{ID: "window", Requires: []string{"foundation"}, Cost: map[string]int{"material": 2}},
		{ID: "finish", Requires: []string{"roof", "window"}, Cost: map[string]int{"material": 1, "stamp": 1}},
	}}}
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Phase = "home"
		p.State.Inventory["material"], p.State.Inventory["stamp"], p.State.Inventory["tuna"] = 1, 999, 999
		p.State.Currencies["stamp"], p.State.Currencies["tuna"] = 1, 5
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	project, plans := captureJourneyRepairPlans(t, g, token)
	for _, plan := range []journeyRepairPlan{project, plans["finish"]} {
		if !plan.Calculable || !reflect.DeepEqual(plan.Cost, map[string]int{"material": 10, "stamp": 3, "tuna": 2}) || !reflect.DeepEqual(plan.Available, map[string]int{"material": 1, "stamp": 1, "tuna": 5}) || !reflect.DeepEqual(plan.Missing, map[string]int{"material": 9, "stamp": 2, "tuna": 0}) {
			t.Fatalf("shared dependencies or wallets were counted incorrectly: %+v", plan)
		}
		if len(plan.Parts) != 4 || plan.Parts[0].ID != "foundation" || plan.Parts[3].ID != "finish" {
			t.Fatal("plan should contain each prerequisite once in dependency order")
		}
	}
}

func TestJourneyAdvisorIncompleteRepairGraphsNeverExposePartialTotals(t *testing.T) {
	maxInt := int(^uint(0) >> 1)
	for _, tc := range []struct {
		name   string
		parts  []domain.HomeRepairPart
		reason string
	}{
		{"missing prerequisite", []domain.HomeRepairPart{{ID: "base", Cost: map[string]int{"material": 4}}, {ID: "target", Requires: []string{"base", "missing"}, Cost: map[string]int{"material": 2}}}, "missing_dependency"},
		{"cycle", []domain.HomeRepairPart{{ID: "base", Cost: map[string]int{"material": 4}}, {ID: "target", Requires: []string{"base", "loop"}}, {ID: "loop", Requires: []string{"target"}}}, "dependency_cycle"},
		{"duplicate id", []domain.HomeRepairPart{{ID: "target"}, {ID: "target"}}, "invalid_part_graph"},
		{"negative cost", []domain.HomeRepairPart{{ID: "target", Cost: map[string]int{"material": -1}}}, "invalid_cost"},
		{"overflow cost", []domain.HomeRepairPart{{ID: "base", Cost: map[string]int{"material": maxInt}}, {ID: "target", Requires: []string{"base"}, Cost: map[string]int{"material": 1}}}, "invalid_cost"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g, token, _ := setup(t)
			g.Catalog.Renovations = []domain.Renovation{{ID: "broken", Stage: 2, Parts: tc.parts}}
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Phase = "home"
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			project, plans := captureJourneyRepairPlans(t, g, token)
			for _, plan := range []journeyRepairPlan{project, plans["target"]} {
				if plan.Calculable || plan.Reason != tc.reason || plan.Cost != nil || plan.Available != nil || plan.Missing != nil || plan.Parts != nil {
					t.Fatalf("invalid graph leaked misleading partial totals: %+v", plan)
				}
			}
		})
	}
}

func TestJourneyAdvisorEventNarrativeItemDoesNotInventInventoryCost(t *testing.T) {
	for _, tc := range []struct {
		name                string
		food, encouragement int
		usePush             bool
	}{
		{"no fish required", 0, 0, false},
		{"existing fish not spent", 1, 0, false},
		{"encouragement costs only its own token", 0, 1, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g, token, _ := setup(t)
			g.Random = func(int) (int, error) { return 0, nil }
			_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
				p.State.Phase, p.State.MapID, p.State.ChapterID = "event", "alley", "alley"
				p.State.PendingEventID, p.State.PendingEventSource = "alley_dog_friend", "node"
				p.State.Inventory["food"], p.State.PushTokens = tc.food, tc.encouragement
				return domain.CommandResponse{State: p.State}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			progress := captureJourneyProgress(t, g, token)
			var event struct {
				SelectionInventoryCost map[string]int `json:"selectionInventoryCost"`
				SelectionRules         string         `json:"selectionRules"`
				EncouragementCost      map[string]int `json:"encouragementCost"`
				Options                []struct {
					ID string `json:"id"`
				} `json:"options"`
			}
			if json.Unmarshal(progress["currentEvent"], &event) != nil || event.SelectionInventoryCost == nil || len(event.SelectionInventoryCost) != 0 || !strings.Contains(event.SelectionRules, "没有库存数量门槛") || event.EncouragementCost["pushTokens"] != 1 {
				t.Fatal("advisor did not distinguish narrative items from actual option costs")
			}
			visible := false
			for _, option := range event.Options {
				if option.ID == "lure_shadows" {
					visible = true
				}
			}
			if !visible {
				t.Fatal("zero fish hid an otherwise available event option")
			}
			state, err := g.State(token)
			if err != nil {
				t.Fatal(err)
			}
			result, err := g.Execute(token, "advisor-narrative-item-check", domain.CommandRequest{ExpectedRevision: &state.Revision, Command: domain.Command{Type: "CHOOSE_EVENT", EventID: "alley_dog_friend", OptionID: "lure_shadows", UsePush: tc.usePush}})
			if err != nil {
				t.Fatalf("real event action contradicted the advisor's inventory-cost facts: %v", err)
			}
			wantEncouragement := tc.encouragement
			if tc.usePush {
				wantEncouragement--
			}
			if result.State.Inventory["food"] != tc.food || result.State.PushTokens != wantEncouragement {
				t.Fatalf("narrative fish or encouragement cost misrepresented: food=%d push=%d", result.State.Inventory["food"], result.State.PushTokens)
			}
		})
	}
}
