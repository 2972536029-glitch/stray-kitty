import test from 'node:test';
import assert from 'node:assert/strict';
import {ALLY_DEFINITIONS, CAT_DEFINITIONS, CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, ROUTES, RULES, SKILLS, TOTAL_MINIONS, WAVES} from '../../web/src/modules/battle/finale/config.ts';
import {advanceFinale, cellName, createFinaleBattle, dispatchFinale, getAttackCells, getBossCells, getBossDamageMultiplier, getBossDistance, getDeployError, getFinaleAdvice, getFinaleSpeed, getSkillCells, isEnemyVisible, isDeployableCell, isFinaleCell, isPlayableCell} from '../../web/src/modules/battle/finale/engine.ts';
import type {BattleDifficulty, FinaleAction, FinaleCatId, FinaleEnemy, FinaleRouteId, FinaleState, Position} from '../../web/src/modules/battle/finale/types.ts';
import {CAT_DEFINITIONS as PREVIOUS_CATS} from '../../web/src/modules/battle/tunnel/config.ts';

const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const same=(a:Position,b:Position)=>a.x===b.x&&a.y===b.y;
const cat=(state:FinaleState,id:FinaleCatId)=>state.cats.find(value=>value.id===id)!;
const start=()=>dispatchFinale(createFinaleBattle(),{type:'START'});
/** Feature fixtures may isolate a mechanism; full-stage play below only dispatches legal actions. */
function quiet():FinaleState {
  const state=start();state.wave=10;state.spawnIndex=WAVES.at(-1)!.length;state.spawned=TOTAL_MINIONS;
  state.boss.cooldown=999;state.boss.skillCooldown=999;
  for(const value of state.cats){value.cooldown=999;value.block=0;}
  for(const elite of state.elites)elite.cooldown=999;
  return state;
}
function enemy(route:FinaleRouteId,extra:Partial<FinaleEnemy>={}):FinaleEnemy {
  return {...ENEMY_DEFINITIONS.scout,...ROUTES[route][0],id:`test-${route}`,kind:'scout',hp:100,route,pathIndex:1,
    slowRemaining:0,slowMultiplier:1,cooldown:999,blockedBy:null,...extra};
}

test('finale footprint has 74 real cells, 17 obstacles, 39 deployments, three leaders and permanent ally reservations',()=>{
  const state=createFinaleBattle();assert.equal(state.stageId,'finale_boss');assert.equal(CELLS.length,74);
  assert.deepEqual(Array.from({length:7},(_,y)=>CELLS.filter(cell=>cell.y===y).length),[8,11,12,12,12,11,8]);
  assert.equal(MAP.obstacles.length,17);assert.equal(CELLS.filter(isDeployableCell).length,39);assert.equal(cellName(MAP.goal),'D2');
  assert.deepEqual(getBossCells(state.boss).map(cellName),['C9','C10','C11','D9','D10','D11','E9','E10','E11']);
  assert.deepEqual(state.elites.map(value=>[value.name,cellName(value)]),[['影甲卫','B9'],['鸣影卫','F9']]);
  assert.deepEqual(state.allies.map(value=>[value.name,cellName(value),value.arriveWave]),[['铃铃','B5',3],['桃桃','F5',5],['音音','F4',7]]);
  assert.deepEqual(state.cats.map(value=>value.name),['绒绒','斑斑','团子','栗栗','点点','墨墨']);
  for(const cell of [...MAP.spawns,...MAP.obstacles,...MAP.bossCells,...MAP.eliteCells,...ALLY_DEFINITIONS,MAP.goal])assert.equal(isDeployableCell(cell),false);
  for(const value of state.cats)assert.equal(getDeployError(state,value.id,value),null);
  for(const value of state.allies)assert.ok(getDeployError(state,'caster',value));
  assert.equal(isFinaleCell({x:0,y:0}),false);assert.equal(isFinaleCell({x:11,y:6}),false);
  assert.equal('inventory' in state,false);assert.equal('darknessRemaining' in state,false);
  assert.equal('restRemaining' in state.cats[0],false);
});

