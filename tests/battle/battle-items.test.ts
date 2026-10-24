import test from 'node:test';
import assert from 'node:assert/strict';
import {act, advanceGame, createGame, getDeployedCatCount, getItemTargetError} from '../../web/src/modules/battle/l00/engine.ts';
import {CONFIG, ENEMY_TYPES, WAVES} from '../../web/src/modules/battle/l00/config.ts';
import type {CombatAction, CombatCatState, CombatEnemy, CombatOptions, CombatState, PlaybackSpeed} from '../../web/src/modules/battle/l00/state.ts';
import {finishSkillTutorial, useTutorialEnergyItem} from './helpers.ts';

const cat = (state: CombatState, id: string) => state.cats.find(value => value.id === id)!;
const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function until(state: CombatState, predicate: (state: CombatState) => boolean): CombatState {
  for (let step = 0; step < 2400 && !predicate(state); step++) state = advanceGame(state, 0.05);
  assert.ok(predicate(state), `stalled at ${state.phase}`); return state;
}
function energyGate(options?: CombatOptions): CombatState {
  let state = until(act(createGame(options), {type: 'START'}), value => value.phase === 'teach_bag');
  for (const action of [
    {type: 'OPEN_BAG'}, {type: 'SELECT_ITEM', itemId: 'warm-can'}, {type: 'SELECT_TARGET', catId: 'caster'},
    {type: 'DEPLOY_CAT', catId: 'caster', x: 3, y: 0}, {type: 'MOVE_CAT', catId: 'guard', x: 4, y: 1},
  ] as CombatAction[]) state = act(state, action);
  assert.equal(state.phase, 'teach_energy'); return state;
}
const battle = (options?: CombatOptions) => finishSkillTutorial(energyGate(options));
const enemy = (id: string, extra: Partial<CombatEnemy> = {}): CombatEnemy => ({
  ...ENEMY_TYPES.scout, id, type: 'scout', hp: 1000, maxHp: 1000, x: 6.7, y: 0,
  speed: 0, cooldown: 100, blockedBy: null, ...extra,
});
function holdingBattle(options: CombatOptions = {extraSupplies: {'warm-can': 2, 'bouncy-treat': 1}}) {
  const state = battle(options); state.spawnIndex = WAVES[0].length; state.enemies = [enemy('hold-wave')];
  return state;
}
function assertRejectedWithoutMutation(state: CombatState, action: unknown): void {
  const before = structuredClone(state);
  const next = act(state, action);
  assert.equal(next.lastAction!.ok, false);
  const {lastAction: _feedback, sequence: _sequence, ...actual} = next;
  const {lastAction: _oldFeedback, sequence: _oldSequence, ...expected} = before;
  assert.deepEqual(actual, expected, 'rejection may only update action feedback');
  assert.deepEqual(state, before, 'input snapshot must remain untouched');
}

test('base and extra supplies are validated, copied and kept separate from the mutable inventory', () => {
  const base = {'warm-can': 2, 'bouncy-treat': 1};
  for (const extraSupplies of [undefined, {}, {'warm-can': 0}, {'bouncy-treat': 0}, {'warm-can': 0, 'bouncy-treat': 0}, Object.create(null)]) {
    const state = createGame({extraSupplies});
    assert.deepEqual(state.initialInventory, base); assert.deepEqual(state.inventory, base);
    assert.notEqual(state.initialInventory, state.inventory);
    state.inventory['warm-can'] = 0; assert.deepEqual(state.initialInventory, base);
  }
  const extraSupplies = {'warm-can': 2, 'bouncy-treat': 1};
  const state = createGame({extraSupplies}); extraSupplies['warm-can'] = 0;
  assert.deepEqual(state.initialInventory, {'warm-can': 4, 'bouncy-treat': 2});
  assert.deepEqual(state.inventory, state.initialInventory);
  assert.equal(state.healingCooldown, 0); assert.ok(state.cats.every(value => value.energyItemCooldown === 0));
  const inherited = Object.create({'warm-can': 1});
  for (const invalid of [null, [], [1], 1, true, '1', NaN, new Date(), inherited,
    {'warm-can': -1}, {'warm-can': 0.5}, {'warm-can': NaN}, {'warm-can': Infinity}, {'warm-can': '1'},
    {'warm-can': 3}, {'bouncy-treat': 2}, {'bouncy-treat': null}, {'bouncy-treat': undefined}, {unknown: 0}]) {
    assert.throws(() => createGame({extraSupplies: invalid} as CombatOptions), {code: 'INVALID_BATTLE_SUPPLIES'});
  }
});

