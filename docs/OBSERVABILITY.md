# OBSERVABILITY.md · 小猫回家记可观测性手册

技术主线:`RUM → Trace → Logs → Metrics → Monitor → Slack`,全部走 Datadog。
游戏只负责产生真实业务行为;Datadog 只负责观察、追踪、告警与排障,**不参与任何游戏规则判断**。

两条铁律(沿用团队旅行牛牛项目验证过的结论,贯穿 `server/internal/obs` 全部实现):

1. **观测旁路绝不影响业务**:指标 UDP fire-and-forget,日志推送队列满即丢,无 Agent/无密钥时全部静默 no-op——游戏在没有任何 Datadog 配置的环境下照常运行与测试。
2. **观测不制造新风险**:业务拒绝(rejected)永远不进故障告警;只有系统错误(error)才告警。

```
React RUM(可插拔,给 /api/ 三个 base 注入 traceparent)
   ↓
kitty-api(Go, cmd/api)──TracedRoundTripper──► DeepSeek(阿策问答)
   │                    └────TracedRoundTripper──► kitty-paymentd(cmd/paymentd)──► Xsolla 沙箱
   │                                                    │
slog JSON + dd.trace_id        DogStatsD(UDP 8125)      APM(8126)
   └──────────── Datadog Agent(compose profile / GKE namespace 内 Deployment)────┘
                          ↓
                  Monitor(11 条,monitors/monitors.json)──► Slack(告警 / 恢复)
```

## 1. 服务与统一标签

| 服务 | Datadog service | 进程 | 职责 |
|------|-----------------|------|------|
| 游戏服务 | `kitty-api` | `server/cmd/api` | 全部游戏 API、命令执行、存档、支付代理、静态托管 |
| 支付服务 | `kitty-paymentd` | `server/cmd/paymentd` | 权威流水账本、Xsolla 沙箱会话与 webhook |
| 前端 | `kitty-frontend` | web(RUM) | Page View / Action / Error / 资源 / 长任务 |

统一标签:`env=dev`(DD_ENV)、`version=0.1.0`(DD_VERSION)、`team=stray-kitty`(DD_TEAM)。
span、指标、日志、K8s Deployment labels(`tags.datadoghq.com/*`)共用同一套值。

## 2. 指标字典(全部 `kitty.` 前缀)

> 团队共享 Datadog org,裸指标名会跨项目撞名,一律加 `kitty.` 前缀。
> **tag 低基数纪律**:tag 只放有限枚举(命令类型、错误码、结果分类);玩家 ID、存档 ID、
> 任意用户输入只进日志与 trace,绝不进 tag——用户可构造的字符串会制造无限时间序列。

| 指标 | 类型 | 触发点 | Tags |
|------|------|--------|------|
| `kitty.http.requests` | count | 每个请求(两个服务的请求中间件) | method, route, status, status_class |
| `kitty.http.request_duration_ms` | histogram | 同上 | method, route |
| `kitty.command` | count | 命令执行出口(含校验拒绝) | type(有限枚举/unknown), result |
| `kitty.command.duration_ms` | histogram | 同上 | type |
| `kitty.session.started` | count | 匿名会话创建成功 | — |
| `kitty.auth.register` | count | 注册出口 | result |
| `kitty.auth.login` | count | 登录出口 | result, code(有限错误码枚举) |
| `kitty.payment.charge` | count | 充值出口(api 与 paymentd 两侧) | result: success/declined/rejected/error |
| `kitty.payment.session` | count | 支付会话出口 | result |
| `kitty.payment.webhook` | count | Xsolla webhook 出口(paymentd) | result: ok/rejected/error |
| `kitty.payment.ledger_save_duration_ms` | histogram | 账本原子写完成 | — |
| `kitty.advisor.call` | count | 阿策问答出口 | result: success/fallback, reason(有限枚举) |
| `kitty.advisor.duration_ms` | histogram | 同上 | result |
| `kitty.event.random` | count | 随机事件触发 | map, event(内容配置内有限集合) |
| `kitty.repo.save_duration_ms` | histogram | 游戏存档原子写完成 | — |
| `kitty.repo.state_size_bytes` | gauge | 同上(存档体积) | — |

**结果四分类**(埋点的通用语义,实现在 `domain.ClassifyFault`):

| result | 含义 | 告警策略 |
|--------|------|----------|
| `success` | 正常成交/执行 | — |
| `replayed` | 幂等回执命中,不是又一次成交(防重复计数) | — |
| `rejected` | 业务拒绝:参数错误、余额不足、未拥有、在途等正常玩法或客户端问题 | **不告警**,可做趋势图 |
| `error` | 系统故障:5xx、panic、存储失败 | **进故障告警** |

