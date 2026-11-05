import assert from 'node:assert/strict';
import test from 'node:test';
import {CAT_DEFINITIONS, CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, RULES, SKILLS, TOTAL_MINIONS, WAVES} from '../../web/src/modules/battle/chapter/config.ts';
import {advanceChapter, createChapterBattle, dispatchChapter, getAttackCells, getBossCells, getBossDistance, getChapterSpeed, getDeployError, getSkillCells, isChapterCell, isDeployableCell} from '../../web/src/modules/battle/chapter/engine.ts';
import type {ChapterAction, ChapterState} from '../../web/src/modules/battle/chapter/types.ts';
import {playChapter} from './chapter-helpers.ts';

const start = () => dispatchChapter(createChapterBattle(), {type: 'START'});
function quiet(): ChapterState {
  const state = start();
  state.wave = WAVES.length; state.spawnIndex = WAVES.at(-1)!.length; state.spawned = TOTAL_MINIONS;
  state.enemies = []; state.boss.cooldown = 999; state.boss.skillCooldown = 999;
  for (const cat of state.cats) cat.cooldown = 999;
  return state;
}

test('compact chapter has 26 real cells, three entrances, four boss cells and exactly the four named cats', () => {
  const state = createChapterBattle();
  assert.equal(MAP.columns, 10); assert.equal(CELLS.length, 26); assert.equal(isChapterCell({x: 7, y: 1}), false);
  assert.deepEqual(state.cats.map(cat => cat.name), ['绒绒', '斑斑', '团子', '点点']);
  assert.equal(CAT_DEFINITIONS.tuanzi.breed, '橘猫'); assert.equal(CAT_DEFINITIONS.diandian.breed, '暹罗猫');
  assert.equal(CAT_DEFINITIONS.guard.breed, '奶牛猫');
  assert.equal(CELLS.filter(cell => isDeployableCell(cell)).length, 15);
  for (const cell of [...MAP.obstacles, ...MAP.spawns, MAP.goal, ...MAP.bossCells]) assert.equal(isDeployableCell(cell), false);
  for (const cat of state.cats) assert.equal(getDeployError(state, cat.id, cat), null);
  assert.equal(TOTAL_MINIONS, 31); assert.equal(WAVES.length, 8);
  assert.equal('inventory' in state, false); assert.equal('usedSupplies' in state, false);
  assert.throws(() => createChapterBattle({difficulty: 'wild' as never}));
});

test('original two cat abilities stay intact and attack/skill geometry clips to real cells', () => {
  assert.equal(CAT_DEFINITIONS.caster.maxHp, 80); assert.equal(CAT_DEFINITIONS.caster.damage, 20);
  assert.equal(CAT_DEFINITIONS.guard.maxHp, 240); assert.equal(CAT_DEFINITIONS.guard.block, 2);
  assert.equal(SKILLS.caster.damage, 45); assert.equal(SKILLS.guard.shield, 60);
  const state = createChapterBattle(), caster = state.cats[0], guard = state.cats[1];
  assert.equal(getAttackCells(caster).some(cell => cell.x < caster.x), false);
  assert.deepEqual(getAttackCells(guard), [{x: 5, y: 3}, {x: 6, y: 3}, {x: 5, y: 4}]);
  assert.deepEqual(getSkillCells(caster, {x: 3, y: 1}), [{x: 3, y: 1}, {x: 3, y: 2}, {x: 3, y: 0}]);
  assert.deepEqual(getSkillCells(caster, {x: 4, y: 1}), []);
});

