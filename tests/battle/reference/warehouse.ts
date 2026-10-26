// Historical browser-preview transaction reference; production code must not import this file.
import {CONFIG, createSupplyInventory, normalizeDifficulty} from '../../../web/src/modules/battle/l00/config.ts';
import type {BattleContext, BattleDifficulty, BattleResult, BattleSupplyUsage} from '../../../web/src/modules/battle/l00/types.ts';
import {createBattleRewards, L00_FIRST_CLEAR_BONUS, L00_STAGE_ID, REWARD_COUNTS} from './rewards.ts';
import type {RewardGrant, SupplyCounts} from './rewards.ts';

export const PREVIEW_WAREHOUSE_STORAGE_KEY = 'stray-kitty-preview-warehouse-v1';
const MAX_QUANTITY = 1_000_000;
const MAX_RECEIPTS = 10_000;
const MAX_STORAGE_LENGTH = 10_000_000;
const SUPPLY_IDS = ['warm-can', 'bouncy-treat'] as const;
const emptySupplies = (): SupplyCounts => ({'warm-can': 0, 'bouncy-treat': 0});

export interface WarehouseStorage {getItem(key: string): string | null; setItem(key: string, value: string): void}
export interface ActiveWarehouseAttempt {
  attemptId: string;
  stageId: string;
  difficulty: BattleDifficulty;
  extraSupplies: SupplyCounts;
  usedExtras: SupplyCounts;
}
export interface Receipt extends RewardGrant {
  attemptId: string;
  stageId: string;
  difficulty: BattleDifficulty;
  outcome: 'won' | 'lost' | 'abandoned';
  returnedSupplies: SupplyCounts;
  consumedSupplies: SupplyCounts;
  isFirstClear: boolean;
}
export interface WarehouseState {
  version: 1;
  inventory: SupplyCounts;
  active: ActiveWarehouseAttempt | null;
  receipts: Record<string, Receipt>;
  completedStages: string[];
  lastReceipt: Receipt | null;
}
export interface WarehouseSettlement {state: WarehouseState; receipt: Receipt}

