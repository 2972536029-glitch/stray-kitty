# 业务观测模块一、三 · 看板与监控交付

本文件对应 #18。配置保存在 `monitors/business-observability.json`，部署入口为
`monitors/apply-business-observability.py`。配置与离线测试就位不等于已部署：
2026-11-05 已通过 US5 只读连接核对用户手动导入的两张看板，并同步线上分组布局：
[主线与玩法](https://us5.datadoghq.com/dashboard/b6t-avm-uyi/)的仓库版本有 19 个叶子组件，
[支付与经济](https://us5.datadoghq.com/dashboard/wbx-cm5-me5/)有 11 个叶子组件（均不含分组容器）。
经营看板的仓库版本已删除重复 `sack_cat_freed` 单图，彩蛋保留在主线按 flag 拆分的图中；
线上经营看板仍有 12 个叶子组件，需要用户手动删除该图、将原「彩蛋与会话底座」组改名为
「玩家与会话」，并删除会话列表中重复的 timestamp 列，或导入更新后的经营看板 payload。
新埋点版本仍待合入、发布 preview 和真实数据验收；业务告警尚未创建或接管。
MCP 组织写入权限关闭，当前资源变更由具有网页权限的成员手动执行。

实现后的指标口径以 `docs/OBSERVABILITY.md` 的「#18 模块一、三业务指标」为准。
战后返回检查发生于真正离开结果页/失败准备页的命令提交后，校验服务端预期区域和阶段；
不在 COMPLETE_BATTLE 刚打开结果页时提前记成功，也不声称测量客户端实时坐标。

## 配置内容

| 资源 | 数量 | 内容 |
|---|---:|---|
| 模块一看板 | 1 | `[小猫回家记][业务-主线] 主线漏斗与玩法` |
| 模块三看板 | 1 | `[小猫回家记][业务-经营] 支付与经济` |
| 模块一用户可见告警 | 3 | 剧情节点断流、战斗只有开始没有结算、战后返回校验失败 |
| 无通知条件子监控 | 4 | 开局量、无剧情推进、战斗开始量、无结算，供两个 composite 引用 |
| 模块三接管告警 | 2 | 既有支付拒付率、阿策回退率；原地更新，不重复新建 |
| 待基线监控 | 2 | 支付转化异常、金枪鱼金额收支比漂移，明确未启用 |

所有新业务指标查询限定 `service:kitty-api,env:preview,!qa:true`。使用排除式 QA
过滤，可以兼容此前未附加 QA 标签的会话、支付和阿策数据；历史未标记 QA 数据无法
追溯区分，因此基线应从本次带标记版本发布后开始采集。前端 RUM 属模块二，此处只
引用其负责的支付曝光/点击阶段，不修改该模块看板。

主线看板使用 catalog 中各章入口节点：`prologue_1`、`chapter1_intro`、
`market_intro_1`、`greenhouse_intro_1`、`rescue_intro_1`、`finale_intro_1`。
这是当前窗口的事件次数与阶段触达趋势，并非去重玩家或同一 cohort 的漏斗。
教学胜率为 L00 的 `win/(win+lose)`；retreat/unknown 不进入胜率分母，结算分布单列
它们。Datadog 会将指标标签归一为小写，因此查询使用 `chapter:l00`，游戏内 ID
仍然是 L00。[标签规则](https://docs.datadoghq.com/getting_started/tagging/)

经营看板分开显示 `kitty.economy.delta`（发生多少次变动）与
`kitty.economy.amount`（变动的实际货币数量，COUNT）。金额收支比只使用 amount；
没有支出时比例显示无数据，不把无穷大伪装成健康值。支付成功/尝试比例同样是窗口事件
口径，跨窗口的异步完成可能产生短期偏差。`kitty.event.flag` 面板明确标为“揭示次数”，
不将总次数称作玩家揭示率。会话日志面板检索 `@player_id:* @session_id:*`，
并排除 `@qa:true`，用于后续按玩家/会话分析；尚未提供 cohort 留存计算。

## 监控查询与旧告警接管

方案中的两个 `metric query && metric query` 不能直接作为 metric alert 发给 API。
此处建立四个无通知条件监控，再让 `type:composite` 的 query 引用它们的真实数字 ID。
应用脚本只允许先出现的非 composite 依赖，先创建子监控，再校验并提交组合查询。
看板监控摘要只显示 `role:alert`，不会把正常处于 Alert 的流量门槛条件当作独立故障。
[官方 composite 查询规范](https://docs.datadoghq.com/api/latest/monitors/create-a-monitor/)

两个复合条件分别是：30 分钟新会话次数 > 5 且后续剧情推进 < 1；30 分钟战斗开始 >= 5
且结算 < 1。战后偏离阈值为 15 分钟 >= 3。所有查询使用 COUNT + sum 时间聚合，
稀疏计数 `require_full_window=false`、`notify_no_data=false`。
剧情推进条件明确排除 `node:prologue_1`：CreateSession 已经自动记录这个初始节点，
若计入它，新会话 > 5 必然同时产生至少 6 条剧情记录，断流条件将永远无法成立。
此排除仅用于断流告警，主线看板仍保留序章入口次数。离线校验和回归测试防止误删排除条件。
无结算/无剧情条件依赖 COUNT 的零值求值；无流量时上游流量条件不成立，因此 composite
不告警。新组织从未接收到对应指标时应先跑真实流程预热后检查状态，不能只看创建 API 成功。
[缺数据行为](https://docs.datadoghq.com/monitors/configuration/)

支付拒付率和阿策回退率从 `monitors/monitors.json` 移到业务配置，保留现有 50% 阈值与
通知接收人。业务文件的 `adopt_names` 保存旧名称，应用时按精确名称接管其 ID，并换成
`[业务-经营]` 前缀、添加模块/所有权标签。原脚本不再包含这两条，避免将旧名称重新建出来。
旧配置里这两条 `avg(...).as_count()` 改为 `sum(...).as_count()`；计数比率必须先汇总
再相除。[as_count 求值与 sum 约束](https://docs.datadoghq.com/monitors/guide/as-count-in-monitor-evaluations/)

本次没有更改其他基础设施监控，也没有删除线上资源。若组织已有旧名和新名两条，脚本会
在任何写入前报错，要求明确保留哪条；不会自行删除告警。子监控的消息无通知目标；三个
主线告警沿用团队现有 Slack 接收人，线上应用后触发时会按该配置发送通知。

### 与主干模块三实现合并

主干 `8ebaf54` 已引入模块三基础埋点、`obs.WithSession` 和家园 scope。
本交付保持这套日志接口及家园 `journey` 请求细分为 `scope:home` 的行为；身份只在一个
context 字段中传递，支付终点和经济变动统一在持久化提交后记录，避免 service 入口与
repository 出口重复计数。旧告警的 `purpose` 与 `owner:biz-module3` 标签继续保留。
主干新增的支付转化、金枪鱼收支比两条占位阈值已从 `monitors/monitors.json` 默认发布列表
移出，仅保留在 `pending_baselines` 待实测确认；旧发布器也不能提前部署这两条。

经营看板只保留本文件对应 bundle 一个配置来源。原 `dashboards/biz-module3.json`
迁入 `monitors/business-observability.json`，防止按标题发布的旧脚本覆盖已导入看板的
preview/QA 过滤、金额数量口径和归属标记；模块二 `dashboards/biz-module2.json` 及其
发布入口保留。业务配置测试同时检查不同发布入口之间没有同名资源定义。

本次同步保留线上分组、组内顺序、widget ID、可编辑默认字段、`reflow_type:auto` 和 tags。
SDK 的 camelCase 属性已转为 API snake_case，`additionalProperties` 已展开；仅排除看板
只读身份/时间/URL/作者等元信息及权限字段，避免导入空 `restricted_roles` 改变权限。
网页日志组件现为 `list_stream`，timeseries 可省略 query 的 `aggregator`；标量 query
仍显式使用 `sum`，所有 COUNT 序列保留 `sum:...as_count()`。递归校验覆盖分组里的
指标、日志和监控摘要，分组不能绕过 QA/环境过滤、金额口径或 `role:alert` 限定。

## 本地验证与应用

从仓库根目录运行，只需 Python 3 标准库：

```powershell
python monitors/apply-business-observability.py --check
python -m unittest discover -s monitors -p 'test_*.py' -v
```

上述两项也由 GitLab 的 `business_observability_checks` verify job 执行。前端选项的
鼠标/键盘回归可运行 `npm run test:story-choice`（需要 Playwright Chromium 或本机 Edge）；
`npm run api:check` 验证可选 optionId 与既有客户端请求的兼容性。

不带参数也等同 `--check`，不读取密钥、不联网、不写远端。离线校验检查本次使用的
payload 子集、引用顺序、COUNT 聚合、QA/环境过滤、禁止指标里的玩家/会话标识以及
待基线对象不可部署。它不是 Datadog 服务端查询解析器，不能据此宣称远端校验通过。

部署操作者在进程环境中提供 `DD_API_KEY`、`DD_APP_KEY` 后先运行：

```powershell
$env:DD_SITE = 'us5.datadoghq.com'
python monitors/apply-business-observability.py --plan
```

`--plan` 列出远端监控/看板并对已有依赖可解析的 monitor 调用
`POST /api/v1/monitor/validate`；该端点只验证定义，不创建资源。首次部署 composite
依赖还没有数字 ID，会明确留到实际依赖创建后验证。Datadog 没有对应 dashboard validate
端点，本地只做已使用字段检查。[Monitors API](https://docs.datadoghq.com/api/latest/monitors/)

实际发布这些资源的命令为：

```powershell
python monitors/apply-business-observability.py --apply
```

脚本强制 US5，拒绝其他站点；密钥只从环境读取，不自动读 `.env`，不输出请求头；
拒绝跨站重定向。`--apply` 先盘点全部目标并检查身份冲突，再校验所有可预先验证的
monitor，之后才创建/更新。受管 monitor 用 `managed-by` + `definition` 标签定位，
dashboard 用 description 中的固定标记定位，名称相似的资源不会被接管。
同名但无所有权标记的 dashboard/新 monitor 会被拒绝；只有配置列出的两个旧告警名称
允许接管。已有资源原 ID 更新，重复执行不会再创建一套。

API 不提供整个 bundle 的事务：若写入途中出现网络错误、权限错误或 dashboard schema
错误，脚本返回非零并停止后续写入，已成功部分会保留。先重新执行 `--plan` 观察服务端
实际状态，再重跑 `--apply`；不盲目重试、不回滚或删除监控。不要同时运行两个发布实例。

本次使用 Dashboards API v1 的 ordered 布局、group 组件和自动重排，保留线上可编辑默认字段。
timeseries 返回 `timeseries`，query_value/toplist/sunburst 使用 `scalar`；metric 查询使用
`queries + formulas`，标量 query 必须 `aggregator:sum`，timeseries 的该字段可省略。
Pie Chart 的实际 API 类型是 `sunburst`；监控摘要为 `manage_status`；会话列表为
`list_stream`，request 使用 `response_format:event_list`，query 使用 `data_source:logs_stream`
与 `query_string`。旧 `log_stream` 表示仍可校验，但当前导出采用 list_stream。
参见 [Dashboard create schema](https://docs.datadoghq.com/api/latest/dashboards/create-a-new-dashboard/)、
[Pie Chart](https://docs.datadoghq.com/dashboards/widgets/pie_chart/)、
[Monitor Summary](https://docs.datadoghq.com/dashboards/widgets/monitor_summary/)。

## 待完成的线上验收与基线

两条业务阈值放在 `pending_baselines`，`status=pending_baseline`、`threshold=null`，
没有可部署 payload。未使用猜测的转化率、金额比或生产阈值，也没有把暂时不告警说成已完成。

1. 正式发布带埋点版本后，在 preview 走剧情、选项、终章门槛、战斗 win/lose、
   事件结算/flag、支付成功/拒付、奖励/购买/抽奖，以及各阿策 scope，查看 US5 真数据。
   当前真实接口没有撤退流程，不要求构造不存在的 retreat 路径；该值仅为结算分类保留枚举。
2. 先完成上述经营看板手动去重，再打开两个看板，检查各查询能取到值、窗口与 QA 过滤正确；检查会话列表中的
   `player_id`、`session_id`，确认它们没有出现在指标标签里。
3. 查看三个主线告警及四个子条件的状态；重点验证有流量但没有推进/结算、没有流量
   两种场景。验收流量必须有明确标记并在业务报表中排除；不要为验证而停用真实服务。
4. 累积至少两周非 QA preview 数据，记录支付尝试样本量、转化率、各币种实际 gain/spend
   数量，和业务负责人确定最低流量/支出门槛、健康区间、阈值及回落阈值。
5. 将确认过的两条基线转换为 monitor payload，加入无流量/零支出抑制条件，通过离线测试
   与远端 `/monitor/validate` 后再应用；到此才可将两条 pending 项标为已交付。

离线回归覆盖：旧 ID 接管、重复应用不重建、只读 plan、任何写入前的同名冲突检查、
远端校验失败时零写入、真实 composite ID 绑定、QA 每个操作数过滤、拒绝伪造基线、
分组内金额比使用 amount、日志身份/过滤、模块/告警角色摘要，以及受管资源改名后的稳定定位。
