import test from 'node:test';
import assert from 'node:assert/strict';
import {CAT_DEFINITIONS, CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, ROUTES, RULES, SKILLS, TOTAL_MINIONS, WAVES} from '../../web/src/modules/battle/market/config.ts';
import {advanceMarket, cellName, createMarketBattle, dispatchMarket, getAttackCells, getBossCells, getBossDistance, getDeployError, getMarketAdvice, getMarketSpeed, getSkillCells, isDeployableCell, isMarketCell, isPlayableCell} from '../../web/src/modules/battle/market/engine.ts';
import type {BattleDifficulty, MarketAction, MarketCatId, MarketEnemy, MarketRouteId, MarketState, Position} from '../../web/src/modules/battle/market/types.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const cat = (state: MarketState, id: MarketCatId) => state.cats.find(value => value.id === id)!;
const start = () => dispatchMarket(createMarketBattle(), {type: 'START'});
/** Isolate mechanics; the full-battle acceptance cases below never alter internal state. */
function quiet(): MarketState {
  const state = start(); state.wave = WAVES.length; state.spawnIndex = WAVES.at(-1)!.length; state.spawned = TOTAL_MINIONS;
  state.boss.cooldown = 999; state.boss.skillCooldown = 999;
  for (const value of state.cats) {value.cooldown = 999; value.block = 0;}
  return state;
}
function enemy(route: MarketRouteId, extra: Partial<MarketEnemy> = {}): MarketEnemy {
  return {...ENEMY_DEFINITIONS.scout, ...ROUTES[route][0], id: `test-${route}`, kind: 'scout', hp: 100, route,
    pathIndex: 1, slowRemaining: 0, slowMultiplier: 1, cooldown: 999, blockedBy: null, ...extra};
}

test('market is a complete 5 by 8 board with fourteen obstacles, seven entrances and seventeen deployment cells', () => {
  const state = createMarketBattle();
  assert.equal(state.stageId, 'market_boss'); assert.equal(CELLS.length, 40);
  assert.equal(MAP.obstacles.length, 14); assert.equal(MAP.spawns.length, 7);
  assert.equal(CELLS.filter(cell => isDeployableCell(cell)).length, 17);
  assert.deepEqual(MAP.obstacles.map(cellName), ['A1','A2','A3','A6','A7','A8','B1','D1','E1','E2','E3','E6','E7','E8']);
  assert.deepEqual(MAP.spawns.map(cellName), ['A4','A5','B8','C8','D8','E4','E5']);
  assert.equal(cellName(MAP.goal), 'C1'); assert.deepEqual(getBossCells(state.boss), [{x: 6, y: 2}]);
  for (const cell of [...MAP.spawns, ...MAP.obstacles, MAP.goal, ...MAP.bossCells]) assert.equal(isDeployableCell(cell), false);
  for (const cell of CELLS) assert.equal(isMarketCell(cell), true);
  for (const cell of [{x: -1, y: 2}, {x: 8, y: 0}, {x: 0, y: 5}, {x: .5, y: 2}, {x: NaN, y: 1}]) assert.equal(isMarketCell(cell), false);
  assert.deepEqual(state.cats.map(value => value.name), ['绒绒','斑斑','团子','点点','栗栗','铃铃']);
  for (const value of state.cats) assert.equal(getDeployError(state, value.id, value), null);
  assert.equal('inventory' in state, false); assert.equal('restSlots' in state, false);
  for (const difficulty of ['bad', null, 1]) assert.throws(() => createMarketBattle({difficulty: difficulty as never}));
});

test('all seven explicit paths are axis-aligned, avoid obstacles and terminate only at C1', () => {
  for (const [route, path] of Object.entries(ROUTES)) {
    assert.ok(MAP.spawns.some(cell => cell.x === path[0].x && cell.y === path[0].y));
    assert.deepEqual(path.at(-1), MAP.goal);
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1], to = path[i], dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
      assert.notEqual(Boolean(dx), Boolean(dy), `${route} must move along one axis`);
      const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
      for (let step = 0; step <= length; step++) assert.equal(isPlayableCell({x: from.x + dx * step, y: from.y + dy * step}), true);
    }
  }
});

