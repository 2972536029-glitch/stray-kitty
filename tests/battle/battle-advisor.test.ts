import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, advanceGame } from '../../web/src/modules/battle/l00/engine.ts';
import { getAdvice, getEnemyArrivalAdvice, buildAdvisorContext } from '../../web/src/modules/battle/l00/advisor.ts';
import {ENEMY_TYPES} from '../../web/src/modules/battle/l00/config.ts';
import type {CombatAction, CombatOptions} from '../../web/src/modules/battle/l00/state.ts';
import {finishSkillTutorial} from './helpers.ts';

function gate(options: CombatOptions = {}) { let state = act(createGame(options), { type: 'START' }); while (state.phase !== 'teach_bag') state = advanceGame(state, 0.1); return state; }
const steps: CombatAction[] = [{ type: 'OPEN_BAG' }, { type: 'SELECT_ITEM', itemId: 'warm-can' }, { type: 'SELECT_TARGET', catId: 'caster' }, { type: 'DEPLOY_CAT', catId: 'caster', x: 3, y: 0 }, { type: 'MOVE_CAT', catId: 'guard', x: 4, y: 1 }];
const battle = (options?: CombatOptions) => finishSkillTutorial(steps.reduce((s, a) => act(s, a), gate(options)));

test('the visible formation quick question returns actionable B1 formation advice', () => {
  const advice = getAdvice(battle(), '现在怎么摆阵？');
  assert.equal(advice.targetId, 'guard');
  assert.match(advice.text, /B1/);
  assert.match(advice.text, /斑斑/);
  assert.match(advice.text, /绒绒/);
  assert.match(advice.text, /除 B1 和 B7 出怪口外的 19 个候选格/);
  assert.match(advice.text, /A7、C7 是普通可部署格/);
});

test('every mandatory step has explanation only: no AI action can skip the bag tutorial', () => {
  let state = gate();
  for (const action of steps) {
    for (const question of ['', '给猫治疗', '怎么攻击', '推荐技能']) assert.equal(getAdvice(state, question).action, undefined);
    state = act(state, action);
  }
});

test('advisor treatment action names a valid injured combatant and actual shared inventory', () => {
  const state = battle();
  state.cats.find((cat) => cat.id === 'guard')!.hp = 130;
  const before = JSON.stringify(state);
  const advice = getAdvice(state, '我想用道具加血');
  assert.deepEqual([advice.action, advice.itemId, advice.targetId], ['USE_ITEM', 'warm-can', 'guard']);
  assert.match(advice.text, /恢复 60 点/);
  const used = act(state, { type: advice.action, itemId: advice.itemId, catId: advice.targetId });
  assert.equal(used.lastAction!.ok, true);
  assert.equal(used.inventory['warm-can'], 1);
  assert.equal(JSON.stringify(state), before);
});

test('no inventory or no injured combat cat means no treatment action', () => {
  const state = battle();
  assert.equal(getAdvice(state, '治疗').action, undefined);
  state.cats.find((cat) => cat.id === 'guard')!.hp = 130;
  state.inventory['warm-can'] = 0;
  assert.equal(getAdvice(state, '治疗').action, undefined);
  assert.match(getAdvice(state, '治疗').text, /没有暖心罐罐/);
});

test('explicit healing requests respect the selected cat and never offer medicine for hero', () => {
  const state = battle();
  state.cats.find((cat) => cat.id === 'guard')!.hp = 90;
  state.cats.find((cat) => cat.id === 'caster')!.hp = 60;
  assert.equal(getAdvice(state, '给绒绒加血').targetId, 'caster');
  assert.equal(getAdvice(state, '给盾猫治疗').targetId, 'guard');
  assert.equal(getAdvice(state, '给主角加血').action, undefined);
  assert.match(getAdvice(state, '给主角加血').text, /不使用战斗药品/);
  state.cats.find((cat) => cat.id === 'caster')!.hp = 80;
  assert.equal(getAdvice(state, '给绒绒治疗').action, undefined);
});