test('healing applies to injured active, resting and ready combatants; partial recovery spends exactly one can', () => {
  for (const status of ['active', 'resting', 'ready'] as const) {
    const state = holdingBattle(); const guard = cat(state, 'guard');
    Object.assign(guard, {status, hp: status === 'resting' ? 60 : 220, cooldown: 0.7, energy: 40});
    if (status !== 'active') Object.assign(guard, {x: -2, y: 1});
    assert.equal(getItemTargetError(state, 'warm-can', 'guard'), null);
    const next = act(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
    assert.equal(next.lastAction!.ok, true); assert.equal(next.inventory['warm-can'], state.inventory['warm-can'] - 1);
    assert.equal(cat(next, 'guard').hp, status === 'resting' ? 120 : 240);
    assert.equal(cat(next, 'guard').status, status === 'resting' ? 'ready' : status);
    assert.equal(cat(next, 'guard').cooldown, 0.7); assert.equal(cat(next, 'guard').energy, 40);
    assert.equal(next.healingCooldown, 4); assert.deepEqual(next.initialInventory, state.initialInventory);
  }
});

test('energy treats add 30, cap at 100 and reject full or non-deployed targets without spending supplies', () => {
  for (const energy of [0, 70, 90, 99]) {
    const state = holdingBattle(); cat(state, 'caster').energy = energy;
    assert.equal(getItemTargetError(state, 'bouncy-treat', 'caster'), null);
    const next = act(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
    assert.equal(next.lastAction!.ok, true); assert.equal(cat(next, 'caster').energy, Math.min(100, energy + 30));
    assert.equal(next.inventory['bouncy-treat'], 1); assert.equal(cat(next, 'caster').energyItemCooldown, 12);
    assert.equal(cat(next, 'caster').hp, cat(state, 'caster').hp); assert.equal(next.healingCooldown, 0);
  }
  const full = holdingBattle(); cat(full, 'caster').energy = 100;
  assert.ok(getItemTargetError(full, 'bouncy-treat', 'caster'));
  assertRejectedWithoutMutation(full, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
  for (const change of [{status: 'resting', x: -2}, {status: 'ready', x: -2}, {x: -2}, {combatant: false}] as Partial<CombatCatState>[]) {
    const state = holdingBattle(); Object.assign(cat(state, 'caster'), {energy: 20}, change);
    assert.ok(getItemTargetError(state, 'bouncy-treat', 'caster'));
    assertRejectedWithoutMutation(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
  }
  for (const itemId of ['warm-can', 'bouncy-treat', 'unknown']) {
    for (const catId of ['hero', 'advisor', 'missing']) assertRejectedWithoutMutation(holdingBattle(), {type: 'USE_ITEM', itemId, catId});
  }
  const empty = holdingBattle(); empty.inventory['bouncy-treat'] = 0;
  assertRejectedWithoutMutation(empty, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
});

test('healing cooldown is shared across cats while energy cooldown belongs only to the recipient', () => {
  let state = holdingBattle(); cat(state, 'guard').hp = 100; cat(state, 'caster').hp = 40;
  state = act(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
  assert.equal(state.lastAction!.ok, true);
  assertRejectedWithoutMutation(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'caster'});
  state = act(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
  assert.equal(state.lastAction!.ok, true); assert.equal(cat(state, 'caster').energy, 30);
  assertRejectedWithoutMutation(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
  state = act(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'guard'});
  assert.equal(state.lastAction!.ok, true); assert.equal(cat(state, 'guard').energy, 30);
  assert.equal(state.inventory['bouncy-treat'], 0); assert.equal(state.inventory['warm-can'], 3);
});

for (const speed of [0.5, 1, 2] as PlaybackSpeed[]) test(`${speed}x advances item cooldowns by simulation time and unlocks exactly at their boundaries`, () => {
  let state = holdingBattle(); cat(state, 'guard').hp = 100;
  state = act(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
  state = act(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
  state = act(state, {type: 'SET_SPEED', speed});
  state = advanceGame(state, 3.95 / speed);
  closeTo(state.healingCooldown, 0.05); closeTo(cat(state, 'caster').energyItemCooldown, 8.05);
  assertRejectedWithoutMutation(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
  state = advanceGame(state, CONFIG.STEP / speed);
  closeTo(state.healingCooldown, 0);
  assert.equal(act(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'}).lastAction!.ok, true);
  state = advanceGame(state, 7.95 / speed);
  closeTo(cat(state, 'caster').energyItemCooldown, 0.05);
  assertRejectedWithoutMutation(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
  state = advanceGame(state, CONFIG.STEP / speed);
  closeTo(cat(state, 'caster').energyItemCooldown, 0);
  assert.equal(act(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'}).lastAction!.ok, true);
});

test('manual pause, external pause and bag freeze item cooldowns; aiming runs time but never permits item bypass', () => {
  let state = holdingBattle(); cat(state, 'guard').hp = 100;
  state = act(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
  state = act(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
  for (const paused of [act(state, {type: 'PAUSE'}), {...state, externallyPaused: true}, act(state, {type: 'OPEN_BAG'})]) {
    assert.equal(advanceGame(paused, 30), paused);
    assert.equal(paused.healingCooldown, 4); assert.equal(cat(paused, 'caster').energyItemCooldown, 12);
    assertRejectedWithoutMutation(paused, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
  }
  // Remove cooldown as a competing rejection reason: external pause and aim still gate both kinds of item.
  const ready = structuredClone(state); ready.healingCooldown = 0; cat(ready, 'guard').energyItemCooldown = 0;
  cat(ready, 'caster').energy = 100;
  for (const unavailable of [{...ready, externallyPaused: true}, act(ready, {type: 'SELECT_SKILL', catId: 'caster'})]) {
    for (const itemId of ['warm-can', 'bouncy-treat']) assertRejectedWithoutMutation(unavailable, {type: 'USE_ITEM', itemId, catId: 'guard'});
  }
  const paused = act(ready, {type: 'PAUSE'});
  const pausedHealing = act(paused, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
  assert.equal(pausedHealing.lastAction!.ok, true); assert.equal(pausedHealing.paused, true);
  assert.equal(pausedHealing.healingCooldown, 4); assert.equal(advanceGame(pausedHealing, 30), pausedHealing);
  const opened = act(paused, {type: 'OPEN_BAG'});
  const selected = act(opened, {type: 'SELECT_ITEM', itemId: 'bouncy-treat'});
  const pausedEnergy = act(selected, {type: 'SELECT_TARGET', catId: 'guard'});
  assert.equal(pausedEnergy.lastAction!.ok, true); assert.equal(pausedEnergy.bagOpen, false); assert.equal(pausedEnergy.paused, true);
  assert.equal(cat(pausedEnergy, 'guard').energyItemCooldown, 12); assert.equal(advanceGame(pausedEnergy, 30), pausedEnergy);
  cat(state, 'caster').energy = 100;
  const aiming = act(state, {type: 'SELECT_SKILL', catId: 'caster'});
  const advanced = advanceGame(aiming, 1);
  closeTo(advanced.healingCooldown, 3); closeTo(cat(advanced, 'caster').energyItemCooldown, 11);
  assert.ok(advanced.skillAim);
});

test('moving, swapping and resting preserve energy-item cooldown instead of resetting it', () => {
  let state = holdingBattle(); state = act(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
  state = act(state, {type: 'MOVE_CAT', catId: 'caster', x: 4, y: 1});
  assert.equal(state.lastAction!.ok, true); assert.equal(cat(state, 'caster').energyItemCooldown, 12);
  Object.assign(cat(state, 'caster'), {hp: 25, cooldown: 100});
  state.enemies = [enemy('retreat-hit', {x: 4.55, y: 1, damage: 10, cooldown: 0, blockedBy: 'caster'})];
  state = advanceGame(state, CONFIG.STEP);
  assert.equal(cat(state, 'caster').status, 'resting'); closeTo(cat(state, 'caster').energyItemCooldown, 11.95);
  state = advanceGame(state, 1); closeTo(cat(state, 'caster').energyItemCooldown, 10.95);
});

for (const mode of ['tutorial', 'standard'] as const) for (const difficulty of ['low', 'medium', 'high'] as const) {
  test(`${mode}/${difficulty}: real attacks reach 70, energy-item lesson cannot be skipped, and teaching restores combat supplies`, () => {
    let state = energyGate({mode, difficulty, extraSupplies: {'warm-can': 2, 'bouncy-treat': 1}});
    const initialInventory = structuredClone(state.initialInventory);
    const originalCounts = [state.spawned, state.defeated, state.escaped];
    const attacks = cat(state, 'caster').attacks;
    state = act(state, {type: 'BEGIN_SKILL_PRACTICE'});
    assert.equal(cat(state, 'caster').energy, 0);
    state = until(state, value => value.phase === 'teach_energy_item');
    assert.equal(cat(state, 'caster').energy, 70); assert.equal(cat(state, 'caster').attacks - attacks, 7);
    assert.equal(state.tutorialStep, 'teach_energy_item'); assert.equal(state.energyItemTaught, false);
    assert.equal(advanceGame(state, 30), state); assert.equal(state.enemies[0].training, true);
    for (const action of [
      {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'}, {type: 'SELECT_ITEM', itemId: 'bouncy-treat'},
      {type: 'SELECT_TARGET', catId: 'caster'}, {type: 'CAST_SKILL', catId: 'guard'},
      {type: 'MOVE_CAT', catId: 'guard', x: 5, y: 1}, {type: 'PAUSE'},
    ]) assertRejectedWithoutMutation(state, action);
    const opened = act(state, {type: 'OPEN_BAG'});
    assert.equal(opened.lastAction!.ok, true);
    assertRejectedWithoutMutation(opened, {type: 'SELECT_ITEM', itemId: 'warm-can'});
    const selected = act(opened, {type: 'SELECT_ITEM', itemId: 'bouncy-treat'});
    for (const catId of ['guard', 'hero', 'missing']) assertRejectedWithoutMutation(selected, {type: 'SELECT_TARGET', catId});
    state = useTutorialEnergyItem(state);
    assert.equal(state.energyItemTaught, true); assert.equal(cat(state, 'caster').energy, 100);
    assert.equal(state.inventory['bouncy-treat'], initialInventory['bouncy-treat'] - 1);
    assert.equal(cat(state, 'caster').energyItemCooldown, 12);
    state = until(state, value => value.phase !== 'skill_charge');
    assert.equal(state.phase, 'teach_guard_skill', 'the energy-item lesson must not loop');
    assert.equal(cat(state, 'guard').energy, 100);
    state = act(state, {type: 'CAST_SKILL', catId: 'guard'});
    state = act(state, {type: 'CAST_SKILL', catId: 'caster', x: 5, y: 1});
    assert.equal(state.phase, 'battle'); assert.equal(state.enemies.length, 0);
    assert.deepEqual([state.spawned, state.defeated, state.escaped], originalCounts);
    assert.deepEqual(state.inventory, initialInventory); assert.notEqual(state.inventory, state.initialInventory);
    assert.equal(state.healingCooldown, 0); assert.ok(state.cats.every(value => value.energyItemCooldown === 0));
    assert.deepEqual(state.waveCheckpoint!.inventory, initialInventory);
  });
}

test('reform restores the exact current-wave inventory repeatedly; restart restores this attempt loadout and repeats teaching', () => {
  let state = battle({extraSupplies: {'warm-can': 2, 'bouncy-treat': 1}});
  cat(state, 'guard').hp = 150;
  state = act(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
  assert.equal(state.lastAction!.ok, true);
  state = until(state, value => value.wave === 2);
  const checkpoint = structuredClone(state.waveCheckpoint!);
  assert.deepEqual(checkpoint.inventory, {'warm-can': 3, 'bouncy-treat': 2});
  assert.notEqual(state.inventory, state.waveCheckpoint!.inventory);
  for (let retry = 0; retry < 2; retry++) {
    cat(state, 'guard').hp = 150; cat(state, 'caster').energy = 0;
    state = act(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'}); assert.equal(state.lastAction!.ok, true);
    state = act(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'}); assert.equal(state.lastAction!.ok, true);
    assert.deepEqual(state.inventory, {'warm-can': 2, 'bouncy-treat': 1});
    state.spawnIndex = WAVES[1].length;
    state.enemies = ['a', 'b', 'c'].map(id => enemy(id, {x: 0.01, y: 1, speed: 1}));
    state = advanceGame(state, CONFIG.STEP); assert.equal(state.phase, 'reform');
    state = act(state, {type: 'REFORM'});
    assert.equal(state.phase, 'battle'); assert.equal(state.wave, 2); assert.equal(state.energyItemTaught, true);
    assert.deepEqual(state.inventory, checkpoint.inventory); assert.deepEqual(state.waveCheckpoint, checkpoint);
    assert.notEqual(state.inventory, state.waveCheckpoint!.inventory);
    assert.equal(state.healingCooldown, 0); assert.ok(state.cats.every(value => value.energyItemCooldown === 0));
  }
  const restarted = act(state, {type: 'RESTART'});
  assert.equal(restarted.phase, 'ready'); assert.equal(restarted.energyItemTaught, false);
  assert.deepEqual(restarted.inventory, {'warm-can': 4, 'bouncy-treat': 2});
  assert.deepEqual(restarted.initialInventory, restarted.inventory); assert.notEqual(restarted.initialInventory, restarted.inventory);
  assert.equal(restarted.healingCooldown, 0); assert.ok(restarted.cats.every(value => value.energyItemCooldown === 0));
});

test('six deployed fighters excludes hero and advisor, rejects a seventh, and still permits moving and swapping six', () => {
  let state = holdingBattle();
  const template = cat(state, 'guard');
  // Extra identities exercise the capacity rule only; the production roster still contains two fighters.
  for (const [index, x] of [0, 1, 2, 4].entries()) state.cats.push({...template, id: `fixture-${index}`, x, y: 2} as unknown as CombatCatState);
  state.cats.push({...template, id: 'reserve', status: 'ready', x: -2, y: 0} as unknown as CombatCatState);
  state.cats.push({...template, id: 'offboard', x: -2, y: 1} as unknown as CombatCatState);
  state.cats.push({...template, id: 'advisor-fixture', combatant: false, x: 2, y: 0} as unknown as CombatCatState);
  assert.equal(getDeployedCatCount(state), 6);
  assertRejectedWithoutMutation(state, {type: 'DEPLOY_CAT', catId: 'reserve', x: 5, y: 2});
  state = act(state, {type: 'MOVE_CAT', catId: 'guard', x: 3, y: 0});
  assert.equal(state.lastAction!.ok, true); assert.equal(getDeployedCatCount(state), 6);
  state = act(state, {type: 'MOVE_CAT', catId: 'guard', x: 5, y: 2});
  assert.equal(state.lastAction!.ok, true); assert.equal(getDeployedCatCount(state), 6);
  Object.assign(cat(state, 'fixture-0'), {status: 'resting', x: -2, y: 2});
  assert.equal(getDeployedCatCount(state), 5);
  state = act(state, {type: 'DEPLOY_CAT', catId: 'reserve', x: 0, y: 2});
  assert.equal(state.lastAction!.ok, true); assert.equal(getDeployedCatCount(state), 6);
  assert.equal(cat(state, 'reserve').status, 'active');
});