for (const route of Object.keys(ROUTES) as MarketRouteId[]) test(`${route}: a moving minion follows every corner and leaks exactly once at C1`, () => {
  let state = quiet(); state.enemies = [enemy(route)]; let snapshots = 0;
  for (let step = 0; step < 1000 && state.enemies.length; step++) {
    const before = state.enemies[0]; state = advanceMarket(state, .05);
    if (state.enemies.length) {
      const after = state.enemies[0]; snapshots++;
      assert.equal(isPlayableCell({x: Math.round(after.x), y: Math.round(after.y)}), true);
      close(Math.abs(after.x - before.x) + Math.abs(after.y - before.y), after.speed * .05);
      assert.equal(state.leaks, 0);
    }
  }
  assert.ok(snapshots > 10); assert.equal(state.enemies.length, 0); assert.equal(state.leaks, 1);
  assert.equal(state.phase, 'battle');
});

test('east C minions pass through the stationary boss cell', () => {
  const base = quiet(); base.enemies = [enemy('eastC')];
  const after = advanceMarket(base, 2.1);
  assert.ok(after.enemies[0].x < MAP.boss.x); assert.equal(after.enemies[0].y, 2);
  assert.equal(after.boss.hp, base.boss.hp); assert.equal(after.enemies[0].blockedBy, null);
});

for (const [route, position, direction] of [
  ['north4', {x: 3, y: 1}, {x: 0, y: 1}], ['south4', {x: 3, y: 3}, {x: 0, y: -1}],
  ['eastC', {x: 4, y: 2}, {x: -1, y: 0}],
] as [MarketRouteId, Position, Position][]) test(`${route}: directed blocking releases on a legal move without teleporting or capturing from behind`, () => {
  let state = quiet(); Object.assign(cat(state, 'guard'), position, {block: 2});
  state.enemies = [enemy(route, {speed: 2})]; state = advanceMarket(state, 2);
  assert.equal(state.enemies[0].blockedBy, 'guard'); assert.equal(cat(state, 'guard').blockedCount, 1);
  close(state.enemies[0].x, position.x - direction.x * RULES.contactGap);
  close(state.enemies[0].y, position.y - direction.y * RULES.contactGap);
  const before = {...state.enemies[0]};
  state = dispatchMarket(state, {type: 'MOVE_CAT', catId: 'guard', x: 1, y: 1});
  assert.equal(state.lastAction?.ok, true); assert.equal(state.enemies[0].blockedBy, null);
  close(state.enemies[0].x, before.x); close(state.enemies[0].y, before.y);
  state = advanceMarket(state, .05);
  close(state.enemies[0].x - before.x, direction.x * .1);
  close(state.enemies[0].y - before.y, direction.y * .1);
});

test('two stable blocker slots hold their original enemies while a third proceeds through the corner', () => {
  let state = quiet(); Object.assign(cat(state, 'guard'), {x: 3, y: 1, block: 2});
  state.enemies = ['one', 'two', 'three'].map(id => enemy('north4', {id, speed: 1}));
  state = advanceMarket(state, 1);
  const held = state.enemies.filter(value => value.blockedBy === 'guard').map(value => value.id);
  assert.equal(held.length, 2); assert.equal(cat(state, 'guard').blockedCount, 2);
  state = advanceMarket(state, 2);
  assert.deepEqual(state.enemies.filter(value => value.blockedBy === 'guard').map(value => value.id), held);
  const passed = state.enemies.find(value => !held.includes(value.id))!;
  assert.equal(passed.blockedBy, null); assert.equal(passed.y, 2); assert.ok(passed.x < 3);
});

