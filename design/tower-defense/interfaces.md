# 难度、奖励与模块接口

数值版本：0.10.0｜主项目适配：2026-10-25

本页区分本次 main 集成与后续目标。取用源提交为 `38545c3b9b93698b3a2cbbc23608c51e192388cc`；本次宿主仅使用普通兼容档、空额外补给并提交原胜负命令，未升级 HTTP、服务端档位或补给事务。新集成验证与合入状态见[接入记录](../../docs/L00-INTEGRATION.md)。

## 1. 本次流程与职责

主项目既有 preparation → START_BATTLE → battle → COMPLETE_BATTLE → settlement 继续负责阶段流转。App 在 battle 阶段挂载 L00BattleHost，其他阶段保留团队 UI、探索地图、剧情与家园。服务端 activeBattle 是本轮实例来源，前端不创建替代实例。

| 模块 | 本次责任与待接内容 |
| --- | --- |
| 战斗 | 固定 3×7、九步教学、十波、两猫技能、本次背包及胜负回调 |
| 主流程 | 提供真实场次、关卡与暂停状态，提交既有结果命令，沿用原请求重试 |
| 事件 | 保留自身剧情与奖励；shadowPressure 及 event_success 不调整正式 L00 数值 |
| 地图与 UI | 保留团队已有探索／家园展示；战斗区域按规格适配布局，不能覆盖逻辑地格 |
| 剧情 | 现有点点救援与战斗保护喵喵的身份衔接仍待确认，不提前写长期伙伴解锁 |
| 家园与服务端 | 补给装配、拥有校验、预留、耗用、返还与分档发奖待接入 |

## 2. 战斗输入与输出

主项目宿主入口为 [L00BattleHost](../../web/src/modules/battle/L00BattleHost.tsx)，局部导出为 [l00/index.ts](../../web/src/modules/battle/l00/index.ts)。主项目公共类型继续由 [contracts/index.ts](../../web/src/contracts/index.ts) 维护，不把局部类型直接当作 HTTP 请求体。

| 字段或行为 | 局部模块契约 | 本次宿主 |
| --- | --- | --- |
| attempt | 非空 id、active 状态、stageId 与关卡匹配 | 使用服务端 activeBattle |
| stage | lanes=3、columns=7、waves=10 | 读取目录内 alley_rescue；不伪造另一个关卡 |
| difficulty | low／medium／high，省略为 medium；非法输入拒绝 | 普通兼容，正式选档及保存尚未接入 |
| extraSupplies | L00 额外最多 warm-can 2、bouncy-treat 1 | 固定 {}；不装配已有库存 |
| modifiers | string[] 来源标签，不改变数值 | 显式适配旧公共对象；不叠加事件压力 |
| catIds | 宿主长期伙伴标识；固定援军由模块生成 | 不据此新增长期伙伴或声称动态阵容完成 |
| result | {attemptId, outcome: 'won'或'lost'} | 转发既有 COMPLETE_BATTLE |
| supply usage | usedExtras 为当前有效总量，可随教学／重整回退 | 无额外份额，不执行仓库扣减 |

非法档位报 INVALID_BATTLE_DIFFICULTY，同实例同场次换档报 BATTLE_DIFFICULTY_LOCKED。非法物品清单报 INVALID_BATTLE_SUPPLIES，当前场次换清单报 BATTLE_SUPPLIES_LOCKED。物品只接受已知键的普通对象、非负整数及序章上限；context 显式 {} 覆盖构造默认值，不相加。这些是模块错误，不是 HTTP 状态码。

关卡源为 [stages.json](../../web/content/battles/stages.json)，由 [content.mjs](../../scripts/content.mjs) 同步生成前后端目录。3／7／10 是固定 L00 校验，不是动态关卡 API。现有 stage.status 的服务准入规则也须一并保留，不能仅改标签导致 START_BATTLE 拒绝。

## 3. 生命周期与结果

模块保留 start(context, complete)、pause(paused)、stop()。React BattleViewport 自行订阅、计时、监听页面可见性并在卸载清理；宿主不要再启动第二套 tick。直接运行器接入须传真实秒数并显式 complete()，只在终态且未外部暂停时完成，一次初始化只通知一次。时钟与补给恢复边界见[接入说明](../../docs/L00-INTEGRATION.md#速度与时钟)。

主项目现有 GameController／HttpGameApi 管理命令、revision、pending 和原请求幂等键。结果网络失败时保留原请求重试，不重开战斗、不生成新 attempt 来重发结果。服务端 GameState 确认前，不能宣称长期奖励到账。本次不迁入独立试玩的 localStorage／Web Locks 仓库或奖励回执。

## 4. 难度与补给的后续目标

正式目标是在关卡外选择 low／medium／high，并让事件与战斗读取同一原值；事件骰点四档与玩家难度是不同维度。旧事件成功或压力字段不能追加为战斗 HP、速度或数量变化。模块已具备三档普通敌人体力 0.8／1.0／1.2 倍率，三档共用教学、路线和十波；本次宿主不将这些能力标成已接正式选档。

家园未来在战斗前装配和预留补给，宿主传入合法 extraSupplies；运行期间保存当前有效 usedExtras，结果结算扣已用、退未用。免费基础份额优先使用、剩余不入仓，教学完成恢复 initialInventory，本波重整恢复波初快照，整局重来恢复本局基线，均替换而不相加。详细规则见[补给与奖励](items.md)。

后章没有免费临时道具，最多 6 份、治疗 4／能量 2 全部从仓库带入；不可照搬 L00 额外 2／1 上限。动态关卡、后章携带协议、进阶物品与军需官均未实现。

## 5. 分档补给奖励目标

简单／普通／困难每次新胜利的基础奖励为 2／3／4 份；L00 首胜跨档额外 ＋2。每份暖罐／冻干权重为 70%／30%，同章各档共用物品池与效果。首通伙伴或独特家具单独去重；同 attempt 重试不得重抽或重复发奖，失败／退出只结算实际耗用和未用返还。

上述为未接入主项目服务的战斗补给设计。本次 COMPLETE_BATTLE 仍使用原服务端剧情奖励与 completedStages 逻辑，不发暖罐／冻干，不将原首通邮票、材料或伙伴说成新补给。未来正式补给服务需保存场次档位、清单、有效耗用及永久结算标识，并原子提交返还、奖励与回执；请求幂等键不能代替场次级去重。

## 6. 联调验收

本次待验证：真实场次挂载、3×7／十波、九步教学、技能和暂停、宿主面板冻结、终态一次回调、结果请求重试、原剧情与家园返回、窄屏可操作，以及探索／事件回归。

后续待接：正式同档贯穿事件／战斗及刷新恢复、家园装配预留、服务端耗用校验、返还与分档发奖、跨场重刷累加和首通去重。两类验收分开记录；模块旧独立测试不代替主项目联调，也不能将尚未接入的目标勾选为完成。
