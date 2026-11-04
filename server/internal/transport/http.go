package transport

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/obs"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/service"
	"strings"
	"sync/atomic"
	"time"
)

// PaymentGateway 支付能力:进程内网关(单机形态)与远程客户端(拆分形态)都实现它,
// 充值/流水 HTTP 契约对前端保持不变。Session/Provider 是 Xsolla 跳转形态的能力:
// mock 形态下 Session 返回 409,Provider 恒报 mock,前端据此保持卡号 UI。
type PaymentGateway interface {
	// ctx-first:拆分形态下这些方法会发出站 HTTP,必须携带请求上下文,
	// trace 才能跨进程延续(否则每个出站请求都会另起新 trace,链路断裂)。
	Charge(ctx context.Context, playerID, packID, cardNumber string) (payment.ChargeResult, error)
	History(ctx context.Context, playerID string) ([]domain.Txn, error)
	HealingMessage() string
	Session(ctx context.Context, playerID, packID string) (payment.SessionResult, error)
	Provider(ctx context.Context) payment.ProviderInfo
}

type API struct {
	game          *service.Game
	pay           PaymentGateway
	internalToken string
	requests      atomic.Uint64
	failures      atomic.Uint64
}

func New(game *service.Game, pay PaymentGateway, webDir string) http.Handler {
	a := &API{game: game, pay: pay, internalToken: os.Getenv("INTERNAL_TOKEN")}
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
		obs.Incr("kitty.session.started")
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
	mux.HandleFunc("GET /api/v1/qa", func(w http.ResponseWriter, r *http.Request) {
		token, err := a.token(r)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		tools, err := game.QATools(token)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		a.json(w, 200, tools)
	})
	mux.HandleFunc("POST /api/v1/commands", func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		// command.type 是 validateCommand 校验过的有限枚举;校验前的非法输入
		// 一律保持 unknown,不把用户构造的任意字符串放进 tag(低基数纪律)。
		commandKind := "unknown"
		emit := func(result string) {
			obs.Incr("kitty.command", "type:"+commandKind, "result:"+result)
			obs.Histogram("kitty.command.duration_ms", float64(time.Since(start).Microseconds())/1000, "type:"+commandKind)
		}
		token, err := a.token(r)
		if err != nil {
			emit("rejected")
			a.fail(w, r, err)
			return
		}
		if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
			emit("rejected")
			a.fail(w, r, domain.Fail("INVALID_CONTENT_TYPE", "需要 application/json", 415))
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8192))
		if err != nil {
			emit("rejected")
			a.fail(w, r, domain.Fail("BODY_TOO_LARGE", "请求超过 8 KiB", 413))
			return
		}
		var req domain.CommandRequest
		decoder := json.NewDecoder(strings.NewReader(string(body)))
		decoder.DisallowUnknownFields()
		if err = decoder.Decode(&req); err != nil {
			emit("rejected")
			a.fail(w, r, domain.Fail("INVALID_REQUEST", "请求格式或字段无效", 400))
			return
		}
		if err = decoder.Decode(new(any)); err != io.EOF {
			emit("rejected")
			a.fail(w, r, domain.Fail("INVALID_REQUEST", "只接受单个 JSON 对象", 400))
			return
		}
		if err = validateCommand(body, req.Command.Type); err != nil {
			emit("rejected")
			a.fail(w, r, err)
			return
		}
		commandKind = req.Command.Type
		obs.TagCtx(r.Context(), "command.type", commandKind)
		result, err := game.Execute(token, r.Header.Get("Idempotency-Key"), req)
		if err != nil {
			emit(domain.ClassifyFault(err))
			a.fail(w, r, err)
			return
		}
		// replayed 是幂等回执命中,不是又一次成交,单列一个 result 防止重复计数。
		if result.Replayed {
			emit("replayed")
		} else {
			emit("success")
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
		result, err := a.pay.Charge(r.Context(), req.PlayerID, req.PackID, req.CardNumber)
		if err != nil {
			obs.Incr("kitty.payment.charge", "result:"+domain.ClassifyFault(err))
			a.fail(w, r, err)
			return
		}
		// declined 是正常业务(HTTP 200 + 治愈文案),与 success 同为支付结果,
		// 只有 result:error(系统故障)进故障告警。
		if result.Txn.Status == "declined" {
			obs.Incr("kitty.payment.charge", "result:declined")
		} else {
			obs.Incr("kitty.payment.charge", "result:success")
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
		txns, err := a.pay.History(r.Context(), playerID)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		a.json(w, 200, map[string]any{"playerId": playerID, "txns": txns})
	})
	// Xsolla 沙盒:前端先问形态(mock=卡号 UI / xsolla=跳转 UI),再换跳转链接;
	// 发货只发生在 webhook → 支付服务 → /internal/credit 链路上,前端返回页不发货。
	mux.HandleFunc("GET /api/payment/config", func(w http.ResponseWriter, r *http.Request) {
		a.json(w, 200, a.pay.Provider(r.Context()))
	})
	mux.HandleFunc("POST /api/payment/session", func(w http.ResponseWriter, r *http.Request) {
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
			PlayerID string `json:"playerId"`
			PackID   string `json:"packId"`
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
		result, err := a.pay.Session(r.Context(), req.PlayerID, req.PackID)
		if err != nil {
			obs.Incr("kitty.payment.session", "result:"+domain.ClassifyFault(err))
			a.fail(w, r, err)
			return
		}
		obs.Incr("kitty.payment.session", "result:success")
		a.json(w, 200, result)
	})
	// 支付服务 webhook 收款后的内部入账口:仅集群内调用,INTERNAL_TOKEN 未配置时整个端点关闭。
	mux.HandleFunc("POST /internal/credit", func(w http.ResponseWriter, r *http.Request) {
		if a.internalToken == "" {
			a.fail(w, r, domain.Fail("NOT_FOUND", "API 路径或方法不存在", 404))
			return
		}
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Internal-Token")), []byte(a.internalToken)) != 1 {
			a.fail(w, r, domain.Fail("UNAUTHORIZED", "内部令牌校验未通过", 401))
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8192))
		if err != nil {
			a.fail(w, r, domain.Fail("BODY_TOO_LARGE", "请求超过 8 KiB", 413))
			return
		}
		var req struct {
			PlayerID string              `json:"playerId"`
			Txn      domain.Txn          `json:"txn"`
			Pack     domain.RechargePack `json:"pack"`
		}
		decoder := json.NewDecoder(strings.NewReader(string(body)))
		decoder.DisallowUnknownFields()
		if err = decoder.Decode(&req); err != nil {
			a.fail(w, r, domain.Fail("INVALID_REQUEST", "请求格式或字段无效", 400))
			return
		}
		if req.PlayerID == "" || req.Txn.ID == "" || req.Pack.ID == "" {
			a.fail(w, r, domain.Fail("INVALID_REQUEST", "缺少 playerId、txn 或 pack", 400))
			return
		}
		balance, err := a.game.ApplyCharge(req.PlayerID, req.Txn, req.Pack)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		a.json(w, 200, map[string]any{"tunaBalance": balance})
	})
	mux.HandleFunc("POST /api/v1/advisor", a.advise)
	// 账号体系:注册把当前匿名进度绑到用户名密码;登录在任意设备取回进度。
	mux.HandleFunc("POST /api/auth/register", func(w http.ResponseWriter, r *http.Request) {
		emit := func(result string) { obs.Incr("kitty.auth.register", "result:"+result) }
		token, err := a.token(r)
		if err != nil {
			emit(domain.ClassifyFault(err))
			a.fail(w, r, err)
			return
		}
		req, err := a.readAuthBody(w, r)
		if err != nil {
			emit(domain.ClassifyFault(err))
			a.fail(w, r, err)
			return
		}
		username, err := game.Register(token, req.Username, req.Password)
		if err != nil {
			emit(domain.ClassifyFault(err))
			a.fail(w, r, err)
			return
		}
		emit("success")
		a.json(w, 201, map[string]string{"username": username})
	})
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		// code tag 携带有限错误码枚举(BAD_CREDENTIALS 等),登录爆破监控按它区分
		// "输错密码"与"格式问题"。
		emit := func(result, code string) { obs.Incr("kitty.auth.login", "result:"+result, "code:"+code) }
		req, err := a.readAuthBody(w, r)
		if err != nil {
			emit(domain.ClassifyFault(err), domain.FaultCode(err))
			a.fail(w, r, err)
			return
		}
		playerID, token, err := game.Login(req.Username, req.Password)
		if err != nil {
			emit(domain.ClassifyFault(err), domain.FaultCode(err))
			a.fail(w, r, err)
			return
		}
		emit("success", "ok")
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
			// Nginx reads the upstream response priority before scheduling HTTP/2
			// DATA, so small API replies can precede in-flight scene images.
			w.Header().Set("Priority", "u=0")
		}
		// 预匹配一次拿路由模板(mux.Handler 只匹配不执行 handler)。
		// 未匹配路径回退固定值:原始路径是用户可任意构造的高基数来源,
		// 直接进 metric tag 会制造无限时间序列。
		_, pattern := mux.Handler(r)
		if pattern == "" {
			pattern = "unmatched"
		}
		route := obs.SanitizeRoute(pattern)
		span, ctx := obs.StartWebSpan(r.Context(), r.Header, "http.request", r.Method+" "+route)
		span.SetTag("http.method", r.Method)
		span.SetTag("http.route", route)
		span.SetTag("http.url", r.URL.Path)
		sw := &obs.StatusWriter{ResponseWriter: w}
		start := time.Now()
		defer func() {
			if recovered := recover(); recovered != nil {
				span.SetTag("error", true)
				span.SetTag("panic", fmt.Sprint(recovered))
				a.fail(sw, r, domain.Fail("INTERNAL_ERROR", "服务暂时不可用", 500))
			}
			durMS := float64(time.Since(start).Microseconds()) / 1000
			status := sw.Status
			if status == 0 {
				status = http.StatusOK
			}
			obs.FinishWeb(span, status)
			obs.HTTPMetrics(r.Method, route, status, durMS)
			obs.LogInfo(ctx, "http request", "method", r.Method, "path", r.URL.Path, "route", route,
				"status", status, "duration_ms", durMS, "request_id", id)
		}()
		mux.ServeHTTP(sw, r.WithContext(ctx))
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
	obs.TagCtx(r.Context(), "error.code", fault.Code)
	a.json(w, fault.Status, map[string]any{"error": map[string]string{"code": fault.Code, "message": fault.Message, "requestId": w.Header().Get("X-Request-Id")}})
}