test('legal swaps preserve combat state while obstacles, spawn, boss and enemy occupied cells reject moves', () => {
  let state = createChapterBattle();
  Object.assign(state.cats[0], {hp: 60, energy: 70, cooldown: .4, shield: 20, shieldRemaining: 3});
  state = dispatchChapter(state, {type: 'MOVE_CAT', catId: 'caster', x: 5, y: 4});
  assert.equal(state.lastAction?.ok, true); assert.equal(state.cats.find(cat => cat.id === 'tuanzi')!.x, 3);
  assert.deepEqual([state.cats[0].hp, state.cats[0].energy, state.cats[0].cooldown, state.cats[0].shield], [60, 70, .4, 20]);
  for (const cell of [...MAP.obstacles, ...MAP.spawns, MAP.goal, ...MAP.bossCells, {x: 10, y: 3}]) assert.ok(getDeployError(state, 'caster', cell));
  state = advanceChapter(dispatchChapter(state, {type: 'START'}), .05);
  assert.ok(getDeployError(state, 'caster', {x: Math.round(state.enemies[0].x), y: Math.round(state.enemies[0].y)}));
});

test('energy automatically grows without attacks, caps at 100 and obeys the one simulation clock', () => {
  const base = quiet();
  const grown = advanceChapter(base, 4);
  assert.equal(grown.cats.every(cat => cat.energy === 20 && cat.attacks === 0), true);
  const full = advanceChapter(grown, 30); assert.equal(full.cats.every(cat => cat.energy === 100), true);
  const twice = advanceChapter(dispatchChapter(base, {type: 'SET_SPEED', speed: 2}), 4);
  assert.equal(twice.cats[0].energy, 40);
  const inspection = advanceChapter(dispatchChapter(base, {type: 'INSPECT', catId: 'caster'}), 4);
  assert.equal(inspection.cats[0].energy, 10);
  for (const action of [{type: 'PAUSE', paused: true}, {type: 'SET_EXTERNAL_PAUSE', paused: true}, {type: 'SET_UI_PAUSE', paused: true}] as const) {
    const paused = dispatchChapter(base, action); assert.equal(getChapterSpeed(paused), 0); assert.equal(advanceChapter(paused, 20), paused);
  }
  assert.equal(advanceChapter(createChapterBattle(), 30).cats[0].energy, 0);
});

test('ordinary attacks do not add energy and a spent skill recharges by time without a skill cooldown', () => {
  let state = start(); state.cats[3].energy = 100;
  state = dispatchChapter(state, {type: 'CAST_SKILL', catId: 'diandian'}); assert.equal(state.cats[3].energy, 0);
  state = advanceChapter(state, 1);
  assert.ok(state.cats[3].attacks > 0); assert.equal(state.cats[3].energy, 5);
  assert.equal(dispatchChapter(state, {type: 'CAST_SKILL', catId: 'diandian'}).lastAction?.ok, false);
});

test('four skills perform real effects once and cannot bypass pause or invalid targeting', () => {
  let state = start(); for (const cat of state.cats) {cat.energy = 100; cat.hp -= 20;}
  const before = state.boss.hp;
  for (const id of ['guard', 'tuanzi', 'diandian'] as const) {
    state = dispatchChapter(state, {type: 'CAST_SKILL', catId: id}); assert.equal(state.lastAction?.ok, true); assert.equal(state.cats.find(cat => cat.id === id)!.energy, 0);
  }
  assert.equal(state.cats[1].shield, 60); assert.equal(before - state.boss.hp, 120);
  assert.equal(state.cats.every(cat => cat.hp === cat.maxHp), true);
  state = dispatchChapter(state, {type: 'SELECT_SKILL', catId: 'caster'});
  state = dispatchChapter(state, {type: 'AIM_SKILL', x: -1, y: -1}); assert.equal(state.aim?.target, null);
  assert.equal(dispatchChapter(state, {type: 'CAST_SKILL', catId: 'caster'}).lastAction?.ok, false);
  state = dispatchChapter(state, {type: 'CAST_SKILL', catId: 'caster', target: MAP.boss}); assert.equal(state.lastAction?.ok, true);
  assert.equal(state.stats.skills, 4);
  state.cats[1].energy = 100; state = dispatchChapter(state, {type: 'PAUSE', paused: true});
  assert.equal(dispatchChapter(state, {type: 'CAST_SKILL', catId: 'guard'}).lastAction?.ok, false);
});

