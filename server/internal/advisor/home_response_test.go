package advisor

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHomeDiceTableRejectsObservedTierTypoWithoutRejectingIndividualSum(t *testing.T) {
	context := `{"serverProgress":{"phase":"home","homeKnowledge":{"eventRules":{"pointRanges":{"crit":{"min":12,"max":12,"probability":"2.78%"},"success":{"min":9,"max":11,"probability":"25.00%"},"partial":{"min":5,"max":8,"probability":"55.56%"},"fail":{"min":2,"max":4,"probability":"16.67%"}}}}}}`
	valid := "12点约2.78%，9–11点约25%，5–8点约55.56%，2–4点约16.67%。"
	invalid := "2点约2.78%，9–11点约25%，5–8点约55.56%，2–4点约16.67%。"
	if !validHomeDiceTable(context, valid) {
		t.Fatal("correct table rejected")
	}
	if validHomeDiceTable(context, invalid) {
		t.Fatal("observed 12-to-2 transcription error escaped")
	}
	if !validHomeDiceTable(context, "普通2d6掷出恰好2点的概率是2.78%。") {
		t.Fatal("individual sum is not the whole fail tier")
	}
	if !validHomeDiceTable(`{}`, invalid) {
		t.Fatal("legacy scopes have no authoritative home table")
	}
}

func TestHomeDiceTypoFallsBackInsteadOfDisplayingModelSuccess(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		completion(w, `{"title":"概率","text":"2点约2.78%，9–11点约25%，5–8点约55.56%，2–4点约16.67%。"}`, "stop")
	}))
	defer provider.Close()
	input := adviceInput()
	input.Scope = "journey"
	input.Context = `{"serverProgress":{"phase":"home","homeKnowledge":{"eventRules":{"pointRanges":{"crit":{"min":12,"max":12,"probability":"2.78%"},"success":{"min":9,"max":11,"probability":"25.00%"},"partial":{"min":5,"max":8,"probability":"55.56%"},"fail":{"min":2,"max":4,"probability":"16.67%"}}}}}}`
	client := New(Config{APIKey: testKey, BaseURL: provider.URL})
	assertLocal(t, client.Reply(context.Background(), "typo", input), "invalid_response")
}