test('six main cats retain prior baseline attributes and pure energy skills; difficulty scales only enemy HP',()=>{
  for(const id of Object.keys(CAT_DEFINITIONS) as FinaleCatId[]){
    const {initial:_,...actual}=CAT_DEFINITIONS[id],{initial:__,...previous}=PREVIOUS_CATS[id];assert.deepEqual(actual,previous);
  }
  assert.equal(SKILLS.momo.shield,45);assert.equal(SKILLS.momo.nightVision,10);assert.equal(SKILLS.diandian.heal,80);
  assert.equal(RULES.energyPerSecond,5);assert.equal(WAVES.length,10);assert.equal(TOTAL_MINIONS,44);
  for(const difficulty of ['low','medium','high'] as const){
    const state=createFinaleBattle({difficulty});assert.equal(state.boss.hp,Math.round(RULES.bossHp*DIFFICULTIES[difficulty].hpMultiplier));
    assert.ok(state.elites.every(value=>value.maxHp===Math.round(RULES.eliteHp*DIFFICULTIES[difficulty].hpMultiplier)));
    assert.ok(state.elites.every(value=>value.damage===RULES.eliteDamage));assert.equal(cat(state,'tuanzi').maxHp,220);
  }
  for(const difficulty of [null,'wild',3])assert.throws(()=>createFinaleBattle({difficulty:difficulty as never}));
});

test('all three axis-aligned routes cross actual unobstructed cells, including passage under the nine-cell Boss',()=>{
  for(const path of Object.values(ROUTES)){
    assert.ok(MAP.spawns.some(value=>same(value,path[0])));assert.deepEqual(path.at(-1),MAP.goal);
    for(let i=1;i<path.length;i++){
      const from=path[i-1],to=path[i],dx=Math.sign(to.x-from.x),dy=Math.sign(to.y-from.y);
      assert.notEqual(Boolean(dx),Boolean(dy));
      for(let step=0;step<=Math.abs(to.x-from.x)+Math.abs(to.y-from.y);step++)assert.equal(isPlayableCell({x:from.x+dx*step,y:from.y+dy*step}),true);
    }
  }
  assert.deepEqual(ROUTES.branch.map(cellName),['D12','D2']);
  const times=WAVES.flatMap(wave=>wave.slice(1).map((entry,i)=>entry.at-wave[i].at));assert.ok(times.every(value=>value>=3));
});
for(const route of Object.keys(ROUTES) as FinaleRouteId[])test(`${route}: minion follows the route and leaks only at D2`,()=>{
  let state=quiet();state.enemies=[enemy(route)];const visited=new Set<string>();
  for(let i=0;i<1500&&state.enemies.length;i++){
    const before=state.enemies[0];visited.add(cellName({x:Math.round(before.x),y:Math.round(before.y)}));state=advanceFinale(state,.05);
    if(state.enemies.length){const after=state.enemies[0];close(Math.abs(after.x-before.x)+Math.abs(after.y-before.y),after.speed*.05);assert.equal(state.leaks,0);}
  }
  assert.equal(state.enemies.length,0);assert.equal(state.leaks,1);assert.equal(state.phase,'battle');
  if(route==='branch')for(const name of ['D11','D10','D9'])assert.ok(visited.has(name));
});

test('nine Boss tiles share exactly one hit per area skill; elites remain independent HP targets',()=>{
  for(const id of ['caster','tuanzi'] as const){
    let state=start();cat(state,id).energy=100;const hp=state.boss.hp;
    state=dispatchFinale(state,{type:'CAST_SKILL',catId:id,target:{x:9,y:3}});assert.equal(state.lastAction?.ok,true);
    close(hp-state.boss.hp,SKILLS[id].damage!*RULES.armorMultiplier);
  }
  let state=start();cat(state,'caster').energy=100;
  state=dispatchFinale(state,{type:'CAST_SKILL',catId:'caster',target:{x:8,y:1}});
  close(state.elites[0].maxHp-state.elites[0].hp,45);assert.equal(state.elites[1].hp,state.elites[1].maxHp);
  close(state.boss.maxHp-state.boss.hp,45*RULES.armorMultiplier);
  assert.equal(getBossDistance(state.boss,{x:7,y:3}),1);
  for(const value of state.cats)for(const cell of getAttackCells(value))assert.equal(isPlayableCell(cell),true);
});

