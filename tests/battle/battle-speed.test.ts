import test from 'node:test';
import assert from 'node:assert/strict';
import {act, advanceGame, createGame, getBattleSpeed} from '../../web/src/modules/battle/l00/engine.ts';
import {CONFIG, ENEMY_TYPES, WAVES} from '../../web/src/modules/battle/l00/config.ts';
import type {CombatAction, CombatEnemy, CombatState, PlaybackSpeed} from '../../web/src/modules/battle/l00/state.ts';
import {finishSkillTutorial, useTutorialEnergyItem} from './helpers.ts';

const cat = (state: CombatState, id: string) => state.cats.find(value => value.id === id)!;
const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function until(state: CombatState, phase: CombatState['phase']) {
  for (let step = 0; step < 3000 && state.phase !== phase; step++) state = advanceGame(state, 0.1);
  assert.equal(state.phase, phase); return state;
}
function energyGate() {
  let state = until(act(createGame(), {type: 'START'}), 'teach_bag');
  for (const action of [
    {type: 'OPEN_BAG'}, {type: 'SELECT_ITEM', itemId: 'warm-can'}, {type: 'SELECT_TARGET', catId: 'caster'},
    {type: 'DEPLOY_CAT', catId: 'caster', x: 3, y: 0}, {type: 'MOVE_CAT', catId: 'guard', x: 4, y: 1},
  ] as CombatAction[]) state = act(state, action);
  assert.equal(state.phase, 'teach_energy'); return state;
}
const battle = () => finishSkillTutorial(energyGate());
const enemy = (extra: Partial<CombatEnemy> = {}): CombatEnemy => ({...ENEMY_TYPES.scout, id: 'timing-target', type: 'scout', hp: 1000, maxHp: 1000, x: 6.7, y: 1, cooldown: 100, blockedBy: null, ...extra});
function holdingBattle() {
  const state = battle(); state.spawnIndex = WAVES[0].length;
  state.enemies = [enemy({speed: 0})]; return state;
}
function mechanics(state: CombatState) {
  return {time: state.time, accumulator: state.accumulator, phase: state.phase, phaseTime: state.phaseTime,
    cats: state.cats, enemies: state.enemies, wave: state.wave, waveTime: state.waveTime, spawnIndex: state.spawnIndex,
    nextWaveIn: state.nextWaveIn, defeated: state.defeated, escaped: state.escaped, spawned: state.spawned,
    projectiles: state.projectiles, effects: state.effects, inventory: state.inventory};
}

for (const speed of [0.5, 1, 2] as PlaybackSpeed[]) test(`${speed}x scales wall time once for attacks, movement, shields and wave progression`, () => {
  const initial = battle();
  const actual = advanceGame(act(initial, {type: 'SET_SPEED', speed}), 6);
  const expected = advanceGame(act(initial, {type: 'SET_SPEED', speed: 1}), 6 * speed);
  assert.deepEqual(mechanics(actual), mechanics(expected));
  closeTo(actual.time - initial.time, 6 * speed);
  closeTo(cat(actual, 'guard').shieldRemaining, Math.max(0, 8 - 6 * speed));
  assert.ok(actual.spawned > initial.spawned);
  assert.ok(actual.cats.some(value => value.attacks > cat(initial, value.id).attacks));
  if (speed === 2) assert.equal(actual.wave, 2);
});

test('raw dt is clamped before scaling and fractional simulation steps survive speed changes', () => {
  for (const speed of [0.5, 2] as PlaybackSpeed[]) {
    const initial = act(holdingBattle(), {type: 'SET_SPEED', speed});
    const next = advanceGame(initial, 100);
    closeTo(next.time - initial.time, CONFIG.MAX_FRAME_SECONDS * speed);
    closeTo(next.waveTime - initial.waveTime, CONFIG.MAX_FRAME_SECONDS * speed);
  }
  const initial = act(holdingBattle(), {type: 'SET_SPEED', speed: 0.5});
  const partial = advanceGame(initial, 0.05);
  assert.equal(partial.time, initial.time); closeTo(partial.accumulator, 0.025);
  const next = advanceGame(act(partial, {type: 'SET_SPEED', speed: 2}), 0.0125);
  closeTo(next.time - initial.time, 0.05); closeTo(next.accumulator, 0);
});

