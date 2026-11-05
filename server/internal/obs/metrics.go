package obs

import (
	"github.com/DataDog/datadog-go/v5/statsd"
)

// Metrics 是 DogStatsD 指标封装（UDP fire-and-forget）。
// 没有 Datadog Agent 时消息静默丢弃，不影响业务。
//
// 命名规范（OBSERVABILITY.md §指标字典）：一律 kitty. 前缀，
// 因为这是团队共享 org，不能让裸名的 http.requests 与其他项目撞名：
//
//	kitty.http.requests / kitty.http.request_duration_ms（TraceMiddleware 自动发）
//	kitty.command / kitty.command.duration_ms / kitty.auth.* / kitty.session.started
//	kitty.payment.* / kitty.advisor.* / kitty.repo.*
type Metrics struct {
	client *statsd.Client
}

// newMetrics 连接 DogStatsD。地址默认 127.0.0.1:8125（本机装 Agent 即自动上报）；
// 容器/K8s 里用 DD_DOGSTATSD_PORT_8125_ADDR 或 DD_AGENT_HOST 指向 Agent。
func newMetrics(service string) *Metrics {
	addr := envOr("DD_DOGSTATSD_PORT_8125_ADDR", hostOr("127.0.0.1")+":8125")
	c, err := statsd.New(addr,
		statsd.WithTags([]string{
			"service:" + service,
			"env:" + envOr("DD_ENV", "dev"),
			"version:" + envOr("DD_VERSION", "0.1.0"),
			"team:" + envOr("DD_TEAM", "stray-kitty"),
		}),
		statsd.WithoutTelemetry(),
	)
	if err != nil {
		// 只有地址非法才会走到这里；保持 no-op，业务永远不因指标失败
		return &Metrics{}
	}
	return &Metrics{client: c}
}

// hostOr 返回 DD_AGENT_HOST（容器形态 Agent 的主机名）或默认值。
func hostOr(def string) string { return envOr("DD_AGENT_HOST", def) }

// Incr 计数 +1。tags 形如 "type:BUY_FURNITURE"。全线程安全；未初始化时 no-op。
func Incr(name string, tags ...string) {
	m := metrics()
	if m == nil {
		return
	}
	m.Incr(name, tags...)
}

// Count records an amount, rather than the number of operations that changed it.
// Like Incr it is fire-and-forget and a no-op before Init.
func Count(name string, value int64, tags ...string) {
	m := metrics()
	if m == nil {
		return
	}
	m.Count(name, value, tags...)
}

// Histogram 分布（p95 用）。未初始化时 no-op。
func Histogram(name string, value float64, tags ...string) {
	m := metrics()
	if m == nil {
		return
	}
	m.Histogram(name, value, tags...)
}

// Gauge 瞬时值。未初始化时 no-op。
func Gauge(name string, value float64, tags ...string) {
	m := metrics()
	if m == nil {
		return
	}
	m.Gauge(name, value, tags...)
}

// Incr / Histogram / Gauge 的实例方法（默认客户端内部用）。

func (m *Metrics) Incr(name string, tags ...string) {
	if m == nil || m.client == nil {
		return
	}
	_ = m.client.Incr(name, tags, 1)
}

func (m *Metrics) Count(name string, value int64, tags ...string) {
	if m == nil || m.client == nil {
		return
	}
	_ = m.client.Count(name, value, tags, 1)
}

func (m *Metrics) Histogram(name string, value float64, tags ...string) {
	if m == nil || m.client == nil {
		return
	}
	_ = m.client.Histogram(name, value, tags, 1)
}

func (m *Metrics) Gauge(name string, value float64, tags ...string) {
	if m == nil || m.client == nil {
		return
	}
	_ = m.client.Gauge(name, value, tags, 1)
}

// Close 在进程退出时调用。
func (m *Metrics) Close() {
	if m != nil && m.client != nil {
		_ = m.client.Close()
	}
}
