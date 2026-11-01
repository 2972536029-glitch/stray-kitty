import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Catalog, GameState, EventDefinition} from '../../web/src/contracts/index.ts';
import {buildJourneyAdvisorContext, getJourneyLocalAnswer, journeySceneKey, journeySceneLabel} from '../../web/src/modules/advisor/journey-context.ts';

const event = (): EventDefinition => ({id: 'current_event', title: '眼前的箱子', text: '箱子里有声音。', category: 'risk', tags: ['trap'], triggers: ['node'], options: [
  {id: 'look', label: '仔细查看', outcomes: Object.fromEntries(['crit', 'success', 'partial', 'fail'].map(t => [t, {text: `HIDDEN_${t}`, reward: {material: 2}, flags: ['SECRET_FLAG'], situation: {kind: 'detour', storyNodeId: 'SECRET_NEXT'}}])) as EventDefinition['options'][number]['outcomes']},
  {id: 'hidden', label: 'HIDDEN_CAT_OPTION', requireCat: 'momo', outcomes: {crit: {text: 'secret'}, success: {text: 'secret'}, partial: {text: 'secret'}, fail: {text: 'secret'}}},
]});
function catalog(): Catalog {
  return {version: 'test', chapters: [{id: 'market', title: '午夜集市', summary: 'UNSEEN_SUMMARY', status: 'active'}, {id: 'finale', title: 'FUTURE_TITLE', summary: 'FUTURE_PLOT', status: 'active'}],
    maps: [{id: 'market', name: '午夜集市', status: 'active', width: 100, height: 100, interactions: [{id: 'future_interaction', label: 'HIDDEN_MAP_TARGET', eventId: 'future', x: 0, y: 0}]}, {id: 'tunnel', name: '地下通道', status: 'active', width: 100, height: 100, interactions: []}],
    story: [{id: 'now', chapterId: 'market', speaker: '阿策', text: '先看看眼前的箱子。', next: 'SECRET_NEXT', exit: '', setFlags: ['SECRET_FLAG']}, {id: 'SECRET_NEXT', chapterId: 'finale', speaker: '阿策', text: 'FUTURE_PLOT', next: '', exit: 'home'}],
    events: [event()], cats: [{id: 'tuanzi', name: '团子', color: '', description: 'OLD_DESCRIPTION', skill: ''}, {id: 'diandian', name: '点点', color: '', description: '', skill: ''}],
    stages: [], furniture: [], slots: [], homeDecor: [], items: [], pools: [], tutorials: [], assets: [], products: [],
    renovations: [{id: 'later', stage: 3, name: 'FUTURE_REPAIR', grantsFlag: 'later_done', requiredFlag: 'stage_done'},
      {id: 'current', stage: 2, name: '修好窗与地板', grantsFlag: 'stage_done', parts: [
        {id: 'window', name: '破窗', description: '', x: 1, y: 1, cost: {material: 3}},
        {id: 'floor', name: '地板', description: '', x: 2, y: 2, cost: {material: 2, stamp: 1}, requires: ['window']},
      ]}],
  };
}
function state(changes: Partial<GameState> = {}): GameState {
  return {schemaVersion: 1, contentVersion: 'test', revision: 1, phase: 'explore', chapterId: 'market', storyNodeId: '', mapId: 'market', flags: [], cats: ['tuanzi'], inventory: {clue: 2, material: 1}, currencies: {stamp: 0, tuna: 0}, furniture: [], placements: {}, completedStages: [], pendingEventId: '', activeBattle: null, lastResult: {message: ''}, ...changes};
}
const read = (s: GameState, c = catalog()) => JSON.parse(buildJourneyAdvisorContext(s, c));
const answer = (s: GameState, question = '下一步做什么') => getJourneyLocalAnswer(s, catalog(), question).text;

