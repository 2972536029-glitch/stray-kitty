import test from 'node:test';
import assert from 'node:assert/strict';
import {CAT_DEFINITIONS, CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, ROUTES, RULES, SKILLS, TOTAL_MINIONS, WAVES} from '../../web/src/modules/battle/greenhouse/config.ts';
import {advanceGreenhouse, cellName, createGreenhouseBattle, dispatchGreenhouse, getAttackCells, getBossCells, getBossDistance, getDeployError, getGreenhouseAdvice, getGreenhouseSpeed, getSkillCells, isDeployableCell, isGreenhouseCell, isPlayableCell} from '../../web/src/modules/battle/greenhouse/engine.ts';
import type {BattleDifficulty, GreenhouseAction, GreenhouseCatId, GreenhouseEnemy, GreenhouseHazard, GreenhouseRouteId, GreenhouseState, Position} from '../../web/src/modules/battle/greenhouse/types.ts';
import {CAT_DEFINITIONS as MARKET_CATS} from '../../web/src/modules/battle/market/config.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const cat = (state: GreenhouseState, id: GreenhouseCatId) => state.cats.find(value => value.id === id)!;
const start = () => dispatchGreenhouse(createGreenhouseBattle(), {type: 'START'});
/** Mechanics fixtures isolate a feature. Full-stage acceptance below never changes internal state. */
function quiet(): GreenhouseState {
  const state=start();state.wave=WAVES.length;state.spawnIndex=WAVES.at(-1)!.length;state.spawned=TOTAL_MINIONS;
  state.boss.cooldown=999;state.boss.skillCooldown=999;
  for(const value of state.cats){value.cooldown=999;value.block=0;}
  return state;
}
function enemy(route:GreenhouseRouteId,extra:Partial<GreenhouseEnemy>={}):GreenhouseEnemy {
  return {...ENEMY_DEFINITIONS.scout,...ROUTES[route][0],id:`test-${route}`,kind:'scout',hp:100,route,pathIndex:1,
    slowRemaining:0,slowMultiplier:1,cooldown:999,blockedBy:null,...extra};
}
const hazard=(position:Position,id=1):GreenhouseHazard=>({...position,id,remaining:6,tickIn:1,ticks:0});

test('greenhouse contains exactly the requested 34 cells, with genuine holes and 23 deployment cells',()=>{
  const state=createGreenhouseBattle();assert.equal(state.stageId,'greenhouse_boss');assert.equal(CELLS.length,34);
  assert.deepEqual(Array.from({length:6},(_,y)=>CELLS.filter(cell=>cell.y===y).map(cell=>cell.x+1)),[[2,3,4,5],[1,2,3,4,5,6,7],[2,3,4,5,6,7,8],[2,3,4,5,6,7,8,9],[2,3,4,5,6,7,8],[7]]);
  assert.equal(CELLS.filter(cell => isDeployableCell(cell)).length,23);assert.equal(cellName(MAP.goal),'B1');
  assert.deepEqual(MAP.obstacles.map(cellName),['C3','D3','D4']);assert.deepEqual(MAP.spawns.map(cellName),['C8','E8','F7']);
  assert.deepEqual(getBossCells(state.boss).map(cellName),['C6','C7','D6','D7']);
  let holes=0;for(let y=0;y<6;y++)for(let x=0;x<9;x++)if(!CELLS.some(cell=>cell.x===x&&cell.y===y)){
    holes++;assert.equal(isGreenhouseCell({x,y}),false);assert.equal(isDeployableCell({x,y}),false);
    assert.ok(getDeployError(state,'guard',{x,y}));assert.deepEqual(getSkillCells(cat(state,'caster'),{x,y}),[]);
  }
  assert.equal(holes,20);
  for(const cell of [...MAP.spawns,...MAP.obstacles,...MAP.bossCells,MAP.goal])assert.equal(isDeployableCell(cell),false);
  for(const value of state.cats)assert.equal(getDeployError(state,value.id,value),null);
  assert.deepEqual(state.cats.map(value=>value.name),['绒绒','斑斑','团子','栗栗','铃铃','墨墨']);
  assert.equal('inventory' in state,false);assert.equal('energyBlockedRemaining' in state.cats[0],false);
});

