// httpapi.go:支付服务的集群内 HTTP 接口(仅供游戏服务调用,不直接暴露公网)。
// POST /internal/charge 判定并落权威账本;GET /internal/history 查询充值流水;
// 健康端点供 K8s 探针。入账(金枪鱼加到存档)由游戏侧完成,支付服务不碰游戏存档。
package payment

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"stray-kitty/server/internal/domain"
)

// NewServiceHTTP 构建支付服务的 http.Handler。
func NewServiceHTTP(gateway *Gateway, ledger Ledger) http.Handler {
	mux := http.NewServeMux()
	var requests, failures atomic.Uint64
	fail := func(w http.ResponseWriter, r *http.Request, err error) {
		failures.Add(1)
		var fault *domain.Fault
		status := 500
		code, msg := "INTERNAL", "支付服务开小差了，请稍后再试"
		if errors.As(err, &fault) {
			status, code, msg = fault.Status, fault.Code, fault.Message
		} else {
			slog.Error("payment service error", "error", err.Error(), "path", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"code": code, "message": msg, "requestId": r.Header.Get("X-Request-ID")}})
	}
	write := func(w http.ResponseWriter, status int, body any) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(body)
	}

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		write(w, 200, map[string]string{"status": "ready", "storage": "payment-ledger"})
	})
	mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		io.WriteString(w, "# TYPE kitty_payment_requests_total counter\nkitty_payment_requests_total "+uitoa(requests.Load())+"\n# TYPE kitty_payment_errors_total counter\nkitty_payment_errors_total "+uitoa(failures.Load())+"\n")
	})

	mux.HandleFunc("POST /internal/charge", func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
			fail(w, r, domain.Fail("INVALID_CONTENT_TYPE", "需要 application/json", 415))
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8192))
		if err != nil {
			fail(w, r, domain.Fail("BODY_TOO_LARGE", "请求超过 8 KiB", 413))
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
			fail(w, r, domain.Fail("INVALID_REQUEST", "请求格式或字段无效", 400))
			return
		}
		if err = decoder.Decode(new(any)); err != io.EOF {
			fail(w, r, domain.Fail("INVALID_REQUEST", "只接受单个 JSON 对象", 400))
			return
		}
		if req.PlayerID == "" || req.PackID == "" {
			fail(w, r, domain.Fail("INVALID_REQUEST", "缺少 playerId 或 packId", 400))
			return
		}
		// 成功与失败双路径都是正常业务(HTTP 200);错误仅限格式与档位问题。
		d, err := gateway.Decide(req.PlayerID, req.PackID, req.CardNumber)
		if err != nil {
			fail(w, r, err)
			return
		}
		if err := ledger.Record(d.Txn); err != nil {
			fail(w, r, err)
			return
		}
		write(w, 200, map[string]any{"txn": d.Txn, "pack": d.Pack})
	})

	mux.HandleFunc("GET /internal/history", func(w http.ResponseWriter, r *http.Request) {
		playerID := strings.TrimSpace(r.URL.Query().Get("playerId"))
		if playerID == "" {
			fail(w, r, domain.Fail("INVALID_REQUEST", "缺少 playerId 查询参数", 400))
			return
		}
		txns, err := ledger.History(playerID)
		if err != nil {
			fail(w, r, err)
			return
		}
		write(w, 200, map[string]any{"playerId": playerID, "txns": txns})
	})

	wrapped := http.TimeoutHandler(mux, 10*time.Second, `{"error":{"code":"TIMEOUT","message":"支付服务响应超时"}}`)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		start := time.Now()
		wrapped.ServeHTTP(w, r)
		slog.Info("payment http request", "method", r.Method, "path", r.URL.Path, "duration_ms", time.Since(start).Milliseconds(), "request_id", r.Header.Get("X-Request-ID"))
	})
}

func uitoa(v uint64) string {
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}
