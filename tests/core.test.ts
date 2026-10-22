import test from 'node:test';
import assert from 'node:assert/strict';
import {canDispatch} from '../web/src/core/flow/index.ts';
import {GameStore} from '../web/src/core/state/index.ts';
import {GameController} from '../web/src/app/controller.ts';
import {DemoBattle} from '../web/src/examples/demo/battle.ts';
import type {GameState} from '../web/src/contracts/index.ts';
test('流程禁止跳过事件直接提交战斗结果',()=>{assert.equal(canDispatch('explore','COMPLETE_BATTLE'),false);assert.equal(canDispatch('battle','COMPLETE_BATTLE'),true);assert.equal(canDispatch('event','DRAW_FURNITURE'),false);});
test('三条路线布光后可以赢，无防御则失败',()=>{const win=new DemoBattle();for(let lane=0;lane<3;lane++)assert.equal(win.place(lane,0),true);for(let i=0;i<900;i++)win.update(.1);assert.equal(win.outcome,'won');const lose=new DemoBattle();for(let i=0;i<900;i++)lose.update(.1);assert.equal(lose.outcome,'lost');assert.equal(lose.lives,0);});
test('不能越界、重复或超额布阵',()=>{const battle=new DemoBattle();assert.equal(battle.place(-1,0),false);assert.equal(battle.place(3,0),false);assert.equal(battle.place(0,5),false);assert.equal(battle.place(0,0),true);assert.equal(battle.place(0,0),false);battle.place(1,0);battle.place(2,0);assert.equal(battle.place(1,1),false);});
test('流程控制器串行处理命令，禁止并发复用同一进度',async()=>{
 const store=new GameStore();store.replace({revision:0,phase:'dialogue'} as GameState);
 let release!:(value:any)=>void;let calls=0;
 const port={createSession:async()=>({playerId:'x',token:'x'}),catalog:async()=>({}) as any,load:async()=>({revision:1,phase:'explore'}) as GameState,execute:async()=>{calls++;return await new Promise<any>(resolve=>{release=resolve;});}};
 const controller=new GameController(port,store);const first=controller.dispatch({type:'ADVANCE_STORY',nodeId:'intro'});
 await assert.rejects(controller.dispatch({type:'ADVANCE_STORY',nodeId:'intro'}));release({state:{revision:1,phase:'explore'},replayed:false});await first;assert.equal(calls,1);assert.equal(store.getSnapshot()?.revision,1);
});
