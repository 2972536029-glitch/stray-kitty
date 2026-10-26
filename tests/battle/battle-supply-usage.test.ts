import test from 'node:test';
import assert from 'node:assert/strict';
import {act, createGame} from '../../web/src/modules/battle/l00/engine.ts';
import {getBattleSupplyUsage} from '../../web/src/modules/battle/l00/supplies.ts';
import {beginBattle} from './helpers.ts';

const extras = {'warm-can': 2, 'bouncy-treat': 1};
const zero = {usedExtras: {'warm-can': 0, 'bouncy-treat': 0}};

test('free supplies are used before warehouse extras, with independent item counts', () => {
  let state = beginBattle({extraSupplies: extras});
  for (let use = 1; use <= 4; use++) {
    const guard = state.cats.find(cat => cat.id === 'guard')!;
    guard.hp = 120; state.healingCooldown = 0;
    state = act(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
    assert.equal(state.lastAction?.ok, true);
    assert.equal(getBattleSupplyUsage(state).usedExtras['warm-can'], Math.max(0, use - 2));
    assert.equal(getBattleSupplyUsage(state).usedExtras['bouncy-treat'], 0);
  }
  for (let use = 1; use <= 2; use++) {
    const caster = state.cats.find(cat => cat.id === 'caster')!;
    caster.energy = 0; caster.energyItemCooldown = 0;
    state = act(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
    assert.equal(state.lastAction?.ok, true);
    assert.equal(getBattleSupplyUsage(state).usedExtras['bouncy-treat'], use - 1);
  }
  assert.deepEqual(getBattleSupplyUsage(state), {usedExtras: extras});
  const rejected = act(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
  assert.equal(rejected.lastAction?.ok, false);
  assert.deepEqual(getBattleSupplyUsage(rejected), getBattleSupplyUsage(state));
});

test('tutorial use and the ready state never charge warehouse extras', () => {
  const state = createGame({extraSupplies: extras});
  // The teaching restore is intentionally independent from its temporary supply count.
  state.inventory = {'warm-can': 0, 'bouncy-treat': 0};
  for (const phase of ['ready', 'teach_target', 'teach_energy_item', 'teach_caster_skill'] as const) {
    state.phase = phase;
    assert.deepEqual(getBattleSupplyUsage(state), zero);
  }
  assert.deepEqual(getBattleSupplyUsage(beginBattle({extraSupplies: extras})), zero);
});

test('checkpoint reform and full restart roll back the corresponding extra use instead of accumulating charges', () => {
  let state = beginBattle({extraSupplies: extras});
  state.inventory = {'warm-can': 0, 'bouncy-treat': 0};
  assert.deepEqual(getBattleSupplyUsage(state), {usedExtras: extras});
  state.phase = 'reform';
  state = act(state, {type: 'REFORM'});
  assert.equal(state.phase, 'battle');
  assert.deepEqual(getBattleSupplyUsage(state), zero);
  state.inventory = {'warm-can': 1, 'bouncy-treat': 0};
  assert.deepEqual(getBattleSupplyUsage(state), {usedExtras: {'warm-can': 1, 'bouncy-treat': 1}});
  state = act(state, {type: 'RESTART'});
  assert.deepEqual(getBattleSupplyUsage(state), zero);
  assert.deepEqual(state.initialInventory, {'warm-can': 4, 'bouncy-treat': 2});
});

test('terminal and abandoned battle accounting cannot turn remaining free supplies into warehouse credits', () => {
  for (const phase of ['battle', 'won', 'failed'] as const) {
    const state = beginBattle();
    state.phase = phase;
    for (const remaining of [0, 1, 2]) {
      state.inventory = {'warm-can': remaining, 'bouncy-treat': Math.min(remaining, 1)};
      assert.deepEqual(getBattleSupplyUsage(state), zero);
    }
  }
});
