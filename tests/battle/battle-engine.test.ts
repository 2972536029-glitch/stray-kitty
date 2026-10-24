import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, advanceGame } from '../../web/src/modules/battle/l00/engine.ts';
import { CONFIG, COMMANDER_POSITION, ENEMY_TYPES, TUTORIAL_TARGETS, SPAWN_POINTS, isSpawnCell, WAVES } from '../../web/src/modules/battle/l00/config.ts';
import type {CombatAction, CombatCatState, CombatEnemy, CombatOptions, CombatState} from '../../web/src/modules/battle/l00/state.ts';
import {finishSkillTutorial, playBattle} from './helpers.ts';

const cat = (state: CombatState, id: string): CombatCatState => {const found = state.cats.find((item) => item.id === id); assert.ok(found, `missing cat ${id}`); return found;};
const until = (state: CombatState, predicate: (state: CombatState) => boolean, dt = 0.1, limit = 120) => {
  for (let elapsed = 0; elapsed < limit && !predicate(state); elapsed += dt) state = advanceGame(state, dt);
  assert.ok(predicate(state), `state stalled in ${state.phase} at ${state.time}`);
  return state;
};
const gate = (options?: CombatOptions) => until(act(createGame(options), { type: 'START' }), (state) => state.phase === 'teach_bag');
const steps: CombatAction[] = [
  { type: 'OPEN_BAG' }, { type: 'SELECT_ITEM', itemId: 'warm-can' }, { type: 'SELECT_TARGET', catId: 'caster' },
  { type: 'DEPLOY_CAT', catId: 'caster', ...TUTORIAL_TARGETS.deploy_caster },
  { type: 'MOVE_CAT', catId: 'guard', ...TUTORIAL_TARGETS.move_guard },
];
const battle = (options?: CombatOptions) => finishSkillTutorial(steps.reduce((state, action) => act(state, action), gate(options)));
const enemy = (id: string, x: number, y = 1, extra: Partial<CombatEnemy> = {}): CombatEnemy => ({ id, type: 'scout', ...ENEMY_TYPES.scout, hp: 10000, maxHp: 10000, x, y, cooldown: 100, blockedBy: null, ...extra });
function isolated(state = battle()) { state = structuredClone(state); state.spawnIndex = 2; state.waveTime = 8; return state; }
function freezeDeep<T extends object>(object: T): T { Object.freeze(object); for (const value of Object.values(object)) if (value && typeof value === 'object' && !Object.isFrozen(value)) freezeDeep(value); return object; }

test('initial schema: hero is a Chinchilla commander, never a combat unit', () => {
  const state = createGame();
  assert.equal(cat(state, 'hero').breed, '金吉拉');
  assert.equal(cat(state, 'hero').combatant, false);
  assert.equal(cat(state, 'hero').block, 0);
  assert.equal(cat(state, 'hero').damage, 0);
  assert.deepEqual([cat(state, 'hero').x, cat(state, 'hero').y], [3, 1]);
  assert.deepEqual(state.inventory, { 'warm-can': 2, 'bouncy-treat': 1 });
  assert.equal(state.totalEnemies, 32);
  assert.equal(state.totalWaves, 10);
});

test('script rescues hero at 50 and lets caster visibly attack before resting at 20', () => {
  let state = until(act(createGame(), { type: 'START' }), (s) => s.phase === 'caster_rescue');
  assert.equal(cat(state, 'hero').hp, 50);
  assert.deepEqual([cat(state, 'hero').x, cat(state, 'hero').y], [0, 1]);
  assert.equal(cat(state, 'hero').attacks, 0);
  assert.deepEqual([cat(state, 'caster').x, cat(state, 'caster').y], [3, 1]);
  assert.equal(state.advisor.visible, false);
  state = until(state, (s) => s.phase === 'teach_bag');
  assert.equal(cat(state, 'caster').hp, 20);
  assert.equal(cat(state, 'caster').status, 'resting');
  assert.ok(cat(state, 'caster').attacks >= 3);
  assert.equal(cat(state, 'caster').damageTaken, 60);
  assert.equal(state.advisor.visible, true);
  assert.equal(state.defeated, 1);
  assert.equal(state.enemies.length, 0);
});