export class PreviewWarehouseError extends Error {
  constructor(public readonly code: string, message: string) {super(message); this.name = 'PreviewWarehouseError';}
}
function fail(code: string, message: string): never {throw new PreviewWarehouseError(code, message);}
function record(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('INVALID_WAREHOUSE_DATA', '仓库资料格式不正确，请保留原资料并检查。');
  }
  const own = Reflect.ownKeys(value);
  if (keys && (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key)))) {
    fail('INVALID_WAREHOUSE_DATA', '仓库资料包含缺失或不支持的字段。');
  }
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    fail('INVALID_WAREHOUSE_DATA', '战斗或关卡标识不正确。');
  }
  return value;
}
function integer(value: unknown, maximum = MAX_QUANTITY): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    fail('INVALID_WAREHOUSE_DATA', '仓库数量必须是合法的非负整数。');
  }
  return value;
}
function difficulty(value: unknown): BattleDifficulty {
  if (value !== 'low' && value !== 'medium' && value !== 'high') fail('INVALID_WAREHOUSE_DATA', '仓库中的战斗难度不正确。');
  return value;
}
function supplies(value: unknown, maximum?: SupplyCounts): SupplyCounts {
  const source = record(value, SUPPLY_IDS);
  return {
    'warm-can': integer(source['warm-can'], maximum?.['warm-can']),
    'bouncy-treat': integer(source['bouncy-treat'], maximum?.['bouncy-treat']),
  };
}
function equalSupplies(a: SupplyCounts, b: SupplyCounts): boolean {return SUPPLY_IDS.every(id => a[id] === b[id]);}
function loadActive(value: unknown): ActiveWarehouseAttempt {
  const source = record(value, ['attemptId', 'stageId', 'difficulty', 'extraSupplies', 'usedExtras']);
  const extraSupplies = supplies(source.extraSupplies, {'warm-can': 2, 'bouncy-treat': 1});
  return {
    attemptId: identifier(source.attemptId), stageId: identifier(source.stageId), difficulty: difficulty(source.difficulty),
    extraSupplies, usedExtras: supplies(source.usedExtras, extraSupplies),
  };
}
function loadReceipt(value: unknown): Receipt {
  const source = record(value, ['attemptId', 'stageId', 'difficulty', 'outcome', 'rewards', 'returnedSupplies', 'consumedSupplies', 'baseRewardCount', 'firstClearBonus', 'rewardCount', 'isFirstClear']);
  const outcome = source.outcome;
  if (outcome !== 'won' && outcome !== 'lost' && outcome !== 'abandoned') fail('INVALID_WAREHOUSE_DATA', '仓库结算结果不正确。');
  if (typeof source.isFirstClear !== 'boolean') fail('INVALID_WAREHOUSE_DATA', '仓库首胜记录不正确。');
  const item: Receipt = {
    attemptId: identifier(source.attemptId), stageId: identifier(source.stageId), difficulty: difficulty(source.difficulty), outcome,
    rewards: supplies(source.rewards, {'warm-can': 6, 'bouncy-treat': 6}),
    returnedSupplies: supplies(source.returnedSupplies, {'warm-can': 2, 'bouncy-treat': 1}),
    consumedSupplies: supplies(source.consumedSupplies, {'warm-can': 2, 'bouncy-treat': 1}),
    baseRewardCount: integer(source.baseRewardCount, 4), firstClearBonus: integer(source.firstClearBonus, 2),
    rewardCount: integer(source.rewardCount, 6), isFirstClear: source.isFirstClear,
  };
  const expectedBase = outcome === 'won' ? REWARD_COUNTS[item.difficulty] : 0;
  const expectedBonus = outcome === 'won' && item.isFirstClear && item.stageId === L00_STAGE_ID ? L00_FIRST_CLEAR_BONUS : 0;
  if (item.baseRewardCount !== expectedBase || item.firstClearBonus !== expectedBonus || item.rewardCount !== expectedBase + expectedBonus
    || item.rewards['warm-can'] + item.rewards['bouncy-treat'] !== item.rewardCount || (outcome !== 'won' && item.isFirstClear)
    || item.returnedSupplies['warm-can'] + item.consumedSupplies['warm-can'] > 2
    || item.returnedSupplies['bouncy-treat'] + item.consumedSupplies['bouncy-treat'] > 1) {
    fail('INVALID_WAREHOUSE_DATA', '仓库结算数量或首胜标记不一致。');
  }
  return item;
}
function emptyState(): WarehouseState {
  return {version: 1, inventory: emptySupplies(), active: null, receipts: Object.create(null) as Record<string, Receipt>, completedStages: [], lastReceipt: null};
}
function validateState(value: unknown): WarehouseState {
  const source = record(value, ['version', 'inventory', 'active', 'receipts', 'completedStages', 'lastReceipt']);
  if (source.version !== 1) fail('INVALID_WAREHOUSE_DATA', '不支持当前仓库版本，请保留原资料。');
  const state = emptyState();
  state.inventory = supplies(source.inventory);
  state.active = source.active === null ? null : loadActive(source.active);
  const rawReceipts = record(source.receipts);
  const keys = Reflect.ownKeys(rawReceipts);
  if (keys.length > MAX_RECEIPTS) fail('INVALID_WAREHOUSE_DATA', '仓库结算记录超过当前试玩支持范围。');
  for (const key of keys) {
    const id = identifier(key);
    const receipt = loadReceipt(rawReceipts[id]);
    if (receipt.attemptId !== id) fail('INVALID_WAREHOUSE_DATA', '仓库结算标识不一致。');
    state.receipts[id] = receipt;
  }
  if (state.active && Object.hasOwn(state.receipts, state.active.attemptId)) fail('INVALID_WAREHOUSE_DATA', '已结算的战斗不能同时处于进行中。');
  if (!Array.isArray(source.completedStages) || source.completedStages.length > MAX_RECEIPTS) fail('INVALID_WAREHOUSE_DATA', '仓库通关记录不正确。');
  state.completedStages = source.completedStages.map(identifier);
  const completedStages = new Set(state.completedStages);
  if (completedStages.size !== state.completedStages.length) fail('INVALID_WAREHOUSE_DATA', '仓库通关记录有重复项。');
  const firstClears = new Set<string>();
  for (const receipt of Object.values(state.receipts)) {
    if (receipt.outcome !== 'won') continue;
    if (!completedStages.has(receipt.stageId)) fail('INVALID_WAREHOUSE_DATA', '仓库结算与通关记录不一致。');
    if (receipt.isFirstClear) {
      if (firstClears.has(receipt.stageId)) fail('INVALID_WAREHOUSE_DATA', '同一关卡不能重复领取首次奖励。');
      firstClears.add(receipt.stageId);
    }
  }
  if (state.completedStages.some(stageId => !firstClears.has(stageId))) fail('INVALID_WAREHOUSE_DATA', '仓库缺少相应的首次通关记录。');
  if (source.lastReceipt !== null) {
    const last = loadReceipt(source.lastReceipt);
    if (!Object.hasOwn(state.receipts, last.attemptId) || JSON.stringify(state.receipts[last.attemptId]) !== JSON.stringify(last)) {
      fail('INVALID_WAREHOUSE_DATA', '最近一次结算与保存记录不一致。');
    }
    state.lastReceipt = last;
  } else if (keys.length) fail('INVALID_WAREHOUSE_DATA', '仓库缺少最近一次结算。');
  return state;
}

