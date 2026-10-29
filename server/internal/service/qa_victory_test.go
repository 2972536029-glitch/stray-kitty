package service_test

import (
	"testing"

	"stray-kitty/server/internal/domain"
)

func TestQAVictoryRequiresDevGateAndUsesNormalCompletion(t *testing.T) {
	g, token, _ := prepareBoss(t, 0, nil)
	s := execute(t, g, token, domain.Command{Type: "START_BATTLE", StageID: "alley_boss"})
	command := domain.Command{Type: "QA_SIMULATE_VICTORY", AttemptID: s.ActiveBattle.ID}
	rejectUnchanged(t, g, token, command)

	g.QAVictoryEnabled = true
	s = execute(t, g, token, command)
	if s.Phase != "settlement" || s.LastResult.Outcome != "won" || !domain.Contains(s.CompletedStages, "alley_boss") {
		t.Fatalf("QA did not follow normal battle completion: %+v", s)
	}
	rejectUnchanged(t, g, token, command)
}