`declined`(演示卡拒付)是支付专属的正常业务结果,单列,不算 rejected 也不算 error。

## 3. Logs

JSON 行打 stdout(slog),`obs.LogInfo/Warn/Error` 自动注入当前 span 的
`dd.trace_id / dd.span_id`(**低 64 位十进制**——128 位 hex 会导致 Logs↔Trace 关联永远失败,
旅行牛牛项目验证过的坑)。在 Datadog Logs 里点任意日志的 trace id 即跳转对应 Trace。

日志旁路:`server/internal/obs/logshipper.go` 把同一条日志直接 POST 到 Datadog HTTP Intake
(`DD_LOGS_INTAKE_KEY` 未配置时整体 no-op)。存在的原因:kind/containerd 环境下 Agent 的
文件采集不可靠;队列满即丢、失败 30 秒限频 WARN,绝不阻塞业务。

关键业务日志:`event_random_trigger`、`xsolla payment webhook missing fields`、
`xsolla webhook credit failed`、`payment service error`、`http request`(每个请求一条,
含 route/status/duration_ms/request_id)。

## 4. Trace 与 Golden Trace

`server/internal/obs` 提供三层透传(与旅行牛牛同构):

- 服务端 `StartWebSpan`:从请求头延续上游 trace(RUM traceparent / 上游服务),否则开新 trace;resource 用**路由模板**(`GET /api/v1/commands`),不是具体 URL。
- 客户端 `TracedRoundTripper`:出站请求自动开 client span 并注入 trace 头。已接四处:RemotePayment(api→paymentd)、XsollaClient(paymentd→Xsolla)、GameCreditCaller(paymentd→api credit)、advisor(→DeepSeek)。
- 业务 tag:命令执行给当前 span 打 `command.type`;`a.fail` 打 `error.code`。

**Golden Trace(充值到账,拆分形态)**:
前端 `/api/payment/session` → kitty-api → kitty-paymentd `/internal/session` → Xsolla 沙箱
→ 渠道异步 `POST /webhook/xsolla`(验签→幂等落账)→ kitty-paymentd →
`POST /internal/credit` 回 kitty-api 入账。
这是本项目唯一的跨进程 + 外部渠道链路,APM 里按 `service:kitty-paymentd` 过滤可见完整 span 树。
compose 单机形态支付在进程内(mock),该链路在拆分形态(team-preview / k8s)完整可见。

## 5. Monitors 与阈值依据

定义在 `monitors/monitors.json`(11 条,查询覆盖 env:(dev OR preview)),`python monitors/apply-monitors.py` 按名称幂等
创建/更新(读进程环境变量 `DD_API_KEY/DD_APP_KEY/DD_SITE`,不自动加载 .env)。

| Monitor | 查询对象 | 阈值(初版) | 依据 |
|---------|----------|------|------|
| HTTP 5xx Rate | `kitty.http.requests` 5xx 占比 | >10%(5m) | 正常 e2e 流量 0%;注入式故障可复现 |
| 命令系统错误率 | `kitty.command{result:error}` 占比 | >10%(5m) | rejected 已被分类排除,只统计系统错误 |
| 命令处理 p95 | `kitty.command.duration_ms.95percentile` | >5000ms(warn 2000) | 2026-11-03 本机 4h e2e 基线:p95 中位 592ms、冷启动突发 13.2s;警告留 3 倍余量 |
| 支付系统错误 | `kitty.payment.charge{result:error}` | ≥1 次(5m) | 支付错误应零容忍;declined 不算 |
| 支付拒付率 | declined/(success+declined) | ≥50%(15m) | 正常玩法不应连续拒付;演示可复现 |
| Webhook 入账失败 | `kitty.payment.webhook{result:error}` | ≥1 次(15m) | 5xx 会等渠道重试,必须人工确认最终到账 |
| 阿策降级率 | `kitty.advisor.call{result:fallback}` 占比 | ≥50%(15m) | reason tag 可细分:not_configured/timeout/限流等 |
| 登录失败突增 | `kitty.auth.login{code:BAD_CREDENTIALS}` | >10 次(15m) | 正常玩家不应连续输错;疑似爆破 |
| 服务心跳 | `kitty.http.requests` 总量 | <1(10m)+ no-data 15m | 前端开着就有流量;全停即告警 |
| 存档写入耗时 | `kitty.repo.save_duration_ms.95percentile` | >5000ms(warn 2000) | 基线实测:写盘 p95 中位 275ms、冷启动最大 6.6s;单 JSON 文件仍是主要 IO 风险 |

