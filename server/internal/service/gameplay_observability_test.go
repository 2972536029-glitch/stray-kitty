package service_test

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/obs"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
)

// Capture the real public obs API, including the client's aggregation/flush.
// No package globals or production test hooks are replaced.
func captureGameplayMetrics(t *testing.T, run func()) string {
	t.Helper()
	conn, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	t.Setenv("DD_DOGSTATSD_PORT_8125_ADDR", conn.LocalAddr().String())
	t.Setenv("DD_TRACE_ENABLED", "false")
	t.Setenv("DD_INSTRUMENTATION_TELEMETRY_ENABLED", "false")
	t.Setenv("DD_REMOTE_CONFIGURATION_ENABLED", "false")
	obs.Init("kitty-api")
	t.Cleanup(obs.Shutdown)
	run()
	obs.Shutdown()
	if err := conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	var output strings.Builder
	buffer := make([]byte, 65535)
	for {
		n, _, err := conn.ReadFrom(buffer)
		if timeout, ok := err.(net.Error); ok && timeout.Timeout() {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		output.Write(buffer[:n])
		output.WriteByte('\n')
	}
	return output.String()
}

func gameplayMetricCount(t *testing.T, output, metric string, tags ...string) int {
	t.Helper()
	total := 0
	for _, line := range strings.Split(output, "\n") {
		if !strings.HasPrefix(line, metric+":") {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) < 2 || parts[1] != "c" {
			t.Fatalf("expected count metric: %s", line)
		}
		present := map[string]bool{}
		for _, part := range parts[2:] {
			if strings.HasPrefix(part, "#") {
				for _, tag := range strings.Split(strings.TrimPrefix(part, "#"), ",") {
					present[tag] = true
				}
			}
		}
		matches := true
		for _, tag := range tags {
			matches = matches && present[tag]
		}
		if matches {
			count, err := strconv.Atoi(strings.TrimPrefix(parts[0], metric+":"))
			if err != nil {
				t.Fatal(err)
			}
			total += count
		}
	}
	return total
}

func setObservedState(t *testing.T, game *service.Game, token string, edit func(*domain.GameState)) {
	t.Helper()
	_, err := game.Store.Transact(service.Hash(token), func(player *repository.Player) (domain.CommandResponse, error) {
		edit(&player.State)
		return domain.CommandResponse{State: player.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestGameplayObservationsPersistOnceAndBoundChoiceTags(t *testing.T) {
	output := captureGameplayMetrics(t, func() {
		g, token, path := setup(t)
		setObservedState(t, g, token, func(state *domain.GameState) { state.StoryNodeID = "prologue_sneak" })
		state, _ := g.State(token)
		request := domain.CommandRequest{ExpectedRevision: &state.Revision, Command: domain.Command{Type: "ADVANCE_STORY", NodeID: "prologue_sneak", OptionID: "injected-player-123"}}
		if _, err := g.Execute(token, "invalid-choice-1", request); domain.FaultCode(err) != "INVALID_COMMAND" {
			t.Fatalf("unexpected invalid choice: %v", err)
		}
		request.Command.OptionID = "honest"
		// Block the atomic rename after apply has succeeded, then retry after
		// repair. Failed persistence must not emit success/choice/flag metrics.
		if err := os.Rename(path, path+".backup"); err != nil {
			t.Fatal(err)
		}
		if err := os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
		if _, err := g.Execute(token, "choice-once-123", request); err == nil {
			t.Fatal("expected persistence failure")
		}
		after, _ := g.State(token)
		if after.Revision != state.Revision || after.StoryNodeID != state.StoryNodeID {
			t.Fatal("failed persistence changed the state")
		}
		if err := os.Remove(path); err != nil {
			t.Fatal(err)
		}
		if err := os.Rename(path+".backup", path); err != nil {
			t.Fatal(err)
		}
		first, err := g.Execute(token, "choice-once-123", request)
		if err != nil || first.Replayed {
			t.Fatalf("first success: %+v %v", first, err)
		}
		second, err := g.Execute(token, "choice-once-123", request)
		if err != nil || !second.Replayed {
			t.Fatalf("replay: %+v %v", second, err)
		}
	})
	if count := gameplayMetricCount(t, output, "kitty.story.choice", "node:prologue_sneak", "option:honest", "qa:false"); count != 1 {
		t.Fatalf("choice count=%d, metrics:\n%s", count, output)
	}
	if count := gameplayMetricCount(t, output, "kitty.story.node"); count != 2 {
		t.Fatalf("expected session entry + one committed node, got %d\n%s", count, output)
	}
	if strings.Contains(output, "injected-player-123") || strings.Contains(output, "player_id:") || strings.Contains(output, "session_id:") {
		t.Fatalf("unbounded tags escaped: %s", output)
	}
}

func TestGameplayObservationsIncludeAutomaticTutorialRetryAndQA(t *testing.T) {
	output := captureGameplayMetrics(t, func() {
		g, token, _ := setup(t)
		g.QAVictoryEnabled = true
		state, _ := g.State(token)
		for state.Phase == "dialogue" {
			state = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: state.StoryNodeID})
		}
		state = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: state.ActiveBattle.ID, Outcome: "lost"})
		state = execute(t, g, token, domain.Command{Type: "CONTINUE"})
		request := domain.CommandRequest{ExpectedRevision: &state.Revision, Command: domain.Command{Type: "QA_SIMULATE_VICTORY", AttemptID: state.ActiveBattle.ID}}
		for i := 0; i < 2; i++ {
			if _, err := g.Execute(token, "qa-victory-once", request); err != nil {
				t.Fatal(err)
			}
		}
		execute(t, g, token, domain.Command{Type: "CONTINUE"})
	})
	checks := []struct {
		metric string
		tags   []string
		want   int
	}{
		{"kitty.battle.start", []string{"chapter:L00", "difficulty:medium", "qa:false"}, 2},
		{"kitty.battle.settle", []string{"chapter:L00", "outcome:lose", "qa:false"}, 1},
		{"kitty.battle.settle", []string{"chapter:L00", "outcome:win", "qa:true"}, 1},
		{"kitty.battle.return_check", []string{"map:alley", "result:ok", "qa:true"}, 1},
		{"kitty.battle.return_check", []string{"qa:false"}, 0},
		{"kitty.event.flag", []string{"flag:l00_completed", "qa:true"}, 1},
	}
	for _, check := range checks {
		if count := gameplayMetricCount(t, output, check.metric, check.tags...); count != check.want {
			t.Errorf("%s %v count=%d want=%d\n%s", check.metric, check.tags, count, check.want, output)
		}
	}
}

func TestGameplayEventResolutionAndClueGate(t *testing.T) {
	output := captureGameplayMetrics(t, func() {
		g, token, _ := setup(t)
		g.Catalog.Events = append(g.Catalog.Events, domain.Event{ID: "observed_event", Options: []domain.EventOption{{ID: "help", Outcomes: map[string]domain.EventOutcome{
			"fail": {Text: "A little clue", Flags: []string{"observed_flag", "observed_flag"}},
		}}}})
		setObservedState(t, g, token, func(state *domain.GameState) {
			state.Phase, state.PendingEventID, state.PendingEventSource = "event", "observed_event", "random"
		})
		state, _ := g.State(token)
		request := domain.CommandRequest{ExpectedRevision: &state.Revision, Command: domain.Command{Type: "CHOOSE_EVENT", EventID: "observed_event", OptionID: "help"}}
		for i := 0; i < 2; i++ {
			if _, err := g.Execute(token, "event-resolve-once", request); err != nil {
				t.Fatal(err)
			}
		}
		setObservedState(t, g, token, func(state *domain.GameState) {
			state.Phase = "home"
			state.Flags = append(state.Flags, "tunnel_explored", "cats_rescued_batch1")
			state.Inventory["clue"] = 2
		})
		state, _ = g.State(token)
		gateRequest := domain.CommandRequest{ExpectedRevision: &state.Revision, Command: domain.Command{Type: "START_STORY", NodeID: "finale_intro_1"}}
		if _, err := g.Execute(token, "clue-gate-blocked", gateRequest); domain.FaultCode(err) != "STORY_LOCKED" {
			t.Fatalf("gate result: %v", err)
		}
		setObservedState(t, g, token, func(state *domain.GameState) { state.Inventory["clue"] = 3 })
		if _, err := g.Execute(token, "clue-gate-passed", gateRequest); err != nil {
			t.Fatal(err)
		}
	})
	for _, check := range []struct {
		metric string
		tags   []string
	}{
		{"kitty.event.resolve", []string{"event:observed_event", "option:help", "tier:fail"}},
		{"kitty.event.flag", []string{"flag:observed_flag"}},
		{"kitty.story.gate_hit", []string{"gate:finale_clue_insufficient"}},
	} {
		if count := gameplayMetricCount(t, output, check.metric, check.tags...); count != 1 {
			t.Errorf("%s %v = %d, expected 1\n%s", check.metric, check.tags, count, output)
		}
	}
}

func TestGameplayChoiceCompatibility(t *testing.T) {
	for i, option := range []string{"", "proud", "honest"} {
		t.Run(fmt.Sprintf("option_%d", i), func(t *testing.T) {
			g, token, _ := setup(t)
			setObservedState(t, g, token, func(state *domain.GameState) { state.StoryNodeID = "prologue_banter" })
			execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: "prologue_banter", OptionID: option})
		})
	}
}

