import test from 'node:test';
import assert from 'node:assert/strict';
import {act, advanceGame} from '../../web/src/modules/battle/l00/engine.ts';
import {CONFIG, WAVES} from '../../web/src/modules/battle/l00/config.ts';
import type {CombatState, PlaybackSpeed} from '../../web/src/modules/battle/l00/state.ts';
import {beginBattle, playBattle} from './helpers.ts';

const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function firstGap(): CombatState {
  let state = beginBattle();
  for (let step = 0; step < 1000 && state.nextWaveIn === null; step++) state = advanceGame(state, 0.05);
  assert.equal(state.wave, 1); assert.equal(state.nextWaveIn, 5);
  assert.equal(state.phase, 'battle'); assert.equal(state.enemies.length, 0);
  return state;
}

test('ten waves alternate groups and relief, with immutable entries and derived totals', () => {
  assert.deepEqual(WAVES.map(wave => wave.length), [2, 3, 3, 2, 4, 3, 2, 4, 3, 5]);
  assert.equal(WAVES.flat().length, 31);
  assert.equal(CONFIG.TOTAL_WAVES, WAVES.length);
  assert.equal(CONFIG.TOTAL_ENEMIES, WAVES.flat().length + 1);
  assert.equal(CONFIG.WAVE_GAP, 5);
  assert.ok(Object.isFrozen(WAVES));
  for (const entries of WAVES) {
    assert.ok(Object.isFrozen(entries));
    assert.equal(entries[0].at, 0);
    for (const [index, entry] of entries.entries()) {
      assert.ok(Object.isFrozen(entry));
      assert.equal(entry.y, 1);
      assert.ok(Number.isFinite(entry.at) && entry.at >= 0);
      if (index) assert.ok(entry.at >= entries[index - 1].at);
    }
  }
});

test('legal play visits every wave, preserves each spawn schedule, and wins only after all 31 real enemies resolve', () => {
  const byWave = new Map<number, {time: number; type: string}[]>();
  const seen = new Set<string>();
  const gaps = new Set<number>();
  let lastWave = 0;
  let pendingOnEmptyBoard = 0;
  const result = playBattle(beginBattle(), {onSnapshot(state) {
    if (state.wave !== lastWave) {
      assert.equal(state.wave, lastWave + 1);
      lastWave = state.wave;
      assert.equal(state.waveCheckpoint!.spawned, 1 + WAVES.slice(0, state.wave - 1).flat().length);
      byWave.set(state.wave, []);
    }
    for (const enemy of state.enemies) if (!seen.has(enemy.id)) {
      seen.add(enemy.id);
      byWave.get(state.wave)!.push({time: state.waveTime, type: enemy.type});
      assert.equal(enemy.training, undefined);
    }
    if (state.enemies.length === 0 && state.spawnIndex < WAVES[state.wave - 1].length) {
      pendingOnEmptyBoard++;
      assert.equal(state.phase, 'battle');
      assert.equal(state.nextWaveIn, null, 'future entries in the same wave must not start the gap');
    }
    if (state.nextWaveIn !== null) {
      gaps.add(state.wave);
      assert.equal(state.phase, 'battle');
      assert.ok(state.wave < 10);
      assert.equal(state.enemies.length, 0);
      assert.equal(state.spawnIndex, WAVES[state.wave - 1].length);
      assert.ok(state.nextWaveIn > 0 && state.nextWaveIn <= 5);
    }
    if (state.wave < 10) assert.notEqual(state.phase, 'won');
  }});
  assert.equal(result.state.phase, 'won');
  assert.equal(result.state.wave, 10);
  assert.equal(result.state.spawned, 32);
  assert.equal(result.state.defeated + result.state.escaped, 32);
  assert.equal(result.state.enemies.length, 0);
  assert.equal(result.state.spawnIndex, 5);
  assert.equal(result.state.nextWaveIn, null);
  assert.equal(seen.size, 31);
  assert.ok(pendingOnEmptyBoard > 0);
  assert.deepEqual([...gaps], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const [wave, actual] of byWave) {
    const expected = WAVES[wave - 1];
    assert.equal(actual.length, expected.length);
    actual.forEach((entry, index) => {
      assert.equal(entry.type, expected[index].type);
      closeTo(entry.time, Math.max(CONFIG.STEP, expected[index].at));
    });
  }
});