function isolatedBoss(): ChapterState {
  const state = quiet(); state.boss.cooldown = 1.8;
  for (const cat of state.cats) if (cat.id !== 'guard') {cat.status = 'retired'; cat.hp = 0;}
  return state;
}

test('cats remain active below the old rest threshold and retire only at zero with no resurrection', () => {
  let state = isolatedBoss(); state.cats[1].hp = 61;
  state = advanceChapter(state, 1.8); assert.equal(state.cats[1].hp, 51); assert.equal(state.cats[1].status, 'active');
  state.cats[3].status = 'active'; state.cats[3].hp = state.cats[3].maxHp; state.cats[3].energy = 100;
  state.cats[1].hp = 10;
  state = advanceChapter(state, 1.8); assert.equal(state.cats[1].hp, 0); assert.equal(state.cats[1].status, 'retired');
  state = dispatchChapter(state, {type: 'CAST_SKILL', catId: 'diandian'}); assert.equal(state.lastAction?.ok, true);
  assert.equal(state.cats[1].hp, 0); assert.equal(state.cats[1].status, 'retired');
  assert.equal(dispatchChapter(state, {type: 'MOVE_CAT', catId: 'guard', x: 2, y: 3}).lastAction?.ok, false);
  assert.equal(dispatchChapter(state, {type: 'CAST_SKILL', catId: 'guard'}).lastAction?.ok, false);
  assert.deepEqual(getAttackCells(state.cats[1]), []); assert.deepEqual(getSkillCells(state.cats[1]), []);
  state = advanceChapter(state, 1); assert.equal(state.cats[1].energy, 0);
  const reset = createChapterBattle(); assert.equal(reset.cats.every(cat => cat.status === 'active' && cat.hp === cat.maxHp), true);
});

test('old item actions are rejected and cannot mutate health or energy', () => {
  const state = start(); state.cats[0].hp = 10;
  const next = dispatchChapter(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'caster'} as unknown as ChapterAction);
  assert.equal(next.lastAction?.ok, false); assert.deepEqual(next.cats, state.cats);
});

test('all cats retired means defeat immediately and retreat also finishes the current attempt', () => {
  let state = start(); for (const cat of state.cats) {cat.status = 'retired'; cat.hp = 0;}
  state = advanceChapter(state, .05); assert.equal(state.phase, 'lost'); assert.match(state.logs.at(-1)!.text, /所有伙伴/);
  assert.equal(dispatchChapter(start(), {type: 'RETREAT'}).phase, 'lost');
});

test('all four boss cells target one HP pool without multiplying area damage', () => {
  const base = start(); assert.deepEqual(getBossCells(base.boss), MAP.bossCells);
  for (const target of [{x: 6, y: 3}, {x: 9, y: 3}, {x: 6, y: 4}, {x: 9, y: 4}, {x: 7, y: 4}]) {
    const state = structuredClone(base); state.cats[0].energy = 100;
    const hit = dispatchChapter(state, {type: 'CAST_SKILL', catId: 'caster', target});
    assert.equal(state.boss.hp - hit.boss.hp, 45);
  }
  const state = structuredClone(base); state.cats[2].energy = 100;
  const hit = dispatchChapter(state, {type: 'CAST_SKILL', catId: 'tuanzi'}); assert.equal(state.boss.hp - hit.boss.hp, 120);
});

test('boss basic attacks use nearest footprint range, 1.8 second timing and shields before HP', () => {
  let state = isolatedBoss(); assert.equal(getBossDistance(state.boss, {x: 6, y: 4}), 1);
  state.cats[1].shield = 6; state.cats[1].shieldRemaining = 8;
  state = advanceChapter(state, 1.75); assert.equal(state.boss.attacks, 0);
  state = advanceChapter(state, .05); assert.equal(state.boss.attacks, 1); assert.equal(state.cats[1].hp, 236);
  assert.equal(state.cats[1].shield, 0); assert.ok(state.effects.some(effect => effect.kind === 'boss-attack'));
  state = advanceChapter(state, 1.8); assert.equal(state.boss.attacks, 2); assert.equal(state.cats[1].hp, 226);
});