test('all five teaching gates are mandatory, freeze time and reject shortcut actions', () => {
  let state = gate();
  const phases = ['teach_bag', 'teach_item', 'teach_target', 'teach_deploy', 'teach_move'];
  for (let i = 0; i < steps.length; i += 1) {
    assert.equal(state.phase, phases[i]);
    assert.equal(advanceGame(state, 30), state);
    for (const action of [
      { type: 'CONTINUE' }, { type: 'HEAL' }, { type: 'USE_ITEM', itemId: 'warm-can', catId: 'caster' },
      ...steps.slice(i + 1),
    ]) {
      const next = act(state, action);
      assert.equal(next.phase, state.phase);
      assert.equal(next.lastAction!.ok, false);
      assert.deepEqual(next.inventory, state.inventory);
    }
    state = act(state, steps[i]);
    assert.equal(state.lastAction!.ok, true);
  }
  assert.equal(state.phase, 'teach_energy');
  assert.equal(state.inventory['warm-can'], 1);
});

test('wrong tutorial item/target does not spend medicine or advance gate', () => {
  let state = act(gate(), { type: 'OPEN_BAG' });
  state = act(state, { type: 'SELECT_ITEM', itemId: 'made-up' });
  assert.equal(state.phase, 'teach_item');
  assert.equal(state.inventory['warm-can'], 2);
  state = act(state, steps[1]);
  for (const id of ['hero', 'guard', 'advisor', 'missing']) {
    const rejected = act(state, { type: 'SELECT_TARGET', catId: id });
    assert.equal(rejected.phase, 'teach_target');
    assert.equal(rejected.inventory['warm-can'], 2);
    assert.equal(rejected.lastAction!.ok, false);
  }
  state = act(state, steps[2]);
  assert.equal(cat(state, 'caster').hp, 80);
  assert.equal(cat(state, 'caster').status, 'ready');
  assert.equal(cat(state, 'caster').x, -2);
  const repeat = act(state, steps[2]);
  assert.equal(repeat.inventory['warm-can'], 1);
  assert.equal(repeat.healingCount, 1);
});

test('teaching placement and movement accept only the highlighted targets', () => {
  let state = steps.slice(0, 3).reduce((s, a) => act(s, a), gate());
  for (const [x, y] of [[2, 1], [3, 1], [7, 1]]) {
    const rejected = act(state, { type: 'DEPLOY_CAT', catId: 'caster', x, y });
    assert.equal(rejected.phase, 'teach_deploy');
    assert.equal(rejected.lastAction!.ok, false);
  }
  state = act(state, steps[3]);
  for (const action of [{ type: 'MOVE_CAT', catId: 'caster', x: 4, y: 0 }, { type: 'MOVE_CAT', catId: 'guard', x: 2, y: 1 }]) assert.equal(act(state, action).phase, 'teach_move');
  assert.equal(act(state, steps[4]).phase, 'teach_energy');
});

for (const mode of (['tutorial', 'standard'] as const)) for (const dt of [0.016, 0.1, 1, 10]) {
  test(`${mode} no-input outcome is deterministic at dt ${dt} and still protects resting cats`, () => {
    const initial = battle({mode});
    const state = until(initial, s => s.phase !== 'battle', dt, 180);
    const reference = until(initial, s => s.phase !== 'battle', 0.05, 180);
    assert.equal(state.phase, mode === 'tutorial' ? 'reform' : 'failed');
    assert.equal(state.wave, 10);
    assert.equal(state.leaks, 3);
    assert.equal(state.inventory['warm-can'], 2);
    assert.equal(cat(state, 'hero').attacks, 0);
    assert.ok(state.cats.every((item) => item.hp > 0));
    assert.equal(state.reforms, 0);
    assert.deepEqual(state.cats, reference.cats);
    assert.deepEqual(state.enemies, reference.enemies);
    assert.equal(state.defeated, reference.defeated);
    assert.equal(state.escaped, reference.escaped);
    assert.ok(Math.abs(state.time - reference.time) < 1e-8);
  });
}

test('valid combat healing can be followed by manual skills to complete all ten waves', () => {
  let state = until(battle(), (s) => cat(s, 'guard').hp < cat(s, 'guard').maxHp);
  state = act(state, { type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard' });
  assert.equal(state.lastAction!.ok, true);
  assert.equal(state.inventory['warm-can'], 1);
  const result = playBattle(state);
  assert.equal(result.state.phase, 'won');
  assert.equal(result.state.wave, 10);
  assert.ok(result.state.leaks < 3);
  assert.ok(result.areaCasts > 0 && result.shieldCasts > 0);
});

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
  assert.deepEqual(escaped.enemies, state.enemies); assert.deepEqual(escaped.inventory, state.inventory);
  assert.equal(escaped.time, state.time);

  const clearSwap = act(escaped, {type: 'MOVE_CAT', catId: 'caster', x: 0, y: 2});
  assert.equal(clearSwap.lastAction!.ok, true);
  assert.deepEqual(cat(clearSwap, 'caster'), {...cat(escaped, 'caster'), x: 0, y: 2});
  assert.deepEqual(cat(clearSwap, 'guard'), {...cat(escaped, 'guard'), x: 1, y: 2});
  assert.deepEqual(clearSwap.enemies, escaped.enemies); assert.deepEqual(clearSwap.inventory, escaped.inventory);
  assert.equal(clearSwap.time, escaped.time);
});