test('existing five cats keep their L02 attributes and Momo supplies protection without healing',()=>{
  for(const id of ['caster','guard','tuanzi','bruiser','controller'] as const){
    const {initial:_,...actual}=CAT_DEFINITIONS[id],{initial:__,...previous}=MARKET_CATS[id];assert.deepEqual(actual,previous);
  }
  const momo=CAT_DEFINITIONS.momo;assert.deepEqual([momo.maxHp,momo.damage,momo.interval,momo.block,momo.range],[150,12,1.1,1,'ranged']);
  assert.equal(SKILLS.momo.shield,45);assert.equal(SKILLS.momo.duration,8);assert.equal(SKILLS.momo.clearHazards,true);
  assert.equal('heal' in SKILLS.momo,false);assert.equal('diandian' in CAT_DEFINITIONS,false);
  assert.equal(RULES.bossHp,3000);assert.equal(WAVES.length,8);assert.equal(TOTAL_MINIONS,33);
  for(const difficulty of [null,'wild',3])assert.throws(()=>createGreenhouseBattle({difficulty:difficulty as never}));
});

test('all three explicit paths traverse existing non-obstacle cells, including every turn around the missing regions',()=>{
  for(const path of Object.values(ROUTES)){
    assert.ok(MAP.spawns.some(cell=>cell.x===path[0].x&&cell.y===path[0].y));assert.deepEqual(path.at(-1),MAP.goal);
    for(let i=1;i<path.length;i++){
      const from=path[i-1],to=path[i],dx=Math.sign(to.x-from.x),dy=Math.sign(to.y-from.y);
      assert.notEqual(Boolean(dx),Boolean(dy));
      for(let step=0;step<=Math.abs(to.x-from.x)+Math.abs(to.y-from.y);step++)assert.equal(isPlayableCell({x:from.x+dx*step,y:from.y+dy*step}),true);
    }
  }
});

for(const route of Object.keys(ROUTES) as GreenhouseRouteId[])test(`${route}: minion follows its complete route and leaks only after reaching B1`,()=>{
  let state=quiet();state.enemies=[enemy(route)];let steps=0,footprintVisits=0;
  for(let i=0;i<2000&&state.enemies.length;i++){
    const before=state.enemies[0];state=advanceGreenhouse(state,.05);
    if(state.enemies.length){
      steps++;const after=state.enemies[0];close(Math.abs(after.x-before.x)+Math.abs(after.y-before.y),after.speed*.05);
      assert.equal(isPlayableCell({x:Math.round(after.x),y:Math.round(after.y)}),true);assert.equal(state.leaks,0);
      if(MAP.bossCells.some(cell=>cell.x===Math.round(after.x)&&cell.y===Math.round(after.y)))footprintVisits++;
    }
  }
  assert.ok(steps>100);assert.equal(state.enemies.length,0);assert.equal(state.leaks,1);assert.equal(state.phase,'battle');
  if(route!=='lower')assert.ok(footprintVisits>0,'upper and branch minions may cross the boss footprint');
});

for(const [route,position,direction] of [
  ['upper',{x:4,y:2},{x:-1,y:0}],['lower',{x:1,y:3},{x:0,y:-1}],['branch',{x:4,y:2},{x:0,y:-1}],
] as [GreenhouseRouteId,Position,Position][])test(`${route}: blocking honors the current segment and releases without teleporting`,()=>{
  let state=quiet();Object.assign(cat(state,'guard'),position,{block:2});state.enemies=[enemy(route,{speed:3})];
  state=advanceGreenhouse(state,5);assert.equal(state.enemies[0].blockedBy,'guard');
  close(state.enemies[0].x,position.x-direction.x*RULES.contactGap);close(state.enemies[0].y,position.y-direction.y*RULES.contactGap);
  const before={...state.enemies[0]};state=dispatchGreenhouse(state,{type:'MOVE_CAT',catId:'guard',x:1,y:0});
  assert.equal(state.lastAction?.ok,true);assert.equal(state.enemies[0].blockedBy,null);close(state.enemies[0].x,before.x);close(state.enemies[0].y,before.y);
  state=advanceGreenhouse(state,.05);close(state.enemies[0].x-before.x,direction.x*.15);close(state.enemies[0].y-before.y,direction.y*.15);
});

