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

test('six waves alternate groups and relief, with immutable entries and derived totals', () => {
  assert.deepEqual(WAVES.map(wave => wave.length), [2, 3, 3, 2, 4, 3]);
  assert.equal(WAVES.flat().length, 17);
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

test('legal play visits every wave, preserves each spawn schedule, and wins only after all 17 real enemies resolve', () => {
  const byWave = new Map<number, {time: number; type: string}[]>();
  const seen = new Set<string>();
  const gaps = new Set<number>();
  let lastWave = 0;
  let pendingOnEmptyBoard = 0;
  const result = playBattle(beginBattle(), {onSnapshot(state) {
    if (state.wave !== lastWave) {
      assert.equal(state.wave, lastWave + 1);
      lastWave = state.wave;
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
      assert.ok(state.wave < CONFIG.TOTAL_WAVES);
      assert.equal(state.enemies.length, 0);
      assert.equal(state.spawnIndex, WAVES[state.wave - 1].length);
      assert.ok(state.nextWaveIn > 0 && state.nextWaveIn <= 5);
    }
    if (state.wave < CONFIG.TOTAL_WAVES) assert.notEqual(state.phase, 'won');
  }});
  assert.equal(result.state.phase, 'won');
  assert.equal(result.state.wave, 6);
  assert.equal(result.state.spawned, 18);
  assert.equal(result.state.defeated + result.state.escaped, 18);
  assert.equal(result.state.enemies.length, 0);
  assert.equal(result.state.spawnIndex, 3);
  assert.equal(result.state.nextWaveIn, null);
  assert.equal(seen.size, 17);
  assert.ok(pendingOnEmptyBoard > 0);
  assert.deepEqual([...gaps], [1, 2, 3, 4, 5]);
  for (const [wave, actual] of byWave) {
    const expected = WAVES[wave - 1];
    assert.equal(actual.length, expected.length);
    actual.forEach((entry, index) => {
      assert.equal(entry.type, expected[index].type);
      closeTo(entry.time, Math.max(CONFIG.STEP, expected[index].at));
    });
  }
});

for (const speed of [0.5, 1, 2] as PlaybackSpeed[]) test(`${speed}x keeps an exact five-second simulation gap, charging energy while pause freezes it`, () => {
  const initial = act(firstGap(), {type: 'SET_SPEED', speed});
  const paused = act(initial, {type: 'PAUSE'});
  assert.equal(paused.paused, true);
  assert.equal(advanceGame(paused, 30), paused, 'manual pause preserves the complete gap state');
  const external = {...initial, externallyPaused: true};
  assert.equal(advanceGame(external, 30), external, 'host pause also preserves the complete gap state');

  const resumed = act(paused, {type: 'PAUSE'});
  const beforeEnd = advanceGame(resumed, 4.95 / speed);
  assert.equal(beforeEnd.wave, 1);
  closeTo(beforeEnd.nextWaveIn!, 0.05);
  closeTo(beforeEnd.time - initial.time, 4.95);
  assert.equal(beforeEnd.enemies.length, 0);
  assert.equal(beforeEnd.spawned, initial.spawned);

  const afterEnd = advanceGame(beforeEnd, 0.05 / speed);
  assert.equal(afterEnd.wave, 2);
  assert.equal(afterEnd.nextWaveIn, null);
  closeTo(afterEnd.time - initial.time, 5);
  assert.equal(afterEnd.spawned, initial.spawned + 1);
  assert.equal(afterEnd.spawnIndex, 1);
  assert.equal(afterEnd.enemies.length, 1);
  for (const cat of afterEnd.cats) {
    const previous = initial.cats.find(value => value.id === cat.id)!;
    assert.equal(cat.hp, previous.hp, 'wave gaps do not heal or reset cats');
    closeTo(cat.energy, cat.combatant ? Math.min(CONFIG.MAX_ENERGY, previous.energy + 25) : previous.energy);
  }
  assert.equal('inventory' in afterEnd, false);
  assert.equal('waveCheckpoint' in afterEnd, false);
});
