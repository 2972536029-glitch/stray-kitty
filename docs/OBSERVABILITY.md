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
                  Monitor(16 条,Datadog UI / Bits AI 管理)──► Slack(告警 / 恢复)
```

## 0. 当前状态速览(2026-11-05)

- **仪表盘 3 个**(已从 4 个整合,详见 §5.5 看板):「总览:现在整体好不好」(tiy-p7i-rek)、「玩家旅程:从打开页面到战斗」(b6t-avm-uyi,带 env/host 筛选,默认只看公网域名)、「经营与支付:支付、经济、阿策 AI」(wbx-cm5-me5)。三者顶部互跳链接,结构统一:顶部关键数字 → 按步骤展开 → 告警与排查。
- **告警 16 个**(全部带 team:stray-kitty 标签,通知 Slack):基础 9 + 公网拨测 2 + 业务 5(明细见 §5)。
- **管理方式 ⚠️**:看板与告警只在 **Datadog 网页上通过 Bits AI 维护**;仓库里的 monitors/*.json 与 apply 脚本仅作历史存档,**不要再运行 --apply**(会覆盖网页上的修改)。开新的 Bits AI 对话时,先把本手册的仓库链接发给它(`docs/OBSERVABILITY.md`),它就能接上进度。
- **指标归属**:Webhook 入账失败与经营看板「存档写入耗时」面板的指标来自 **kitty-paymentd**(不是 kitty-api)——排查时先看这个服务;游戏存档 game.json 写盘指标 `kitty.repo.*` 由 kitty-api 上报。

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
| `kitty.advisor.call` | count | 阿策问答出口 | result: success/fallback, reason, scope, source, qa(有限枚举) |
| `kitty.advisor.duration_ms` | histogram | 同上 | result, scope, source, qa |
| `kitty.event.random` | count | 随机事件触发 | map, event(内容配置内有限集合) |
| `kitty.repo.save_duration_ms` | histogram | 游戏存档原子写完成 | — |
| `kitty.repo.state_size_bytes` | gauge | 同上(存档体积) | — |

### #18 模块一、三业务指标

以下成功指标只在存档持久化成功后记录；失败回滚与幂等重放不计入成功统计。
全部业务指标带有限 `qa:true/false` 标签，看板及业务告警用 `!qa:true` 排除验收流量。
玩家/会话标识始终只进入日志，不能作为指标标签。配置与部署步骤见
[`biz-obs-delivery.md`](biz-obs-delivery.md)。

| 指标 | 类型 | 一句话口径 | 标签 |
|---|---|---|---|
| `kitty.story.node` | count | 每次成功进入一个新剧情节点记一次，含创建会话的首节点和自动跳转。 | chapter, node, qa |
| `kitty.story.choice` | count | 两处现有序章态度选择成功推进时记录当前选择。 | node, option, qa |
| `kitty.story.gate_hit` | count | 其他前置满足但线索不足而撞终章门槛，或进入线索不足分支时记一次。 | gate:finale_clue_insufficient, qa |
| `kitty.battle.start` | count | 新建有效 active attempt 时记一次，含教学自动开战和失败重试。 | chapter:L00–L05/unknown, difficulty:low/medium/high/unknown, qa |
| `kitty.battle.settle` | count | 一场有效结算提交后记一次，服务器 won/lost 转成 win/lose。 | chapter, difficulty, outcome:win/lose/retreat/unknown, qa |
| `kitty.battle.return_check` | count | 结算后真正离开结果页或明确离开失败准备页时，校验服务器预期区域和阶段。 | map, result:ok/deviation, qa |
| `kitty.event.resolve` | count | CHOOSE_EVENT 成功结算后记一次。 | event, option, tier:fail/partial/success/crit/unknown, qa |
| `kitty.event.flag` | count | 本次提交新增的每个 flag 记一次，不重复记录已有 flag。 | flag, qa |
| `kitty.payment.funnel` | count | 下单/尝试及首次落入游戏存档的支付终点分别计数。 | step:session_created/charge_attempt/charge_success/charge_declined, qa |
| `kitty.economy.delta` | count | 每次已提交事务中，每种货币的非零净变动记一次。 | currency:fish/stamps/tuna, direction:gain/spend, bucket:1/2-5/6-20/21-100/100+, qa |
| `kitty.economy.amount` | count | 同一次变动累计实际货币数量，用于金额收支比。 | currency, direction, qa |

- 剧情选项使用现有 `ADVANCE_STORY.optionId`，仅 `prologue_banter` / `prologue_sneak`
  的 `proud` / `honest` 有效；旧端省略仍能推进，但不会凭空记一个选择。
- 节点/事件/选项/地图使用 catalog 白名单；Go 分支产生的旗标登记于
  `server/internal/service/gameplay_observability_flags.json`。未知存档值归 `unknown`，
  不允许用户文本直接成为标签。标签在 Datadog 中归一小写，查询用 `chapter:l00`。
- 终章拒绝请求不落幂等 receipt，因此每次实际遭到门槛拒绝分别计数；成功请求重放仍不记。
- 胜率是 `win/(win+lose)`；retreat/unknown 单列。当前没有真实撤退结算接口，不能
  把尚未结算、失败后重试或返回标题伪造成 retreat。return_check 不在 COMPLETE_BATTLE
  刚打开结果页时记“成功”，也不能证明浏览器角色坐标已恢复到 returnPosition。
- `Attempt.qa` 是服务端保存的观测标记，使 QA 模拟结算后普通 CONTINUE、重试和奖励
  仍可排除；客户端命令不能设置该字段。QA_RESTORE 保留被恢复原存档的真实标记。
- `fish` 对应真实背包 `inventory.food`，`stamps` 对应 `currencies.stamp`，`tuna`
  对应 `currencies.tuna`。统一提交出口覆盖事件/战斗奖励、拾取、修缮、商店、抽奖、
  来信奖励及本地/远端/webhook 充值。十连抽是一次事务净变动，数量完整累计；
  `delta` 的次数比不等于金额比，经济面板必须用 `amount`。
- `session_created` 专指 Xsolla checkout 创建，区别于游戏 `kitty.session.started`。
  mock charge 在有效请求进入网关时记 attempt；Xsolla 在成功创建 checkout 时记 attempt，
  当前接口无法获知玩家真正提交卡号的时刻。成功/拒付在游戏存档首次追加对应充值流水
  后记终点，重复 credit 回调不重计，抽奖消费流水不计成支付成功。
- 阿策 `scope` 为 `battle/journey/explore_hint/home/unknown`，空 scope 兼容为 battle；
  请求 scope 仍为 journey，但家园 phase 的服务端观测标签细分为 home，沿用主干口径。
  `source` 区分 model/local；既有
  success/fallback 与有限 reason 标签保持兼容。
- 看板里的主线触达/彩蛋揭示均为事件次数，不是去重玩家漏斗或留存率。支付完成可能跨
  时间窗口；样本积累前不设置猜测的转化率和经济健康阈值。

**结果四分类**(埋点的通用语义,实现在 `domain.ClassifyFault`):

| result | 含义 | 告警策略 |
|--------|------|----------|
| `success` | 正常成交/执行 | — |
| `replayed` | 幂等回执命中,不是又一次成交(防重复计数) | — |
| `rejected` | 业务拒绝:参数错误、余额不足、未拥有、在途等正常玩法或客户端问题 | **不告警**,可做趋势图 |
| `error` | 系统故障:5xx、panic、存储失败 | **进故障告警** |

`declined`(演示卡拒付)是支付专属的正常业务结果,单列,不算 rejected 也不算 error。

## 3. Logs

#18 新增字段为 **`player_id`、`session_id`、`qa`**。认证成功后从实际存档解析玩家，
登录 alias 保持同一玩家 ID；session_id 是带专用域前缀的 token SHA-256，登录换 token
时切换。原 bearer token、密码以及用于存档检索的 token hash 均不输出。`qa` 为 boolean，
可用 `service:kitty-api env:preview @player_id:* @session_id:* -@qa:true` 检索真实交互日志。
`obs.LogInfo/Warn/Error` 从请求 context 自动附加身份，涵盖认证后的 HTTP 请求和阿策日志。
无身份的后台日志/认证失败不会继承上一请求；异步充值 credit 没有交互会话，只带真实
player_id，不伪造 session_id。原有不接受 context 的底层诊断日志不属于会话日志来源。

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

## 5. Monitors(16 条,Datadog UI / Bits AI 管理)

> **管理方式变更(2026-11-05)**:监控统一在 Datadog 网页上通过 Bits AI 维护。仓库里的
> `monitors/business-observability.json`、`monitors/monitors.json` 与 apply 脚本仅作**历史存档**——
> **不要再运行 `--apply`**,会覆盖网页上的修改。开新的 Bits AI 对话时,先把本文档链接发给它。

**当前告警 16 条**(全部带 team:stray-kitty 标签,通知 Slack):

| 组 | 告警 | 级别/条件 |
|---|---|---|
| 基础(9) | 心跳、HTTP 5xx、命令 p95、命令系统错误率、存档写入耗时、存档体积、登录失败突增、支付系统错误、Webhook 入账失败 | 支付系统错误(P1,≥1 次/5m)、Webhook 入账失败(P1,≥1 次/15m)、其余沿用既有阈值 |
| 公网拨测(2) | /healthz、/api/payment/config | Seoul+Tokyo 双点,5 分钟周期 |
| 业务(5) | 支付拒付率过高(P3,15m 拒付率≥50%)、阿策降级率过高(P3,15m ≥50%)、战后返回校验失败(P3,15m 偏离≥3)、剧情节点断流(P3,30m 推进÷开局<0.5,不含 prologue_1)、战斗只有开始没有结算(P3,30m 结算÷开局<0.5) | 均为比率/计数形态 |

无真实玩家流量时,业务类告警显示 No Data 属正常。

**阈值方法论**(沿用):先跑真实流量取基线(e2e 套件/成员试玩都是现成流量),用 Metrics Explorer
看分布再调阈值;composite monitor 本 org 实测 400 不可用——组合语义用比率形态表达
(如剧情断流 = 推进÷开局 <0.5,排除 prologue_1 种子;战斗断流 = 结算÷开局 <0.5)。
基础监控的历史阈值依据(git 中 monitors.json 历史版本)仍生效。

**踩坑实录**(对 Bits 建的监控同样适用):
- monitor query 里的比较值必须与 `options.thresholds.critical` 一致;比例监控要 ×100。
- `as_count()` 计数窗口用 `sum` + `.as_count()`。
- composite monitor 本 org 不可用(400)——组合语义一律用比率形态。
- 业务类告警默认关 no-data(心跳除外)。

## 5.5 看板(3 个,Bits 重构后)

| 看板 | 回答的问题 | 分组结构 |
|---|---|---|
| [总览:现在整体好不好](https://us5.datadoghq.com/dashboard/tiy-p7i-rek) | 一眼看全局 | 核心指标(近 7 天) / 告警:现在有没有出事 / SLO 达成情况 / 服务健康:流量与错误 / 性能与存储 / 支付与业务 |
| [玩家旅程:从打开页面到战斗](https://us5.datadoghq.com/dashboard/b6t-avm-uyi) | 玩家从打开页面到战斗的全程体验 | 核心指标(第一排前端·第二排后端) / 第 1 步·打开与加载 / 第 2 步·引导转化(继续冒险→第一章) / 主线推进 / 战斗难度:胜率是否合理 / 剧情选项与终章门槛 / 随机事件与彩蛋 / 玩法渗透与充值入口 / 交互耗时与新手引导(部分埋点待上线) / 告警与排查 |
| [经营与支付:支付、经济、阿策 AI](https://us5.datadoghq.com/dashboard/wbx-cm5-me5) | 钱、资源与 AI 顾问是否健康 | 核心指标(近 7 天) / 支付:从下单到入账 / 经济:货币收支是否平衡 / 阿策 AI 顾问:可用吗、快吗 / 玩家会话日志(排查用) / 告警与排查 |

结构约定:三个看板统一为「顶部关键数字 → 按步骤展开 → 告警与排查」,顶部互跳链接;「玩家旅程」带 env/host 筛选(默认只看公网域名,排除本地测试访问)。监控状态组件按 `business-module` 标签过滤。

## 6. RUM(前端,可插拔)

✅ **已激活(2026-11-05)**:应用 `kitty-frontend`(US5),`web/index.html` 已注入真实配置
(site=us5.datadoghq.com / env=preview),近 24h 收到 403 会话。备用环境未配置时仍自动 no-op。

开启后自动采集 Page Load / User Action / Error / 资源 / 长任务,并对同源 `/api/` 请求注入
traceparent(后端 `DD_TRACE_PROPAGATION_STYLE=tracecontext,datadog` 接住)——玩家操作可一路
串到 kitty-api → kitty-paymentd 的后端 trace。SDK 从 npm 打包(官方 CDN 域名在国内网络不可达,
旅行牛牛验证过的坑),动态 import 单独分包不占首包。

### 6.1 业务埋点(模块二,`web/src/observability/actions.ts`)

统一封装 `web/src/observability/actions.ts`:RUM 未初始化时全部 no-op,观测永不影响游戏;
action 清单冻结于 `docs/biz-obs-module2-plan.md` §1,组件只调用封装函数,不直接散调 SDK。

| action | 一句话说明(验收 #4) | 接线位置 |
|---|---|---|
| `continue_adventure_click` | 主界面点击「开始/继续冒险」,引导转化漏斗第一步(开始/继续都计,漏斗入口只有一个) | App.tsx `onStart` |
| `chapter1_enter` | 进入第一章(章节 alley)即漏斗终点;含老玩家点「继续冒险」直接落回小巷的回场,每次会话只记一次 | App.tsx 章节 effect |
| `dice_roll_duration` | 掷骰动画开始→揭晓的时长(ms,含等结算的翻滚续命),回答"动画是否过长" | DiceRollOverlay 揭晓时刻 |
| `home_panel_open_duration` | 进入花房→本次花房时段首次成功打开「布置」面板(布置模式)的耗时(ms);离开花房重置 | App.tsx 花房计时 effect |
| `recharge_entry_expose` / `recharge_entry_click` | 充值入口展示/点击;location 初版枚举 `topbar`(顶栏钱包)/`shop`(商店)/`parcels`(邮局),最终枚举待余尧确认(计划 §4) | GameScreen 顶栏钱包、ShopPanel、PostalJournal |
| `feature_entry_use` | 顶栏四个玩法入口被使用,feature 枚举 `home`/`lottery`/`shop`/`advisor`(家园手册/猫爪邮局/猫国商店/问阿策) | GameScreen 顶栏 |
| `ui_blocker` | UI 卡点分布。**未接线**:node 枚举待轩扬定义(计划 §4),口径对齐后接线 | 待定 |
| `tutorial_step_done` | 教学关键步骤完成。**未接线**:step 枚举待齐雯定义(计划 §4),口径对齐后接线 | 待定 |
| `first_active_move` | 引导后实战中首次主动换位的 delay_ms。**未接线**:依赖教学结束时机口径(随 tutorial 口径一起接) | 待定 |

边界说明:标题界面(StartScreen)的商店入口不计入 `feature_entry_use`(标题页不属于玩法渗透范围);
「回到花房」等章节导航不计入(是导航不是玩法入口)。
模块二独立看板已并入三看板体系(biz-module2.json 随 web-managed 迁移退役):体验类面板
进「玩家旅程」,充值漏斗进「经营与支付」。监控「充值入口点击率下降」有基线前不建(计划 §3)。

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


## 线上接线清单(2026-11-03 起执行,2026-11-05 全部完成并归档)

> 2026-11-03 已完成:org 11 条监控同步(env 过滤已移除——monitor query 不支持多值 env 括号语法,
> 按 `service:kitty-api` / `kitty.*` 前缀聚合,双环境数据汇入同一监控);
> Synthetics 公网拨测 2 条已创建(Seoul+Tokyo 双探测点,5 分钟周期,public_id `4ju-vjx-jqt` /healthz、
> `gqk-tb8-daq` /api/payment/config)。
> 下表三步已全部完成(执行记录见下方),保留作历史参考:

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

**已决(2026-11-05)**:US5 为工作 org(全部监控/拨测/数据在此);US1 的 13 条旧副本监控待清理(待办)。原两选项:
- A. 数据流迁 US1:团队改用余尧的 API key 作采集 key,回滚 !136 的 DD_SITE,重新部署 Agent;
- B(已采纳):监控在 US5 直接创建(web-managed),as-code 退役;US1 旧副本清理列入待办。

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
- **2026-11-05 起,监控与看板转为 Datadog UI/Bits 管理(web-managed)**:仓库内 monitors/dashboards
  JSON 与 apply 脚本仅作历史存档,**禁止运行 --apply**(会覆盖网页修改)。变更以 Datadog UI 为准,
  重大调整在 #18 记录。指标字典(本文档 §2)仍是口径的事实来源。
