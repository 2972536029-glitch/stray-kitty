import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModelAdvisorContext, type ModelAdvisorState} from '../../web/src/modules/battle/advisor-context.ts';
import {createGame} from '../../web/src/modules/battle/l00/engine.ts';
import {createChapterBattle} from '../../web/src/modules/battle/chapter/engine.ts';
import {createMarketBattle} from '../../web/src/modules/battle/market/engine.ts';
import {createGreenhouseBattle} from '../../web/src/modules/battle/greenhouse/engine.ts';
import {createTunnelBattle, isEnemyVisible} from '../../web/src/modules/battle/tunnel/engine.ts';
import {createFinaleBattle} from '../../web/src/modules/battle/finale/engine.ts';
import {SKILLS as CHAPTER_SKILLS, CELLS as CHAPTER_CELLS} from '../../web/src/modules/battle/chapter/config.ts';
import {SKILLS as MARKET_SKILLS, CELLS as MARKET_CELLS} from '../../web/src/modules/battle/market/config.ts';
import {SKILLS as GREENHOUSE_SKILLS, CELLS as GREENHOUSE_CELLS} from '../../web/src/modules/battle/greenhouse/config.ts';
import {SKILLS as TUNNEL_SKILLS, CELLS as TUNNEL_CELLS} from '../../web/src/modules/battle/tunnel/config.ts';
import {SKILLS as FINALE_SKILLS, CELLS as FINALE_CELLS, ALLY_DEFINITIONS} from '../../web/src/modules/battle/finale/config.ts';
import {ENEMY_TYPES} from '../../web/src/modules/battle/l00/config.ts';
import type {TunnelEnemy} from '../../web/src/modules/battle/tunnel/types.ts';
import {beginBattle} from './helpers.ts';
import {prepareBattleAdvisorRequest} from '../../web/src/modules/advisor/prepare-battle-request.ts';

const read = (id: string, state: ModelAdvisorState) => JSON.parse(buildModelAdvisorContext(id, state));
const enemy = (id: string, x = 7, y = 1): TunnelEnemy => ({
  id, name: id, kind: 'scout', x, y, hp: 91, maxHp: 100, route: 'lower', pathIndex: 0,
  damage: 9, speed: .55, interval: 1.4, cooldown: 0, blockedBy: null, slowRemaining: 0, slowMultiplier: 1,
});
const cases = () => [
  {id: 'alley_rescue', state: createChapterBattle(), cells: CHAPTER_CELLS, skills: CHAPTER_SKILLS},
  {id: 'market_boss', state: createMarketBattle(), cells: MARKET_CELLS, skills: MARKET_SKILLS},
  {id: 'greenhouse_boss', state: createGreenhouseBattle(), cells: GREENHOUSE_CELLS, skills: GREENHOUSE_SKILLS},
  {id: 'tunnel_boss', state: createTunnelBattle(), cells: TUNNEL_CELLS, skills: TUNNEL_SKILLS},
  {id: 'finale_boss', state: createFinaleBattle(), cells: FINALE_CELLS, skills: FINALE_SKILLS},
];

test('shared request preparation keeps the explicit attempt and excludes hidden snapshot and adapter fields', () => {
  const state = createTunnelBattle(); state.phase = 'battle'; state.darknessRemaining = 8;
  state.enemies = [enemy('visible-near-guard', 0, 2), enemy('secret-distant-enemy')];
  Object.assign(state, {token: 'PRIVATE_SESSION', futureWave: 'UNREVEALED_WAVE'});
  const scope = {attemptId: 'current-attempt', stageId: 'tunnel_boss', token: 'PRIVATE_ADAPTER'};
  const before = structuredClone(state);
  const request = prepareBattleAdvisorRequest(scope, state, '现在能看到哪些敌人？');
  assert.deepEqual(Object.keys(request).sort(), ['attemptId', 'context', 'question', 'stageId']);
  assert.equal(request.attemptId, 'current-attempt');
  assert.equal(request.stageId, 'tunnel_boss');
  assert.equal(request.question, '现在能看到哪些敌人？');
  assert.match(request.context, /visible-near-guard/);
  assert.doesNotMatch(JSON.stringify(request), /secret-distant-enemy|PRIVATE_SESSION|PRIVATE_ADAPTER|UNREVEALED_WAVE/);
  assert.deepEqual(state, before);
});

