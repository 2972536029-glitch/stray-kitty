import test from 'node:test';
import assert from 'node:assert/strict';
import {CAT_DEFINITIONS, CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, ROUTES, RULES, SKILLS, TOTAL_MINIONS, WAVES} from '../../web/src/modules/battle/tunnel/config.ts';
import {advanceTunnel, cellName, createTunnelBattle, dispatchTunnel, getAttackCells, getBossCells, getBossDistance, getDeployError, getTunnelAdvice, getTunnelSpeed, getSkillCells, isDarkened, isEnemyVisible, isDeployableCell, isTunnelCell, isPlayableCell} from '../../web/src/modules/battle/tunnel/engine.ts';
import type {BattleDifficulty, TunnelAction, TunnelCatId, TunnelEnemy, TunnelRouteId, TunnelState, Position} from '../../web/src/modules/battle/tunnel/types.ts';
import {CAT_DEFINITIONS as CHAPTER_CATS} from '../../web/src/modules/battle/chapter/config.ts';
import {CAT_DEFINITIONS as GREENHOUSE_CATS} from '../../web/src/modules/battle/greenhouse/config.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const cat = (state: TunnelState, id: TunnelCatId) => state.cats.find(value => value.id === id)!;
const start = () => dispatchTunnel(createTunnelBattle(), {type: 'START'});
/** Mechanics fixtures isolate a feature. Full-stage acceptance below never changes internal state. */
function quiet(): TunnelState {
  const state=start();state.wave=WAVES.length;state.spawnIndex=WAVES.at(-1)!.length;state.spawned=TOTAL_MINIONS;
  state.boss.cooldown=999;state.boss.skillCooldown=999;
  for(const value of state.cats){value.cooldown=999;value.block=0;}
  return state;
}
function enemy(route:TunnelRouteId,extra:Partial<TunnelEnemy>={}):TunnelEnemy {
  return {...ENEMY_DEFINITIONS.scout,...ROUTES[route][0],id:`test-${route}`,kind:'scout',hp:100,route,pathIndex:1,
    slowRemaining:0,slowMultiplier:1,cooldown:999,blockedBy:null,...extra};
}

test('tunnel has 37 real cells, 9 blocking obstacles, an open A1 detour and 20 legal deployment cells',()=>{
  const state=createTunnelBattle();assert.equal(state.stageId,'tunnel_boss');assert.equal(CELLS.length,37);
  assert.deepEqual(Array.from({length:5},(_,y)=>CELLS.filter(cell=>cell.y===y).map(cell=>cell.x+1)),[[1,2,3,4,5,6,7,8],[1,2,3,4,5,6,7,8],[1,2,3,4,5,6,7,8],[1,2,3,4,5,6,7,8],[4,5,6,7,8]]);
  assert.equal(CELLS.filter(isDeployableCell).length,20);assert.equal(cellName(MAP.goal),'C2');
  assert.deepEqual(MAP.obstacles.map(cellName),['A3','A7','A8','B2','C8','D1','D2','E7','E8']);
  assert.deepEqual(MAP.spawns.map(cellName),['A2','B8','D8']);assert.equal(isPlayableCell({x:0,y:0}),true);
  assert.deepEqual(getBossCells(state.boss).map(cellName),['C6','C7','D6','D7']);
  for(const x of [0,1,2]){
    const hole={x,y:4};assert.equal(isTunnelCell(hole),false);assert.ok(getDeployError(state,'guard',hole));assert.deepEqual(getSkillCells(cat(state,'caster'),hole),[]);
  }
  for(const cell of [...MAP.spawns,...MAP.obstacles,...MAP.bossCells,MAP.goal])assert.equal(isDeployableCell(cell),false);
  for(const value of state.cats)assert.equal(getDeployError(state,value.id,value),null);
  assert.deepEqual(state.cats.map(value=>value.name),['绒绒','斑斑','团子','栗栗','点点','墨墨']);
  assert.equal('inventory' in state,false);assert.equal('hazards' in state,false);
  assert.equal('energyBlockedRemaining' in state.cats[0],false);
});