test('opposing north and south routes can share one blocker at the C4 junction and both release in their own direction', () => {
  let state=quiet();Object.assign(cat(state,'guard'),{x:3,y:2,block:2});
  state.enemies=[enemy('north4',{id:'north',speed:1}),enemy('south4',{id:'south',speed:1})];
  state=advanceMarket(state,1.7);
  assert.equal(cat(state,'guard').blockedCount,2);
  assert.equal(state.enemies.every(value=>value.blockedBy==='guard'),true);
  close(state.enemies.find(value=>value.id==='north')!.y,1.58);
  close(state.enemies.find(value=>value.id==='south')!.y,2.42);
  state.enemies.push(enemy('north4',{id:'overflow',speed:1}));state=advanceMarket(state,2.5);
  const overflow=state.enemies.find(value=>value.id==='overflow')!;
  assert.equal(overflow.blockedBy,null);assert.equal(overflow.y,2);assert.ok(overflow.x<3);
  const before=structuredClone(state.enemies);
  state=dispatchMarket(state,{type:'MOVE_CAT',catId:'guard',x:5,y:2});assert.equal(state.lastAction?.ok,true);
  assert.equal(state.enemies.every(value=>value.blockedBy===null),true);
  for(const value of state.enemies){const old=before.find(candidate=>candidate.id===value.id)!;close(value.x,old.x);close(value.y,old.y);}
  state=advanceMarket(state,.05);
  close(state.enemies.find(value=>value.id==='north')!.y,1.63);
  close(state.enemies.find(value=>value.id==='south')!.y,2.37);
});

test('swaps preserve resources and reject enemies on either destination or vacated source cell', () => {
  let state = quiet(); Object.assign(cat(state, 'guard'), {x: 3, y: 1, block: 2, energy: 50, hp: 100, energyBlockedRemaining: 2, attackBuffRemaining: 3});
  state.enemies = [enemy('north4', {speed: 2})]; state = advanceMarket(state, 1);
  const rejected = dispatchMarket(state, {type: 'MOVE_CAT', catId: 'guard', x: 2, y: 1});
  assert.equal(rejected.lastAction?.ok, false); assert.match(rejected.lastAction!.message, /原位置有黑影/);
  assert.equal(getDeployError(state, 'caster', {x: 3, y: 1}), '这格有黑影，暂时不能移动过去。');
  const base = createMarketBattle(); Object.assign(cat(base, 'guard'), {hp: 70, energy: 90, shield: 12, shieldRemaining: 3, energyBlockedRemaining: 2, attackBuffRemaining: 1});
  const swapped = dispatchMarket(base, {type: 'MOVE_CAT', catId: 'guard', ...CAT_DEFINITIONS.caster.initial});
  assert.equal(swapped.lastAction?.ok, true);
  for (const key of ['hp','energy','shield','shieldRemaining','energyBlockedRemaining','attackBuffRemaining'] as const) assert.equal(cat(swapped,'guard')[key], cat(base,'guard')[key]);
  assert.deepEqual({x: cat(swapped,'caster').x, y: cat(swapped,'caster').y}, CAT_DEFINITIONS.guard.initial);
});

test('original four cats retain their numbers and new skill geometry stays inside available cells', () => {
  assert.deepEqual(['caster','guard','tuanzi','diandian'].map(id => {const c = CAT_DEFINITIONS[id as MarketCatId]; return [c.maxHp,c.damage,c.interval,c.block];}), [[80,20,.8,1],[240,8,1.1,2],[220,28,1.2,1],[140,10,1.1,1]]);
  assert.equal(CAT_DEFINITIONS.bruiser.maxHp, 240); assert.equal(CAT_DEFINITIONS.controller.maxHp, 110);
  const state = createMarketBattle();
  for (const value of state.cats) for (const cell of getAttackCells(value)) {assert.equal(isPlayableCell(cell), true); assert.ok(cell.x >= value.x);}
  assert.deepEqual(getSkillCells(cat(state,'controller'), {x: 3, y: 0}), [{x:3,y:0},{x:4,y:0},{x:3,y:1}]);
  assert.deepEqual(getSkillCells(cat(state,'controller'), {x: 2, y: 0}), []);
  assert.equal(getBossDistance(state.boss, {x: 4, y: 1}), 3);
});

