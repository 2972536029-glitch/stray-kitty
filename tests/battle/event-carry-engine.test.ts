import test from 'node:test';
import assert from 'node:assert/strict';
import * as chapter from '../../web/src/modules/battle/chapter/engine.ts';
import * as chapterConfig from '../../web/src/modules/battle/chapter/config.ts';
import * as market from '../../web/src/modules/battle/market/engine.ts';
import * as marketConfig from '../../web/src/modules/battle/market/config.ts';
import * as greenhouse from '../../web/src/modules/battle/greenhouse/engine.ts';
import * as greenhouseConfig from '../../web/src/modules/battle/greenhouse/config.ts';
import type {ChapterState, ChapterAction, ChapterEnemy} from '../../web/src/modules/battle/chapter/types.ts';
import type {MarketState, MarketAction, MarketEnemy} from '../../web/src/modules/battle/market/types.ts';
import type {GreenhouseState, GreenhouseAction, GreenhouseEnemy} from '../../web/src/modules/battle/greenhouse/types.ts';
import type {BattleCarryId} from '../../web/src/contracts/index.ts';
import type {BattleDifficulty} from '../../web/src/modules/battle/l00/types.ts';

type State=ChapterState|MarketState|GreenhouseState;
type Action=ChapterAction|MarketAction|GreenhouseAction;
type Enemy=ChapterEnemy|MarketEnemy|GreenhouseEnemy;
type Position={x:number;y:number};
const adapters=[
  {name:'L01',engine:chapter,config:chapterConfig,create:chapter.createChapterBattle,tick:chapter.advanceChapter,act:chapter.dispatchChapter},
  {name:'L02',engine:market,config:marketConfig,create:market.createMarketBattle,tick:market.advanceMarket,act:market.dispatchMarket},
  {name:'L03',engine:greenhouse,config:greenhouseConfig,create:greenhouse.createGreenhouseBattle,tick:greenhouse.advanceGreenhouse,act:greenhouse.dispatchGreenhouse},
] as const;
type Adapter=typeof adapters[number];
const ids:BattleCarryId[]=['lantern','mirror','bell','box','dog','dove'];
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const tick=(a:Adapter,s:State,seconds:number):State=>a.tick(s as never,seconds);
const act=(a:Adapter,s:State,action:Action):State=>a.act(s as never,action as never);
const withoutCarry=(state:State)=>{const {carry:_,...rest}=state;return rest;};
const start=(a:Adapter,carry?:unknown)=>act(a,a.create({carry}),{type:'START'});
/** Mechanic fixtures deliberately isolate a rule. Whole-battle tests below never write internal state. */
function quiet(a:Adapter,carry?:unknown):State{
  const state=start(a,carry);state.wave=1;state.spawnIndex=a.config.WAVES[0].length;state.spawned=state.spawnIndex;
  state.boss.cooldown=999;state.boss.skillCooldown=999;
  for(const cat of state.cats){cat.cooldown=999;cat.block=0;}
  return state;
}
function positionAlong(a:Adapter,distance:number):Position{
  const state=a.create();
  const route=a.name==='L01'?[state.carry.anchor,{x:3,y:3},a.config.MAP.goal]
    :(a.config as typeof marketConfig|typeof greenhouseConfig).ROUTES[state.carry.route as never] as readonly Position[];
  for(let i=1;i<route.length;i++){
    const from=route[i-1],to=route[i],length=Math.abs(to.x-from.x)+Math.abs(to.y-from.y);
    if(distance<=length)return {x:from.x+Math.sign(to.x-from.x)*distance,y:from.y+Math.sign(to.y-from.y)*distance};
    distance-=length;
  }
  return {...route.at(-1)!};
}
function makeEnemy(a:Adapter,extra:Partial<Enemy>={}):Enemy{
  const initial=a.create();
  return {...a.config.ENEMY_DEFINITIONS.scout,...initial.carry.anchor,id:'carry-target',kind:'scout',hp:100,
    route:initial.carry.route,pathIndex:1,slowRemaining:0,slowMultiplier:1,cooldown:999,blockedBy:null,...extra} as Enemy;
}
function setEnemies(s:State,enemies:Enemy[]){s.enemies=enemies as never;}