test('six chapters expose their real board and current exact skills without mutating the battle', () => {
  for (const {id, state, cells, skills} of cases()) {
    const before = structuredClone(state), context = read(id, state);
    assert.equal(context.关卡.入口, id);
    assert.equal(context.地图.实际存在地格.split('、').length, cells.length);
    for (const cat of context.主力) {
      assert.equal(cat.技能.说明, skills[cat.编号 as keyof typeof skills].description);
      assert.equal(cat.技能.消耗能量, 100);
    }
    assert.deepEqual(state, before);
  }
  const l00 = beginBattle(), before = structuredClone(l00), context = read('l00_tutorial', l00);
  assert.equal(context.地图.实际存在地格.split('、').length, 21);
  assert.equal(context.地图.候选部署格.split('、').length, 19);
  assert.equal(context.地图.出怪口, 'B7'); assert.equal(context.地图.保护点, 'B1');
  assert.equal(context.当前.总波数, 6); assert.equal(context.主力.length, 2);
  assert.match(context.主力.find((cat: {编号: string}) => cat.编号 === 'caster').技能.说明, /45/);
  assert.match(context.主力.find((cat: {编号: string}) => cat.编号 === 'guard').技能.说明, /60.*8/);
  assert.deepEqual(l00, before);
  assert.equal(read('alley_boss', createChapterBattle()).关卡.入口, 'alley_boss');
});

test('front-loaded key facts name all four first-chapter main cats, and all six later main cats', () => {
  const chapter = read('alley_rescue', createChapterBattle());
  assert.equal(Object.keys(chapter)[0], '关键事实');
  assert.match(chapter.关键事实.当前主力, /^在场可操作主力共4只：绒绒、斑斑、团子、点点。/);
  assert.match(chapter.关键事实.当前主力, /不含主角喵喵、顾问阿策、固定援军或已经退场的猫/);
  for (const {id, state} of cases().slice(1)) {
    if ('allies' in state) for (const ally of state.allies) ally.status = 'active';
    const context = read(id, state);
    assert.equal(Object.keys(context)[0], '关键事实');
    assert.match(context.关键事实.当前主力, /^在场可操作主力共6只：/);
    assert.ok(context.关键事实.当前主力.includes(state.cats.map(cat => cat.name).join('、')));
  }
});

test('key facts exclude retired cats and never confuse the prologue current leaks with its failure threshold', () => {
  const l00 = beginBattle(); l00.leaks = 0;
  let context = read('l00_tutorial', l00);
  assert.equal(Object.keys(context)[0], '关键事实');
  assert.match(context.关键事实.当前主力, /^在场可操作主力共2只：绒绒、斑斑。/);
  assert.match(context.关键事实.突破判定, /^当前已突破0次；累计达到3次即因突破失败。/);
  assert.match(context.关键事实.突破判定, /还可容许2次新突破.*再发生3次新突破/);
  assert.equal(context.当前.已突破, 0); assert.equal(context.当前.失败突破数, 3);
  Object.assign(l00.cats.find(cat => cat.id === 'caster')!, {hp: 0, status: 'retired'});
  context = read('l00_tutorial', l00);
  assert.match(context.关键事实.当前主力, /^在场可操作主力共1只：斑斑。/);
  const chapter = createChapterBattle(); Object.assign(chapter.cats[2], {hp: 0, status: 'retired'});
  assert.match(read('alley_rescue', chapter).关键事实.当前主力, /^在场可操作主力共3只：绒绒、斑斑、点点。/);
  const finale = createFinaleBattle(); Object.assign(finale.cats[0], {hp: 0, status: 'retired'});
  assert.match(read('finale_boss', finale).关键事实.当前主力, /^在场可操作主力共5只：斑斑、团子、栗栗、点点、墨墨。/);
});

