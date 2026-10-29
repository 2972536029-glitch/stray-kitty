import test from 'node:test';
import assert from 'node:assert/strict';
import {act, advanceGame, createGame, getBattleSpeed} from '../../web/src/modules/battle/l00/engine.ts';
import {CONFIG, ENEMY_TYPES} from '../../web/src/modules/battle/l00/config.ts';
import type {CombatState} from '../../web/src/modules/battle/l00/state.ts';
import {finishSkillTutorial, playBattle} from './helpers.ts';

const cat = (s: CombatState, id: string) => s.cats.find(cat => cat.id === id)!;
function until(s: CombatState, phase: CombatState['phase']) {
  for (let i = 0; i < 4000 && s.phase !== phase; i++) s = advanceGame(s, .05);
  assert.equal(s.phase, phase); return s;
}
const placement = () => until(act(createGame(), {type: 'START'}), 'teach_position');
function encounter() {
  let s = act(placement(), {type: 'MOVE_CAT', catId: 'caster', x: 3, y: 0});
  s = act(s, {type: 'BEGIN_SKILL_PRACTICE'});
  return until(s, 'teach_move');
}
function liveMovement() {return act(encounter(), {type: 'MOVE_CAT', catId: 'guard', x: 4, y: 1});}
function charging() {
  let s = act(liveMovement(), {type: 'MOVE_CAT', catId: 'caster', x: 3, y: 2});
  return act(s, {type: 'MOVE_CAT', catId: 'caster', x: 3, y: 0});
}

test('initial placement accepts distant legal cells and swaps instead of requiring the recommendation', () => {
  const initial = placement();
  for (const target of [{x: 0, y: 0}, {x: 6, y: 2}, {x: 1, y: 1}, {x: 2, y: 1}]) {
    const next = act(initial, {type: 'MOVE_CAT', catId: 'caster', ...target});
    assert.equal(next.lastAction?.ok, true);
    assert.equal(next.phase, 'teach_energy');
    assert.deepEqual({x: cat(next, 'caster').x, y: cat(next, 'caster').y}, target);
    assert.equal(cat(next, 'caster').hp, cat(initial, 'caster').hp);
  }
  for (const target of [{x: 0, y: 1}, {x: 6, y: 1}, {x: 7, y: 0}, {x: 3, y: 1}]) {
    const next = act(initial, {type: 'MOVE_CAT', catId: 'caster', ...target});
    assert.equal(next.lastAction?.ok, false); assert.equal(next.phase, initial.phase);
  }
  assert.equal(act(initial, {type: 'MOVE_CAT', catId: 'hero', x: 1, y: 1}).lastAction?.ok, false);
});

test('the blocking explanation pauses a real encounter, then movement practice runs it at half speed', () => {
  const initial = encounter();
  assert.equal(initial.wave, 1); assert.equal(initial.spawned, 2);
  assert.ok(initial.enemies.some(enemy => enemy.x <= CONFIG.VISIBLE_MAX_X));
  assert.ok(initial.enemies.every(enemy => !enemy.training && !enemy.scripted && enemy.speed > 0 && enemy.damage > 0));
  assert.equal(advanceGame(initial, 30), initial);
  const invalid = act(initial, {type: 'MOVE_CAT', catId: 'guard', x: 6, y: 1});
  assert.equal(invalid.lastAction?.ok, false); assert.equal(invalid.phase, 'teach_move');
  assert.deepEqual(invalid.enemies, initial.enemies);
  const moved = act(initial, {type: 'MOVE_CAT', catId: 'guard', x: 0, y: 2});
  assert.equal(moved.lastAction?.ok, true); assert.equal(moved.phase, 'teach_live_move');
  assert.equal(moved.waveTime, initial.waveTime); assert.equal(moved.time, initial.time);
  assert.deepEqual(moved.enemies, initial.enemies); assert.equal(moved.tutorialProgress.moved, false);
  const running = advanceGame(moved, 1);
  assert.equal(running.phase, 'teach_live_move');
  assert.ok(Math.abs(running.time - moved.time - .5) < 1e-8);
  assert.ok(Math.abs(running.waveTime - moved.waveTime - .5) < 1e-8);
  assert.ok(running.enemies[0].x < moved.enemies[0].x);
  assert.equal(cat(running, 'guard').energy - cat(moved, 'guard').energy, CONFIG.ENERGY_PER_SECOND * .5);
});