func TestGameplayReturnCheckDetectsWrongMapAfterContinue(t *testing.T) {
	output := captureGameplayMetrics(t, func() {
		g, token, _ := setup(t)
		setObservedState(t, g, token, func(state *domain.GameState) {
			state.Phase, state.StoryNodeID, state.MapID = "battle", "", "greenhouse"
			state.ActiveBattle = &domain.Attempt{ID: "misrouted-rescue", StageID: "alley_rescue", Status: "active"}
		})
		state := execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: "misrouted-rescue", Outcome: "won", Report: bossReport(0, true)})
		// An incorrect saved region survives settlement and the rescue-dialogue
		// transition. Comparing only before/after settlement would report ok.
		if state.Phase != "settlement" || state.MapID != "greenhouse" {
			t.Fatal("fixture did not reach a misrouted settlement")
		}
		request := domain.CommandRequest{ExpectedRevision: &state.Revision, Command: domain.Command{Type: "CONTINUE"}}
		for i := 0; i < 2; i++ {
			if _, err := g.Execute(token, "return-check-once", request); err != nil {
				t.Fatal(err)
			}
		}
	})
	if count := gameplayMetricCount(t, output, "kitty.battle.return_check", "map:alley", "result:deviation"); count != 1 {
		t.Fatalf("expected one region deviation, got %d\n%s", count, output)
	}
	if count := gameplayMetricCount(t, output, "kitty.battle.return_check"); count != 1 {
		t.Fatalf("settlement or replay emitted an extra return: %d\n%s", count, output)
	}
}