test('boss ignores retired and out-of-range cats, and basics do not overlap slam phases', () => {
  let state = dispatchChapter(isolatedBoss(), {type: 'MOVE_CAT', catId: 'guard', x: 3, y: 3});
  state = advanceChapter(state, 2); assert.equal(state.boss.attacks, 0);
  state = dispatchChapter(state, {type: 'MOVE_CAT', catId: 'guard', x: 4, y: 3});
  state = advanceChapter(state, .05); assert.equal(state.boss.attacks, 1);
  for (const phase of ['windup', 'recovery'] as const) {
    state = isolatedBoss(); state.boss.phase = phase; state.boss.cooldown = 0;
    state = advanceChapter(state, 1); assert.equal(state.boss.attacks, 0); assert.equal(state.cats[1].hp, 240);
  }
});

test('boss slam locks real cells, allows a reaction window and misses cats moved out before impact', () => {
  let state = advanceChapter(start(), 10.05); assert.equal(state.boss.phase, 'windup');
  const cells = structuredClone(state.boss.targetCells);
  state = advanceChapter(state, .5); assert.deepEqual(state.boss.targetCells, cells);
  for (const cat of [...state.cats]) if (cells.some(cell => cell.x === cat.x && cell.y === cat.y)) {
    const target = CELLS.find(cell => !cells.some(d => d.x === cell.x && d.y === cell.y) && !state.cats.some(c => c.status === 'active' && c.x === cell.x && c.y === cell.y) && !getDeployError(state, cat.id, cell));
    assert.ok(target); state = dispatchChapter(state, {type: 'MOVE_CAT', catId: cat.id, ...target});
  }
  state = advanceChapter(state, RULES.bossSlamWindup);
  assert.equal(state.boss.slams, 1); assert.equal(state.stats.dodgedSlams, 1); assert.equal(state.boss.phase, 'recovery');
});

test('victory needs every wave handled and the boss defeated; the third leak takes priority', () => {
  let state = start(); state.cats[0].energy = 100; state.boss.hp = 1;
  state = dispatchChapter(state, {type: 'CAST_SKILL', catId: 'caster', target: MAP.boss});
  assert.equal(state.boss.phase, 'defeated'); assert.equal(advanceChapter(state, .05).phase, 'battle');
  const final = quiet(); final.defeated = TOTAL_MINIONS; assert.equal(advanceChapter(final, .05).phase, 'battle');
  final.boss.hp = 0; final.boss.phase = 'defeated'; final.leaks = 2; final.defeated = TOTAL_MINIONS - 2;
  assert.equal(advanceChapter(final, .05).phase, 'won');
  final.enemies = [{...ENEMY_DEFINITIONS.scout, id: 'escape', x: 0, y: 3, kind: 'scout', route: 'upper', hp: 100, cooldown: 0, blockedBy: null}];
  assert.equal(advanceChapter(final, .05).phase, 'lost');
});

function confluence(): ChapterState {
  const state = quiet(); state.boss.phase = 'defeated'; state.boss.hp = 0;
  for (const cat of state.cats) {cat.status = 'retired'; cat.hp = 0;}
  Object.assign(state.cats[1], {status: 'active', hp: 240, x: 3, y: 3});
  state.enemies = [
    {id: 'held-right', x: 3.43, y: 3, route: 'upper' as const},
    {id: 'held-branch', x: 3, y: 2.57, route: 'branch' as const},
    {id: 'overflow', x: 3, y: 2.5, route: 'branch' as const},
  ].map(enemy => ({...ENEMY_DEFINITIONS.scout, ...enemy, kind: 'scout', hp: 100, damage: 0, cooldown: 999, blockedBy: null}));
  return state;
}

