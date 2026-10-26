package service_test

import (
	"reflect"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"testing"
)

func editCarryFixture(t *testing.T, g *service.Game, token string, edit func(*domain.GameState)) {
	t.Helper()
	_, err := g.Store.Transact(service.Hash(token), func(p *repository.Player) (domain.CommandResponse, error) {
		edit(&p.State)
		return domain.CommandResponse{State: p.State}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// Synthetic outcomes exercise each ID independently of the real cards and reward tiers.
func configureCarryOutcome(g *service.Game, carry domain.BattleCarryID) {
	for i := range g.Catalog.Events {
		if g.Catalog.Events[i].ID != "crate_event" {
			continue
		}
		for j := range g.Catalog.Events[i].Options {
			if g.Catalog.Events[i].Options[j].ID == "search" {
				for _, tier := range []string{"crit", "success", "partial", "fail"} {
					g.Catalog.Events[i].Options[j].Outcomes[tier] = domain.EventOutcome{Text: "carry contract fixture", Carry: carry, TDMod: &domain.TowerDefenseModifier{ShadowPressure: 1}}
				}
			}
		}
	}
}

func carryResources(s domain.GameState) map[string]any {
	return map[string]any{"inventory": s.Inventory, "currencies": s.Currencies, "cats": s.Cats, "furniture": s.Furniture, "flags": s.Flags, "pushTokens": s.PushTokens, "chapter": s.ChapterID, "story": s.StoryNodeID}
}

func TestAllSixCarriesPersistWithEventReceiptAndAttempt(t *testing.T) {
	for _, carry := range []domain.BattleCarryID{domain.CarryLantern, domain.CarryMirror, domain.CarryBell, domain.CarryBox, domain.CarryDog, domain.CarryDove} {
		t.Run(string(carry), func(t *testing.T) {
			g, token, path := setup(t)
			finishStory(t, g, token)
			configureCarryOutcome(g, carry)
			before := execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
			request := domain.CommandRequest{ExpectedRevision: &before.Revision, Command: domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"}}
			response, err := g.Execute(token, "carry-event-once", request)
			if err != nil {
				t.Fatal(err)
			}
			s := response.State
			if s.EventState.PendingModifiers.Carry != carry || s.EventState.LastResolution.Outcome.Carry != carry || !reflect.DeepEqual(carryResources(before), carryResources(s)) {
				t.Fatal("carry event lost its ID or granted unrelated persistent rewards")
			}
			store, err := repository.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			g = service.New(store, g.Catalog)
			g.Random = func(int) (int, error) { t.Fatal("carry replay rerolled"); return 0, nil }
			replay, err := g.Execute(token, "carry-event-once", request)
			if err != nil || !replay.Replayed || !reflect.DeepEqual(s, replay.State) {
				t.Fatalf("carry event did not persist with its receipt: %v", err)
			}
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
			if s.ActiveBattle.Modifiers == nil || s.ActiveBattle.Modifiers.Carry != carry || !reflect.DeepEqual(s.Inventory, before.Inventory) {
				t.Fatal("attempt did not receive carry or reserved inventory")
			}
			store, err = repository.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			restored, err := service.New(store, g.Catalog).State(token)
			if err != nil || !reflect.DeepEqual(restored.ActiveBattle, s.ActiveBattle) {
				t.Fatalf("carry attempt changed after restart: %v", err)
			}
		})
	}
}

func TestEventWithoutCarryPreservesPriorCarryAndOnlyNewCarryReplacesIt(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	editCarryFixture(t, g, token, func(s *domain.GameState) {
		s.EventState = &domain.EventState{PendingModifiers: domain.BattleModifiers{ShadowPressure: -1, Carry: domain.CarryLantern}}
	})
	for _, step := range []struct{ awarded, expected domain.BattleCarryID }{{"", domain.CarryLantern}, {domain.CarryDove, domain.CarryDove}, {"", domain.CarryDove}} {
		configureCarryOutcome(g, step.awarded)
		editCarryFixture(t, g, token, func(s *domain.GameState) { s.Phase = "event"; s.PendingEventID = "crate_event" })
		before, _ := g.State(token)
		s := execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"})
		if s.EventState.PendingModifiers.Carry != step.expected || s.EventState.LastResolution.Outcome.Carry != step.awarded || s.EventState.PendingModifiers.ShadowPressure != 1 {
			t.Fatal("omitted carry cleared a prior carry, fabricated an award, or stopped pressure updates")
		}
		if !reflect.DeepEqual(carryResources(before), carryResources(s)) {
			t.Fatal("carry-only result changed persistent rewards")
		}
	}
}

func TestUnknownConfiguredCarryIsRejectedAtomically(t *testing.T) {
	for _, carry := range []domain.BattleCarryID{"future-unknown-carry", "pigeon", "crow"} {
		t.Run(string(carry), func(t *testing.T) {
			g, token, _ := setup(t)
			finishStory(t, g, token)
			configureCarryOutcome(g, carry)
			execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "alley_crate"})
			rejectUnchanged(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "crate_event", OptionID: "search"})
		})
	}
}

func TestCarryRetriesLockStageAndOriginalSnapshot(t *testing.T) {
	for _, stage := range []string{"alley_rescue", "alley_boss", "market_boss", "greenhouse_boss", "tunnel_boss"} {
		t.Run(stage, func(t *testing.T) {
			g, token, path := prepareBoss(t, -1, map[string]int{"food": 7, "material": 3})
			editCarryFixture(t, g, token, func(s *domain.GameState) { s.EventState.PendingModifiers.Carry = domain.CarryDog })
			before, _ := g.State(token)
			s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: stage})
			firstID := s.ActiveBattle.ID
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: firstID, Outcome: "lost", Report: bossReport(3, false)})
			if !reflect.DeepEqual(before.EventState, s.EventState) || !reflect.DeepEqual(carryResources(before), carryResources(s)) {
				t.Fatal("loss consumed carry or changed persistent resources")
			}
			s = execute(t, g, token, domain.Command{Type: "CONTINUE"})
			if s.ActiveBattle == nil || s.ActiveBattle.ID != firstID || s.ActiveBattle.Status != "lost" || s.Phase != "preparation" {
				t.Fatal("failed preparation lost its retry snapshot")
			}
			// Changes to pending mainline state must not overwrite a failed attempt.
			editCarryFixture(t, g, token, func(s *domain.GameState) {
				s.EventState.PendingModifiers = domain.BattleModifiers{ShadowPressure: 1, Carry: domain.CarryDove}
			})
			for _, other := range []string{"alley_rescue", "alley_boss", "market_boss", "greenhouse_boss", "tunnel_boss"} {
				if other != stage {
					rejectUnchanged(t, g, token, domain.Command{Type: "START_BATTLE", StageID: other})
				}
			}
			store, err := repository.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			g = service.New(store, g.Catalog)
			s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: stage})
			if s.ActiveBattle.ID == firstID || s.ActiveBattle.Modifiers == nil || *s.ActiveBattle.Modifiers != (domain.BattleModifiers{ShadowPressure: -1, Carry: domain.CarryDog}) {
				t.Fatal("retry reused identity or changed the saved pressure/carry")
			}
			if s.EventState.PendingModifiers.Carry != domain.CarryDove {
				t.Fatal("retry rewrote mainline pending state")
			}
			wonReq := domain.CommandRequest{ExpectedRevision: &s.Revision, Command: domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)}}
			won, err := g.Execute(token, "carry-win-once", wonReq)
			if err != nil {
				t.Fatal(err)
			}
			replay, err := g.Execute(token, "carry-win-once", wonReq)
			if err != nil || !replay.Replayed || !reflect.DeepEqual(won.State, replay.State) {
				t.Fatalf("carry completion was not idempotent: %v", err)
			}
			if stage == "market_boss" || stage == "greenhouse_boss" || stage == "tunnel_boss" {
				if won.State.EventState.PendingModifiers != (domain.BattleModifiers{ShadowPressure: 1, Carry: domain.CarryDove}) || !reflect.DeepEqual(carryResources(before), carryResources(won.State)) {
					t.Fatal("standalone victory consumed pending carry or granted mainline rewards")
				}
			} else if won.State.EventState.PendingModifiers != (domain.BattleModifiers{}) {
				t.Fatal("L01 victory did not clear pending pressure and carry")
			}
		})
	}
}

