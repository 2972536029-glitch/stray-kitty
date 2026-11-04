package repository

import "stray-kitty/server/internal/domain"

// ObservationIdentity returns only immutable scalar fields while holding the
// store mutex. Request logging must not serialize a player's state and hundreds
// of historical command receipts just to resolve an ID and the QA flag.
func (s *Store) ObservationIdentity(hash string) (playerID string, qa bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, player := s.lookupSession(hash)
	if player == nil {
		return "", false, domain.Fail("UNAUTHORIZED", "会话不存在，请开始新的旅程", 401)
	}
	return player.ID, playerObservationQA(player), nil
}

func (s *Store) ObservationIdentityByPlayer(playerID string) (resolvedID string, qa bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, player := s.findByID(playerID)
	if player == nil {
		return "", false, domain.Fail("PLAYER_NOT_FOUND", "玩家不存在，请先开始新的旅程", 404)
	}
	return player.ID, playerObservationQA(player), nil
}

func playerObservationQA(player *Player) bool {
	return player.QARestore != nil || player.State.QACheckpointID != "" ||
		(player.State.ActiveBattle != nil && player.State.ActiveBattle.QA)
}
