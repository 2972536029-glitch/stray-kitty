package advisor

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBattleAndHomeUseDistinctAnswerContracts(t *testing.T) {
	for _, scope := range []string{"battle", "journey"} {
		t.Run(scope, func(t *testing.T) {
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var payload struct {
					Messages []map[string]string `json:"messages"`
				}
				if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || len(payload.Messages) != 2 {
					t.Error("invalid provider envelope")
					w.WriteHeader(500)
					return
				}
				prompt := payload.Messages[0]["content"]
				if scope == "battle" {
					if !strings.Contains(prompt, "战斗页面只回答战斗相关内容") || !strings.Contains(prompt, "只回答战斗部分") {
						t.Error("battle contract lost its topic boundary")
					}
					if strings.Contains(prompt, "homeKnowledge") {
						t.Error("battle unexpectedly uses the home knowledge contract")
					}
				} else {
					for _, required := range []string{"home是跨模块游戏顾问", "homeKnowledge.liveBattle.available", "不是完整剧情历史", "不因身处家园就拒绝"} {
						if !strings.Contains(prompt, required) {
							t.Errorf("missing home contract: %s", required)
						}
					}
				}
				completion(w, `{"title":"范围说明","text":"按当前可信资料解释。"}`, "stop")
			}))
			defer provider.Close()
			input := adviceInput()
			input.Scope = scope
			client := New(Config{APIKey: testKey, BaseURL: provider.URL})
			if answer := client.Reply(context.Background(), "scope-fixture", input); answer.Source != "model" {
				t.Fatalf("scope request failed: %+v", answer)
			}
		})
	}
}