test('automatic energy caps at 100, ignores attacks, and pause/speed/inspection use one simulation clock', () => {
  const state = quiet();
  for (const speed of [.5,1,2] as const) {
    const after = advanceMarket(dispatchMarket(state,{type:'SET_SPEED',speed}),4);
    close(after.elapsed,4*speed); for (const value of after.cats) {close(value.energy,20*speed);assert.equal(value.attacks,0);}
  }
  const inspected = dispatchMarket(state,{type:'INSPECT',catId:'caster'});
  assert.equal(getMarketSpeed(inspected),.5); close(advanceMarket(inspected,4).cats[0].energy,10);
  for (const action of [{type:'PAUSE',paused:true},{type:'SET_EXTERNAL_PAUSE',paused:true},{type:'SET_UI_PAUSE',paused:true}] as const) {
    const paused = dispatchMarket(state,action); assert.equal(advanceMarket(paused,20),paused);
  }
  assert.equal(advanceMarket(state,30).cats[0].energy,100);
  let attacking = start(); attacking=advanceMarket(attacking,4);
  assert.ok(attacking.cats.some(value=>value.attacks>0)); for(const value of attacking.cats)close(value.energy,20);
});

test('bruiser skill supplies 35 shield and an eight-second 50 percent attack buff without healing', () => {
  let state=quiet(); Object.assign(cat(state,'bruiser'),{energy:100,hp:150,cooldown:0});
  state.enemies=[enemy('eastD',{x:5,y:3,speed:0,hp:1000,maxHp:1000})];
  state=dispatchMarket(state,{type:'CAST_SKILL',catId:'bruiser'});
  assert.equal(cat(state,'bruiser').shield,35);assert.equal(cat(state,'bruiser').hp,150);assert.equal(cat(state,'bruiser').attackBuffRemaining,8);
  state=advanceMarket(state,.05);assert.equal(state.enemies[0].hp,976);
  state=advanceMarket(state,7.95);close(cat(state,'bruiser').attackBuffRemaining,0);assert.equal(cat(state,'bruiser').shield,0);
  const before=state.enemies[0].hp;state=advanceMarket(state,.05);assert.equal(before-state.enemies[0].hp,16);
});

test('controller cross deals 25 once per enemy and slows movement by forty percent for exactly four seconds', () => {
  let state=quiet();cat(state,'controller').energy=100;
  state.enemies=[enemy('eastB',{x:6,y:1,speed:.5}),enemy('eastC',{x:6,y:2,speed:.5,id:'other'})];
  const hp=state.boss.hp;
  state=dispatchMarket(state,{type:'CAST_SKILL',catId:'controller',target:{x:6,y:1}});
  assert.equal(hp-state.boss.hp,25);for(const value of state.enemies){assert.equal(value.hp,75);assert.equal(value.slowRemaining,4);}
  const initial=state.enemies.map(value=>value.x);state=advanceMarket(state,4);
  for(const [i,value] of state.enemies.entries()){close(initial[i]-value.x,1.2);assert.equal(value.slowRemaining,0);assert.equal(value.slowMultiplier,1);}
  const x=state.enemies[0].x;state=advanceMarket(state,1);close(x-state.enemies[0].x,.5);
});

