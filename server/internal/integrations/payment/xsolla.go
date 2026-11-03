// xsolla.go:Xsolla 沙盒直付集成——PayStation 重定向 + webhook 异步发货。
// 会话创建走商户 API(Basic 鉴权);webhook 验签按官方规范:请求头
// Authorization: Signature <hex(sha1(rawBody + secretKey))>,secretKey 是
// Publisher Account 项目设置 > Webhooks 里的密钥(不是商户 API key)。
// 2026-10 对照 xsolla/xsolla-sdk-php 源码(TokenRequest / WebhookAuthenticator)核实。
package payment

import (
	"bytes"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/obs"
)

// XsollaConfig 环境注入的凭据与端点;三项凭据齐备即启用 xsolla 形态,否则维持 mock。
type XsollaConfig struct {
	MerchantID    string // 商户 ID
	ProjectID     string // Publisher Account 项目 ID
	APIKey        string // 商户 API key(只在服务端,不进前端/仓库)
	WebhookSecret string // 项目设置 > Webhooks 的 secret key,验签用
	Sandbox       bool
	APIBaseURL    string // 空 = https://api.xsolla.com(测试注入假服务)
	PaystationURL string // 空 = 沙盒/正式 PayStation 入页地址(测试注入假地址)
	ReturnURL     string // 支付后回前端的地址;空 = 不配置跳转,用户留在 PayStation 结果页
}

// Enabled 三项核心凭据齐备才算启用。
func (c XsollaConfig) Enabled() bool {
	return c.MerchantID != "" && c.ProjectID != "" && c.APIKey != ""
}

// ProviderInfo 支付网关形态说明,前端据此切换充值 UI(演示卡号 or 跳转沙盒)。
type ProviderInfo struct {
	Provider string `json:"provider"` // mock | xsolla
	Sandbox  bool   `json:"sandbox"`
}

// SessionResult 一次跳转支付会话;前端拿到 url 整页跳转,发货等 webhook。
type SessionResult struct {
	Provider string `json:"provider"`
	TxnID    string `json:"txnId"`
	URL      string `json:"url"`
	Sandbox  bool   `json:"sandbox"`
}

// XsollaClient 商户 API 客户端:创建支付会话 + webhook 验签。
type XsollaClient struct {
	cfg  XsollaConfig
	http *http.Client
}

// NewXsollaClient 填充默认端点(正式环境);测试用 XsollaConfig 覆盖 APIBaseURL/PaystationURL。
func NewXsollaClient(cfg XsollaConfig) *XsollaClient {
	if cfg.APIBaseURL == "" {
		cfg.APIBaseURL = "https://api.xsolla.com"
	}
	if cfg.PaystationURL == "" {
		if cfg.Sandbox {
			cfg.PaystationURL = "https://sandbox-secure.xsolla.com/paystation4/"
		} else {
			cfg.PaystationURL = "https://secure.xsolla.com/paystation4/"
		}
	}
	return &XsollaClient{cfg: cfg, http: &http.Client{Timeout: 10 * time.Second, Transport: obs.TracedRoundTripper(nil)}}
}

// ProviderInfo 当前形态:xsolla + 沙盒标记。
func (x *XsollaClient) ProviderInfo() ProviderInfo {
	return ProviderInfo{Provider: "xsolla", Sandbox: x.cfg.Sandbox}
}