test('key facts count allowable new leaks up to but not including the failure-triggering leak', () => {
  const state = createChapterBattle();
  for (const [leaks, allowed, untilFailure] of [[0, 2, 3], [1, 1, 2], [2, 0, 1]]) {
    state.leaks = leaks;
    const facts = read('alley_rescue', state).关键事实.突破判定;
    assert.ok(facts.startsWith(`当前已突破${leaks}次；累计达到3次即因突破失败。`));
    assert.ok(facts.includes(`还可容许${allowed}次新突破而不触发突破失败`));
    assert.ok(facts.includes(`再发生${untilFailure}次新突破就会达到失败阈值`));
  }
  state.leaks = 3;
  assert.match(read('alley_rescue', state).关键事实.突破判定, /当前已突破3次.*当前已达到突破失败阈值，不能再容许突破/);
  for (const cat of state.cats) {cat.status = 'retired'; cat.hp = 0;}
  assert.match(read('alley_rescue', state).关键事实.当前主力, /^在场可操作主力共0只：无。/);
});

test('momo has distinct greenhouse, tunnel and finale abilities, and the actual chapter roster', () => {
  const descriptions = ['greenhouse_boss', 'tunnel_boss', 'finale_boss'].map((id, i) => {
    const state = [createGreenhouseBattle, createTunnelBattle, createFinaleBattle][i]();
    return read(id, state).主力.find((cat: {编号: string}) => cat.编号 === 'momo').技能.说明;
  });
  assert.match(descriptions[0], /清除所有已生成荆棘/); assert.doesNotMatch(descriptions[0], /夜视/);
  assert.match(descriptions[1], /恢复全场视野 10 秒/); assert.doesNotMatch(descriptions[1], /荆棘|影幕/);
  assert.match(descriptions[2], /照破首领影幕 10 秒/); assert.match(descriptions[2], /主力和援军/);
  const greenhouse = read('greenhouse_boss', createGreenhouseBattle());
  assert.equal(greenhouse.主力.some((cat: {编号: string}) => cat.编号 === 'diandian'), false);
  assert.equal(read('tunnel_boss', createTunnelBattle()).主力.some((cat: {编号: string}) => cat.编号 === 'diandian'), true);
});

test('whitelist ignores future waves, scheduler clocks, tokens, logs and arbitrary nested data in all six stages', () => {
  const all = [{id: 'l00_tutorial', state: createGame()}, ...cases()];
  for (const {id, state} of all) {
    const before = buildModelAdvisorContext(id, state);
    Object.assign(state, {
      attemptId: 'secret-attempt-token', seed: 'secret-random-seed',
      WAVES: [[{at: 98765, kind: 'secret-future-kind'}]], nextWaveIn: 98765,
      waveTime: 87654, spawnIndex: 987, sourceModifiers: ['secret-source'],
      logs: [{id: 1, time: 0, text: 'secret-log-with-hidden-position'}],
      privatePayload: {stageId: 'secret-stage', tokens: ['secret-auth']},
    });
    if ('boss' in state) {state.boss.skillCooldown = 8888; state.boss.cooldown = 7777;}
    assert.equal(buildModelAdvisorContext(id, state), before, id);
    assert.doesNotMatch(before, /spawnIndex|WAVES|waveTime|secret-|nextWaveIn|skillCooldown|attemptId/);
  }
});

