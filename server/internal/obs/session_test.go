package obs

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
)

// 会话底座回归测试:ctx 携带标识时每条 obs 日志自动注入 player_id/session_id;
// 无标识时日志行为不变。这两个字段只进日志,绝不进指标 tag(低基数纪律)。
func TestLogInjectsSessionIdentity(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	defer slog.SetDefault(previous)

	ctx := WithSession(context.Background(), "player-abc", "session-xyz")
	LogInfo(ctx, "http request", "path", "/api/v1/commands")
	out := buf.String()
	for _, field := range []string{"player_id=player-abc", "session_id=session-xyz"} {
		if !strings.Contains(out, field) {
			t.Fatalf("expected %q in log output, got: %s", field, out)
		}
	}
	// ShipLog 路径在未 Init 时是 no-op,不应 panic——观测旁路不影响业务。
}

func TestWithSessionNoopOnEmpty(t *testing.T) {
	base := context.Background()
	if got := WithSession(base, "", ""); got != base {
		t.Fatal("empty identity must return the original ctx (no ctx churn)")
	}
	if ident := sessionFrom(context.Background()); ident != (SessionIdentity{}) {
		t.Fatal("background ctx must carry no identity")
	}
}
