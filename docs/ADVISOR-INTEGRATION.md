# 阿策全程问答：AI 能力与接入方式

本功能基于 2026-10-31 的 main `c77df84b95bfe84d00511954e58c5631f3d98480`。

本次交付的是可接入的 AI 能力：只读问答接口、当前可见信息整理、分场景回答、本地回退和可选的会话管理工具。各模块负责人决定入口、面板、出现时机和暂停方式。此分支没有把新入口挂到 App、地图、家园、剧情、事件或六章战斗视口；现有战斗问答继续使用原接口。

## 1. 先选接入层级

| 方式 | 适合情况 | 提供的能力 |
| --- | --- | --- |
| 直接请求 `POST /api/v1/advisor` | 已有自己的聊天和状态管理 | 服务端认证、当前进度校验、模型调用与限流 |
| 使用纯函数和 `requestModelAdvisor` | 想复用上下文整理，自己管理界面/对话 | 当前可见信息、场景标识、本地回答、请求取消 |
| 使用可选的 `AdvisorProvider` / hooks | 想共用有限对话记录，界面仍自行制作 | 上述能力，加跨页最近三轮对话、旧回答取消、账号/QA隔离 |

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
- 事件只提供当前题面和可见选项；最近已结算事件单列。隐藏结果不发送。点点陷阱洞察已经在页面展示的资源/压力摘要可使用。
- 家园依据当前修缮项目的部件、真实成本、前置和已完成状态回答，不改修缮规则。
- 战斗继续使用六章现有快照，旅程伙伴名单不能替代在场战斗名单。

不会发送支付流水、会话 token、完整存档、未发生的剧情或整份事件结果表。模型只提供解释和建议，不执行任何游戏操作。

服务端在请求开始时核对 `expectedRevision` 和 `sceneKey`；返回时核对语义场景和相关进度。单纯移动里程变化不会让正在生成的答案失效；事件选择、资源、修缮或场景变化会取消过期答案。

`GameState` 只有当前剧情节点和进度标记，并不是完整的已读台词历史。本版不会宣称长期记住整段冒险。

## 4. 地图模块可选提供的观察

```ts
interface JourneySceneObservation {
  nearby?: {id: string; label: string};
  position?: {x: number; y: number};
  floor?: string;
}
```

缺少 `scene` 也能解释当前进度、事件和家园状态。有 `nearby/floor` 后可以说明附近对象和楼层。单纯坐标不等于可达路线，本版不会凭坐标编造转弯或寻路建议。若要精确指路，需要地图负责人另行定义可达出口/路线摘要，再约定扩展字段。

场景信息应取自当前地图模块的实际运行状态，不能沿用上一个地图的位置或交互目标。

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
| 地图 / Jenny | 可提供的当前位置/楼层/附近目标；是否需要另做精确路线摘要 |
| 事件 / 余尧 | 可见选项、公开规则和已结算效果的表达；隐藏结果仍按现有页面可见范围处理 |

已有内容可按当前接口接入，不需要为 AI 重写剧情、地图或事件。若主线入口、回访限制、结算去向改变，请同步 `journey-context.ts` 中的少量本地目标分支及对应测试；资源、部件成本、台词、事件题面直接读取当前内容数据。

## 7. 验收与部署边界

代码测试使用本机模拟模型，不等同于真实模型回答质量或已部署环境验收。页面负责人接入后应逐阶段检查入口、暂停、手机遮挡和切换场景；再用私有配置进行真实模型联调。

继续使用既有 `ADVISOR_API_KEY`、`ADVISOR_BASE_URL`、`ADVISOR_MODEL` 和限流配置，不需要在浏览器放密钥。全程可问不意味着移动、渲染或自动教学时不断请求模型。此分支不包含集群配置改动或部署操作。