test('upper and branch enemies share stable C5 blocker slots while overflow passes through the corner',()=>{
  let state=quiet();cat(state,'guard').block=2;
  state.enemies=[enemy('upper',{id:'upper',speed:1,x:4.6,y:2}),enemy('branch',{id:'branch',speed:1,x:4,y:2.6,pathIndex:5})];
  state=advanceGreenhouse(state,.5);assert.equal(cat(state,'guard').blockedCount,2);assert.equal(state.enemies.every(value=>value.blockedBy==='guard'),true);
  state.enemies.push(enemy('upper',{id:'overflow',speed:1,x:4.6,y:2}));state=advanceGreenhouse(state,1.8);
  const overflow=state.enemies.find(value=>value.id==='overflow')!;assert.equal(overflow.blockedBy,null);assert.equal(overflow.y,1);assert.ok(overflow.x<4);
  assert.deepEqual(state.enemies.filter(value=>value.blockedBy==='guard').map(value=>value.id),['upper','branch']);
  assert.ok(getDeployError(state,'guard',CAT_DEFINITIONS.caster.initial),'an occupied source cannot be swapped into');
});

test('four boss cells have one health pool, so a cross or forward skill damages the boss only once',()=>{
  for(const id of ['caster','controller','tuanzi'] as const){
    let state=start();cat(state,id).energy=100;const hp=state.boss.hp;
    state=dispatchGreenhouse(state,{type:'CAST_SKILL',catId:id,target:MAP.boss});
    assert.equal(state.lastAction?.ok,true);assert.equal(hp-state.boss.hp,SKILLS[id].damage);
  }
  const state=createGreenhouseBattle();assert.equal(getBossDistance(state.boss,{x:4,y:3}),1);
  for(const value of state.cats)for(const cell of getAttackCells(value))assert.equal(isPlayableCell(cell),true);
  assert.deepEqual(getSkillCells(cat(state,'caster'),{x:4,y:0}).map(cellName),['A5','A4','B5']);
});

test('seed warning selects the nearest two cats, freezes both coordinates and lands after exactly three seconds',()=>{
  let state=quiet();state.boss.skillCooldown=14;
  state=advanceGreenhouse(state,13.95);assert.equal(state.boss.phase,'idle');
  state=advanceGreenhouse(state,.05);assert.equal(state.boss.phase,'windup');assert.deepEqual(state.boss.targetCells.map(cellName),['C5','D5']);
  state=dispatchGreenhouse(state,{type:'MOVE_CAT',catId:'guard',x:4,y:1});
  state=dispatchGreenhouse(state,{type:'MOVE_CAT',catId:'tuanzi',x:4,y:4});
  assert.deepEqual(state.boss.targetCells.map(cellName),['C5','D5']);
  state=advanceGreenhouse(state,2.95);assert.equal(state.hazards.length,0);assert.equal(state.boss.phase,'windup');
  state=advanceGreenhouse(state,.05);assert.equal(state.boss.phase,'recovery');assert.equal(state.boss.slams,1);assert.equal(state.stats.dodgedSlams,1);
  assert.deepEqual(state.boss.targetCells,[]);assert.deepEqual(state.hazards.map(cellName),['C5','D5']);
  assert.equal(state.hazards.every(value=>value.remaining===6&&value.tickIn===1&&value.ticks===0),true);
  state=advanceGreenhouse(state,1);assert.equal(state.boss.phase,'idle');
  state=advanceGreenhouse(state,19.95);assert.equal(state.boss.phase,'idle');state=advanceGreenhouse(state,.05);assert.equal(state.boss.phase,'windup');
});

