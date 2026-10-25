import assert from 'node:assert/strict';
import test from 'node:test';
import {getChapterAnswer, type ChapterAdvice} from '../../web/src/modules/battle/chapter/advisor.ts';
import {advanceChapter, createChapterBattle, dispatchChapter, getItemTargetError} from '../../web/src/modules/battle/chapter/engine.ts';

function withSupplies() {
  return dispatchChapter(createChapterBattle({loadout: {'warm-can': 4, 'bouncy-treat': 2}}), {type: 'START'});
}
function noAction(answer: ChapterAdvice) {
  assert.equal(answer.itemId, undefined);
  assert.equal(answer.catId, undefined);
}

test('chapter advisor explains the actual six-cat alley and four-cell Boss without mutating state', () => {
  const state = withSupplies(), before = structuredClone(state);
  const formation = getChapterAnswer(state, '现在怎么摆阵？');
  for (const cell of ['A5', 'B5', 'C5', 'D5', 'D1', 'D12', 'E12', 'D10', 'D11', 'E10', 'E11', 'A6', 'B6', 'C6']) assert.ok(formation.text.includes(cell), cell);
  assert.match(formation.text, /斑斑挡 2 只/);
  const abilities = getChapterAnswer(state, '猫咪有什么能力？');
  for (const cat of state.cats) assert.ok(abilities.text.includes(cat.name), cat.name);
  assert.match(abilities.text, /归家和声.*55/);
  assert.match(abilities.text, /25%.*50%/);
  assert.ok(abilities.text.includes('\n'));
  assert.equal(abilities.text.includes('\\n'), false);
  getChapterAnswer(state, '谁需要治疗？');
  getChapterAnswer(state, '怎样补能？');
  assert.deepEqual(state, before);
});

test('zero inventory and full HP/energy never produce a fake item action', () => {
  const empty = dispatchChapter(createChapterBattle(), {type: 'START'});
  empty.cats[0].hp = 30;
  noAction(getChapterAnswer(empty, '谁需要治疗？'));
  noAction(getChapterAnswer(empty, '怎样补能？'));
  assert.match(getChapterAnswer(empty, '谁需要治疗？').text, /没有剩余|没有免费/);
  const full = withSupplies();
  for (const cat of full.cats) cat.energy = 100;
  noAction(getChapterAnswer(full, '谁需要治疗？'));
  noAction(getChapterAnswer(full, '怎样补能？'));
  noAction(getChapterAnswer(full, '给绒绒补能'));
  assert.match(getChapterAnswer(full, '给绒绒补能').text, /能量已满/);
});

test('resting cats may receive healing but never energy; shared and per-cat cooldowns are respected', () => {
  const state = withSupplies(), cat = state.cats[0];
  cat.hp = 20; cat.status = 'resting'; cat.energy = 80;
  const heal = getChapterAnswer(state, '给绒绒治疗');
  assert.equal(heal.itemId, 'warm-can'); assert.equal(heal.catId, cat.id);
  assert.equal(getItemTargetError(state, heal.itemId!, heal.catId!), null);
  assert.match(heal.text, /手动部署/);
  noAction(getChapterAnswer(state, '给绒绒补能'));
  state.healingCooldown = 2;
  noAction(getChapterAnswer(state, '谁需要治疗？'));
  cat.status = 'active'; cat.energyItemCooldown = 6;
  noAction(getChapterAnswer(state, '给绒绒补能'));
  const alternate = getChapterAnswer(state, '怎样补能？');
  assert.equal(alternate.itemId, 'bouncy-treat');
  assert.notEqual(alternate.catId, cat.id);
  assert.equal(getItemTargetError(state, alternate.itemId!, alternate.catId!), null);
});

test('advisor action eligibility follows external pause, aim and terminal state, while manual pause permits valid items', () => {
  const state = withSupplies(); state.cats[0].hp = 30;
  state.paused = true; state.uiPaused = true;
  const heal = getChapterAnswer(state, '给绒绒治疗');
  assert.equal(heal.itemId, 'warm-can');
  state.externallyPaused = true;
  noAction(getChapterAnswer(state, '给绒绒治疗'));
  state.externallyPaused = false; state.aim = {catId: 'caster', target: null};
  noAction(getChapterAnswer(state, '给绒绒治疗'));
  noAction(getChapterAnswer(state, '怎样补能？'));
  state.aim = null;
  for (const phase of ['won', 'lost'] as const) {
    state.phase = phase;
    noAction(getChapterAnswer(state, '给绒绒治疗'));
    noAction(getChapterAnswer(state, '怎样补能？'));
  }
});

test('an old advisor suggestion cannot consume supplies after the target state changes', () => {
  let state = withSupplies(); state.cats[0].hp = 30;
  const answer = getChapterAnswer(state, '给绒绒治疗');
  assert.equal(answer.itemId, 'warm-can');
  state = dispatchChapter(state, {type: 'USE_ITEM', itemId: answer.itemId!, catId: answer.catId!});
  assert.equal(state.lastAction?.ok, true);
  const before = structuredClone(state);
  assert.ok(getItemTargetError(state, answer.itemId!, answer.catId!));
  state = dispatchChapter(state, {type: 'USE_ITEM', itemId: answer.itemId!, catId: answer.catId!});
  assert.equal(state.lastAction?.ok, false);
  assert.deepEqual(state.inventory, before.inventory);
  assert.deepEqual(state.usedSupplies, before.usedSupplies);
  assert.deepEqual(state.cats, before.cats);
});

test('advisor limits enemy information to visible state and identifies local rules for unknown questions', () => {
  let state = withSupplies();
  assert.match(getChapterAnswer(state, '现在黑影情况').text, /尚未出现/);
  assert.match(getChapterAnswer(state, '下一波来什么怪').text, /不会预读/);
  state = advanceChapter(state, 0.05);
  const visible = getChapterAnswer(state, '现在黑影情况');
  assert.match(visible.text, /当前可见普通黑影 1 名/);
  assert.match(visible.text, /巡逻黑影/);
  assert.doesNotMatch(visible.text, /厚衣|疾行/);
  const unknown = getChapterAnswer(state, '聊聊今晚的星星');
  assert.match(unknown.text, /本地规则/); noAction(unknown);
  state.boss.phase = 'windup'; state.boss.targetCells = [{x: 6, y: 3}, {x: 6, y: 4}];
  assert.match(getChapterAnswer(state, 'Boss 怎么打').text, /D7、E7/);
  state.boss.phase = 'defeated';
  assert.match(getChapterAnswer(state, 'Boss 怎么打').text, /还要处理完所有普通敌人/);
});