test('armor guard, three light stages and Momo night vision modify only Boss protection without making it invulnerable',()=>{
  let state=quiet();close(getBossDamageMultiplier(state),.55);
  for(const stage of [1,2,3] as const){state.lightStage=stage;close(getBossDamageMultiplier(state),.55+stage*.1);}
  cat(state,'momo').energy=100;state=dispatchFinale(state,{type:'CAST_SKILL',catId:'momo'});
  close(getBossDamageMultiplier(state),1);state=advanceFinale(state,9.95);assert.equal(getBossDamageMultiplier(state),1);
  state=advanceFinale(state,.05);assert.equal(state.nightVisionRemaining,0);close(getBossDamageMultiplier(state),.85);
  state.elites[0].status='defeated';state.elites[0].hp=0;close(getBossDamageMultiplier(state),1);
  assert.equal(isEnemyVisible(state,{x:11,y:3}),true);assert.match(getFinaleAdvice(createFinaleBattle()),/两名精英/);
});

test('horn guard amplifies regular minion damage only while alive; each elite also attacks independently',()=>{
  const damage=(alive:boolean)=>{
    let state=quiet();cat(state,'guard').block=2;state.elites[1].status=alive?'active':'defeated';
    state.enemies=[enemy('upper',{x:4.42,y:2,pathIndex:3,speed:0,blockedBy:'guard',cooldown:0})];
    state=advanceFinale(state,.05);return 240-cat(state,'guard').hp;
  };
  close(damage(true),9*1.2);close(damage(false),9);
  let state=quiet();for(const value of state.elites)value.cooldown=0;state=advanceFinale(state,.05);
  assert.deepEqual(state.elites.map(value=>value.attacks),[1,1]);assert.equal(cat(state,'caster').hp,72);assert.equal(cat(state,'momo').hp,142);
  assert.equal(state.boss.attacks,0);
});

test('sweep has a full 3-second locked warning at 24 seconds and one recovery second without basic attacks',()=>{
  let state=quiet();state.boss.skillCooldown=RULES.bossSkillFirst;
  state=advanceFinale(state,23.95);assert.equal(state.boss.phase,'idle');state=advanceFinale(state,.05);
  assert.equal(state.boss.phase,'windup');assert.equal(state.boss.skill,'sweep');assert.equal(state.boss.targetCells.length,12);
  assert.ok(state.boss.targetCells.every(value=>value.y===3));state=advanceFinale(state,2.95);
  assert.equal(cat(state,'tuanzi').hp,220);state=advanceFinale(state,.05);assert.equal(state.boss.phase,'recovery');
  assert.equal(cat(state,'tuanzi').hp,130);assert.equal(cat(state,'diandian').hp,50);assert.equal(state.boss.slams,1);
  assert.equal(state.boss.attacks,0);assert.deepEqual(state.boss.targetCells,[]);
  state=advanceFinale(state,.95);assert.equal(state.boss.phase,'recovery');state=advanceFinale(state,.05);assert.equal(state.boss.phase,'idle');
  state=advanceFinale(state,19.95);assert.equal(state.boss.phase,'idle');state=advanceFinale(state,.05);assert.equal(state.boss.phase,'windup');
});

test('half-health crown locks two crosses; movement escapes its locked cells and does not reset existing HP or energy',()=>{
  let state=quiet();state.boss.hp=state.boss.maxHp*.5;state.boss.skillCooldown=0;state=advanceFinale(state,.05);
  assert.equal(state.boss.tierPhase,2);assert.equal(state.boss.skill,'crown');assert.equal(state.boss.phase,'windup');
  const locked=structuredClone(state.boss.targetCells);assert.equal(new Set(locked.map(cellName)).size,locked.length);
  for(const value of [...state.cats])if(locked.some(p=>same(p,value))){
    const safe=CELLS.find(p=>!locked.some(d=>same(d,p))&&!state.cats.some(c=>same(c,p))&&!getDeployError(state,value.id,p))!;
    const before=cat(state,value.id);state=dispatchFinale(state,{type:'MOVE_CAT',catId:value.id,...safe});assert.equal(state.lastAction?.ok,true);
    assert.equal(cat(state,value.id).hp,before.hp);assert.equal(cat(state,value.id).energy,before.energy);
    assert.deepEqual(state.boss.targetCells,locked);
  }
  state=advanceFinale(state,3);assert.equal(state.stats.dodgedSlams,1);assert.ok(state.cats.every(value=>value.hp===value.maxHp));
});