test('live movement requires a second successful operation, accepting either cat and swaps', () => {
  const initial = liveMovement();
  for (const action of [
    {type: 'MOVE_CAT', catId: 'guard', x: 4, y: 1},
    {type: 'MOVE_CAT', catId: 'guard', x: 6, y: 1},
    {type: 'MOVE_CAT', catId: 'hero', x: 1, y: 1},
    {type: 'INSPECT_CAT', catId: 'caster'},
  ]) {
    const next = act(initial, action);
    assert.equal(next.phase, 'teach_live_move'); assert.equal(next.tutorialProgress.moved, false);
    assert.equal(next.time, initial.time); assert.deepEqual(next.cats, initial.cats);
  }
  for (const action of [
    {type: 'MOVE_CAT', catId: 'guard', x: 0, y: 2},
    {type: 'MOVE_CAT', catId: 'caster', x: 6, y: 0},
    {type: 'MOVE_CAT', catId: 'caster', x: 4, y: 1},
  ]) {
    const next = act(initial, action);
    assert.equal(next.lastAction?.ok, true); assert.equal(next.phase, 'skill_charge');
    assert.equal(next.tutorialProgress.moved, true);
    assert.equal(next.waveTime, initial.waveTime); assert.equal(next.spawned, initial.spawned);
    assert.deepEqual(next.enemies, initial.enemies);
  }
});

test('live movement speed stays at half speed while manual and host pauses still freeze it', () => {
  const initial = liveMovement();
  for (const speed of [.5, 1, 2] as const) {
    const s = act(initial, {type: 'SET_SPEED', speed});
    assert.equal(getBattleSpeed(s), .5);
    assert.equal(getBattleSpeed(act(s, {type: 'INSPECT_CAT', catId: 'caster'})), .5);
    const paused = act(s, {type: 'PAUSE'});
    assert.equal(paused.paused, true); assert.equal(getBattleSpeed(paused), 0);
    assert.equal(advanceGame(paused, 10), paused);
    const rejected = act(paused, {type: 'MOVE_CAT', catId: 'caster', x: 3, y: 2});
    assert.equal(rejected.lastAction?.ok, false); assert.equal(rejected.phase, 'teach_live_move');
    assert.equal(rejected.paused, true);
    assert.equal(getBattleSpeed(act(paused, {type: 'PAUSE'})), .5);
    const hostPaused = {...s, externallyPaused: true};
    assert.equal(getBattleSpeed(hostPaused), 0); assert.equal(advanceGame(hostPaused, 10), hostPaused);
    assert.equal(act(hostPaused, {type: 'MOVE_CAT', catId: 'caster', x: 3, y: 2}).lastAction?.ok, false);
    const completed = act(s, {type: 'MOVE_CAT', catId: 'caster', x: 3, y: 2});
    assert.equal(getBattleSpeed(completed), speed);
  }
});

test('free movement and swaps during charging preserve energy, health and shields', () => {
  let s = liveMovement();
  Object.assign(cat(s, 'guard'), {energy: 37, shield: 42, shieldRemaining: 6});
  const previous = structuredClone(cat(s, 'guard'));
  s = act(s, {type: 'MOVE_CAT', catId: 'guard', x: 6, y: 2});
  assert.equal(s.lastAction?.ok, true); assert.equal(s.phase, 'skill_charge');
  for (const key of ['energy', 'hp', 'shield', 'shieldRemaining'] as const) assert.equal(cat(s, 'guard')[key], previous[key]);
  s = act(s, {type: 'MOVE_CAT', catId: 'guard', x: 3, y: 0});
  assert.equal(s.lastAction?.ok, true); assert.equal(cat(s, 'caster').x, 6); assert.equal(cat(s, 'caster').y, 2);
  assert.equal(s.phase, 'skill_charge');
});

