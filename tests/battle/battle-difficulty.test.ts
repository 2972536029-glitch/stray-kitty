import test from 'node:test';
import assert from 'node:assert/strict';
import {act, advanceGame, createGame} from '../../web/src/modules/battle/l00/engine.ts';
import {CONFIG, DIFFICULTY_CONFIG, ENEMY_TYPES, normalizeDifficulty, TUTORIAL_TARGETS} from '../../web/src/modules/battle/l00/config.ts';
import type {CombatAction, CombatOptions, CombatState} from '../../web/src/modules/battle/l00/state.ts';
import type {BattleDifficulty} from '../../web/src/modules/battle/l00/types.ts';
import {playBattle, skillTutorialSnapshots} from './helpers.ts';

const difficulties: BattleDifficulty[] = ['low', 'medium', 'high'];
const guide: CombatAction[] = [
  {type: 'OPEN_BAG'}, {type: 'SELECT_ITEM', itemId: 'warm-can'}, {type: 'SELECT_TARGET', catId: 'caster'},
  {type: 'DEPLOY_CAT', catId: 'caster', ...TUTORIAL_TARGETS.deploy_caster},
  {type: 'MOVE_CAT', catId: 'guard', ...TUTORIAL_TARGETS.move_guard},
];
function until(state: CombatState, predicate: (state: CombatState) => boolean): CombatState {
  for (let step = 0; step < 2400 && !predicate(state); step++) state = advanceGame(state, 0.1);
  assert.ok(predicate(state), `stalled in ${state.phase} at ${state.time}`);
  return state;
}
function tutorial(options: CombatOptions = {}): CombatState[] {
  let state = createGame(options);
  const snapshots = [state];
  state = act(state, {type: 'START'}); snapshots.push(state);
  state = until(state, current => current.phase === 'caster_rescue'); snapshots.push(state);
  state = until(state, current => current.phase === 'teach_bag'); snapshots.push(state);
  for (const action of guide) {state = act(state, action); snapshots.push(state);}
  const skillSnapshots = skillTutorialSnapshots(state); snapshots.push(...skillSnapshots); state = skillSnapshots.at(-1)!;
  assert.equal(state.phase, 'battle');
  return snapshots;
}
function battle(difficulty: BattleDifficulty): CombatState {return tutorial({difficulty}).at(-1)!;}
function withoutDifficulty(state: CombatState) {const {difficulty: _difficulty, ...rest} = state; return rest;}
function exhaustDefenders(state: CombatState): CombatState {
  // A legal combat outcome: both fighters have retreated and the bag is empty.
  // Keep the actual wave schedule and enemies so the normal leak path must protect the player.
  state = structuredClone(state);
  for (const cat of state.cats.filter(value => value.combatant)) {
    Object.assign(cat, {hp: cat.maxHp * CONFIG.REST_RATIO, status: 'resting', x: -2, y: cat.restSlot, blockedCount: 0});
  }
  state.inventory['warm-can'] = 0;
  return until(state, current => current.phase !== 'battle');
}

test('difficulty defaults only on omission and rejects invalid external values with a stable code', () => {
  assert.equal(normalizeDifficulty(undefined), 'medium');
  assert.equal(createGame().difficulty, 'medium');
  assert.equal(createGame({difficulty: undefined}).difficulty, 'medium');
  for (const difficulty of difficulties) assert.equal(normalizeDifficulty(difficulty), difficulty);
  for (const invalid of [null, '', 0, 1, 2, false, true, 'hard', 'HIGH', 'low ', {}, [], NaN]) {
    assert.throws(() => normalizeDifficulty(invalid), {code: 'INVALID_BATTLE_DIFFICULTY'});
    assert.throws(() => createGame({difficulty: invalid} as CombatOptions), {code: 'INVALID_BATTLE_DIFFICULTY'});
  }
});

test('all difficulties produce identical scripted rescue and mandatory teaching snapshots', () => {
  const reference = tutorial({difficulty: 'medium'}).map(withoutDifficulty);
  for (const difficulty of difficulties) {
    const snapshots = tutorial({difficulty});
    assert.deepEqual(snapshots.map(withoutDifficulty), reference);
    assert.equal(snapshots[1].enemies[0].maxHp, 240);
    assert.equal(snapshots[1].enemies[0].hp, 240);
    assert.equal(snapshots[1].enemies[0].damage, 15);
    assert.equal(snapshots[1].enemies[0].interval, 1);
    for (const state of snapshots.filter(value => value.phase.startsWith('teach_'))) {
      assert.equal(advanceGame(state, 30), state);
      assert.equal(act(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'caster'}).lastAction!.ok, false);
    }
  }
});