test('landed thorns deal no immediate damage, tick at seconds one through six, then disappear without a seventh tick',()=>{
  let state=quiet();state.boss.skillCooldown=0;state=advanceGreenhouse(state,3.05);
  assert.equal(state.hazards.length,2);assert.equal(cat(state,'guard').hp,240);assert.equal(cat(state,'tuanzi').hp,220);
  for(let second=1;second<=6;second++){
    state=advanceGreenhouse(state,.95);assert.equal(cat(state,'guard').hp,240-(second-1)*12);
    state=advanceGreenhouse(state,.05);assert.equal(cat(state,'guard').hp,240-second*12);
    assert.equal(cat(state,'tuanzi').hp,220-second*12);
    if(second<6)assert.equal(state.hazards.every(value=>value.ticks===second),true);
  }
  assert.equal(state.hazards.length,0);state=advanceGreenhouse(state,2);assert.equal(cat(state,'guard').hp,168);
});

test('cats may leave and re-enter a thorn cell; damage uses occupants at each scheduled tick',()=>{
  let state=quiet();state.hazards=[hazard(cat(state,'guard'))];
  state=advanceGreenhouse(state,1);assert.equal(cat(state,'guard').hp,228);
  state=dispatchGreenhouse(state,{type:'MOVE_CAT',catId:'guard',x:4,y:1});assert.equal(state.lastAction?.ok,true);
  state=advanceGreenhouse(state,1);assert.equal(cat(state,'guard').hp,228);
  assert.equal(getDeployError(state,'guard',{x:4,y:2}),null,'a thorn is a danger, not a new obstacle');
  state=dispatchGreenhouse(state,{type:'MOVE_CAT',catId:'guard',x:4,y:2});state=advanceGreenhouse(state,1);assert.equal(cat(state,'guard').hp,216);
});

test('Momo merges team shields by maximum value and duration, spends energy once, and never heals or revives',()=>{
  let state=quiet();cat(state,'momo').energy=100;
  Object.assign(cat(state,'guard'),{shield:60,shieldRemaining:3,hp:100});
  Object.assign(cat(state,'bruiser'),{shield:20,shieldRemaining:10,hp:90});
  Object.assign(cat(state,'caster'),{status:'retired',hp:0,energy:0});
  state=dispatchGreenhouse(state,{type:'CAST_SKILL',catId:'momo'});assert.equal(state.lastAction?.ok,true);
  assert.deepEqual([cat(state,'guard').shield,cat(state,'guard').shieldRemaining,cat(state,'guard').hp],[60,8,100]);
  assert.deepEqual([cat(state,'bruiser').shield,cat(state,'bruiser').shieldRemaining,cat(state,'bruiser').hp],[45,10,90]);
  assert.deepEqual([cat(state,'caster').shield,cat(state,'caster').hp,cat(state,'caster').status],[0,0,'retired']);
  assert.equal(cat(state,'momo').energy,0);assert.equal(cat(state,'momo').skillUses,1);
  assert.equal(dispatchGreenhouse(state,{type:'CAST_SKILL',catId:'momo'}).lastAction?.ok,false);
  assert.equal(dispatchGreenhouse(state,{type:'MOVE_CAT',catId:'caster',x:1,y:0}).lastAction?.ok,false);
});

