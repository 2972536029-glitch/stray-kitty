# 阿策全程问答：AI 能力与接入方式

本功能基于 2026-10-31 的 main `c77df84b95bfe84d00511954e58c5631f3d98480`。

本次交付的是可接入的 AI 能力：只读问答接口、当前可见信息整理、分场景回答、本地回退和可选的会话管理工具。各模块负责人决定入口、面板、出现时机和暂停方式。此分支没有把新入口挂到 App、地图、家园、剧情、事件或六章战斗视口；现有战斗问答继续使用原接口。

2026-11-01 按地图工作项 [Jenny 的接入约定](https://school-gitlab.xsolla.dev/haozhe_wang/stray-kitty/-/work_items/3#note_9205) 及 [名称/ID 可见性附表](https://school-gitlab.xsolla.dev/haozhe_wang/stray-kitty/-/work_items/3#note_9206)，另提供可选的**探索短提示**能力：地图决定显隐、目标资格、远近档与完成条件，AI 仅调整当前批准文字的措辞，接入到原底部文字区。第一、二、四、五章可接，第三章花房不纳入；不会因此新增地图聊天入口。四章页面尚需地图/UI 负责人接入，下面的工具不会自动挂到生产页面。

## 1. 先选接入层级

| 方式 | 适合情况 | 提供的能力 |
| --- | --- | --- |
| 直接请求 `POST /api/v1/advisor` | 已有自己的聊天和状态管理 | 服务端认证、当前进度校验、模型调用与限流 |
| 使用纯函数和 `requestModelAdvisor` | 想复用上下文整理，自己管理界面/对话 | 当前可见信息、场景标识、本地回答、请求取消 |
| 使用可选的 `AdvisorProvider` / hooks | 想共用有限对话记录，界面仍自行制作 | 上述能力，加跨页最近三轮对话、旧回答取消、账号/QA隔离 |
| 地图使用 `useExploreAdvisorHint` | 沿用当前底部情境文字，无新增操作 | 当前提示单句改写、去抖、低频缓存、过期取消、原文字回退；独立于聊天历史 |

三个层级不会自动移动角色、推进剧情、选择事件、修改存档、领取奖励或付款。

## 2. 旅程请求协议

使用现有匿名/登录会话的 Bearer token，经同源 Go 服务请求；模型密钥继续只由服务端私有配置提供。

```ts
import {buildJourneyAdvisorContext, journeySceneKey, getJourneyLocalAnswer}
  from '../modules/advisor/journey-context';
import {requestModelAdvisor}
  from '../modules/battle/model-advisor-client';

// 在玩家真正点击“发送”时读取最新 state/catalog/scene。
const abort = new AbortController();
const answer = await requestModelAdvisor({
  scope: 'journey',
  sceneKey: journeySceneKey(state),
  expectedRevision: state.revision,
  question,
  context: buildJourneyAdvisorContext(state, catalog, scene),
  history: [], // 可传最近三轮，共最多6条 user/assistant 消息
}, abort.signal);

const displayed = answer.source === 'model'
  ? answer
  : {...getJourneyLocalAnswer(state, catalog, question, scene), source: 'local'};
// displayed.title/text 按纯文本显示；保留 source 标签，说明是否为本地建议。
// 关闭页面、切换场景或账户时调用 abort.abort()，不自动重发。
```

| 字段 | 约定 |
| --- | --- |
| `scope` | 旅程请求为 `journey`；缺省或 `battle` 保持旧战斗协议 |
| `sceneKey` | `JSON.stringify([state.phase, state.chapterId, state.mapId, state.storyNodeId, state.pendingEventId, state.activeBattle?.id ?? ''])`，请直接用导出函数 |
| `expectedRevision` | 提问时最新的非负整数进度版本 |
| `question` | 1–500字；只在玩家主动提问时请求 |
| `context` | JSON对象的字符串，最多24000字；使用白名单生成器，不能直接序列化整个存档或内容目录 |
| `history` | 可省略，最多6条，仅 `user` / `assistant`，每条不超过1200字 |

`journey` 请求不传 `attemptId/stageId`。旧战斗请求仍传这两个字段，继续使用 `buildModelAdvisorContext(stageId, snapshot)` 取得真实棋盘信息。

返回值仍为 `{source: 'model' | 'local', title, text, reason?}`。`source: local` 表示应使用当前场景的本地回答，并显示回退提示；不能标成模型成功。

HTTP 409 表示场次或当前进度已变化，客户端抛出 `AdvisorContextChanged`。此时应丢弃旧答案和旧场景的备用回答，提示玩家重新提问，不自动重试。400/401等错误也不得变成游戏命令或自动创建新存档。

## 3. AI 能看见什么

服务端读取当前会话的可信进度，另附客户端提供的可见观察：

- 当前阶段、章节、地图，已结识伙伴、已有资源、已完成关卡。
- 剧情只提供当前正在显示的一句，不提供未来节点链或整章剧本。
- 事件只提供当前题面、可见选项和页面公开的骰点档位；最近已结算事件单列。隐藏结果不发送。点点陷阱洞察已经在页面展示的资源/压力摘要可使用。当前普通选项不要求或扣除库存物品，“放下鱼干”等叙事不等于库存费用；伙伴鼓励单独消耗鼓励次数，须在掷骰前使用。
- 家园依据当前修缮项目的部件、真实成本、前置和已完成状态回答。AI 摘要会合计目标及尚未完成的前置成本，共用前置只计算一次，再用当前余额计算总缺口；这只是建议用的计算，不扣款、不改变修缮规则。前置缺失或存在循环时不提供不完整的合计。
- 战斗继续使用六章现有快照，旅程伙伴名单不能替代在场战斗名单；喵喵是保护目标，阿策是顾问，均不计为战斗主力。准备阶段未提供真实阵容时，不推测上场名单。
- 资源名称固定区分：`food` 是鱼干，`material` 是修缮材料，`clue` 是线索，`stamp` 是猫爪邮票，`tuna` 是金枪鱼罐头。当前集市不能直接回家，离开方式以北侧出口规则为准。

不会发送支付流水、会话 token、完整存档、未发生的剧情或整份事件结果表。模型只提供解释和建议，不执行任何游戏操作。

服务端在请求开始时核对 `expectedRevision` 和 `sceneKey`；返回时核对语义场景和相关进度。单纯移动里程变化不会让正在生成的答案失效；事件选择、资源、修缮或场景变化会取消过期答案。

`GameState` 只有当前剧情节点和进度标记，并不是完整的已读台词历史。本版不会宣称长期记住整段冒险。

## 4. 地图模块可选提供的观察

```ts
interface JourneySceneObservation {
  nearby?: {id: string; label: string};
  position?: {x: number; y: number};
  floor?: string;
  inspectHint?: string; // 地图此刻批准的文字；换场景、完成或失效时清掉
}
```

缺少 `scene` 也能解释当前进度、事件和家园状态。有 `nearby/floor` 后可以说明附近对象和楼层。单纯坐标不等于可达路线，本版不会凭坐标编造转弯或寻路建议。若要精确指路，需要地图负责人另行定义可达出口/路线摘要，再约定扩展字段。

场景信息应取自当前地图模块的实际运行状态，不能沿用上一个地图的位置或交互目标。

主动问答中，有效 `inspectHint` 会作为当前地图目标，优先于通用进度提示；只在探索阶段发送。`nearby.id` 只在客户端用来识别观察变化，模型只收到已显示的 `nearby.label`，不会按内部 ID 推测陷阱、首领或后续剧情。

### 4.1 地图底部短提示的推荐接法

地图沿用原有 `inspectHint`、`nearTarget`、楼层及 eligibility helper。**先由地图确定这句可显示、可润色，再调用工具**。不要遍历开发附表寻找尚未显示的目标，不新增发现列表、追踪存档或寻路规则。

```tsx
import {useExploreAdvisorHint} from '../modules/advisor/useExploreAdvisorHint';

const hint = useExploreAdvisorHint({
  state,
  // 地图已判定这是当前有效的情境线索。真实按键、锁定原因、
  // 前置条件及附近交互提示保持原来的本地判定与文字。
  enabled: mapAllowsAiWording,
  inspectHint, // 仍传地图原来的本地文字，不能再把AI结果回灌这里
  nearTarget: near ? nearTarget : null,
  floor: currentFloor,
  hintKey: currentTargetAndDistanceBand, // 可选，本地缓存键，不发送给模型
  blocked: externalOverlayOpen || gameCommandPending,
  resetKey: journeyOrQAVisitKey,
});

// 在现有 GameScreen 参数上接 hint.text，保持 nearHint 优先的原显示结构。
// 这段仅为接入示意，页面及显隐改动由地图/UI负责人完成。
<GameScreen {...existingGameScreenProps} inspectHint={hint.text} />
```

`mapAllowsAiWording`、`currentFloor` 和可选的目标/距离档键是接入方的现有运行时值，不是本分支新增的游戏状态字段。没有独立键时，当前提示文字本身也参与去重；不需要为此创建追踪系统。集市、暗道和仓库等多层地图必须提供当前有效的 `floor`，缺少时只使用本地文字。

行为约定：

- 默认仍是接入方选择是否启用；hook 自身不创建按钮、面板、箭头、NPC、地图标记或暂停行为。
- 原文立即可用；同一提示稳定800毫秒后才尝试生成。两次尝试至少间隔15秒，不按每帧位置或 revision 发请求，按当前目标/距离档复用内存缓存。
- 每份当前地图进度最多保留64条缓存；换地图、楼层、关键进度、账号或 QA/重开标识时清除。目标完成后由地图清掉原 `inspectHint` 或关闭 `enabled`，工具同步取消旧结果。
- 附近真实交互目标出现、页面隐藏、进入事件/战斗等其他阶段、外部弹层阻断时取消等待。真实 `nearHint` 继续优先显示；不能用 AI 文字替换 E/C/F/S/Space、锁定原因或前置条件。
- 生成失败、超时、限流、上下文冲突或输出不合格时继续原本地文字；同一有效提示不自动重试，不弹错误提示，不阻塞行走。缓存只在内存，不写存档或浏览器持久存储。
- 发往模型的观察只有当前已批准的一句文字。内部目标 ID、距离档键、坐标、开发附表、完整地图和未打开的事件不发给模型；不靠 ID 中的 `trap`、`boss` 等词提前揭示真相。
- 模型返回只显示单句正文（最多80字）；服务端会拒绝明显新增的方向、按键、数字、部分人物/机制词或改变不确定语气的输出。这是附加校验，不能代替地图的资格与可见性判定。

### 4.2 独立短提示请求协议

不使用 hook 的接入方，也可以调用同一个认证接口：

```ts
const answer = await requestModelAdvisor({
  scope: 'explore_hint',
  sceneKey: journeySceneKey(state),
  expectedRevision: state.revision,
  context: JSON.stringify({hint: approvedLocalHint}),
}, abort.signal);
const text = answer.source === 'model' ? answer.text : approvedLocalHint;
```

本模式不接收 `question`、`history`、`attemptId`、`stageId`；`context` 只允许 `{hint: string}`，文字最多240字，JSON字符串最多2048字。模型最多等待4秒，无重试。客户端调用现有同源接口，继续使用原会话认证，密钥只在服务端。开始核对当前场景和版本，返回前核对相关进度，已经完成的目标或已打开的事件不能收到旧提示。

自动提示的服务端会话槽与主动聊天分开，仍受现有全局并发、日请求预算和每槽六次/分钟限制；它不属于独立计费上限。直接调用接口的接入方需要自行实现与 hook 一样的低频、缓存、取消和原文字回退约定。

## 5. 可选 React 会话工具

`web/src/modules/advisor/AdvisorProvider.tsx` 不包含任何入口按钮、面板或样式，也不会自行暂停游戏。

```tsx
<AdvisorProvider
  state={state}
  catalog={catalog}
  scene={currentObservation}
  open={advisorOpen}
  onOpenChange={setAdvisorOpen}
  blocked={externalOverlayOpen || gameCommandPending}
  resetKey={journeyOrQAVisitKey}
>
  {/* 由页面负责人接入自己的页面与聊天界面 */}
</AdvisorProvider>
```

内部可调用：

```ts
const [open, setOpen] = useAdvisorOpen();
const {messages, pendingQuestion, notice, loading, ready, sceneLabel, ask}
  = useGlobalAdvisor();
// 发送按钮：ask(question)。每次发送重新构建当前上下文。
// title/text 和问题按普通文本渲染，不作为HTML或游戏指令执行。
```

- `open/onOpenChange` 由接入方决定，不指定常驻位置或出现时机。
- `blocked` 表示外部操作暂不允许提问。若接入方选择聊天时暂停游戏，不能把聊天自身导致的暂停又传为 `blocked`，否则会取消自己的请求。
- 切换场景/当前观察时，已完成的最近三轮对话可保留，进行中的旧请求会取消。
- 换会话、重新开始、QA访问变化时清空历史。接入方应为重开/QA提供新的 `resetKey` 并传入新状态。
- 页面隐藏或聊天关闭时取消等待，不自动重发。

战斗如决定加入同一会话，可在其已有视口内主动接入 `useBattleAdvisorBridge({attemptId, stageId, blocked, getSnapshot, localAnswer})`，再使用 `useGlobalAdvisor()` 的问答状态。它只登记读取快照的方法，不操作引擎。接入方负责沿用原暂停、瞄准、猫咪查看和结束状态的限制，避免同时保留两个独立聊天实例。未接入时，原六章战斗聊天继续独立工作。

## 6. 分工与后续确认

| 负责人/模块 | 需要确认的内容 |
| --- | --- |
| AI | 请求协议、当前摘要、分场景提示词、有限对话、取消与本地回退 |
| UI / 轩扬 | 入口位置、面板样式、移动端、与其他弹层的优先级、暂停及战斗会话是否统一 |
| 剧情和家园 / 浩哲 | 阿策口吻、允许解释的剧情、出现时机；修缮和主线入口变化时同步提示规则 |
| 地图 / Jenny | 当前有效本地 hint、楼层、目标/距离档资格和完成条件；决定何时允许短句润色，并与UI接入原底部文字区 |
| 事件 / 余尧 | 可见选项、公开规则和已结算效果的表达；隐藏结果仍按现有页面可见范围处理 |

### 6.1 当前场景分工与入口约定

地图采用底部自动短提示，不要求其他页面改为同一种交互。入口与模型能力分开对接：

| 场景 | 当前接入约定 | 负责对接 |
| --- | --- | --- |
| 第一、二、四、五章地图探索 | 地图批准原hint，`useExploreAdvisorHint`润色，接原底部文字区；真实交互优先 | Jenny与UI |
| 已打开的事件弹窗 | 按事件方提议提供主动“问阿策”，用`journey`，不传battle attemptId；具体入口与弹层时机由UI确认 | 余尧与UI |
| 第三章花房、家园与剧情 | 由剧情/家园负责人决定出现时机、口吻、可解释内容和入口；可用`journey`读取home/dialogue等当前状态，不套用四章探索自动短提示 | 浩哲与UI |
| 战斗 | 沿用现有战况问答；是否并入公共会话由接入方决定 | 战斗与UI |

事件打开即不再处于explore，地图短提示取消；事件主动问答只解释当前已打开的卡、可见选项和已结算结果。选项落定、事件关闭或进度变化时取消旧回答。若“问阿策”属于当前事件弹窗内部功能，不能仅因该事件弹窗存在就把Provider的`blocked`设为true；真正外部阻断、请求中的游戏命令等仍需遵守原限制。聊天与地图短提示使用独立会话，自动提示不写入主动问答历史。

### 6.2 事件公开口径与后续可选字段

按[事件方的公开口径](https://school-gitlab.xsolla.dev/haozhe_wang/stray-kitty/-/work_items/2#note_9244)，AI只解释规则与字面行动，不推荐、排名或代选具体选项，不取代事件卡原文，不预测骰点或公开未结算档位结果/未解锁续接卡。

普通一组2d6的12/9–11/5–8/2–4四档基础概率为2.78%/25%/55.56%/16.67%，直接复用当前展示数据，不能用旧失败率27.78%，也不能套作鼓励两组取高的概率。当前失败档公开保底至少1条线索，但仍可能有压力或剧情代价；鼓励初始1、上限2，当前正式主线首次救回点点成功补1，重复通关不回，不承诺每场战斗都恢复。普通无放回卡按区域记录；少量`repeatable`回响卡保留配置例外，只有章节前进才刷新遭遇池，不能向模型列出尚未解锁的卡池。

事件方已通过!106/!107提供卡/选项级可选`advisorHint`，并在main `67334264`中修正9条解释文字。最终44张卡中的22条解释已对照卡面和机制复核，通过后本分支补齐只读兼容层。事件目录及schema仍由事件方维护；接入版本载入含字段的catalog时即可读取，无需修改旧卡或新增存档字段。

读取约定：

- 仅在`phase=event`时读取`pendingEventId`对应的当前卡；先按现有`requireCat`过滤不可见选项，再读相应解释。卡的maps与当前位置不符时只省略新解释，保留旧题面处理。
- 卡级最多120、选项级最多60个UTF-16单元，与内容lint的JS.length一致。缺失、空白、非字符串、超长或多行值直接省略，不截断或去空白后将非法值变成合法值。
- 前端白名单投影为当前卡/可见选项的“公开解释”，服务端投影为`currentEvent.advisorHint`及可见选项的`advisorHint`。不发送整张表，不给历史事件、未打开卡或已隐藏选项追加解释。
- 解释是内容数据，不是系统指令；只补充题面，不覆盖服务端机制、费用、资源或已结算事实，不据此保证结果、推荐选项或透露未结算tier。费用、概率、鼓励与禁止代选的本地规则仍优先处理。
- 旧卡无字段时沿用原题面、可见选项、公开规则和已发生结果；上下文与本地回答已做旧卡兼容回归。可选值类型错误也不会使整个卡片或剧情文本读取失败。

新hint仍需事件方的机器lint与人工语义核对，静态字段不能天然保证无剧透。此读取不改地图自动提示、事件入口或第三章花房的既有分工。

已有内容可按当前接口接入，不需要为 AI 重写剧情、地图或事件。若主线入口、回访限制、结算去向改变，请同步 `journey-context.ts` 中的少量本地目标分支及对应测试；资源、部件成本、台词、事件题面直接读取当前内容数据。

## 7. 验收与部署边界

自动化代码测试使用本机模拟模型。2026-10-31 对提交 `e56c8fc` 另外运行了七个模拟存档场景的真实 DeepSeek 请求，覆盖剧情、探索、事件、准备、结算、家园与原战斗接口；七次均返回模型答案，耗时约 2.6–5.1 秒，存档和版本均未变化。

真实链路成功不等于回答内容全部正确：首轮逐条复核为三条通过、两条有保留、两条失败。发现的问题是集市回家规则表达含糊、把旅程名单当作出战名单、鱼干与罐头混淆，以及连续修缮重复使用同一余额。本分支已补充 AI 信息摘要、提示词和离线回归，并进行了针对性复测。

| 真实模型验收轮次 | 请求数 | 内容复核结果 |
| --- | ---: | --- |
| 首轮七阶段覆盖 | 7 | 发现上述问题，不能记为内容全通过 |
| 修正后复测，含公开骰点与鼓励 | 6 | 原问题均纠正；五条通过，一条仍把选项中的鱼干叙事与真实库存关联 |
| 补充事件费用规则后复测 | 3 | 三条通过，包含“鱼干为0仍可选、不扣库存、不需要购买”的边界 |

上述主动问答验收累计16次真实请求均通过现有 `/api/v1/advisor`，返回真实模型答案，模拟存档和版本均未变化。最新复核中，本轮发现的内容问题已修复；成本计算、0库存事件、主线/独立试玩去向等另有确定性回归。真实模型抽样通过不代替页面接入验收，也不是对所有可能问题的正确性保证。

2026-11-01 探索短提示追加验收：前端完整639项回归、8项可选SDK浏览器测试、Go全套测试和静态检查、类型/接口/架构检查及生产构建通过。另用7条模拟地图已批准文字做真实DeepSeek调用，包含Jenny给的集市三个距离档示例及小巷、暗道、仓库观察；7条均返回模型短句，约0.95–1.88秒。人工逐条核对，没有发现新增未显示人物、隐藏结果、按键或路线，模拟存档和版本均不变。自动请求去抖、15秒间隔、缓存、取消、原文回退以及实际浏览器hook行为另有离线回归。四章页面尚未接入，本验收不包含生产地图显隐或整章试玩。

同日按事件方新回复补充中立解释约束与公开概率；21项旅程上下文回归通过，并核对当前44张卡的93个选项均符合已公开的失败线索保底。另做3条真实模型验收：要求直接代选时仍保留玩家选择权、使用16.67%当前基础失败率并说明保底不等于无代价、正确说明鼓励初始/上限/正式主线恢复条件；3条均通过，约1.68–2.58秒，模拟存档和版本不变。未实现提案中的`advisorHint`字段，事件、地图、家园与UI入口仍按6.1分工接入。

随后事件方完成9条解释修正（main `67334264`），本分支补齐`advisorHint`读取。新增后的647项前端回归、27项旅程定向检查、Go全套回归与静态检查通过；22条最终解释的投影和9个墨墨选项可见性已逐条核对。另在不修改仓库内容表的隔离服务副本中嵌入最终事件元数据，做5条真实API/模型验收，覆盖当前卡解释、墨墨隐藏/可见选项、不保证全档线索或老黄支援、无字段旧卡；5条均通过，约1.99–3.08秒，存档与版本不变。解释读取不改变6.1中的入口和模块分工。

页面负责人接入后，仍需逐阶段检查入口、暂停、手机遮挡和切换场景，并对接入后的实际可见信息做联调。这些页面验收与已部署环境验收不能由 API 测试代替。

如事件负责人将来增加库存费用或新的选项门槛，需要同步当前事件摘要及费用说明；若地图主线去向改变，同步当前目标规则。AI 本身不会修改这些玩法。

继续使用既有 `ADVISOR_API_KEY`、`ADVISOR_BASE_URL`、`ADVISOR_MODEL` 和限流配置，不需要在浏览器放密钥。主动问答仍只在玩家发送时请求；可选地图短提示按4.1的去抖与低频缓存生成，不在移动每帧请求。此分支不包含集群配置改动或部署操作。
