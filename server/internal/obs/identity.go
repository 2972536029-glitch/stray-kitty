package obs

import "context"

type qaKey struct{}

// WithIdentity adds server-resolved identifiers to logs only. Callers must never
// pass bearer tokens or copy these identifiers into metric tags.
func WithIdentity(ctx context.Context, playerID, sessionID string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	// Both public entry points share one identity value. A later WithSession or
	// WithIdentity call therefore replaces it rather than logging stale fields.
	return WithSession(ctx, playerID, sessionID)
}

// WithQA records a server-derived test-state flag. Unlike player/session IDs,
// this bounded boolean is also safe for metric tags.
func WithQA(ctx context.Context, qa bool) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, qaKey{}, qa)
}

func IsQA(ctx context.Context) bool {
	if ctx == nil {
		return false
	}
	qa, _ := ctx.Value(qaKey{}).(bool)
	return qa
}

func QATag(ctx context.Context) string {
	if IsQA(ctx) {
		return "qa:true"
	}
	return "qa:false"
}
