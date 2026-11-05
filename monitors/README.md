# 监控与看板:已改为 Datadog 网页管理(2026-11-05 团队决策)

自 2026-11-05 起,小猫回家记的**监控与看板统一改为在 Datadog US5 网页上管理**,
由团队通过 Bits AI 维护。本目录及 `dashboards/` 里的 apply 脚本**仅作存档**,
**严禁再执行任何 `--apply`**(会覆盖网页上的最新配置)。

## 为什么删除了 JSON 定义文件

- `monitors/business-observability.json`(模块一/三业务监控 + 看板定义)、
  `monitors/monitors.json`(平台监控 11 条)、`dashboards/biz-module2.json`(模块二 RUM 看板)
  已由网页配置取代。留着的唯一后果是:未来某人跑 `--apply` 时,
  会把网页上的最新修改覆盖回旧快照——正是本次决策要杜绝的事故面。
- 定义内容可在 git 历史(本 commit 的父提交)与 Datadog 网页(单一事实源)找回。
- 剧情断流监控 story-stalled(ID 23553215)**以线上版本为准**,不再做代码同步
  (2026-11-05 的同步 MR !178 已合并,内容与当时线上一致,仅是历史)。

## 脚本清单(仅存档)

- `apply-monitors.py` / `apply-synthetics.py`:旧平台监控与拨测的重放脚本,
  对应的 `monitors.json` 已删除,运行会 no-op / 报缺文件——**不要运行**。
- `apply-business-observability.py` / `biz_observability.py`:
  业务监控 as-code 流水线,`business-observability.json` 已删除,同样**不要运行**。
- `test_biz_observability.py` 已删除(依赖已删的 JSON,留着必挂,无存档价值)。
- `dashboards/apply-dashboards.py`:通用看板 apply 脚本,glob 不到 JSON 时安全 no-op——**不要运行**。

有监控/看板调整需求:直接在 Datadog 网页(或 Bits AI)上改,改完即为生效,无需改代码。