for(const a of adapters){
  test(`${a.name}: omitted, invalid and information-only carry preserve the complete baseline battle`,()=>{
    assert.deepEqual(a.create({carry:undefined}),a.create());
    assert.deepEqual(a.create().carry.anchor,a.name==='L03'?{x:7,y:2}:{x:3,y:0});
    for(const input of ['unknown','pigeon','crow','',{},['bell'],42,false]){
      let candidate=start(a,input),baseline=start(a);assert.equal(candidate.carry.id,null);assert.ok(candidate.carry.warning);
      for(let i=0;i<20;i++){candidate=tick(a,candidate,1);baseline=tick(a,baseline,1);assert.deepEqual(withoutCarry(candidate),withoutCarry(baseline));}
    }
    let dove=start(a,'dove'),baseline=start(a);
    for(let i=0;i<25;i++){dove=tick(a,dove,1);baseline=tick(a,baseline,1);assert.deepEqual(withoutCarry(dove),withoutCarry(baseline));}
  });

  test(`${a.name}: bell grants twenty energy once on START, caps it and never revives a retired cat`,()=>{
    let state=a.create({carry:'bell'});assert.equal(state.cats.every(cat=>cat.energy===0),true);
    state.cats[0].energy=95;Object.assign(state.cats[1],{status:'retired',hp:0,energy:0});
    state=act(a,state,{type:'START'});assert.equal(state.cats[0].energy,100);assert.equal(state.cats[1].energy,0);assert.equal(state.cats[2].energy,20);
    assert.equal(state.cats[1].status,'retired');assert.equal(state.cats[1].hp,0);assert.equal(state.carry.used,true);
    const again=act(a,state,{type:'START'});assert.equal(again.lastAction?.ok,false);assert.deepEqual(again.cats,state.cats);
    const after=tick(a,state,1);assert.equal(after.cats[2].energy,25);assert.equal(after.cats[1].energy,0);
  });

  test(`${a.name}: mirror is one manual use; movement and enemy attack clocks stop exactly three seconds while boss and cats continue`,()=>{
    let state=quiet(a,'mirror');state.boss.cooldown=0;
    const guard=state.cats.find(cat=>cat.id==='guard')!;guard.block=2;
    const contact=makeEnemy(a,{id:'contact',x:guard.x+.42,y:guard.y,route:a.name==='L01'?'upper':a.name==='L02'?'eastB':'upper',blockedBy:'guard',cooldown:0});
    setEnemies(state,[makeEnemy(a,{id:'moving'}),contact]);
    const before=structuredClone(state.enemies);state=act(a,state,{type:'USE_CARRY'});
    assert.equal(state.lastAction?.ok,true);assert.equal(state.carry.used,true);assert.equal(state.carry.freezeRemaining,3);
    state=tick(a,state,3);assert.equal(state.carry.freezeRemaining,0);assert.ok(state.boss.attacks>0);
    for(const enemy of state.enemies){const old=before.find(value=>value.id===enemy.id)!;close(enemy.x,old.x);close(enemy.y,old.y);assert.equal(enemy.cooldown,old.cooldown);}
    assert.equal(state.cats[0].energy,15);
    const previous=state.enemies.find(enemy=>enemy.id==='moving')!;state=tick(a,state,.05);
    const moved=state.enemies.find(enemy=>enemy.id==='moving')!;assert.ok(moved.x!==previous.x||moved.y!==previous.y);
    assert.ok(state.enemies.find(enemy=>enemy.id==='contact')!.cooldown>0);
    const repeated=act(a,state,{type:'USE_CARRY'});assert.equal(repeated.lastAction?.ok,false);assert.equal(repeated.carry.freezeRemaining,0);
  });

  test(`${a.name}: rejected mirror actions never consume it or replace a skill aim`,()=>{
    const ready=a.create({carry:'mirror'});assert.equal(act(a,ready,{type:'USE_CARRY'}).carry.used,false);
    for(const pause of [{type:'PAUSE',paused:true},{type:'SET_UI_PAUSE',paused:true},{type:'SET_EXTERNAL_PAUSE',paused:true}] as const){
      const state=act(a,start(a,'mirror'),pause),rejected=act(a,state,{type:'USE_CARRY'});
      assert.equal(rejected.lastAction?.ok,false);assert.equal(rejected.carry.used,false);assert.equal(rejected.carry.freezeRemaining,0);
    }
    const ended=act(a,start(a,'mirror'),{type:'RETREAT'});assert.equal(act(a,ended,{type:'USE_CARRY'}).carry.used,false);
    const wrong=act(a,start(a,'lantern'),{type:'USE_CARRY'});assert.equal(wrong.lastAction?.ok,false);assert.equal(wrong.carry.used,false);
    let aiming=quiet(a,'mirror');aiming.cats[0].energy=100;aiming=act(a,aiming,{type:'SELECT_SKILL',catId:'caster'});
    const result=act(a,aiming,{type:'USE_CARRY'});assert.equal(result.lastAction?.ok,true);assert.deepEqual(result.aim,aiming.aim);
  });

  test(`${a.name}: lantern pulses at four seconds, hits only ordinary minions within Manhattan two and credits kills`,()=>{
    let state=quiet(a,'lantern');setEnemies(state,[makeEnemy(a,{...positionAlong(a,1),id:'weak',hp:10,speed:0}),makeEnemy(a,{...positionAlong(a,2),id:'edge',speed:0}),makeEnemy(a,{...positionAlong(a,3),id:'far',speed:0})]);
    const bossHp=state.boss.hp;state=tick(a,state,3.95);assert.equal(state.enemies.length,3);assert.equal(state.carry.pulses,0);
    state=tick(a,state,.05);assert.equal(state.carry.pulses,1);assert.equal(state.defeated,1);assert.equal(state.enemies.length,2);
    assert.equal(state.enemies.find(enemy=>enemy.id==='edge')!.hp,80);assert.equal(state.enemies.find(enemy=>enemy.id==='far')!.hp,100);assert.equal(state.boss.hp,bossHp);
    assert.equal(state.cats.length,a.create().cats.length);assert.equal(state.cats.every(cat=>cat.status==='active'),true);
  });

  test(`${a.name}: each first-wave entrance minion waits two seconds independently, then releases; the box ends at the wave boundary`,()=>{
    let state=quiet(a,'box');setEnemies(state,[makeEnemy(a,{id:'first'})]);
    state=tick(a,state,1);setEnemies(state,[...state.enemies,makeEnemy(a,{id:'second'})]);state=tick(a,state,1);
    for(const enemy of state.enemies)assert.deepEqual({x:enemy.x,y:enemy.y},state.carry.anchor);
    state=tick(a,state,.05);const first=state.enemies.find(enemy=>enemy.id==='first')!,second=state.enemies.find(enemy=>enemy.id==='second')!;
    assert.ok(first.x!==state.carry.anchor.x||first.y!==state.carry.anchor.y);assert.deepEqual({x:second.x,y:second.y},state.carry.anchor);
    state=tick(a,state,1);const released=state.enemies.find(enemy=>enemy.id==='second')!;assert.ok(released.x!==state.carry.anchor.x||released.y!==state.carry.anchor.y);
    state.enemies=[];state=tick(a,state,.05);assert.equal(state.carry.boxActive,false);assert.deepEqual(state.carry.boxWait,{});assert.ok(state.nextWaveIn!==null);
    state.wave=2;state.spawnIndex=a.config.WAVES[1].length;state.nextWaveIn=null;setEnemies(state,[makeEnemy(a,{id:'later-wave'})]);
    state=tick(a,state,.05);assert.ok(state.enemies[0].x!==state.carry.anchor.x||state.enemies[0].y!==state.carry.anchor.y);
  });

  test(`${a.name}: dog applies a route-only quarter slow without damage, and uses the slower existing cat effect without multiplying`,()=>{
    const base=quiet(a,'dog');setEnemies(base,[makeEnemy(a)]);const old={...base.enemies[0]};
    const after=tick(a,base,1);close(Math.abs(after.enemies[0].x-old.x)+Math.abs(after.enemies[0].y-old.y),old.speed*.75);
    assert.equal(after.enemies[0].hp,100);assert.equal(after.enemies[0].speed,old.speed);assert.equal(after.carry.pulses,0);
    if(a.name!=='L01'){
      const slowed=quiet(a,'dog');setEnemies(slowed,[makeEnemy(a,{slowRemaining:4,slowMultiplier:.6} as Partial<Enemy>)]);
      const result=tick(a,slowed,1);close(Math.abs(result.enemies[0].x-old.x)+Math.abs(result.enemies[0].y-old.y),old.speed*.6);
    }
    const other=quiet(a,'dog');setEnemies(other,[makeEnemy(a)]);other.carry.route='unrelated-route';const unaffected=tick(a,other,1);
    close(Math.abs(unaffected.enemies[0].x-old.x)+Math.abs(unaffected.enemies[0].y-old.y),old.speed);
  });

  for(const speed of [.5,1,2] as const)test(`${a.name}: carry timers obey ${speed}x and every kind of pause`,()=>{
    let state=quiet(a,'mirror');setEnemies(state,[makeEnemy(a)]);state=act(a,act(a,state,{type:'USE_CARRY'}),{type:'SET_SPEED',speed});
    for(const pause of [{type:'PAUSE',paused:true},{type:'SET_UI_PAUSE',paused:true},{type:'SET_EXTERNAL_PAUSE',paused:true}] as const){const paused=act(a,state,pause);assert.equal(tick(a,paused,5),paused);}
    state=tick(a,state,2/speed);close(state.carry.elapsed,2);close(state.carry.freezeRemaining,1);
    assert.deepEqual({x:state.enemies[0].x,y:state.enemies[0].y},state.carry.anchor);
    state=tick(a,state,1/speed);close(state.carry.freezeRemaining,0);assert.deepEqual({x:state.enemies[0].x,y:state.enemies[0].y},state.carry.anchor);
    const lantern=act(a,quiet(a,'lantern'),{type:'SET_SPEED',speed});setEnemies(lantern,[makeEnemy(a,{speed:0})]);
    const pulsed=tick(a,lantern,4/speed);assert.equal(pulsed.carry.pulses,1);assert.equal(pulsed.enemies[0].hp,80);
  });
}

