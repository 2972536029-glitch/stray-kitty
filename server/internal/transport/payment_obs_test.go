package transport_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/obs"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
)

// startUDPStatsd 起本地 UDP 收包器并把 obs 指标客户端指向它(观测旁路测试夹具)。
// 返回 drain:截止时间内把收到的 statsd 包读出来,用于断言埋点真的发出。
func startUDPStatsd(t *testing.T) func() []string {
	t.Helper()
	pc, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pc.Close() })
	t.Setenv("DD_DOGSTATSD_PORT_8125_ADDR", pc.LocalAddr().String())
	t.Setenv("DD_TRACE_ENABLED", "false")
	t.Setenv("DD_INSTRUMENTATION_TELEMETRY_ENABLED", "false")
	obs.Init("kitty-test-m3")
	t.Cleanup(obs.Shutdown)
	return func() []string {
		// datadog-go v5 默认对 Count 做客户端聚合(2s 刷新一次),直方图直发。
		// 收包前先等一个刷新周期,否则 count 包还留在客户端聚合器里。
		time.Sleep(2300 * time.Millisecond)
		var out []string
		buf := make([]byte, 4096)
		for {
			pc.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
			n, _, err := pc.ReadFrom(buf)
			if err != nil {
				return out
			}
			out = append(out, string(buf[:n]))
		}
	}
}

// stubSessionGateway 只为 session 成功路径服务:mock 形态 Session 恒 409,
// 无法在 HTTP 层触发漏斗第一步,用桩网关补上该分支。
type stubSessionGateway struct{}

func (stubSessionGateway) Charge(context.Context, string, string, string) (payment.ChargeResult, error) {
	return payment.ChargeResult{}, errors.New("unused in this test")
}
func (stubSessionGateway) History(context.Context, string) ([]domain.Txn, error) { return nil, nil }
func (stubSessionGateway) HealingMessage() string                                { return "" }
func (stubSessionGateway) Session(context.Context, string, string) (payment.SessionResult, error) {
	return payment.SessionResult{Provider: "xsolla", TxnID: "txn-stub", URL: "https://sandbox.example/pay"}, nil
}
func (stubSessionGateway) Provider(context.Context) payment.ProviderInfo {
	return payment.ProviderInfo{Provider: "xsolla"}
}

// countPackets 统计包含指定子串的 statsd 包数量。
func countPackets(packets []string, needle string) int {
	count := 0
	for _, p := range packets {
		if strings.Contains(p, needle) {
			count++
		}
	}
	return count
}