test('light cart and fixed reinforcements advance exactly at waves 3/5/7, once each, and never resurrect',()=>{
  let state=quiet();state.wave=2;state.spawnIndex=WAVES[1].length;state.nextWaveIn=.05;
  state=advanceFinale(state,.049);assert.equal(state.lightStage,0);assert.ok(state.allies.every(value=>value.status==='waiting'));
  state=advanceFinale(state,.001);assert.equal(state.wave,3);assert.equal(state.lightStage,1);assert.equal(state.allies[0].status,'active');
  assert.deepEqual(state.allies.map(value=>value.arrivals),[1,0,0]);
  state.allies[0].hp=0;state.allies[0].status='retired';
  for(const wave of [4,6]){
    state.wave=wave;state.enemies=[];state.spawnIndex=WAVES[wave-1].length;state.nextWaveIn=.05;
    state=advanceFinale(state,.05);assert.equal(state.lightStage,wave===4?2:3);
  }
  assert.deepEqual(state.allies.map(value=>value.arrivals),[1,1,1]);assert.equal(state.allies[0].status,'retired');
  assert.equal(state.allies[0].hp,0);assert.equal(state.cats.length,6);assert.equal(state.totalEnemies,44);
  const blocked=dispatchFinale(state,{type:'MOVE_CAT',catId:'controller' as FinaleCatId,x:5,y:1});assert.equal(blocked.lastAction?.ok,false);
  for(const ally of state.allies)assert.ok(getDeployError(state,'guard',ally));
});

test('active reinforcements take Boss damage, receive shields/healing and stay retired after zero HP; waiting allies receive neither',()=>{
  let state=quiet();state.allies[0].status='active';state.allies[0].hp=70;state.allies[0].cooldown=999;state.allies[1].hp=20;
  cat(state,'momo').energy=100;state=dispatchFinale(state,{type:'CAST_SKILL',catId:'momo'});
  assert.equal(state.allies[0].shield,45);assert.equal(state.allies[1].shield,0);
  cat(state,'diandian').energy=100;state=dispatchFinale(state,{type:'CAST_SKILL',catId:'diandian'});
  assert.equal(state.allies[0].hp,140);assert.equal(state.allies[1].hp,20);
  state.boss.phase='windup';state.boss.phaseTime=2.95;state.boss.targetCells=[{x:4,y:1}];state=advanceFinale(state,.05);
  assert.equal(state.allies[0].hp,95);assert.equal(state.allies[0].shield,0);
  state.allies[0].hp=30;state.boss.phase='windup';state.boss.phaseTime=2.95;state.boss.targetCells=[{x:4,y:1}];state=advanceFinale(state,.05);
  assert.equal(state.allies[0].hp,0);assert.equal(state.allies[0].status,'retired');
  cat(state,'diandian').energy=100;cat(state,'momo').energy=100;
  for(const id of ['diandian','momo'] as const)state=dispatchFinale(state,{type:'CAST_SKILL',catId:id});
  assert.equal(state.allies[0].status,'retired');assert.equal(state.allies[0].hp,0);assert.equal(state.allies[0].shield,0);
});

test('fixed supports slow only minions, shoot independently, and inspire energy without auto-casting or reviving',()=>{
  let state=quiet();state.allies[0].status='active';state.allies[0].cooldown=0;state.enemies=[enemy('upper',{x:5,y:1,pathIndex:2,speed:0})];
  state=advanceFinale(state,.05);assert.equal(state.enemies[0].hp,88);close(state.enemies[0].slowMultiplier,.75);assert.ok(state.enemies[0].slowRemaining>1.9);
  state=quiet();state.allies[1].status='active';state.allies[1].cooldown=0;state=advanceFinale(state,.05);
  assert.equal(state.elites[1].hp,950-18);assert.equal(state.allies[1].attacks,1);
  state=quiet();state.allies[2].status='active';state.allies[2].cooldown=5;cat(state,'guard').energy=95;
  cat(state,'caster').status='retired';cat(state,'caster').hp=0;
  state=advanceFinale(state,4.95);assert.equal(state.allies[2].attacks,0);state=advanceFinale(state,.05);
  assert.equal(state.allies[2].attacks,1);close(cat(state,'momo').energy,30);assert.equal(cat(state,'guard').energy,100);
  assert.equal(cat(state,'caster').energy,0);assert.equal(state.stats.skills,0);
});

