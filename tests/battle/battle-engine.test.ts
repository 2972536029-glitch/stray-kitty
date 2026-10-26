import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, advanceGame } from '../../web/src/modules/battle/l00/engine.ts';
import { CONFIG, COMMANDER_POSITION, ENEMY_TYPES, TUTORIAL_TARGETS, SPAWN_POINTS, isSpawnCell, WAVES } from '../../web/src/modules/battle/l00/config.ts';
import type {CombatAction, CombatCatState, CombatEnemy, CombatOptions, CombatState} from '../../web/src/modules/battle/l00/state.ts';
import {beginBattle} from './helpers.ts';

const cat = (state: CombatState, id: string): CombatCatState => {const found = state.cats.find((item) => item.id === id); assert.ok(found, `missing cat ${id}`); return found;};
const until = (state: CombatState, predicate: (state: CombatState) => boolean, dt = 0.1, limit = 120) => {
  for (let elapsed = 0; elapsed < limit && !predicate(state); elapsed += dt) state = advanceGame(state, dt);
  assert.ok(predicate(state), `state stalled in ${state.phase} at ${state.time}`);
  return state;
};
const battle = (options?: CombatOptions) => beginBattle(options);
const enemy = (id: string, x: number, y = 1, extra: Partial<CombatEnemy> = {}): CombatEnemy => ({ id, type: 'scout', ...ENEMY_TYPES.scout, hp: 10000, maxHp: 10000, x, y, cooldown: 100, blockedBy: null, ...extra });
function isolated(state = battle()) { state = structuredClone(state); state.spawnIndex = 2; state.waveTime = 8; return state; }
function freezeDeep<T extends object>(object: T): T { Object.freeze(object); for (const value of Object.values(object)) if (value && typeof value === 'object' && !Object.isFrozen(value)) freezeDeep(value); return object; }

test('free movement swaps active cats atomically and preserves health/cooldowns/enemy coordinates', () => {
  let state = isolated();
  cat(state, 'caster').cooldown = 0.65; cat(state, 'guard').cooldown = 0.8; cat(state, 'guard').hp = 170;
  state.enemies = [enemy('one', 5.5)];
  const moved = act(state, { type: 'MOVE_CAT', catId: 'guard', x: 3, y: 0 });
  assert.equal(moved.lastAction!.ok, true);
  assert.deepEqual([cat(moved, 'guard').x, cat(moved, 'guard').y], [3, 0]);
  assert.deepEqual([cat(moved, 'caster').x, cat(moved, 'caster').y], [4, 1]);
  assert.equal(cat(moved, 'guard').hp, 170);
  assert.equal(cat(moved, 'guard').cooldown, 0.8);
  assert.equal(cat(moved, 'caster').cooldown, 0.65);
  assert.equal(moved.enemies[0].x, 5.5);
  for (let i = 0; i < 10; i += 1) state = act(state, { type: 'MOVE_CAT', catId: 'guard', x: i % 2 ? 4 : 5, y: 2 });
  assert.equal(cat(state, 'guard').cooldown, 0.8);
});

test('natural passing enemies block swaps in either direction without preventing movement out to an empty cell', () => {
  let state = battle({difficulty: 'high'});
  for (const action of [
    {type: 'MOVE_CAT', catId: 'guard', x: 0, y: 2},
    {type: 'MOVE_CAT', catId: 'caster', x: 0, y: 0},
  ]) {
    state = act(state, action); assert.equal(state.lastAction!.ok, true);
  }
  state = until(state, value => value.enemies.some(enemy => enemy.y === 1 && enemy.x < 4.55 && enemy.x > 4.45), 0.05);
  state = act(state, {type: 'MOVE_CAT', catId: 'caster', x: 4, y: 1});
  assert.equal(state.lastAction!.ok, true);
  state = advanceGame(state, 0.2);
  assert.ok(state.enemies.some(enemy => enemy.y === 1 && Math.abs(enemy.x - 4) < 0.45));
  const before = structuredClone(state);
  for (const action of [
    {type: 'MOVE_CAT', catId: 'guard', x: 4, y: 1},
    {type: 'MOVE_CAT', catId: 'caster', x: 0, y: 2},
  ]) {
    const rejected = act(state, action);
    assert.equal(rejected.lastAction!.ok, false);
    assert.match(rejected.lastAction!.reason, /黑影占据/);
    const {lastAction: _feedback, sequence: _sequence, ...unchanged} = rejected;
    const {lastAction: _previousFeedback, sequence: _previousSequence, ...expected} = before;
    assert.deepEqual(unchanged, expected, 'rejected exchanges must only update feedback');
    assert.deepEqual(state, before, 'the input snapshot must remain unchanged');
  }

  const escaped = act(state, {type: 'MOVE_CAT', catId: 'caster', x: 1, y: 2});
  assert.equal(escaped.lastAction!.ok, true);
  assert.deepEqual(cat(escaped, 'caster'), {...cat(state, 'caster'), x: 1, y: 2});
  assert.deepEqual(cat(escaped, 'guard'), cat(state, 'guard'));
  assert.deepEqual(escaped.enemies, state.enemies);
  assert.equal(escaped.time, state.time);

  const clearSwap = act(escaped, {type: 'MOVE_CAT', catId: 'caster', x: 0, y: 2});
  assert.equal(clearSwap.lastAction!.ok, true);
  assert.deepEqual(cat(clearSwap, 'caster'), {...cat(escaped, 'caster'), x: 0, y: 2});
  assert.deepEqual(cat(clearSwap, 'guard'), {...cat(escaped, 'guard'), x: 1, y: 2});
  assert.deepEqual(clearSwap.enemies, escaped.enemies);
  assert.equal(clearSwap.time, escaped.time);
});