func TestGameplayReturnChecksActualMainlineAndTrialDestinations(t *testing.T) {
	for _, tc := range []struct {
		stage, origin, target string
		mainline              bool
	}{
		{"alley_boss", "alley", "greenhouse", false},
		{"market_boss", "greenhouse", "greenhouse", false},
		{"greenhouse_boss", "greenhouse", "greenhouse", false},
		{"tunnel_boss", "greenhouse", "greenhouse", false},
		{"finale_boss", "greenhouse", "greenhouse", false},
		{"market_boss", "market", "market", true},
		{"tunnel_boss", "tunnel", "tunnel", true},
		{"finale_boss", "warehouse", "warehouse", true},
	} {
		t.Run(tc.stage+"_"+tc.origin, func(t *testing.T) {
			output := captureGameplayMetrics(t, func() {
				g, token, _ := prepareBoss(t, 0, nil)
				setObservedState(t, g, token, func(state *domain.GameState) {
					state.MapID = tc.origin
					if tc.mainline || tc.origin == "alley" {
						state.Phase = "explore"
					}
					if tc.stage == "finale_boss" && tc.mainline {
						state.Phase = "preparation"
					}
					state.Flags = append(state.Flags, "market_crow_clue_completed", "market_pigeon_clue_completed", "chapter_4_started", "tunnel_false_kitten_trap_found", "valve_three_investigated", "tunnel_explored", "cats_rescued_batch1")
					state.Inventory["clue"] = 3
				})
				start := domain.Command{Type: "START_BATTLE", StageID: tc.stage}
				if tc.mainline && tc.stage == "market_boss" {
					start.Layer, start.ReturnPosition = "L0", &domain.WorldPoint{X: 1310, Y: 169}
				}
				if tc.mainline && tc.stage == "tunnel_boss" {
					start.ReturnPosition = &domain.WorldPoint{X: 1500, Y: 750}
				}
				state := execute(t, g, token, start)
				if state.ActiveBattle.Mainline != tc.mainline {
					t.Fatal("test entered the wrong battle mode")
				}
				report := bossReport(0, true)
				elites := 2
				if tc.stage == "finale_boss" {
					report.ElitesDefeated = &elites
				}
				execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: state.ActiveBattle.ID, Outcome: "won", Report: report})
				state = execute(t, g, token, domain.Command{Type: "CONTINUE"})
				if state.MapID != tc.target {
					t.Fatalf("wrong final map: %s", state.MapID)
				}
			})
			if count := gameplayMetricCount(t, output, "kitty.battle.return_check", "map:"+tc.target, "result:ok", "qa:false"); count != 1 {
				t.Fatalf("expected exactly one actual return, got %d\n%s", count, output)
			}
			if count := gameplayMetricCount(t, output, "kitty.battle.return_check"); count != 1 {
				t.Fatalf("unexpected extra return metrics: %d\n%s", count, output)
			}
		})
	}
}

