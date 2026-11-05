package advisor

import (
	"context"
	"testing"
)

// scope 维度枚举:白名单外一律 unknown;home 仅在 journey + home 提示时出现。
func TestAdvisorScope(t *testing.T) {
	cases := []struct {
		scope string
		ctx   context.Context
		want  string
	}{
		{"", context.Background(), "battle"},
		{"battle", context.Background(), "battle"},
		{"journey", context.Background(), "journey"},
		{"journey", WithScope(context.Background(), "home"), "home"},
		{"explore_hint", context.Background(), "explore_hint"},
		{"weird", context.Background(), "unknown"},
	}
	for _, c := range cases {
		if got := advisorScope(c.scope, c.ctx); got != c.want {
			t.Errorf("advisorScope(%q) = %q, want %q", c.scope, got, c.want)
		}
	}
}

func TestWithScopeNoopOnEmpty(t *testing.T) {
	base := context.Background()
	if got := WithScope(base, ""); got != base {
		t.Fatal("empty hint must return the original ctx")
	}
}