test('D4 confluence retains two blocked contacts and only the overflow passes', () => {
  let state = advanceChapter(confluence(), .05);
  const held = state.enemies.filter(enemy => enemy.blockedBy === 'guard').map(({id, x, y}) => ({id, x, y})); assert.equal(held.length, 2);
  for (let i = 0; i < 240; i++) {state = advanceChapter(state, .05); assert.deepEqual(state.enemies.filter(enemy => enemy.blockedBy === 'guard').map(({id, x, y}) => ({id, x, y})), held);}
  assert.equal(state.leaks, 1);
});

test('moving or zero-HP retirement immediately releases horizontal and vertical blocking', () => {
  const blocked = advanceChapter(confluence(), .05);
  let moved = dispatchChapter(blocked, {type: 'MOVE_CAT', catId: 'guard', x: 4, y: 3});
  assert.equal(moved.enemies.every(enemy => enemy.blockedBy === null), true);
  moved = advanceChapter(moved, .1); assert.ok(moved.enemies[0].x < 3.42); assert.ok(moved.enemies[1].y > 2.58);
  const hurt = structuredClone(blocked); hurt.cats[1].hp = 2; hurt.enemies[0].damage = 2; hurt.enemies[0].cooldown = 0;
  const retired = advanceChapter(hurt, .05); assert.equal(retired.cats[1].status, 'retired'); assert.equal(retired.cats[1].blockedCount, 0);
  assert.equal(retired.enemies.every(enemy => enemy.blockedBy === null), true);
});

test('A4 spawns real downward enemies that turn left at D4 when unblocked', () => {
  let state = createChapterBattle();
  state = dispatchChapter(state, {type: 'MOVE_CAT', catId: 'caster', x: 6, y: 3});
  state = advanceChapter(dispatchChapter(state, {type: 'START'}), .05);
  const id = state.enemies[0].id; assert.equal(state.enemies[0].x, 3); assert.equal(state.enemies[0].route, 'branch');
  let down = false, turn = false;
  for (let i = 0; i < 200 && state.enemies.some(enemy => enemy.id === id); i++) {
    state = advanceChapter(state, .1); const enemy = state.enemies.find(enemy => enemy.id === id); if (!enemy) break;
    if (enemy.x === 3 && enemy.y > 1 && enemy.y < 3) down = true;
    if (enemy.y === 3 && enemy.x < 3) turn = true;
  }
  assert.equal(down, true); assert.equal(turn, true); assert.ok(state.leaks >= 1);
});

test('ignoring all skills and boss tells does not automatically clear the encounter', () => {
  const result = playChapter('medium', {dodge: false, skills: false});
  assert.equal(result.state.phase, 'lost'); assert.ok(result.state.boss.hp > 0); assert.equal(result.state.stats.skills, 0);
});

for (const difficulty of ['low', 'medium', 'high'] as const) test(`${difficulty}: four cats can finish eight waves and boss using only ordinary legal actions`, t => {
  const seen = new Set<string>();
  const result = playChapter(difficulty, {onSnapshot(state) {
    assert.equal(state.boss.maxHp, Math.round(RULES.bossHp * DIFFICULTIES[difficulty].hpMultiplier));
    for (const enemy of state.enemies) if (!seen.has(enemy.id)) {seen.add(enemy.id); assert.equal(enemy.maxHp, Math.round(ENEMY_DEFINITIONS[enemy.kind].maxHp * DIFFICULTIES[difficulty].hpMultiplier));}
  }});
  t.diagnostic(JSON.stringify({difficulty, outcome: result.state.phase, seconds: Math.round(result.state.elapsed), leaks: result.state.leaks, skills: result.state.stats.skills, boss: result.state.boss.hp}));
  assert.equal(result.state.phase, 'won'); assert.equal(seen.size, TOTAL_MINIONS); assert.equal(result.state.spawned, TOTAL_MINIONS);
  assert.equal(result.state.boss.phase, 'defeated'); assert.ok(result.state.leaks < RULES.maxLeaks); assert.ok(result.state.stats.skills >= 4);
});
