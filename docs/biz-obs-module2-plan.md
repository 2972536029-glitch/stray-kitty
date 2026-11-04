# 开发前文档 · 模块二:前端体验与玩法渗透(RUM)

> 分支:`feat/biz-module2` → MR → main。交付 = RUM 接入 + 前端埋点 + 看板 + 监控。
> 回答的问题(轩扬):玩家在哪个界面卡住;哪些玩法有人用、哪些没人用。
> 公共约定见 #18 迭代方案帖(note 10328)。

## 0. 前置(一次性)

1. **RUM 应用创建**:US5 org → RUM → New Application(名字 `kitty-frontend`,sdk:browser)→ 拿 applicationId + clientToken;
2. **token 接入**:`web/index.html` 的 `window.KITTY_RUM` 注入块取消注释并填入两值;CD 重新发布后 RUM 开始收会话;
3. 本模块代码改动:`web/src` 若干组件加 `datadogRum.addAction(...)` 调用(统一走一个薄封装 `web/src/observability/actions.ts`,**不直接散调 SDK**)。

## 1. 前端 action 定义表

统一封装:`addAction(name, context)`——name 是 Datadog RUM 自定义 action 名(全员用统一的命名清单,验收 #5 要求告知应用名与 action 名)。

| action 名 | 触发时机 | context 字段 | 回答谁的什么问题 | 提出人 |
|---|---|---|---|---|
| `continue_adventure_click` | 主界面点"继续冒险" | 无 | 引导完成率漏斗第一步(轩扬 Q1) | 轩扬 |
| `chapter1_enter` | 进入第一章(序章走完) | — | 转化漏斗终点(轩扬 Q1) | 轩扬 |
| `dice_roll_duration` | 掷骰动画结束 | `duration_ms`(分桶:显示时归档) | 掷骰动画是否过长(轩扬 Q2) | 轩扬 |
| `ui_blocker` | UI 卡点发生(顶栏唤不出/找不到入口) | `node`(枚举待轩扬定义) | 卡点分布(轩扬 Q2) | 轩扬 |
| `home_panel_open_duration` | 点开"布置家园"面板成功 | `duration_ms` | UI 操作耗时(轩扬 Q3) | 轩扬 |
| `tutorial_step_done` | 教学关键步骤完成 | `step`(枚举待齐雯定)、`duration_ms` | 教学卡点与耗时(齐雯) | 齐雯 |
| `first_active_move` | 引导后玩家实战中首次主动换位 | `delay_ms`(教学结束到换位) | "教学通关≠学会了"(齐雯 Q2) | 齐雯 |
| `recharge_entry_expose` / `recharge_entry_click` | 充值入口展示/被点击 | `location` | 充值漏斗前半段(余尧 #9) | 余尧 |
| `feature_entry_use` | 家园/抽奖/商店/阿策入口被使用 | `feature`(枚举) | 玩法渗透排行 | 齐雯/浩哲 |

**纪律**:action 名是有限清单(本表冻结);context 值为低基数枚举或分桶数字;玩家身份不在 action context(RUM 自带 session/用户,由 RUM SDK 管理)。

## 2. 看板

Dashboard:`[小猫回家记][业务-前端] 体验与渗透`(模块二独占)。

| 面板 | 类型 | 内容 |
|---|---|---|
| UI 卡点分布 | Top List | `ui_blocker` by node |
| 掷骰动画时长 | Timeseries(p90/p50) | `dice_roll_duration` |
| 关键操作耗时 | Timeseries | `home_panel_open_duration` / `tutorial_step_done` 耗时 |
| 玩法渗透排行 | Top List | `feature_entry_use` by feature |
| 充值漏斗前半段 | Timeseries | expose vs click |
| 引导转化 | Query Value | chapter1_enter / continue_adventure_click |
| 监控状态 | Monitor Summary | 本模块监控 |

## 3. 监控

| Name | Query | 说明 |
|---|---|---|
| `[小猫回家记][业务-前端] 充值入口点击率下降` | `(expose→click 转化率, 1d 窗口) < <基线×0.6>` | 经营类,**有基线后再配**;先只建看板 |
| (复用 US5 已有 RUM 默认监控) | 前端错误率等 | org 已有 RUM 默认监控族,不重复建 |

## 4. 待对齐口径

| 事项 | 找谁 | 内容 |
|---|---|---|
| `ui_blocker` 的 node 枚举 | 轩扬 | 哪些 UI 节点算"卡点"(顶栏唤出失败/入口找不到/…) |
| `tutorial_step` 步骤清单 | 齐雯 | 教学关键步骤的编号定义(她答卷里已提) |
| 充值入口 `location` 枚举 | 余尧 | 入口出现的位置(家园?商店?) |

## 5. 验收(对照 6 条标准)

1. MR 合并 → preview 重新发布(前端随 game 镜像)✓
2. 真实数据:RUM 会话出现;团队成员各走一遍主界面→序章→战斗→家园,RUM 里能看到 action 序列
3. action 命名全部来自本表(冻结清单)
4. 本表即"action 一句话说明"来源;同步 `docs/OBSERVABILITY.md` RUM 章节
5. **本模块交付时必须告知**:RUM 应用名(`kitty-frontend`)+ action 清单(本表)→ 这就是验收 #5 的答复
6. 会话字段不在本模块(模块三交付)
