import assert from 'node:assert/strict';
import test from 'node:test';
import {CAT_DEFINITIONS, CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, RULES, SKILLS, TOTAL_MINIONS, WAVES, normalizeLoadout} from '../../web/src/modules/battle/chapter/config.ts';
import {advanceChapter, createChapterBattle, dispatchChapter, getAttackCells, getBossCells, getBossDistance, getChapterSpeed, getDeployError, getItemTargetError, getSkillCells, isChapterCell, isDeployableCell} from '../../web/src/modules/battle/chapter/engine.ts';
import type {ChapterState} from '../../web/src/modules/battle/chapter/types.ts';
import {playChapter} from './chapter-helpers.ts';

test('L01 has the requested convex alley, three garbage obstacles and six distinct temporary combat cats', () => {
  assert.equal(CELLS.length, 30);
  assert.equal(MAP.obstacles.length, 3);
  assert.equal(isChapterCell({x: 9, y: 1}), false);
  assert.equal(isDeployableCell({x: 4, y: 1}), true);
  for (const cell of [...MAP.obstacles, ...MAP.spawns, MAP.goal, ...MAP.bossCells]) assert.equal(isDeployableCell(cell), false);
  assert.equal(MAP.spawns.some(cell => cell.x === 4 && cell.y === 0), true);
  const state = createChapterBattle();
  assert.equal(state.cats.length, 6); assert.equal(new Set(state.cats.map(cat => cat.id)).size, 6);
  assert.equal(state.cats.every(cat => cat.status === 'active' && !getDeployError(state, cat.id, cat)), true);
  assert.deepEqual(state.inventory, {'warm-can': 0, 'bouncy-treat': 0});
  assert.equal(TOTAL_MINIONS, 31);
});

test('chapter loadout has no free baseline and rejects malformed, unknown and over-cap quantities', () => {
  assert.deepEqual(normalizeLoadout({'warm-can': 4, 'bouncy-treat': 2}), {'warm-can': 4, 'bouncy-treat': 2});
  for (const value of [null, [], 1, {'warm-can': -1}, {'warm-can': 0.5}, {'warm-can': 5}, {'bouncy-treat': 3}, {unknown: 1}, {[Symbol('x')]: 1}]) assert.throws(() => normalizeLoadout(value));
  assert.throws(() => createChapterBattle({difficulty: 'wild' as never}));
});

test('existing two cats preserve their stats, directional attacks and skill effects', () => {
  assert.equal(CAT_DEFINITIONS.caster.maxHp, 80); assert.equal(CAT_DEFINITIONS.caster.damage, 20); assert.equal(CAT_DEFINITIONS.caster.interval, 0.8);
  assert.equal(CAT_DEFINITIONS.guard.maxHp, 240); assert.equal(CAT_DEFINITIONS.guard.damage, 8); assert.equal(CAT_DEFINITIONS.guard.block, 2);
  assert.equal(SKILLS.caster.damage, 45); assert.equal(SKILLS.guard.shield, 60); assert.equal(SKILLS.guard.duration, 8);
  const state = createChapterBattle(), guard = state.cats.find(cat => cat.id === 'guard')!, caster = state.cats.find(cat => cat.id === 'caster')!;
  assert.deepEqual(getAttackCells(guard), [{x: 8, y: 3}, {x: 9, y: 3}, {x: 8, y: 4}]);
  assert.equal(getAttackCells(caster).some(cell => cell.x < caster.x), false);
  assert.deepEqual(getSkillCells(caster, {x: 4, y: 1}), [{x: 4, y: 1}, {x: 4, y: 2}, {x: 4, y: 0}]);
  assert.deepEqual(getSkillCells(caster, {x: 5, y: 1}), []);
});

