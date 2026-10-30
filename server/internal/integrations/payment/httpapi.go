// httpapi.go:支付服务的集群内 HTTP 接口(仅供游戏服务调用,不直接暴露公网)。
// POST /internal/charge 判定并落权威账本;GET /internal/history 查询充值流水;
// 健康端点供 K8s 探针。入账(金枪鱼加到存档)由游戏侧完成,支付服务不碰游戏存档。
// Xsolla 形态额外叠加:POST /internal/session 创建跳转会话、POST /webhook/xsolla
// 接收渠道异步通知(唯一需要经反代暴露公网的路径)、GET /internal/provider 网关形态。
package payment

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"stray-kitty/server/internal/domain"
)

// NewServiceHTTP 构建 mock 形态(演示卡号)的支付服务 http.Handler。
func NewServiceHTTP(gateway *Gateway, ledger Ledger) http.Handler {
	return newServiceHTTP(gateway, ledger, nil, nil)
}

// NewXsollaServiceHTTP 在既有接口之上叠加 Xsolla 会话与 webhook 端点。
// credit 为 webhook 收款后的游戏侧入账回调,nil 表示只记账不回调(单独联调支付服务时)。
func NewXsollaServiceHTTP(gateway *Gateway, ledger Ledger, client *XsollaClient, credit CreditCaller) http.Handler {
	return newServiceHTTP(gateway, ledger, client, credit)
}

func newServiceHTTP(gateway *Gateway, ledger Ledger, xsolla *XsollaClient, credit CreditCaller) http.Handler {
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

	// 网关形态:mock 恒可用;xsolla 形态由游戏侧远程查询,前端据此切换充值 UI。
	provider := ProviderInfo{Provider: "mock"}
	if xsolla != nil {
		provider = xsolla.ProviderInfo()
	}
	mux.HandleFunc("GET /internal/provider", func(w http.ResponseWriter, r *http.Request) {
		write(w, 200, provider)
	})

	if xsolla != nil {
		// 创建跳转支付会话:金额与档位都在服务端定,前端只传 playerId/packId。
		mux.HandleFunc("POST /internal/session", func(w http.ResponseWriter, r *http.Request) {
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
				PlayerID string `json:"playerId"`
				PackID   string `json:"packId"`
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
			pack, ok := gateway.FindPack(req.PackID)
			if !ok {
				fail(w, r, domain.Fail("PACK_NOT_FOUND", "补给小站没有这档罐头", 404))
				return
			}
			result, err := xsolla.CreateSession(req.PlayerID, pack)
			if err != nil {
				fail(w, r, err)
				return
			}
			write(w, 200, result)
		})

		// Xsolla 异步通知:验签 → 解析 → 幂等落账 → 回调游戏侧入账。
		// 全部成功才回 200;落账成功但入账失败回 502,由 Xsolla 重试兜底
		//(账本 RecordIfNew 与游戏侧同号去重保证重试不双发)。
		mux.HandleFunc("POST /webhook/xsolla", func(w http.ResponseWriter, r *http.Request) {
			body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
			if err != nil {
				fail(w, r, domain.Fail("BODY_TOO_LARGE", "通知体超过 64 KiB", 413))
				return
			}
			if !xsolla.VerifyWebhook(body, r.Header.Get("Authorization")) {
				fail(w, r, domain.Fail("INVALID_SIGNATURE", "通知签名校验未通过", 401))
				return
			}
			var note xsollaWebhook
			if err := json.Unmarshal(body, &note); err != nil {
				fail(w, r, domain.Fail("INVALID_REQUEST", "通知格式无效", 400))
				return
			}
			switch note.NotificationType {
			case "payment":
				playerID, txnID := note.webhookPlayerID(), note.webhookTxnID()
				packID := note.CustomParameters.PackID
				if playerID == "" || txnID == "" || packID == "" {
					// 缺关键字段无法发货,回 5xx 让 Xsolla 重试并留给人工排查。
					slog.Error("xsolla payment webhook missing fields", "playerId", playerID, "txnId", txnID, "packId", packID)
					fail(w, r, domain.Fail("WEBHOOK_INCOMPLETE", "通知缺少发货所需字段", 500))
					return
				}
				pack, ok := gateway.FindPack(packID)
				if !ok {
					slog.Error("xsolla payment webhook unknown pack", "packId", packID)
					fail(w, r, domain.Fail("PACK_NOT_FOUND", "通知引用的档位不存在", 500))
					return
				}
				txn := domain.Txn{
					ID:        txnID,
					PlayerID:  playerID,
					PackID:    packID,
					Amount:    int(math.Round(note.Purchase.Checkout.Amount * 100)),
					Status:    "confirmed",
					Reason:    "Xsolla 沙盒收款",
					CreatedAt: time.Now(),
				}
				isNew, err := ledger.RecordIfNew(txn)
				if err != nil {
					fail(w, r, err)
					return
				}
				// 重复通知也可能发生在"落账成功但入账失败"之后(上一次回了 502),
				// 所以不能因已落账就跳过入账——游戏侧按流水号去重,重放不会双发。
				if !isNew && credit == nil {
					return // 已处理过且无回调,幂等吞掉
				}
				if credit != nil {
					if err := credit(playerID, txn, pack); err != nil {
						slog.Error("xsolla webhook credit failed", "txnId", txnID, "error", err.Error())
						fail(w, r, domain.Fail("CREDIT_FAILED", "入账未完成，等待渠道重试", 502))
						return
					}
				}
			case "refund":
				// 演示范围:退款只留痕不动余额(金枪鱼不追回),上线前需补退款流水与扣回。
				slog.Info("xsolla refund webhook acknowledged (no balance change in demo)", "txnId", note.webhookTxnID())
			default:
				slog.Info("xsolla webhook acknowledged", "type", note.NotificationType)
			}
			w.WriteHeader(http.StatusOK)
		})
	}

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
