import test from 'node:test';
import assert from 'node:assert/strict';
import {act, advanceGame, createGame} from '../../web/src/modules/battle/l00/engine.ts';
import {CONFIG, ENEMY_TYPES, SKILLS} from '../../web/src/modules/battle/l00/config.ts';
import {getAttackCells, getSkillCells, getSkillDefinitionCells, getSkillTargetCells, isEnemyInCells, isSkillTargetAllowed} from '../../web/src/modules/battle/l00/ranges.ts';
import type {CombatAction, CombatCatState, CombatEnemy, CombatOptions, CombatState} from '../../web/src/modules/battle/l00/state.ts';
import {finishSkillTutorial, useTutorialEnergyItem} from './helpers.ts';

const cat = (state: CombatState, id: string): CombatCatState => state.cats.find(value => value.id === id)!;
function until(state: CombatState, predicate: (state: CombatState) => boolean): CombatState {
  for (let index = 0; index < 2400 && !predicate(state); index++) state = advanceGame(state, 0.1);
  assert.ok(predicate(state), `stalled in ${state.phase}`); return state;
}
function energyGate(options?: CombatOptions): CombatState {
  let state = until(act(createGame(options), {type: 'START'}), value => value.phase === 'teach_bag');
  for (const action of [
    {type: 'OPEN_BAG'}, {type: 'SELECT_ITEM', itemId: 'warm-can'}, {type: 'SELECT_TARGET', catId: 'caster'},
    {type: 'DEPLOY_CAT', catId: 'caster', x: 3, y: 0}, {type: 'MOVE_CAT', catId: 'guard', x: 4, y: 1},
  ] as CombatAction[]) state = act(state, action);
  assert.equal(state.phase, 'teach_energy'); return state;
}
function battle(): CombatState {return finishSkillTutorial(energyGate());}
function enemy(id: string, x: number, y: number, extra: Partial<CombatEnemy> = {}): CombatEnemy {
  return {...ENEMY_TYPES.scout, id, type: 'scout', x, y, hp: 1000, maxHp: 1000, speed: 0, cooldown: 100, blockedBy: null, ...extra};
}
function isolated(): CombatState {
  const state = battle(); state.spawnIndex = 2; state.waveTime = 8;
  state.enemies = [enemy('hold-wave', 6.7, 0)];
  for (const value of state.cats) {value.energy = 0; value.shield = 0; value.shieldRemaining = 0; value.cooldown = 100;}
  return state;
}
const keys = (cells: {x: number; y: number}[]) => cells.map(cell => `${cell.x},${cell.y}`).sort();

test('attack cells face right: guard has four cells and caster has a 4 by 3 rectangle', () => {
  const state = isolated(); const guard = cat(state, 'guard'); const caster = cat(state, 'caster');
  Object.assign(guard, {x: 3, y: 1}); Object.assign(caster, {x: 2, y: 1});
  assert.deepEqual(keys(getAttackCells(guard)), ['3,0', '3,1', '3,2', '4,1']);
  assert.deepEqual(keys(getAttackCells(caster)), Array.from({length: 12}, (_, i) => `${2 + Math.floor(i / 3)},${i % 3}`).sort());
  assert.deepEqual(getAttackCells(cat(state, 'hero')), []);
  caster.status = 'resting'; assert.deepEqual(getAttackCells(caster), []);
});

