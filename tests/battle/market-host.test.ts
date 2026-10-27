import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Catalog, GameState} from '../../web/src/contracts/index.ts';
import {createMarketContext} from '../../web/src/modules/battle/market-context.ts';
import {createChapterContext} from '../../web/src/modules/battle/chapter-context.ts';
import {createL00Context} from '../../web/src/modules/battle/host-context.ts';
import {objective} from '../../web/src/core/story/index.ts';

const catalog: Pick<Catalog, 'stages'> = JSON.parse(fs.readFileSync('web/content/catalog.json', 'utf8'));
function fixture(pressure: -1 | 0 | 1 = 0): Pick<GameState, 'phase' | 'activeBattle'> {
  return {phase: 'battle', activeBattle: {id: 'market-persisted', stageId: 'market_boss', status: 'active', modifiers: {shadowPressure: pressure}}};
}

test('market adapter consumes the original saved tier after serialization without reading a later event', () => {
  for (const [pressure, difficulty] of [[-1, 'low'], [0, 'medium'], [1, 'high']] as const) {
    const original = {...fixture(pressure), eventState: {pendingModifiers: {shadowPressure: pressure === 1 ? -1 : 1}}};
    const before = structuredClone(original);
    const restored = JSON.parse(JSON.stringify(original));
    assert.deepEqual(createMarketContext(restored, catalog), {attemptId: 'market-persisted', difficulty});
    assert.deepEqual(original, before);
  }
  const omitted = fixture();
  omitted.activeBattle!.modifiers = undefined;
  assert.equal(createMarketContext(omitted, catalog).difficulty, 'medium');
});

test('market adapter rejects stale layouts, malformed pressure and other stage boundaries', () => {
  for (const patch of [{phase: 'home'}, {phase: 'preparation'}, {activeBattle: null}, {activeBattle: {...fixture().activeBattle!, id: ' '}}, {activeBattle: {...fixture().activeBattle!, status: 'lost'}}]) {
    assert.throws(() => createMarketContext(Object.assign(fixture(), patch), catalog));
  }
  for (const id of ['l00_tutorial', 'alley_rescue', 'alley_boss', 'unknown']) {
    const state = fixture(); state.activeBattle!.stageId = id;
    assert.throws(() => createMarketContext(state, catalog));
  }
  for (const patch of [{columns: 10}, {lanes: 3}, {waves: 6}]) {
    assert.throws(() => createMarketContext(fixture(), {stages: catalog.stages.map(stage => ({...stage, ...patch}))}));
  }
  for (const pressure of [null, 2, -2, '1', 0.5, false]) {
    const state = fixture(); Object.assign(state.activeBattle!.modifiers!, {shadowPressure: pressure});
    assert.throws(() => createMarketContext(state, catalog), {code: 'INVALID_BATTLE_PRESSURE'});
  }
  assert.throws(() => createChapterContext(fixture(), catalog));
  assert.throws(() => createL00Context({...fixture(), cats: []}, catalog));
});

test('both generated catalogs expose the standalone 5 by 8, eight-wave market stage', () => {
  const server = JSON.parse(fs.readFileSync('server/internal/platform/catalog.json', 'utf8'));
  assert.deepEqual(catalog.stages, server.stages);
  const stage = catalog.stages.find(stage => stage.id === 'market_boss')!;
  assert.deepEqual([stage.chapterId, stage.status, stage.lanes, stage.columns, stage.waves], ['market', 'demo', 5, 8, 8]);
});

test('market objectives follow the current trial and do not override later mainline exploration', () => {
  const active = {...fixture(), lastResult: {stageId: 'market_boss'}, mapId: 'greenhouse', chapterId: 'alley', cats: [], flags: []} as GameState;
  assert.match(objective(active), /六位伙伴.*集市首领/);
  assert.match(objective({...active, chapterId: 'rescue', flags: ['chapter_4_started']}), /六位伙伴.*集市首领/);
  assert.match(objective({...active, phase: 'preparation', activeBattle: {...active.activeBattle!, status: 'lost'}}), /结束试玩/);
  assert.match(objective({...active, phase: 'explore', activeBattle: null, mapId: 'market'}), /探索午夜集市/);
});