func TestCarryRetryDoesNotFallBackToNewPendingWhenOldModifiersMissing(t *testing.T) {
	g, token, _ := prepareBoss(t, 1, nil)
	editCarryFixture(t, g, token, func(s *domain.GameState) {
		s.Phase = "preparation"
		s.ActiveBattle = &domain.Attempt{ID: "legacy-failed", StageID: "alley_boss", Status: "lost"}
		s.EventState.PendingModifiers.Carry = domain.CarryDove
	})
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss"})
	if s.ActiveBattle.Modifiers != nil || s.EventState.PendingModifiers.Carry != domain.CarryDove {
		t.Fatal("legacy default attempt inherited later pending modifiers")
	}
}

func TestCarryRetrySnapshotClearsWhenLeavingPreparation(t *testing.T) {
	for _, command := range []domain.Command{{Type: "GO_HOME"}, {Type: "GO_EXPLORE"}, {Type: "START_STORY", NodeID: "market_intro_1"}} {
		t.Run(command.Type, func(t *testing.T) {
			g, token, _ := prepareBoss(t, 1, nil)
			editCarryFixture(t, g, token, func(s *domain.GameState) {
				s.Phase = "preparation"
				s.ActiveBattle = &domain.Attempt{ID: "old-lost-attempt", StageID: "alley_boss", Status: "lost", Modifiers: &domain.BattleModifiers{ShadowPressure: -1, Carry: domain.CarryDog}}
				s.EventState.PendingModifiers.Carry = domain.CarryDove
			})
			s := execute(t, g, token, command)
			if s.ActiveBattle != nil || s.EventState.PendingModifiers != (domain.BattleModifiers{ShadowPressure: 1, Carry: domain.CarryDove}) {
				t.Fatal("navigation retained a stale retry identity or consumed pending carry")
			}
		})
	}
}