test('L00 uses the local advisor visibility boundary, excluding offscreen and training enemies', () => {
  const state = beginBattle();
  state.enemies = [
    {...ENEMY_TYPES.scout, id: 'visible-enemy', type: 'scout', hp: 66, x: 5, y: 1, cooldown: 0, blockedBy: null},
    {...ENEMY_TYPES.scout, id: 'offscreen-secret', type: 'scout', hp: 77, x: 6.7, y: 1, cooldown: 0, blockedBy: null},
    {...ENEMY_TYPES.scout, id: 'training-secret', type: 'scout', hp: 88, x: 5, y: 1, cooldown: 0, blockedBy: null, training: true},
  ];
  const json = buildModelAdvisorContext('l00_tutorial', state), context = JSON.parse(json);
  assert.equal(context.可见普通敌人数, 1); assert.equal(context.可见普通敌人[0].编号, 'visible-enemy');
  assert.doesNotMatch(json, /offscreen-secret|training-secret/);
});

test('blackout never leaks distant enemy identities, positions, health or even their count', () => {
  const state = createTunnelBattle({carry: 'dove'}); state.phase = 'battle'; state.darknessRemaining = 8;
  const visible = enemy('visible-near-guard', 0, 2), hidden = enemy('secret-distant-enemy');
  assert.equal(isEnemyVisible(state, visible), true); assert.equal(isEnemyVisible(state, hidden), false);
  state.enemies = [visible];
  const withoutHidden = buildModelAdvisorContext('tunnel_boss', state);
  state.enemies.push(hidden, {...hidden, id: 'secret-other', name: 'secret-other', x: 6.2, hp: 12345});
  assert.equal(buildModelAdvisorContext('tunnel_boss', state), withoutHidden);
  assert.equal(JSON.parse(withoutHidden).可见普通敌人数, 1);
  assert.doesNotMatch(withoutHidden, /secret-distant|secret-other|12345/);
  state.nightVisionRemaining = 10;
  const lit = read('tunnel_boss', state);
  assert.equal(lit.可见普通敌人数, 3); assert.equal(lit.视野.正在断灯, false);
  assert.equal(lit.可见普通敌人[1].体力, 91);
});

test('waiting finale reinforcements expose only public rules; arrived allies include current team shields', () => {
  const state = createFinaleBattle();
  const initial = buildModelAdvisorContext('finale_boss', state);
  const waiting = read('finale_boss', state).终章机制.援军;
  assert.deepEqual(waiting.map((ally: {公开加入波次: number}) => ally.公开加入波次), [3, 5, 7]);
  for (const ally of waiting) for (const key of ['位置', '体力', '护盾', '护盾剩余秒']) assert.equal(key in ally, false);
  Object.assign(state.allies[0], {x: 9000, y: 9000, hp: 98765, shield: 999, cooldown: 54321, name: 'secret-waiting-name'});
  assert.equal(buildModelAdvisorContext('finale_boss', state), initial);
  Object.assign(state.allies[0], ALLY_DEFINITIONS[0], {status: 'active', hp: 81, shield: 45, shieldRemaining: 6.5});
  Object.assign(state.cats.find(cat => cat.id === 'momo')!, {shield: 45, shieldRemaining: 6.5});
  const arrived = read('finale_boss', state);
  assert.equal(arrived.终章机制.援军[0].位置, 'B5');
  assert.equal(arrived.终章机制.援军[0].护盾, 45); assert.equal(arrived.终章机制.援军[0].护盾剩余秒, 6.5);
  assert.equal(arrived.主力.find((cat: {编号: string}) => cat.编号 === 'momo').护盾, 45);
  assert.match(arrived.终章机制.援军规则, /不召来等待援军、不复活退场猫/);
});

test('current HP, retirement, energy readiness and market energy-seal remain distinguishable', () => {
  const state = createMarketBattle();
  Object.assign(state.cats[0], {hp: 3, shield: 20, shieldRemaining: 4, blockedCount: 1});
  Object.assign(state.cats[1], {hp: 0, status: 'retired', energy: 100});
  Object.assign(state.cats[2], {energy: 100, energyBlockedRemaining: 3});
  const context = read('market_boss', state);
  assert.equal(context.主力[0].体力, 3); assert.equal(context.主力[0].护盾, 20);
  assert.equal(context.主力[0].当前阻挡数, 1);
  assert.equal(context.主力[1].状态, '已退场'); assert.equal(context.主力[1].位置, null);
  assert.equal(context.主力[1].技能已蓄满, false); assert.equal(context.主力[1].当前普攻覆盖格, '');
  assert.equal(context.主力[2].封能剩余秒, 3); assert.equal(context.主力[2].技能已蓄满, true);
  assert.match(context.规则.主角与顾问, /不攻击、不阻挡、不蓄能/);
  assert.match(context.规则.退场, /不能移动、施法、治疗复活或重新部署/);
});