test('journey context sends only current visible story and owned information, without mutating inputs', () => {
  const c = catalog(), s = state({phase: 'dialogue', storyNodeId: 'now', txns: [{id: 'PRIVATE_PAYMENT', playerId: 'PRIVATE_PLAYER', packId: '', amount: 1, status: 'confirmed', reason: '', cardSuffix: 'SECRET_CARD', createdAt: ''}]});
  const before = structuredClone({c, s});
  const text = buildJourneyAdvisorContext(s, c), snapshot = JSON.parse(text);
  assert.equal(snapshot.当前台词.内容, '先看看眼前的箱子。');
  assert.deepEqual(snapshot.已结识伙伴, ['团子']);
  for (const forbidden of ['FUTURE_PLOT', 'FUTURE_TITLE', 'UNSEEN_SUMMARY', 'SECRET_NEXT', 'SECRET_FLAG', 'HIDDEN_MAP_TARGET', 'SECRET_CARD', 'PRIVATE_PAYMENT', 'PRIVATE_PLAYER', 'OLD_DESCRIPTION']) assert.ok(!text.includes(forbidden), forbidden);
  assert.deepEqual({c, s}, before);
  assert.equal(read({...s, phase: 'explore'}).当前台词, undefined, 'stale story node is not displayed outside dialogue');
});

test('pending event filters invisible companion options and keeps old resolution separate', () => {
  const s = state({phase: 'event', pendingEventId: 'current_event', pushTokens: 1, eventState: {lastResolution: {eventId: 'old_event', optionId: 'old', dice: [2, 3], tier: 'partial', outcome: {text: '已经发生的结果', flags: ['PRIVATE_OLD_FLAG']}}, pendingModifiers: {shadowPressure: 0}}});
  const text = buildJourneyAdvisorContext(s, catalog()), snapshot = JSON.parse(text);
  assert.equal(snapshot.当前事件.标题, '眼前的箱子');
  assert.deepEqual(snapshot.当前事件.可见选项.map((o: {名称: string}) => o.名称), ['仔细查看']);
  assert.equal(snapshot.最近已结算事件.实际结果, '已经发生的结果');
  assert.equal(snapshot.当前事件.鼓励剩余次数, 1);
  for (const forbidden of ['HIDDEN_CAT_OPTION', 'HIDDEN_crit', 'HIDDEN_fail', 'SECRET_NEXT', 'PRIVATE_OLD_FLAG', '点点已揭示的资源后果']) assert.ok(!text.includes(forbidden), forbidden);
});

test('Diandian trap sight reveals only reward summaries that the event UI already displays', () => {
  const s = state({phase: 'event', pendingEventId: 'current_event', cats: ['tuanzi', 'diandian']});
  const text = buildJourneyAdvisorContext(s, catalog()), snapshot = JSON.parse(text);
  const fates = snapshot.当前事件.可见选项[0].点点已揭示的资源后果;
  assert.equal(fates.length, 4); assert.equal(fates[0].资源[0].数量, 2);
  assert.ok(!text.includes('HIDDEN_crit')); assert.ok(!text.includes('SECRET_NEXT'));
  const ordinary = catalog(); ordinary.events[0].tags = ['social'];
  assert.equal(read(s, ordinary).当前事件.可见选项[0].点点已揭示的资源后果, undefined);
});

test('current map wins over later chapter flags when revisiting locations', () => {
  const s = state({flags: ['chapter_4_started', 'finale_started', 'market_cleared']});
  assert.match(read(s).当前目标, /集市/); assert.doesNotMatch(read(s).当前目标, /地下通道|仓库/);
  assert.match(answer(s), /集市/);
  assert.match(journeySceneLabel(state({phase: 'home', chapterId: 'rescue', mapId: 'greenhouse'}), catalog()), /^花房/);
});

test('mainline settlements describe their actual continuation instead of always returning home', () => {
  const won = (stageId: string, mapId: string, mainline: boolean) => state({phase: 'settlement', mapId, activeBattle: {id: 'attempt', stageId, status: 'won', mainline}, lastResult: {message: '获胜', outcome: 'won', stageId}});
  assert.match(read(won('market_boss', 'market', true)).当前目标, /返回集市探索/);
  assert.match(read(won('tunnel_boss', 'tunnel', true)).当前目标, /继续救援故事/);
  assert.match(read(won('finale_boss', 'warehouse', true)).当前目标, /仓库战后的故事/);
  assert.match(read(won('finale_boss', 'greenhouse', false)).当前目标, /返回家园/);
  assert.match(read(state({phase: 'settlement', lastResult: {message: '', outcome: 'lost'}})).当前目标, /调整防线/);
});

