// Package obs 是小猫回家记的 Datadog 可观测性基建：
// APM trace 透传（服务端 span + 客户端 RoundTripper）、trace 关联日志、DogStatsD 指标、
// HTTP Logs Intake 旁路。设计纪律（沿用旅行牛牛项目的验证结论）：
//   - 观测不参与游戏规则判断：Datadog 不可用时一切静默 no-op，游戏照常运行；
//   - 观测旁路绝不拖慢业务：指标 UDP fire-and-forget，日志推送队列满即丢弃；
//   - 无 Agent / 无密钥时整体降级，不需要任何配置就能本地开发与跑测试。
//
// 使用方式：各进程 main 里 obs.Init("kitty-api") 一次，defer obs.Shutdown()；
// 其余包（transport / repository / advisor / integrations）直接用包级函数，
// 未初始化时全部 no-op，因此既有测试不需要任何改动。
package obs

// 当前进程的服务名与默认指标客户端。包级单例与 prometheus.DefaultRegisterer
// 同一模式：每个二进制进程只属于一个 Datadog service，main 里 Init 一次。
var (
	defaultService string
	defaultMetrics *Metrics
)

// Init 启动全局 tracer 与 DogStatsD 客户端；配套 Shutdown 用 main defer 调用。
// service 形如 "kitty-api" / "kitty-paymentd"；env/version/team 走
// DD_ENV / DD_VERSION / DD_TEAM 环境变量（统一服务标签，span 与指标共用）。
func Init(service string) {
	defaultService = service
	defaultMetrics = newMetrics(service)
	initTracer(service)
}

// Shutdown 停止 tracer 并关闭指标客户端（main defer 调用）。
func Shutdown() {
	if defaultMetrics != nil {
		defaultMetrics.Close()
	}
	stopTracer()
}

// metrics 返回包级指标客户端；未 Init 时返回 nil（各方法自带 nil 保护）。
func metrics() *Metrics { return defaultMetrics }