阈值方法论(与旅行牛牛一致):**不是拍脑袋**——先跑 30 分钟真实流量(e2e 套件就是现成的
流量发生器:`KITTY_TEST_PORT=8080 KITTY_TEST_EXTERNAL_SERVER=1 npx playwright test`),
用 Metrics Explorer 看 p95 与错误分布,再微调阈值。当前初版阈值保守,上线前必须复核。

踩坑实录(移植与联调中实际发生的):
- monitor query 里的比较值必须与 `options.thresholds.critical` 一致(`>0` 配 critical 1 会
  400);比例监控忘了 ×100 也会 400——已修复并以 git 为准。
- `as_count()` 计数窗口用 `sum` + `.as_count()`,别把上报速率当窗口内次数。
- 小项目没人操作很常见:除心跳外全部关闭 no-data 告警。

## 6. RUM(前端,可插拔)

1. Datadog UI → RUM → New Application,拿 `applicationId` + `clientToken`。
2. 在 `web/index.html` 取消注释 `window.KITTY_RUM` 注入块并填入两个值。
3. 刷新页面即生效;未配置时 `web/src/observability/rum.ts` 自动 no-op,游戏不受影响。

开启后自动采集 Page Load / User Action / Error / 资源 / 长任务,并对同源 `/api/` 请求注入
traceparent(后端 `DD_TRACE_PROPAGATION_STYLE=tracecontext,datadog` 接住)——玩家操作可一路
串到 kitty-api → kitty-paymentd 的后端 trace。SDK 从 npm 打包(官方 CDN 域名在国内网络不可达,
旅行牛牛验证过的坑),动态 import 单独分包不占首包。

## 7. 本地无 Datadog 运行

不需要任何凭据:`docker compose -f deploy/compose.yaml up --build`(不带 profile)即可完整
玩游戏;`go run ./server/cmd/api` 同理。tracer/statsd 找不到 Agent 时静默 no-op。
宿主机直跑且本机起了 Agent(127.0.0.1:8125/8126)时,trace 与指标自动上报,无需改代码。

带观测闭环启动:

```bash
cp deploy/.env.example deploy/.env   # 填入 DD_API_KEY(已被 gitignore,严禁提交)
docker compose -f deploy/compose.yaml --profile observability up --build -d
```

## 8. 部署形态对照

> 2026-11-03 形态判定:曾经交付过 DaemonSet+hostPort 形态(k8s/datadog-agent.yaml,已在 kind 上实测),
> 但判定其不适合学校共享 GKE:DaemonSet 的 hostPort 每节点只能绑定一次,跨 namespace 会撞端口
> (cn-yao-yu 已有 Agent 长期运行),且 namespace 级权限采不到 kubelet/k8s 指标。
> 最终形态改为 namespace 自包含的 Deployment+ClusterIP(旅行牛牛 38 天稳定运行的同款),
> manifest 见 deploy/datadog-agent.gke.yaml;kind 实测取证保留于 evidence/observability/。

| 项 | compose(单机) | K8s(kind / 预览) |
|---|---|---|
| 运行单元 | game 容器(支付进程内 mock) | Deployment + ClusterIP(拆分形态含 paymentd) |
| Datadog Agent | compose 服务(profile observability) | namespace 内 Deployment + ClusterIP 8125/8126(`deploy/datadog-agent.gke.yaml`,旅行牛牛同款;DaemonSet 已判定不适合共享集群,见下) |
| 应用找 Agent | `DD_AGENT_HOST=datadog-agent`(compose 服务名) | `DD_AGENT_HOST=status.hostIP`(Downward API 取节点 IP) |
| 统一标签 | 环境变量直填 | pod labels `tags.datadoghq.com/*` + fieldRef 注入 |
| 日志采集 | 容器 label + stdout;Intake 旁路兜底 | Agent 自动收集 stdout;Intake 旁路兜底 |
| Golden Trace | 单进程链路 | 充值到账跨进程链路完整可见 |


## 线上接线清单(一次性步骤,目标:试玩 preview 环境)