test('warehouse gates distinguish clues from unfinished rescue and do not disclose future gates early', () => {
  const rescued = state({phase: 'home', flags: ['tunnel_explored', 'cats_rescued_batch1']});
  assert.match(answer(rescued, '为什么线索不够'), /当前有2条线索.*至少3条/);
  assert.match(answer({...rescued, inventory: {clue: 3}}, '第五章能进吗'), /前置条件已满足/);
  assert.match(answer({...rescued, flags: ['tunnel_explored'], inventory: {clue: 5}}, '可以进仓库吗'), /救援尚未全部完成/);
  assert.match(answer(state(), '有几条线索'), /当前有2条线索/);
  assert.doesNotMatch(answer(state(), '有几条线索'), /仓库|第五章|3条/);
  const inside = state({phase: 'explore', chapterId: 'finale', mapId: 'warehouse', flags: ['finale_started', 'tunnel_explored', 'cats_rescued_batch1'], inventory: {clue: 3}});
  assert.match(answer(inside, '仓库里往哪走'), /探索仓库.*北侧首领/);
  assert.doesNotMatch(answer(inside, '仓库里往哪走'), /从家园的第五章入口/);
  assert.match(answer(inside, '目前几条线索'), /当前有3条线索/);
  assert.doesNotMatch(answer(inside, '目前几条线索'), /首次进入仓库/);
});

test('home repair summary uses current project parts, resources and prerequisites only', () => {
  const s = state({phase: 'home', mapId: 'greenhouse'}), c = catalog();
  const snapshot = read(s, c), text = buildJourneyAdvisorContext(s, c);
  assert.equal(snapshot.家园修缮.名称, '修好窗与地板');
  assert.deepEqual(snapshot.家园修缮.部件[1].尚缺前置, ['破窗']);
  assert.deepEqual(snapshot.家园修缮.部件[0].成本[0], {名称: '修缮材料', 需要: 3, 现有: 1});
  assert.ok(!text.includes('FUTURE_REPAIR'));
  assert.match(answer(s, '怎么修地板'), /先完成破窗/);
  assert.match(answer(s, '怎么修破窗'), /资源不足/);
  const repaired = {...s, homeRepairs: ['window'], inventory: {material: 5}, currencies: {stamp: 2}};
  assert.match(answer(repaired, '怎么修地板'), /条件已满足/);
  assert.match(answer(repaired, '破窗还要修吗'), /已经修好/);
  assert.equal(read({...s, flags: ['finale_completed']}).家园修缮, null);
});

test('scene identity changes only at a relevant scene transition, not every movement revision', () => {
  const s = state(), key = journeySceneKey(s);
  assert.equal(key, journeySceneKey({...s, revision: 99, exploreDistance: 500}));
  for (const changed of [{phase: 'home' as const}, {mapId: 'tunnel'}, {storyNodeId: 'now'}, {pendingEventId: 'event'}, {activeBattle: {id: 'attempt', stageId: 'market_boss', status: 'active' as const}}]) assert.notEqual(key, journeySceneKey({...s, ...changed}));
});

test('observations are bounded, do not copy extra fields, and never invent a navigable route', () => {
  const scene = {nearby: {id: 'box', label: '眼前纸箱', hidden: 'DO_NOT_SEND'}, floor: 'L0', position: {x: Number.NaN, y: 4}, secret: 'DO_NOT_SEND'};
  const text = buildJourneyAdvisorContext(state(), catalog(), scene), snapshot = JSON.parse(text);
  assert.equal(snapshot.scene.position, undefined); assert.equal(snapshot.scene.nearby.label, '眼前纸箱'); assert.ok(!text.includes('DO_NOT_SEND'));
  const reply = getJourneyLocalAnswer(state(), catalog(), '怎么走', {...scene, position: {x: 10.3, y: 20.8}}).text;
  assert.match(reply, /眼前纸箱/); assert.match(reply, /没有完整可通行路线/); assert.doesNotMatch(reply, /往左|往右/);
});