test('illegal grid, occupied enemy tile, resting unit and hero movement are rejected', () => {
  const state = isolated(); state.enemies = [enemy('one', 5, 1)];
  for (const [x, y] of [[-1, 1], [7, 1], [3, 3], [1.5, 1], [NaN, 1], [5, 1]]) assert.equal(act(state, { type: 'MOVE_CAT', catId: 'guard', x, y }).lastAction!.ok, false);
  for (const type of ['MOVE_CAT', 'DEPLOY_CAT']) assert.equal(act(state, { type, catId: 'hero', x: 1, y: 1 }).lastAction!.ok, false);
  cat(state, 'caster').status = 'resting';
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

test('deployment and movement reject B7 without changing resources, combat or occupancy', () => {
  for (const point of SPAWN_POINTS) for (const id of ['caster', 'guard']) for (const type of ['MOVE_CAT', 'DEPLOY_CAT']) {
    const state = isolated();
    Object.assign(cat(state, id), {energy: 75, cooldown: 0.6, shield: 40, shieldRemaining: 5});
    if (type === 'DEPLOY_CAT') Object.assign(cat(state, id), {status: 'ready', x: -2, y: cat(state, id).restSlot});
    state.enemies = [enemy('blocked', 4.55, 1, {blockedBy: 'guard'})];
    const before = structuredClone(state);
    const rejected = act(state, {type, catId: id, ...point});
    assert.equal(rejected.lastAction!.ok, false); assert.match(rejected.lastAction!.reason, /出怪口/);
    const {lastAction: _oldAction, sequence: _oldSequence, ...oldCombat} = before;
    const {lastAction: _newAction, sequence: _newSequence, ...newCombat} = rejected;
    assert.deepEqual(newCombat, oldCombat); assert.deepEqual(state, before);
  }
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
      assert.deepEqual(rejected.inventory, state.inventory); assert.equal(rejected.time, state.time);
    }
    // Moving out into a free legal cell remains available to recover that snapshot.
    const recovered = act(state, {type: 'MOVE_CAT', catId: 'guard', x: 5, y: point.y});
    assert.equal(recovered.lastAction!.ok, true); assert.equal(cat(recovered, 'guard').x, 5);
  }
});

test('A7 and C7 accept normal deployment and movement while preserving cat resources', () => {
  for (const y of [0, 2]) for (const id of ['caster', 'guard']) for (const type of ['MOVE_CAT', 'DEPLOY_CAT']) {
    const state = isolated();
    Object.assign(cat(state, id), {energy: 75, cooldown: 0.6, shield: 40, shieldRemaining: 5});
    if (type === 'DEPLOY_CAT') Object.assign(cat(state, id), {status: 'ready', x: -2, y: cat(state, id).restSlot});
    const before = structuredClone(state);
    const moved = act(state, {type, catId: id, x: 6, y});
    assert.equal(moved.lastAction!.ok, true);
    assert.deepEqual(cat(moved, id), {...cat(before, id), x: 6, y, status: 'active'});
    assert.deepEqual(moved.cats.filter(value => value.id !== id), before.cats.filter(value => value.id !== id));
    assert.deepEqual(moved.enemies, before.enemies); assert.deepEqual(moved.inventory, before.inventory);
    assert.equal(moved.time, before.time); assert.deepEqual(state, before);
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
    assert.deepEqual(state.enemies, before.enemies); assert.deepEqual(state.inventory, before.inventory); assert.equal(state.time, before.time);
  }
});

test('sleeping cats have independent resting slots and no attack, collision or damage', () => {
  let state = isolated();
  cat(state, 'guard').hp = 61;
  state.enemies = [enemy('attacker', 4.55, 1, { damage: 1000, cooldown: 0, blockedBy: 'guard' })];
  state = advanceGame(state, 0.05);
  assert.equal(cat(state, 'guard').status, 'resting');
  assert.equal(cat(state, 'guard').hp, 60);
  const attacks = cat(state, 'guard').attacks;
  const x = state.enemies[0].x;
  state = advanceGame(state, 1);
  assert.equal(cat(state, 'guard').hp, 60);
  assert.equal(cat(state, 'guard').attacks, attacks);
  assert.ok(state.enemies[0].x < x);
  assert.equal(state.enemies[0].blockedBy, null);
  cat(state, 'caster').status = 'resting'; cat(state, 'caster').x = -2; cat(state, 'caster').y = 0;
  assert.notEqual(cat(state, 'caster').restSlot, cat(state, 'guard').restSlot);
});

