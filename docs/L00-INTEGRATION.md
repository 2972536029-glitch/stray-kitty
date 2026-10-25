# L00 序章主项目接入记录

更新：2026-10-25。当前为主项目集成分支的实现说明。本地前后端检查与 9 项浏览器回归已通过；远端 MR、CI 与合入结果分别记录，不据本地通过代替远端验收。

## 取用版本与状态

| 项目 | 记录 |
| --- | --- |
| 战斗来源 | 0.10.0，完整 SHA `38545c3b9b93698b3a2cbbc23608c51e192388cc` |
| 起始主项目参考 | main／166ea46813ce144a5fd4255ab2b28d1ae2277f63；2026-10-25 fetch origin main 后 FETCH_HEAD 与 origin/main 均为此 SHA |
| 集成分支 | feat/l00-main-integration |
| 本次实现范围 | 将固定 L00 局内模块接到主项目真实场次和结果流程，保留团队 UI、地图、服务与工程配置 |
| 集成验证 | 本次 npm run check 通过；真实浏览器回归结果见下表，不沿用独立试玩旧通过记录 |
| 实际集成 MR、CI、合入 SHA | 待回填；不据本地分支声明远端无冲突或已经合入 |

源文件可按[固定 SHA](https://school-gitlab.xsolla.dev/haozhe_wang/stray-kitty/-/tree/38545c3b9b93698b3a2cbbc23608c51e192388cc)追溯。原 battle-design 是独立工程，首次交付提醒 MR 无法直接整树并入 main；该限制属于来源历史。本分支以 main 的工作区、服务端和 CI 为基础，只迁入战斗模块及所需适配，作为真实集成评审对象。首次正式合入后以主项目为唯一生产实现。

## 入口与文件

| 位置 | 职责 |
| --- | --- |
| [App](../web/src/app/App.tsx) | 在 battle 阶段挂载宿主，其余阶段继续现有团队场景与 UI |
| [L00BattleHost](../web/src/modules/battle/L00BattleHost.tsx) | 用真实 activeBattle 和关卡装配局部上下文，接宿主暂停与胜负回调 |
| [l00/index.ts](../web/src/modules/battle/l00/index.ts) | 导出 BattleViewport、PrologueBattle 及局部战斗类型 |
| [关卡源](../web/content/battles/stages.json) | alley_rescue：3 行、7 列、10 波；设计编号为 L00-prologue |
| [内容生成器](../scripts/content.mjs) | 同步 web/content/catalog.json 和 server/internal/platform/catalog.json |
| [既有主流程](../web/src/app/useGame.ts) | 会话、pending、原请求重试与 GameState 更新 |
| [既有服务](../server/internal/service/game.go) | START_BATTLE／COMPLETE_BATTLE／CONTINUE 与原有长期规则 |
| [战斗设计索引](../design/tower-defense/README.md) | 地格、教学、技能、补给、数值和后续方案 |

探索、集市、家园与剧情仍使用团队原场景；不能用战斗 Canvas 覆盖整个 DemoScene。主项目根 package、workspace 和前后端检查继续保留，独立试玩入口和预览仓库不作为生产宿主。

## 本次上下文与兼容范围

宿主只在服务端 phase=battle 且 activeBattle 合法时装配 L00。使用原 attempt.id、stageId、active 状态及对应目录关卡；校验 3／7／10，不在前端虚构场次或静默伪造关卡配置。catIds 沿用主项目长期伙伴输入，固定序章援军不写入长期伙伴表。

难度分工为：事件侧负责根据事件结果判断档位，主流程／宿主将其转换为 low／medium／high，经 BattleContext.difficulty 传入战斗；战斗侧提供三档数值与接口，不承担事件评分或重新判档。现有服务已把事件修正保存到 activeBattle.modifiers；本次 L00 宿主尚未接入三档转换，仍使用 medium 普通兼容档。映射与同场恢复待联调，不能将模块已有三档能力写成全链路已接通；接入后也不在三档数值之外额外叠加旧 shadowPressure／event_success 倍率。具体接口见[难度接入约定](../design/tower-defense/interfaces.md#4-难度与补给的后续目标)。

主项目公共 BattleModifiers 对象与战斗局部 string[] 来源标签分别维护，通过宿主显式适配；不以类型断言跳过差异，也不把局部字段擅自加入未升级的 HTTP 请求。BattleResult 保持 attemptId 与 won／lost。

## 补给输入与重试边界

本次固定 extraSupplies={}，仅序章教学免费 2 份暖心罐罐与 1 份蹦蹦冻干。主项目已有 inventory.food／material 等不自动转换成战斗物品，不扣仓库、不预留、不返还，也不迁入独立试玩的 localStorage 仓库和历史回执。家园家具界面仍保留；这不代表家园补给仓库与装配已经完成。

模块保留 L00 额外 2 罐／1 冻干的校验、当前场次锁定及有效耗用接口，待家园／服务正式接入后使用。基础份额与额外份额仅初始化合成一次；教学结束恢复 initialInventory，本波重整恢复波初快照，整局重来恢复本局基线，均不相加；有效耗用随恢复同步回退。未来宿主应预留已装配物品，按有效实际耗用扣除并返还未用份额，不能将免费余量入仓。

结果提交使用既有 COMPLETE_BATTLE 和原 attemptId；网络失败由 HttpGameApi 保存并重试原请求及幂等键。不要重复 start、重建场次或把通知回调当成持久化确认。返回标题会保留并暂停本页战斗实例，继续冒险时恢复原进度。整页刷新只恢复服务端活动场次，不保存局内棋盘、体力与波次；同一 attempt 会回到 ready，需重新开始教学。本次保留 contentVersion=2026.10.22.1、schemaVersion=1 与原存档字段，避免因无迁移的版本升级拒绝既有存档。

## 速度与时钟

BattleViewport 已管理 RAF、可见性暂停、订阅与卸载清理。宿主传入暂停条件，包含全局暂停、标题页、地图／商店／旅程记录和 busy/pending；不要叠加第二个 tick。直接使用运行器时传真实秒数，由引擎只缩放一次。

基础速度 0.5／1／2；查看猫菜单临时 0.5，瞄准临时 1；手动／宿主暂停、页面隐藏、背包、聊天、拖动及强制教学等待优先停表。关闭菜单或选速度不能解除已有暂停。

战斗区域样式须限制在战斗 phase／模块容器中，保留主项目其他阶段的全屏布局。不要导入独立 preview.css 的 body、:root 或通用按钮重置。需要验证窄屏、矮屏、浮动 HUD、教学、背包和军师面板不会被裁切或遮挡。

## 结果、剧情与奖励边界

本次完成链路是局内终态 → 一次 BattleResult → COMPLETE_BATTLE → 服务端 GameState → 原 settlement。后续 CONTINUE 沿用主项目剧情／家园流转。既有服务仍决定点点、纸箱猫窝、邮票和材料等剧情首通奖励；本次不改变这些长期规则，也不把它们描述为战斗补给发奖。

战斗内部保护目标是喵喵，绒绒先救援，斑斑和阿策随后加入，阿策不战斗。主项目现有点点救援与长期伙伴身份、胜利后的返回剧情仍待剧情负责人最终衔接；本次不声称已经实现“三只猫带喵喵回流浪猫王国”的新演出。

简单／普通／困难胜利 2／3／4 份、L00 跨档首胜额外 ＋2、暖罐／冻干 70%／30% 是[战斗补给目标方案](../design/tower-defense/items.md#5-通关奖励与首次加奖)，尚未接入主项目服务。不得显示这些物资“已保存”或“已到账”。正式库存拥有校验、预留、有效耗用、失败／退出处理、返还与原子幂等奖励由主流程协调服务端接入；UI 只承担对应展示与装配操作。

后章、动态阵容、橘猫军需官、进阶物品、更大地图与多路线实战均未实现。后章不提供免费临时道具，完整携带接口和最低资源平衡须另行实现和验证。

## 验证记录

| 检查 | 当前状态 |
| --- | --- |
| 取用文件、主项目类型、内容与架构生成物 | 通过：类型、内容、OpenAPI、71 个源目录架构检查；9 份迁入／接入文档的 55 个本地链接有效 |
| 局内规则与运行器测试 | 通过：迁入的 176 项测试；其中 20 项是隔离在 tests/battle/reference 的试玩奖励／仓库参考测试，不代表主服务已接库存 |
| 主项目前后端检查与构建 | npm run check 通过：190 项前端测试、Go vet／test、TypeScript、Vite 生产构建 |
| 真实入口九步教学、十波及结果返回 | 通过：真实按钮与格子操作见到第 1–10 波，两猫实战技能均使用；START_BATTLE 与 COMPLETE_BATTLE 各一次，返回既有结算与后续剧情；未注入战斗状态或使用速胜 |
| 全局面板暂停、标题返回与刷新边界 | 通过：全局暂停、地图遮罩均停表；返回标题／继续保持同一 DOM 实例与局内进度。整页刷新恢复同一服务端场次并回到 ready，GameState 不变，无额外开局／结算请求 |
| 请求重试 | 既有浏览器请求恢复用例通过；本轮未在十波终场额外注入断网，不据此声明完整战斗结算断网演练完成 |
| 探索／事件／剧情／家园回归与多视口布局 | npm run test:e2e 共 9 项通过，含原 8 项回归；1440×1100、390×844 教学截图已目视，页面无横向溢出，窄屏背包／道具／治疗目标可操作。窄视口不代替触屏真机验收 |
| 远端最新 main、实际 MR 冲突及 CI | fetch 基线已核实；实际 MR 与 CI 待远端验证，未合入 main |

本次环境为 Windows、Node 24.18.0、Playwright Chromium；Go 缓存使用可写目录。执行 npm run check 与 npm run test:e2e（端口 8127），均退出 0。Windows 测试结束时预览服务未自动退出，核对端口与进程身份后关闭该测试服务；未改生产启动脚本。源独立版本的旧测试与浏览器结果只作为历史取用依据，不计为本次主项目检查。正式家园补给、三档服务保存及分档发奖不在本次已完成声明中。