> 2026-11-03 已完成:org 11 条监控同步(env 过滤已移除——monitor query 不支持多值 env 括号语法,
> 按 `service:kitty-api` / `kitty.*` 前缀聚合,双环境数据汇入同一监控);
> Synthetics 公网拨测 2 条已创建(Seoul+Tokyo 双探测点,5 分钟周期,public_id `4ju-vjx-jqt` /healthz、
> `gqk-tb8-daq` /api/payment/config)。
> 待办为下表三步,全部是一次性基础设施动作:

| 步骤 | 动作 | 谁/哪侧 |
|---|---|---|
| 1 | `kubectl -n cn-haozhe-wang create secret generic stray-kitty-preview-datadog --from-literal=api-key=<DD_API_KEY>` | haozhe(他的 namespace 权限) |
| 2 | `deploy/datadog-agent.gke.yaml` 的 CHANGE_ME_NAMESPACE 改为 cn-haozhe-wang 后 `kubectl apply -f ...`(Agent 一次性部署,不随发版重建) | haozhe 执行,manifest 已就绪 |
| 3 | 观测代码合入 main → CD 自动构建带埋点镜像 → 重新发布(preview.template.json 已注入 DD_* env) | MR 流程 + deploy job |

验证:发布后 Datadog APM 出现 `service:kitty-api env:preview` 的 span、拨测保持绿色;
RUM 激活见 §RUM(两步:UI 建 RUM 应用 → index.html 填 token,随下次发布生效)。

## 站点纪律(DD_SITE)与双 org 现状(2026-11-04)

**教训先行**:接手任何 Datadog org,第一件事 `curl -H "DD-API-KEY: ..." https://api.<site>/api/v1/validate` 实证 key 属于哪个站点——不要沿用文件名、先例或记忆里的假设。本项目已为此付过学费:仓库默认 `datadoghq.com`(US1)沿用了密钥文件名与旧项目先例,线上首次部署时才被实测推翻(见 !136)。

**当前事实(2026-11-04)**:
- **US1 org**(`datadoghq.com`,余尧的 key 所属):skin-shop / 旅行牛牛历史监控所在;**本仓库 11 条监控 + 2 条拨测定义目前在这里**,但 preview 数据不流入这个 org;
- **US5 org**(`us5.datadoghq.com`,共享采集 key `bj-collector-key` 所属):线上 preview 的 Agent 与日志旁路实际上报到这里(浩哲已在 !136 修正并重新发布,APM `env:preview` 每分钟 40+ span);
- `deploy/compose.yaml` 本地仿真默认 US1 是**故意的**(本地用的是 US1 的 key);`deploy/.env.example` 与 preview 模板默认 US5(线上用共享采集 key)。

**待决**:监控与拨测应与数据流同 org。两条路径二选一(需团队确认"哪个 org 是课程官方的"):
- A. 数据流迁 US1:团队改用余尧的 API key 作采集 key,回滚 !136 的 DD_SITE,重新部署 Agent;
- B. 监控迁 US5:向 org 管理员申请 US5 的 APP key,`DD_SITE=us5.datadoghq.com python monitors/apply-monitors.py` + `apply-synthetics.py` 30 分钟重建全部 13 条。

## 线上接线清单(实际执行记录,2026-11-03 完成)

> 实际执行与验收由浩哲完成(见 issue #6 回复),过程与原计划有两处偏差,均已修正并记录:

1. ✅ Secret `stray-kitty-preview-datadog` 已建(cn-haozhe-wang,key 为共享采集 key);
2. ✅ Agent 已部署——**站点坑**:首用 US1 默认值时 key 校验失败,换 `us5.datadoghq.com` 后通过(!136 已固化);
3. ✅ 重新发布完成(CI 的 deploy_apply 手动触发 + rollout restart)。**Rollout 经验**(留给后来人):Secret 是在 Pod 已运行后创建的话,声明式 `apply` 不会自动滚动 Pod——需要 `kubectl rollout restart deployment/stray-kitty-game` 等一次,让容器重新挂载新 Secret。

验证标准不变:APM 出现 `service:kitty-api env:preview` 的 span(已达成);公网拨测保持绿。


## 9. 接入责任与边界

- 埋点/字段/分类维护由服务端负责;`kitty.command` 的 type 枚举扩展时同步本文档与 monitors。
- 监控只能观察被实际触发的请求,不能单凭"没有报警"证明数据一致(幂等与对账由测试与回执表保障)。
- `kitty.repo.state_size_bytes` 持续增长说明存档膨胀,需要规划裁剪或分档——这是本架构的已知边界。
- 阈值复核、Slack 频道绑定是接入负责人的手工步骤;monitors.json 是唯一事实来源,改动走 git。