test('Momo then Bruiser preserves the team shield and still grants the full attack buff without healing',()=>{
  let state=quiet();cat(state,'momo').energy=100;
  Object.assign(cat(state,'bruiser'),{energy:100,hp:120,cooldown:0});
  state.enemies=[enemy('lower',{x:4,y:4,speed:0,hp:1000,maxHp:1000})];
  state=dispatchGreenhouse(state,{type:'CAST_SKILL',catId:'momo'});
  assert.deepEqual([cat(state,'bruiser').shield,cat(state,'bruiser').shieldRemaining],[45,8]);
  state=dispatchGreenhouse(state,{type:'CAST_SKILL',catId:'bruiser'});assert.equal(state.lastAction?.ok,true);
  assert.deepEqual([cat(state,'bruiser').shield,cat(state,'bruiser').shieldRemaining],[45,8]);
  assert.equal(cat(state,'bruiser').hp,120);assert.equal(cat(state,'bruiser').attackBuffRemaining,8);
  assert.equal(cat(state,'momo').energy,0);assert.equal(cat(state,'bruiser').energy,0);
  state=advanceGreenhouse(state,.05);assert.equal(state.enemies[0].hp,976,'16 base damage receives the 50 percent buff');
  assert.equal(cat(state,'bruiser').hp,120);
});

test('Guard then Momo then Bruiser never reduces existing higher shields or longer durations',()=>{
  let state=quiet();Object.assign(cat(state,'guard'),{energy:100,hp:100,shield:75,shieldRemaining:10});
  Object.assign(cat(state,'bruiser'),{energy:100,hp:90,shield:55,shieldRemaining:11});cat(state,'momo').energy=100;
  const health=state.cats.map(value=>value.hp);
  for(const id of ['guard','momo','bruiser'] as const){
    const before=structuredClone(state.cats);
    state=dispatchGreenhouse(state,{type:'CAST_SKILL',catId:id});assert.equal(state.lastAction?.ok,true);
    for(const value of state.cats){
      const previous=before.find(friend=>friend.id===value.id)!;
      assert.ok(value.shield>=previous.shield);assert.ok(value.shieldRemaining>=previous.shieldRemaining);
    }
    assert.deepEqual(state.cats.map(value=>value.hp),health);
  }
  assert.deepEqual([cat(state,'guard').shield,cat(state,'guard').shieldRemaining],[75,10]);
  assert.deepEqual([cat(state,'bruiser').shield,cat(state,'bruiser').shieldRemaining],[55,11]);
  assert.equal(cat(state,'bruiser').attackBuffRemaining,8);assert.equal(state.stats.skills,3);
});

test('Momo clears every already-landed hazard but cannot cancel a pending seed warning',()=>{
  let state=quiet();state.hazards=[hazard({x:3,y:1}),hazard({x:3,y:4},2)];cat(state,'momo').energy=100;state.boss.skillCooldown=0;
  state=advanceGreenhouse(state,.05);const locked=structuredClone(state.boss.targetCells);
  state=dispatchGreenhouse(state,{type:'CAST_SKILL',catId:'momo'});assert.equal(state.hazards.length,0);assert.deepEqual(state.boss.targetCells,locked);assert.equal(state.boss.phase,'windup');
  state=advanceGreenhouse(state,3);assert.equal(state.hazards.length,2);assert.equal(cat(state,'momo').energy,15);
  const landed=quiet();landed.hazards=[hazard(cat(landed,'guard')),hazard(cat(landed,'tuanzi'),2)];cat(landed,'momo').energy=100;
  const cleared=dispatchGreenhouse(landed,{type:'CAST_SKILL',catId:'momo'});assert.equal(cleared.hazards.length,0);
  const after=advanceGreenhouse(cleared,6);assert.equal(cat(after,'guard').hp,240);assert.equal(cat(after,'momo').energy,30);
});

test('defeating the boss instantly clears both pending targets and landed thorns without waiting for another tick',()=>{
  let state=quiet();state.boss.hp=40;state.boss.skillCooldown=0;cat(state,'caster').energy=100;
  state.enemies=[enemy('lower',{speed:0})];state.hazards=[hazard(cat(state,'guard'))];state=advanceGreenhouse(state,.05);
  assert.equal(state.boss.phase,'windup');state=dispatchGreenhouse(state,{type:'CAST_SKILL',catId:'caster',target:MAP.boss});
  assert.equal(state.boss.phase,'defeated');assert.deepEqual(state.boss.targetCells,[]);assert.deepEqual(state.hazards,[]);
  state=advanceGreenhouse(state,6);assert.equal(cat(state,'guard').hp,240);assert.equal(state.boss.slams,0);assert.equal(state.phase,'battle');
});