test('legal swaps preserve every resource and illegal cells/enemy-occupied cells are rejected', () => {
  let state = createChapterBattle();
  const cat = state.cats[0]; cat.hp = 60; cat.energy = 70; cat.cooldown = 0.4; cat.shield = 20; cat.shieldRemaining = 3;
  state = dispatchChapter(state, {type: 'MOVE_CAT', catId: 'caster', x: 8, y: 4});
  assert.equal(state.lastAction?.ok, true);
  assert.deepEqual([state.cats[0].hp, state.cats[0].energy, state.cats[0].cooldown, state.cats[0].shield, state.cats[0].shieldRemaining], [60, 70, 0.4, 20, 3]);
  assert.equal(state.cats.find(c => c.id === 'hammer')!.x, 6);
  for (const cell of [...MAP.obstacles, ...MAP.spawns, MAP.goal, ...MAP.bossCells, {x: 10, y: 0}]) assert.equal(dispatchChapter(state, {type: 'MOVE_CAT', catId: 'caster', ...cell}).lastAction?.ok, false);
  state = advanceChapter(dispatchChapter(state, {type: 'START'}), 0.05);
  const cell = {x: Math.round(state.enemies[0].x), y: state.enemies[0].y};
  assert.ok(getDeployError(state, 'caster', cell));
});

test('paused clocks freeze boss windup, cooldowns and waves; temporary speed never overrides pause', () => {
  let state = dispatchChapter(createChapterBattle(), {type: 'START'});
  state = advanceChapter(state, 10.1);
  assert.equal(state.boss.phase, 'windup');
  const before = structuredClone(state);
  state = dispatchChapter(state, {type: 'PAUSE', paused: true});
  state = dispatchChapter(state, {type: 'SET_SPEED', speed: 2});
  assert.equal(getChapterSpeed(state), 0); assert.equal(advanceChapter(state, 10), state);
  assert.equal(state.boss.phaseTime, before.boss.phaseTime);
  state = dispatchChapter(state, {type: 'PAUSE', paused: false});
  state = dispatchChapter(state, {type: 'INSPECT', catId: 'caster'}); assert.equal(getChapterSpeed(state), 0.5);
  state = dispatchChapter(state, {type: 'SET_EXTERNAL_PAUSE', paused: true});
  assert.equal(getChapterSpeed(state), 0); assert.equal(state.inspectedCatId, null);
  assert.equal(advanceChapter(state, 100), state);
});

test('the stationary boss announces a locked slam and only hits cats still in those cells at impact', () => {
  let state = dispatchChapter(createChapterBattle(), {type: 'START'});
  state = advanceChapter(state, 10.05); assert.equal(state.boss.phase, 'windup');
  const cells = structuredClone(state.boss.targetCells), hp = state.cats.map(cat => cat.hp);
  state = advanceChapter(state, 0.5); assert.deepEqual(state.boss.targetCells, cells);
  assert.deepEqual({x: state.boss.x, y: state.boss.y}, MAP.boss);
  // Move all threatened cats with ordinary actions, then let the announced strike land.
  for (const cat of [...state.cats]) if (cells.some(cell => cell.x === cat.x && cell.y === cat.y)) {
    const target = CELLS.find(cell => !cells.some(d => d.x === cell.x && d.y === cell.y)
      && !state.cats.some(c => c.status === 'active' && c.x === cell.x && c.y === cell.y) && !getDeployError(state, cat.id, cell));
    assert.ok(target); state = dispatchChapter(state, {type: 'MOVE_CAT', catId: cat.id, ...target});
  }
  state = advanceChapter(state, RULES.bossSlamWindup);
  assert.equal(state.boss.slams, 1); assert.equal(state.stats.dodgedSlams, 1);
  assert.equal(state.boss.phase, 'recovery'); assert.equal(hp.length, 6);
});

