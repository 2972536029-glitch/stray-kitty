import test from 'node:test';
import assert from 'node:assert/strict';
import {createGreenhouseBattle} from '../../web/src/modules/battle/greenhouse/engine.ts';
import {getGreenhouseAnswer} from '../../web/src/modules/battle/greenhouse/advisor.ts';

test('greenhouse advice preserves the exact irregular boundary and three entrances',()=>{
  const answer=getGreenhouseAnswer(createGreenhouseBattle(),'花房地图的边界和入口？');
  for(const text of ['A2–A5','B1–B7','C2–C8','D2–D9','E2–E8','F7','34 格','20 格','23 个候选部署格','C8','E8'])assert.ok(answer.text.includes(text),text);
  assert.match(answer.text,/不能移动、选点或穿行/);
});

test('momo distinguishes existing thorns from locked but not yet landed seeds',()=>{
  const state=createGreenhouseBattle();state.phase='battle';state.boss.phase='windup';state.boss.targetCells=[{x:4,y:2}];
  state.hazards=[{id:1,x:3,y:1,remaining:3,tickIn:1,ticks:3}];
  const answer=getGreenhouseAnswer(state,'墨墨能清掉哪些荆棘？');
  assert.match(answer.text,/45 护盾/);assert.match(answer.text,/8 秒/);assert.match(answer.text,/不相加/);
  assert.match(answer.text,/不能取消尚未落地的播种预告/);assert.match(answer.text,/当前已生成荆棘：B4/);
});

test('persistent thorn advice still warns during boss recovery and idle',()=>{
  for(const phase of ['recovery','idle'] as const){
    const state=createGreenhouseBattle();state.phase='battle';state.boss.phase=phase;state.boss.targetCells=[];
    state.hazards=[{id:1,x:4,y:3,remaining:5,tickIn:1,ticks:1}];
    const answer=getGreenhouseAnswer(state,'现在荆棘安全吗？');
    assert.match(answer.text,/当前持续荆棘：D5/);assert.match(answer.text,/仍不安全/);
    assert.match(answer.text,/6 秒/);assert.match(answer.text,/每秒 12 伤害/);assert.match(answer.text,/落地满 1 秒/);
  }
});

test('healing and retired companions never suggest absent Diandian skills or resurrection',()=>{
  const state=createGreenhouseBattle();
  assert.match(getGreenhouseAnswer(state,'点点能治疗吗？').text,/点点在场外巡视陷阱/);
  assert.match(getGreenhouseAnswer(state,'点点能治疗吗？').text,/不恢复体力/);
  assert.match(getGreenhouseAnswer(state,'退场的猫怎么复活？').text,/不能移动、施法、复活或重新部署/);
  state.cats.find(cat=>cat.id==='momo')!.status='retired';
  assert.match(getGreenhouseAnswer(state,'墨墨的巡光护行').text,/墨墨已退场/);
});

test('greenhouse advice uses its own boss rules rather than market energy sealing',()=>{
  const answer=getGreenhouseAnswer(createGreenhouseBattle(),'还有熄灯横扫和封能吗？');
  assert.match(answer.text,/本章没有熄灯横扫或封能/);
  assert.match(answer.text,/两处播种预告/);
});

test('local greenhouse advice does not predict unpublished waves or mutate state',()=>{
  const state=createGreenhouseBattle(),before=structuredClone(state);
  assert.match(getGreenhouseAnswer(state,'下一波是什么？').text,/不会预读/);
  for(const prompt of ['当前敌人','地图','六只猫有什么能力？','墨墨技能','怎样蓄能','主角职责',''])getGreenhouseAnswer(state,prompt);
  assert.deepEqual(state,before);
});
