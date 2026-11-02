package advisor

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"stray-kitty/server/internal/domain"
	"strings"
	"testing"
)

func TestExploreHintRejectsAddedFactsAndMalformedSentences(t *testing.T) {
	for _, tc := range []struct {
		name, text string
		valid      bool
	}{
		{"same text", "北侧似乎还留着熟悉的踪迹。", true},
		{"gentle wording", "北侧好像还有熟悉的踪迹，不妨留意。", true},
		{"unapproved direction", "南侧似乎留着熟悉的踪迹。", false},
		{"unseen character", "北侧似乎有墨墨，快去救她。", false},
		{"unseen truth", "北侧似乎藏着陷阱。", false},
		{"new key", "北侧似乎有踪迹，按 F 过去。", false},
		{"invented distance", "北侧似乎有踪迹，往前走50米。", false},
		{"certainty changed", "北侧就有熟悉的踪迹。", false},
		{"two sentences", "北侧似乎有踪迹。快去看看。", false},
		{"html", "<b>北侧似乎有踪迹</b>", false},
		{"multiline", "北侧似乎有踪迹\n快去看看", false},
		{"long", strings.Repeat("字", 81), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					MaxTokens int                 `json:"max_tokens"`
					Messages  []map[string]string `json:"messages"`
				}
				if json.NewDecoder(r.Body).Decode(&request) != nil || request.MaxTokens != 180 || len(request.Messages) != 2 || !strings.Contains(request.Messages[0]["content"], "不能自行选择目标") {
					t.Error("automatic hint did not use its bounded prompt")
				}
				content, _ := json.Marshal(map[string]string{"title": "阿策", "text": tc.text})
				completion(w, string(content), "stop")
			}))
			defer provider.Close()
			client := New(Config{APIKey: testKey, BaseURL: provider.URL})
			got := client.Reply(context.Background(), "hint-session", domain.AdvisorRequest{Scope: "explore_hint", Context: `{"approvedHint":"北侧似乎还留着熟悉的踪迹。"}`})
			if tc.valid {
				if got.Source != "model" || got.Text != tc.text {
					t.Fatalf("valid wording rejected: %+v", got)
				}
			} else {
				assertLocal(t, got, "invalid_response")
			}
		})
	}
}