test('all six skills spend energy once, perform real effects and cannot bypass pause or invalid targeting', () => {
  let state = dispatchChapter(createChapterBattle(), {type: 'START'});
  for (const cat of state.cats) {cat.energy = 100; cat.hp -= 20;}
  for (const id of ['guard', 'tabby', 'hammer', 'singer'] as const) {
    state = dispatchChapter(state, {type: 'CAST_SKILL', catId: id}); assert.equal(state.lastAction?.ok, true); assert.equal(state.cats.find(cat => cat.id === id)!.energy, 0);
  }
  assert.equal(state.cats.find(cat => cat.id === 'guard')!.shield, 60);
  assert.equal(state.cats.find(cat => cat.id === 'tabby')!.buffRemaining, 8);
  assert.equal(state.cats.every(cat => cat.hp === cat.maxHp), true);
  for (const id of ['caster', 'frost'] as const) {
    state = dispatchChapter(state, {type: 'SELECT_SKILL', catId: id});
    state = dispatchChapter(state, {type: 'AIM_SKILL', x: -1, y: -1}); assert.equal(state.aim?.target, null);
    const rejected = dispatchChapter(state, {type: 'CAST_SKILL', catId: id}); assert.equal(rejected.lastAction?.ok, false);
    state = dispatchChapter(state, {type: 'CAST_SKILL', catId: id, target: MAP.boss}); assert.equal(state.lastAction?.ok, true);
  }
  assert.equal(state.stats.skills, 6);
  state = dispatchChapter(state, {type: 'PAUSE', paused: true});
  assert.equal(dispatchChapter(state, {type: 'CAST_SKILL', catId: 'guard'}).lastAction?.ok, false);
});

