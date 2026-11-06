export type FurnitureCategory='wall'|'decor'|'table'|'bed'|'seat'|'storage'|'plant'|'rug'|'lighting'|'toy';
import type {LotteryState, ParcelDraw, ParcelPool, ParcelReward} from '../modules/lottery/types';
export type GamePhase = 'dialogue' | 'explore' | 'event' | 'preparation' | 'battle' | 'settlement' | 'home';
export type BattleCarryId = 'lantern' | 'mirror' | 'bell' | 'box' | 'dog' | 'dove' | 'rats' | 'kitten';
export interface BattleModifiers {shadowPressure: -1 | 0 | 1; situation?: 'detour' | 'forced_chase'; carry?: BattleCarryId}
export interface BattleReport {leaks: number; bossDefeated: boolean; elitesDefeated?: number}
export interface BattleAttempt {id: string; stageId: string; status: 'active' | 'won' | 'lost'; modifiers?: BattleModifiers; mainline?: boolean; qa?: boolean}
export type EventTier = 'crit' | 'success' | 'partial' | 'fail';
export interface EventReward {fish?: number; stamps?: number; clue?: number; material?: number}
export interface EventOutcome {
  text: string; reward?: EventReward; tdMod?: {shadowPressure: -1 | 0 | 1}; carry?: BattleCarryId;
  situation?: {kind: 'detour' | 'forced_chase'; storyNodeId: string}; flags?: string[];
}
export interface EventResolution {eventId: string; optionId: string; dice: [number, number]; tier: EventTier; outcome: EventOutcome}
export interface EventState {lastResolution: EventResolution; pendingModifiers: BattleModifiers}
export interface GameState {
  schemaVersion: 1; contentVersion: string; revision: number; phase: GamePhase;
  chapterId: string; storyNodeId: string; mapId: string; flags: string[];
  cats: string[]; inventory: Record<string, number>; currencies: Record<string, number>;
  furniture: string[]; placements: Record<string, string>; completedStages: string[];
  pendingEventId: string; activeBattle: BattleAttempt | null;
  pendingEventSource?: 'node' | 'random'; drawnEvents?: string[]; exploreDistance?: number; pushTokens?: number;
  eventState?: EventState;
  txns?: PaymentTxn[];
  lottery?: LotteryState;
  homeLayout?: Record<string, HomePlacement>;
  homeRepairs?: string[];
  homeDecorOwned?: string[];
  alleyBattleReturn?: {x: number; y: number};
  lastResult: {draw?: ParcelDraw; draws?: ParcelDraw[]; message: string; roll?: number; outcome?: string; firstClear?: boolean; stageId?: string};
  qaCheckpointId?: string;
}
export interface HomePlacement {x:number;y:number;stored:boolean}
export interface HomeLayoutChange extends HomePlacement {key:string}
export interface HomeDecor {id:string;objectId:string;stage:number;name:string;sprite:string;category?:FurnitureCategory;x:number;y:number;width:number;kind:string;front?:boolean;wall?:boolean;replacementSlot?:string;storedByDefault?:boolean;renovatedFrom?:string;description?:string;acquisition?:{kind:'craft'|'gift';material?:number;description:string}}
export interface QACheckpoint {id: string; chapterId: string; title: string; phase: GamePhase; mapId: string; kind: 'story' | 'explore' | 'battle' | 'home' | 'event'; detail: string}
export interface QATools {enabled: boolean; checkpoints: QACheckpoint[]}
export type GameCommand =
  | {type: 'ADVANCE_STORY'; nodeId: string; optionId?: 'proud' | 'honest'}
  | {type: 'START_STORY'; nodeId: string}
  | {type: 'INTERACT'; interactionId: string; layer?: string; position?: {x:number;y:number}}
  | {type: 'REPORT_MOVE'; distance: number}
  | {type: 'CHECK_RANDOM_ZONE'; zoneId: string; layer?: string; position?: {x:number;y:number}}
  | {type: 'CHOOSE_EVENT'; eventId: string; optionId: string; usePush?: boolean}
  | {type: 'START_BATTLE'; stageId: string; returnPosition?: {x: number; y: number}; layer?:string}
  | ({type: 'COMPLETE_BATTLE'} & BattleResult)
  | {type: 'QA_SIMULATE_VICTORY'; attemptId: string}
  | {type: 'QA_SIMULATE_DEFEAT'; attemptId: string}
  | {type: 'QA_CHECKPOINT'; checkpointId: string}
  | {type: 'QA_RESTORE'}
  | {type: 'CONTINUE'} | {type: 'GO_HOME'} | {type: 'GO_EXPLORE'; mapId?: string}
  | {type: 'EXIT_MARKET'; layer: string; position: {x:number;y:number}}
  | {type: 'PLACE_FURNITURE'; furnitureId: string; slotId: string}
  | {type: 'SAVE_HOME_LAYOUT'; changes: HomeLayoutChange[]}
  | {type: 'ACQUIRE_HOME_DECOR'; decorId: string}
  | {type: 'DRAW_FURNITURE'; poolId: string; count?: 1 | 10}
  | {type: 'CLAIM_PARCEL_REWARD'; rewardId: string}
  | {type: 'BUY_FURNITURE'; productId: string}
  | {type: 'REPAIR_HOME'; repairId?:string};
