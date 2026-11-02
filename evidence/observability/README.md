# 可观测性接入取证(2026-11-02 夜间,compose 单机形态)

全部证据由 Datadog API 实时拉取,非截图——可复现:同一查询用 `DD_API_KEY/DD_APP_KEY` 重放即可。

| 文件 | 内容 |
|---|---|
| `metrics-snapshot.json` | 业务指标快照(kitty.command / http / payment / session / advisor / repo,2h 窗口) |
| `log-trace-correlation.json` | Trace↔Logs 双向关联实证:同一条 trace 的 span 与访问日志互通 |
| `paymentd-spans.json` | kitty-paymentd(宿主机直跑指向 compose Agent)的 span 取证 |
| `monitors-api-state.json` | 10 条 monitor 在 org 中的实时评估状态(3 OK / 2 Warn / 4 No Data + 1 心跳 OK) |

关键结论:

1. **三支柱全部打通**:logs(`service:kitty-api`)、metrics(`kitty.http.requests` 等 16 个)、
   traces(`kitty-api` + `kitty-paymentd` 两个 service)均在 Datadog 可查。
2. **Trace↔Logs 双向关联成立**。注意坑:Logs 侧保留字段检索语法是 `trace_id:<十进制>`
   (不带 `@` 前缀);用 `@dd.trace_id:*` 查会得到 0 命中,易误判为关联丢失。
3. **监控闭环是活的**:2 条 Warn 是真实数据触发的警告线(命令 p95 / 存档写盘 p95),
   证明初版阈值偏紧——正是文档要求的"按 e2e 基线复核后调整"的输入。
4. No Data 的 4 条均属拆分形态链路(webhook / 阿策 / 支付系统错误)或纯业务分布(拒付率),
   单机 mock 形态无此流量,符合预期。