test('right and top edges clip the original shapes without shifting them inward', () => {
  const state = isolated(); const caster = cat(state, 'caster'); const guard = cat(state, 'guard');
  Object.assign(caster, {x: 5, y: 0}); Object.assign(guard, {x: 5, y: 0});
  assert.deepEqual(keys(getAttackCells(caster)), ['5,0', '5,1', '6,0', '6,1']);
  assert.deepEqual(keys(getAttackCells(guard)), ['5,0', '5,1', '6,0']);
  assert.equal(isSkillTargetAllowed(caster, {x: 4, y: 0}), true);
  assert.equal(isSkillTargetAllowed(caster, {x: 6, y: 0}), true);
  assert.deepEqual(keys(getSkillCells(caster, {x: 6, y: 0})), ['5,0', '6,0', '6,1']);
  assert.deepEqual(keys(getSkillCells(guard)), ['5,0']);
  assert.deepEqual(getSkillDefinitionCells(guard, SKILLS.guard, {x: 0, y: 2}), [{x: 5, y: 0}]);
  assert.deepEqual(getSkillTargetCells(guard), []);
  assert.deepEqual(getSkillCells(cat(state, 'hero')), []);
  assert.deepEqual(getSkillDefinitionCells(guard, {name: 'future', targeting: 'forward', cost: 100, offsets: [{x: 1, y: 0}, {x: 2, y: 0}]}), [{x: 6, y: 0}]);
  Object.assign(guard, {x: 3, y: 1});
  assert.deepEqual(keys(getSkillDefinitionCells(guard, {name: 'future', targeting: 'forward', cost: 100, offsets: [{x: 1, y: 0}, {x: 2, y: 0}]})), ['4,1', '5,1']);
  assert.deepEqual(keys(getSkillDefinitionCells(guard, {name: 'future', targeting: 'forward', cost: 100, offsets: [{x: 1, y: 0}, {x: 2, y: 0}]}, {x: 0, y: 2})), ['4,1', '5,1']);
});

test('area skill centres cover all 21 cells from different cat positions and damage only the clipped cross', () => {
  const board = Array.from({length: 21}, (_, index) => ({x: index % 7, y: Math.floor(index / 7)}));
  for (const origin of [{x: 0, y: 0}, {x: 3, y: 0}, {x: 6, y: 0}, {x: 2, y: 1}, {x: 6, y: 2}]) {
    const state = isolated(); Object.assign(cat(state, 'caster'), {...origin, energy: 100});
    state.enemies = board.map((point, index) => enemy(`cell-${index}`, point.x, point.y, {hp: 100}));
    assert.deepEqual(getSkillTargetCells(cat(state, 'caster')), board);
    const aiming = act(state, {type: 'SELECT_SKILL', catId: 'caster'});
    assert.equal(aiming.lastAction!.ok, true);
    for (const target of board) {
      assert.equal(isSkillTargetAllowed(cat(state, 'caster'), target), true);
      const expected = board.filter(point => Math.abs(point.x - target.x) + Math.abs(point.y - target.y) <= 1);
      assert.deepEqual(keys(getSkillCells(cat(state, 'caster'), target)), keys(expected));
      const selected = act(aiming, {type: 'AIM_SKILL', ...target});
      assert.equal(selected.lastAction!.ok, true); assert.deepEqual(selected.skillAim?.target, target);
      const next = act(selected, {type: 'CAST_SKILL', catId: 'caster'});
      assert.equal(next.lastAction!.ok, true); assert.equal(next.skillAim, null);
      assert.equal(cat(next, 'caster').energy, 0); assert.equal(next.defeated, state.defeated);
      for (const value of next.enemies) {
        const hit = Math.abs(value.x - target.x) + Math.abs(value.y - target.y) <= 1;
        assert.equal(value.hp, hit ? 55 : 100);
      }
      for (const friend of state.cats) {
        const result = cat(next, friend.id);
        assert.deepEqual([result.hp, result.shield, result.shieldRemaining, result.attacks, result.cooldown], [friend.hp, friend.shield, friend.shieldRemaining, friend.attacks, friend.cooldown]);
      }
    }
    assert.equal(cat(state, 'caster').energy, 100);
    assert.ok(state.enemies.every(value => value.hp === 100));
  }
});

test('free target cells exist only for an active area-skilled combat cat on the board', () => {
  const state = isolated(); const caster = cat(state, 'caster');
  assert.deepEqual(getSkillTargetCells(cat(state, 'hero')), []);
  assert.deepEqual(getSkillTargetCells(cat(state, 'guard')), []);
  for (const change of [{status: 'resting'}, {status: 'ready'}, {combatant: false}, {x: -1}, {x: 7}, {y: 3}, {x: 2.5}, {y: NaN}] as Partial<CombatCatState>[]) {
    const unavailable = {...caster, ...change};
    assert.deepEqual(getSkillTargetCells(unavailable), []);
    assert.equal(isSkillTargetAllowed(unavailable, {x: 0, y: 1}), false);
  }
});