test('only an active public telegraph exposes locked cells and a dodge window', () => {
  const state = createChapterBattle();
  state.boss.targetCells = [{x: 3, y: 3}, {x: 4, y: 3}]; state.boss.phaseTime = 1;
  assert.equal(read('alley_rescue', state).首领.当前预警, null);
  state.boss.phase = 'windup';
  const warning = read('alley_rescue', state).首领.当前预警;
  assert.equal(warning.危险格, 'D4、D5'); assert.equal(warning.剩余秒, 1.8);
  assert.match(warning.应对, /不会追踪新站位/);
  const tunnel = createTunnelBattle(); tunnel.boss.phase = 'windup';
  assert.match(read('tunnel_boss', tunnel).首领.当前预警.应对, /不能靠换位躲过/);
});

test('current rats and kitten effects are included without granting a future enemy forecast', () => {
  const rats = createTunnelBattle({carry: 'rats'}); rats.carry.elapsed = 9;
  const patrol = read('tunnel_boss', rats).事件携带;
  assert.equal(patrol.当前轮巡入口, 'A2'); assert.equal(patrol.换路剩余秒, 7);
  assert.match(patrol.效果, /20%/);
  const kitten = createFinaleBattle({carry: 'kitten'}); kitten.carry.kittenWave = 3;
  const energy = read('finale_boss', kitten).事件携带;
  assert.equal(energy.最近补能波次, 3); assert.match(energy.效果, /8 能量/); assert.match(energy.效果, /不复活、不自动释放/);
  for (const carry of ['lantern', 'mirror', 'bell', 'box', 'dog', 'dove', 'rats', 'kitten']) {
    const context = read('finale_boss', createFinaleBattle({carry}));
    assert.equal(context.事件携带.携带, carry); assert.equal(context.可见普通敌人数, 0);
    assert.equal(context.可见普通敌人.length, 0);
    assert.doesNotMatch(JSON.stringify(context), /"at"|"kind"|"下一波"|"groups"|"lane"|"route"/);
  }
});

test('large visible formations remain valid JSON under 24000 characters and preserve urgent facts', () => {
  const state = createFinaleBattle(); state.phase = 'battle'; state.boss.phase = 'windup';
  state.boss.targetCells = [{x: 3, y: 3}]; state.cats[0].hp = 1;
  state.enemies = Array.from({length: 2000}, (_, index) => ({...enemy(`seen-${index}-${'长'.repeat(1000)}`), name: '长'.repeat(1000), route: 'upper'}));
  const before = structuredClone(state), json = buildModelAdvisorContext('finale_boss', state), context = JSON.parse(json);
  assert.ok(json.length <= 24000, String(json.length));
  assert.equal(context.可见普通敌人数, 2000);
  assert.equal(context.省略可见敌人明细数 + context.可见普通敌人.length, 2000);
  assert.equal(context.主力[0].体力, 1); assert.equal(context.首领.当前预警.危险格, 'D4');
  assert.deepEqual(state, before);
});

test('wrong chapter snapshots fail closed instead of describing the wrong rules', () => {
  assert.throws(() => buildModelAdvisorContext('market_boss', createTunnelBattle()), /不匹配/);
  assert.throws(() => buildModelAdvisorContext('l00_tutorial', createFinaleBattle()), /不匹配/);
  assert.throws(() => buildModelAdvisorContext('unknown_boss', createGame()), /不匹配/);
});
