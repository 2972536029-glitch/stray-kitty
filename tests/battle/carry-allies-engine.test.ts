import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleCarry, getCarryPatrol, getCarrySpeedMultiplier, startCarryWave, tickBattleCarry} from '../../web/src/modules/battle/carry.ts';
import * as chapter from '../../web/src/modules/battle/chapter/engine.ts';
import * as chapterConfig from '../../web/src/modules/battle/chapter/config.ts';
import * as market from '../../web/src/modules/battle/market/engine.ts';
import * as marketConfig from '../../web/src/modules/battle/market/config.ts';
import * as greenhouse from '../../web/src/modules/battle/greenhouse/engine.ts';
import * as greenhouseConfig from '../../web/src/modules/battle/greenhouse/config.ts';
import * as tunnel from '../../web/src/modules/battle/tunnel/engine.ts';
import * as tunnelConfig from '../../web/src/modules/battle/tunnel/config.ts';
import * as finale from '../../web/src/modules/battle/finale/engine.ts';
import * as finaleConfig from '../../web/src/modules/battle/finale/config.ts';

const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const adapters=[
  {name:'L01',create:chapter.createChapterBattle,act:chapter.dispatchChapter,tick:chapter.advanceChapter,config:chapterConfig},
  {name:'L02',create:market.createMarketBattle,act:market.dispatchMarket,tick:market.advanceMarket,config:marketConfig},
  {name:'L03',create:greenhouse.createGreenhouseBattle,act:greenhouse.dispatchGreenhouse,tick:greenhouse.advanceGreenhouse,config:greenhouseConfig},
  {name:'L04',create:tunnel.createTunnelBattle,act:tunnel.dispatchTunnel,tick:tunnel.advanceTunnel,config:tunnelConfig},
  {name:'L05',create:finale.createFinaleBattle,act:finale.dispatchFinale,tick:finale.advanceFinale,config:finaleConfig},
] as const;
type Adapter=typeof adapters[number];
type State=ReturnType<Adapter['create']>;
const start=(a:Adapter,carry:'rats'|'kitten')=>a.act(a.create({carry}) as never,{type:'START'});
const advance=(a:Adapter,state:State,dt:number)=>a.tick(state as never,dt);
function quiet(a:Adapter,carry:'rats'|'kitten'):State{
  const state=start(a,carry);state.spawnIndex=a.config.WAVES[0].length;state.spawned=state.spawnIndex;
  state.boss.cooldown=999;state.boss.skillCooldown=999;
  for(const cat of state.cats){cat.cooldown=999;cat.block=0;}
  if('elites' in state)for(const elite of state.elites)elite.cooldown=999;
  return state;
}

test('rats patrol real route snapshots every eight simulation seconds, wraps, and never alters enemy attack time or health',()=>{
  const routes=[{route:'north',anchor:{x:2,y:0}},{route:'south',anchor:{x:2,y:5}}];
  const carry=createBattleCarry('rats','north',routes[0].anchor,routes);
  routes[1].anchor.y=99;
  assert.deepEqual(carry.patrolRoutes,[{route:'north',anchor:{x:2,y:0}},{route:'south',anchor:{x:2,y:5}}]);
  const enemies=[{id:'n',route:'north',x:2,y:1,hp:100},{id:'s',route:'south',x:2,y:4,hp:100}];
  const initial=structuredClone(enemies);
  const tick=tickBattleCarry(carry,7.95,1,enemies);
  assert.equal(getCarryPatrol(carry).route,'north');assert.equal(getCarrySpeedMultiplier(carry,'north'),.8);assert.equal(getCarrySpeedMultiplier(carry,'south'),1);
  assert.equal(tick.enemySeconds.get('n'),7.95);assert.equal(tick.enemySeconds.get('s'),7.95);assert.deepEqual(tick.hits,[]);assert.deepEqual(enemies,initial);
  tickBattleCarry(carry,.05,1,enemies);assert.deepEqual(getCarryPatrol(carry),{route:'south',anchor:{x:2,y:5}});
  assert.equal(getCarrySpeedMultiplier(carry,'north'),1);assert.equal(getCarrySpeedMultiplier(carry,'south'),.8);
  tickBattleCarry(carry,8,2,enemies);assert.equal(getCarryPatrol(carry).route,'north');
  const single=createBattleCarry('rats','only',{x:1,y:1});tickBattleCarry(single,80,1,[]);assert.equal(getCarryPatrol(single).route,'only');
});