for (const difficulty of difficulties) test(`${difficulty}: all 31 spawns scale HP only and basic supplies plus delayed manual skills win`, context => {
  const initial = battle(difficulty);
  assert.deepEqual(initial.inventory, {'warm-can': 2, 'bouncy-treat': 1});
  const result = playBattle(initial, {reactionSeconds: 2});
  const state = result.state;
  const expectedHp = difficulty === 'low' ? {scout: 60, runner: 40} : difficulty === 'high' ? {scout: 90, runner: 60} : {scout: 75, runner: 50};
  const types = new Set<string>();
  for (const enemy of result.spawns) {
    types.add(enemy.type);
    assert.equal(enemy.maxHp, expectedHp[enemy.type]);
    assert.equal(enemy.hp, expectedHp[enemy.type]);
    assert.equal(enemy.damage, ENEMY_TYPES[enemy.type].damage);
    assert.equal(enemy.speed, ENEMY_TYPES[enemy.type].speed);
    assert.equal(enemy.interval, ENEMY_TYPES[enemy.type].interval);
    assert.equal(enemy.y, 1);
  }
  assert.equal(state.phase, 'won');
  assert.equal(state.defeated + state.escaped, CONFIG.TOTAL_ENEMIES);
  assert.ok(state.escaped < CONFIG.MAX_LEAKS);
  assert.equal(state.reforms, 0);
  assert.equal(state.healingCount, initial.healingCount + result.healingItems);
  assert.equal(state.inventory['warm-can'], 2 - result.healingItems);
  assert.equal(state.inventory['bouncy-treat'], 1 - result.energyItems);
  assert.equal(result.spawns.length, 31);
  assert.deepEqual(result.waves, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(result.shieldCasts >= 2 && result.areaCasts >= 3);
  assert.ok(result.areaHits >= result.areaCasts);
  assert.ok(result.battleSeconds >= 90 && result.battleSeconds <= 150);
  assert.deepEqual([...types].sort(), ['runner', 'scout']);
  context.diagnostic(JSON.stringify({difficulty, label: DIFFICULTY_CONFIG[difficulty].label,
    tutorialSeconds: Number(initial.time.toFixed(2)), battleSeconds: result.battleSeconds, reactionSeconds: 2,
    breakthroughs: state.escaped, remainingHp: Object.fromEntries(state.cats.map(cat => [cat.id, cat.hp])),
    shieldCasts: result.shieldCasts, areaCasts: result.areaCasts, areaHits: result.areaHits,
    teachingCansUsed: initial.healingCount, combatCansUsed: result.healingItems, energyItems: result.energyItems,
    remainingInventory: state.inventory}));
});

for (const difficulty of difficulties) test(`${difficulty}: repeatable free reform preserves difficulty, never compounds HP and recovers to a win`, () => {
  let state = battle(difficulty);
  for (let retry = 0; retry < 2; retry++) {
    state = exhaustDefenders(state);
    assert.equal(state.phase, 'reform');
    assert.equal(state.mode, 'tutorial');
    assert.ok(state.cats.every(cat => cat.hp > 0));
    assert.equal(state.difficulty, difficulty);
    const checkpoint = structuredClone(state.waveCheckpoint);
    const wave = state.wave;
    state = act(state, {type: 'REFORM'});
    assert.equal(state.phase, 'battle');
    assert.equal(state.wave, wave);
    assert.deepEqual(state.waveCheckpoint, checkpoint);
    assert.equal(state.difficulty, difficulty);
    assert.equal(state.reforms, retry + 1);
    assert.equal(state.leaks, 0);
    assert.ok(state.cats.filter(cat => cat.combatant).every(cat => cat.hp === cat.maxHp));
    assert.deepEqual(state.inventory, checkpoint!.inventory);
    state = advanceGame(state, 0.05);
    assert.equal(state.enemies[0].maxHp, Math.round(ENEMY_TYPES.scout.maxHp * DIFFICULTY_CONFIG[difficulty].enemyHpMultiplier));
    assert.equal(state.enemies[0].hp, state.enemies[0].maxHp);
  }
  state = playBattle(state).state;
  assert.equal(state.difficulty, difficulty);
  assert.equal(state.phase, 'won');
  assert.equal(state.reforms, 2);
});

for (const difficulty of difficulties) test(`${difficulty}: restart preserves selected difficulty and legacy pressure cannot alter it`, () => {
  const selected = createGame({difficulty, shadowPressure: -1});
  const restarted = act(act(selected, {type: 'START'}), {type: 'RESTART'});
  assert.deepEqual(restarted, selected);
  const base = tutorial({difficulty}).at(-1)!;
  for (const shadowPressure of [-1, 0, 1]) {
    let state = tutorial({difficulty, shadowPressure}).at(-1)!;
    assert.equal(state.difficulty, difficulty);
    assert.equal(state.effectivePressure, 0);
    state = advanceGame(state, 0.1);
    assert.deepEqual(state.enemies, advanceGame(base, 0.1).enemies);
  }
});
