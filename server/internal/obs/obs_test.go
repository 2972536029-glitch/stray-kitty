package obs

import (
	"net/http"
	"testing"
)

func TestSanitizeRoute(t *testing.T) {
	cases := map[string]string{
		"GET /api/v1/content":   "/api/v1/content", // 方法前缀剥离(method 是独立 tag,空格会破坏 monitor query)
		"POST /api/v1/commands": "/api/v1/commands",
		"GET /api/trips/{id}":   "/api/trips/:id", // 通配符规范化(为未来路由预留)
		"/":                     "static",         // 静态托管统一归类,避免所有资产混进一个序列
		"":                      "",
	}
	for in, want := range cases {
		if got := SanitizeRoute(in); got != want {
			t.Errorf("SanitizeRoute(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestStatusClass(t *testing.T) {
	cases := map[int]string{200: "2xx", 302: "3xx", 404: "4xx", 500: "5xx", 502: "5xx"}
	for code, want := range cases {
		if got := statusClass(code); got != want {
			t.Errorf("statusClass(%d) = %q, want %q", code, got, want)
		}
	}
}

// 未 Init 时一切 no-op:这是"观测不参与业务"纪律的回归测试。
// 若未来有人让包级函数在未初始化时 panic 或落盘,这里会炸。
func TestNoopWithoutInit(t *testing.T) {
	defaultMetrics = nil
	defaultService = ""
	Incr("kitty.command", "type:X", "result:success")
	Histogram("kitty.command.duration_ms", 1.0)
	Gauge("kitty.repo.state_size_bytes", 1.0)
	HTTPMetrics("GET", "/healthz", http.StatusOK, 1.0)
	LogInfo(t.Context(), "should not panic without init")
}

// Init 之后 tracer 必须真正启动:span 要有非零 trace id,否则日志关联与 APM 全部静默失效
// (首个联调版本的真实事故:Init 漏调 initTracer,一切"看起来正常"但三支柱缺 Trace)。
func TestInitStartsTracer(t *testing.T) {
	Init("kitty-test")
	defer Shutdown()
	span, ctx := StartWebSpan(t.Context(), http.Header{}, "http.request", "GET /test")
	if span == nil {
		t.Fatal("StartWebSpan returned nil span")
	}
	traceID, spanID := traceIDs(ctx)
	if traceID == "" || spanID == "" {
		t.Fatalf("expected non-empty decimal trace/span ids after Init, got trace=%q span=%q", traceID, spanID)
	}
	span.Finish()
}