test('all right-edge cells, including B7, remain targetable by ranged attacks and skill aiming', () => {
  for (const y of [0, 1, 2]) {
    const point = {x: 6, y};
    let state = act(isolated(), {type: 'MOVE_CAT', catId: 'caster', x: 3, y: 1});
    assert.equal(state.lastAction!.ok, true); cat(state, 'caster').cooldown = 0;
    state.enemies = [enemy('at-entrance', point.x, point.y)];
    assert.ok(isEnemyInCells(state.enemies[0], getAttackCells(cat(state, 'caster'))));
    state = advanceGame(state, CONFIG.STEP);
    assert.equal(state.enemies[0].hp, 980); assert.equal(cat(state, 'caster').energy, 10);
    cat(state, 'caster').energy = 100;
    state = act(state, {type: 'SELECT_SKILL', catId: 'caster'});
    state = act(state, {type: 'AIM_SKILL', ...point});
    assert.equal(state.lastAction!.ok, true); assert.deepEqual(state.skillAim?.target, point);
    state = act(state, {type: 'CAST_SKILL', catId: 'caster'});
    assert.equal(state.lastAction!.ok, true); assert.equal(state.enemies[0].hp, 935);
    assert.equal(cat(state, 'caster').energy, 0); assert.equal(state.skillAim, null);
  }
});

test('melee cats on column six can still hit enemies in every right-edge cell', () => {
  for (const y of [0, 1, 2]) {
    const point = {x: 6, y};
    let state = act(isolated(), {type: 'MOVE_CAT', catId: 'guard', x: 5, y: point.y});
    assert.equal(state.lastAction!.ok, true); cat(state, 'guard').cooldown = 0;
    state.enemies = [enemy('at-entrance', point.x, point.y)];
    state = advanceGame(state, CONFIG.STEP);
    assert.equal(state.enemies[0].hp, 992); assert.equal(cat(state, 'guard').energy, 10);
  }
});

test('enemy cell membership rounds by floor(value + .5) and rejects offscreen enemies', () => {
  const cells = [{x: 5, y: 1}];
  assert.equal(isEnemyInCells(enemy('a', 4.499, 1), cells), false);
  assert.equal(isEnemyInCells(enemy('a', 4.5, 1), cells), true);
  assert.equal(isEnemyInCells(enemy('a', 5.499, 1.499), cells), true);
  assert.equal(isEnemyInCells(enemy('a', 5.5, 1), cells), false);
  assert.equal(isEnemyInCells(enemy('a', 6.01, 1), [{x: 6, y: 1}]), false);
  assert.equal(isEnemyInCells(enemy('a', -0.1, 1), [{x: 0, y: 1}]), false);
  assert.equal(isEnemyInCells(enemy('a', NaN, 1), cells), false);
});

test('effective normal hits give exactly 10 energy, cap at 100 and never auto-cast', () => {
  let state = isolated(); cat(state, 'caster').cooldown = 0;
  state.enemies = [enemy('target', 5, 1)];
  for (let hit = 1; hit <= 11; hit++) {
    cat(state, 'caster').cooldown = 0; const previousHp = state.enemies[0].hp;
    state = advanceGame(state, CONFIG.STEP);
    assert.equal(cat(state, 'caster').energy, Math.min(100, hit * 10));
    assert.equal(state.enemies[0].hp, previousHp - CONFIG.CASTER_DAMAGE);
  }
  assert.equal(cat(state, 'guard').energy, 0);
  assert.equal(state.skillAim, null);
  const before = cat(state, 'caster').energy;
  state.enemies = [enemy('outside', 6.7, 0)]; cat(state, 'caster').cooldown = 0;
  state = advanceGame(state, 2); assert.equal(cat(state, 'caster').energy, before);
  cat(state, 'caster').energy = 0; cat(state, 'caster').damage = 0;
  state.enemies = [enemy('zero-damage', 5, 1)]; state = advanceGame(state, 0.05);
  assert.equal(cat(state, 'caster').energy, 0);
});

