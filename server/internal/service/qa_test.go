package service_test

import (
	"reflect"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
)

func TestQACheckpointsAreGatedAndEveryPublishedNodeWorks(t *testing.T) {
	g, token, _ := setup(t)
	tools, err := g.QATools(token)
	if err != nil || tools.Enabled || len(tools.Checkpoints) != 0 {
		t.Fatalf("disabled tools: %+v %v", tools, err)
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "QA_CHECKPOINT", CheckpointID: "market.story"})
	g.QAVictoryEnabled = true
	tools, err = g.QATools(token)
	if err != nil || !tools.Enabled || len(tools.Checkpoints) < 24 {
		t.Fatalf("missing tools: %+v %v", tools, err)
	}
	seen := map[string]bool{}
	for _, point := range tools.Checkpoints {
		t.Run(point.ID, func(t *testing.T) {
			if seen[point.ID] || point.Title == "" {
				t.Fatalf("duplicate or unnamed checkpoint: %+v", point)
			}
			seen[point.ID] = true
			original, _ := g.State(token)
			s := execute(t, g, token, domain.Command{Type: "QA_CHECKPOINT", CheckpointID: point.ID})
			if s.Phase != point.Phase || s.MapID != point.MapID || s.QACheckpointID != point.ID {
				t.Fatalf("wrong destination: %+v", s)
			}
			if point.Kind == "event" {
				found := false
				for _, event := range g.Catalog.Events {
					if event.ID == s.PendingEventID {
						found = true
						s = execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: event.ID, OptionID: event.Options[0].ID})
					}
				}
				if !found || s.Phase == "event" {
					t.Fatal("event cannot resolve")
				}
				if point.MapID == "warehouse" && s.MapID != "warehouse" {
					t.Fatal("warehouse card did not preserve its implemented map")
				}
				if point.MapID == "greenhouse" {
					if s.Phase == "explore" {
						t.Fatal("card opened an unimplemented exploration map")
					}
				}
			}
			if point.Kind == "battle" {
				if s.ActiveBattle == nil || s.ActiveBattle.Status != "active" {
					t.Fatal("missing real battle attempt")
				}
				if (point.ID == "market.battle" || point.ID == "rescue.battle") && !s.ActiveBattle.Mainline {
					t.Fatal("mainline checkpoint became a trial")
				}
				s = execute(t, g, token, domain.Command{Type: "QA_SIMULATE_DEFEAT", AttemptID: s.ActiveBattle.ID})
				if s.Phase != "settlement" || s.LastResult.Outcome != "lost" {
					t.Fatal("defeat did not settle")
				}
				s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
				if s.Phase == "preparation" {
					s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: s.ActiveBattle.StageID})
				}
				s = execute(t, g, token, domain.Command{Type: "QA_SIMULATE_VICTORY", AttemptID: s.ActiveBattle.ID})
				s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
			}
			restored := execute(t, g, token, domain.Command{Type: "QA_RESTORE"})
			original.Revision = restored.Revision
			if !reflect.DeepEqual(original, restored) {
				t.Fatalf("checkpoint leaked changes into original progress: %s", point.ID)
			}
		})
	}
	rejectUnchanged(t, g, token, domain.Command{Type: "QA_CHECKPOINT", CheckpointID: "not-a-checkpoint"})
	rejectUnchanged(t, g, token, domain.Command{Type: "QA_RESTORE"})
}

func TestQARestoreSurvivesRestartAndReplaysWithoutOverwritingOriginal(t *testing.T) {
	g, token, path := setup(t)
	g.QAVictoryEnabled = true
	// Start from an actual active attempt, not merely an empty save.
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		p.State.Inventory["material"] = 77
		p.State.Currencies["stamp"] = 13
		p.State.EventState = &domain.EventState{PendingModifiers: domain.BattleModifiers{ShadowPressure: 1}}
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for {
		s, _ := g.State(token)
		if s.Phase != "dialogue" {
			break
		}
		execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
	}
	original, _ := g.State(token)
	initialRevision := original.Revision
	request := domain.CommandRequest{ExpectedRevision: &initialRevision, Command: domain.Command{Type: "QA_CHECKPOINT", CheckpointID: "market.battle"}}
	first, err := g.Execute(token, "qa-idempotent-load", request)
	if err != nil {
		t.Fatal(err)
	}
	again, err := g.Execute(token, "qa-idempotent-load", request)
	if err != nil || !again.Replayed || !reflect.DeepEqual(first.State, again.State) {
		t.Fatal("retry changed the checkpoint or attempt")
	}
	execute(t, g, token, domain.Command{Type: "QA_CHECKPOINT", CheckpointID: "greenhouse.home_3"})
	execute(t, g, token, domain.Command{Type: "DRAW_FURNITURE", PoolID: "rainy_box"})
	store, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	restarted := service.New(store, g.Catalog) // QA may now be disabled.
	restored := execute(t, restarted, token, domain.Command{Type: "QA_RESTORE"})
	original.Revision = restored.Revision
	if !reflect.DeepEqual(original, restored) {
		t.Fatalf("persistent restore changed original battle, currencies or progress: %+v", restored)
	}
	_, err = restarted.Execute(token, "qa-idempotent-load", request)
	if err != nil {
		t.Fatal(err)
	}
	current, _ := restarted.State(token)
	if !reflect.DeepEqual(current, restored) {
		t.Fatal("late retry re-entered a test checkpoint")
	}
}
