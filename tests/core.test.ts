import test from 'node:test';
import assert from 'node:assert/strict';
import {canDispatch} from '../web/src/core/flow/index.ts';
import {GameStore} from '../web/src/core/state/index.ts';
import {GameController} from '../web/src/app/controller.ts';
import {DemoBattle} from '../web/src/examples/demo/battle.ts';
import {objective} from '../web/src/core/story/index.ts';
import {exploreChapter2Command, startChapter2Command} from '../web/src/ui/chapterCommands.ts';
import type {GameState} from '../web/src/contracts/index.ts';
test('battle completion and dev QA are restricted to the battle phase',()=>{assert.equal(canDispatch('explore','COMPLETE_BATTLE'),false);assert.equal(canDispatch('battle','COMPLETE_BATTLE'),true);assert.equal(canDispatch('battle','QA_SIMULATE_VICTORY'),true);assert.equal(canDispatch('explore','QA_SIMULATE_VICTORY'),false);assert.equal(canDispatch('event','DRAW_FURNITURE'),false);assert.equal(canDispatch('dialogue','DRAW_FURNITURE'),true);});
test('家具购买只能在家园进行',()=>{assert.equal(canDispatch('home','BUY_FURNITURE'),true);assert.equal(canDispatch('explore','BUY_FURNITURE'),false);assert.equal(canDispatch('battle','BUY_FURNITURE'),false);});
test('旧 Demo 样例：三条路线布光后可以赢，无防御则失败',()=>{const win=new DemoBattle();for(let lane=0;lane<3;lane++)assert.equal(win.place(lane,0),true);for(let i=0;i<900;i++)win.update(.1);assert.equal(win.outcome,'won');const lose=new DemoBattle();for(let i=0;i<900;i++)lose.update(.1);assert.equal(lose.outcome,'lost');assert.equal(lose.lives,0);});
test('旧 Demo 样例：不能越界、重复或超额布阵',()=>{const battle=new DemoBattle();assert.equal(battle.place(-1,0),false);assert.equal(battle.place(3,0),false);assert.equal(battle.place(0,5),false);assert.equal(battle.place(0,0),true);assert.equal(battle.place(0,0),false);battle.place(1,0);battle.place(2,0);assert.equal(battle.place(1,1),false);});
test('旧 Demo 样例：事件黑影压力实际改变速度，三档压力都能通过合理布阵完成救援',()=>{
 const calm=new DemoBattle(3,2,false,-1), tense=new DemoBattle(3,2,false,1);
 for(let i=0;i<30;i++){calm.update(.1);tense.update(.1);}
 assert.ok(tense.shadows[0].x<calm.shadows[0].x);
 for(const pressure of [-1,0,1] as const){const game=new DemoBattle(3,2,false,pressure);for(let lane=0;lane<3;lane++)game.place(lane,0);for(let i=0;i<900;i++)game.update(.1);assert.equal(game.outcome,'won');}
});
test('流程控制器串行处理命令，禁止并发复用同一进度',async()=>{
 const store=new GameStore();store.replace({revision:0,phase:'dialogue'} as GameState);
 let release!:(value:any)=>void;let calls=0;
 const port={createSession:async()=>({playerId:'x',token:'x'}),catalog:async()=>({}) as any,load:async()=>({revision:1,phase:'explore'}) as GameState,execute:async()=>{calls++;return await new Promise<any>(resolve=>{release=resolve;});}};
 const controller=new GameController(port,store);const first=controller.dispatch({type:'ADVANCE_STORY',nodeId:'intro'});
 await assert.rejects(controller.dispatch({type:'ADVANCE_STORY',nodeId:'intro'}));release({state:{revision:1,phase:'explore'},replayed:false});await first;assert.equal(calls,1);assert.equal(store.getSnapshot()?.revision,1);
});