func TestGameplayLostBattleCountsExplicitDepartureNotRetryPreparation(t *testing.T) {
	output := captureGameplayMetrics(t, func() {
		g, token, _ := prepareBoss(t, 0, nil)
		state := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "market_boss"})
		execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: state.ActiveBattle.ID, Outcome: "lost", Report: bossReport(3, false)})
		state = execute(t, g, token, domain.Command{Type: "CONTINUE"})
		if state.Phase != "preparation" || state.ActiveBattle == nil {
			t.Fatal("loss did not preserve retry preparation")
		}
		execute(t, g, token, domain.Command{Type: "GO_HOME"})
	})
	if count := gameplayMetricCount(t, output, "kitty.battle.return_check", "map:greenhouse", "result:ok"); count != 1 {
		t.Fatalf("expected one explicit departure, got %d\n%s", count, output)
	}
	if count := gameplayMetricCount(t, output, "kitty.battle.return_check"); count != 1 {
		t.Fatalf("retry preparation was incorrectly counted as return: %d\n%s", count, output)
	}
}

func TestGameplayRescueReturnChecksAfterSettlement(t *testing.T) {
	g, token, _ := setup(t)
	state := toBattle(t, g, token)
	output := captureGameplayMetrics(t, func() {
		execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: state.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
		state = execute(t, g, token, domain.Command{Type: "CONTINUE"})
		if state.MapID != "alley" || state.Phase != "dialogue" || state.StoryNodeID != "rescue_1" {
			t.Fatalf("rescue returned incorrectly: %+v", state)
		}
	})
	if count := gameplayMetricCount(t, output, "kitty.battle.return_check", "map:alley", "result:ok"); count != 1 {
		t.Fatalf("expected one rescue return after continuation, got %d\n%s", count, output)
	}
}

func TestGameplayQARestorePreservesOriginalAttemptClassification(t *testing.T) {
	g, token, _ := setup(t)
	g.QAVictoryEnabled = true
	state := toBattle(t, g, token)
	originalID := state.ActiveBattle.ID
	state = execute(t, g, token, domain.Command{Type: "QA_CHECKPOINT", CheckpointID: "prologue.battle"})
	if state.ActiveBattle == nil || !state.ActiveBattle.QA {
		t.Fatal("synthetic checkpoint attempt is not marked QA")
	}
	state = execute(t, g, token, domain.Command{Type: "QA_RESTORE"})
	if state.ActiveBattle == nil || state.ActiveBattle.ID != originalID || state.ActiveBattle.QA {
		t.Fatal("restoring normal gameplay inherited synthetic classification")
	}
}