test('all six cats retain earlier base attributes, with chapter-specific night vision replacing thorn clearing',()=>{
  for(const id of ['caster','guard','tuanzi','diandian'] as const){
    const {initial:_,...actual}=CAT_DEFINITIONS[id],{initial:__,...previous}=CHAPTER_CATS[id];assert.deepEqual(actual,previous);
  }
  for(const id of ['bruiser','momo'] as const){
    const {initial:_,...actual}=CAT_DEFINITIONS[id],{initial:__,...previous}=GREENHOUSE_CATS[id];assert.deepEqual(actual,previous);
  }
  assert.equal(SKILLS.momo.shield,45);assert.equal(SKILLS.momo.duration,8);assert.equal(SKILLS.momo.nightVision,10);
  assert.equal('clearHazards' in SKILLS.momo,false);assert.equal('heal' in SKILLS.momo,false);assert.equal(SKILLS.diandian.heal,80);
  assert.equal(RULES.bossHp,3400);assert.equal(WAVES.length,8);assert.equal(TOTAL_MINIONS,32);
  for(const difficulty of [null,'wild',3])assert.throws(()=>createTunnelBattle({difficulty:difficulty as never}));
});

test('every route crosses only existing unobstructed cells; A2 must detour through A1 and B1 instead of B2',()=>{
  for(const path of Object.values(ROUTES)){
    assert.ok(MAP.spawns.some(cell=>cell.x===path[0].x&&cell.y===path[0].y));assert.deepEqual(path.at(-1),MAP.goal);
    for(let i=1;i<path.length;i++){
      const from=path[i-1],to=path[i],dx=Math.sign(to.x-from.x),dy=Math.sign(to.y-from.y);
      assert.notEqual(Boolean(dx),Boolean(dy));
      for(let step=0;step<=Math.abs(to.x-from.x)+Math.abs(to.y-from.y);step++)assert.equal(isPlayableCell({x:from.x+dx*step,y:from.y+dy*step}),true);
    }
  }
  assert.deepEqual(ROUTES.upper.map(cellName),['A2','A1','C1','C2']);
  assert.ok(WAVES[0].find(value=>value.route==='upper')!.at>=8);
  assert.equal(WAVES.flat().some(value=>value.route==='upper'&&value.kind==='heavy'),false);
});

for(const route of Object.keys(ROUTES) as TunnelRouteId[])test(`${route}: minion follows the full route and leaks only upon C2`,()=>{
  let state=quiet();state.enemies=[enemy(route)];const visited=new Set<string>();
  for(let i=0;i<2000&&state.enemies.length;i++){
    const before=state.enemies[0];visited.add(cellName({x:Math.round(before.x),y:Math.round(before.y)}));state=advanceTunnel(state,.05);
    if(state.enemies.length){
      const after=state.enemies[0];close(Math.abs(after.x-before.x)+Math.abs(after.y-before.y),after.speed*.05);
      assert.equal(isPlayableCell({x:Math.round(after.x),y:Math.round(after.y)}),true);assert.equal(state.leaks,0);
    }
  }
  assert.equal(state.enemies.length,0);assert.equal(state.leaks,1);assert.equal(state.phase,'battle');
  if(route==='upper'){assert.ok(visited.has('A1'));assert.ok(visited.has('B1'));assert.equal(visited.has('B2'),false);}
  if(route==='branch'){assert.ok(visited.has('D7'));assert.ok(visited.has('D6'));}
});

