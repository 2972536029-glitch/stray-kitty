import assert from 'node:assert/strict';
import test from 'node:test';
import {getChapterAnswer} from '../../web/src/modules/battle/chapter/advisor.ts';
import {advanceChapter, createChapterBattle, dispatchChapter} from '../../web/src/modules/battle/chapter/engine.ts';
const start = () => dispatchChapter(createChapterBattle(), {type:'START'});

test('advisor explains the compact four-cat map and exact roles without mutating state', () => {
  const state = start(), before = structuredClone(state);
  const formation = getChapterAnswer(state, '现在怎么摆阵？');
  for (const cell of ['A4','B4','C4','D4','D1','D10','E10','D8','D9','E8','E9','A5','B5','C5']) assert.ok(formation.text.includes(cell), cell);
  assert.match(formation.text, /斑斑挡 2 只/);
  const abilities = getChapterAnswer(state, '猫咪有什么能力？');
  for (const cat of state.cats) assert.ok(abilities.text.includes(cat.name));
  assert.match(abilities.text, /安心呼噜.*80/); assert.ok(abilities.text.includes('\n')); assert.equal(abilities.text.includes('\\n'), false);
  assert.match(getChapterAnswer(state, '团子有什么技能').text, /橘影连爪.*120/);
  assert.deepEqual(state, before);
});

test('healing advice uses only active Diandian and never promises revival or item actions', () => {
  const state = start(); state.cats[0].hp = 20;
  let answer = getChapterAnswer(state, '谁需要治疗？'); assert.match(answer.text, /蓄满后/); assert.equal('itemId' in answer, false);
  state.cats[3].energy = 100; answer = getChapterAnswer(state, '谁需要治疗？'); assert.match(answer.text, /手动使用安心呼噜/);
  state.cats[0].hp = 0; state.cats[0].status = 'retired';
  assert.match(getChapterAnswer(state, '给绒绒治疗').text, /无法被治疗/);
  state.cats[1].hp = 20; state.cats[3].status = 'retired'; state.cats[3].hp = 0;
  assert.match(getChapterAnswer(state, '谁需要治疗？').text, /点点已退场/);
  assert.match(getChapterAnswer(state, '可以复活吗').text, /永久退出本场/);
});

test('energy advice accurately describes passive simulation-time charging with no consumables', () => {
  const state = start(); const answer = getChapterAnswer(state, '怎样补能？');
  assert.match(answer.text, /每模拟秒自动获得 5/); assert.match(answer.text, /约 20 秒/);
  assert.match(answer.text, /暂停.*不蓄能/); assert.match(answer.text, /没有技能冷却或补能道具/);
  assert.match(getChapterAnswer(state, '喵喵有什么技能').text, /不占四猫/);
});

test('advisor reports only visible enemies, real boss tells and local-rule limitations', () => {
  let state = start();
  assert.match(getChapterAnswer(state, '现在黑影情况').text, /尚未出现/);
  assert.match(getChapterAnswer(state, '下一波来什么怪').text, /不会预读/);
  state = advanceChapter(state, .05);
  const visible = getChapterAnswer(state, '现在黑影情况'); assert.match(visible.text, /当前可见普通黑影 1 名/); assert.doesNotMatch(visible.text, /厚衣|疾行/);
  assert.match(getChapterAnswer(state, '今晚星星').text, /本地规则/);
  state.boss.phase = 'windup'; state.boss.targetCells = [{x:5,y:3},{x:5,y:4}];
  assert.match(getChapterAnswer(state, 'Boss 怎么打').text, /D6、E6/);
  state.boss.phase = 'defeated'; assert.match(getChapterAnswer(state, 'Boss 怎么打').text, /还要处理完所有普通敌人/);
});

test('terminal advice cannot offer further combat actions', () => {
  const state = start(); for (const phase of ['won','lost'] as const) {
    state.phase = phase; const answer = getChapterAnswer(state, '谁需要治疗？'); assert.match(answer.title, /已经结束/); assert.equal('catId' in answer, false);
  }
});