for (const speed of [0.5, 1, 2] as PlaybackSpeed[]) test(`${speed}x wave gap consumes exactly five simulation seconds and pause sources freeze it`, () => {
  const initial = act(firstGap(), {type: 'SET_SPEED', speed});
  for (const stopped of [act(initial, {type: 'PAUSE'}), act(initial, {type: 'OPEN_BAG'}), {...initial, externallyPaused: true}]) {
    assert.equal(advanceGame(stopped, 30), stopped);
    assert.equal(stopped.nextWaveIn, 5);
    assert.equal(stopped.wave, 1);
  }
  const paused = act(initial, {type: 'PAUSE'});
  const bag = act(paused, {type: 'OPEN_BAG'});
  const closed = act(bag, {type: 'CLOSE_BAG'});
  assert.equal(closed.paused, true); assert.equal(advanceGame(closed, 30), closed);
  const resumed = act(closed, {type: 'PAUSE'});
  const almost = advanceGame(resumed, 4.95 / speed);
  assert.equal(almost.wave, 1); closeTo(almost.nextWaveIn!, 0.05);
  assert.equal(almost.enemies.length, 0);
  const next = advanceGame(almost, 0.05 / speed);
  assert.equal(next.wave, 2); assert.equal(next.nextWaveIn, null);
  closeTo(next.time - initial.time, 5);
  assert.equal(next.enemies.length, 1);
  assert.equal(next.spawned, initial.spawned + 1);
  assert.deepEqual(next.inventory, initial.inventory, 'a wave gap is not a refill');
  for (const cat of next.cats) {
    const before = initial.cats.find(value => value.id === cat.id)!;
    assert.equal(cat.hp, before.hp); assert.equal(cat.energy, before.energy);
  }
});

test('ordinary difficulty tolerates a three-second reaction and moving aim with only the basic loadout', context => {
  let aimingSeconds = 0;
  let previous: CombatState | null = null;
  const result = playBattle(beginBattle({difficulty: 'medium'}), {reactionSeconds: 3, onSnapshot(state) {
    if (previous?.skillAim && state.time > previous.time) aimingSeconds += state.time - previous.time;
    previous = state;
  }});
  assert.equal(result.state.phase, 'won');
  assert.equal(result.reforms, 0); assert.equal(result.state.leaks, 0);
  assert.ok(result.areaCasts >= 3 && result.shieldCasts >= 2);
  assert.ok(aimingSeconds >= result.areaCasts * 3 - 0.01);
  assert.ok(result.healingItems <= 2 && result.energyItems <= 1);
  context.diagnostic(JSON.stringify({difficulty: 'medium', reactionSeconds: 3, seconds: result.battleSeconds,
    shields: result.shieldCasts, areas: result.areaCasts, areaHits: result.areaHits,
    healingItems: result.healingItems, energyItems: result.energyItems, leaks: result.state.leaks}));
});

test('slow difficult play can reform on wave ten and finish with the same empty inventory, without free supplies', context => {
  let observedReform = false;
  const result = playBattle(beginBattle({difficulty: 'high'}), {reactionSeconds: 3, allowReforms: 1,
    onReform(before, after) {
      observedReform = true;
      assert.equal(before.wave, 10); assert.equal(before.leaks, 3);
      assert.deepEqual(before.inventory, {'warm-can': 0, 'bouncy-treat': 0});
      assert.deepEqual(before.waveCheckpoint!.inventory, before.inventory);
      assert.equal(after.phase, 'battle'); assert.equal(after.wave, 10);
      assert.equal(after.leaks, 0); assert.equal(after.reforms, 1);
      assert.equal(after.spawned, before.waveCheckpoint!.spawned);
      assert.deepEqual(after.inventory, before.inventory);
      assert.deepEqual(after.initialInventory, {'warm-can': 2, 'bouncy-treat': 1});
      assert.notEqual(after.inventory, after.waveCheckpoint!.inventory);
      for (const cat of after.cats.filter(cat => cat.combatant)) {
        assert.equal(cat.hp, cat.maxHp);
        assert.equal(cat.energy, 0); assert.equal(cat.shield, 0); assert.equal(cat.energyItemCooldown, 0);
      }
      assert.equal(after.healingCooldown, 0);
    }});
  assert.equal(observedReform, true);
  assert.equal(result.reforms, 1); assert.equal(result.state.phase, 'won');
  assert.equal(result.state.spawned, 32); assert.equal(result.state.defeated + result.state.escaped, 32);
  assert.ok(result.state.leaks < 3);
  assert.equal(result.healingItems, 2); assert.equal(result.energyItems, 1);
  assert.deepEqual(result.state.inventory, {'warm-can': 0, 'bouncy-treat': 0});
  assert.ok(result.battleSeconds < 180);
  context.diagnostic(JSON.stringify({difficulty: 'high', reactionSeconds: 3, seconds: result.battleSeconds,
    reforms: result.reforms, shields: result.shieldCasts, areas: result.areaCasts, areaHits: result.areaHits,
    healingItems: result.healingItems, energyItems: result.energyItems, leaksAfterReform: result.state.leaks}));
});