test('four boss cells share one health pool, and footprints or skills never create cells in map holes',()=>{
  for(const id of ['caster','tuanzi'] as const){
    let state=start();cat(state,id).energy=100;const hp=state.boss.hp;
    state=dispatchTunnel(state,{type:'CAST_SKILL',catId:id,target:MAP.boss});
    assert.equal(state.lastAction?.ok,true);assert.equal(hp-state.boss.hp,SKILLS[id].damage);
  }
  const state=createTunnelBattle();assert.equal(getBossDistance(state.boss,{x:4,y:3}),1);
  for(const value of state.cats)for(const cell of getAttackCells(value))assert.equal(isPlayableCell(cell),true);
  assert.deepEqual(getSkillCells(cat(state,'caster'),{x:3,y:4}).map(cellName),['E4','E5','D4']);
});

test('first pulse warns at 24 seconds, deals one 26-damage hit at 26.5, and darkness automatically expires eight seconds later',()=>{
  let state=quiet();state.boss.skillCooldown=RULES.bossPulseFirst;
  state=advanceTunnel(state,23.95);assert.equal(state.boss.phase,'idle');assert.equal(cat(state,'momo').energy,100);
  state=advanceTunnel(state,.05);assert.equal(state.boss.phase,'windup');assert.equal(state.darknessRemaining,0);
  state=advanceTunnel(state,2.45);assert.equal(state.boss.phase,'windup');assert.equal(cat(state,'caster').hp,80);
  state=advanceTunnel(state,.05);assert.equal(state.boss.phase,'recovery');assert.equal(state.boss.slams,1);assert.equal(state.darknessRemaining,8);
  for(const value of state.cats)assert.equal(value.hp,value.maxHp-26);
  assert.equal(isDarkened(state),true);assert.deepEqual(state.boss.targetCells,[]);
  state=advanceTunnel(state,7.95);assert.equal(isDarkened(state),true);state=advanceTunnel(state,.05);assert.equal(isDarkened(state),false);
  assert.equal(state.darknessRemaining,0);state=advanceTunnel(state,17.45);assert.equal(state.boss.phase,'idle');
  state=advanceTunnel(state,.05);assert.equal(state.boss.phase,'windup');
});

test('Momo can pre-cast night vision and shield without cancelling the pulse, or restore sight after it lands',()=>{
  let state=quiet();state.boss.phase='windup';cat(state,'momo').energy=100;
  state=dispatchTunnel(state,{type:'CAST_SKILL',catId:'momo'});assert.equal(state.boss.phase,'windup');
  state=advanceTunnel(state,2.5);assert.equal(state.boss.slams,1);assert.equal(state.darknessRemaining,8);close(state.nightVisionRemaining,7.5);
  assert.equal(isDarkened(state),false);for(const value of state.cats){assert.equal(value.hp,value.maxHp);assert.equal(value.shield,19);}
  state=advanceTunnel(state,7.5);assert.equal(state.nightVisionRemaining,0);close(state.darknessRemaining,.5);assert.equal(isDarkened(state),true);
  state=advanceTunnel(state,.5);assert.equal(isDarkened(state),false);
  const dark=quiet();dark.darknessRemaining=8;cat(dark,'momo').energy=100;
  const restored=dispatchTunnel(dark,{type:'CAST_SKILL',catId:'momo'});assert.equal(restored.darknessRemaining,8);assert.equal(restored.nightVisionRemaining,10);assert.equal(isDarkened(restored),false);
});

test('darkness reveals only one-cell proximity to active cats or the protected protagonist, with no dependence on Momo',()=>{
  const state=quiet();state.darknessRemaining=8;
  assert.equal(isEnemyVisible(state,{x:7,y:1}),false);assert.equal(isEnemyVisible(state,{x:4,y:2}),true);
  assert.equal(isEnemyVisible(state,{x:1,y:2}),true);assert.equal(isEnemyVisible(state,{x:1,y:2.9}),true);
  for(const value of state.cats){value.status='retired';value.hp=0;}
  assert.equal(isEnemyVisible(state,{x:4,y:2}),false);assert.equal(isEnemyVisible(state,MAP.goal),true);
  cat(state,'guard').status='active';cat(state,'guard').hp=100;
  const recovered=advanceTunnel(state,8);assert.equal(recovered.darknessRemaining,0);assert.equal(isEnemyVisible(recovered,{x:7,y:1}),true);
});