// TestPaymentFunnelEmissions:漏斗步分支覆盖——每笔 charge 一条 attempt;
// success/declined 各自的终点步;mock 会话 409 不产生 session_created。
func TestPaymentFunnelEmissions(t *testing.T) {
	drain := startUDPStatsd(t)
	store, _ := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	catalog, _ := platform.LoadCatalog()
	handler := transport.New(service.New(store, catalog), payment.New(store, catalog), "")
	player := createPlayer(t, handler)
	charge := func(card string) {
		r := httptest.NewRequest("POST", "/api/payment/charge", strings.NewReader(`{"playerId":"`+player+`","packId":"pack_small","cardNumber":"`+card+`"}`))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatalf("charge %s: %d %s", card, w.Code, w.Body.String())
		}
	}
	charge("4242424242424242")
	charge("0000123412341234")
	// mock 形态 session 恒 409(前端据 Provider 切卡号 UI),漏斗不应有 session_created。
	r := httptest.NewRequest("POST", "/api/payment/session", strings.NewReader(`{"playerId":"`+player+`","packId":"pack_small"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 409 {
		t.Fatalf("mock session must be 409: %d", w.Code)
	}
	packets := drain()
	if got := sumFunnel(packets, "step:charge_attempt"); got != 2 {
		t.Fatalf("charge_attempt count = %d, want 2; packets: %v", got, packets)
	}
	if got := sumFunnel(packets, "step:charge_success"); got != 1 {
		t.Fatalf("charge_success count = %d, want 1", got)
	}
	if got := sumFunnel(packets, "step:charge_declined"); got != 1 {
		t.Fatalf("charge_declined count = %d, want 1", got)
	}
	if strings.Contains(strings.Join(packets, "\n"), "step:session_created") {
		t.Fatal("mock session 409 must not emit session_created")
	}
}

// TestSessionIdentityInLogs:Bearer 业务请求日志必须带 player_id/session_id
// (验收 #6);无 token 的请求日志不携带(行为不变)。
func TestSessionIdentityInLogs(t *testing.T) {
	store, _ := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	catalog, _ := platform.LoadCatalog()
	handler := transport.New(service.New(store, catalog), payment.New(store, catalog), "")
	r := httptest.NewRequest("POST", "/api/v1/sessions", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	var created struct {
		PlayerID string `json:"playerId"`
		Token    string `json:"token"`
	}
	json.Unmarshal(w.Body.Bytes(), &created)
	if created.PlayerID == "" || created.Token == "" {
		t.Fatalf("session response missing identity: %s", w.Body.String())
	}

	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	defer slog.SetDefault(previous)

	r = httptest.NewRequest("GET", "/api/v1/state", nil)
	r.Header.Set("Authorization", "Bearer "+created.Token)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("state: %d %s", w.Code, w.Body.String())
	}
	out := buf.String()
	if !strings.Contains(out, "player_id="+created.PlayerID) {
		t.Fatalf("state log missing player_id: %s", out)
	}
	if !strings.Contains(out, "session_id="+service.LogSessionID(created.Token)) {
		t.Fatalf("state log missing session_id: %s", out)
	}
	if strings.Contains(out, created.Token) || strings.Contains(out, service.Hash(created.Token)) {
		t.Fatal("state log exposed bearer token or storage lookup hash")
	}

	buf.Reset()
	r = httptest.NewRequest("GET", "/api/v1/content", nil)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if strings.Contains(buf.String(), "player_id=") {
		t.Fatalf("content request must not carry identity: %s", buf.String())
	}
}

// sumFunnel 求 kitty.payment.funnel 中指定 step 的计数和(datadog-go 客户端
// 聚合会把同 step 的计数合并成一个包,值相加;客户端标签排在自定义 tag 前,
// 不能按 "#step:..." 前缀匹配)。
func sumFunnel(packets []string, step string) int {
	total := 0
	for _, packet := range packets {
		for _, line := range strings.Split(packet, "\n") {
			if !strings.Contains(line, "kitty.payment.funnel") || !strings.Contains(line, step) {
				continue
			}
			value := strings.SplitN(line, ":", 2)
			if len(value) != 2 {
				continue
			}
			n, err := strconv.Atoi(strings.Split(value[1], "|")[0])
			if err == nil {
				total += n
			}
		}
	}
	return total
}

// TestPaymentFunnelSessionCreated:xsolla 形态下会话创建成功 = 漏斗第一步,
// 用桩网关触发(mock 恒 409 走不到);响应体必须原样返回(200 + url)。
func TestPaymentFunnelSessionCreated(t *testing.T) {
	drain := startUDPStatsd(t)
	store, _ := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	catalog, _ := platform.LoadCatalog()
	handler := transport.New(service.New(store, catalog), stubSessionGateway{}, "")
	r := httptest.NewRequest("POST", "/api/payment/session", strings.NewReader(`{"playerId":"p1","packId":"pack_small"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("session: %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"url"`) {
		t.Fatalf("session response lost url: %s", w.Body.String())
	}
	packets := drain()
	total := 0
	for _, packet := range packets {
		for _, line := range strings.Split(packet, "\n") {
			if strings.Contains(line, "kitty.payment.funnel") && strings.Contains(line, "step:session_created") {
				n, _ := strconv.Atoi(strings.Split(strings.SplitN(line, ":", 2)[1], "|")[0])
				total += n
			}
		}
	}
	if total != 1 {
		t.Fatalf("session_created total = %d, want 1", total)
	}
}