test('normal attacks remain single-target even when several enemies share a cell', () => {
  let state = isolated(); cat(state, 'caster').cooldown = 0;
  state.enemies = [enemy('a', 5, 1), enemy('b', 5, 1), enemy('c', 5, 0)];
  state = advanceGame(state, CONFIG.STEP);
  assert.equal(state.enemies.filter(value => value.hp < value.maxHp).length, 1);
  assert.equal(cat(state, 'caster').energy, 10);
});

test('movement and swaps preserve energy, cooldowns and live shield duration', () => {
  const state = isolated();
  Object.assign(cat(state, 'caster'), {energy: 75, cooldown: 0.4});
  Object.assign(cat(state, 'guard'), {energy: 100, cooldown: 0.7, shield: 35, shieldRemaining: 4});
  const next = act(state, {type: 'MOVE_CAT', catId: 'guard', x: 3, y: 0});
  assert.equal(next.lastAction!.ok, true);
  for (const id of ['caster', 'guard']) for (const key of ['energy', 'cooldown', 'shield', 'shieldRemaining'] as const) assert.equal(cat(next, id)[key], cat(state, id)[key]);
});

test('area skill hits every enemy in its clipped cross once without generating attack energy', () => {
  const state = isolated(); cat(state, 'caster').energy = 100;
  const cells = getSkillCells(cat(state, 'caster'), {x: 5, y: 1});
  state.enemies = cells.map((cell, index) => enemy(`hit-${index}`, cell.x, cell.y, {hp: index === 0 ? 40 : 100}));
  state.enemies.push(enemy('same-cell', 5, 1, {hp: 100}), enemy('diagonal', 4, 0, {hp: 100}), enemy('offscreen', 6.1, 1, {hp: 100}));
  const before = structuredClone(state);
  const next = act(state, {type: 'CAST_SKILL', catId: 'caster', x: 5, y: 1});
  assert.equal(next.lastAction!.ok, true);
  assert.equal(cat(next, 'caster').energy, 0); assert.equal(next.defeated, before.defeated + 1);
  assert.equal(cat(next, 'caster').attacks, cat(before, 'caster').attacks);
  assert.equal(cat(next, 'caster').cooldown, cat(before, 'caster').cooldown);
  for (const target of next.enemies) assert.equal(target.hp, ['diagonal', 'offscreen'].includes(target.id) ? 100 : 55);
  assert.deepEqual(state, before);
});

test('rear enemies remain outside normal attacks but can be hit by a freely placed area skill', () => {
  let state = isolated(); Object.assign(cat(state, 'caster'), {x: 3, y: 0, cooldown: 0});
  state.enemies = [enemy('behind-caster', 2, 0)];
  assert.equal(isEnemyInCells(state.enemies[0], getAttackCells(cat(state, 'caster'))), false);
  state = advanceGame(state, CONFIG.STEP);
  assert.equal(state.enemies[0].hp, 1000); assert.equal(cat(state, 'caster').energy, 0);
  cat(state, 'caster').energy = 100;
  state = act(state, {type: 'CAST_SKILL', catId: 'caster', x: 2, y: 0});
  assert.equal(state.lastAction!.ok, true); assert.equal(state.enemies[0].hp, 955);
  assert.equal(cat(state, 'caster').energy, 0);
});