/** Local preview only. The host must serialize all transactions across tabs, e.g. with navigator.locks. */
export class PreviewWarehouse {
  constructor(private readonly storage: WarehouseStorage, private readonly random: () => number = Math.random) {}

  load(): WarehouseState {
    let raw: string | null;
    try {raw = this.storage.getItem(PREVIEW_WAREHOUSE_STORAGE_KEY);}
    catch {return fail('WAREHOUSE_READ_FAILED', '无法读取本地仓库。请保留当前页面，恢复浏览器存储权限后重试。');}
    if (raw === null) return emptyState();
    if (typeof raw !== 'string' || raw.length > MAX_STORAGE_LENGTH) return fail('INVALID_WAREHOUSE_DATA', '本地仓库资料过大或格式不正确。');
    let parsed: unknown;
    try {parsed = JSON.parse(raw);}
    catch {return fail('INVALID_WAREHOUSE_DATA', '本地仓库资料损坏，未清空或覆盖原资料。');}
    return validateState(parsed);
  }

  reserve(context: BattleContext): WarehouseState {
    const state = this.load();
    const raw = record(context);
    const attempt = record(raw.attempt);
    const stage = record(raw.stage);
    const attemptId = identifier(attempt.id);
    const stageId = identifier(attempt.stageId);
    if (identifier(stage.id) !== stageId || attempt.status !== 'active') fail('INVALID_WAREHOUSE_REQUEST', '请使用正在进行且关卡一致的战斗实例。');
    if (stageId !== L00_STAGE_ID || stage.lanes !== CONFIG.ROWS || stage.columns !== CONFIG.COLUMNS || stage.waves !== CONFIG.TOTAL_WAVES) {
      fail('UNSUPPORTED_PREVIEW_STAGE', '本机试玩仓库当前只支持 L00 序章的 3×7、十波战斗；后续章节不沿用教学免费补给。');
    }
    const selectedDifficulty = normalizeDifficulty(raw.difficulty);
    const inventory = createSupplyInventory(raw.extraSupplies);
    const extraSupplies: SupplyCounts = {
      'warm-can': inventory['warm-can'] - CONFIG.MEDICINE_COUNT,
      'bouncy-treat': inventory['bouncy-treat'] - CONFIG.ENERGY_ITEM_COUNT,
    };
    if (Object.hasOwn(state.receipts, attemptId)) fail('BATTLE_ALREADY_SETTLED', '这场战斗已经结算，请创建新的挑战。');
    if (state.active) {
      if (state.active.attemptId === attemptId && state.active.stageId === stageId && state.active.difficulty === selectedDifficulty
        && equalSupplies(state.active.extraSupplies, extraSupplies)) return state;
      fail('WAREHOUSE_ATTEMPT_ACTIVE', '仓库已有进行中的战斗，请先完成或收回该场补给。');
    }
    if (Object.keys(state.receipts).length >= MAX_RECEIPTS) fail('WAREHOUSE_CAPACITY', '本地试玩结算记录已达上限，请保留资料后再处理。');
    for (const id of SUPPLY_IDS) {
      if (extraSupplies[id] > state.inventory[id]) fail('INSUFFICIENT_SUPPLIES', '仓库中的补给不足，无法按这份清单出战。');
      state.inventory[id] -= extraSupplies[id];
    }
    state.active = {attemptId, stageId, difficulty: selectedDifficulty, extraSupplies, usedExtras: emptySupplies()};
    return this.save(state);
  }