test('illegal grid, occupied enemy tile, resting unit and hero movement are rejected', () => {
  const state = isolated(); state.enemies = [enemy('one', 5, 1)];
  for (const [x, y] of [[-1, 1], [7, 1], [3, 3], [1.5, 1], [NaN, 1], [5, 1]]) assert.equal(act(state, { type: 'MOVE_CAT', catId: 'guard', x, y }).lastAction!.ok, false);
  for (const type of ['MOVE_CAT', 'DEPLOY_CAT']) assert.equal(act(state, { type, catId: 'hero', x: 1, y: 1 }).lastAction!.ok, false);
  cat(state, 'caster').status = 'retired';
  assert.equal(act(state, { type: 'MOVE_CAT', catId: 'caster', x: 1, y: 1 }).lastAction!.ok, false);
});

test('shield blocks exactly two: a third shadow passes and never steals their slots', () => {
  let state = isolated();
  cat(state, 'guard').damage = 0; cat(state, 'caster').damage = 0;
  state.enemies = [enemy('a', 4.6), enemy('b', 4.65), enemy('c', 4.7)];
  state = advanceGame(state, 2);
  assert.equal(state.enemies.filter((item) => item.blockedBy === 'guard').length, 2);
  assert.equal(cat(state, 'guard').blockedCount, 2);
  assert.ok(state.enemies.find((item) => item.id === 'c')!.x < 4);
  assert.equal(state.enemies.find((item) => item.id === 'c')!.blockedBy, null);
});

test('caster blocks exactly one on its lane and ignores enemies on other lanes', () => {
  let state = isolated();
  state = act(state, { type: 'MOVE_CAT', catId: 'guard', x: 0, y: 2 });
  state = act(state, { type: 'MOVE_CAT', catId: 'caster', x: 3, y: 1 });
  cat(state, 'caster').damage = 0; cat(state, 'guard').damage = 0;
  state.enemies = [enemy('a', 3.6), enemy('b', 3.7), enemy('other-lane', 3.6, 0)];
  state = advanceGame(state, 2);
  assert.equal(state.enemies.filter((item) => item.blockedBy === 'caster').length, 1);
  assert.ok(state.enemies.find((item) => item.id === 'b')!.x < 3);
  assert.equal(state.enemies.find((item) => item.id === 'other-lane')!.blockedBy, null);
});

test('moving a blocking cat releases its enemies without teleporting or healing them', () => {
  let state = isolated(); state.enemies = [enemy('one', 4.55, 1, { blockedBy: 'guard' })];
  state = act(state, { type: 'MOVE_CAT', catId: 'guard', x: 5, y: 1 });
  assert.equal(state.enemies[0].x, 4.55);
  assert.equal(state.enemies[0].hp, 10000);
  assert.equal(state.enemies[0].blockedBy, null);
  state = advanceGame(state, 0.2);
  assert.ok(state.enemies[0].x < 4.55);
});

test('rightmost legal column can attack incoming enemies at the board edge without a stalemate', () => {
  let state = act(isolated(), { type: 'MOVE_CAT', catId: 'guard', x: 5, y: 1 });
  assert.equal(state.lastAction!.ok, true);
  state.enemies = [enemy('edge', 6.2, 1, { hp: 20, maxHp: 20 })];
  state = advanceGame(state, 4);
  assert.equal(state.enemies.some((item) => item.id === 'edge'), false);
});

