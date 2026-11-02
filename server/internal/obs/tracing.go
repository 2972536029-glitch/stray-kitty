package obs

import (
	"context"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/DataDog/dd-trace-go/v2/ddtrace/tracer"
)

// initTracer 启动全局 tracer。env / version / team 通过 DD_ENV、DD_VERSION、DD_TEAM
// 环境变量注入（统一服务标签），span 上自动携带。
func initTracer(service string) (stop func()) {
	tracer.Start(
		tracer.WithService(service),
		tracer.WithEnv(envOr("DD_ENV", "dev")),
		tracer.WithServiceVersion(envOr("DD_VERSION", "0.1.0")),
		tracer.WithGlobalTag("team", envOr("DD_TEAM", "stray-kitty")),
	)
	return func() {}
}

func stopTracer() { tracer.Stop() }

// headerCarrier 让 http.Header 可以作为 Datadog 的 TextMap 载体，
// 跨服务上下文透传（x-datadog-* / traceparent）都走它。
type headerCarrier http.Header

func (h headerCarrier) Set(key, val string) { http.Header(h).Set(key, val) }

func (h headerCarrier) ForeachKey(handler func(key, val string) error) error {
	for k, vs := range h {
		for _, v := range vs {
			if err := handler(k, v); err != nil {
				return err
			}
		}
	}
	return nil
}

// InjectHeaders 把当前 ctx 的 trace 上下文写进请求头（跨服务透传的发送端）。
func InjectHeaders(ctx context.Context, h http.Header) {
	if span, ok := tracer.SpanFromContext(ctx); ok {
		_ = tracer.Inject(span.Context(), headerCarrier(h))
	}
}

// TraceIDFromContext 返回当前 trace id（128 位 hex，Datadog UI 可直接搜索）。
func TraceIDFromContext(ctx context.Context) string {
	if span, ok := tracer.SpanFromContext(ctx); ok {
		return span.Context().TraceID()
	}
	return ""
}

// SpanFromContext 返回当前 ctx 的 span（可能为 no-op）。
func SpanFromContext(ctx context.Context) *tracer.Span {
	span, _ := tracer.SpanFromContext(ctx)
	return span
}

// TagCtx 给当前 ctx 的 span 打业务 tag（如 command.type）；无 span 时静默跳过。
func TagCtx(ctx context.Context, key, value string) {
	if span, ok := tracer.SpanFromContext(ctx); ok {
		span.SetTag(key, value)
	}
}

// StartWebSpan 从请求头延续上游 trace（前端 RUM / 上游服务），否则开新 trace。
// resource 必须是路由模板（如 GET /api/v1/commands），不是具体 URL——
// 具体 URL 是用户可构造的高基数来源，会把 APM 和 monitor 查询拖垮。
func StartWebSpan(ctx context.Context, header http.Header, operation, resource string) (*tracer.Span, context.Context) {
	return tracer.StartSpanFromPropagatedContext(ctx, operation, headerCarrier(header),
		tracer.ResourceName(resource),
		tracer.SpanType("web"),
	)
}

// FinishWeb 在请求结束时收口 span：状态码、5xx 标错。
func FinishWeb(span *tracer.Span, status int) {
	span.SetTag("http.status_code", status)
	if status >= 500 {
		span.SetTag("error", true)
	}
	span.Finish()
}

// StatusWriter 记录 handler 最终写出的状态码（访问日志与 HTTP 指标都要用）。
type StatusWriter struct {
	http.ResponseWriter
	Status int
}

func (w *StatusWriter) WriteHeader(code int) {
	if w.Status == 0 {
		w.Status = code
	}
	w.ResponseWriter.WriteHeader(code)
}

// TracedRoundTripper 是客户端 APM 中间件：为出站请求开 client span，
// 并把当前 trace 上下文注入请求头（接收端在服务端 TraceMiddleware 延续）。
// resource 形如 "POST paymentd:8082/internal/charge"。
// tracer 是全局的，因此不需要 Obs 实例——既有客户端只需换 Transport 一行。
func TracedRoundTripper(base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		span, ctx := tracer.StartSpanFromContext(req.Context(), "http.client",
			tracer.ResourceName(req.Method+" "+req.URL.Host+req.URL.Path),
			tracer.SpanType("http"),
			tracer.Tag("http.method", req.Method),
			tracer.Tag("http.url", req.URL.String()),
		)
		_ = tracer.Inject(span.Context(), headerCarrier(req.Header))
		resp, err := base.RoundTrip(req.WithContext(ctx))
		if err != nil {
			span.SetTag("error", true)
			span.SetTag("error.msg", err.Error())
		} else {
			span.SetTag("http.status_code", resp.StatusCode)
			if resp.StatusCode >= 500 {
				span.SetTag("error", true)
			}
		}
		span.Finish(tracer.WithError(err))
		return resp, err
	})
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

// HTTPMetrics 服务端中间件共用的两个指标：
//
//	kitty.http.requests          count     {method, route, status, status_class}
//	kitty.http.request_duration_ms histogram {method, route}
//
// route 一定是路由模板（SanitizeRoute 产物），method 是独立 tag——
// tag value 带空格会让 monitor query 无法表达（空格是 DogStatsD/query 语法分隔符，
// 旅行牛牛项目踩过的坑）。
func HTTPMetrics(method, route string, status int, durMS float64) {
	tags := []string{"method:" + method, "route:" + route,
		"status:" + strconv.Itoa(status), "status_class:" + statusClass(status)}
	Incr("kitty.http.requests", tags...)
	Histogram("kitty.http.request_duration_ms", durMS, "method:"+method, "route:"+route)
}

// SanitizeRoute 把 Go 1.22 mux pattern 规范化为 metric/monitor 友好的路由模板：
// 剥掉方法前缀（"GET /api/v1/state"→"/api/v1/state"），{id} 通配符改 :id。
// 根路径静态托管统一归为 "static"——每个静态资源请求都打 route:"/" 会把
// 所有资产混进一个序列，归为 static 后可单独看整体资产流量。
func SanitizeRoute(pattern string) string {
	if i := strings.IndexByte(pattern, ' '); i >= 0 {
		pattern = pattern[i+1:]
	}
	if pattern == "/" {
		return "static"
	}
	var b strings.Builder
	for i := 0; i < len(pattern); i++ {
		switch pattern[i] {
		case '{':
			b.WriteByte(':')
		case '}':
			// skip
		default:
			b.WriteByte(pattern[i])
		}
	}
	return b.String()
}

// statusClass 5xx Rate 监控用的状态族（2xx/3xx/4xx/5xx）
func statusClass(code int) string {
	switch {
	case code < 300:
		return "2xx"
	case code < 400:
		return "3xx"
	case code < 500:
		return "4xx"
	default:
		return "5xx"
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