test('items consume only legal effective uses, manual pause is allowed, and resting cats need half health before deployment', () => {
  let state = createChapterBattle({loadout: {'warm-can': 2, 'bouncy-treat': 1}});
  assert.ok(getItemTargetError(state, 'warm-can', 'guard'));
  const guard = state.cats.find(cat => cat.id === 'guard')!; guard.hp = 50; guard.status = 'resting'; guard.energy = 60;
  assert.ok(getDeployError(state, 'guard', {x: 6, y: 3}));
  state = dispatchChapter(state, {type: 'PAUSE', paused: true});
  state = dispatchChapter(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
  assert.equal(state.lastAction?.ok, true); assert.equal(state.cats.find(cat => cat.id === 'guard')!.hp, 110);
  assert.deepEqual(state.usedSupplies, {'warm-can': 1, 'bouncy-treat': 0});
  assert.ok(getDeployError(state, 'guard', {x: 6, y: 3}));
  assert.equal(dispatchChapter(state, {type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'}).lastAction?.ok, false);
  assert.equal(dispatchChapter(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'guard'}).lastAction?.ok, false);
  state = dispatchChapter(state, {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'});
  assert.equal(state.cats[0].energy, 30); assert.equal(state.usedSupplies['bouncy-treat'], 1);
  assert.equal(state.initialInventory['bouncy-treat'], 1);
});

test('defeating a boss early cannot finish remaining waves, and a surviving boss prevents victory after minions clear', () => {
  let state = dispatchChapter(createChapterBattle(), {type: 'START'});
  state.boss.hp = 1; state.cats[0].energy = 100;
  state = dispatchChapter(state, {type: 'CAST_SKILL', catId: 'caster', target: MAP.boss});
  assert.equal(state.boss.phase, 'defeated'); assert.equal(state.phase, 'battle');
  state = advanceChapter(state, 0.05); assert.equal(state.wave, 1); assert.equal(state.phase, 'battle');
  let last = dispatchChapter(createChapterBattle(), {type: 'START'});
  last.wave = 8; last.spawnIndex = 5; last.spawned = TOTAL_MINIONS; last.defeated = TOTAL_MINIONS; last.enemies = [];
  last = advanceChapter(last, 0.05); assert.equal(last.phase, 'battle'); assert.ok(last.boss.hp > 0);
});

test('retreat and irrecoverable full-party rest finish as lost, without minting supplies or resetting an attempt', () => {
  let state = dispatchChapter(createChapterBattle(), {type: 'START'});
  for (const cat of state.cats) {cat.status = 'resting'; cat.hp = 0;}
  state = advanceChapter(state, 0.05); assert.equal(state.phase, 'lost'); assert.match(state.logs.at(-1)!.text, /所有伙伴/);
  let recoverable = dispatchChapter(createChapterBattle({loadout: {'warm-can': 1}}), {type: 'START'});
  for (const cat of recoverable.cats) {cat.status = 'resting'; cat.hp = 0;}
  recoverable = advanceChapter(recoverable, 0.05); assert.equal(recoverable.phase, 'battle');
  const retreated = dispatchChapter(recoverable, {type: 'RETREAT'}); assert.equal(retreated.phase, 'lost'); assert.equal(retreated.inventory['warm-can'], 1);
});

test('two ordinary leaks can still win with a defeated boss, but the third leak takes precedence over clearing the final field', () => {
  let state = dispatchChapter(createChapterBattle(), {type: 'START'});
  state = advanceChapter(state, 0.05);
  const enemy = structuredClone(state.enemies[0]);
  state.wave = 8; state.spawnIndex = 5; state.spawned = TOTAL_MINIONS; state.defeated = TOTAL_MINIONS - 2; state.leaks = 2; state.enemies = [];
  state.boss.hp = 0; state.boss.phase = 'defeated';
  assert.equal(advanceChapter(state, 0.05).phase, 'won');
  state.enemies = [{...enemy, x: 0, y: 3}]; state.defeated--;
  const failed = advanceChapter(state, 0.05);
  assert.equal(failed.phase, 'lost'); assert.equal(failed.leaks, 3);
});

test('shield cat blocks two minions while excess minions continue, and frost only slows movement for its bounded duration', () => {
  let state = advanceChapter(dispatchChapter(createChapterBattle(), {type: 'START'}), 0.05);
  const source = state.enemies[0];
  state.enemies = [0, 1, 2].map(i => ({...source, id: `block-${i}`, x: 8.43, y: 3, hp: 1000, maxHp: 1000}));
  for (const cat of state.cats) cat.cooldown = 20;
  state = advanceChapter(state, 0.1);
  assert.equal(state.enemies.filter(enemy => enemy.blockedBy === 'guard').length, 2);
  assert.equal(state.cats.find(cat => cat.id === 'guard')!.blockedCount, 2);
  assert.ok(state.enemies.find(enemy => !enemy.blockedBy)!.x < 8.42);
  state.cats.find(cat => cat.id === 'frost')!.energy = 100;
  state = dispatchChapter(state, {type: 'CAST_SKILL', catId: 'frost', target: {x: 8, y: 3}});
  assert.equal(state.enemies.every(enemy => enemy.slowRemaining === 4), true);
  state = advanceChapter(state, 4.1);
  assert.equal(state.enemies.every(enemy => enemy.slowRemaining === 0), true);
});

test('doing nothing does not automatically clear the six-cat boss encounter', () => {
  const {state} = playChapter('medium', {dodge: false, skills: false});
  assert.equal(state.phase, 'lost'); assert.ok(state.boss.hp > 0); assert.equal(state.stats.skills, 0);
});

test('A5 really spawns minions, moves down the branch, supports vertical blocking and turns left at D5', () => {
  const defended = advanceChapter(dispatchChapter(createChapterBattle(), {type: 'START'}), 3);
  const blocked = defended.enemies.find(enemy => enemy.route === 'branch')!;
  assert.ok(blocked); assert.equal(blocked.x, 4); assert.equal(blocked.y, 1.58);
  assert.equal(blocked.blockedBy, 'tabby');
  assert.equal(defended.cats.find(cat => cat.id === 'tabby')!.blockedCount, 1);

  let state = createChapterBattle();
  // Clear the branch through ordinary pre-battle moves. No enemy state is injected.
  state = dispatchChapter(state, {type: 'MOVE_CAT', catId: 'tabby', x: 7, y: 3});
  state = dispatchChapter(state, {type: 'MOVE_CAT', catId: 'singer', x: 7, y: 4});
  state = advanceChapter(dispatchChapter(state, {type: 'START'}), 0.05);
  const id = state.enemies[0].id;
  assert.equal(state.enemies[0].route, 'branch'); assert.equal(state.enemies[0].x, 4);
  assert.ok(state.enemies[0].y >= 0 && state.enemies[0].y < 0.1);
  let sawDown = false, sawTurn = false;
  for (let i = 0; i < 200 && state.enemies.some(enemy => enemy.id === id); i++) {
    state = advanceChapter(state, 0.1);
    const enemy = state.enemies.find(enemy => enemy.id === id);
    if (!enemy) break;
    if (enemy.x === 4 && enemy.y > 1 && enemy.y < 3) sawDown = true;
    if (enemy.y === 3 && enemy.x < 4) sawTurn = true;
  }
  assert.equal(sawDown, true); assert.equal(sawTurn, true); assert.ok(state.leaks >= 1);
});

test('all four boss cells are targetable but every attack or area skill damages the one boss only once', () => {
  const base = dispatchChapter(createChapterBattle(), {type: 'START'});
  assert.deepEqual(getBossCells(base.boss), MAP.bossCells);
  // Each outside centre hits a different edge cell, including cells away from the anchor.
  for (const target of [{x: 8, y: 3}, {x: 11, y: 3}, {x: 8, y: 4}, {x: 11, y: 4}, {x: 9, y: 4}]) {
    const state = structuredClone(base); state.cats.find(cat => cat.id === 'caster')!.energy = 100;
    const hit = dispatchChapter(state, {type: 'CAST_SKILL', catId: 'caster', target});
    assert.equal(hit.lastAction?.ok, true); assert.equal(state.boss.hp - hit.boss.hp, 45);
  }
  const state = structuredClone(base); state.cats.find(cat => cat.id === 'hammer')!.energy = 100;
  const hit = dispatchChapter(state, {type: 'CAST_SKILL', catId: 'hammer'});
  assert.equal(state.boss.hp - hit.boss.hp, 95); // The hammer covers all four footprint cells.
});

test('boss attack range and target choice use the nearest occupied footprint cell', () => {
  let state = createChapterBattle();
  assert.equal(getBossDistance(state.boss, {x: 8, y: 4}), 1);
  assert.equal(getBossDistance(state.boss, {x: 11, y: 4}), 1);
  state = dispatchChapter(state, {type: 'MOVE_CAT', catId: 'guard', x: 7, y: 3});
  state = advanceChapter(dispatchChapter(state, {type: 'START'}), 1.85);
  assert.equal(state.cats.find(cat => cat.id === 'hammer')!.hp, CAT_DEFINITIONS.hammer.maxHp - RULES.bossDamage);
  assert.equal(state.cats.find(cat => cat.id === 'guard')!.hp, CAT_DEFINITIONS.guard.maxHp);
});

function isolatedBossFixture(): ChapterState {
  const state = dispatchChapter(createChapterBattle(), {type: 'START'});
  for (const cat of state.cats) {
    cat.cooldown = 999;
    if (cat.id !== 'guard') {cat.status = 'resting'; cat.hp = cat.maxHp * 0.25;}
  }
  return state;
}

test('boss basics deal ten damage at 1.8-second intervals and expose a short-lived hit on the actual target', () => {
  let state = isolatedBossFixture();
  const hp = state.cats.find(cat => cat.id === 'guard')!.hp;
  state = advanceChapter(state, 1.75);
  assert.equal(state.boss.attacks, 0);
  assert.equal(state.cats.find(cat => cat.id === 'guard')!.hp, hp);
  state = advanceChapter(state, 0.05);
  assert.equal(state.boss.attacks, 1);
  const guard = state.cats.find(cat => cat.id === 'guard')!;
  assert.equal(guard.hp, hp - 10);
  const fx = state.effects.find(effect => effect.kind === 'boss-attack');
  assert.ok(fx);
  assert.deepEqual({x: fx.from.x, y: fx.from.y}, MAP.boss);
  assert.deepEqual({x: fx.to.x, y: fx.to.y}, {x: guard.x, y: guard.y});
  state = advanceChapter(state, 0.45);
  assert.equal(state.effects.some(effect => effect.kind === 'boss-attack'), false);
  state = advanceChapter(state, 1.3);
  assert.equal(state.boss.attacks, 1);
  assert.equal(state.cats.find(cat => cat.id === 'guard')!.hp, hp - 10);
  state = advanceChapter(state, 0.05);
  assert.equal(state.boss.attacks, 2);
  assert.equal(state.cats.find(cat => cat.id === 'guard')!.hp, hp - 20);
});

test('boss basics consume shields first and only the unabsorbed portion reaches HP', () => {
  for (const shield of [6, 20]) {
    let state = isolatedBossFixture();
    const guard = state.cats.find(cat => cat.id === 'guard')!;
    guard.shield = shield; guard.shieldRemaining = 8;
    state = advanceChapter(state, 1.8);
    const hit = state.cats.find(cat => cat.id === 'guard')!;
    assert.equal(state.boss.attacks, 1);
    assert.equal(hit.shield, Math.max(0, shield - 10));
    assert.equal(hit.hp, guard.maxHp - Math.max(0, 10 - shield));
    assert.equal(state.stats.damageTaken, Math.max(0, 10 - shield));
  }
});

test('boss basics ignore resting or out-of-range cats and never overlap the slam windup or recovery', () => {
  let state = dispatchChapter(isolatedBossFixture(), {type: 'MOVE_CAT', catId: 'guard', x: 5, y: 3});
  assert.equal(state.lastAction?.ok, true);
  state = advanceChapter(state, 1.85);
  assert.equal(state.boss.attacks, 0); // Closer cats exist but are resting; the active guard is four cells away.
  assert.equal(state.cats.find(cat => cat.id === 'guard')!.hp, CAT_DEFINITIONS.guard.maxHp);
  state = dispatchChapter(state, {type: 'MOVE_CAT', catId: 'guard', x: 6, y: 3});
  assert.equal(state.lastAction?.ok, true);
  state = advanceChapter(state, 0.05);
  assert.equal(state.boss.attacks, 1); // The three-cell boundary is in range.
  assert.equal(state.cats.find(cat => cat.id === 'guard')!.hp, CAT_DEFINITIONS.guard.maxHp - 10);
  for (const phase of ['windup', 'recovery'] as const) {
    state = isolatedBossFixture(); state.boss.phase = phase; state.boss.phaseTime = 0; state.boss.cooldown = 0;
    state = advanceChapter(state, 1);
    assert.equal(state.boss.phase, phase);
    assert.equal(state.boss.attacks, 0);
    assert.equal(state.cats.find(cat => cat.id === 'guard')!.hp, CAT_DEFINITIONS.guard.maxHp);
    assert.equal(state.effects.some(effect => effect.kind === 'boss-attack'), false);
  }
});

function confluenceFixture(): ChapterState {
  const state = dispatchChapter(createChapterBattle(), {type: 'START'});
  state.wave = WAVES.length; state.spawnIndex = WAVES.at(-1)!.length; state.spawned = TOTAL_MINIONS;
  state.boss.phase = 'defeated'; state.boss.hp = 0;
  for (const cat of state.cats) {cat.status = 'resting'; cat.cooldown = 999;}
  Object.assign(state.cats.find(cat => cat.id === 'guard')!, {status: 'active', x: 4, y: 3});
  state.enemies = [
    {id: 'held-right', x: 4.43, y: 3, route: 'upper' as const},
    {id: 'held-branch', x: 4, y: 2.57, route: 'branch' as const},
    {id: 'overflow', x: 4, y: 2.5, route: 'branch' as const},
  ].map(enemy => ({...ENEMY_DEFINITIONS.scout, ...enemy, kind: 'scout', hp: 100, damage: 0, cooldown: 999, blockedBy: null, slowRemaining: 0}));
  return state;
}

test('D5 confluence retains the same two blocked enemies while only the overflow enemy passes', () => {
  let state = advanceChapter(confluenceFixture(), 0.05);
  assert.deepEqual(state.enemies.filter(enemy => enemy.blockedBy === 'guard').map(enemy => enemy.id), ['held-right', 'held-branch']);
  const initial = state.enemies.slice(0, 2).map(enemy => ({id: enemy.id, x: enemy.x, y: enemy.y}));
  for (let i = 0; i < 240; i++) {
    state = advanceChapter(state, 0.05);
    assert.deepEqual(state.enemies.filter(enemy => enemy.blockedBy === 'guard').map(enemy => ({id: enemy.id, x: enemy.x, y: enemy.y})), initial);
    assert.equal(state.cats.find(cat => cat.id === 'guard')!.blockedCount, 2);
  }
  assert.equal(state.enemies.some(enemy => enemy.id === 'overflow'), false);
  assert.equal(state.leaks, 1); // Held enemies never creep into or through the blocker.
});

test('moving a blocker releases vertical and horizontal contacts immediately; resting also clears them', () => {
  const blocked = advanceChapter(confluenceFixture(), 0.05);
  const swapFixture = structuredClone(blocked);
  Object.assign(swapFixture.cats.find(cat => cat.id === 'singer')!, {status: 'active', x: 5, y: 3});
  // The old cell contains enemies, so exchanging another cat into it is rejected.
  const illegalSwap = dispatchChapter(swapFixture, {type: 'MOVE_CAT', catId: 'guard', x: 5, y: 3});
  assert.equal(illegalSwap.lastAction?.ok, false);
  assert.equal(illegalSwap.enemies.filter(enemy => enemy.blockedBy === 'guard').length, 2);
  let moved = dispatchChapter(blocked, {type: 'MOVE_CAT', catId: 'guard', x: 5, y: 3});
  assert.equal(moved.lastAction?.ok, true);
  assert.equal(moved.enemies.every(enemy => enemy.blockedBy === null), true);
  assert.equal(moved.cats.find(cat => cat.id === 'guard')!.blockedCount, 0);
  moved = advanceChapter(moved, 0.1);
  assert.ok(moved.enemies.find(enemy => enemy.id === 'held-right')!.x < 4.42);
  assert.ok(moved.enemies.find(enemy => enemy.id === 'held-branch')!.y > 2.58);

  const hurt = structuredClone(blocked);
  hurt.cats.find(cat => cat.id === 'guard')!.hp = 61;
  hurt.enemies[0].damage = 2; hurt.enemies[0].cooldown = 0;
  const rested = advanceChapter(hurt, 0.05);
  assert.equal(rested.cats.find(cat => cat.id === 'guard')!.status, 'resting');
  assert.equal(rested.cats.find(cat => cat.id === 'guard')!.blockedCount, 0);
  assert.equal(rested.enemies.every(enemy => enemy.blockedBy === null), true);
});

for (const difficulty of ['low', 'medium', 'high'] as const) {
  test(`${difficulty}: all spawned enemies receive HP scaling exactly once, and a real zero-supply strategy wins all eight waves`, t => {
    const seen = new Set<string>();
    const result = playChapter(difficulty, {onSnapshot(state: ChapterState) {
      assert.equal(state.boss.maxHp, Math.round(RULES.bossHp * DIFFICULTIES[difficulty].hpMultiplier));
      for (const enemy of state.enemies) if (!seen.has(enemy.id)) {
        seen.add(enemy.id);
        const base = enemy.kind === 'scout' ? 100 : enemy.kind === 'runner' ? 70 : 210;
        assert.equal(enemy.maxHp, Math.round(base * DIFFICULTIES[difficulty].hpMultiplier));
      }
    }});
    t.diagnostic(JSON.stringify({difficulty, outcome: result.state.phase, seconds: Math.round(result.state.elapsed), spawned: result.state.spawned, leaks: result.state.leaks, boss: result.state.boss.hp, skills: result.state.stats.skills, dodgedSlams: result.state.stats.dodgedSlams, remainingCats: result.state.cats.filter(cat => cat.status === 'active').length}));
    assert.equal(result.state.phase, 'won'); assert.equal(result.state.spawned, TOTAL_MINIONS); assert.equal(seen.size, TOTAL_MINIONS);
    assert.equal(result.state.boss.phase, 'defeated'); assert.equal(result.state.leaks, 0); assert.ok(result.state.stats.skills >= 6);
    assert.deepEqual(result.state.usedSupplies, {'warm-can': 0, 'bouncy-treat': 0});
  });
}