test('current approved map hint wins over generic goals without exposing internal target IDs', () => {
  const scene = {nearby: {id: 'UNSEEN_TRAP_BOSS_INTERNAL', label: '墙边纸箱'}, floor: 'L0', inspectHint: '墙面像是留下了新的爪印。'};
  const s = state(), snapshot = read(s), text = buildJourneyAdvisorContext(s, catalog(), scene), current = JSON.parse(text);
  assert.notEqual(snapshot.当前目标, scene.inspectHint);
  assert.equal(current.当前目标, scene.inspectHint); assert.equal(current.scene.inspectHint, scene.inspectHint);
  assert.deepEqual(current.scene.nearby, {label: '墙边纸箱'}); assert.doesNotMatch(text, /UNSEEN_TRAP_BOSS_INTERNAL/);
  assert.equal(JSON.parse(buildJourneyAdvisorContext({...s, phase: 'event'}, catalog(), scene)).scene.inspectHint, undefined);
  const long = JSON.parse(buildJourneyAdvisorContext(s, catalog(), {...scene, inspectHint: '字'.repeat(900)}));
  assert.equal(Array.from(long.scene.inspectHint).length, 240);
});

test('large catalog data stays bounded and cannot leak full content through local answers', () => {
  const c = catalog(); c.events[0].text = '长'.repeat(40000); c.events[0].options = Array.from({length: 100}, (_, i) => ({...c.events[0].options[0], id: String(i), label: '选'.repeat(2000)}));
  const s = state({phase: 'event', pendingEventId: 'current_event'});
  const text = buildJourneyAdvisorContext(s, c), reply = getJourneyLocalAnswer(s, c, '怎么选');
  assert.ok(text.length < 24000); assert.ok(Array.from(reply.text).length <= 1200);
  assert.doesNotMatch(text, /HIDDEN_|SECRET_/);
});

test('journey roster explicitly separates known characters from combatants and keeps Miaomiao protected', () => {
  const c = catalog(); c.cats.push({id: 'miaomiao', name: '喵喵', color: '', description: '', skill: ''});
  const s = state({cats: ['miaomiao', 'tuanzi', 'diandian']}), snapshot = read(s, c);
  assert.deepEqual(snapshot.已结识伙伴, ['喵喵', '团子', '点点']);
  assert.match(snapshot.伙伴名单说明, /不是当前出战名单/);
  assert.match(snapshot.伙伴名单说明, /喵喵是保护目标，全程不参战/);
  assert.match(snapshot.伙伴名单说明, /当前战斗快照/);
  const reply = getJourneyLocalAnswer(s, c, '喵喵能参战吗').text;
  assert.match(reply, /全程不参战/); assert.doesNotMatch(reply, /出战.*3只/);
});

test('market advice explicitly forbids direct home return without inventing a UI button', () => {
  for (const phase of ['explore', 'preparation'] as const) {
    const s = state({phase, flags: ['market_cleared']});
    assert.match(read(s).集市离开规则, /不能直接回家.*北侧出口/);
    const reply = answer(s, '怎么回花房');
    assert.match(reply, /不能直接回家/); assert.match(reply, /已经守住集市防线.*北侧出口/);
    assert.doesNotMatch(reply, /点击.*回家|没有.*按钮|不存在.*按钮/);
  }
  assert.match(answer(state(), '怎么回家'), /还没有完成集市防卫/);
  const trial = state({phase: 'settlement', lastResult: {message: '胜利', stageId: 'market_boss', outcome: 'won'}, activeBattle: {id: 'trial', stageId: 'market_boss', status: 'won', mainline: false}});
  assert.equal(read(trial).集市离开规则, undefined);
  assert.match(answer(trial, '能回家吗'), /返回家园/); assert.doesNotMatch(answer(trial, '能回家吗'), /必须.*北侧出口/);
  const mainline = {...trial, activeBattle: {...trial.activeBattle!, mainline: true}};
  assert.match(answer(mainline, '能回家吗'), /返回集市探索.*北侧出口/);
});

