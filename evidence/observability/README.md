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
3. **监控闭环是活的**:2 条 Warn 曾被真实数据触发(命令 p95 / 存档写盘 p95),
   据 4h 基线实测已校准为警告 2000 / 故障 5000 并重新 apply(文档表同步)。
   **e2e 全量套件 27/27 通过(1.9h)**,期间 5h 窗口观测总量:命令 332 成功 / 7 拒绝 / 6 系统错误
   (错误集中在容器重启瞬间的 e2e 重试,正是 error 信号该出现的时机)、HTTP 2368 次、
   会话 77、充值 success/declined/rejected 混合 5 次。
4. No Data 的 4 条均属拆分形态链路(webhook / 阿策 / 支付系统错误)或纯业务分布(拒付率),
   单机 mock 形态无此流量,符合预期。
