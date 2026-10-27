import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketBattle} from '../../web/src/modules/battle/market/engine.ts';
import {getMarketAnswer} from '../../web/src/modules/battle/market/advisor.ts';

test('market advice explains the locked sweep row and that energy sealing does not forbid charged skills',()=>{
  const state=createMarketBattle();state.phase='battle';state.boss.phase='windup';state.boss.targetRow=1;
  const answer=getMarketAnswer(state,'如何躲熄灯横扫和封能？');
  assert.match(answer.text,/当前危险行为 B 行/);assert.match(answer.text,/3 秒后/);assert.match(answer.text,/45 伤害/);
  assert.match(answer.text,/封能 4 秒/);assert.match(answer.text,/满的技能仍可释放/);
});

test('both new companions can be requested together without inventing passive healing or boss movement control',()=>{
  const answer=getMarketAnswer(createMarketBattle(),'栗栗和铃铃有什么能力？');
  assert.match(answer.text,/栗盾奋击/);assert.match(answer.text,/35 护盾/);assert.match(answer.text,/50%/);
  assert.match(answer.text,/银铃缓行/);assert.match(answer.text,/25 点伤害/);assert.match(answer.text,/降低 40%/);
  assert.match(answer.text,/不改变固定首领/);assert.doesNotMatch(answer.text,/星绒绽放/);
});

test('retired healer and retired patient produce actionable advice without resurrection',()=>{
  const state=createMarketBattle();const healer=state.cats.find(cat=>cat.id==='diandian')!;
  healer.status='retired';healer.hp=0;state.cats.find(cat=>cat.id==='guard')!.hp=20;
  assert.match(getMarketAnswer(state,'斑斑受伤怎么治疗？').text,/点点已经退场/);
  assert.match(getMarketAnswer(state,'治疗点点').text,/无法治疗或复活/);
});

test('market map advice names seven actual entrances and the protected single boss tile',()=>{
  const answer=getMarketAnswer(createMarketBattle(),'怎么摆阵和安排入口？');
  for(const cell of ['A4','A5','B8','C8','D8','E4','E5','C1','C7'])assert.ok(answer.text.includes(cell));
  assert.match(answer.text,/17 格/);assert.doesNotMatch(answer.text,/D10|E10|四格首领/);
});

test('market advisor never forecasts unpublished waves and does not mutate the simulation',()=>{
  const state=createMarketBattle(),before=structuredClone(state);
  assert.match(getMarketAnswer(state,'下一波有什么敌人？').text,/不会/);
  for(const question of ['现在有什么黑影','谁需要治疗','怎样蓄能','栗栗技能','军师职责',''])getMarketAnswer(state,question);
  assert.deepEqual(state,before);
});
