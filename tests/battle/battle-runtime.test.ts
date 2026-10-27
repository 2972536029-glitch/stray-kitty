import test from 'node:test';
import assert from 'node:assert/strict';
import {PrologueBattle} from '../../web/src/modules/battle/l00/runtime.ts';
import {CONFIG} from '../../web/src/modules/battle/l00/config.ts';
import {winRuntimeBattle} from './helpers.ts';
import type {BattleContext,BattleResult} from '../../web/src/modules/battle/l00/types.ts';
import type {CombatState} from '../../web/src/modules/battle/l00/state.ts';
const context=():BattleContext=>({attempt:{id:'attempt-1',stageId:'alley_rescue',status:'active'},stage:{id:'alley_rescue',name:'序章',status:'ready',lanes:3,columns:7,waves:6},catIds:['miaomiao'],modifiers:['event_success']});
const snapshot=(runtime:PrologueBattle)=>{const s=runtime.getSnapshot();assert.ok(s);return s;};
function until(r:PrologueBattle,phase:CombatState['phase']){for(let i=0;i<5000&&snapshot(r).phase!==phase;i++)r.tick(.1);assert.equal(snapshot(r).phase,phase);}
function begin(r:PrologueBattle){r.dispatch({type:'START'});until(r,'teach_position');r.dispatch({type:'MOVE_CAT',catId:'caster',x:3,y:0});r.dispatch({type:'MOVE_CAT',catId:'guard',x:4,y:1});r.dispatch({type:'BEGIN_SKILL_PRACTICE'});until(r,'teach_guard_skill');r.dispatch({type:'CAST_SKILL',catId:'guard'});r.dispatch({type:'CAST_SKILL',catId:'caster',x:5,y:1});assert.equal(snapshot(r).phase,'battle');}
test('runtime validates stage, attempt and difficulty before mutating its state',()=>{
 const r=new PrologueBattle();for(const change of [{lanes:4},{columns:5},{waves:2}]){const c=context();Object.assign(c.stage,change);assert.throws(()=>r.start(c,()=>{}),/Unsupported/);assert.equal(r.getSnapshot(),null);}
 const c=context();c.attempt.status='won';assert.throws(()=>r.start(c,()=>{}),/active attempt/);c.attempt.status='active';c.attempt.stageId='wrong';assert.throws(()=>r.start(c,()=>{}),/active attempt/);
 assert.throws(()=>r.start({...context(),difficulty:'hard'} as unknown as BattleContext,()=>{}),{code:'INVALID_BATTLE_DIFFICULTY'});
});
test('same attempt re-entry preserves state and cannot revive or reset the battle',()=>{
 const r=new PrologueBattle(),c=context(),original=structuredClone(c);r.start(c,()=>{});begin(r);r.tick(1);const before=snapshot(r);r.start(c,()=>{});
 assert.equal(snapshot(r),before);assert.deepEqual(c,original);assert.equal(before.attemptId,'attempt-1');assert.deepEqual(before.sourceModifiers,['event_success']);assert.equal('inventory' in before,false);
 r.pause(true);const paused=snapshot(r);r.start(c,()=>{});assert.equal(snapshot(r),paused);assert.equal(snapshot(r).externallyPaused,true);
 assert.throws(()=>r.start({...c,difficulty:'high'},()=>{}),{code:'BATTLE_DIFFICULTY_LOCKED'});assert.equal(snapshot(r),paused);
});
test('external pause freezes all inputs while preserving an independent manual pause',()=>{
 const r=new PrologueBattle();r.start(context(),()=>{});begin(r);r.dispatch({type:'PAUSE'});r.pause(true);const before=snapshot(r);r.tick(30);r.dispatch({type:'PAUSE'});r.dispatch({type:'MOVE_CAT',catId:'guard',x:5,y:1});r.complete();assert.equal(snapshot(r),before);
 r.pause(false);assert.equal(snapshot(r).paused,true);const time=snapshot(r).time;r.tick(1);assert.equal(snapshot(r).time,time);r.dispatch({type:'PAUSE'});r.tick(.1);assert.ok(snapshot(r).time>time);
});
test('win settles explicitly once under the original attempt id',()=>{
 const r=new PrologueBattle(),results:BattleResult[]=[],c=context();r.start(c,result=>results.push(result));r.complete();assert.equal(results.length,0);c.attempt.id='external-change';begin(r);winRuntimeBattle(r);
 r.pause(true);r.complete();assert.equal(results.length,0);r.pause(false);r.complete();r.complete();assert.deepEqual(results,[{attemptId:'attempt-1',outcome:'won'}]);
 const settled=snapshot(r);r.tick(5);r.dispatch({type:'PAUSE'});assert.equal(snapshot(r),settled);
});
test('failure settles lost once and only a fresh attempt restores the initial state',()=>{
 const r=new PrologueBattle(),results:BattleResult[]=[];r.start(context(),result=>results.push(result));begin(r);
 // Fixture represents the result of both combatants taking lethal damage.
 const state=snapshot(r);for(const c of state.cats.filter(c=>c.combatant))Object.assign(c,{hp:0,status:'retired',x:-1,y:-1});r.tick(.05);assert.equal(snapshot(r).phase,'failed');
 r.complete();r.complete();assert.deepEqual(results,[{attemptId:'attempt-1',outcome:'lost'}]);const ended=snapshot(r);r.start(context(),()=>{});assert.equal(snapshot(r),ended);
 const fresh=context();fresh.attempt.id='attempt-2';r.start(fresh,()=>{});assert.equal(snapshot(r).phase,'ready');assert.equal(snapshot(r).time,0);assert.equal(snapshot(r).cats[0].hp,CONFIG.HERO_MAX_HP);
});
test('stop clears listeners and callbacks while a fresh start has no stale completion',()=>{
 const r=new PrologueBattle();let notices=0,oldResults=0,newResults=0;const unsubscribe=r.subscribe(()=>notices++);r.start(context(),()=>oldResults++);assert.equal(notices,1);unsubscribe();r.dispatch({type:'START'});assert.equal(notices,1);r.stop();assert.equal(r.getSnapshot(),null);r.tick(10);r.complete();
 const c=context();c.attempt.id='fresh';r.start(c,()=>newResults++);begin(r);winRuntimeBattle(r);r.complete();assert.equal(oldResults,0);assert.equal(newResults,1);assert.equal(notices,1);
});
test('fresh attempt clears pause, speed, inspection and ability aim',()=>{
 const r=new PrologueBattle();r.start(context(),()=>{});begin(r);r.dispatch({type:'SET_SPEED',speed:2});r.dispatch({type:'INSPECT_CAT',catId:'caster'});r.pause(true);
 const c=context();c.attempt.id='new';c.difficulty='high';r.start(c,()=>{});const s=snapshot(r);assert.equal(s.playbackSpeed,1);assert.equal(s.inspectedCatId,null);assert.equal(s.skillAim,null);assert.equal(s.externallyPaused,false);assert.equal(s.difficulty,'high');
});