for(const speed of [.5,1,2] as const)test(`${speed}x uses one exact clock for warning, thorns, energy, shields, buffs and slow`,()=>{
  let state=quiet();cat(state,'guard').shield=45;cat(state,'guard').shieldRemaining=8;cat(state,'bruiser').attackBuffRemaining=8;
  state.hazards=[hazard(cat(state,'guard'))];state.enemies=[enemy('lower',{slowRemaining:4,slowMultiplier:.6,speed:.5})];
  state.boss.phase='windup';state.boss.targetCells=[{x:4,y:2},{x:4,y:3}];
  state=dispatchGreenhouse(state,{type:'SET_SPEED',speed});
  for(const action of [{type:'PAUSE',paused:true},{type:'SET_EXTERNAL_PAUSE',paused:true},{type:'SET_UI_PAUSE',paused:true}] as const){
    const paused=dispatchGreenhouse(state,action);assert.equal(advanceGreenhouse(paused,10),paused);
  }
  state=advanceGreenhouse(state,2/speed);close(state.elapsed,2);close(state.boss.phaseTime,2);assert.equal(state.boss.phase,'windup');
  close(state.hazards[0].remaining,4);assert.equal(state.hazards[0].ticks,2);assert.equal(cat(state,'guard').shield,21);
  close(cat(state,'guard').shieldRemaining,6);close(cat(state,'bruiser').attackBuffRemaining,6);close(cat(state,'momo').energy,10);
  close(state.enemies[0].slowRemaining,2);close(state.enemies[0].x,6.4);
});

test('inspection and aiming restore speed without granting energy, and raw frame time is capped before scaling',()=>{
  const base=quiet();let state=dispatchGreenhouse(base,{type:'SET_SPEED',speed:2});
  state=dispatchGreenhouse(state,{type:'INSPECT',catId:'momo'});assert.equal(getGreenhouseSpeed(state),.5);close(advanceGreenhouse(state,4).elapsed,2);
  state=dispatchGreenhouse(state,{type:'CLOSE_INSPECTION'});cat(state,'controller').energy=100;
  state=dispatchGreenhouse(state,{type:'SELECT_SKILL',catId:'controller'});assert.equal(getGreenhouseSpeed(state),1);
  state=dispatchGreenhouse(state,{type:'CANCEL_SKILL'});assert.equal(getGreenhouseSpeed(state),2);assert.equal(cat(state,'controller').energy,100);
  close(advanceGreenhouse(dispatchGreenhouse(base,{type:'SET_SPEED',speed:2}),100).elapsed,60);
  assert.equal(advanceGreenhouse(createGreenhouseBattle(),30).cats[0].energy,0);
});

test('boss basics use the nearest footprint at range three, every two seconds, and do not overlap seed phases',()=>{
  let state=quiet();state.boss.cooldown=2;
  state=advanceGreenhouse(state,1.95);assert.equal(state.boss.attacks,0);state=advanceGreenhouse(state,.05);assert.equal(state.boss.attacks,1);assert.equal(cat(state,'guard').hp,228);
  state.boss.skillCooldown=0;state.boss.cooldown=0;state=advanceGreenhouse(state,.05);assert.equal(state.boss.phase,'windup');assert.equal(state.boss.attacks,1);
  state=advanceGreenhouse(state,3.95);assert.equal(state.boss.attacks,1);
});