test('empty-area casts are allowed in battle but malformed and offboard centres are rejected without side effects', () => {
  const state = isolated(); cat(state, 'caster').energy = 100;
  const aiming = act(act(state, {type: 'SELECT_SKILL', catId: 'caster'}), {type: 'AIM_SKILL', x: 0, y: 1});
  for (const [x, y] of [[-1, 0], [7, 0], [3, -1], [3, 3], [3.5, 0], [3, 0.5], [NaN, 0], [3, NaN], [Infinity, 0], [3, Infinity]]) {
    assert.equal(isSkillTargetAllowed(cat(state, 'caster'), {x, y}), false);
    assert.deepEqual(getSkillCells(cat(state, 'caster'), {x, y}), []);
    const next = act(state, {type: 'CAST_SKILL', catId: 'caster', x, y});
    assert.equal(next.lastAction!.ok, false); assert.equal(cat(next, 'caster').energy, 100);
    assert.deepEqual(next.cats, state.cats); assert.deepEqual(next.enemies, state.enemies);
    const rejectedAim = act(aiming, {type: 'AIM_SKILL', x, y});
    assert.equal(rejectedAim.lastAction!.ok, false); assert.deepEqual(rejectedAim.skillAim, aiming.skillAim);
    assert.deepEqual(rejectedAim.cats, aiming.cats); assert.deepEqual(rejectedAim.enemies, aiming.enemies);
  }
  assert.equal(act(state, {type: 'CAST_SKILL', catId: 'caster', x: 4}).lastAction!.ok, false);
  assert.equal(act(state, {type: 'CAST_SKILL', catId: 'caster'}).lastAction!.ok, false);
  const next = act(state, {type: 'CAST_SKILL', catId: 'caster', x: 3, y: 0});
  assert.equal(next.lastAction!.ok, true); assert.equal(cat(next, 'caster').energy, 0);
  assert.deepEqual(next.enemies, state.enemies);
});