test('B7 is the only reserved spawn entrance and the board has nineteen candidate deployment cells', () => {
  assert.deepEqual(SPAWN_POINTS, [{x: 6, y: 1}]);
  assert.ok(Object.isFrozen(SPAWN_POINTS) && SPAWN_POINTS.every(Object.isFrozen));
  assert.ok(WAVES.flat().every(entry => entry.y === 1));
  for (const point of SPAWN_POINTS) assert.equal(isSpawnCell(point.x, point.y), true);
  for (const [x, y] of [[5, 0], [5, 1], [5, 2], [6, 0], [6, 2], [6, -1], [6, 3], [6, 0.5], [7, 1], [NaN, 1]]) assert.equal(isSpawnCell(x, y), false);
  const available = Array.from({length: 21}, (_, index) => ({x: index % 7, y: Math.floor(index / 7)}))
    .filter(point => !isSpawnCell(point.x, point.y) && !(point.x === COMMANDER_POSITION.x && point.y === COMMANDER_POSITION.y));
  assert.equal(available.length, 19);
});

test('exchanges cannot move either cat into B7, including a previous-version occupied entrance', () => {
  for (const point of SPAWN_POINTS) {
    const state = isolated();
    // A previous-version snapshot may have a cat on the now-reserved column.
    Object.assign(cat(state, 'guard'), point, {energy: 75, cooldown: 0.6, shield: 40, shieldRemaining: 5});
    Object.assign(cat(state, 'caster'), {energy: 100, cooldown: 0.3});
    for (const action of [
      {type: 'MOVE_CAT', catId: 'caster', ...point},
      {type: 'MOVE_CAT', catId: 'guard', x: cat(state, 'caster').x, y: cat(state, 'caster').y},
    ]) {
      const rejected = act(state, action); assert.equal(rejected.lastAction!.ok, false); assert.match(rejected.lastAction!.reason, /出怪口/);
      assert.deepEqual(rejected.cats, state.cats); assert.deepEqual(rejected.enemies, state.enemies);
       assert.equal(rejected.time, state.time);
    }
    // Moving out into a free legal cell remains available to recover that snapshot.
    const recovered = act(state, {type: 'MOVE_CAT', catId: 'guard', x: 5, y: point.y});
    assert.equal(recovered.lastAction!.ok, true); assert.equal(cat(recovered, 'guard').x, 5);
  }
});

test('A7 and C7 allow atomic exchanges into and out of the side corner cells', () => {
  for (const y of [0, 2]) {
    let state = act(isolated(), {type: 'MOVE_CAT', catId: 'guard', x: 6, y});
    assert.equal(state.lastAction!.ok, true);
    Object.assign(cat(state, 'guard'), {energy: 75, cooldown: 0.6, shield: 40, shieldRemaining: 5});
    Object.assign(cat(state, 'caster'), {energy: 100, cooldown: 0.3});
    const before = structuredClone(state);
    state = act(state, {type: 'MOVE_CAT', catId: 'caster', x: 6, y});
    assert.equal(state.lastAction!.ok, true);
    assert.deepEqual(cat(state, 'caster'), {...cat(before, 'caster'), x: 6, y});
    assert.deepEqual(cat(state, 'guard'), {...cat(before, 'guard'), x: cat(before, 'caster').x, y: cat(before, 'caster').y});
    state = act(state, {type: 'MOVE_CAT', catId: 'caster', x: cat(before, 'caster').x, y: cat(before, 'caster').y});
    assert.equal(state.lastAction!.ok, true); assert.deepEqual(state.cats, before.cats);
    assert.deepEqual(state.enemies, before.enemies);  assert.equal(state.time, before.time);
  }
});

test('outside and rear targets cannot be hit while forward rectangle targets can', () => {
  let state = isolated();
  state.enemies = [enemy('outside', 6.7, 0, { speed: 0 })];
  state = advanceGame(state, 1);
  assert.equal(state.enemies[0].hp, 10000);
  state.enemies = [enemy('behind', 1, 0, { speed: 0 })];
  state = advanceGame(state, 0.1);
  assert.equal(state.enemies[0].hp, 10000);
  state.enemies = [enemy('forward', 5, 1, { speed: 0 })];
  cat(state, 'caster').cooldown = 0;
  cat(state, 'guard').cooldown = 10;
  state = advanceGame(state, 0.05);
  assert.equal(state.enemies[0].hp, 9980);
});

