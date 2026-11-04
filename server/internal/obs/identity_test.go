package obs

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"testing"
)

func TestLogIdentityIsContextLocal(t *testing.T) {
	var output bytes.Buffer
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(original) })
	base := context.Background()
	ctx := WithIdentity(base, "server-player", "opaque-session")
	LogInfo(ctx, "business committed", "result", "success")
	LogWarn(base, "anonymous request")
	LogError(WithIdentity(nil, "webhook-player", ""), "background credit")
	decoder := json.NewDecoder(&output)
	for i, want := range []map[string]string{
		{"player_id": "server-player", "session_id": "opaque-session", "result": "success"},
		{},
		{"player_id": "webhook-player"},
	} {
		var got map[string]any
		if err := decoder.Decode(&got); err != nil {
			t.Fatal(err)
		}
		for _, key := range []string{"player_id", "session_id"} {
			if expected, exists := want[key]; exists {
				if got[key] != expected {
					t.Errorf("log %d %s = %v, want %s", i, key, got[key], expected)
				}
			} else if _, exists := got[key]; exists {
				t.Errorf("log %d inherited an unrelated %s", i, key)
			}
		}
	}
}

func TestLogQABooleanComesFromContext(t *testing.T) {
	var output bytes.Buffer
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(original) })
	LogInfo(WithQA(context.Background(), true), "qa request")
	LogInfo(WithQA(context.Background(), false), "normal request")
	decoder := json.NewDecoder(&output)
	for _, want := range []bool{true, false} {
		var got map[string]any
		if err := decoder.Decode(&got); err != nil {
			t.Fatal(err)
		}
		if got["qa"] != want {
			t.Fatalf("qa log field is not the expected boolean: %v", got)
		}
	}
}