test('pause freezes waves, light cart, Boss telegraphs, supports and energy; external pause rejects actions',()=>{
  let state=quiet();state.allies[2].status='active';state.nightVisionRemaining=10;
  for(const type of ['PAUSE','SET_EXTERNAL_PAUSE','SET_UI_PAUSE'] as const){
    const paused=dispatchFinale(state,{type,paused:true});assert.equal(getFinaleSpeed(paused),0);assert.equal(advanceFinale(paused,30),paused);
  }
  state=dispatchFinale(state,{type:'SET_EXTERNAL_PAUSE',paused:true});
  assert.equal(dispatchFinale(state,{type:'MOVE_CAT',catId:'guard',x:5,y:2}).lastAction?.ok,false);
  state=dispatchFinale(state,{type:'SET_EXTERNAL_PAUSE',paused:false});state=advanceFinale(state,1);close(state.elapsed,1);close(state.nightVisionRemaining,9);
  state=dispatchFinale(state,{type:'SET_SPEED',speed:2});state=advanceFinale(state,1);close(state.elapsed,3);
});

test('final victory requires ten waves and all three leaders; last main cat retiring loses even with allies present or awaiting arrival',()=>{
  let state=quiet();state.boss.hp=0;state.boss.phase='defeated';state.elites[0].hp=0;state.elites[0].status='defeated';
  state=advanceFinale(state,.05);assert.equal(state.phase,'battle');state.elites[1].hp=0;state.elites[1].status='defeated';
  state=advanceFinale(state,.05);assert.equal(state.phase,'won');assert.equal(advanceFinale(state,30),state);
  for(const waiting of [true,false]){
    let losing=quiet();for(const value of losing.cats){value.hp=0;value.status='retired';}
    if(!waiting)for(const value of losing.allies)value.status='active';losing=advanceFinale(losing,.05);
    assert.equal(losing.phase,'lost');assert.match(losing.logs.at(-1)!.text,/六位主力全部退场/);
    assert.equal(advanceFinale(losing,30),losing);
  }
});

test('carry safely falls back, preserves first-route anchor and affects only ordinary minions, never the three leaders',()=>{
  const unknown=createFinaleBattle({carry:'unknown'});assert.equal(unknown.carry.id,null);assert.ok(unknown.carry.warning);
  assert.equal(unknown.carry.route,'upper');assert.deepEqual(unknown.carry.anchor,{x:10,y:0});
  let state=quiet();state.carry=createFinaleBattle({carry:'mirror'}).carry;state.enemies=[enemy('upper')];
  state.boss.cooldown=0;for(const elite of state.elites)elite.cooldown=0;
  state=dispatchFinale(state,{type:'USE_CARRY'});assert.equal(state.lastAction?.ok,true);state=advanceFinale(state,.05);
  close(state.enemies[0].x,10);assert.equal(state.boss.attacks,1);assert.deepEqual(state.elites.map(value=>value.attacks),[1,1]);
  assert.equal(dispatchFinale(state,{type:'USE_CARRY'}).lastAction?.ok,false);
  state=quiet();state.carry=createFinaleBattle({carry:'lantern'}).carry;state.enemies=[enemy('upper',{speed:0})];
  state=advanceFinale(state,4);assert.equal(state.enemies[0].hp,80);assert.equal(state.boss.hp,state.boss.maxHp);
  assert.ok(state.elites.every(value=>value.hp===value.maxHp));
});

