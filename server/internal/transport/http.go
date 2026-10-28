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
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/service"
	"strings"
	"sync/atomic"
	"time"
)

// PaymentGateway 支付能力:进程内网关(单机形态)与远程客户端(拆分形态)都实现它,
// 充值/流水 HTTP 契约对前端保持不变。
type PaymentGateway interface {
	Charge(playerID, packID, cardNumber string) (payment.ChargeResult, error)
	History(playerID string) ([]domain.Txn, error)
	HealingMessage() string
}

type API struct {
	game     *service.Game
	pay      PaymentGateway
	requests atomic.Uint64
	failures atomic.Uint64
}

func New(game *service.Game, pay PaymentGateway, webDir string) http.Handler {
	a := &API{game: game, pay: pay}
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
	// 模拟支付:充值成功/失败双路径都是正常业务(HTTP 200);失败带治愈文案。
	mux.HandleFunc("POST /api/payment/charge", func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
			a.fail(w, r, domain.Fail("INVALID_CONTENT_TYPE", "需要 application/json", 415))
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8192))
		if err != nil {
			a.fail(w, r, domain.Fail("BODY_TOO_LARGE", "请求超过 8 KiB", 413))
			return
		}
		var req struct {
			PlayerID   string `json:"playerId"`
			PackID     string `json:"packId"`
			CardNumber string `json:"cardNumber"`
		}
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
		if req.PlayerID == "" || req.PackID == "" {
			a.fail(w, r, domain.Fail("INVALID_REQUEST", "缺少 playerId 或 packId", 400))
			return
		}
		result, err := a.pay.Charge(req.PlayerID, req.PackID, req.CardNumber)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		resp := map[string]any{"txnId": result.Txn.ID, "pack": result.Pack, "status": result.Txn.Status, "tunaGranted": result.Pack.TunaGranted, "tunaBalance": result.TunaBalance}
		if result.Txn.Status == "declined" {
			resp["reason"] = result.Txn.Reason
			resp["healingMsg"] = a.pay.HealingMessage()
		}
		a.json(w, 200, resp)
	})
	mux.HandleFunc("GET /api/payment/history", func(w http.ResponseWriter, r *http.Request) {
		playerID := strings.TrimSpace(r.URL.Query().Get("playerId"))
		if playerID == "" {
			a.fail(w, r, domain.Fail("INVALID_REQUEST", "缺少 playerId 查询参数", 400))
			return
		}
		txns, err := a.pay.History(playerID)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		a.json(w, 200, map[string]any{"playerId": playerID, "txns": txns})
	})
	mux.HandleFunc("POST /api/v1/advisor", a.advise)
	// 账号体系:注册把当前匿名进度绑到用户名密码;登录在任意设备取回进度。
	mux.HandleFunc("POST /api/auth/register", func(w http.ResponseWriter, r *http.Request) {
		token, err := a.token(r)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		req, err := a.readAuthBody(w, r)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		username, err := game.Register(token, req.Username, req.Password)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		a.json(w, 201, map[string]string{"username": username})
	})
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		req, err := a.readAuthBody(w, r)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		playerID, token, err := game.Login(req.Username, req.Password)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		a.json(w, 200, map[string]string{"playerId": playerID, "token": token})
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

// authCredentials 注册/登录共用的请求正文。
type authCredentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// readAuthBody 解析注册/登录正文:JSON 单对象、8 KiB 上限、字段未知即拒。
func (a *API) readAuthBody(w http.ResponseWriter, r *http.Request) (authCredentials, error) {
	var req authCredentials
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		return req, domain.Fail("INVALID_CONTENT_TYPE", "需要 application/json", 415)
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8192))
	if err != nil {
		return req, domain.Fail("BODY_TOO_LARGE", "请求超过 8 KiB", 413)
	}
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&req); err != nil {
		return req, domain.Fail("INVALID_REQUEST", "请求格式或字段无效", 400)
	}
	if err = decoder.Decode(new(any)); err != io.EOF {
		return req, domain.Fail("INVALID_REQUEST", "只接受单个 JSON 对象", 400)
	}
	return req, nil
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
	allowed := map[string][]string{
		"ADVANCE_STORY":     {"nodeId"},
		"START_STORY":       {"nodeId"},
		"INTERACT":          {"interactionId"},
		"REPORT_MOVE":       {"distance"},
		"CHOOSE_EVENT":      {"eventId", "optionId", "usePush"},
		"START_BATTLE":      {"stageId", "returnPosition"},
		"COMPLETE_BATTLE":   {"attemptId", "outcome", "report"},
		"CONTINUE":          {},
		"GO_HOME":           {},
		"GO_EXPLORE":        {"mapId"},
		"PLACE_FURNITURE":   {"furnitureId", "slotId"},
		"DRAW_FURNITURE":    {"poolId"},
		"CHECK_RANDOM_ZONE": {"zoneId"},
		"BUY_FURNITURE":     {"productId"},
	}
	required := map[string][]string{
		"ADVANCE_STORY":   {"nodeId"},
		"START_STORY":     {"nodeId"},
		"INTERACT":        {"interactionId"},
		"CHOOSE_EVENT":    {"eventId", "optionId"},
		"START_BATTLE":    {"stageId"},
		"COMPLETE_BATTLE": {"attemptId", "outcome"},
		"CONTINUE":        {},
		"GO_HOME":         {},
		"GO_EXPLORE":      {},
		"PLACE_FURNITURE": {"furnitureId", "slotId"},
		"DRAW_FURNITURE":  {"poolId"},
		"BUY_FURNITURE":   {"productId"},
	}
	allowedKeys, ok := allowed[kind]
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
		if key != "type" && !domain.Contains(allowedKeys, key) {
			return domain.Fail("INVALID_REQUEST", "命令包含不适用的字段", 400)
		}
	}
	for _, key := range required[kind] {
		var value string
		if err := json.Unmarshal(raw.Command[key], &value); err != nil || value == "" {
			return domain.Fail("INVALID_REQUEST", "命令缺少有效的 "+key, 400)
		}
	}
	if kind == "START_BATTLE" {
		if rawVal, exists := raw.Command["returnPosition"]; exists && (len(rawVal) == 0 || rawVal[0] != '{') {
			return domain.Fail("INVALID_REQUEST", "returnPosition must be an object", 400)
		}
	}
	for _, key := range []string{"report"} {
		if value, exists := raw.Command[key]; exists && (len(value) == 0 || value[0] != '{') {
			return domain.Fail("INVALID_REQUEST", key+" 必须为对象", 400)
		}
	}
	if rawVal, exists := raw.Command["mapId"]; exists {
		var value string
		if err := json.Unmarshal(rawVal, &value); err != nil || value == "" {
			return domain.Fail("INVALID_REQUEST", "命令缺少有效的 mapId", 400)
		}
	}
	// REPORT_MOVE 的 distance 是正整数,不能用上面的字符串必填校验。
	if kind == "REPORT_MOVE" {
		rawVal, exists := raw.Command["distance"]
		var value int
		if !exists || json.Unmarshal(rawVal, &value) != nil || value <= 0 {
			return domain.Fail("INVALID_REQUEST", "命令缺少有效的 distance", 400)
		}
	}
	return nil
}