test('hidden enemies still move, block and take automatic and area damage; darkness never disables charging or skills',()=>{
  let state=quiet();state.darknessRemaining=8;cat(state,'caster').cooldown=0;
  state.boss.hp=0;state.boss.phase='defeated';
  state.enemies=[enemy('lower',{x:6,y:1,hp:100,maxHp:100,speed:.55})];
  assert.equal(isEnemyVisible(state,state.enemies[0]),false);
  state=advanceTunnel(state,.05);assert.equal(state.enemies[0].hp,80);assert.ok(state.enemies[0].x<6);close(cat(state,'momo').energy,.25);
  cat(state,'caster').energy=100;state=dispatchTunnel(state,{type:'CAST_SKILL',catId:'caster',target:{x:6,y:1}});
  assert.equal(state.lastAction?.ok,true);assert.equal(state.enemies[0].hp,35);
  state=dispatchTunnel(state,{type:'MOVE_CAT',catId:'bruiser',x:3,y:2});assert.equal(state.lastAction?.ok,true);
  cat(state,'caster').block=1;cat(state,'caster').cooldown=999;state.enemies=[enemy('lower',{x:4.6,y:1,speed:1})];
  state=advanceTunnel(state,.2);assert.equal(state.enemies[0].blockedBy,'caster');
});

test('a real move cannot overlap a hidden enemy, but its rejection does not identify unseen occupancy',()=>{
  const state=quiet();state.darknessRemaining=8;state.enemies=[enemy('lower',{x:6,y:1,speed:0})];
  assert.equal(isEnemyVisible(state,state.enemies[0]),false);
  assert.equal(getDeployError(state,'guard',{x:6,y:1}),'黑暗中暂时无法安全移到这格。');
  const rejected=dispatchTunnel(state,{type:'MOVE_CAT',catId:'guard',x:6,y:1});
  assert.equal(rejected.lastAction?.ok,false);assert.deepEqual([cat(rejected,'guard').x,cat(rejected,'guard').y],[0,2]);
  state.nightVisionRemaining=10;
  assert.equal(getDeployError(state,'guard',{x:6,y:1}),'这格有黑影，暂时不能移动过去。');
});

test('Momo merges shields by maximum value and duration, never heals or revives; Diandian only heals active cats',()=>{
  let state=quiet();cat(state,'momo').energy=100;
  Object.assign(cat(state,'guard'),{shield:60,shieldRemaining:3,hp:100});
  Object.assign(cat(state,'bruiser'),{shield:20,shieldRemaining:10,hp:90});
  Object.assign(cat(state,'caster'),{status:'retired',hp:0,energy:0});
  state=dispatchTunnel(state,{type:'CAST_SKILL',catId:'momo'});assert.equal(state.lastAction?.ok,true);
  assert.deepEqual([cat(state,'guard').shield,cat(state,'guard').shieldRemaining,cat(state,'guard').hp],[60,8,100]);
  assert.deepEqual([cat(state,'bruiser').shield,cat(state,'bruiser').shieldRemaining,cat(state,'bruiser').hp],[45,10,90]);
  assert.deepEqual([cat(state,'caster').shield,cat(state,'caster').hp,cat(state,'caster').status],[0,0,'retired']);
  assert.equal(cat(state,'momo').energy,0);assert.equal(cat(state,'momo').skillUses,1);
  assert.equal(dispatchTunnel(state,{type:'CAST_SKILL',catId:'momo'}).lastAction?.ok,false);
  cat(state,'diandian').energy=100;state=dispatchTunnel(state,{type:'CAST_SKILL',catId:'diandian'});
  assert.equal(cat(state,'guard').hp,180);assert.equal(cat(state,'bruiser').hp,170);assert.equal(cat(state,'diandian').hp,140);
  assert.equal(cat(state,'caster').hp,0);assert.equal(cat(state,'caster').status,'retired');
  assert.equal(dispatchTunnel(state,{type:'MOVE_CAT',catId:'caster',x:3,y:0}).lastAction?.ok,false);
});

