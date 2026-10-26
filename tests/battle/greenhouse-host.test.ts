import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Catalog, GameState} from '../../web/src/contracts/index.ts';
import {createGreenhouseContext} from '../../web/src/modules/battle/greenhouse-context.ts';
import {createMarketContext} from '../../web/src/modules/battle/market-context.ts';
import {createChapterContext} from '../../web/src/modules/battle/chapter-context.ts';
import {createL00Context} from '../../web/src/modules/battle/host-context.ts';
import {CELLS, MAP} from '../../web/src/modules/battle/greenhouse/config.ts';
import {objective} from '../../web/src/core/story/index.ts';

const catalog: Pick<Catalog, 'stages'> = JSON.parse(fs.readFileSync('web/content/catalog.json', 'utf8'));
function fixture(pressure: -1 | 0 | 1 = 0): Pick<GameState, 'phase' | 'activeBattle'> {
  return {phase: 'battle', activeBattle: {id: 'greenhouse-persisted', stageId: 'greenhouse_boss', status: 'active', modifiers: {shadowPressure: pressure}}};
}

test('greenhouse host restores its attempt tier independently of later pending event results', () => {
  for (const [pressure, difficulty] of [[-1, 'low'], [0, 'medium'], [1, 'high']] as const) {
    const saved = {...fixture(pressure), eventState: {pendingModifiers: {shadowPressure: pressure === 1 ? -1 : 1}}};
    const before = structuredClone(saved);
    assert.deepEqual(createGreenhouseContext(JSON.parse(JSON.stringify(saved)), catalog), {attemptId: 'greenhouse-persisted', difficulty});
    assert.deepEqual(saved, before);
  }
  const legacy = fixture(); legacy.activeBattle!.modifiers = undefined;
  assert.equal(createGreenhouseContext(legacy, catalog).difficulty, 'medium');
});

test('greenhouse host rejects inactive attempts, invalid tiers and other stage IDs', () => {
  for (const patch of [{phase: 'home'}, {phase: 'preparation'}, {activeBattle: null}, {activeBattle: {...fixture().activeBattle!, id: ' '}}, {activeBattle: {...fixture().activeBattle!, status: 'lost'}}]) {
    assert.throws(() => createGreenhouseContext(Object.assign(fixture(), patch), catalog));
  }
  for (const stageId of ['l00_tutorial', 'alley_rescue', 'alley_boss', 'market_boss', 'unknown']) {
    const state = fixture(); state.activeBattle!.stageId = stageId;
    assert.throws(() => createGreenhouseContext(state, catalog));
  }
  for (const pressure of [null, -2, 2, 0.5, '1', false]) {
    const state = fixture(); Object.assign(state.activeBattle!.modifiers!, {shadowPressure: pressure});
    assert.throws(() => createGreenhouseContext(state, catalog), {code: 'INVALID_BATTLE_PRESSURE'});
  }
  assert.throws(() => createMarketContext(fixture(), catalog));
  assert.throws(() => createChapterContext(fixture(), catalog));
  assert.throws(() => createL00Context({...fixture(), cats: []}, catalog));
});

test('catalogs publish a 6 by 9 bounding box without filling the 34-cell irregular outline', () => {
  const server = JSON.parse(fs.readFileSync('server/internal/platform/catalog.json', 'utf8'));
  assert.deepEqual(catalog.stages, server.stages);
  const stage = catalog.stages.find(stage => stage.id === 'greenhouse_boss')!;
  assert.deepEqual([stage.chapterId, stage.status, stage.lanes, stage.columns, stage.waves], ['greenhouse', 'demo', 6, 9, 8]);
  assert.equal(MAP.rows, 6); assert.equal(MAP.columns, 9); assert.equal(CELLS.length, 34);
  assert.deepEqual(Array.from({length: 6}, (_, y) => CELLS.filter(cell => cell.y === y).map(cell => cell.x + 1)), [
    [2,3,4,5], [1,2,3,4,5,6,7], [2,3,4,5,6,7,8], [2,3,4,5,6,7,8,9], [2,3,4,5,6,7,8], [7],
  ]);
  for (const patch of [{columns: 8}, {lanes: 5}, {waves: 6}]) {
    assert.throws(() => createGreenhouseContext(fixture(), {stages: catalog.stages.map(stage => ({...stage, ...patch}))}));
  }
});

test('greenhouse objectives are restricted to the active standalone trial', () => {
  const active = {...fixture(), lastResult: {stageId: 'greenhouse_boss'}, mapId: 'greenhouse', chapterId: 'alley', cats: []} as GameState;
  assert.match(objective(active), /花房通路.*B1.*四格首领/);
  assert.match(objective({...active, phase: 'preparation', activeBattle: {...active.activeBattle!, status: 'lost'}}), /结束试玩/);
  assert.match(objective({...active, phase: 'home', activeBattle: null}), /把获救的伙伴安顿好/);
  assert.match(objective({...active, phase: 'explore', activeBattle: null, mapId: 'market'}), /探索午夜集市/);
});