test('thorn damage can retire a cat at zero, cancel its aim and release its held minion permanently',()=>{
  let state=quiet();Object.assign(cat(state,'caster'),{x:4,y:2,hp:12,energy:100,block:1});Object.assign(cat(state,'guard'),{x:1,y:0});
  state.enemies=[enemy('upper',{x:4.42,y:2,blockedBy:'caster',speed:0})];state.hazards=[hazard(cat(state,'caster'))];
  state=dispatchGreenhouse(state,{type:'SELECT_SKILL',catId:'caster'});state=advanceGreenhouse(state,1);
  assert.equal(cat(state,'caster').status,'retired');assert.equal(cat(state,'caster').hp,0);assert.equal(cat(state,'caster').energy,0);assert.equal(state.aim,null);assert.equal(state.enemies[0].blockedBy,null);
  assert.deepEqual(getAttackCells(cat(state,'caster')),[]);assert.deepEqual(getSkillCells(cat(state,'caster'),MAP.boss),[]);
  state=advanceGreenhouse(state,2);assert.equal(cat(state,'caster').energy,0);
  const all=quiet();for(const value of all.cats){value.status='retired';value.hp=0;}assert.equal(advanceGreenhouse(all,.05).phase,'lost');
});

test('three leaks lose, final pending spawns prevent early completion, and both boss and all waves are required to win',()=>{
  const leaking=quiet();leaking.enemies=['a','b','c'].map(id=>enemy('upper',{id,x:.01,y:1,pathIndex:3,speed:2}));
  assert.equal(advanceGreenhouse(leaking,.05).phase,'lost');assert.equal(dispatchGreenhouse(start(),{type:'RETREAT'}).phase,'lost');
  const state=quiet();assert.equal(advanceGreenhouse(state,.05).phase,'battle');state.boss.hp=0;state.boss.phase='defeated';assert.equal(advanceGreenhouse(state,.05).phase,'won');
  state.spawnIndex=WAVES.at(-1)!.length-1;state.spawned=TOTAL_MINIONS-1;assert.equal(advanceGreenhouse(state,.05).phase,'battle');
});

test('retired cats, reserved cells, holes, paused skills and removed item actions are rejected',()=>{
  const base=start();cat(base,'momo').energy=100;
  for(const action of [{type:'USE_ITEM'},{type:'REFORM'},{type:'RESTART'}])assert.equal(dispatchGreenhouse(base,action as GreenhouseAction).lastAction?.ok,false);
  for(const cell of [...MAP.obstacles,...MAP.spawns,...MAP.bossCells,MAP.goal,{x:0,y:0}])assert.ok(getDeployError(base,'guard',cell));
  for(const action of [{type:'PAUSE',paused:true},{type:'SET_EXTERNAL_PAUSE',paused:true},{type:'SET_UI_PAUSE',paused:true}] as const)assert.equal(dispatchGreenhouse(dispatchGreenhouse(base,action),{type:'CAST_SKILL',catId:'momo'}).lastAction?.ok,false);
  assert.match(getGreenhouseAdvice(base),/护盾/);
});