  recordSupplies(attemptId: string, usage: BattleSupplyUsage): WarehouseState {
    const state = this.load();
    identifier(attemptId);
    if (!state.active || state.active.attemptId !== attemptId) fail('WAREHOUSE_ATTEMPT_MISMATCH', '此场战斗与仓库预留记录不一致。');
    const source = record(usage, ['usedExtras']);
    const usedExtras = supplies(source.usedExtras, state.active.extraSupplies);
    if (equalSupplies(usedExtras, state.active.usedExtras)) return state;
    // A tutorial reset or free wave reform rolls back the corresponding simulated consumption.
    state.active.usedExtras = usedExtras;
    return this.save(state);
  }

  settle(result: BattleResult): WarehouseSettlement {
    const source = record(result, ['attemptId', 'outcome']);
    const attemptId = identifier(source.attemptId);
    if (source.outcome !== 'won' && source.outcome !== 'lost') fail('INVALID_WAREHOUSE_REQUEST', '战斗结果必须是胜利或失败。');
    const state = this.load();
    if (Object.hasOwn(state.receipts, attemptId)) {
      const receipt = state.receipts[attemptId];
      if (receipt.outcome !== source.outcome) fail('WAREHOUSE_RESULT_CONFLICT', '这场战斗已有不同的结算结果。');
      return {state, receipt};
    }
    if (!state.active || state.active.attemptId !== attemptId) fail('WAREHOUSE_ATTEMPT_MISMATCH', '这场战斗没有对应的仓库预留记录。');
    return this.finish(state, source.outcome);
  }

  abandon(): WarehouseSettlement | null {
    const state = this.load();
    return state.active ? this.finish(state, 'abandoned') : null;
  }

  private finish(state: WarehouseState, outcome: Receipt['outcome']): WarehouseSettlement {
    const active = state.active!;
    const isFirstClear = outcome === 'won' && !state.completedStages.includes(active.stageId);
    const grant: RewardGrant = outcome === 'won'
      ? createBattleRewards(active.difficulty, active.stageId, isFirstClear, this.random)
      : {rewards: emptySupplies(), baseRewardCount: 0, firstClearBonus: 0, rewardCount: 0};
    const returnedSupplies = emptySupplies();
    for (const id of SUPPLY_IDS) {
      returnedSupplies[id] = active.extraSupplies[id] - active.usedExtras[id];
      state.inventory[id] = integer(state.inventory[id] + returnedSupplies[id] + grant.rewards[id]);
    }
    const receipt: Receipt = {
      attemptId: active.attemptId, stageId: active.stageId, difficulty: active.difficulty, outcome, ...grant,
      returnedSupplies, consumedSupplies: {...active.usedExtras}, isFirstClear,
    };
    state.receipts[active.attemptId] = receipt;
    state.lastReceipt = receipt;
    if (isFirstClear) state.completedStages.push(active.stageId);
    state.active = null;
    return {state: this.save(state), receipt};
  }

  private save(state: WarehouseState): WarehouseState {
    // Validate first and write once: a failed write never publishes a partial reserve or receipt.
    const validated = validateState(state);
    const raw = JSON.stringify(validated);
    if (raw.length > MAX_STORAGE_LENGTH) fail('WAREHOUSE_CAPACITY', '本地试玩仓库资料已达上限，请保留资料后再处理。');
    try {this.storage.setItem(PREVIEW_WAREHOUSE_STORAGE_KEY, raw);}
    catch {return fail('WAREHOUSE_WRITE_FAILED', '本地仓库保存失败，本次操作未完成。请保留页面并重试。');}
    return validated;
  }
}
