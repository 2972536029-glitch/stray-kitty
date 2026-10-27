# 战斗模块接口与章节入口

更新：2026-10-26。两章无道具，L00 六波，L01 四猫首领战。当前接口定义见 [TS契约](../../web/src/contracts/index.ts)、[OpenAPI](../../docs/openapi.json)与[Go服务](../../server/internal/service/battle.go)。

## 入口对应

| 服务 stageId | 运行模块 | 布局与波次 | 用途 |
| --- | --- | --- | --- |
| l00_tutorial | L00 | 3×7／6波 | 开场剧情后的正式新手教学 |
| alley_rescue | L01 | 5×10包围框／8波 | 第一章探索、纸箱事件后的首次救援首领战 |
| alley_boss | L01 | 同上 | 家园重玩首领战 |

BattleHost按真实场次ID选择模块，真实attemptId始终由服务创建，模块不创建第二份身份。原main把tutorial送入L00宿主却使用3×5／2波配置的问题在本次统一修正。

## 命令

```ts
{ type: 'START_BATTLE', stageId: 'alley_rescue' }
{ type: 'COMPLETE_BATTLE', attemptId, outcome: 'won',
  report: { leaks: 0, bossDefeated: true } }
```

START_BATTLE不接受supplies；COMPLETE_BATTLE不接受usedSupplies。两个L01入口均要求完整report，won还要求bossDefeated=true且leaks<3。L00只报告attemptId和won/lost。没有补给抽奖、补给首胜／零漏奖励或battleRewards新结果字段。

客户端仍负责战斗模拟，服务校验场次、阶段与报告，不宣称服务端权威重演或防作弊。请求沿用原幂等键和版本号，存档失败不提交部分状态。

## 结算与恢复

L00胜利设置l00_completed并进入探索，不提前完成alley_rescued或发放救援奖励；失败后重新开始教学创建新attempt，保留失败档位。L01首次alley_rescue胜利沿用点点、猫窝、邮票／材料及原战后剧情。alley_boss重玩不重复救援首奖。L01失败结算继续回preparation，由lastResult.stageId保留对应入口；新开战创建新attempt，仍非失败直接回探索。

难度从活动场次的shadowPressure快照−1／0／1映射low／medium／high，缺省普通，非法拒绝。不重新评分，也不在0.8／1／1.2敌人体力倍率之外加旧倍率。失败保留待用修正，胜利后清理。

返回标题是暂停现有实例；整页刷新重建同一活动场次的ready棋盘与当前关卡配置，并非逐帧恢复。局内取消RESTART／REFORM等同场恢复命令；正式重新挑战必须创建新服务场次。

## 旧版本兼容

Go存档暂保留旧Attempt.Supplies读取字段。新版结算旧active场次时全额归还已预留物品并清空，不重复发物品；已终结旧场次不再次退款。仓库既有数量与其他系统food/material/邮票/家具保留。

旧active alley_rescue进入本版本时按新版第一章关卡重建，保留attempt与难度；旧客户端没有Boss报告的上报会被明确拒绝并提示刷新，不伪造Boss击败。不存在把旧序章战果自动认作新Boss胜利的迁移。

## 分工

战斗维护两章引擎、教程、四猫技能、棋盘、结果和必要接入；事件维护档位判定，主流程维护剧情、存档与长期奖励；探索地图和最终场景美术维持对应模块。军师目前为本地规则。后章与模型不在本轮实现范围。