for(const speed of [.5,1,2] as const)test(`${speed}x applies the same clock to energy lock, shields, attack buff, slow and boss telegraph`,()=>{
  let state=quiet();
  Object.assign(cat(state,'bruiser'),{shield:35,shieldRemaining:8,attackBuffRemaining:8,energyBlockedRemaining:4});
  state.enemies=[enemy('eastB',{slowRemaining:4,slowMultiplier:.6,speed:.5})];
  state.boss.phase='windup';state.boss.phaseTime=0;state.boss.targetRow=2;
  state.boss.targetCells=CELLS.filter(cell=>cell.y===2&&isPlayableCell(cell));
  state=dispatchMarket(state,{type:'SET_SPEED',speed});
  const paused=dispatchMarket(state,{type:'PAUSE',paused:true});assert.equal(advanceMarket(paused,10),paused);
  state=advanceMarket(state,2/speed);
  close(state.elapsed,2);close(cat(state,'bruiser').energyBlockedRemaining,2);close(cat(state,'bruiser').shieldRemaining,6);
  close(cat(state,'bruiser').attackBuffRemaining,6);close(state.enemies[0].slowRemaining,2);close(state.enemies[0].x,6.4);
  assert.equal(cat(state,'bruiser').energy,0);close(state.boss.phaseTime,2);assert.equal(state.boss.phase,'windup');
});

test('defeating a winding-up boss immediately clears its locked row and cancels the pending sweep',()=>{
  let state=quiet();state.enemies=[enemy('north4',{speed:0})];
  state.boss.hp=40;state.boss.skillCooldown=0;cat(state,'caster').energy=100;
  state=advanceMarket(state,.05);assert.equal(state.boss.phase,'windup');assert.ok(state.boss.targetCells.length);
  state=dispatchMarket(state,{type:'CAST_SKILL',catId:'caster',target:MAP.boss});
  assert.equal(state.lastAction?.ok,true);assert.equal(state.boss.phase,'defeated');assert.equal(state.boss.targetRow,null);assert.deepEqual(state.boss.targetCells,[]);
  state=advanceMarket(state,4);assert.equal(state.boss.slams,0);assert.equal(state.cats.every(value=>value.hp===value.maxHp),true);
  assert.equal(state.phase,'battle','living minion still prevents victory');
});

test('boss first sweep begins at fourteen seconds, locks a whole row for three seconds and repeats every twenty-four seconds', () => {
  let state=quiet();state.boss.skillCooldown=RULES.bossSweepFirst;
  state=advanceMarket(state,13.95);assert.equal(state.boss.phase,'idle');
  state=advanceMarket(state,.05);assert.equal(state.boss.phase,'windup');assert.equal(state.boss.targetRow,1);
  assert.deepEqual(state.boss.targetCells.map(cellName),['B2','B3','B4','B5','B6','B7','B8']);
  const hp=cat(state,'caster').hp;state=advanceMarket(state,2.95);assert.equal(cat(state,'caster').hp,hp);
  state=advanceMarket(state,.05);assert.equal(state.boss.phase,'recovery');assert.equal(state.boss.slams,1);
  assert.equal(cat(state,'caster').hp,hp-45);assert.equal(cat(state,'caster').energyBlockedRemaining,4);
  state=advanceMarket(state,1);assert.equal(state.boss.phase,'idle');assert.equal(state.boss.targetRow,null);
  state=advanceMarket(state,19.95);assert.equal(state.boss.phase,'idle');
  state=advanceMarket(state,.05);assert.equal(state.boss.phase,'windup');assert.equal(state.boss.targetRow,2);
  state=advanceMarket(state,24);assert.equal(state.boss.phase,'windup');assert.equal(state.boss.targetRow,3);
});

test('sweep chooses the most occupied row and the locked row does not chase cats that move away', () => {
  let state=quiet();state=dispatchMarket(state,{type:'MOVE_CAT',catId:'caster',x:3,y:3});state.boss.skillCooldown=0;
  state=advanceMarket(state,.05);assert.equal(state.boss.targetRow,3);
  for(const [id,position] of [['controller',{x:1,y:1}],['bruiser',{x:5,y:1}],['caster',{x:3,y:1}]] as [MarketCatId,Position][]) {
    state=dispatchMarket(state,{type:'MOVE_CAT',catId:id,...position});assert.equal(state.lastAction?.ok,true);
  }
  assert.equal(state.boss.targetRow,3);state=advanceMarket(state,3);
  assert.equal(state.stats.dodgedSlams,1);assert.equal(state.cats.every(value=>value.hp===value.maxHp),true);
  assert.equal(state.cats.every(value=>value.energyBlockedRemaining===0),true);
});