test('resource labels have fixed player-facing names even if catalog item labels differ', () => {
  const c = catalog(); c.items = ['food', 'material', 'clue', 'stamp', 'tuna'].map(id => ({id, name: `WRONG_${id}`, description: ''}));
  const s = state({inventory: {food: 2, material: 3, clue: 4}, currencies: {stamp: 5, tuna: 6}}), snapshot = read(s, c);
  assert.deepEqual(snapshot.资源名称对照, {food: '鱼干', material: '修缮材料', clue: '线索', stamp: '猫爪邮票', tuna: '金枪鱼罐头'});
  assert.deepEqual([...snapshot.已有物品, ...snapshot.资源].map((r: {名称: string}) => r.名称), ['鱼干', '修缮材料', '线索', '猫爪邮票', '金枪鱼罐头']);
  const reply = getJourneyLocalAnswer(s, c, '有多少物品和资源').text;
  assert.match(reply, /鱼干2、修缮材料3、线索4、猫爪邮票5、金枪鱼罐头6/); assert.doesNotMatch(reply, /WRONG_/);
});

test('actual seal_windows dry_bedding chain costs ten materials and subtracts one balance just once', () => {
  const c = catalog(); c.renovations = JSON.parse(readFileSync(new URL('../../web/content/home/renovations.json', import.meta.url), 'utf8'));
  const s = state({phase: 'home', mapId: 'greenhouse', inventory: {material: 1}}), project = read(s, c).家园修缮;
  const bedding = project.部件.find((p: {名称: string}) => p.名称 === '排干积水、铺好干草').完成本部件所需;
  assert.equal(bedding.已核实, true);
  assert.deepEqual(bedding.修缮顺序, ['修补破损窗框', '堵住屋顶漏缝', '排干积水、铺好干草']);
  assert.deepEqual(bedding.累计资源, [{名称: '修缮材料', 总需要: 10, 现有余额: 1, 总缺口: 9}]);
  assert.deepEqual(project.剩余工程.累计资源, bedding.累计资源);
  for (const question of ['排干积水要多少材料', '封窗止水总共还缺多少材料']) {
    const reply = getJourneyLocalAnswer(s, c, question).text;
    assert.match(reply, /总共需要10，现有1，还差9/); assert.match(reply, /余额只抵扣一次/);
  }
  const remaining = read({...s, homeRepairs: ['patch_windows']}, c).家园修缮.部件.find((p: {名称: string}) => p.名称 === '排干积水、铺好干草').完成本部件所需;
  assert.deepEqual(remaining.累计资源, [{名称: '修缮材料', 总需要: 6, 现有余额: 1, 总缺口: 5}]);
});

test('shared repair prerequisites are counted once per resource and completed prerequisites are free', () => {
  const c = catalog(), part = (id: string, material: number, stamp = 0, requires: string[] = []) => ({id, name: id, description: '', x: 0, y: 0, cost: {material, stamp}, requires});
  c.renovations = [{id: 'diamond', name: '共享前置工程', stage: 2, grantsFlag: 'done', parts: [part('base', 2, 1), part('left', 3, 0, ['base']), part('right', 5, 1, ['base']), part('top', 7, 1, ['left', 'right'])]}];
  const s = state({phase: 'home', inventory: {material: 1}, currencies: {stamp: 2}});
  const plan = read(s, c).家园修缮.部件.find((p: {名称: string}) => p.名称 === 'top').完成本部件所需;
  assert.deepEqual(plan.修缮顺序, ['base', 'left', 'right', 'top']);
  assert.deepEqual(plan.累计资源, [{名称: '修缮材料', 总需要: 17, 现有余额: 1, 总缺口: 16}, {名称: '猫爪邮票', 总需要: 3, 现有余额: 2, 总缺口: 1}]);
  const completed = read({...s, homeRepairs: ['base']}, c).家园修缮.剩余工程;
  assert.deepEqual(completed.修缮顺序, ['left', 'right', 'top']);
  assert.deepEqual(completed.累计资源, [{名称: '修缮材料', 总需要: 15, 现有余额: 1, 总缺口: 14}, {名称: '猫爪邮票', 总需要: 2, 现有余额: 2, 总缺口: 0}]);
});

