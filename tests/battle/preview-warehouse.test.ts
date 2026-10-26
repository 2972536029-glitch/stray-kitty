import test from 'node:test';
import assert from 'node:assert/strict';
import {PreviewWarehouse, PREVIEW_WAREHOUSE_STORAGE_KEY} from './reference/warehouse.ts';
import type {WarehouseStorage, WarehouseState} from './reference/warehouse.ts';
import type {BattleContext, BattleDifficulty, BattleResult, BattleSupplyUsage, ExtraSupplies} from '../../web/src/modules/battle/l00/types.ts';

class MemoryStorage implements WarehouseStorage {
  value: string | null = null;
  writes = 0;
  failRead = false;
  failWrite = false;
  getItem(key: string): string | null {
    assert.equal(key, PREVIEW_WAREHOUSE_STORAGE_KEY);
    if (this.failRead) throw new Error('denied');
    return this.value;
  }
  setItem(key: string, value: string): void {
    assert.equal(key, PREVIEW_WAREHOUSE_STORAGE_KEY);
    if (this.failWrite) throw new Error('full');
    this.writes++;
    this.value = value;
  }
}
function context(id: string, difficulty: BattleDifficulty = 'medium', extraSupplies?: ExtraSupplies): BattleContext {
  return {
    difficulty, extraSupplies, attempt: {id, stageId: 'alley_rescue', status: 'active'},
    stage: {id: 'alley_rescue', name: '序章', status: 'active', lanes: 3, columns: 7, waves: 10}, catIds: [], modifiers: [],
  };
}
function fixture(random: () => number = () => 0) {
  const storage = new MemoryStorage();
  const warehouse = new PreviewWarehouse(storage, random);
  return {storage, warehouse};
}
function seed(warehouse: PreviewWarehouse) {
  warehouse.reserve(context('seed', 'low'));
  return warehouse.settle({attemptId: 'seed', outcome: 'won'}).state;
}
function withInventory(storage: MemoryStorage, warehouse: PreviewWarehouse, cans: number, treats: number) {
  const state = warehouse.load();
  state.inventory = {'warm-can': cans, 'bouncy-treat': treats};
  storage.value = JSON.stringify(state);
}
function usage(cans: number, treats: number): BattleSupplyUsage {return {usedExtras: {'warm-can': cans, 'bouncy-treat': treats}};}

test('empty local warehouse is read without writes and a no-extra victory stores only earned portions', () => {
  const {storage, warehouse} = fixture();
  assert.deepEqual(warehouse.load().inventory, {'warm-can': 0, 'bouncy-treat': 0});
  assert.equal(storage.writes, 0);
  warehouse.reserve(context('first', 'medium'));
  const {state, receipt} = warehouse.settle({attemptId: 'first', outcome: 'won'});
  assert.deepEqual(state.inventory, {'warm-can': 5, 'bouncy-treat': 0});
  assert.deepEqual(receipt.returnedSupplies, {'warm-can': 0, 'bouncy-treat': 0});
  assert.equal(receipt.baseRewardCount, 3);
  assert.equal(receipt.firstClearBonus, 2);
  assert.equal(state.active, null);
  assert.deepEqual(state.completedStages, ['alley_rescue']);
  assert.deepEqual(new PreviewWarehouse(storage).load(), state);
});

test('chapter first victory is once across difficulties and every subsequent new win earns its tier quantity', () => {
  const {warehouse} = fixture();
  for (const [index, selected] of (['low', 'high', 'medium'] as const).entries()) {
    const id = `attempt-${index}`;
    warehouse.reserve(context(id, selected));
    const {receipt} = warehouse.settle({attemptId: id, outcome: 'won'});
    assert.equal(receipt.rewardCount, [4, 4, 3][index]);
    assert.equal(receipt.firstClearBonus, index === 0 ? 2 : 0);
    assert.equal(receipt.isFirstClear, index === 0);
  }
  assert.equal(warehouse.load().inventory['warm-can'], 11);
});

test('reservation separates owned extras, refunds only unused extras, and consumption survives settlement', () => {
  const {storage, warehouse} = fixture();
  withInventory(storage, warehouse, 7, 3);
  const reserved = warehouse.reserve(context('supply-run', 'low', {'warm-can': 2, 'bouncy-treat': 1}));
  assert.deepEqual(reserved.inventory, {'warm-can': 5, 'bouncy-treat': 2});
  warehouse.recordSupplies('supply-run', usage(1, 1));
  const {state, receipt} = warehouse.settle({attemptId: 'supply-run', outcome: 'lost'});
  assert.deepEqual(receipt.consumedSupplies, {'warm-can': 1, 'bouncy-treat': 1});
  assert.deepEqual(receipt.returnedSupplies, {'warm-can': 1, 'bouncy-treat': 0});
  assert.deepEqual(state.inventory, {'warm-can': 6, 'bouncy-treat': 2});
  assert.equal(receipt.rewardCount, 0);
  assert.deepEqual(state.completedStages, []);
});