test('full energy waits for a real visible target and never creates a training enemy', () => {
  let s = charging();
  s.enemies = []; s.nextWaveIn = 5;
  for (const c of s.cats.filter(c => c.combatant)) c.energy = 100;
  s = advanceGame(s, .1); assert.equal(s.phase, 'skill_charge'); assert.equal(s.enemies.length, 0);
  s.enemies = [{...ENEMY_TYPES.scout, id: 'real', type: 'scout', x: 5.9, y: 1, hp: 75, blockedBy: null, cooldown: 0}];
  s = advanceGame(s, .05); assert.equal(s.phase, 'teach_guard_skill');
  s = act(s, {type: 'CAST_SKILL', catId: 'guard'}); assert.equal(s.phase, 'teach_caster_skill');
  assert.equal(advanceGame(s, 30), s);
  const before = structuredClone(s);
  const miss = act(s, {type: 'CAST_SKILL', catId: 'caster', x: 0, y: 0});
  assert.equal(miss.lastAction?.ok, false); assert.deepEqual(miss.enemies, before.enemies); assert.equal(cat(miss, 'caster').energy, 100);
  const hit = act(s, {type: 'CAST_SKILL', catId: 'caster', x: 6, y: 1});
  assert.equal(hit.lastAction?.ok, true); assert.equal(hit.phase, 'battle');
  assert.equal(hit.enemies[0].hp, before.enemies[0].hp - 45);
  assert.equal(hit.spawned, before.spawned); assert.equal(hit.wave, before.wave); assert.equal(hit.waveTime, before.waveTime);
});

test('a retired tutor cat cannot leave the player trapped at an impossible instruction', () => {
  for (const id of ['guard', 'caster']) {
    let s = charging();
    Object.assign(cat(s, id), {hp: 0, status: 'retired', x: -1, y: -1});
    const other = id === 'guard' ? 'caster' : 'guard'; cat(s, other).energy = 100;
    s = advanceGame(s, .05);
    assert.equal(s.phase, id === 'guard' ? 'teach_caster_skill' : 'teach_guard_skill');
    const target = s.enemies.find(enemy => enemy.x <= 6)!;
    s = act(s, other === 'guard' ? {type: 'CAST_SKILL', catId: other} : {type: 'CAST_SKILL', catId: other, x: Math.round(target.x), y: Math.round(target.y)});
    assert.equal(s.phase, 'battle'); assert.equal(cat(s, id).status, 'retired');
  }
});

test('live movement can genuinely fail without a second move; teaching never replaces defeat', () => {
  let s = liveMovement();
  s.leaks = 2; s.enemies = [{...ENEMY_TYPES.scout, id: 'last-leak', type: 'scout', x: .001, y: 1, hp: 75, blockedBy: null, cooldown: 0}];
  s = advanceGame(s, .1); assert.equal(s.phase, 'failed'); assert.equal(s.leaks, 3);
  assert.equal(s.tutorialProgress.moved, false);
  assert.equal(advanceGame(s, 30), s);
});

test('all three difficulties remain winnable through live teaching and ordinary manual skill play', () => {
  for (const difficulty of ['low', 'medium', 'high'] as const) {
    let s = until(act(createGame({difficulty}), {type: 'START'}), 'teach_position');
    s = act(s, {type: 'MOVE_CAT', catId: 'caster', x: 3, y: 0});
    s = finishSkillTutorial(s);
    const result = playBattle(s);
    assert.equal(result.state.phase, 'won', difficulty);
    assert.equal(result.state.wave, 6); assert.equal(result.state.spawned, 18);
    assert.equal(result.state.defeated + result.state.escaped, 18);
  }
});