test('energy lock stops only charging for four simulation seconds; full skills remain usable and shield does not prevent lock', () => {
  let state=quiet();state.boss.skillCooldown=0;cat(state,'guard').energy=100;
  state=dispatchMarket(state,{type:'CAST_SKILL',catId:'guard'});state=advanceMarket(state,3.05);
  assert.equal(state.boss.phase,'recovery');assert.equal(cat(state,'guard').hp,240);assert.equal(cat(state,'guard').shield,15);
  assert.equal(cat(state,'guard').energyBlockedRemaining,4);
  const value=cat(state,'guard').energy;state=advanceMarket(state,4);close(cat(state,'guard').energy,value);
  state=advanceMarket(state,.05);close(cat(state,'guard').energy,value+.25);
  let full=quiet();Object.assign(cat(full,'guard'),{energy:100,energyBlockedRemaining:4});
  full=dispatchMarket(full,{type:'CAST_SKILL',catId:'guard'});assert.equal(full.lastAction?.ok,true);assert.equal(cat(full,'guard').energy,0);
  full=advanceMarket(full,2);assert.equal(cat(full,'guard').energy,0);close(cat(full,'guard').energyBlockedRemaining,2);
  const paused=dispatchMarket(full,{type:'PAUSE',paused:true});assert.equal(advanceMarket(paused,10),paused);
});

test('boss basics use range three and 2.2 seconds, and never overlap telegraph or recovery', () => {
  let state=quiet();state.boss.cooldown=2.2;
  state=advanceMarket(state,2.15);assert.equal(state.boss.attacks,0);
  state=advanceMarket(state,.05);assert.equal(state.boss.attacks,1);assert.equal(cat(state,'tuanzi').hp,212);
  state.boss.skillCooldown=0;state.boss.cooldown=0;state=advanceMarket(state,.05);assert.equal(state.boss.phase,'windup');assert.equal(state.boss.attacks,1);
  state=advanceMarket(state,3.95);assert.equal(state.boss.attacks,1);
});

test('zero health retires cats, cancels targeting, releases blocks and cannot be reversed by team healing', () => {
  let state=quiet();state.boss.skillCooldown=0;cat(state,'caster').hp=45;cat(state,'caster').energy=100;cat(state,'diandian').energy=100;
  state=dispatchMarket(state,{type:'SELECT_SKILL',catId:'caster'});state=advanceMarket(state,3.05);
  assert.equal(cat(state,'caster').status,'retired');assert.equal(cat(state,'caster').hp,0);assert.equal(cat(state,'caster').energy,0);assert.equal(state.aim,null);
  state=dispatchMarket(state,{type:'CAST_SKILL',catId:'diandian'});assert.equal(state.lastAction?.ok,true);assert.equal(cat(state,'caster').hp,0);
  assert.equal(dispatchMarket(state,{type:'MOVE_CAT',catId:'caster',x:1,y:1}).lastAction?.ok,false);
  assert.deepEqual(getAttackCells(cat(state,'caster')),[]);assert.deepEqual(getSkillCells(cat(state,'caster'),MAP.boss),[]);
  state=advanceMarket(state,5);assert.equal(cat(state,'caster').energy,0);
  const all=quiet();for(const value of all.cats){value.status='retired';value.hp=0;}assert.equal(advanceMarket(all,.05).phase,'lost');
});