test('visible enemy advice does not inspect future waves and targets the specified enemy', () => {
  const state = battle();
  state.enemies = [
    { ...ENEMY_TYPES.scout, id: 'a', type: 'scout', hp: 75, maxHp: 75, x: 4, y: 1, cooldown: 0, blockedBy: null },
    { ...ENEMY_TYPES.runner, id: 'b', type: 'runner', hp: 50, maxHp: 50, x: 5, y: 1, cooldown: 0, blockedBy: null },
    { ...ENEMY_TYPES.runner, id: 'c', type: 'runner', hp: 50, maxHp: 50, x: 6.7, y: 1, cooldown: 0, blockedBy: null },
  ];
  const before = JSON.stringify(state);
  assert.match(getEnemyArrivalAdvice(state, 'a')!.title, /巡逻/);
  assert.match(getEnemyArrivalAdvice(state, 'b')!.title, /疾行/);
  assert.equal(getEnemyArrivalAdvice(state, 'b')!.targetId, 'b');
  assert.equal(getEnemyArrivalAdvice(state, 'c'), null);
  assert.equal(getEnemyArrivalAdvice(state, 'missing'), null);
  assert.equal(buildAdvisorContext(state).visibleEnemies.length, 2);
  assert.equal('spawnIndex' in buildAdvisorContext(state), false);
  assert.equal(JSON.stringify(state), before);
});

test('abilities describe real roles, directional rules and capacity without invented skills', () => {
  const advice = getAdvice(battle(), '推荐技能');
  assert.match(advice.text, /喵喵不攻击、不阻挡/);
  assert.match(advice.text, /2 只/);
  assert.match(advice.text, /阻挡 1 只/);
  assert.match(advice.text, /矩形/);
  assert.match(advice.text, /十字/);
  assert.match(advice.text, /全地图 21 格.*B1 和 B7.*不受普攻范围限制/);
  assert.match(advice.text, /最多 5 格.*裁切.*不伤害伙伴/);
  assert.match(advice.text, /罐盖护盾仅自身/);
  assert.match(advice.text, /护盾/);
  assert.match(advice.text, /能量/);
  assert.equal(advice.action, undefined);
});

test('unknown questions explain offline boundaries without reflecting prompt content', () => {
  const advice = getAdvice(battle(), '<script>inject</script> secret password');
  assert.match(advice.text, /离线规则顾问/);
  assert.doesNotMatch(advice.text, /script|password/);
  assert.equal(advice.action, undefined);
});

test('advisor explains the board-resident commander and converging endpoint without an off-board hero', () => {
  assert.match(getAdvice(battle(), '推荐阵型').text, /B1.*永久|永久.*B1/);
  assert.match(getAdvice(battle(), '防守规则').text, /A7→A1→B1.*B7→B1.*C7→C1→B1/);
  assert.match(getAdvice(battle(), '防守规则').text, /本关实际只从 B7 出怪，A7、C7 是普通可部署格/);
  assert.doesNotMatch(getAdvice(battle(), '防守规则').text, /汇入 B2/);
  assert.match(getAdvice(battle(), '给主角治疗').text, /棋盘内 B1/);
  const opening = act(createGame(), {type: 'START'});
  assert.match(getAdvice(opening).text, /B4.*棋盘内 B1/);
  assert.doesNotMatch(getAdvice(opening).text, /独立指挥位|棋盘外/);
});

test('advisor can explain the selected difficulty and tutorial protection without triggering an action', () => {
  const state = battle({difficulty: 'high'});
  const advice = getAdvice(state, '当前难度是什么？');
  assert.equal(buildAdvisorContext(state).difficulty, 'high');
  assert.match(advice.text, /困难/);
  assert.match(advice.text, /120%/);
  assert.match(advice.text, /免费重整/);
  assert.equal(advice.action, undefined);
  const standard = getAdvice({...state, mode: 'standard'}, '当前难度是什么？');
  assert.match(standard.text, /当前是标准模式，3 次突破后本场结束/);
  assert.doesNotMatch(standard.text, /都保留/);
});

test('shield questions explain protection rather than offering healing and full energy only gives advice', () => {
  const state = battle(); const guard = state.cats.find(cat => cat.id === 'guard')!;
  guard.hp = 130; guard.energy = 100;
  const shield = getAdvice(state, '护盾能给斑斑回血吗？');
  assert.match(shield.text, /护盾不回血/); assert.equal(shield.action, undefined);
  const charged = getAdvice(state);
  assert.match(charged.text, /能量已满/); assert.match(charged.text, /手动/);
  assert.equal(charged.targetId, 'guard'); assert.equal(charged.action, undefined);
  assert.equal(guard.energy, 100); assert.equal(guard.hp, 130);
});