test('Guard and Bruiser keep stronger shields after Momo, and attack buffs remain independent',()=>{
  let state=quiet();Object.assign(cat(state,'guard'),{energy:100,hp:100,shield:75,shieldRemaining:10});
  Object.assign(cat(state,'bruiser'),{energy:100,hp:90,shield:55,shieldRemaining:11});cat(state,'momo').energy=100;
  const health=state.cats.map(value=>value.hp);
  for(const id of ['guard','momo','bruiser'] as const){
    const before=structuredClone(state.cats);state=dispatchTunnel(state,{type:'CAST_SKILL',catId:id});assert.equal(state.lastAction?.ok,true);
    for(const value of state.cats){const previous=before.find(friend=>friend.id===value.id)!;assert.ok(value.shield>=previous.shield);assert.ok(value.shieldRemaining>=previous.shieldRemaining);}
    assert.deepEqual(state.cats.map(value=>value.hp),health);
  }
  assert.deepEqual([cat(state,'guard').shield,cat(state,'guard').shieldRemaining],[75,10]);
  assert.deepEqual([cat(state,'bruiser').shield,cat(state,'bruiser').shieldRemaining],[55,11]);
  assert.equal(cat(state,'bruiser').attackBuffRemaining,8);
});

for(const speed of [.5,1,2] as const)test(`${speed}x keeps darkness, night vision, energy, shields and buffs on one pausable clock`,()=>{
  let state=quiet();state.darknessRemaining=8;state.nightVisionRemaining=10;
  cat(state,'guard').shield=45;cat(state,'guard').shieldRemaining=8;cat(state,'bruiser').attackBuffRemaining=8;
  state=dispatchTunnel(state,{type:'SET_SPEED',speed});
  for(const action of [{type:'PAUSE',paused:true},{type:'SET_EXTERNAL_PAUSE',paused:true},{type:'SET_UI_PAUSE',paused:true}] as const){
    const paused=dispatchTunnel(state,action);assert.equal(advanceTunnel(paused,10),paused);
  }
  state=advanceTunnel(state,2/speed);close(state.elapsed,2);close(state.darknessRemaining,6);close(state.nightVisionRemaining,8);
  close(cat(state,'guard').shieldRemaining,6);close(cat(state,'bruiser').attackBuffRemaining,6);close(cat(state,'momo').energy,10);
});

test('inspection and aiming restore speed without granting energy; frame cap is applied before scaling',()=>{
  const base=quiet();let state=dispatchTunnel(base,{type:'SET_SPEED',speed:2});
  state=dispatchTunnel(state,{type:'INSPECT',catId:'momo'});assert.equal(getTunnelSpeed(state),.5);close(advanceTunnel(state,4).elapsed,2);
  state=dispatchTunnel(state,{type:'CLOSE_INSPECTION'});cat(state,'caster').energy=100;
  state=dispatchTunnel(state,{type:'SELECT_SKILL',catId:'caster'});assert.equal(getTunnelSpeed(state),1);
  state=dispatchTunnel(state,{type:'CANCEL_SKILL'});assert.equal(getTunnelSpeed(state),2);assert.equal(cat(state,'caster').energy,100);
  close(advanceTunnel(dispatchTunnel(base,{type:'SET_SPEED',speed:2}),100).elapsed,60);
  assert.equal(advanceTunnel(createTunnelBattle(),30).cats[0].energy,0);
});

test('Boss basic attacks use the nearest footprint and do not overlap the windup or recovery',()=>{
  let state=quiet();state.boss.cooldown=2.2;
  state=advanceTunnel(state,2.15);assert.equal(state.boss.attacks,0);state=advanceTunnel(state,.05);assert.equal(state.boss.attacks,1);assert.equal(cat(state,'tuanzi').hp,208);
  state.boss.skillCooldown=0;state.boss.cooldown=0;state=advanceTunnel(state,.05);assert.equal(state.boss.phase,'windup');assert.equal(state.boss.attacks,1);
  state=advanceTunnel(state,3.5);assert.equal(state.boss.attacks,1);
});