test('three leaks, retreat, and cleared waves plus boss retain distinct terminal conditions', () => {
  const leaking=quiet();leaking.enemies=['a','b','c'].map(id=>enemy('eastC',{id,x:.01,speed:2}));
  assert.equal(advanceMarket(leaking,.05).phase,'lost');assert.equal(dispatchMarket(start(),{type:'RETREAT'}).phase,'lost');
  const waiting=quiet();assert.equal(advanceMarket(waiting,.05).phase,'battle','living boss prevents a win after all minions');
  waiting.boss.hp=0;waiting.boss.phase='defeated';assert.equal(advanceMarket(waiting,.05).phase,'won');
  const pending=quiet();pending.boss.hp=0;pending.boss.phase='defeated';pending.spawnIndex=WAVES.at(-1)!.length-1;pending.spawned=TOTAL_MINIONS-1;
  assert.equal(advanceMarket(pending,.05).phase,'battle','future final-wave spawn prevents early victory');
});

test('illegal actions do not restore items, bypass aim, move onto reserved cells, or cast during pauses', () => {
  let state=start();cat(state,'controller').energy=100;
  for(const action of [{type:'USE_ITEM',itemId:'fish'},{type:'REFORM'},{type:'RESTART'}])assert.equal(dispatchMarket(state,action as MarketAction).lastAction?.ok,false);
  for(const position of [...MAP.spawns,...MAP.obstacles,...MAP.bossCells,MAP.goal])assert.ok(getDeployError(state,'guard',position));
  state=dispatchMarket(state,{type:'SELECT_SKILL',catId:'controller'});assert.equal(getMarketSpeed(state),1);
  assert.equal(dispatchMarket(state,{type:'MOVE_CAT',catId:'guard',x:1,y:1}).lastAction?.ok,false);
  state=dispatchMarket(state,{type:'AIM_SKILL',x:0,y:0});assert.equal(state.aim?.target,null);
  assert.equal(dispatchMarket(state,{type:'CAST_SKILL',catId:'controller'}).lastAction?.ok,false);
  state=dispatchMarket(state,{type:'CANCEL_SKILL'});assert.equal(cat(state,'controller').energy,100);
  for(const action of [{type:'PAUSE',paused:true},{type:'SET_EXTERNAL_PAUSE',paused:true},{type:'SET_UI_PAUSE',paused:true}] as const) {
    assert.equal(dispatchMarket(dispatchMarket(state,action),{type:'CAST_SKILL',catId:'controller',target:MAP.boss}).lastAction?.ok,false);
  }
  assert.match(getMarketAdvice(createMarketBattle()),/七处/);
});

/** Whole-stage driver: only public actions and clock ticks, with one relocation per half second.
 * No health/energy injection, wave skipping, retirement reversal, or internal state writes.
 */