test('advisor exposes actual skill resources and cells but never treats the practice dummy as enemy intel', () => {
  const state = act(steps.reduce((s, action) => act(s, action), gate()), {type: 'BEGIN_SKILL_PRACTICE'});
  const context = buildAdvisorContext(state);
  assert.deepEqual(context.visibleEnemies, []);
  assert.equal(getEnemyArrivalAdvice(state, 'skill-training-dummy'), null);
  const guard = context.cats.find(cat => cat.id === 'guard')!;
  assert.deepEqual([guard.energy, guard.shield, guard.shieldRemaining], [0, 0, 0]);
  assert.equal(guard.attackCells.length, 4); assert.equal('range' in guard, false);
  const advice = getAdvice(state, '释放技能');
  assert.match(advice.text, /木偶/); assert.match(advice.text, /不会反击/); assert.equal(advice.action, undefined);
});

test('caster guidance explains hover preview and direct left-click release without a confirmation step', () => {
  const state = battle(); state.cats.find(cat => cat.id === 'caster')!.energy = 100;
  for (const advice of [getAdvice(state), getAdvice({...state, phase: 'teach_caster_skill'})]) {
    assert.match(advice.text, /全地图 21 格.*B1 和 B7.*不受普攻范围限制/);
    assert.match(advice.text, /移动鼠标预览整个黄色十字/);
    assert.match(advice.text, /左键直接释放/); assert.match(advice.text, /右键或 Esc 取消/);
    assert.doesNotMatch(advice.text, /确认释放|拖动或点选/); assert.equal(advice.action, undefined);
  }
});

test('advisor energy suggestions use the actual partial gain and never offer a cooling-down or resting target', () => {
  const state = battle(); const caster = state.cats.find(cat => cat.id === 'caster')!;
  caster.energy = 90;
  const before = structuredClone(state);
  const advice = getAdvice(state, '给绒绒补能');
  assert.deepEqual([advice.action, advice.itemId, advice.targetId], ['USE_ITEM', 'bouncy-treat', 'caster']);
  assert.match(advice.text, /实际补充 10 点/); assert.match(advice.text, /消耗一整份/);
  const next = act(state, {type: advice.action, itemId: advice.itemId, catId: advice.targetId});
  assert.equal(next.lastAction!.ok, true); assert.equal(next.cats.find(cat => cat.id === 'caster')!.energy, 100);
  assert.deepEqual(state, before);
  caster.energyItemCooldown = 2;
  assert.equal(getAdvice(state, '给绒绒补能').action, undefined);
  caster.energyItemCooldown = 0; caster.status = 'resting'; caster.x = -2;
  assert.equal(getAdvice(state, '给绒绒补能').action, undefined);
  assert.equal(getAdvice(state, '给主角补能').action, undefined);
});

test('advisor shares item cooldown validation and explains the new lesson without applying items for the player', () => {
  const state = battle(); state.cats.find(cat => cat.id === 'guard')!.hp = 100; state.healingCooldown = 2;
  assert.equal(getAdvice(state, '给斑斑治疗').action, undefined);
  assert.match(getAdvice(state, '给斑斑治疗').text, /共用冷却/);
  const context = buildAdvisorContext(state);
  assert.equal(context.healingCooldown, 2); assert.deepEqual(context.initialInventory, state.initialInventory);
  context.inventory['warm-can'] = 0; context.initialInventory['warm-can'] = 0;
  assert.equal(state.inventory['warm-can'], 2); assert.equal(state.initialInventory['warm-can'], 2);
  const lesson = {...state, phase: 'teach_energy_item' as const, tutorialStep: 'teach_energy_item' as const};
  for (const question of ['', '给绒绒补能', '给斑斑治疗']) {
    const advice = getAdvice(lesson, question);
    assert.equal(advice.action, undefined); assert.match(advice.text, /70.*100/); assert.match(advice.text, /背包/);
  }
});
