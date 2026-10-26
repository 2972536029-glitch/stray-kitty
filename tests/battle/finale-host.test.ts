import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Catalog, GameState} from '../../web/src/contracts/index.ts';
import {createFinaleContext} from '../../web/src/modules/battle/finale-context.ts';
import {createMarketContext} from '../../web/src/modules/battle/market-context.ts';
import {createChapterContext} from '../../web/src/modules/battle/chapter-context.ts';
import {createL00Context} from '../../web/src/modules/battle/host-context.ts';
import {CELLS, MAP} from '../../web/src/modules/battle/finale/config.ts';
import {objective} from '../../web/src/core/story/index.ts';

const catalog: Pick<Catalog, 'stages'> = JSON.parse(fs.readFileSync('web/content/catalog.json', 'utf8'));
function fixture(pressure: -1 | 0 | 1 = 0): Pick<GameState, 'phase' | 'activeBattle'> {
  return {phase: 'battle', activeBattle: {id: 'finale-persisted', stageId: 'finale_boss', status: 'active', modifiers: {shadowPressure: pressure}}};
}

test('finale host restores its attempt tier independently of later pending event results', () => {
  for (const [pressure, difficulty] of [[-1, 'low'], [0, 'medium'], [1, 'high']] as const) {
    const saved = {...fixture(pressure), eventState: {pendingModifiers: {shadowPressure: pressure === 1 ? -1 : 1}}};
    const before = structuredClone(saved);
    assert.deepEqual(createFinaleContext(JSON.parse(JSON.stringify(saved)), catalog), {attemptId: 'finale-persisted', difficulty});
    assert.deepEqual(saved, before);
  }
  const legacy = fixture(); legacy.activeBattle!.modifiers = undefined;
  assert.equal(createFinaleContext(legacy, catalog).difficulty, 'medium');
});

test('finale host rejects inactive attempts, invalid tiers and other stage IDs', () => {
  for (const patch of [{phase: 'home'}, {phase: 'preparation'}, {activeBattle: null}, {activeBattle: {...fixture().activeBattle!, id: ' '}}, {activeBattle: {...fixture().activeBattle!, status: 'lost'}}]) {
    assert.throws(() => createFinaleContext(Object.assign(fixture(), patch), catalog));
  }
  for (const stageId of ['l00_tutorial', 'alley_rescue', 'alley_boss', 'market_boss', 'greenhouse_boss', 'tunnel_boss', 'unknown']) {
    const state = fixture(); state.activeBattle!.stageId = stageId;
    assert.throws(() => createFinaleContext(state, catalog));
  }
  for (const pressure of [null, -2, 2, 0.5, '1', false]) {
    const state = fixture(); Object.assign(state.activeBattle!.modifiers!, {shadowPressure: pressure});
    assert.throws(() => createFinaleContext(state, catalog), {code: 'INVALID_BATTLE_PRESSURE'});
  }
  assert.throws(() => createMarketContext(fixture(), catalog));
  assert.throws(() => createChapterContext(fixture(), catalog));
  assert.throws(() => createL00Context({...fixture(), cats: []}, catalog));
});

test('catalogs publish a 7 by 12 bounding box without filling the 74-cell irregular outline', () => {
  const server = JSON.parse(fs.readFileSync('server/internal/platform/catalog.json', 'utf8'));
  assert.deepEqual(catalog.stages, server.stages);
  const stage = catalog.stages.find(stage => stage.id === 'finale_boss')!;
  assert.deepEqual([stage.chapterId, stage.status, stage.lanes, stage.columns, stage.waves], ['finale', 'demo', 7, 12, 10]);
  assert.equal(MAP.rows, 7); assert.equal(MAP.columns, 12); assert.equal(CELLS.length, 74);
  assert.deepEqual(Array.from({length: 7}, (_, y) => CELLS.filter(cell => cell.y === y).map(cell => cell.x + 1)), [
    [4,5,6,7,8,9,10,11], [2,3,4,5,6,7,8,9,10,11,12], [1,2,3,4,5,6,7,8,9,10,11,12], [1,2,3,4,5,6,7,8,9,10,11,12], [1,2,3,4,5,6,7,8,9,10,11,12], [2,3,4,5,6,7,8,9,10,11,12], [4,5,6,7,8,9,10,11],
  ]);
  for (const patch of [{columns: 9}, {lanes: 6}, {waves: 6}]) {
    assert.throws(() => createFinaleContext(fixture(), {stages: catalog.stages.map(stage => ({...stage, ...patch}))}));
  }
});

test('finale objectives are restricted to the active standalone trial', () => {
  const active = {...fixture(), lastResult: {stageId: 'finale_boss'}, mapId: 'finale', chapterId: 'alley', cats: [], flags: []} as GameState;
  assert.match(objective(active), /总仓库十波.*D2.*固定援军.*九格永夜之王.*两名精英/);
  assert.match(objective({...active, chapterId: 'finale', flags: ['chapter_4_started', 'finale_started', 'finale_completed']}), /总仓库十波.*D2.*固定援军.*九格永夜之王.*两名精英/);
  assert.match(objective({...active, phase: 'preparation', activeBattle: {...active.activeBattle!, status: 'lost'}}), /试玩结束/);
  assert.match(objective({...active, phase: 'home', activeBattle: null}), /把获救的伙伴安顿好/);
  assert.match(objective({...active, phase: 'explore', activeBattle: null, mapId: 'market'}), /探索午夜集市/);
});
