# 战斗模块接口与章节入口

更新：2026-10-27。各章无库存补给，L00 六波，L01 四猫首领战，L02／L03／L04 为六猫独立试玩，L05 为六名可移动主力加三名分批固定援军的终章试玩。第一章起沿用 MR !24 的通道，并按 !39／!40 追加鼠群与小猫，接收事件 carry 的八种正向加成，见[事件战斗契约](../../docs/BATTLE-EVENT-CARRY.md)。七个入口对应六套战斗地图。当前接口定义见 [TS契约](../../web/src/contracts/index.ts)、[OpenAPI](../../docs/openapi.json)与[Go服务](../../server/internal/service/battle.go)。

## 入口对应

| 服务 stageId | 运行模块 | 布局与波次 | 用途 |
| --- | --- | --- | --- |
| l00_tutorial | L00 | 3×7／6波 | 开场剧情后的正式新手教学 |
| alley_rescue | L01 | 5×10包围框／8波 | 第一章探索、纸箱事件后的首次救援首领战 |
| alley_boss | L01 | 同上 | 家园重玩首领战 |
| market_boss | L02 | 5×8／8波 | 家园第二章六猫独立试玩 |
| greenhouse_boss | L03 | 6×9包围框、34个真实格／8波 | 家园第三章六猫独立试玩，墨墨替代点点 |
| tunnel_boss | L04 | 5×8包围框、37个真实格／8波 | 家园第四章六猫独立试玩，点点归队、墨墨使用夜视与全队护盾 |
| finale_boss | L05 | 7×12包围框、74个真实格／10波 | 家园终章试玩，九格Boss、两精英、三批固定援军与光路 |

BattleHost按活动场次的stageId选择模块，真实attemptId始终由服务创建，模块不创建第二份身份。Stage的lanes／columns描述包围框，L01、L03、L04与L05的实际可用格由对应引擎配置限定，不把缺失格补成矩形。

## 命令

```ts
{ type: 'START_BATTLE', stageId: 'alley_rescue' }
{ type: 'COMPLETE_BATTLE', attemptId, outcome: 'won',
  report: { leaks: 0, bossDefeated: true } }

// L05：两名精英独立计数；失败也须如实报告 0、1 或 2。
{ type: 'START_BATTLE', stageId: 'finale_boss' }
{ type: 'COMPLETE_BATTLE', attemptId, outcome: 'won',
  report: { leaks: 0, bossDefeated: true, elitesDefeated: 2 } }
```

START_BATTLE不接受supplies；COMPLETE_BATTLE不接受usedSupplies。两个L01入口及L02／L03／L04入口均要求完整report，won还要求bossDefeated=true且leaks<3。L00只报告attemptId和won/lost。L05同样要求完整report，并额外要求胜负报告都包含整数elitesDefeated（0–2）；won还要求elitesDefeated=2。bossDefeated仍表示Boss本体，不包含精英，客户端同时要求十波小怪全部处理。L00–L04无需补elitesDefeated，不把本章新要求加到旧章。没有补给抽奖、补给首胜／零漏奖励或battleRewards新结果字段。

客户端仍负责战斗模拟，服务校验场次、阶段与报告，不宣称服务端权威重演或防作弊。请求沿用原幂等键和版本号，存档失败不提交部分状态。

## 结算与恢复

L00胜利设置l00_completed并进入探索，不提前完成alley_rescued或发放救援奖励；失败后重新开始教学创建新attempt，保留失败档位，不启用carry。L01首次alley_rescue胜利沿用点点、猫窝、邮票／材料及原战后剧情。alley_boss重玩不重复救援首奖。L01失败结算继续回preparation，保留lost attempt作为同关重试快照；新开战创建新ID并复制其难度与carry，仍非失败直接回探索。离开失败准备时清理临时身份，不能串到另一stage。

L02／L03／L04／L05均为家园独立试玩，只要求已有alley_rescued，不要求按章节顺序完成试玩。胜利只记对应关卡完成，不发物资、货币、家具、长期伙伴或鼓励奖励，不改剧情标志或推进故事，继续返回家园。不改原剧情／探索按钮，也不新增正式主线插入点。L04不写tunnel_explored或cats_rescued_batch1；rescue_intro_9之后、rescue_intro_10之前（已完成墨墨夜视护盾觉醒）仅是待团队确认的正式接点候选。L05不写finale_started、finale_completed或kingdom_founded；finale_intro_5之后、finale_intro_6之前只列为正式接点候选。灯车推进和援军入场只保存在本场模拟，不改变长期库存或猫册。

四个独立试玩失败后，从结算回到原关卡preparation，并保留已失败attempt作为重试快照；再按START_BATTLE创建新ID，复制失败场次难度与carry。即使主线PendingModifiers随后变化，也不改变本次重试快照。离开到家园、探索或剧情时清理这份临时失败场次，避免污染之后的入口。不能通过另一试玩的stageId把原失败准备误接到其他关卡。

难度从活动场次的shadowPressure快照−1／0／1映射low／medium／high，缺省普通，非法拒绝。不重新评分，也不在0.8／1／1.2敌人体力倍率之外加旧倍率。L00首次教学固定普通，失败重试保留旧场次档位，结算不消费主线待用修正。L01胜利清理待用修正。L02／L03／L04／L05首次进入试玩可快照已有PendingModifiers，但胜负均不清理或消费它；重试使用失败场次的快照。

返回标题是暂停现有实例；整页刷新重建同一活动场次的ready棋盘与当前关卡配置，并非逐帧恢复。局内取消RESTART／REFORM等同场恢复命令；正式重新挑战必须创建新服务场次。

## 旧版本兼容

Go存档暂保留旧Attempt.Supplies读取字段。新版结算旧active场次时全额归还已预留物品并清空，不重复发物品；已终结旧场次不再次退款。仓库既有数量与其他系统food/material/邮票/家具保留。

旧active alley_rescue进入本版本时按新版第一章关卡重建，保留attempt与难度；旧客户端没有Boss报告的上报会被明确拒绝并提示刷新，不伪造Boss击败。不存在把旧序章战果自动认作新Boss胜利的迁移。

## 分工

战斗维护L00–L05引擎、教程、各章技能、棋盘、结果和必要接入；事件维护档位判定、携带物/协助者来源，主流程维护剧情、存档与长期奖励；探索地图和最终场景美术维持对应模块。军师目前为本地规则。模型接入仍不在本轮范围，不能因终章初版完成自动开始。L01–L05消费活动场次的shadowPressure和carry快照，正式ID为lantern/mirror/bell/box/dog/dove/rats/kitten；只在开战时接收，不实现战斗中再次随机抽取或热替换奖励。墨墨的L04夜视恢复视野、L05夜视识破护幕均为本章技能变体，不新增事件枚举，不改变L03护盾与清荆棘。效果与职责见[事件战斗对接](../../docs/BATTLE-EVENT-CARRY.md)；四章试玩的主线边界分别见[第二章接入](../../docs/L02-INTEGRATION.md)、[第三章接入](../../docs/L03-INTEGRATION.md)、[第四章接入](../../docs/L04-INTEGRATION.md)、[第五章接入](../../docs/L05-INTEGRATION.md)。