test('tutorial and free reform consumption may roll back without minting warehouse portions', () => {
  const {storage, warehouse} = fixture();
  withInventory(storage, warehouse, 2, 1);
  warehouse.reserve(context('reform', 'high', {'warm-can': 2, 'bouncy-treat': 1}));
  warehouse.recordSupplies('reform', usage(2, 1));
  warehouse.recordSupplies('reform', usage(1, 0));
  const result = warehouse.abandon()!;
  assert.deepEqual(result.receipt.consumedSupplies, {'warm-can': 1, 'bouncy-treat': 0});
  assert.deepEqual(result.state.inventory, {'warm-can': 1, 'bouncy-treat': 1});
  assert.equal(result.receipt.outcome, 'abandoned');
  assert.equal(result.receipt.rewardCount, 0);
  assert.equal(warehouse.abandon(), null);
});

test('reserve is idempotent only for identical active context and refuses concurrent or already settled attempts', () => {
  const {storage, warehouse} = fixture();
  seed(warehouse);
  const next = context('current', 'medium', {'warm-can': 2});
  const reserved = warehouse.reserve(next);
  const writes = storage.writes;
  assert.deepEqual(warehouse.reserve(next), reserved);
  assert.equal(storage.writes, writes);
  assert.throws(() => warehouse.reserve(context('another')), {code: 'WAREHOUSE_ATTEMPT_ACTIVE'});
  assert.throws(() => warehouse.reserve(context('current', 'high', {'warm-can': 2})), {code: 'WAREHOUSE_ATTEMPT_ACTIVE'});
  assert.throws(() => warehouse.reserve(context('current', 'medium', {'warm-can': 1})), {code: 'WAREHOUSE_ATTEMPT_ACTIVE'});
  assert.throws(() => warehouse.reserve(context('seed', 'low')), {code: 'BATTLE_ALREADY_SETTLED'});
  assert.equal(storage.writes, writes);
});

test('duplicate results return their exact saved random receipt without touching a newer active attempt', () => {
  let calls = 0;
  const {storage, warehouse} = fixture(() => {calls++; return calls % 2 ? 0 : 0.9;});
  warehouse.reserve(context('won', 'low'));
  const first = warehouse.settle({attemptId: 'won', outcome: 'won'});
  assert.equal(calls, 4);
  warehouse.reserve(context('new-active', 'high', {'warm-can': 1}));
  const before = storage.value;
  const repeated = warehouse.settle({attemptId: 'won', outcome: 'won'});
  assert.deepEqual(repeated.receipt, first.receipt);
  assert.equal(repeated.state.active?.attemptId, 'new-active');
  assert.equal(storage.value, before);
  assert.equal(calls, 4);
  assert.throws(() => warehouse.settle({attemptId: 'won', outcome: 'lost'}), {code: 'WAREHOUSE_RESULT_CONFLICT'});
  assert.equal(storage.value, before);
});

test('a failed win and an abandoned attempt do not claim first-clear bonus or invoke random draws', () => {
  const {warehouse} = fixture(() => {throw new Error('unexpected random draw');});
  warehouse.reserve(context('lost'));
  assert.equal(warehouse.settle({attemptId: 'lost', outcome: 'lost'}).receipt.rewardCount, 0);
  warehouse.reserve(context('abandoned'));
  assert.equal(warehouse.abandon()!.receipt.rewardCount, 0);
  assert.deepEqual(warehouse.load().completedStages, []);
  assert.throws(() => warehouse.settle({attemptId: 'abandoned', outcome: 'won'}), {code: 'WAREHOUSE_RESULT_CONFLICT'});
});

