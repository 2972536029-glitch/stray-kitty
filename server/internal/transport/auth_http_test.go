package transport_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
)

func authHandler(t *testing.T) http.Handler {
	t.Helper()
	store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	return transport.New(service.New(store, catalog), payment.New(store, catalog), "")
}

func TestAuthHTTPRegisterAndLogin(t *testing.T) {
	handler := authHandler(t)
	created := httptest.NewRecorder()
	handler.ServeHTTP(created, httptest.NewRequest("POST", "/api/v1/sessions", nil))
	var session struct{ PlayerID, Token string }
	json.Unmarshal(created.Body.Bytes(), &session)
	if created.Code != 201 {
		t.Fatal(created.Body.String())
	}

	post := func(path, body, auth string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if auth != "" {
			r.Header.Set("Authorization", "Bearer "+auth)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	// 注册:需要匿名令牌,返回归一化用户名。
	w := post("/api/auth/register", `{"username":"NightCat","password":"fish-and-chips-1"}`, session.Token)
	if w.Code != 201 {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	var reg struct{ Username string }
	json.Unmarshal(w.Body.Bytes(), &reg)
	if reg.Username != "nightcat" {
		t.Fatalf("username not normalized: %s", w.Body.String())
	}

	// 缺令牌注册被拒。
	w = post("/api/auth/register", `{"username":"x","password":"y"}`, "")
	if w.Code != 401 {
		t.Fatalf("register without token: %d", w.Code)
	}

	// 登录:返回同一玩家的新令牌。
	w = post("/api/auth/login", `{"username":"nightcat","password":"fish-and-chips-1"}`, "")
	if w.Code != 200 {
		t.Fatalf("login: %d %s", w.Code, w.Body.String())
	}
	var login struct{ PlayerID, Token string }
	json.Unmarshal(w.Body.Bytes(), &login)
	if login.PlayerID != session.PlayerID || login.Token == "" {
		t.Fatalf("unexpected login body: %s", w.Body.String())
	}

	// 登录令牌可用。
	r := httptest.NewRequest("GET", "/api/v1/state", nil)
	r.Header.Set("Authorization", "Bearer "+login.Token)
	state := httptest.NewRecorder()
	handler.ServeHTTP(state, r)
	if state.Code != 200 {
		t.Fatalf("state with login token: %d %s", state.Code, state.Body.String())
	}

	// 错密码 401。
	w = post("/api/auth/login", `{"username":"nightcat","password":"wrong-password!"}`, "")
	if w.Code != 401 {
		t.Fatalf("wrong password: %d %s", w.Code, w.Body.String())
	}

	// 未知字段拒绝。
	w = post("/api/auth/login", `{"username":"nightcat","password":"fish-and-chips-1","extra":1}`, "")
	if w.Code != 400 {
		t.Fatalf("unknown field: %d", w.Code)
	}
}