test('aiming keeps combat running, cancellation preserves energy and blocks item/movement bypasses', () => {
  const state = isolated(); cat(state, 'caster').energy = 100; cat(state, 'guard').hp = 100;
  let aiming = act(state, {type: 'SELECT_SKILL', catId: 'caster'});
  assert.deepEqual(aiming.skillAim, {catId: 'caster', target: null});
  assert.ok(advanceGame(aiming, 0.1).time > aiming.time);
  for (const action of [
    {type: 'MOVE_CAT', catId: 'guard', x: 5, y: 2}, {type: 'DEPLOY_CAT', catId: 'caster', x: 4, y: 0},
    {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'}, {type: 'OPEN_BAG'}, {type: 'RESTART'},
  ]) {
    const rejected = act(aiming, action); assert.equal(rejected.lastAction!.ok, false);
    assert.deepEqual(rejected.cats, aiming.cats); assert.deepEqual(rejected.inventory, aiming.inventory); assert.deepEqual(rejected.skillAim, aiming.skillAim);
  }
  aiming = act(aiming, {type: 'AIM_SKILL', x: 5, y: 1});
  const rejected = act(aiming, {type: 'AIM_SKILL', x: -1, y: 1});
  assert.deepEqual(rejected.skillAim, aiming.skillAim); assert.equal(cat(rejected, 'caster').energy, 100);
  const cancelled = act(aiming, {type: 'CANCEL_SKILL'});
  assert.equal(cancelled.skillAim, null); assert.equal(cat(cancelled, 'caster').energy, 100); assert.equal(cancelled.paused, state.paused);
  assert.ok(advanceGame(cancelled, 0.1).time > cancelled.time);
});

test('clearing a hovered target removes the whole preview without ending aim, spending energy or reusing stale coordinates', () => {
  const state = isolated(); cat(state, 'caster').energy = 100;
  assert.equal(act(state, {type: 'CLEAR_SKILL_TARGET'}).lastAction!.ok, false);
  let aiming = act(state, {type: 'SELECT_SKILL', catId: 'caster'});
  aiming = act(aiming, {type: 'AIM_SKILL', x: 5, y: 1});
  assert.equal(getSkillCells(cat(aiming, 'caster'), aiming.skillAim?.target).length, 5);
  const cleared = act(aiming, {type: 'CLEAR_SKILL_TARGET'});
  assert.equal(cleared.lastAction!.ok, true); assert.deepEqual(cleared.skillAim, {catId: 'caster', target: null});
  assert.deepEqual(getSkillCells(cat(cleared, 'caster'), cleared.skillAim?.target), []);
  assert.deepEqual(cleared.cats, aiming.cats); assert.deepEqual(cleared.enemies, aiming.enemies);
  assert.deepEqual(cleared.inventory, aiming.inventory); assert.equal(cleared.time, aiming.time);
  assert.ok(advanceGame(cleared, 0.1).time > cleared.time);
  const staleCast = act(cleared, {type: 'CAST_SKILL', catId: 'caster'});
  assert.equal(staleCast.lastAction!.ok, false); assert.deepEqual(staleCast.skillAim, cleared.skillAim);
  assert.equal(cat(staleCast, 'caster').energy, 100); assert.deepEqual(staleCast.enemies, cleared.enemies);
  const reaimed = act(staleCast, {type: 'AIM_SKILL', x: 6, y: 1});
  assert.equal(reaimed.lastAction!.ok, true); assert.deepEqual(reaimed.skillAim?.target, {x: 6, y: 1});
  const cancelled = act(reaimed, {type: 'CANCEL_SKILL'});
  assert.equal(cancelled.skillAim, null); assert.equal(cat(cancelled, 'caster').energy, 100);
});

test('clearing a hovered target during manual pause keeps aim, pause, energy and time unchanged', () => {
  const state = isolated(); cat(state, 'caster').energy = 100;
  const aiming = act(act(state, {type: 'SELECT_SKILL', catId: 'caster'}), {type: 'AIM_SKILL', x: 5, y: 1});
  const paused = act(aiming, {type: 'PAUSE'});
  const cleared = act(paused, {type: 'CLEAR_SKILL_TARGET'});
  assert.equal(cleared.lastAction!.ok, true);
  assert.deepEqual(cleared.skillAim, {catId: 'caster', target: null});
  assert.equal(cleared.paused, true); assert.equal(cleared.time, paused.time);
  assert.deepEqual(cleared.cats, paused.cats); assert.deepEqual(cleared.enemies, paused.enemies);
  assert.deepEqual(cleared.inventory, paused.inventory);
  assert.deepEqual(getSkillCells(cat(cleared, 'caster'), cleared.skillAim?.target), []);
  assert.equal(advanceGame(cleared, 10), cleared);
  const pausedCast = act(cleared, {type: 'CAST_SKILL', catId: 'caster'});
  assert.equal(pausedCast.lastAction!.ok, false); assert.equal(pausedCast.paused, true);
  assert.deepEqual(pausedCast.skillAim, cleared.skillAim); assert.equal(cat(pausedCast, 'caster').energy, 100);
  const resumed = act(cleared, {type: 'PAUSE'});
  const staleCast = act(resumed, {type: 'CAST_SKILL', catId: 'caster'});
  assert.equal(staleCast.lastAction!.ok, false); assert.deepEqual(staleCast.skillAim, cleared.skillAim);
  assert.equal(cat(staleCast, 'caster').energy, 100); assert.deepEqual(staleCast.enemies, cleared.enemies);
});

test('clearing a hovered target still respects bag pause and external pause', () => {
  const state = isolated(); cat(state, 'caster').energy = 100;
  const aiming = act(act(state, {type: 'SELECT_SKILL', catId: 'caster'}), {type: 'AIM_SKILL', x: 5, y: 1});
  for (const flag of ['bagOpen', 'externallyPaused'] as const) {
    const paused = {...aiming, [flag]: true};
    const rejected = act(paused, {type: 'CLEAR_SKILL_TARGET'});
    assert.equal(rejected.lastAction!.ok, false); assert.deepEqual(rejected.skillAim, paused.skillAim);
    assert.deepEqual(rejected.cats, paused.cats); assert.deepEqual(rejected.enemies, paused.enemies);
    assert.equal(advanceGame(rejected, 10), rejected);
  }
});

test('skill casts reject low energy, hero, inactive cats, manual pause, bag and scripted phases', () => {
  for (const id of ['caster', 'guard']) {
    const cast = {type: 'CAST_SKILL', catId: id, ...(id === 'caster' ? {x: 5, y: 1} : {})};
    for (const change of [
      (state: CombatState) => {cat(state, id).energy = 99;},
      (state: CombatState) => {cat(state, id).status = 'resting';},
      (state: CombatState) => {cat(state, id).status = 'ready';},
      (state: CombatState) => {state.paused = true;},
      (state: CombatState) => {state.bagOpen = true;},
      (state: CombatState) => {state.phase = 'caster_rescue';},
      (state: CombatState) => {state.phase = 'skill_charge';},
      (state: CombatState) => {state.phase = 'won';},
    ]) {
      const state = isolated(); cat(state, id).energy = 100; change(state);
      const next = act(state, cast); assert.equal(next.lastAction!.ok, false);
      assert.deepEqual(next.cats, state.cats); assert.deepEqual(next.enemies, state.enemies);
    }
  }
  const state = isolated(); cat(state, 'hero').energy = 100;
  assert.equal(act(state, {type: 'CAST_SKILL', catId: 'hero'}).lastAction!.ok, false);
});

test('pure engine external pause freezes timer, shield and all commands including cancellation', () => {
  const state = isolated(); cat(state, 'caster').energy = 100;
  const aiming = act(state, {type: 'SELECT_SKILL', catId: 'caster'}); aiming.externallyPaused = true;
  cat(aiming, 'guard').shield = 30; cat(aiming, 'guard').shieldRemaining = 2;
  assert.equal(advanceGame(aiming, 20), aiming);
  for (const action of [{type: 'CANCEL_SKILL'}, {type: 'CLEAR_SKILL_TARGET'}, {type: 'CAST_SKILL', catId: 'caster', x: 5, y: 1}, {type: 'AIM_SKILL', x: 4, y: 1}, {type: 'RESTART'}, {type: 'PAUSE'}]) {
    const next = act(aiming, action); assert.equal(next.lastAction!.ok, false);
    assert.deepEqual(next.cats, aiming.cats); assert.deepEqual(next.skillAim, aiming.skillAim); assert.equal(next.time, aiming.time);
  }
});

test('self shield replaces instead of stacking, lasts eight running seconds and does not heal', () => {
  let state = isolated(); Object.assign(cat(state, 'guard'), {energy: 100, hp: 100, shield: 12, shieldRemaining: 1});
  assert.equal(act(state, {type: 'CAST_SKILL', catId: 'guard', x: 1, y: 1}).lastAction!.ok, false);
  state = act(state, {type: 'CAST_SKILL', catId: 'guard'});
  assert.equal(cat(state, 'guard').hp, 100); assert.equal(cat(state, 'guard').shield, 60);
  assert.equal(cat(state, 'guard').shieldRemaining, 8); assert.equal(cat(state, 'guard').energy, 0);
  const paused = act(state, {type: 'PAUSE'}); assert.equal(advanceGame(paused, 30), paused);
  const bag = act(state, {type: 'OPEN_BAG'}); assert.equal(advanceGame(bag, 30), bag);
  state = advanceGame(state, 7.9); assert.ok(cat(state, 'guard').shieldRemaining > 0); assert.equal(cat(state, 'guard').shield, 60);
  state = advanceGame(state, 0.1); assert.equal(cat(state, 'guard').shieldRemaining, 0); assert.equal(cat(state, 'guard').shield, 0);
});

test('shield absorbs before health, excess damage enters rest and rest preserves energy/cooldown', () => {
  let state = isolated(); Object.assign(cat(state, 'guard'), {energy: 75, hp: 100, shield: 60, shieldRemaining: 8, cooldown: 1});
  state.enemies = [enemy('attacker', 4.55, 1, {blockedBy: 'guard', damage: 45, cooldown: 0})];
  state = advanceGame(state, 0.05);
  assert.equal(cat(state, 'guard').hp, 100); assert.equal(cat(state, 'guard').shield, 15); assert.equal(cat(state, 'guard').damageTaken, 0);
  state.enemies[0].damage = 100; state.enemies[0].cooldown = 0;
  state = advanceGame(state, 0.05);
  assert.equal(cat(state, 'guard').hp, 60); assert.equal(cat(state, 'guard').status, 'resting');
  assert.equal(cat(state, 'guard').damageTaken, 40); assert.equal(cat(state, 'guard').energy, 75);
  assert.equal(cat(state, 'guard').shield, 0); assert.equal(cat(state, 'guard').shieldRemaining, 0);
  const cooldown = cat(state, 'guard').cooldown; state = advanceGame(state, 1);
  assert.equal(cat(state, 'guard').cooldown, cooldown); assert.equal(cat(state, 'guard').energy, 75);
});

for (const mode of ['tutorial', 'standard'] as const) test(`${mode}: skill tutorial is mandatory, safe, uncounted and completes through both manual skills`, () => {
  let state = energyGate({mode});
  assert.ok(cat(state, 'caster').energy > 0, 'rescue attacks also charge energy');
  assert.equal(advanceGame(state, 30), state);
  assert.equal(act(state, {type: 'CAST_SKILL', catId: 'guard'}).lastAction!.ok, false);
  const counts = {spawned: state.spawned, defeated: state.defeated, escaped: state.escaped};
  state = act(state, {type: 'BEGIN_SKILL_PRACTICE'});
  assert.equal(state.phase, 'skill_charge'); assert.equal(cat(state, 'caster').energy, 0); assert.equal(cat(state, 'guard').energy, 0);
  assert.equal(state.enemies[0].training, true); assert.equal(state.enemies[0].hp, 1000); assert.equal(state.enemies[0].speed, 0); assert.equal(state.enemies[0].damage, 0);
  assert.equal(act(state, {type: 'MOVE_CAT', catId: 'guard', x: 5, y: 1}).lastAction!.ok, false);
  const health = state.cats.map(value => value.hp);
  state = until(state, value => value.phase === 'teach_energy_item');
  state = useTutorialEnergyItem(state);
  state = until(state, value => value.phase === 'teach_guard_skill');
  assert.equal(cat(state, 'caster').energy, 100); assert.equal(cat(state, 'guard').energy, 100);
  assert.deepEqual(state.cats.map(value => value.hp), health); assert.deepEqual([state.enemies[0].x, state.enemies[0].y], [5, 1]);
  assert.equal(advanceGame(state, 30), state);
  assert.equal(act(state, {type: 'CAST_SKILL', catId: 'caster', x: 5, y: 1}).lastAction!.ok, false);
  state = act(state, {type: 'CAST_SKILL', catId: 'guard'});
  assert.equal(state.phase, 'teach_caster_skill'); assert.equal(cat(state, 'guard').shield, SKILLS.guard.shield);
  assert.equal(advanceGame(state, 30), state);
  assert.equal(isSkillTargetAllowed(cat(state, 'caster'), {x: 0, y: 1}), true);
  const miss = act(state, {type: 'CAST_SKILL', catId: 'caster', x: 0, y: 1});
  assert.equal(miss.lastAction!.ok, false); assert.equal(miss.phase, 'teach_caster_skill'); assert.equal(cat(miss, 'caster').energy, 100);
  state = act(state, {type: 'CAST_SKILL', catId: 'caster', x: 5, y: 1});
  assert.equal(state.phase, 'battle'); assert.equal(state.wave, 1); assert.equal(state.enemies.length, 0);
  assert.equal(cat(state, 'guard').shield, 60); assert.equal(cat(state, 'guard').shieldRemaining, 8);
  assert.equal(cat(state, 'caster').energy, 0); assert.equal(cat(state, 'guard').energy, 0);
  assert.deepEqual({spawned: state.spawned, defeated: state.defeated, escaped: state.escaped}, counts);
  assert.equal(state.totalEnemies, CONFIG.TOTAL_ENEMIES); assert.equal(state.totalWaves, CONFIG.TOTAL_WAVES);
});

test('free reform restarts the current wave without repeating skills and clears energy, aim and shields', () => {
  let state = isolated(); Object.assign(cat(state, 'caster'), {energy: 100}); Object.assign(cat(state, 'guard'), {energy: 75, shield: 60, shieldRemaining: 8});
  state.enemies = ['a', 'b', 'c'].map(id => enemy(id, 0.01, 1, {speed: 1}));
  state = advanceGame(state, 0.1); assert.equal(state.phase, 'reform');
  const wave = state.wave; const counts = state.waveCheckpoint;
  state = act(state, {type: 'REFORM'});
  assert.equal(state.phase, 'battle'); assert.equal(state.wave, wave); assert.deepEqual(state.waveCheckpoint, counts);
  assert.equal(state.skillAim, null);
  for (const value of state.cats.filter(value => value.combatant)) assert.deepEqual([value.energy, value.shield, value.shieldRemaining], [0, 0, 0]);
});