function playMarket(difficulty: BattleDifficulty) {
  let state=dispatchMarket(createMarketBattle({difficulty}),{type:'START'}), nextObservation=0;
  const waves=new Set<number>(), routes=new Set<MarketRouteId>(), seen=new Set<string>();
  const send=(action:MarketAction)=>{state=dispatchMarket(state,action);assert.notEqual(state.lastAction?.ok,false,state.lastAction?.message);};
  for(let step=0;step<12000&&state.phase==='battle';step++) {
    waves.add(state.wave);
    for(const value of state.enemies)if(!seen.has(value.id)){seen.add(value.id);routes.add(value.route);assert.equal(value.maxHp,Math.round(ENEMY_DEFINITIONS[value.kind].maxHp*DIFFICULTIES[difficulty].hpMultiplier));}
    if(state.enemies.length===0&&state.spawnIndex<WAVES[state.wave-1].length)assert.equal(state.nextWaveIn,null);
    if(state.elapsed+1e-8>=nextObservation) {
      nextObservation=state.elapsed+.5;
      if(state.boss.phase==='windup') {
        const threatened=state.cats.find(value=>value.status==='active'&&value.y===state.boss.targetRow);
        if(threatened) {
          const choices=CELLS.filter(cell=>isDeployableCell(cell)&&cell.y!==state.boss.targetRow&&!state.cats.some(value=>value.status==='active'&&value.x===cell.x&&value.y===cell.y)&&!getDeployError(state,threatened.id,cell))
            .sort((a,b)=>Math.abs(a.x-threatened.x)+Math.abs(a.y-threatened.y)-Math.abs(b.x-threatened.x)-Math.abs(b.y-threatened.y));
          if(choices[0])send({type:'MOVE_CAT',catId:threatened.id,...choices[0]});
        }
      } else {
        const moved=state.cats.find(value=>value.status==='active'&&(value.x!==CAT_DEFINITIONS[value.id].initial.x||value.y!==CAT_DEFINITIONS[value.id].initial.y)&&!getDeployError(state,value.id,CAT_DEFINITIONS[value.id].initial));
        if(moved)send({type:'MOVE_CAT',catId:moved.id,...CAT_DEFINITIONS[moved.id].initial});
      }
      for(const id of ['diandian','guard','bruiser','controller','caster','tuanzi'] as const) {
        const value=cat(state,id);if(value.status!=='active'||value.energy<100)continue;
        if(id==='diandian'&&!state.cats.some(friend=>friend.status==='active'&&friend.hp<=friend.maxHp-55))continue;
        if(id==='guard'&&!value.blockedCount&&state.boss.phase==='defeated')continue;
        if(id==='controller'||id==='caster') {
          let best={...MAP.boss,score:0};
          for(const target of CELLS) {
            const cells=getSkillCells(value,target);
            let score=state.enemies.filter(enemy=>cells.some(cell=>cell.x===Math.round(enemy.x)&&cell.y===Math.round(enemy.y))).length*3;
            if(state.boss.hp>0&&cells.some(cell=>cell.x===state.boss.x&&cell.y===state.boss.y))score++;
            if(score>best.score)best={...target,score};
          }
          if(!best.score)continue;
          send({type:'SELECT_SKILL',catId:id});send({type:'AIM_SKILL',...best});send({type:'CAST_SKILL',catId:id});
        } else send({type:'CAST_SKILL',catId:id});
      }
    }
    state=advanceMarket(state,.05);
  }
  return {state,waves:[...waves],routes:[...routes],seen:seen.size};
}

test('eight staggered waves contain thirty-three minions and use all seven entrances',()=>{
  assert.equal(WAVES.length,8);assert.equal(TOTAL_MINIONS,33);assert.deepEqual(WAVES.map(wave=>wave.length),[3,4,4,4,4,4,5,5]);
  assert.equal(WAVES[0][0].route,'north4');assert.equal(WAVES[0][0].at,0);
  for(const wave of WAVES)for(let i=1;i<wave.length;i++)assert.ok(wave[i].at>wave[i-1].at);
});
for(const difficulty of ['low','medium','high'] as const)test(`${difficulty}: legal six-cat play completes all eight waves and the boss without cheats`,context=>{
  const result=playMarket(difficulty),state=result.state;
  assert.equal(state.phase,'won');assert.equal(state.boss.hp,0);assert.equal(state.wave,8);
  assert.equal(state.spawned,TOTAL_MINIONS);assert.equal(state.defeated+state.leaks,TOTAL_MINIONS);assert.equal(state.leaks,0);
  assert.equal(state.cats.every(value=>value.status==='active'),true);
  // A low-HP spawn can be killed by several cats in its very first simulation tick.
  assert.ok(result.seen>=TOTAL_MINIONS-1&&result.seen<=TOTAL_MINIONS);
  assert.deepEqual(result.waves,[1,2,3,4,5,6,7,8]);assert.equal(result.routes.length,7);
  assert.ok(state.stats.skills>=20);assert.ok(state.stats.dodgedSlams>=3);assert.equal(state.boss.slams,state.stats.dodgedSlams);
  context.diagnostic(JSON.stringify({difficulty,seconds:Number(state.elapsed.toFixed(2)),leaks:state.leaks,skills:state.stats.skills,dodges:state.stats.dodgedSlams,cats:state.cats.map(value=>({name:value.name,hp:value.hp}))}));
});
