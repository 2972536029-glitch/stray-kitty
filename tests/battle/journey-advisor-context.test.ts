import test from 'node:test';
import assert from 'node:assert/strict';
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

test('large catalog data stays bounded and cannot leak full content through local answers', () => {
  const c = catalog(); c.events[0].text = '长'.repeat(40000); c.events[0].options = Array.from({length: 100}, (_, i) => ({...c.events[0].options[0], id: String(i), label: '选'.repeat(2000)}));
  const s = state({phase: 'event', pendingEventId: 'current_event'});
  const text = buildJourneyAdvisorContext(s, c), reply = getJourneyLocalAnswer(s, c, '怎么选');
  assert.ok(text.length < 24000); assert.ok(Array.from(reply.text).length <= 1200);
  assert.doesNotMatch(text, /HIDDEN_|SECRET_/);
});
