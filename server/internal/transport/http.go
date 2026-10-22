package transport

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/service"
	"strings"
	"sync/atomic"
	"time"
)

type API struct {
	game     *service.Game
	requests atomic.Uint64
	failures atomic.Uint64
}

func New(game *service.Game, webDir string) http.Handler {
	a := &API{game: game}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { a.json(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		a.json(w, 200, map[string]string{"status": "ready", "storage": "single-process-file"})
	})
	mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		fmt.Fprintf(w, "# TYPE kitty_http_requests_total counter\nkitty_http_requests_total %d\n# TYPE kitty_http_errors_total counter\nkitty_http_errors_total %d\n", a.requests.Load(), a.failures.Load())
	})
	mux.HandleFunc("GET /api/v1/content", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write(platform.CatalogJSON)
	})
	mux.HandleFunc("POST /api/v1/sessions", func(w http.ResponseWriter, r *http.Request) {
		if r.ContentLength > 0 {
			a.fail(w, r, domain.Fail("INVALID_REQUEST", "创建匿名会话不接受请求体", 400))
			return
		}
		id, token, err := game.CreateSession()
		if err != nil {
			a.fail(w, r, err)
			return
		}
		a.json(w, 201, map[string]string{"playerId": id, "token": token})
	})
	mux.HandleFunc("GET /api/v1/state", func(w http.ResponseWriter, r *http.Request) {
		token, err := a.token(r)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		state, err := game.State(token)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		a.json(w, 200, state)
	})
	mux.HandleFunc("POST /api/v1/commands", func(w http.ResponseWriter, r *http.Request) {
		token, err := a.token(r)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
			a.fail(w, r, domain.Fail("INVALID_CONTENT_TYPE", "需要 application/json", 415))
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8192))
		if err != nil {
			a.fail(w, r, domain.Fail("BODY_TOO_LARGE", "请求超过 8 KiB", 413))
			return
		}
		var req domain.CommandRequest
		decoder := json.NewDecoder(strings.NewReader(string(body)))
		decoder.DisallowUnknownFields()
		if err = decoder.Decode(&req); err != nil {
			a.fail(w, r, domain.Fail("INVALID_REQUEST", "请求格式或字段无效", 400))
			return
		}
		if err = decoder.Decode(new(any)); err != io.EOF {
			a.fail(w, r, domain.Fail("INVALID_REQUEST", "只接受单个 JSON 对象", 400))
			return
		}
		if err = validateCommand(body, req.Command.Type); err != nil {
			a.fail(w, r, err)
			return
		}
		result, err := game.Execute(token, r.Header.Get("Idempotency-Key"), req)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		a.json(w, 200, result)
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		a.fail(w, r, domain.Fail("NOT_FOUND", "API 路径或方法不存在", 404))
	})
	if webDir != "" {
		fs := http.FileServer(http.Dir(webDir))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if r.Method != "GET" && r.Method != "HEAD" {
				http.Error(w, "method not allowed", 405)
				return
			}
			target := filepath.Join(webDir, filepath.FromSlash(strings.TrimPrefix(filepath.Clean("/"+r.URL.Path), "/")))
			if _, err := os.Stat(target); os.IsNotExist(err) && !strings.Contains(filepath.Base(target), ".") {
				http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
				return
			}
			fs.ServeHTTP(w, r)
		})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a.requests.Add(1)
		id, _ := service.ID()
		w.Header().Set("X-Request-Id", id)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		start := time.Now()
		defer func() {
			if recovered := recover(); recovered != nil {
				a.fail(w, r, domain.Fail("INTERNAL_ERROR", "服务暂时不可用", 500))
			}
			slog.Info("http request", "method", r.Method, "path", r.URL.Path, "duration_ms", time.Since(start).Milliseconds(), "request_id", id)
		}()
		mux.ServeHTTP(w, r)
	})
}
func (a *API) token(r *http.Request) (string, error) {
	value := r.Header.Get("Authorization")
	if !strings.HasPrefix(value, "Bearer ") || len(strings.TrimSpace(value[7:])) < 16 {
		return "", domain.Fail("UNAUTHORIZED", "需要匿名会话令牌", 401)
	}
	return strings.TrimSpace(value[7:]), nil
}
func (a *API) json(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func (a *API) fail(w http.ResponseWriter, r *http.Request, err error) {
	a.failures.Add(1)
	fault := &domain.Fault{Code: "INTERNAL_ERROR", Message: "保存或服务失败，请保留当前页面并重试", Status: 500}
	var known *domain.Fault
	if errors.As(err, &known) {
		fault = known
	}
	a.json(w, fault.Status, map[string]any{"error": map[string]string{"code": fault.Code, "message": fault.Message, "requestId": w.Header().Get("X-Request-Id")}})
}
func validateCommand(body []byte, kind string) error {
	fields := map[string][]string{"ADVANCE_STORY": {"nodeId"}, "INTERACT": {"interactionId"}, "CHOOSE_EVENT": {"eventId", "optionId"}, "START_BATTLE": {"stageId"}, "COMPLETE_BATTLE": {"attemptId", "outcome"}, "CONTINUE": {}, "GO_HOME": {}, "GO_EXPLORE": {}, "PLACE_FURNITURE": {"furnitureId", "slotId"}, "DRAW_FURNITURE": {"poolId"}}
	required, ok := fields[kind]
	if !ok {
		return domain.Fail("UNSUPPORTED_COMMAND", "命令尚未实现", 400)
	}
	var raw struct {
		Command map[string]json.RawMessage `json:"command"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return err
	}
	for key := range raw.Command {
		if key != "type" && !domain.Contains(required, key) {
			return domain.Fail("INVALID_REQUEST", "命令包含不适用的字段", 400)
		}
	}
	for _, key := range required {
		var value string
		if err := json.Unmarshal(raw.Command[key], &value); err != nil || value == "" {
			return domain.Fail("INVALID_REQUEST", "命令缺少有效的 "+key, 400)
		}
	}
	return nil
}