test('pulse retirement cancels aiming and releases blockers permanently; absence of Momo never softlocks darkness',()=>{
  let state=quiet();Object.assign(cat(state,'caster'),{x:4,y:1,hp:26,energy:100,block:1});
  state.enemies=[enemy('lower',{x:4.42,y:1,blockedBy:'caster',speed:0})];state.boss.phase='windup';
  state=dispatchTunnel(state,{type:'SELECT_SKILL',catId:'caster'});state=advanceTunnel(state,2.5);
  assert.equal(cat(state,'caster').status,'retired');assert.equal(cat(state,'caster').hp,0);assert.equal(cat(state,'caster').energy,0);assert.equal(state.aim,null);assert.equal(state.enemies[0].blockedBy,null);
  assert.deepEqual(getAttackCells(cat(state,'caster')),[]);assert.deepEqual(getSkillCells(cat(state,'caster'),MAP.boss),[]);
  Object.assign(cat(state,'momo'),{hp:0,status:'retired',energy:0});state=advanceTunnel(state,8);
  assert.equal(state.darknessRemaining,0);assert.equal(cat(state,'caster').energy,0);assert.equal(cat(state,'momo').energy,0);
  const all=quiet();for(const value of all.cats){value.status='retired';value.hp=0;}assert.equal(advanceTunnel(all,.05).phase,'lost');
});

test('defeating the Boss clears darkness and pending pulse immediately but still requires remaining minions',()=>{
  let state=quiet();state.boss.hp=40;state.boss.phase='windup';state.darknessRemaining=8;cat(state,'caster').energy=100;
  state.enemies=[enemy('branch',{speed:0})];state=dispatchTunnel(state,{type:'CAST_SKILL',catId:'caster',target:MAP.boss});
  assert.equal(state.boss.phase,'defeated');assert.equal(state.darknessRemaining,0);assert.deepEqual(state.boss.targetCells,[]);
  state=advanceTunnel(state,6);assert.equal(cat(state,'guard').hp,240);assert.equal(state.boss.slams,0);assert.equal(state.phase,'battle');
});

test('three leaks lose; final pending spawns and living Boss prevent early victory',()=>{
  const leaking=quiet();leaking.enemies=['a','b','c'].map(id=>enemy('upper',{id,x:.99,y:2,pathIndex:3,speed:2}));
  assert.equal(advanceTunnel(leaking,.05).phase,'lost');assert.equal(dispatchTunnel(start(),{type:'RETREAT'}).phase,'lost');
  const state=quiet();assert.equal(advanceTunnel(state,.05).phase,'battle');state.boss.hp=0;state.boss.phase='defeated';assert.equal(advanceTunnel(state,.05).phase,'won');
  state.spawnIndex=WAVES.at(-1)!.length-1;state.spawned=TOTAL_MINIONS-1;assert.equal(advanceTunnel(state,.05).phase,'battle');
});

test('reserved cells, holes, paused skills and removed consumable actions are rejected',()=>{
  const base=start();cat(base,'momo').energy=100;
  for(const action of [{type:'USE_ITEM'},{type:'REFORM'},{type:'RESTART'}])assert.equal(dispatchTunnel(base,action as TunnelAction).lastAction?.ok,false);
  for(const cell of [...MAP.obstacles,...MAP.spawns,...MAP.bossCells,MAP.goal,{x:0,y:4}])assert.ok(getDeployError(base,'guard',cell));
  for(const action of [{type:'PAUSE',paused:true},{type:'SET_EXTERNAL_PAUSE',paused:true},{type:'SET_UI_PAUSE',paused:true}] as const)assert.equal(dispatchTunnel(dispatchTunnel(base,action),{type:'CAST_SKILL',catId:'momo'}).lastAction?.ok,false);
  for(const state of [createTunnelBattle(),dispatchTunnel(base,{type:'RETREAT'})]){
    cat(state,'momo').energy=100;assert.equal(dispatchTunnel(state,{type:'CAST_SKILL',catId:'momo'}).lastAction?.ok,false);
  }
  assert.match(getTunnelAdvice(base),/夜视/);
});