/** Acceptance driver only calls validated actions and the clock; no HP, energy, wave, or roster writes. */
function playGreenhouse(difficulty:BattleDifficulty){
  let state=dispatchGreenhouse(createGreenhouseBattle({difficulty}),{type:'START'}),nextObservation=0;
  const seen=new Set<string>(),routes=new Set<GreenhouseRouteId>(),waves=new Set<number>();
  const send=(action:GreenhouseAction)=>{state=dispatchGreenhouse(state,action);assert.notEqual(state.lastAction?.ok,false,state.lastAction?.message);};
  for(let step=0;step<18000&&state.phase==='battle';step++){
    waves.add(state.wave);
    for(const value of state.enemies)if(!seen.has(value.id)){seen.add(value.id);routes.add(value.route);assert.equal(value.maxHp,Math.round(ENEMY_DEFINITIONS[value.kind].maxHp*DIFFICULTIES[difficulty].hpMultiplier));}
    if(!state.enemies.length&&state.spawnIndex<WAVES[state.wave-1].length)assert.equal(state.nextWaveIn,null);
    if(state.elapsed+1e-8>=nextObservation){
      nextObservation=state.elapsed+.5;
      const dangers=[...(state.boss.phase==='windup'?state.boss.targetCells:[]),...state.hazards];
      const dangerous=(position:Position)=>dangers.some(cell=>cell.x===position.x&&cell.y===position.y);
      const threatened=state.cats.find(value=>value.status==='active'&&dangerous(value));
      if(threatened){
        const choices=CELLS.filter(cell=>isDeployableCell(cell)&&!dangerous(cell)&&!state.cats.some(value=>value.status==='active'&&value.x===cell.x&&value.y===cell.y)&&!getDeployError(state,threatened.id,cell))
          .sort((a,b)=>Math.abs(a.x-threatened.x)+Math.abs(a.y-threatened.y)-Math.abs(b.x-threatened.x)-Math.abs(b.y-threatened.y));
        if(choices[0])send({type:'MOVE_CAT',catId:threatened.id,...choices[0]});
      }else{
        const moved=state.cats.find(value=>value.status==='active'&&(value.x!==CAT_DEFINITIONS[value.id].initial.x||value.y!==CAT_DEFINITIONS[value.id].initial.y)&&!dangerous(CAT_DEFINITIONS[value.id].initial)&&!getDeployError(state,value.id,CAT_DEFINITIONS[value.id].initial));
        if(moved)send({type:'MOVE_CAT',catId:moved.id,...CAT_DEFINITIONS[moved.id].initial});
      }
      for(const id of ['momo','guard','bruiser','controller','caster','tuanzi'] as const){
        const value=cat(state,id);if(value.status!=='active'||value.energy<100)continue;
        if(id==='controller'||id==='caster'){
          let best={...MAP.boss,score:0};
          for(const target of CELLS){
            const cells=getSkillCells(value,target);let score=state.enemies.filter(enemy=>cells.some(cell=>cell.x===Math.round(enemy.x)&&cell.y===Math.round(enemy.y))).length*3;
            if(state.boss.hp>0&&getBossCells(state.boss).some(part=>cells.some(cell=>cell.x===part.x&&cell.y===part.y)))score++;
            if(score>best.score)best={...target,score};
          }
          if(best.score){send({type:'SELECT_SKILL',catId:id});send({type:'AIM_SKILL',...best});send({type:'CAST_SKILL',catId:id});}
        }else send({type:'CAST_SKILL',catId:id});
      }
    }
    state=advanceGreenhouse(state,.05);
  }
  return {state,waves:[...waves],routes:[...routes],seen:seen.size};
}

for(const difficulty of ['low','medium','high'] as const)test(`${difficulty}: legal no-healing play completes all eight waves and the 3000-base-HP boss`,context=>{
  const result=playGreenhouse(difficulty),state=result.state;
  assert.equal(state.phase,'won');assert.equal(state.wave,8);assert.equal(state.boss.hp,0);assert.equal(state.spawned,33);assert.equal(state.defeated+state.leaks,33);assert.equal(state.leaks,0);
  assert.deepEqual(result.waves,[1,2,3,4,5,6,7,8]);assert.equal(result.routes.length,3);assert.ok(result.seen>=32);
  assert.ok(state.stats.skills>=25);assert.ok(state.cats.filter(value=>value.status==='active').length>=5);
  for(const value of state.cats)if(value.status==='retired'){
    assert.equal(value.hp,0);assert.equal(value.energy,0);assert.equal(dispatchGreenhouse(state,{type:'MOVE_CAT',catId:value.id,x:1,y:0}).lastAction?.ok,false);
  }
  assert.deepEqual(state.hazards,[]);assert.deepEqual(state.boss.targetCells,[]);
  context.diagnostic(JSON.stringify({difficulty,seconds:Number(state.elapsed.toFixed(2)),leaks:state.leaks,skills:state.stats.skills,cats:state.cats.map(value=>({name:value.name,hp:value.hp,status:value.status}))}));
});