test('inspection uses half speed, aiming uses normal speed, and ending either restores the chosen baseline', () => {
  let state = act(battle(), {type: 'SET_SPEED', speed: 2});
  cat(state, 'caster').energy = 100;
  state = act(state, {type: 'INSPECT_CAT', catId: 'caster'});
  assert.equal(state.inspectedCatId, 'caster'); assert.equal(getBattleSpeed(state), 0.5);
  const inspected = advanceGame(state, 1); closeTo(inspected.time - state.time, 0.5);
  const closed = act(inspected, {type: 'CLOSE_INSPECTION'});
  assert.equal(closed.lastAction, inspected.lastAction); assert.equal(closed.sequence, inspected.sequence);
  assert.equal(act(closed, {type: 'CLOSE_INSPECTION'}), closed); assert.equal(getBattleSpeed(closed), 2);
  state = act(inspected, {type: 'SELECT_SKILL', catId: 'caster'});
  assert.equal(state.inspectedCatId, null); assert.equal(getBattleSpeed(state), 1);
  const aiming = advanceGame(state, 0.5); closeTo(aiming.time - state.time, 0.5);
  assert.ok(aiming.enemies[0].x < state.enemies[0].x, 'aiming must not stop incoming enemies');
  assert.ok(cat(aiming, 'guard').shieldRemaining < cat(state, 'guard').shieldRemaining);
  const changed = act(aiming, {type: 'SET_SPEED', speed: 0.5});
  assert.equal(changed.lastAction!.ok, true); assert.equal(getBattleSpeed(changed), 1);
  const cancelled = act(changed, {type: 'CANCEL_SKILL'});
  assert.equal(getBattleSpeed(cancelled), 0.5); assert.equal(cat(cancelled, 'caster').energy, 100);
  const cast = act(aiming, {type: 'CAST_SKILL', catId: 'caster', x: 0, y: 0});
  assert.equal(cast.lastAction!.ok, true); assert.equal(getBattleSpeed(cast), 2);
  assert.equal(cast.skillAim, null); assert.equal(cast.inspectedCatId, null);
  const guard = act(closed, {type: 'INSPECT_CAT', catId: 'guard'}); cat(guard, 'guard').energy = 100;
  const shield = act(guard, {type: 'CAST_SKILL', catId: 'guard'});
  assert.equal(shield.lastAction!.ok, true); assert.equal(shield.inspectedCatId, null); assert.equal(getBattleSpeed(shield), 2);
});