/** Public gameplay actions only: no HP/energy injection, wave jumps, revives or free retries. */
function play(a:Adapter,difficulty:BattleDifficulty,carry:BattleCarryId){
  let state=act(a,a.create({difficulty,carry}),{type:'START'}),observeAt=0;
  const send=(action:Action)=>{state=act(a,state,action);assert.notEqual(state.lastAction?.ok,false,state.lastAction?.message);};
  for(let step=0;step<10000&&state.phase==='battle';step++){
    if(state.elapsed+1e-8>=observeAt){
      observeAt=state.elapsed+.5;
      const hazards='hazards' in state?state.hazards:[];
      const danger=[...(state.boss.phase==='windup'?state.boss.targetCells:[]),...hazards];
      const dangerous=(cell:Position)=>danger.some(position=>position.x===cell.x&&position.y===cell.y);
      const threatened=state.cats.find(cat=>cat.status==='active'&&dangerous(cat));
      if(threatened){
        const choices=a.config.CELLS.filter(cell=>a.engine.isDeployableCell(cell)&&!dangerous(cell)&&!state.cats.some(cat=>cat.status==='active'&&cat.x===cell.x&&cat.y===cell.y)&&!a.engine.getDeployError(state as never,threatened.id as never,cell))
          .sort((first,second)=>Math.abs(first.x-threatened.x)+Math.abs(first.y-threatened.y)-Math.abs(second.x-threatened.x)-Math.abs(second.y-threatened.y));
        if(choices[0])send({type:'MOVE_CAT',catId:threatened.id,...choices[0]} as Action);
      }else{
        const moved=state.cats.find(cat=>cat.status==='active'&&(cat.x!==cat.initial.x||cat.y!==cat.initial.y)&&!dangerous(cat.initial)&&!a.engine.getDeployError(state as never,cat.id as never,cat.initial));
        if(moved)send({type:'MOVE_CAT',catId:moved.id,...moved.initial} as Action);
      }
      if(state.carry.id==='mirror'&&!state.carry.used&&state.elapsed>=12&&state.enemies.length)send({type:'USE_CARRY'});
      for(const id of ['momo','diandian','guard','bruiser','controller','caster','tuanzi']){
        const cat=state.cats.find(cat=>cat.id===id);if(!cat||cat.status!=='active'||cat.energy<100)continue;
        if(id==='diandian'&&!state.cats.some(friend=>friend.status==='active'&&friend.hp<=friend.maxHp-55))continue;
        if(id==='caster'||id==='controller'){
          let best={...a.config.MAP.boss,score:0};
          for(const target of a.config.CELLS){
            const cells=a.engine.getSkillCells(cat as never,target);
            let score=state.enemies.filter(enemy=>cells.some(cell=>cell.x===Math.round(enemy.x)&&cell.y===Math.round(enemy.y))).length*3;
            if(state.boss.hp>0&&a.engine.getBossCells(state.boss as never).some(part=>cells.some(cell=>cell.x===part.x&&cell.y===part.y)))score++;
            if(score>best.score)best={...target,score};
          }
          if(best.score)send({type:'CAST_SKILL',catId:cat.id,target:best} as Action);
        }else send({type:'CAST_SKILL',catId:cat.id} as Action);
      }
    }
    state=tick(a,state,.05);
  }
  return state;
}
for(const a of adapters)for(const carry of ids)for(const difficulty of ['low','medium','high'] as const){
  test(`${a.name} ${carry} ${difficulty}: a full legal run reaches victory without blocked waves`,context=>{
    const state=play(a,difficulty,carry);
    assert.equal(state.phase,'won',JSON.stringify({wave:state.wave,leaks:state.leaks,boss:state.boss.hp,cats:state.cats.map(cat=>({name:cat.name,hp:cat.hp}))}));
    assert.equal(state.spawned,a.config.TOTAL_MINIONS);assert.equal(state.defeated+state.leaks,a.config.TOTAL_MINIONS);assert.equal(state.boss.hp,0);assert.equal(state.wave,a.config.WAVES.length);
    assert.equal(state.cats.length,a.create().cats.length);assert.ok(state.elapsed<400);
    for(const cat of state.cats)if(cat.status==='retired'){assert.equal(cat.hp,0);assert.equal(cat.energy,0);}
    if(carry==='box')assert.equal(state.carry.boxActive,false);
    if(carry==='mirror')assert.equal(state.carry.used,true);
    context.diagnostic(JSON.stringify({stage:a.name,carry,difficulty,seconds:Number(state.elapsed.toFixed(2)),leaks:state.leaks,retired:state.cats.filter(cat=>cat.status==='retired').map(cat=>cat.name)}));
  });
}
