import test from 'node:test';
import assert from 'node:assert/strict';
import {act, advanceGame, createGame} from '../../web/src/modules/battle/l00/engine.ts';
import {CONFIG, ENEMY_TYPES} from '../../web/src/modules/battle/l00/config.ts';
import {beginBattle, finishSkillTutorial} from './helpers.ts';
import type {CombatState, CombatEnemy} from '../../web/src/modules/battle/l00/state.ts';
const cat=(s:CombatState,id:string)=>s.cats.find(c=>c.id===id)!;
const enemy=(extra:Partial<CombatEnemy>={}):CombatEnemy=>({...ENEMY_TYPES.scout,id:'test',type:'scout',hp:10000,maxHp:10000,x:4.55,y:1,cooldown:0,blockedBy:'guard',...extra});
function holding(){const s=beginBattle();s.spawnIndex=2;s.enemies=[enemy({x:6.7,y:0,speed:0,blockedBy:null,cooldown:100})];for(const c of s.cats){c.energy=0;c.shield=0;c.shieldRemaining=0;c.cooldown=100;}return s;}
function teaching(){let s=act(createGame(),{type:'START'});for(let i=0;i<1000&&s.phase!=='teach_position';i++)s=advanceGame(s,.05);assert.equal(s.phase,'teach_position');return s;}
test('live teaching uses a real moving wave and keeps the encounter through both manual skills',()=>{
 let s=teaching();assert.ok(s.cats.filter(c=>c.combatant).every(c=>c.status==='active'&&c.hp>0));
 assert.equal(cat(s,'hero').hp,50);assert.equal(cat(s,'caster').hp,65);
 assert.equal(advanceGame(s,30),s);assert.equal(act(s,{type:'BEGIN_SKILL_PRACTICE'}).lastAction!.ok,false);
 s=act(s,{type:'MOVE_CAT',catId:'caster',x:3,y:0});assert.equal(s.phase,'teach_energy');
 assert.equal(advanceGame(s,30),s);
 s=act(s,{type:'BEGIN_SKILL_PRACTICE'});const start=s.time;
 for(let i=0;i<200&&s.phase!=='teach_move';i++)s=advanceGame(s,.05);
 assert.equal(s.phase,'teach_move');assert.equal(s.wave,1);assert.ok(s.enemies.length>0);
 assert.ok(s.enemies.every(enemy=>!enemy.training&&enemy.speed>0&&enemy.damage>0));assert.equal(advanceGame(s,30),s);
 const pausedWaveTime=s.waveTime;
 s=act(s,{type:'MOVE_CAT',catId:'guard',x:4,y:1});assert.equal(s.phase,'teach_live_move');assert.equal(s.waveTime,pausedWaveTime);
 s=advanceGame(s,.2);assert.ok(s.waveTime>pausedWaveTime);
 s=act(s,{type:'MOVE_CAT',catId:'caster',x:3,y:2});assert.equal(s.phase,'skill_charge');
 s=act(s,{type:'MOVE_CAT',catId:'caster',x:3,y:0});
 for(let i=0;i<2000&&s.phase==='skill_charge';i++)s=advanceGame(s,.05);
 assert.equal(s.phase,'teach_guard_skill');assert.ok(s.time-start>=20);
 assert.equal(act(s,{type:'CAST_SKILL',catId:'caster',x:5,y:1}).lastAction!.ok,false);
 s=act(s,{type:'CAST_SKILL',catId:'guard'});assert.equal(s.phase,'teach_caster_skill');
 const miss=act(s,{type:'CAST_SKILL',catId:'caster',x:0,y:0});assert.equal(miss.lastAction!.ok,false);assert.equal(cat(miss,'caster').energy,100);
 const target=s.enemies.find(e=>e.x<=6)!,wave=s.wave,waveTime=s.waveTime,spawned=s.spawned;
 s=act(s,{type:'CAST_SKILL',catId:'caster',x:Math.round(target.x),y:Math.round(target.y)});
 assert.equal(s.phase,'battle');assert.equal(s.wave,wave);assert.equal(s.waveTime,waveTime);assert.equal(s.spawned,spawned);
 assert.equal(cat(s,'guard').shield,60);assert.equal(cat(s,'guard').energy,0);assert.equal(cat(s,'caster').energy,0);
});
test('removed item, redeploy, reform and same-attempt restart commands never change mechanics',()=>{
 const s=holding();assert.equal('inventory' in s,false);assert.equal('bagOpen' in s,false);
 for(const action of [{type:'OPEN_BAG'},{type:'CLOSE_BAG'},{type:'SELECT_ITEM',itemId:'warm-can'},{type:'SELECT_TARGET',catId:'guard'},{type:'USE_ITEM',itemId:'bouncy-treat',catId:'caster'},{type:'DEPLOY_CAT',catId:'guard',x:5,y:1},{type:'REFORM'},{type:'RESTART'}]){
  const n=act(s,action);assert.equal(n.lastAction!.ok,false);assert.deepEqual(n.cats,s.cats);assert.deepEqual(n.enemies,s.enemies);assert.equal(n.time,s.time);assert.equal(n.phase,s.phase);
 }
});
test('passive energy charges without targets or damage, caps and never auto-casts',()=>{
 let s=holding();const before=s.cats.map(c=>c.attacks);s=advanceGame(s,10);
 for(const c of s.cats.filter(c=>c.combatant))assert.equal(c.energy,50);
 assert.equal(cat(s,'hero').energy,0);assert.deepEqual(s.cats.map(c=>c.attacks),before);
 s=advanceGame(s,30);for(const c of s.cats.filter(c=>c.combatant))assert.equal(c.energy,100);
 assert.equal(s.skillAim,null);assert.equal(cat(s,'guard').shield,0);
 s=act(s,{type:'CAST_SKILL',catId:'guard'});assert.equal(cat(s,'guard').energy,0);s=advanceGame(s,2);assert.equal(cat(s,'guard').energy,10);
});
test('positive health below the old threshold stays active; exactly zero permanently retires',()=>{
 let s=holding();Object.assign(cat(s,'guard'),{hp:20,energy:75});s.enemies=[enemy({damage:10})];
 s=advanceGame(s,.05);assert.equal(cat(s,'guard').hp,10);assert.equal(cat(s,'guard').status,'active');
 s.enemies[0].cooldown=0;s=advanceGame(s,.05);assert.equal(cat(s,'guard').hp,0);assert.equal(cat(s,'guard').status,'retired');assert.equal(cat(s,'guard').energy,0);assert.equal(s.enemies[0].blockedBy,null);
 const retired=structuredClone(cat(s,'guard'));s=advanceGame(s,1);assert.deepEqual(cat(s,'guard'),retired);
 for(const action of [{type:'MOVE_CAT',catId:'guard',x:3,y:1},{type:'CAST_SKILL',catId:'guard'},{type:'INSPECT_CAT',catId:'guard'},{type:'USE_ITEM',itemId:'warm-can',catId:'guard'}])assert.equal(act(s,action).lastAction!.ok,false);
});
test('shield absorbs before real health and lethal excess damage retires without threshold clipping',()=>{
 let s=holding();Object.assign(cat(s,'guard'),{hp:100,shield:60,shieldRemaining:8});s.enemies=[enemy({damage:45})];s=advanceGame(s,.05);
 assert.equal(cat(s,'guard').hp,100);assert.equal(cat(s,'guard').shield,15);
 s.enemies[0].damage=100;s.enemies[0].cooldown=0;s=advanceGame(s,.05);assert.equal(cat(s,'guard').hp,15);assert.equal(cat(s,'guard').status,'active');
 s.enemies[0].damage=100;s.enemies[0].cooldown=0;s=advanceGame(s,.05);assert.equal(cat(s,'guard').hp,0);assert.equal(cat(s,'guard').status,'retired');assert.equal(cat(s,'guard').damageTaken,100);
});
test('all cats retired and three leaks both end the attempt with no revival action',()=>{
 for(const reason of ['retired','leaks']){let s=holding();if(reason==='retired')for(const c of s.cats.filter(c=>c.combatant))Object.assign(c,{hp:0,status:'retired',x:-1,y:-1});else{s.leaks=2;s.enemies=[enemy({x:.01,speed:1,blockedBy:null})];}
 s=advanceGame(s,.05);assert.equal(s.phase,'failed');assert.equal(advanceGame(s,30),s);
 for(const type of ['REFORM','RESTART','START'])assert.equal(act(s,{type}).lastAction!.ok,false);
 }
});