/** Public-input acceptance: no HP/energy writes, only a real clock, legal moves and charged skills. */
function playFinale(difficulty:BattleDifficulty,carry?:unknown){
  let state=dispatchFinale(createFinaleBattle({difficulty,carry}),{type:'START'}),observation=0,moves=0;
  const seen=new Set<string>(),waves=new Set<number>(),routes=new Set<string>(),skills=new Set<string>();
  const send=(action:FinaleAction)=>{state=dispatchFinale(state,action);assert.notEqual(state.lastAction?.ok,false,state.lastAction?.message);};
  for(let step=0;step<12000&&state.phase==='battle';step++){
    waves.add(state.wave);for(const value of state.enemies){seen.add(value.id);routes.add(value.route);assert.equal(value.maxHp,Math.round(ENEMY_DEFINITIONS[value.kind].maxHp*DIFFICULTIES[difficulty].hpMultiplier));}
    if(state.boss.phase==='windup')skills.add(state.boss.skill);
    if(state.elapsed+1e-8>=observation){observation=state.elapsed+.5;
      if(state.carry.id==='mirror'&&!state.carry.used&&state.enemies.length>=2)send({type:'USE_CARRY'});
      const danger=state.boss.phase==='windup'?state.boss.targetCells:[];
      for(const value of [...state.cats]){
        if(value.status!=='active')continue;
        if(danger.some(cell=>same(cell,value))){
          const safe=CELLS.filter(cell=>!danger.some(d=>same(d,cell))&&!state.cats.some(friend=>friend.status==='active'&&same(friend,cell))&&!getDeployError(state,value.id,cell))
            .sort((a,b)=>Math.abs(a.x-value.x)+Math.abs(a.y-value.y)-Math.abs(b.x-value.x)-Math.abs(b.y-value.y)||Math.abs(a.x-value.initial.x)+Math.abs(a.y-value.initial.y)-Math.abs(b.x-value.initial.x)-Math.abs(b.y-value.initial.y))[0];
          if(safe){send({type:'MOVE_CAT',catId:value.id,...safe});moves++;}
        }else if(state.boss.phase!=='windup'&&!same(value,value.initial)&&!state.cats.some(friend=>friend.status==='active'&&friend.id!==value.id&&same(friend,value.initial))&&!getDeployError(state,value.id,value.initial))send({type:'MOVE_CAT',catId:value.id,...value.initial});
      }
      for(const id of ['momo','guard','bruiser','diandian','caster','tuanzi'] as const){
        const value=cat(state,id);if(value.status!=='active'||value.energy<100)continue;
        if(id==='diandian'&&![...state.cats,...state.allies].some(friend=>friend.status==='active'&&friend.hp<friend.maxHp-40))continue;
        if(id==='caster'){
          let best={...MAP.boss,score:0};for(const target of CELLS){
            const cells=getSkillCells(value,target),inRange=(p:Position)=>cells.some(cell=>same(cell,{x:Math.round(p.x),y:Math.round(p.y)}));
            const score=state.enemies.filter(inRange).length*3+state.elites.filter(elite=>elite.hp>0&&inRange(elite)).length*2+(state.boss.hp>0&&getBossCells(state.boss).some(inRange)?1:0);
            if(score>best.score)best={...target,score};
          }
          if(best.score){send({type:'SELECT_SKILL',catId:id});send({type:'AIM_SKILL',...best});send({type:'CAST_SKILL',catId:id});}
        }else send({type:'CAST_SKILL',catId:id});
      }
    }
    state=advanceFinale(state,.1);
  }
  return {state,moves,seen:seen.size,waves:[...waves],routes:[...routes],skills:[...skills]};
}
for(const difficulty of ['low','medium','high'] as const){
  test(`${difficulty}: ten waves and all leaders can be defeated with legal skills and dodges, no carry or state injection`,context=>{
    const result=playFinale(difficulty),state=result.state;
    context.diagnostic(JSON.stringify({difficulty,phase:state.phase,seconds:Number(state.elapsed.toFixed(2)),leaks:state.leaks,moves:result.moves,skills:state.stats.skills,surviving:state.cats.filter(value=>value.status==='active').length}));
    assert.equal(state.phase,'won');assert.equal(state.wave,10);assert.equal(state.spawned,44);assert.equal(state.defeated+state.leaks,44);
    assert.equal(state.boss.hp,0);assert.ok(state.elites.every(value=>value.status==='defeated'));assert.equal(state.leaks,0);
    assert.deepEqual(result.waves,[1,2,3,4,5,6,7,8,9,10]);assert.equal(result.routes.length,3);assert.equal(result.seen,44);
    assert.ok(result.moves>=4);assert.deepEqual(result.skills,['sweep','crown']);assert.ok(state.stats.skills>=30);
    assert.ok(state.cats.filter(value=>value.status==='active').length>=5);assert.deepEqual(state.allies.map(value=>value.arrivals),[1,1,1]);
  });
  test(`${difficulty}: untouched default formation loses; fixed reinforcements cannot auto-win`,context=>{
    let state=dispatchFinale(createFinaleBattle({difficulty}),{type:'START'});
    for(let i=0;i<1000&&state.phase==='battle';i++)state=advanceFinale(state,1);
    context.diagnostic(JSON.stringify({difficulty,phase:state.phase,seconds:Number(state.elapsed.toFixed(2)),wave:state.wave,leaks:state.leaks}));
    assert.equal(state.phase,'lost');assert.equal(state.stats.skills,0);assert.ok(state.boss.hp>0);
  });
  for(const carry of ['lantern','mirror','bell','box','dog','dove'])test(`${difficulty} + ${carry}: public carry contract remains completable without baseline compensation`,()=>{
    const {state}=playFinale(difficulty,carry);assert.equal(state.phase,'won');assert.equal(state.spawned,44);
    assert.equal(state.boss.hp,0);assert.ok(state.elites.every(value=>value.status==='defeated'));assert.ok(state.leaks<3);
  });
}
