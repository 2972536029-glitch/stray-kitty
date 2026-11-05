package transport_test

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"

	"stray-kitty/server/internal/service"
)

func TestBusinessLogsResolvePlayerAndSessionWithoutTokens(t *testing.T) {
	var output bytes.Buffer
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(original) })
	handler := authHandler(t)
	request := func(method, path, body, token string, status int) map[string]any {
		t.Helper()
		output.Reset()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s: got %d %s", path, w.Code, w.Body.String())
		}
		var response map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		return response
	}
	assertIdentity := func(player, token string) {
		t.Helper()
		var entry map[string]any
		if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &entry); err != nil {
			t.Fatal(err)
		}
		if entry["player_id"] != player || entry["session_id"] != service.LogSessionID(token) {
			t.Fatalf("missing request identity: %s", output.String())
		}
		if strings.Contains(output.String(), token) || strings.Contains(output.String(), service.Hash(token)) {
			t.Fatal("log exposed bearer token or storage lookup hash")
		}
	}
	session := request("POST", "/api/v1/sessions", "", "", 201)
	player, token := session["playerId"].(string), session["token"].(string)
	assertIdentity(player, token)
	request("GET", "/api/v1/state", "", token, 200)
	assertIdentity(player, token)
	request("POST", "/api/auth/register", `{"username":"log-cat","password":"only-test-password"}`, token, 201)
	assertIdentity(player, token)
	login := request("POST", "/api/auth/login", `{"username":"log-cat","password":"only-test-password"}`, "", 200)
	loginToken := login["token"].(string)
	if loginToken == token || service.LogSessionID(loginToken) == service.LogSessionID(token) {
		t.Fatal("new login did not create a distinct session identity")
	}
	assertIdentity(player, loginToken)
	request("GET", "/api/v1/state", "", loginToken, 200)
	assertIdentity(player, loginToken)
	// Middleware also observes authenticated requests whose handler does not
	// parse a token; it must use the same opaque log-session identity.
	request("GET", "/healthz", "", loginToken, 200)
	assertIdentity(player, loginToken)
	request("GET", "/api/v1/state", "", "invalid-bearer-token", 401)
	if strings.Contains(output.String(), "player_id") || strings.Contains(output.String(), "session_id") {
		t.Fatal("invalid bearer was attributed to a player")
	}
	request("GET", "/healthz", "", "", 200)
	if strings.Contains(output.String(), "player_id") || strings.Contains(output.String(), "session_id") {
		t.Fatal("request identity leaked into a later anonymous request")
	}
}
