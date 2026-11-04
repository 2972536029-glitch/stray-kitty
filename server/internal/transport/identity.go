package transport

import (
	"net/http"
	"strings"

	"stray-kitty/server/internal/obs"
)

func (a *API) sessionIdentity(r *http.Request, token string) {
	if playerID, sessionID, qa, err := a.game.SessionIdentity(token); err == nil {
		ctx := obs.WithQA(obs.WithIdentity(r.Context(), playerID, sessionID), qa)
		*r = *r.WithContext(ctx)
	}
}

// Legacy payment endpoints identify a player without requiring a bearer token.
// Resolve that ID against storage rather than trusting request text. Attach a
// session only when a valid bearer actually belongs to that player; asynchronous
// credit must not fabricate an interactive user session.
func (a *API) paymentIdentity(r *http.Request, playerID string) string {
	resolvedID, qa, err := a.game.Store.ObservationIdentityByPlayer(playerID)
	if err != nil {
		return "qa:false"
	}
	sessionID := ""
	if value := r.Header.Get("Authorization"); strings.HasPrefix(value, "Bearer ") {
		if resolved, session, _, err := a.game.SessionIdentity(strings.TrimSpace(value[7:])); err == nil && resolved == resolvedID {
			sessionID = session
		}
	}
	ctx := obs.WithQA(obs.WithIdentity(r.Context(), resolvedID, sessionID), qa)
	*r = *r.WithContext(ctx)
	return obs.QATag(ctx)
}