test('medicine uses one shared path; hero/full health/wrong item never consume it', () => {
  let state = battle();
  for (const action of [{ type: 'USE_ITEM', itemId: 'warm-can', catId: 'hero' }, { type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard' }, { type: 'USE_ITEM', itemId: 'fake', catId: 'guard' }]) {
    const next = act(state, action);
    assert.equal(next.lastAction!.ok, false); assert.equal(next.inventory['warm-can'], 2);
  }
  cat(state, 'guard').hp = 160; cat(state, 'guard').cooldown = 0.6;
  const direct = act(state, { type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard' });
  let viaBag = act(state, { type: 'OPEN_BAG' }); viaBag = act(viaBag, { type: 'SELECT_ITEM', itemId: 'warm-can' }); viaBag = act(viaBag, { type: 'SELECT_TARGET', catId: 'guard' });
  assert.equal(cat(direct, 'guard').hp, 220);
  assert.deepEqual(direct.cats, viaBag.cats);
  assert.deepEqual(direct.inventory, viaBag.inventory);
  assert.equal(cat(direct, 'guard').cooldown, 0.6);
  assert.equal(act(direct, { type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard' }).lastAction!.ok, false);
});

test('resting healing becomes ready, requires a free deployment tile, and preserves cooldown', () => {
  let state = battle();
  Object.assign(cat(state, 'guard'), { status: 'resting', hp: 60, x: -2, y: 1, cooldown: 0.7 });
  state = act(state, { type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard' });
  assert.equal(cat(state, 'guard').hp, 120);
  assert.equal(cat(state, 'guard').status, 'ready');
  assert.equal(act(state, { type: 'DEPLOY_CAT', catId: 'guard', x: 3, y: 0 }).lastAction!.ok, false);
  state = act(state, { type: 'DEPLOY_CAT', catId: 'guard', x: 4, y: 1 });
  assert.equal(cat(state, 'guard').status, 'active');
  assert.equal(cat(state, 'guard').cooldown, 0.7);
});

for (const mode of (['tutorial', 'standard'] as const)) test(`three leaks: ${mode} has the correct outcome`, () => {
  let state = isolated(battle({ mode }));
  state.enemies = [enemy('a', 0.01), enemy('b', 0.01), enemy('c', 0.01)];
  state = advanceGame(state, 0.1);
  assert.equal(state.phase, mode === 'tutorial' ? 'reform' : 'failed');
  assert.equal(state.leaks, 3);
  assert.ok(cat(state, 'hero').hp > 0);
  assert.equal(advanceGame(state, 10), state);
  if (mode === 'standard') assert.equal(act(state, { type: 'REFORM' }).lastAction!.ok, false);
});

test('simultaneous escapes beyond the remaining lives enter reform and rewind the current wave', () => {
  let state = until(battle(), (s) => s.wave === 2);
  // The first wave leaked twice; two shadows now cross together while a third remains.
  const checkpoint = { defeated: 1, escaped: 2, spawned: 3, inventory: {...state.inventory} };
  Object.assign(state, { defeated: 1, escaped: 2, spawned: 6, leaks: 2,
    waveCheckpoint: checkpoint, spawnIndex: 3, waveTime: 8,
    enemies: [enemy('paired-a', 0.01), enemy('paired-b', 0.01), enemy('remaining', 6.2)] });
  state = advanceGame(state, 0.1);
  assert.equal(state.phase, 'reform');
  assert.equal(state.leaks, 4);
  assert.equal(state.escaped, 4);
  assert.equal(state.defeated, 1);
  assert.deepEqual(state.enemies.map((item) => item.id), ['remaining']);
  assert.ok(cat(state, 'hero').hp > 0);
  assert.equal(advanceGame(state, 10), state);

  state = act(state, { type: 'REFORM' });
  assert.equal(state.phase, 'battle');
  assert.equal(state.wave, 2);
  assert.equal(state.leaks, 0);
  assert.equal(state.reforms, 1);
  assert.deepEqual(state.waveCheckpoint, checkpoint);
  assert.equal(state.defeated, checkpoint.defeated);
  assert.equal(state.escaped, checkpoint.escaped);
  assert.equal(state.spawned, checkpoint.spawned);
  assert.equal(state.enemies.length, 0);
});

test('tutorial reform is repeatable, rewinds only the current wave and can then win', () => {
  let state = until(battle(), (s) => s.wave === 2);
  const checkpoint = structuredClone(state.waveCheckpoint!);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    state.enemies = [enemy('a', 0.01), enemy('b', 0.01), enemy('c', 0.01)];
    state = advanceGame(state, 0.1);
    assert.equal(state.phase, 'reform');
    state = act(state, { type: 'REFORM' });
    assert.equal(state.wave, 2);
    assert.equal(state.defeated, checkpoint.defeated);
    assert.equal(state.leaks, 0);
    assert.equal(state.reforms, attempt + 1);
    assert.ok(state.cats.filter((item) => item.combatant).every((item) => item.hp === item.maxHp));
  }
  state = playBattle(state).state;
  assert.equal(state.phase, 'won');
  assert.equal(state.defeated + state.escaped, CONFIG.TOTAL_ENEMIES);
});

test('bag and explicit pause freeze combat; closing a bag preserves prior pause', () => {
  const initial = battle();
  const paused = act(initial, { type: 'PAUSE' });
  assert.equal(advanceGame(paused, 10), paused);
  const opened = act(paused, { type: 'OPEN_BAG' });
  assert.equal(advanceGame(opened, 10), opened);
  const closed = act(opened, { type: 'CLOSE_BAG' });
  assert.equal(closed.paused, true);
  assert.equal(advanceGame(closed, 10), closed);
  assert.ok(advanceGame(act(closed, { type: 'PAUSE' }), 0.1).time > initial.time);
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

test('pure functions, invalid dt, reset and pressure normalization', () => {
  const state = freezeDeep(battle({ shadowPressure: 5 }));
  assert.equal(state.effectivePressure, 0);
  assert.equal(state.requestedPressure, 1);
  const before = JSON.stringify(state);
  advanceGame(state, 2); act(state, { type: 'MOVE_CAT', catId: 'guard', x: 5, y: 2 });
  assert.equal(JSON.stringify(state), before);
  for (const dt of [NaN, Infinity, -1, '2', 0]) assert.equal(advanceGame(state, dt), state);
  assert.deepEqual(act(state, { type: 'RESTART' }), createGame({ shadowPressure: 1 }));
  assert.deepEqual(createGame(null), createGame());
  assert.equal(createGame({ shadowPressure: Infinity }).requestedPressure, 0);
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

test('B1 is permanently reserved, including when the opening hero is still at B4', () => {
  assert.deepEqual(COMMANDER_POSITION, {x: 0, y: 1});
  let state = battle();
  assert.deepEqual([cat(state, 'hero').x, cat(state, 'hero').y], [0, 1]);
  assert.match(act(state, {type: 'MOVE_CAT', catId: 'guard', x: 0, y: 1}).lastAction!.reason, /B1/);
  Object.assign(cat(state, 'hero'), {x: 3, y: 1});
  assert.equal(act(state, {type: 'MOVE_CAT', catId: 'guard', x: 0, y: 1}).lastAction!.ok, false);
  Object.assign(cat(state, 'caster'), {x: -2, y: 0, status: 'ready'});
  state = act(state, {type: 'DEPLOY_CAT', catId: 'caster', x: 0, y: 1});
  assert.equal(state.lastAction!.ok, false);
  assert.match(state.lastAction!.reason, /B1/);
  assert.equal(cat(state, 'caster').status, 'ready');
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

for (const lane of [0, 2]) test(`lane ${lane} reaches the first column before turning continuously toward B1`, () => {
  let state = isolated();
  for (const unit of state.cats.filter(item => item.combatant)) Object.assign(unit, {status: 'resting', x: -2});
  state.enemies = [enemy('branch', 1.1, lane, {speed: 1})];
  state = advanceGame(state, 0.5);
  assert.equal(state.leaks, 0);
  assert.ok(Math.abs(state.enemies[0].x - 0.6) < 1e-7);
  assert.equal(state.enemies[0].y, lane);
  state = advanceGame(state, 0.7);
  assert.equal(state.leaks, 0);
  assert.equal(state.enemies[0].x, 0);
  assert.ok(Math.abs(state.enemies[0].y - (lane === 0 ? 0.1 : 1.9)) < 1e-7);
  state = advanceGame(state, 0.9);
  assert.equal(state.leaks, 1);
  assert.equal(state.enemies.length, 0);
});

for (const lane of [0, 2]) test(`a shield on the first-column tile of lane ${lane} blocks two before its turn`, () => {
  let state = isolated();
  Object.assign(cat(state, 'caster'), {status: 'resting', x: -2});
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
  Object.assign(cat(state, 'caster'), {status: 'resting', x: -2});
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