test('kitten grants eight per new wave, caps at 100, respects seals/retirement and never catches up skipped grants',()=>{
  const carry=createBattleCarry('kitten','north',{x:0,y:0});
  const cats=[{status:'active',energy:0},{status:'active',energy:97},{status:'retired',energy:0},{status:'active',energy:0,energyBlockedRemaining:3}];
  for(const wave of [0,-1,1.5,NaN])startCarryWave(carry,wave,cats);
  assert.equal(carry.kittenWave,0);assert.equal(cats[0].energy,0);
  startCarryWave(carry,1,cats);assert.deepEqual(cats.map(cat=>cat.energy),[8,100,0,0]);assert.equal(carry.kittenWave,1);
  cats[3].energyBlockedRemaining=0;startCarryWave(carry,1,cats);assert.deepEqual(cats.map(cat=>cat.energy),[8,100,0,0]);
  startCarryWave(carry,2,cats);assert.deepEqual(cats.map(cat=>cat.energy),[16,100,0,8]);
  startCarryWave(carry,1,cats);assert.deepEqual(cats.map(cat=>cat.energy),[16,100,0,8]);
  assert.equal(cats[2].status,'retired');assert.equal(carry.used,false);
  const dog=createBattleCarry('dog','north',{x:0,y:0});startCarryWave(dog,1,cats);assert.deepEqual(cats.map(cat=>cat.energy),[16,100,0,8]);
});