func validateCommand(body []byte, kind string) error {
	allowed := map[string][]string{
		"ADVANCE_STORY":       {"nodeId"},
		"START_STORY":         {"nodeId"},
		"INTERACT":            {"interactionId", "layer", "position"},
		"REPORT_MOVE":         {"distance"},
		"CHOOSE_EVENT":        {"eventId", "optionId", "usePush"},
		"START_BATTLE":        {"stageId", "returnPosition", "layer"},
		"COMPLETE_BATTLE":     {"attemptId", "outcome", "report"},
		"QA_SIMULATE_VICTORY": {"attemptId"},
		"QA_SIMULATE_DEFEAT":  {"attemptId"},
		"QA_CHECKPOINT":       {"checkpointId"},
		"QA_RESTORE":          {},
		"CONTINUE":            {},
		"GO_HOME":             {},
		"GO_EXPLORE":          {"mapId"},
		"EXIT_MARKET":         {"layer", "position"},
		"PLACE_FURNITURE":     {"furnitureId", "slotId"},
		"SAVE_HOME_LAYOUT":    {"changes"},
		"DRAW_FURNITURE":      {"poolId", "count"},
		"CLAIM_PARCEL_REWARD": {"rewardId"},
		"CHECK_RANDOM_ZONE":   {"zoneId", "layer", "position"},
		"BUY_FURNITURE":       {"productId"},
		"REPAIR_HOME":         {"repairId"},
	}
	required := map[string][]string{
		"ADVANCE_STORY":       {"nodeId"},
		"START_STORY":         {"nodeId"},
		"INTERACT":            {"interactionId"},
		"CHOOSE_EVENT":        {"eventId", "optionId"},
		"START_BATTLE":        {"stageId"},
		"COMPLETE_BATTLE":     {"attemptId", "outcome"},
		"QA_SIMULATE_VICTORY": {"attemptId"},
		"QA_SIMULATE_DEFEAT":  {"attemptId"},
		"QA_CHECKPOINT":       {"checkpointId"},
		"QA_RESTORE":          {},
		"CONTINUE":            {},
		"GO_HOME":             {},
		"GO_EXPLORE":          {},
		"EXIT_MARKET":         {"layer", "position"},
		"PLACE_FURNITURE":     {"furnitureId", "slotId"},
		"SAVE_HOME_LAYOUT":    {"changes"},
		"DRAW_FURNITURE":      {"poolId"},
		"CLAIM_PARCEL_REWARD": {"rewardId"},
		"BUY_FURNITURE":       {"productId"},
		"REPAIR_HOME":         {},
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
	if value, exists := raw.Command["count"]; exists {
		var count int
		if json.Unmarshal(value, &count) != nil || (count != 1 && count != 10) {
			return domain.Fail("INVALID_REQUEST", "count 只接受 1 或 10", 400)
		}
	}
	for key := range raw.Command {
		if key != "type" && !domain.Contains(allowedKeys, key) {
			return domain.Fail("INVALID_REQUEST", "命令包含不适用的字段", 400)
		}
	}
	if value, exists := raw.Command["repairId"]; exists {
		var id string
		if json.Unmarshal(value, &id) != nil || id == "" {
			return domain.Fail("INVALID_REQUEST", "repairId 必须为非空字符串", 400)
		}
	}
	for _, key := range required[kind] {
		if key == "changes" {
			var changes []map[string]json.RawMessage
			if json.Unmarshal(raw.Command[key], &changes) != nil || len(changes) < 1 || len(changes) > 96 {
				return domain.Fail("INVALID_REQUEST", "changes 需要 1 到 96 项", 400)
			}
			for _, change := range changes {
				if len(change) != 4 {
					return domain.Fail("INVALID_REQUEST", "每项必须包含 key、x、y、stored", 400)
				}
				for _, field := range []string{"key", "x", "y", "stored"} {
					if value, ok := change[field]; !ok || string(value) == "null" {
						return domain.Fail("INVALID_REQUEST", "布局字段不能为空", 400)
					}
				}
			}
			continue
		}
		if key == "position" {
			var point map[string]json.RawMessage
			if json.Unmarshal(raw.Command[key], &point) != nil || point == nil {
				return domain.Fail("INVALID_REQUEST", "position 必须为坐标对象", 400)
			}
			for _, axis := range []string{"x", "y"} {
				var value float64
				coordinate, exists := point[axis]
				if !exists || string(coordinate) == "null" || json.Unmarshal(coordinate, &value) != nil {
					return domain.Fail("INVALID_REQUEST", "position 必须包含数值 x 和 y", 400)
				}
			}
			continue
		}
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
