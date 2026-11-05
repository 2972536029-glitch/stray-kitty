# 开发前文档 · 模块三:经营与底座(后端)

> 2026-11-05 实现合并说明：本文保留开发前方案。当前指标口径与发布入口以
> [业务观测交付](biz-obs-delivery.md) 和 [指标字典](OBSERVABILITY.md) 为准：
> 经济数量使用 `kitty.economy.amount`，业务看板/接管告警统一在
> `monitors/business-observability.json`，不使用事件次数代替金额比，也不部署未经基线确认的阈值。

> 分支:`feat/biz-module3` → MR → main。交付 = 埋点 + 会话底座 + 看板 + 监控(含接管现有监控)。
> 回答的问题(余尧/齐雯/浩哲):钱和资源是否健康;支撑按"玩家"统计的会话地基。
> 公共约定见 #18 迭代方案帖(note 10328)。

## 0. 本模块独占权限

**obs 包唯一修改权在模块三**(公共约定 7)。本 MR 对 obs 包的唯一改动:**日志上下文注入玩家/会话标识**(会话底座,见 §2)。其他模块的埋点只调用 `obs.Incr/Histogram` 现有接口,缺接口在本模块 MR 里补。

## 1. 埋点定义表

| 指标 | 类型 | tags | 触发时机 | 代码落点 | 口径 |
|---|---|---|---|---|---|
| `kitty.payment.funnel` | count | `step`(枚举:`session_created`/`charge_attempt`/`charge_success`/`charge_declined`) | 各漏斗步完成时 | transport 支付分支(部分复用现有 charge/session 埋点,统一步名) | 每步一条;declined 是漏斗终点之一不是故障 |
| `kitty.economy.delta` | count | `currency`(枚举:`fish`/`stamps`/`tuna`)、`direction`(枚举:`gain`/`spend`)、`bucket`(枚举:`1`/`2-5`/`6-20`/`21-100`/`100+`,金额档防高基数) | 每次货币数量变动提交后 | 奖励发放(EventReward 应用处)/商店购买/抽奖/充值入账 | gain 与 spend 分开计数;收支比 = gain/spend(分币种) |
| `kitty.advisor.call` **(改造)** | count | 现有 result 基础上**补 `scope` 维度**(枚举:battle/journey/explore_hint/home/unknown) | 现有埋点处加 tag | advisor Reply defer(已有) | 现有回退率监控不受影响(查询按 result,新 tag 只是加维度) |
| 无新指标 | — | — | — | — | 拒付率/支付错误等现有监控**直接在 US5 重建即接管**(定义在 monitors.json) |

## 2. 会话底座(本模块最大单项,架构级)

**目标**:日志与(将来的)业务事件携带玩家与会话标识,支撑"按玩家"统计(留存/彩蛋揭示率/幕间留存)。

**设计**:
1. 认证成功处(Bearer token → player)已能拿到 playerID;
2. 在 transport 中间件(或 token() 解析点)把 `player_id` 与新造的 `session_id`(玩家级长会话,可用现有 token 或 playerID 派生)放入 `context`;
3. obs 日志(ctx 版本)自动从 ctx 提取这两个字段注入每条日志;
4. 指标 tag **不含**它们(低基数纪律);日志字段名:`player_id`、`session_id`(告知整合人,验收 #6);
5. **player_id 是服务端生成 hash,数量随玩家增长——绝不能进 metric tag**;日志字段不受此限制。

**改动面**:transport 中间件 + obs 日志注入(模块三独占)+ 各 service 调用处传 ctx(多数已传)。

**验收(#6)**:发布后任取一条业务日志,`player_id` 与 `session_id` 字段可见;`@player_id` 可在 Logs 检索。

## 3. 看板

Dashboard:`[小猫回家记][业务-经营] 支付与经济`(模块三独占)。

| 面板 | 类型 | 内容 |
|---|---|---|
| 支付漏斗 | Timeseries | 前半段(曝光/点击)引用模块二看板;后半段:funnel 各步 by step |
| 金枪鱼收支比 | Query Value + Timeseries | sum(gain)/sum(spend) by currency |
| 阿策请求量与回退率 | Timeseries ×2 | kitty.advisor.call by {scope,result} |
| 彩蛋揭示率 | Timeseries | kitty.event.flag{flag:sack_cat_freed} 等(升会话维度前先看总量趋势) |
| 玩家留存(雏形) | Log Query/Table | 基于 session_id 的日志查询(会话底座上线后迭代) |
| 监控状态 | Monitor Summary | 本模块监控 |

## 4. 监控

| Name | Query(初版) | 说明 |
|---|---|---|
| `[小猫回家记][业务-经营] 支付转化异常` | `sum(last_1h):sum:kitty.payment.charge{result:success}.as_count() < <基线>` | 基线需积累,先以保守阈值上线,两周后校准 |
| `[小猫回家记][业务-经营] 金枪鱼收支比漂移` | `sum(last_6h):sum:kitty.economy.delta{currency:tuna,direction:gain}.as_count() / sum(last_6h):sum:kitty.economy.delta{currency:tuna,direction:spend}.as_count() > <基线×1.5>` | 通胀预警;基线积累两周后固化 |
| (接管)拒付率过高 / 阿策回退率 | 沿用现有定义(monitors.json #5/#7) | owner 移交本模块 |

## 5. 待对齐口径

| 事项 | 找谁 | 内容 |
|---|---|---|
| 货币变动点清单 | 齐雯/余尧 | tuna/fish/stamps 的全部 gain/spend 位置是否有遗漏(逐个代码点核对) |
| 收支比健康区间 | 余尧/浩哲 | 什么比例算通胀/紧缩(设计意图定义) |

## 6. 验收(对照 6 条标准)

1. MR 合并 → preview 重新发布 ✓
2. 真实数据:走一遍充值(成功+拒付)+ 一场事件(奖励发放)+ 一次抽奖,`kitty.payment.funnel` / `kitty.economy.delta` / advisor 新维度可查
3. 命名符合约定;bucket 档位枚举固定
4. 指标字典更新进 `docs/OBSERVABILITY.md`
5. 前端部分不在本模块
6. **会话底座验收**:任取一条业务日志含 `player_id`/`session_id` 字段;`@player_id` 可检索