test('read and write failures are explicit and unsuccessful reserves do not change persisted or subsequently loaded state', () => {
  const {storage, warehouse} = fixture();
  seed(warehouse);
  const before = storage.value;
  storage.failRead = true;
  assert.throws(() => warehouse.load(), {code: 'WAREHOUSE_READ_FAILED'});
  assert.throws(() => warehouse.reserve(context('read-error')), {code: 'WAREHOUSE_READ_FAILED'});
  storage.failRead = false;
  storage.failWrite = true;
  assert.throws(() => warehouse.reserve(context('write-error', 'low', {'warm-can': 1})), {code: 'WAREHOUSE_WRITE_FAILED'});
  assert.equal(storage.value, before);
  assert.equal(warehouse.load().active, null);
  storage.failWrite = false;
  assert.equal(warehouse.reserve(context('write-error', 'low', {'warm-can': 1})).inventory['warm-can'], 3);
});

test('failed usage recording and failed settlement publish neither consumption nor receipt and remain retryable', () => {
  const {storage, warehouse} = fixture();
  seed(warehouse);
  warehouse.reserve(context('retry', 'high', {'warm-can': 2}));
  const reserved = storage.value;
  storage.failWrite = true;
  assert.throws(() => warehouse.recordSupplies('retry', usage(1, 0)), {code: 'WAREHOUSE_WRITE_FAILED'});
  assert.equal(storage.value, reserved);
  assert.equal(warehouse.load().active?.usedExtras['warm-can'], 0);
  storage.failWrite = false;
  warehouse.recordSupplies('retry', usage(1, 0));
  const consumed = storage.value;
  storage.failWrite = true;
  assert.throws(() => warehouse.settle({attemptId: 'retry', outcome: 'won'}), {code: 'WAREHOUSE_WRITE_FAILED'});
  assert.equal(storage.value, consumed);
  assert.equal(warehouse.load().active?.attemptId, 'retry');
  assert.equal(Object.hasOwn(warehouse.load().receipts, 'retry'), false);
  storage.failWrite = false;
  const {state} = warehouse.settle({attemptId: 'retry', outcome: 'won'});
  assert.equal(state.inventory['warm-can'], 7);
});

test('instances reload storage per transaction so sequential cross-tab operations see one another', () => {
  const {storage, warehouse} = fixture();
  const second = new PreviewWarehouse(storage, () => 0.9);
  warehouse.reserve(context('shared', 'low'));
  assert.equal(second.load().active?.attemptId, 'shared');
  assert.throws(() => second.reserve(context('collision')), {code: 'WAREHOUSE_ATTEMPT_ACTIVE'});
  second.settle({attemptId: 'shared', outcome: 'won'});
  assert.equal(warehouse.load().inventory['bouncy-treat'], 4);
  assert.deepEqual(warehouse.settle({attemptId: 'shared', outcome: 'won'}).receipt.rewards, {'warm-can': 0, 'bouncy-treat': 4});
});

test('malformed storage is never reset or overwritten and inconsistent receipt/first-clear data is rejected', () => {
  const {storage, warehouse} = fixture();
  seed(warehouse);
  const good = storage.value!;
  const mutations: Array<(state: WarehouseState) => void> = [
    state => {state.version = 2 as 1;},
    state => {state.inventory['warm-can'] = -1;},
    state => {state.inventory['bouncy-treat'] = 1.5;},
    state => {state.inventory['warm-can'] = Number.MAX_SAFE_INTEGER;},
    state => {state.completedStages = [];},
    state => {state.completedStages.push('alley_rescue');},
    state => {state.lastReceipt = null;},
    state => {state.receipts.seed.rewards['warm-can']++;},
    state => {state.receipts.seed.firstClearBonus = 0;},
    state => {state.receipts.seed.attemptId = 'other';},
    state => {state.active = {attemptId: 'seed', stageId: 'alley_rescue', difficulty: 'low', extraSupplies: {'warm-can': 0, 'bouncy-treat': 0}, usedExtras: {'warm-can': 0, 'bouncy-treat': 0}};},
  ];
  const invalid = ['not-json', 'null', '[]', '{}', ...mutations.map(mutate => {
    const state = JSON.parse(good) as WarehouseState; mutate(state); return JSON.stringify(state);
  })];
  for (const raw of invalid) {
    storage.value = raw;
    const writes = storage.writes;
    assert.throws(() => warehouse.load(), {code: 'INVALID_WAREHOUSE_DATA'});
    assert.throws(() => warehouse.reserve(context('blocked')), {code: 'INVALID_WAREHOUSE_DATA'});
    assert.equal(storage.value, raw);
    assert.equal(storage.writes, writes);
  }
});