test('invalid repair dependencies never report a misleading partial total', () => {
  for (const kind of ['cycle', 'missing', 'duplicate', 'negative', 'overflow']) {
    const c = catalog(), parts = c.renovations![1].parts!;
    if (kind === 'cycle') parts[0].requires = ['floor'];
    if (kind === 'missing') parts[1].requires = ['unknown_part'];
    if (kind === 'duplicate') parts.push({...parts[0]});
    if (kind === 'negative') parts[0].cost.material = -1;
    if (kind === 'overflow') parts[0].cost.material = Number.MAX_SAFE_INTEGER;
    const s = state({phase: 'home'}), plan = read(s, c).家园修缮.部件[1].完成本部件所需;
    assert.equal(plan.已核实, false, kind); assert.equal(plan.累计资源, undefined, kind);
    assert.match(getJourneyLocalAnswer(s, c, '怎么修地板').text, /无法可靠计算|不能给出未经核实的总数/, kind);
  }
});

test('public dice thresholds are available without exposing hidden event outcomes', () => {
  const s = state({phase: 'event', pendingEventId: 'current_event'}), snapshot = read(s);
  assert.deepEqual(snapshot.当前事件.公开点数档位, [{点数: '12', 档位: '大成功'}, {点数: '9–11', 档位: '成功'}, {点数: '5–8', 档位: '成功但有代价'}, {点数: '2–4', 档位: '失败，局势推进'}]);
  const reply = answer(s, '骰子几点算成功');
  assert.match(reply, /12点为大成功.*9–11点为成功.*5–8点为成功但有代价.*2–4点为失败/);
  assert.doesNotMatch(reply, /HIDDEN_|保证.*老黄/); assert.match(reply, /不保证获得某个隐藏奖励/);
});

test('narrative food choices remain available with zero inventory and only encouragement has a separate cost', () => {
  const c = catalog(); c.events[0].options[0].label = '放一点鱼干安抚老黄';
  const s = state({phase: 'event', pendingEventId: 'current_event', inventory: {food: 0}, pushTokens: 2}), before = structuredClone(s);
  const serialized = buildJourneyAdvisorContext(s, c), snapshot = JSON.parse(serialized);
  assert.deepEqual(snapshot.当前事件.可见选项.map((o: {名称: string}) => o.名称), ['放一点鱼干安抚老黄']);
  assert.match(snapshot.当前事件.普通选项费用, /不要求拥有库存物品.*不扣除库存物品/);
  assert.match(snapshot.当前事件.普通选项费用, /叙事行动，不是鱼干库存费用/);
  assert.match(snapshot.当前事件.鼓励费用, /消耗1次鼓励次数.*普通掷骰不消耗鼓励次数/);
  for (const question of ['鱼干不够还能选吗', '要花几份', '放鱼干会扣库存吗', '这次选项消耗什么']) {
    const reply = getJourneyLocalAnswer(s, c, question);
    assert.equal(reply.title, '事件选项与费用');
    assert.match(reply.text, /鱼干库存为0.*不要求拥有库存物品.*不扣除库存物品/);
    assert.match(reply.text, /鼓励剩余2次/);
    assert.doesNotMatch(reply.text, /先收集鱼干|需要至少1份鱼干|HIDDEN_|SECRET_/);
  }
  assert.doesNotMatch(serialized, /HIDDEN_|SECRET_/); assert.deepEqual(s, before);
});