func TestL00NeverEnablesCarryAndPreservesMainlinePending(t *testing.T) {
	for _, retry := range []domain.Command{{Type: "CONTINUE"}, {Type: "START_BATTLE", StageID: "l00_tutorial"}} {
		t.Run(retry.Type, func(t *testing.T) {
			g, token, _ := setup(t)
			editCarryFixture(t, g, token, func(s *domain.GameState) {
				s.EventState = &domain.EventState{PendingModifiers: domain.BattleModifiers{ShadowPressure: -1, Carry: domain.CarryDove}}
			})
			s, _ := g.State(token)
			for s.Phase == "dialogue" {
				s = execute(t, g, token, domain.Command{Type: "ADVANCE_STORY", NodeID: s.StoryNodeID})
			}
			if s.ActiveBattle.StageID != "l00_tutorial" || s.ActiveBattle.Modifiers != nil {
				t.Fatal("first tutorial consumed event modifiers")
			}
			firstID := s.ActiveBattle.ID
			// Legacy tutorial snapshots may contain carry; even their retry strips it.
			editCarryFixture(t, g, token, func(s *domain.GameState) {
				s.ActiveBattle.Modifiers = &domain.BattleModifiers{ShadowPressure: 1, Carry: domain.CarryDog}
			})
			execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: firstID, Outcome: "lost"})
			s = execute(t, g, token, retry)
			if s.ActiveBattle.ID == firstID || s.ActiveBattle.Modifiers == nil || *s.ActiveBattle.Modifiers != (domain.BattleModifiers{ShadowPressure: 1}) {
				t.Fatal("tutorial retry enabled carry or changed the original tier")
			}
			s = execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won"})
			if s.EventState.PendingModifiers != (domain.BattleModifiers{ShadowPressure: -1, Carry: domain.CarryDove}) {
				t.Fatal("tutorial consumed pending mainline carry")
			}
		})
	}
}