test('manual pause has priority over inspection, aiming and speed changes and survives cancellation', () => {
  let state = act(battle(), {type: 'SET_SPEED', speed: 2}); cat(state, 'caster').energy = 100;
  state = act(act(state, {type: 'INSPECT_CAT', catId: 'caster'}), {type: 'PAUSE'});
  assert.equal(getBattleSpeed(state), 0); assert.equal(advanceGame(state, 10), state);
  state = act(state, {type: 'SET_SPEED', speed: 0.5}); assert.equal(state.paused, true);
  assert.equal(act(state, {type: 'SELECT_SKILL', catId: 'caster'}).lastAction!.ok, false);
  state = act(state, {type: 'PAUSE'}); state = act(state, {type: 'SELECT_SKILL', catId: 'caster'});
  state = act(state, {type: 'PAUSE'}); assert.equal(state.lastAction!.ok, true); assert.ok(state.skillAim);
  state = act(state, {type: 'SET_SPEED', speed: 2}); assert.equal(getBattleSpeed(state), 0);
  const rejected = act(state, {type: 'CAST_SKILL', catId: 'caster', x: 0, y: 0});
  assert.equal(rejected.lastAction!.ok, false); assert.equal(cat(rejected, 'caster').energy, 100);
  state = act(rejected, {type: 'CANCEL_SKILL'});
  assert.equal(state.paused, true); assert.equal(state.skillAim, null); assert.equal(getBattleSpeed(state), 0);
  state = act(state, {type: 'PAUSE'}); assert.equal(getBattleSpeed(state), 2);
  state = act(state, {type: 'INSPECT_CAT', catId: 'caster'});
  const bag = act(state, {type: 'OPEN_BAG'}); assert.equal(getBattleSpeed(bag), 0); assert.equal(advanceGame(bag, 10), bag);
  const external = {...state, externallyPaused: true};
  for (const action of [{type: 'SET_SPEED', speed: 1}, {type: 'INSPECT_CAT', catId: 'guard'}, {type: 'CLOSE_INSPECTION'}, {type: 'PAUSE'}]) {
    const next = act(external, action); assert.equal(next.lastAction!.ok, false);
    assert.equal(next.inspectedCatId, external.inspectedCatId); assert.equal(next.playbackSpeed, external.playbackSpeed);
  }
  assert.equal(getBattleSpeed(external), 0); assert.equal(advanceGame(external, 10), external);
});

test('speed and inspection reject invalid runtime parameters without changing gameplay state', () => {
  const state = battle();
  assert.equal(state.playbackSpeed, 1); assert.equal(state.inspectedCatId, null);
  for (const speed of [undefined, null, '2', 0, -1, 0.75, 3, NaN, Infinity]) {
    const rejected = act(state, {type: 'SET_SPEED', speed});
    assert.equal(rejected.lastAction!.ok, false); assert.equal(rejected.playbackSpeed, 1);
    assert.deepEqual(mechanics(rejected), mechanics(state));
  }
  for (const catId of ['hero', 'missing', null, 3]) assert.equal(act(state, {type: 'INSPECT_CAT', catId}).lastAction!.ok, false);
  for (const status of ['resting', 'ready'] as const) {
    const unavailable = structuredClone(state); cat(unavailable, 'caster').status = status;
    assert.equal(act(unavailable, {type: 'INSPECT_CAT', catId: 'caster'}).lastAction!.ok, false);
    assert.equal(getBattleSpeed({...unavailable, inspectedCatId: 'caster'}), 1);
  }
  const offboard = structuredClone(state); cat(offboard, 'caster').x = -2;
  assert.equal(act(offboard, {type: 'INSPECT_CAT', catId: 'caster'}).lastAction!.ok, false);
  for (const phase of ['won', 'failed'] as const) for (const action of [{type: 'SET_SPEED', speed: 2}, {type: 'INSPECT_CAT', catId: 'caster'}]) {
    assert.equal(act({...state, phase}, action).lastAction!.ok, false);
  }
});

for (const interaction of ['inspection', 'aim'] as const) test(`${interaction} is cleared if its cat retreats while combat keeps running`, () => {
  let state = act(holdingBattle(), {type: 'SET_SPEED', speed: 2});
  Object.assign(cat(state, 'caster'), {x: 4, y: 1, hp: 30, energy: 100});
  Object.assign(cat(state, 'guard'), {x: 0, y: 2});
  state.enemies = [enemy({x: 4.55, blockedBy: 'caster', cooldown: 0, damage: 15})];
  state = act(state, {type: interaction === 'aim' ? 'SELECT_SKILL' : 'INSPECT_CAT', catId: 'caster'});
  state = advanceGame(state, 0.1);
  assert.equal(cat(state, 'caster').status, 'resting'); assert.equal(cat(state, 'caster').energy, 100);
  assert.equal(state.inspectedCatId, null); assert.equal(state.skillAim, null); assert.equal(getBattleSpeed(state), 2);
  assert.equal(act(state, {type: 'MOVE_CAT', catId: 'guard', x: 1, y: 2}).lastAction!.ok, true);
});