export interface CommandRequest {expectedRevision: number; command: GameCommand}
export interface CommandResponse {state: GameState; replayed: boolean}
export interface Session {playerId: string; token: string}
// 账号体系:注册把当前匿名进度绑定到用户名密码,登录可在任意设备取回(返回新会话)。
export interface AuthRegistration {username: string}
export interface ApiErrorBody {error: {code: string; message: string; requestId: string}}
// 双货币:stamp=猫爪邮票(免费),tuna=金枪鱼罐头(付费,经模拟支付网关充值)。
export type CurrencyId = 'stamp' | 'tuna';
// 一档金枪鱼充值礼包(模拟支付网关商品,priceCents 为人民币分)。
export interface RechargePack {id: string; name: string; desc: string; priceCents: number; tunaGranted: number; icon: string}
// 一笔充值或消费流水:充值带 amount(分)与卡尾号;抽卡消费 amount=0、去向写在 reason。
export interface PaymentTxn {currency?: string; spent?: number; id: string; playerId: string; packId: string; amount: number; status: 'confirmed' | 'declined'; reason?: string; cardSuffix?: string; createdAt: string}
// POST /api/payment/charge 的响应:declined 时附 reason 与治愈文案 healingMsg。
export interface ChargeResponse {txnId: string; pack: RechargePack; status: 'confirmed' | 'declined'; reason?: string; healingMsg?: string; tunaGranted: number; tunaBalance: number}
export interface PaymentHistoryResponse {playerId: string; txns: PaymentTxn[]}
// GET /api/payment/config 的响应:支付网关形态,mock=演示卡号 UI、xsolla=跳转沙盒收银台。
export interface PaymentConfig {provider: 'mock' | 'xsolla'; sandbox: boolean}
// POST /api/payment/session 的响应:url 为 Xsolla PayStation 页面,整页跳转;发货走 webhook,前端不发货。
export interface PaymentSessionResponse {provider: 'xsolla'; txnId: string; url: string; sandbox: boolean}
export interface StoryNode {id: string; chapterId: string; speaker: string; text: string; next: string; exit: 'explore' | 'home' | 'preparation' | ''; scene?: 'alley' | 'poster' | 'home' | 'market' | 'tunnel'; setFlags?: string[]}
export interface FurnitureProduct {id: string; furnitureId: string; price: number; currencyId: string; requiredFlag: string; status: 'available' | 'disabled'}
// 花房四阶修缮工程:cost.material 走背包材料、cost.stamp 走猫爪邮票;
// unlockSlots 声明的槽位在 grantsFlag 记录前保持锁定。阶段 4 由剧情 flag 自动点亮,不出现在目录里。
export interface RenovationDefinition {
  id: string; stage: number; name: string; description?: string; message?: string;
  requiredFlag?: string; grantsFlag: string; cost?: {material?: number; stamp?: number; tuna?: number};
  unlockSlots?: string[];
  parts?: HomeRepairPart[];
}
export interface HomeRepairPart {id:string;name:string;description:string;x:number;y:number;cost:Partial<Record<'material'|'stamp'|'tuna',number>>;requires?:string[]}
export interface MapInteraction {id: string; x: number; y: number; label: string; eventId: string}
export interface MapDefinition {id: string; name: string; status: string; width: number; height: number; interactions: MapInteraction[]; dangerLevel?: 0 | 1 | 2 | 3}
export interface EventOption {id: string; label: string; requireCat?: string; outcomes: Record<EventTier, EventOutcome>}
export interface EventDefinition {id: string; title: string; text: string; maps?: string[]; repeatable?: boolean; category: 'opportunity' | 'risk' | 'story'; tags: ('trap' | 'shadow' | 'foraging' | 'pathfinding' | 'social')[]; triggers: ('node' | 'random')[]; requiresFlags?: string[]; options: EventOption[]}
export interface StageDefinition {id: string; name: string; status: string; lanes: number; columns: number; waves: number; chapterId?: string}
export interface ModuleResult<T> {status: 'completed' | 'cancelled'; data: T}
export interface BattleContext {attempt: BattleAttempt; stage: StageDefinition; catIds: string[]; modifiers: BattleModifiers}
export interface BattleResult {attemptId: string; outcome: 'won' | 'lost'; report?: BattleReport}
export interface MapContext {map: MapDefinition; flags: string[]; spawn: {x: number; y: number}}
export interface Catalog {
  version: string;
  chapters: {id: string; title: string; summary: string; status: string}[];
  story: StoryNode[]; maps: MapDefinition[]; events: EventDefinition[]; stages: StageDefinition[];
  cats: {id: string; name: string; color: string; description: string; skill: string}[];
  furniture: {id: string; name: string; theme: string; source?: 'story' | 'free_pool' | 'paid_pool'; description?: string; category?:FurnitureCategory; widthCm?: number; preferredSlot?: string; interactionCat?: string; interaction?: string}[];
  slots: {id: string; name: string}[];
  homeDecor: HomeDecor[];
  renovations?: RenovationDefinition[];
  items: {id: string; name: string; description: string}[];
  pools: ParcelPool[];
  parcelRewards?: ParcelReward[];
  rechargePacks?: RechargePack[];
  tutorials: {phase: GamePhase; text: string}[];
  assets: {id: string; kind: string; path: string}[];
  products: FurnitureProduct[];
}