for(const a of adapters){
  test(`${a.name}: patrol covers each actual entrance once and kitten fires at real first/subsequent wave boundaries`,()=>{
    const rats=a.create({carry:'rats'});assert.equal(rats.carry.warning,null);assert.equal(rats.carry.patrolRoutes.length,a.config.MAP.spawns.length);
    assert.deepEqual(rats.carry.patrolRoutes.map(value=>value.anchor).sort((x,y)=>x.x-y.x||x.y-y.y),[...a.config.MAP.spawns].sort((x,y)=>x.x-y.x||x.y-y.y));
    assert.equal(getCarryPatrol(rats.carry).route,rats.carry.route);
    const actualRoutes=new Set(a.config.WAVES.flat().map(entry=>'route' in entry?entry.route:entry.lane===0?'branch':entry.lane===3?'upper':'lower'));
    assert.deepEqual(new Set(rats.carry.patrolRoutes.map(entry=>entry.route)),actualRoutes);
    let state=quiet(a,'kitten');assert.equal(state.cats.every(cat=>cat.energy===8),true);assert.equal(state.carry.kittenWave,1);
    const again=a.act(state as never,{type:'START'});assert.equal(again.lastAction?.ok,false);assert.deepEqual(again.cats,state.cats);
    state=advance(a,state,.05);assert.equal(state.nextWaveIn,a.config.RULES.waveGap);
    state=advance(a,state,a.config.RULES.waveGap);assert.equal(state.wave,2);assert.equal(state.carry.kittenWave,2);
    for(const cat of state.cats){close(cat.energy,16+(.05+a.config.RULES.waveGap)*5);assert.equal(cat.skillUses,0);}
    assert.equal(state.cats.length,a.create().cats.length);
    if('allies' in state)for(const ally of state.allies)assert.equal('energy' in ally,false);
  });

  test(`${a.name}: rats slow only the selected route without touching attack clocks or stronger skill slows`,()=>{
    let state=quiet(a,'rats');const route=state.carry.route;
    const enemy={...a.config.ENEMY_DEFINITIONS.scout,...state.carry.anchor,id:'rat-target',kind:'scout',hp:100,route,pathIndex:1,slowRemaining:0,slowMultiplier:1,cooldown:10,blockedBy:null};
    state.enemies=[enemy] as never;const before={x:enemy.x,y:enemy.y};state=advance(a,state,1);
    close(Math.abs(state.enemies[0].x-before.x)+Math.abs(state.enemies[0].y-before.y),enemy.speed*.8);
    close(state.enemies[0].cooldown,9);assert.equal(state.enemies[0].hp,100);assert.equal(state.boss.hp,state.boss.maxHp);
    if('elites' in state)assert.equal(state.elites.every(elite=>elite.hp===elite.maxHp),true);
    const other=quiet(a,'rats');other.carry.elapsed=8;other.enemies=[structuredClone(enemy)] as never;
    const unselected=advance(a,other,1);close(Math.abs(unselected.enemies[0].x-before.x)+Math.abs(unselected.enemies[0].y-before.y),enemy.speed);
    if(a.name!=='L01'){
      const slowed=quiet(a,'rats');slowed.enemies=[{...enemy,slowRemaining:4,slowMultiplier:.6}] as never;
      const result=advance(a,slowed,1);close(Math.abs(result.enemies[0].x-before.x)+Math.abs(result.enemies[0].y-before.y),enemy.speed*.6);
    }
  });

  for(const speed of [.5,1,2] as const)test(`${a.name}: new allies respect ${speed}x speed and every pause`,()=>{
    let state=quiet(a,'rats');state=a.act(state as never,{type:'SET_SPEED',speed});
    // Keep an ordinary survivor so this isolated clock check does not progress into another wave.
    state.enemies=[{...a.config.ENEMY_DEFINITIONS.scout,...state.carry.anchor,id:'stationary',kind:'scout',hp:100,route:state.carry.route,pathIndex:1,slowRemaining:0,slowMultiplier:1,cooldown:999,blockedBy:null,speed:0}] as never;
    for(const pause of [{type:'PAUSE',paused:true},{type:'SET_UI_PAUSE',paused:true},{type:'SET_EXTERNAL_PAUSE',paused:true}] as const){
      const paused=a.act(state as never,pause);assert.equal(advance(a,paused,20),paused);
    }
    state=advance(a,state,8/speed);close(state.carry.elapsed,8);assert.equal(getCarryPatrol(state.carry).route,state.carry.patrolRoutes[1].route);
    const kitten=quiet(a,'kitten');const frozen=a.act(kitten as never,{type:'SET_EXTERNAL_PAUSE',paused:true});
    assert.equal(advance(a,frozen,20),frozen);assert.equal(frozen.carry.kittenWave,1);assert.equal(frozen.cats[0].energy,8);
  });
}

test('market kitten respects an active energy seal at a genuine wave transition and retired cats stay out',()=>{
  let state=market.dispatchMarket(market.createMarketBattle({carry:'kitten'}),{type:'START'});
  state.cats[0].energy=0;state.cats[0].energyBlockedRemaining=10;
  Object.assign(state.cats[1],{status:'retired',hp:0,energy:0});
  state.spawnIndex=marketConfig.WAVES[0].length;state.spawned=state.spawnIndex;state.boss.cooldown=999;state.boss.skillCooldown=999;
  for(const cat of state.cats){cat.cooldown=999;cat.block=0;}
  state=market.advanceMarket(state,.05+marketConfig.RULES.waveGap);
  assert.equal(state.wave,2);assert.equal(state.carry.kittenWave,2);assert.equal(state.cats[0].energy,0);assert.ok(state.cats[0].energyBlockedRemaining>0);
  assert.equal(state.cats[1].energy,0);assert.equal(state.cats[1].status,'retired');assert.equal(state.cats[1].hp,0);
});
