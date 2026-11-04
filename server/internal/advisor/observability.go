package advisor

// Empty scope is the legacy battle contract. All other values are bounded even
// when Reply is called directly, bypassing transport validation.
func metricScope(scope string) string {
	switch scope {
	case "", "battle":
		return "battle"
	case "journey", "explore_hint", "home":
		return scope
	default:
		return "unknown"
	}
}