func TestUnknownHistoricalCarryDoesNotBlockExistingStages(t *testing.T) {
	for _, stage := range []string{"alley_rescue", "alley_boss", "market_boss", "greenhouse_boss", "tunnel_boss"} {
		for _, carry := range []domain.BattleCarryID{"retired-carry-id", "pigeon", "crow"} {
			t.Run(stage+"/"+string(carry), func(t *testing.T) {
				g, token, _ := prepareBoss(t, 0, nil)
				editCarryFixture(t, g, token, func(s *domain.GameState) { s.EventState.PendingModifiers.Carry = carry })
				s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: stage})
				firstID := s.ActiveBattle.ID
				execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: firstID, Outcome: "lost", Report: bossReport(3, false)})
				execute(t, g, token, domain.Command{Type: "CONTINUE"})
				s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: stage})
				if s.ActiveBattle.ID == firstID || s.ActiveBattle.Modifiers.Carry != carry {
					t.Fatal("unknown saved carry prevented a stable retry")
				}
				execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
			})
		}
	}
}

func TestMR24AllyCardsAwardCarryOnlyOnConfiguredCrit(t *testing.T) {
	for _, source := range []struct {
		event, option string
		carry         domain.BattleCarryID
	}{{"pigeon_rumor_event", "recruit_pigeon", domain.CarryDove}, {"alley_dog_friend", "push_debris", domain.CarryDog}, {"alley_dog_friend", "lure_shadows", domain.CarryDog}} {
		for _, tier := range []struct {
			name string
			die  int
		}{{"crit", 6}, {"success", 5}, {"partial", 3}, {"fail", 1}} {
			t.Run(source.event+"/"+source.option+"/"+tier.name, func(t *testing.T) {
				g, token, _ := setup(t)
				finishStory(t, g, token)
				g.Random = func(int) (int, error) { return tier.die - 1, nil }
				// Old Huang is delivered as node content; map placement is owned by map integration.
				editCarryFixture(t, g, token, func(s *domain.GameState) {
					s.Phase = "event"
					s.PendingEventID = source.event
					s.PendingEventSource = "node"
					s.EventState = &domain.EventState{PendingModifiers: domain.BattleModifiers{Carry: domain.CarryBell}}
				})
				s := execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: source.event, OptionID: source.option})
				expected := domain.BattleCarryID("")
				pending := domain.CarryBell
				if tier.name == "crit" {
					expected = source.carry
					pending = source.carry
				}
				if s.EventState.LastResolution.Tier != tier.name || s.EventState.LastResolution.Outcome.Carry != expected || s.EventState.PendingModifiers.Carry != pending {
					t.Fatal("MR24 source granted carry outside crit or lost the previous carry")
				}
				if tier.name == "crit" && (source.carry == domain.CarryDog && (s.Inventory["clue"] != 1 || !domain.Contains(s.Flags, "dog_ally_met")) || source.carry == domain.CarryDove && (s.Currencies["stamp"] != 2 || s.Inventory["material"] != 3 || !domain.Contains(s.Flags, "pigeon_ally"))) {
					t.Fatal("MR24 crit reward or source flag changed")
				}
			})
		}
	}
}

func TestDoveCarryViaExistingMarketNode(t *testing.T) {
	g, token, _ := setup(t)
	finishStory(t, g, token)
	g.Random = func(int) (int, error) { return 5, nil }
	execute(t, g, token, domain.Command{Type: "START_STORY", NodeID: "market_intro_1"})
	finishStory(t, g, token)
	execute(t, g, token, domain.Command{Type: "INTERACT", InteractionID: "market_pigeon_perch"})
	s := execute(t, g, token, domain.Command{Type: "CHOOSE_EVENT", EventID: "pigeon_rumor_event", OptionID: "recruit_pigeon"})
	if s.EventState.PendingModifiers.Carry != domain.CarryDove {
		t.Fatal("existing pigeon interaction did not award dove")
	}
	s = execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_rescue"})
	if s.ActiveBattle.Modifiers == nil || s.ActiveBattle.Modifiers.Carry != domain.CarryDove {
		t.Fatal("real event source did not reach the battle attempt")
	}
	execute(t, g, token, domain.Command{Type: "COMPLETE_BATTLE", AttemptID: s.ActiveBattle.ID, Outcome: "won", Report: bossReport(0, true)})
}