for (const interaction of ['inspection', 'aim'] as const) test(`${interaction} cannot survive a win, loss or reform phase transition`, () => {
  for (const terminal of ['won', 'failed', 'reform'] as const) {
    let state = act(holdingBattle(), {type: 'SET_SPEED', speed: 2}); cat(state, 'caster').energy = 100;
    if (terminal === 'won') {
      state.wave = CONFIG.TOTAL_WAVES; state.spawnIndex = WAVES.at(-1)!.length; state.enemies = [enemy({hp: 1, x: 5})];
      cat(state, 'caster').cooldown = 0;
    } else {
      state.mode = terminal === 'failed' ? 'standard' : 'tutorial'; state.leaks = 2;
      state.enemies = [enemy({x: 0.01, speed: 1})];
    }
    state = act(state, {type: interaction === 'aim' ? 'SELECT_SKILL' : 'INSPECT_CAT', catId: 'caster'});
    state = advanceGame(state, 0.1);
    assert.equal(state.phase, terminal); assert.equal(state.inspectedCatId, null); assert.equal(state.skillAim, null);
    assert.equal(getBattleSpeed(state), 0); assert.equal(state.playbackSpeed, 2);
    if (terminal === 'reform') {
      const reformed = act(state, {type: 'REFORM'});
      assert.equal(reformed.lastAction!.ok, true); assert.equal(getBattleSpeed(reformed), 2);
    }
  }
});

test('speed controls cannot bypass teaching gates while charge practice supports slowdown and manual pause', () => {
  const ready = act(createGame(), {type: 'SET_SPEED', speed: 2});
  assert.equal(ready.playbackSpeed, 2); assert.equal(getBattleSpeed(ready), 0);
  assert.equal(getBattleSpeed(act(ready, {type: 'START'})), 2);
  let state = act(energyGate(), {type: 'SET_SPEED', speed: 2});
  state = act(state, {type: 'INSPECT_CAT', catId: 'caster'});
  assert.equal(getBattleSpeed(state), 0); assert.equal(advanceGame(state, 30), state);
  assert.equal(act(state, {type: 'PAUSE'}).lastAction!.ok, false);
  state = act(state, {type: 'BEGIN_SKILL_PRACTICE'});
  assert.equal(state.inspectedCatId, null); assert.equal(getBattleSpeed(state), 2);
  state = act(state, {type: 'INSPECT_CAT', catId: 'guard'}); assert.equal(getBattleSpeed(state), 0.5);
  const slowed = advanceGame(state, 0.2); closeTo(slowed.time - state.time, 0.1); state = slowed;
  state = act(state, {type: 'PAUSE'}); state = act(state, {type: 'SET_SPEED', speed: 1});
  assert.equal(getBattleSpeed(state), 0); assert.equal(advanceGame(state, 20), state);
  state = until(act(state, {type: 'PAUSE'}), 'teach_energy_item');
  assert.equal(getBattleSpeed(state), 0); assert.equal(advanceGame(state, 20), state);
  state = until(useTutorialEnergyItem(state), 'teach_guard_skill');
  assert.equal(state.inspectedCatId, null); assert.equal(getBattleSpeed(state), 0);
  state = act(state, {type: 'INSPECT_CAT', catId: 'guard'}); state = act(state, {type: 'CAST_SKILL', catId: 'guard'});
  assert.equal(state.phase, 'teach_caster_skill'); assert.equal(state.inspectedCatId, null);
  state = act(state, {type: 'SELECT_SKILL', catId: 'caster'});
  assert.equal(getBattleSpeed(state), 0); assert.equal(advanceGame(state, 20), state);
  state = act(state, {type: 'CAST_SKILL', catId: 'caster', x: 5, y: 1});
  assert.equal(state.phase, 'battle'); assert.equal(getBattleSpeed(state), 1);
  assert.equal(state.skillAim, null); assert.equal(state.inspectedCatId, null);
  assert.equal(cat(state, 'guard').shieldRemaining, 8);
});
