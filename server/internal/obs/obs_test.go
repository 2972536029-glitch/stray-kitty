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