/** Real acceptance driver: default formation, no carry or state writes; only clock and legal skills. */
function playTunnel(difficulty:BattleDifficulty,carry?:unknown){
  let state=dispatchTunnel(createTunnelBattle({difficulty,carry}),{type:'START'}),nextObservation=0;
  const seen=new Set<string>(),routes=new Set<TunnelRouteId>(),waves=new Set<number>();
  const send=(action:TunnelAction)=>{state=dispatchTunnel(state,action);assert.notEqual(state.lastAction?.ok,false,state.lastAction?.message);};
  for(let step=0;step<18000&&state.phase==='battle';step++){
    waves.add(state.wave);
    for(const value of state.enemies)if(!seen.has(value.id)){seen.add(value.id);routes.add(value.route);assert.equal(value.maxHp,Math.round(ENEMY_DEFINITIONS[value.kind].maxHp*DIFFICULTIES[difficulty].hpMultiplier));}
    if(!state.enemies.length&&state.spawnIndex<WAVES[state.wave-1].length)assert.equal(state.nextWaveIn,null);
    if(state.elapsed+1e-8>=nextObservation){
      nextObservation=state.elapsed+.5;
      for(const id of ['momo','guard','bruiser','diandian','caster','tuanzi'] as const){
        const value=cat(state,id);if(value.status!=='active'||value.energy<100)continue;
        if(id==='caster'){
          let best={...MAP.boss,score:0};
          for(const target of CELLS){
            const cells=getSkillCells(value,target);let score=state.enemies.filter(enemy=>isEnemyVisible(state,enemy)&&cells.some(cell=>cell.x===Math.round(enemy.x)&&cell.y===Math.round(enemy.y))).length*3;
            if(state.boss.hp>0&&getBossCells(state.boss).some(part=>cells.some(cell=>cell.x===part.x&&cell.y===part.y)))score++;
            if(score>best.score)best={...target,score};
          }
          if(best.score){send({type:'SELECT_SKILL',catId:id});send({type:'AIM_SKILL',...best});send({type:'CAST_SKILL',catId:id});}
        }else send({type:'CAST_SKILL',catId:id});
      }
    }
    state=advanceTunnel(state,.05);
  }
  return {state,waves:[...waves],routes:[...routes],seen:seen.size};
}

for(const difficulty of ['low','medium','high'] as const)test(`${difficulty}: default six-cat formation wins eight waves and the 3400-base-HP Boss with legal skills, without carry or movement`,context=>{
  const result=playTunnel(difficulty),state=result.state;
  context.diagnostic(JSON.stringify({difficulty,phase:state.phase,seconds:Number(state.elapsed.toFixed(2)),bossHp:state.boss.hp,spawned:state.spawned,leaks:state.leaks,skills:state.stats.skills,cats:state.cats.map(value=>({name:value.name,hp:value.hp,status:value.status}))}));
  assert.equal(state.phase,'won');assert.equal(state.wave,8);assert.equal(state.boss.hp,0);assert.equal(state.spawned,32);assert.equal(state.defeated+state.leaks,32);assert.equal(state.leaks,0);
  assert.deepEqual(result.waves,[1,2,3,4,5,6,7,8]);assert.equal(result.routes.length,3);assert.ok(result.seen>=31);
  assert.ok(state.stats.skills>=25);assert.ok(state.cats.filter(value=>value.status==='active').length>=5);
  assert.ok(state.boss.slams>=1,'the no-carry acceptance encounters the chapter-specific mechanic');
  assert.equal(state.darknessRemaining,0);assert.deepEqual(state.boss.targetCells,[]);
});
