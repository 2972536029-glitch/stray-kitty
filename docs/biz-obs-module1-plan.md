# 开发前文档 · 模块一:主线与玩法(后端)

> 分支:`feat/biz-module1` → MR → main。交付 = 埋点 + 看板 + 监控,三者齐才算完成。
> 回答的问题(浩哲/Jenny/齐雯/余尧):玩家从开局到通关在哪一步流失、卡在哪一关、战后有没有回到该回的地方、彩蛋和故事线揭示了多少。
> 公共约定见 #18 迭代方案帖(note 10328),此处不重复;违反约定的 MR 直接打回。

## 1. 埋点定义表

所有埋点走 `obs.Incr`(现有接口,**不改 obs 包**)。每个埋点 = 触发时机 + 指标名 + tags(全部有限枚举)+ 口径说明。

| 指标 | 类型 | tags(枚举来源) | 触发时机 | 代码落点 | 口径 |
|---|---|---|---|---|---|
| `kitty.story.node` | count | `chapter`(catalog 章节序)、`node`(story.json 节点 ID) | 剧情节点成功推进后(state 更新后) | `service` 层 ADVANCE_STORY / START_STORY 成功分支 | 每次成功推进记 1 条;失败/重放不记 |
| `kitty.story.choice` | count | `node`、`option`(选项 ID) | choice 类节点玩家选定选项后 | choice 分支(字段名待浩哲确认前端传参) | 每次选择记 1 条 |
| `kitty.story.gate_hit` | count | `gate`(枚举:`finale_clue_insufficient`) | 终章 clue<3 进入检查被拒时 | 终章门槛拒绝分支 | 只记"撞墙",不记通过 |
| `kitty.battle.start` | count | `chapter`(L00-L05)、`difficulty` | START_BATTLE 成功创建后 | commands → START_BATTLE 成功分支 | 幂等重放(replayed)不记 |
| `kitty.battle.settle` | count | `chapter`、`difficulty`、`outcome`(白名单:`win`/`lose`/`retreat`/`unknown`) | COMPLETE_BATTLE 有效结算后 | commands → COMPLETE_BATTLE(非重放)分支 | **outcome 必须白名单**,请求体枚举外一律 `unknown`;QA_SIMULATE_* 打 `qa:true` tag(业务统计时排除);胜率口径 = win/(win+lose),retreat 与 unknown 单列 |
| `kitty.battle.return_check` | count | `map`、`result`(枚举:`ok`/`deviation`) | 战斗结算后实际位置与 returnPosition 比对完成时 | COMPLETE_BATTLE 后置校验 | 判定规则(容差/目标点)待 Jenny 确认,先按"回到 returnPosition 所在区域"实现 |
| `kitty.event.resolve` | count | `event`、`option`、`tier`(fail/partial/success/crit) | CHOOSE_EVENT 成功结算后 | service 事件结算处 | 每次结算记 1 条;一个埋点支撑选项选择率/档位分布/触发→结算转化 |
| `kitty.event.flag` | count | `flag`(内容配置 flag ID) | flags 写入存档的统一出口 | repository flags 写入处(或 domain.Add 封装) | 事件链/彩蛋揭示的基础数据 |

**统一纪律**:所有 tag 值必须先过白名单校验(请求体或内容配置中不存在的一律 `unknown`);重放(replayed)不产生任何埋点;player_id/session_id 不进 tag。

## 2. 看板

Dashboard:`[小猫回家记][业务-主线] 主线漏斗与玩法`(独立看板,模块一独占编辑权)。

| 面板 | 类型 | 内容 |
|---|---|---|
| 主线漏斗 | Timeseries ×N + Query Value | session(started)→ 序章 → 前三幕 → 终章(kitty.story.node 按 node 过滤) |
| 各章胜率 | Timeseries | kitty.battle.settle 按 {chapter,difficulty,outcome} 堆叠 |
| 教学通过率 | Query Value | N02:L00 结算 win 占比 |
| 选项分布 | Top List | kitty.story.choice 按 {node,option} |
| 事件结算分布 | Pie Chart | kitty.event.resolve 按 tier |
| 战后返回校验 | Query Value | return_check{result:deviation} 计数 |
| 监控状态 | Monitor Summary | 本模块 3 条监控 |

## 3. 监控(正确性类,上线即配)

| Name | Query(初版,上线后校准) | 逻辑 |
|---|---|---|
| `[小猫回家记][业务-主线] 剧情节点断流` | `sum(last_30m):sum:kitty.session.started{service:kitty-api}.as_count() > 5 && sum(last_30m):sum:kitty.story.node{service:kitty-api}.as_count() < 1` | 有人开局但无人推进剧情 = 剧情链路故障 |
| `[小猫回家记][业务-主线] 战斗只有开始没有结算` | `sum(last_30m):sum:kitty.battle.start{service:kitty-api}.as_count() >= 5 && sum(last_30m):sum:kitty.battle.settle{service:kitty-api}.as_count() < 1` | 有开场无结算 = 结算链路故障 |
| `[小猫回家记][业务-主线] 战后返回校验失败` | `sum(last_15m):sum:kitty.battle.return_check{service:kitty-api,result:deviation}.as_count() >= 3` | 返回位置校验连续失败 = 位置状态异常 |

(tags 一律 team:stray-kitty + service:kitty-api;notify_no_data=false)

## 4. 待对齐口径(开工前必须解决)

| 事项 | 找谁 | 内容 |
|---|---|---|
| N03 字段 | 浩哲 | choice 节点的 node/option 前端传什么(字段名与枚举) |
| B03 判定 | Jenny | "指定地点"如何判定:哪些返回点、距离容差、按地图还是按章节 |

## 5. 验收(对照 6 条标准)

1. 代码随 MR 合并且 preview 重新发布 ✓(CD 自动)
2. 真实数据:跑一遍剧情+一场战斗+一次事件,8 个指标全部在 Metrics Explorer 可查
3. 命名:全部 `kitty.<系统>.*`,tags 白名单
4. 本文档 §1 表格即"一句话说明"来源,同步更新 `docs/OBSERVABILITY.md` 指标字典
5. (前端部分不在本模块)
6. 会话字段不在本模块(模块三交付)
