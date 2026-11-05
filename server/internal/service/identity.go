package service

// SessionIdentity resolves the same anonymous or login alias used by gameplay.
// The log session ID is domain-separated from the token hash used as a storage
// key, and changes on login while the player's ID remains stable.
func (g *Game) SessionIdentity(token string) (playerID, sessionID string, qa bool, err error) {
	playerID, qa, err = g.Store.ObservationIdentity(Hash(token))
	if err != nil {
		return "", "", false, err
	}
	return playerID, LogSessionID(token), qa, nil
}

func LogSessionID(token string) string {
	return Hash("kitty.log-session.v1:" + token)
}