test('illegal requests cannot over-reserve, change battle identity or use unknown items', () => {
  const {storage, warehouse} = fixture();
  const requests = [
    context('owned', 'low', {'warm-can': 1}),
    context('negative', 'low', {'warm-can': -1}),
    context('fraction', 'low', {'bouncy-treat': 0.5}),
    context('too-many', 'low', {'warm-can': 3}),
    context('unknown', 'low', {'future-item': 1} as ExtraSupplies),
    context('bad-extra', 'low', null as unknown as ExtraSupplies),
    context('invalid-difficulty', 'hard' as BattleDifficulty),
    {...context('mismatched'), stage: {...context('mismatched').stage, id: 'different'}},
    {...context('finished'), attempt: {...context('finished').attempt, status: 'won' as const}},
    context('__proto__'),
  ];
  for (const request of requests) assert.throws(() => warehouse.reserve(request));
  assert.equal(storage.writes, 0);
  assert.equal(storage.value, null);
});

test('only the implemented L00 layout can reserve supplies and rejected future stages do not change inventory', () => {
  const {storage, warehouse} = fixture();
  seed(warehouse);
  const before = storage.value;
  const writes = storage.writes;
  const future = context('future', 'medium', {'warm-can': 2});
  future.attempt.stageId = 'chapter-one';
  future.stage.id = 'chapter-one';
  const wrongLanes = context('lanes'); wrongLanes.stage.lanes = 4;
  const wrongColumns = context('columns'); wrongColumns.stage.columns = 8;
  const oldWaves = context('old-waves'); oldWaves.stage.waves = 2;
  for (const invalid of [future, wrongLanes, wrongColumns, oldWaves]) {
    assert.throws(() => warehouse.reserve(invalid), {code: 'UNSUPPORTED_PREVIEW_STAGE'});
    assert.equal(storage.value, before);
    assert.equal(storage.writes, writes);
    assert.equal(warehouse.load().active, null);
  }
});

test('usage updates require the active attempt, known exact fields and bounded integer reserved quantities', () => {
  const {storage, warehouse} = fixture();
  withInventory(storage, warehouse, 2, 1);
  warehouse.reserve(context('usage', 'medium', {'warm-can': 2, 'bouncy-treat': 1}));
  const before = storage.value;
  for (const invalid of [usage(-1, 0), usage(0, 2), usage(3, 0), usage(NaN, 0), usage(0.5, 0), {usedExtras: {'warm-can': 1}}, {usedExtras: {'warm-can': 0, 'bouncy-treat': 0, soup: 1}}, null]) {
    assert.throws(() => warehouse.recordSupplies('usage', invalid as BattleSupplyUsage));
  }
  assert.throws(() => warehouse.recordSupplies('other', usage(0, 0)), {code: 'WAREHOUSE_ATTEMPT_MISMATCH'});
  assert.equal(storage.value, before);
  for (const invalid of [{attemptId: 'usage', outcome: 'abandoned'}, {attemptId: 'other', outcome: 'won'}, {attemptId: 'usage', outcome: 'won', extra: true}, null]) {
    assert.throws(() => warehouse.settle(invalid as BattleResult));
  }
  assert.equal(storage.value, before);
});

test('prototype-shaped attempt keys cannot alias or pollute a receipt dictionary', () => {
  const {warehouse} = fixture();
  for (const id of ['constructor', 'toString', 'hasOwnProperty']) {
    warehouse.reserve(context(id, 'low'));
    const settlement = warehouse.settle({attemptId: id, outcome: 'won'});
    assert.equal(settlement.receipt.attemptId, id);
    assert.equal(Object.hasOwn(warehouse.load().receipts, id), true);
    assert.deepEqual(warehouse.settle({attemptId: id, outcome: 'won'}).receipt, settlement.receipt);
  }
  assert.equal(Object.getPrototypeOf(warehouse.load().receipts), null);
  assert.equal(Object.hasOwn(Object.prototype, 'rewards'), false);
});

test('returned objects are detached from durable state and settlement never replaces older inventory', () => {
  const {storage, warehouse} = fixture();
  withInventory(storage, warehouse, 20, 12);
  warehouse.reserve(context('append', 'low'));
  const settlement = warehouse.settle({attemptId: 'append', outcome: 'won'});
  assert.deepEqual(settlement.state.inventory, {'warm-can': 24, 'bouncy-treat': 12});
  settlement.state.inventory['warm-can'] = 999;
  settlement.receipt.rewards['warm-can'] = 999;
  assert.deepEqual(warehouse.load().inventory, {'warm-can': 24, 'bouncy-treat': 12});
  assert.equal(warehouse.load().receipts.append.rewards['warm-can'], 4);
});