test('fixed-step simulation is independent of rendering cadence during battle', () => {
  const initial = battle();
  let fine = initial;
  for (let i = 0; i < 600; i += 1) fine = advanceGame(fine, 1 / 60);
  const coarse = advanceGame(initial, 10);
  assert.deepEqual(fine.cats, coarse.cats);
  assert.deepEqual(fine.enemies, coarse.enemies);
  assert.equal(fine.defeated, coarse.defeated);
  assert.equal(fine.wave, coarse.wave);
});

test('arrival at B1 counts immediately, before an in-range cat could attack that frame', () => {
  let state = isolated();
  Object.assign(cat(state, 'caster'), {x: 1, y: 0, cooldown: 0});
  state.enemies = [enemy('at-goal', 0.01, 1, {hp: 1, speed: 1})];
  const previousDefeated = state.defeated; const previousAttacks = cat(state, 'caster').attacks;
  state = advanceGame(state, 0.05);
  assert.equal(state.leaks, 1);
  assert.equal(state.escaped, 1);
  assert.equal(state.defeated, previousDefeated);
  assert.equal(cat(state, 'caster').attacks, previousAttacks);
  assert.deepEqual([cat(state, 'hero').x, cat(state, 'hero').y], [0, 1]);
  assert.equal(cat(state, 'hero').hp, 40);
  assert.equal(cat(state, 'hero').blockedCount, 0);
});

for (const lane of [0, 2]) test(`a shield on the first-column tile of lane ${lane} blocks two before its turn`, () => {
  let state = isolated();
  Object.assign(cat(state, 'caster'), {status: 'retired', x: -2});
  Object.assign(cat(state, 'guard'), {x: 0, y: lane, damage: 0});
  state.enemies = [enemy('a', 0.65, lane, {speed: 1}), enemy('b', 0.7, lane, {speed: 1}), enemy('overflow', 0.75, lane, {speed: 1})];
  state = advanceGame(state, 0.8);
  assert.equal(state.leaks, 0);
  assert.equal(state.enemies.filter(item => item.blockedBy === 'guard').length, 2);
  assert.equal(cat(state, 'guard').blockedCount, 2);
  const overflow = state.enemies.find(item => item.id === 'overflow')!;
  assert.equal(overflow.x, 0);
  assert.equal(overflow.blockedBy, null);
  assert.ok(Math.abs(overflow.y - lane) > 0);
  const shifted = act(state, {type: 'MOVE_CAT', catId: 'guard', x: 3, y: 2});
  assert.ok(shifted.enemies.every(item => item.blockedBy === null));
  assert.deepEqual(shifted.enemies.map(item => [item.x, item.y]), state.enemies.map(item => [item.x, item.y]));
  state.enemies = [enemy('not-the-goal', 0, lane, {speed: 1})];
  state = advanceGame(state, 0.05);
  assert.equal(state.leaks, 0);
});

test('a cat cannot be dropped onto a shadow partway through a first-column turn', () => {
  const state = isolated(); state.enemies = [enemy('turning', 0, 0.2)];
  const moved = act(state, {type: 'MOVE_CAT', catId: 'guard', x: 0, y: 0});
  assert.equal(moved.lastAction!.ok, false);
  assert.match(moved.lastAction!.reason, /黑影占据/);
  assert.deepEqual(moved.cats, state.cats);
});

test('a shield at B2 does not pull either side route into the middle lane', () => {
  let state = isolated();
  Object.assign(cat(state, 'caster'), {status: 'retired', x: -2});
  Object.assign(cat(state, 'guard'), {x: 1, y: 1, damage: 0});
  state.enemies = [enemy('upper', 1.1, 0, {speed: 1}), enemy('lower', 1.1, 2, {speed: 1})];
  state = advanceGame(state, 0.8);
  for (const shadow of state.enemies) {
    assert.ok(Math.abs(shadow.x - 0.3) < 1e-7);
    assert.equal(shadow.y, shadow.id === 'upper' ? 0 : 2);
    assert.equal(shadow.blockedBy, null);
  }
  assert.equal(cat(state, 'guard').blockedCount, 0);
  state = advanceGame(state, 0.4);
  for (const shadow of state.enemies) assert.equal(shadow.x, 0);
  assert.equal(cat(state, 'guard').blockedCount, 0);
});

for (const y of [0.99, 1.01]) test(`vertical arrival from y=${y} counts a breakthrough in that exact frame`, () => {
  let state = isolated(); state.enemies = [enemy('final-turn', 0, y, {speed: 1})];
  state = advanceGame(state, 0.05);
  assert.equal(state.leaks, 1);
  assert.equal(state.enemies.length, 0);
});
