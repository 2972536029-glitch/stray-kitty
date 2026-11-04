package service

import "stray-kitty/server/internal/domain"

// The initial snapshot must match the caller's exact scene and revision.
// State returns a copy; no repository lock spans the external model request.
func (g *Game) advisorSceneSnapshot(token string, input domain.AdvisorRequest) (domain.GameState, error) {
	state, err := g.State(token)
	if err != nil {
		return domain.GameState{}, err
	}
	if input.SceneKey != advisorSceneKey(state) || input.ExpectedRevision == nil || *input.ExpectedRevision != state.Revision {
		return domain.GameState{}, advisorContextChanged()
	}
	return state, nil
}

// Completed requests compare semantic progress, not revision: harmless movement
// can increment revision. Each scope chooses its own fingerprint, which stays
// on the server and never broadens the information sent to the model.
func (g *Game) advisorSceneUnchanged(token, sceneKey string, sameProgress func(domain.GameState) bool) error {
	state, err := g.State(token)
	if err != nil {
		return err
	}
	if advisorSceneKey(state) != sceneKey || !sameProgress(state) {
		return advisorContextChanged()
	}
	return nil
}