// CreateSession 生成一笔支付会话。幂等主键 = Xsolla 侧 transaction.id(webhook 里
// 兜底生成 "xs-"+id 的流水号);external_id 需要在发布商账户开启 External ID 选项
// (未开启时 Xsolla 对该字段回 422),项目开启后可恢复携带以实现对账主键前置。
// custom_parameters 捎带 playerId/packId,webhook 里免去任何反查。
// 金额用人民币分换算成元(CNY 两位小数)。
func (x *XsollaClient) CreateSession(playerID string, pack domain.RechargePack) (SessionResult, error) {
	txnID := "xs-" + newTxnID()
	settings := map[string]any{
		"project_id": x.projectID(),
		"language":   "zh",
		"currency":   "CNY",
	}
	if x.cfg.Sandbox {
		settings["mode"] = "sandbox"
	}
	if x.cfg.ReturnURL != "" {
		settings["return_url"] = x.cfg.ReturnURL
		settings["redirect_policy"] = map[string]any{
			"redirect_urls":          map[string]any{"return_url": x.cfg.ReturnURL, "cancel_url": x.cfg.ReturnURL},
			"status_for_redirection": "done",
		}
	}
	payload := map[string]any{
		// 官方 TokenRequest 的嵌套结构:user.id/email 都带一层 {value}。
		// email 用保留域占位,避免沙盒收银台弹出邮箱输入打断演示。
		"user": map[string]any{
			"id":    map[string]any{"value": playerID},
			"email": map[string]any{"value": "player-" + playerID + "@example.com"},
		},
		"settings": settings,
		"purchase": map[string]any{
			"checkout":    map[string]any{"currency": "CNY", "amount": math.Round(float64(pack.PriceCents)) / 100},
			"description": map[string]any{"value": fmt.Sprintf("%s(%d 罐金枪鱼)", pack.Name, pack.TunaGranted)},
		},
		"custom_parameters": map[string]any{"playerId": playerID, "packId": pack.ID},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return SessionResult{}, err
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimSuffix(x.cfg.APIBaseURL, "/")+"/merchant/v2/merchants/"+url.PathEscape(x.cfg.MerchantID)+"/token", bytes.NewReader(raw))
	if err != nil {
		return SessionResult{}, err
	}
	req.SetBasicAuth(x.cfg.MerchantID, x.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := x.http.Do(req)
	if err != nil {
		return SessionResult{}, domain.Fail("XSOLLA_UNAVAILABLE", "支付渠道暂时联系不上，请稍后再试", 502)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		// 带上渠道的具体报错(Xsolla 422 会指明哪个字段不合规),排障不用重放请求。
		detail := strings.TrimSpace(string(respBody))
		if len(detail) > 300 {
			detail = detail[:300]
		}
		return SessionResult{}, domain.Fail("XSOLLA_REJECTED", fmt.Sprintf("支付渠道创建会话失败(%d):%s", resp.StatusCode, detail), 502)
	}
	var token struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(respBody, &token); err != nil || token.Token == "" {
		return SessionResult{}, domain.Fail("XSOLLA_REJECTED", "支付渠道响应格式异常", 502)
	}
	return SessionResult{
		Provider: "xsolla",
		TxnID:    txnID,
		URL:      strings.TrimSuffix(x.cfg.PaystationURL, "/") + "/?token=" + url.QueryEscape(token.Token),
		Sandbox:  x.cfg.Sandbox,
	}, nil
}

func (x *XsollaClient) projectID() int {
	id, err := strconv.Atoi(x.cfg.ProjectID)
	if err != nil {
		return 0
	}
	return id
}

// VerifyWebhook 校验官方签名:Authorization: Signature <40位hex>,hex(sha1(body + secretKey))。
// 常量时间比较,防时序侧信道;格式或签名不对一律 false。
func (x *XsollaClient) VerifyWebhook(body []byte, authHeader string) bool {
	const prefix = "Signature "
	if !strings.HasPrefix(authHeader, prefix) {
		return false
	}
	got := strings.TrimPrefix(authHeader, prefix)
	// 显式拼接,不 append 到 body 上(避免复用调用方底层数组的别名副作用)。
	buf := make([]byte, 0, len(body)+len(x.cfg.WebhookSecret))
	buf = append(buf, body...)
	buf = append(buf, x.cfg.WebhookSecret...)
	sum := sha1.Sum(buf)
	want := hex.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(want), []byte(got)) == 1
}

// xsollaWebhook 只解析我们用得到的字段;transaction.id 在支付通知里是数字,宽松取字符串。
type xsollaWebhook struct {
	NotificationType string `json:"notification_type"`
	Transaction      struct {
		ID         any    `json:"id"`
		ExternalID string `json:"external_id"`
	} `json:"transaction"`
	Purchase struct {
		Checkout struct {
			Amount   float64 `json:"amount"`
			Currency string  `json:"currency"`
		} `json:"checkout"`
	} `json:"purchase"`
	User struct {
		ID any `json:"id"`
	} `json:"user"`
	CustomParameters struct {
		PlayerID string `json:"playerId"`
		PackID   string `json:"packId"`
	} `json:"custom_parameters"`
}

// webhookPlayerID 优先 custom_parameters.playerId(会话创建时由我们写入),兜底 user.id。
// user.id 在通知里可能是字符串或 {value:{...}} 嵌套,这里宽松兼容字符串形态。
func (n *xsollaWebhook) webhookPlayerID() string {
	if n.CustomParameters.PlayerID != "" {
		return n.CustomParameters.PlayerID
	}
	switch v := n.User.ID.(type) {
	case string:
		return v
	case map[string]any:
		if inner, ok := v["value"].(string); ok {
			return inner
		}
	}
	return ""
}

// webhookTxnID external_id(我们生成的 xs-* 流水号)优先,兜底渠道流水号。
func (n *xsollaWebhook) webhookTxnID() string {
	if n.Transaction.ExternalID != "" {
		return n.Transaction.ExternalID
	}
	switch v := n.Transaction.ID.(type) {
	case string:
		return "xs-" + v
	case float64:
		return "xs-" + strconv.FormatInt(int64(v), 10)
	}
	return ""
}

// CreditCaller webhook 收到成功支付后,把流水交给游戏侧入账;返回 error 时
// webhook 回 502 触发 Xsolla 重试(账本 RecordIfNew + 游戏侧同号去重保证重试不双发)。
type CreditCaller func(playerID string, txn domain.Txn, pack domain.RechargePack) error

// NewGameCreditCaller 调游戏服务 POST /internal/credit;internalToken 为集群内部共享密钥。
func NewGameCreditCaller(baseURL, internalToken string) CreditCaller {
	client := &http.Client{Timeout: 5 * time.Second, Transport: obs.TracedRoundTripper(nil)}
	return func(playerID string, txn domain.Txn, pack domain.RechargePack) error {
		body, err := json.Marshal(map[string]any{"playerId": playerID, "txn": txn, "pack": pack})
		if err != nil {
			return err
		}
		req, err := http.NewRequest(http.MethodPost, strings.TrimSuffix(baseURL, "/")+"/internal/credit", bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		if internalToken != "" {
			req.Header.Set("X-Internal-Token", internalToken)
		}
		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("game credit endpoint returned %d: %s", resp.StatusCode, string(raw))
	}
}