test('教程结算重试通过控制器进入新的服务端场次', async () => {
  const store = new GameStore();
  store.replace({revision: 3, phase: 'settlement', activeBattle: {id: 'failed', stageId: 'l00_tutorial', status: 'lost'}} as GameState);
  let received: unknown;
  const port = {createSession: async () => ({playerId: 'x', token: 'x'}), catalog: async () => ({}) as any, load: async () => store.getSnapshot()!, execute: async (request: unknown) => {
    received = request;
    return {state: {revision: 4, phase: 'battle', activeBattle: {id: 'retry', stageId: 'l00_tutorial', status: 'active'}} as GameState, replayed: false};
  }};
  await new GameController(port, store).dispatch({type: 'START_BATTLE', stageId: 'l00_tutorial'});
  assert.deepEqual(received, {expectedRevision: 3, command: {type: 'START_BATTLE', stageId: 'l00_tutorial'}});
  assert.equal(store.getSnapshot()!.activeBattle!.id, 'retry');
});

test('greenhouse Chapter 2 actions dispatch story entry and exploration separately from battle trial', async () => {
  const home={revision:7,phase:'home',chapterId:'greenhouse',mapId:'greenhouse',flags:['alley_rescued','rescue_story_done'],activeBattle:null} as GameState;
  const store=new GameStore();store.replace(home);
  let received:any;
  const port={createSession:async()=>({playerId:'x',token:'x'}),catalog:async()=>({}) as any,load:async()=>store.getSnapshot()!,execute:async(request:any)=>{
    received=request;
    return {state:{...home,revision:8,phase:'dialogue',chapterId:'market',mapId:'market',storyNodeId:'market_intro_1',flags:[...home.flags]},replayed:false} as any;
  }};
  await new GameController(port,store).dispatch(startChapter2Command());
  assert.deepEqual(received.command,{type:'START_STORY',nodeId:'market_intro_1'});
  assert.equal(store.getSnapshot()?.phase,'dialogue');
  assert.equal(store.getSnapshot()?.chapterId,'market');
  assert.equal(store.getSnapshot()?.mapId,'market');
  assert.equal(store.getSnapshot()?.activeBattle,null);

  const explorationPort={...port,execute:async(request:any)=>{
    received=request;
    return {state:{...home,revision:8,phase:'explore',chapterId:'market',mapId:'market',flags:[...home.flags,'chapter_2_started'],activeBattle:null},replayed:false} as any;
  }};
  store.replace({...home,flags:[...home.flags,'chapter_2_started']});
  await new GameController(explorationPort,store).dispatch(exploreChapter2Command());
  assert.deepEqual(received.command,{type:'GO_EXPLORE',mapId:'market'});
  assert.equal(store.getSnapshot()?.phase,'explore');
  assert.equal(store.getSnapshot()?.chapterId,'market');
  assert.equal(store.getSnapshot()?.mapId,'market');
  assert.equal(store.getSnapshot()?.activeBattle,null);
});

test('第三、四章与终章进度不会覆盖当前序章的六波教学目标', () => {
  for (const chapterId of ['greenhouse', 'rescue', 'finale'] as const) {
    const state = {phase: 'battle', chapterId, mapId: 'greenhouse', cats: [],
      flags: ['chapter_3_started', 'chapter_4_started', 'finale_started', 'finale_completed'],
      activeBattle: {id: 'tutorial-revisit', stageId: 'l00_tutorial', status: 'active'}} as GameState;
    assert.match(objective(state), /六波教学/);
  }
});

test('第三、四章与终章进度不会覆盖当前第一章的八波首领战目标', () => {
  for (const chapterId of ['greenhouse', 'rescue', 'finale'] as const) {
    for (const stageId of ['alley_rescue', 'alley_boss']) {
      const state = {phase: 'battle', chapterId, mapId: 'greenhouse', cats: [],
        flags: ['chapter_3_started', 'chapter_4_started', 'finale_started', 'finale_completed'],
        activeBattle: {id: 'chapter-revisit', stageId, status: 'active'}} as GameState;
      assert.match(objective(state), /八波黑影/);
      assert.match(objective(state), /首领/);
    }
  }
});
