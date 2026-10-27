import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Catalog, GameState} from '../../web/src/contracts/index.ts';
import {createTunnelContext} from '../../web/src/modules/battle/tunnel-context.ts';
import {createMarketContext} from '../../web/src/modules/battle/market-context.ts';
import {createChapterContext} from '../../web/src/modules/battle/chapter-context.ts';
import {createL00Context} from '../../web/src/modules/battle/host-context.ts';
import {CELLS, MAP} from '../../web/src/modules/battle/tunnel/config.ts';
import {objective} from '../../web/src/core/story/index.ts';

const catalog: Pick<Catalog, 'stages'> = JSON.parse(fs.readFileSync('web/content/catalog.json', 'utf8'));
function fixture(pressure: -1 | 0 | 1 = 0): Pick<GameState, 'phase' | 'activeBattle'> {
  return {phase: 'battle', activeBattle: {id: 'tunnel-persisted', stageId: 'tunnel_boss', status: 'active', modifiers: {shadowPressure: pressure}}};
}

test('tunnel host restores its attempt tier independently of later pending event results', () => {
  for (const [pressure, difficulty] of [[-1, 'low'], [0, 'medium'], [1, 'high']] as const) {
    const saved = {...fixture(pressure), eventState: {pendingModifiers: {shadowPressure: pressure === 1 ? -1 : 1}}};
    const before = structuredClone(saved);
    assert.deepEqual(createTunnelContext(JSON.parse(JSON.stringify(saved)), catalog), {attemptId: 'tunnel-persisted', difficulty});
    assert.deepEqual(saved, before);
  }
  const legacy = fixture(); legacy.activeBattle!.modifiers = undefined;
  assert.equal(createTunnelContext(legacy, catalog).difficulty, 'medium');
});

test('tunnel host rejects inactive attempts, invalid tiers and other stage IDs', () => {
  for (const patch of [{phase: 'home'}, {phase: 'preparation'}, {activeBattle: null}, {activeBattle: {...fixture().activeBattle!, id: ' '}}, {activeBattle: {...fixture().activeBattle!, status: 'lost'}}]) {
    assert.throws(() => createTunnelContext(Object.assign(fixture(), patch), catalog));
  }
  for (const stageId of ['l00_tutorial', 'alley_rescue', 'alley_boss', 'market_boss', 'greenhouse_boss', 'unknown']) {
    const state = fixture(); state.activeBattle!.stageId = stageId;
    assert.throws(() => createTunnelContext(state, catalog));
  }
  for (const pressure of [null, -2, 2, 0.5, '1', false]) {
    const state = fixture(); Object.assign(state.activeBattle!.modifiers!, {shadowPressure: pressure});
    assert.throws(() => createTunnelContext(state, catalog), {code: 'INVALID_BATTLE_PRESSURE'});
  }
  assert.throws(() => createMarketContext(fixture(), catalog));
  assert.throws(() => createChapterContext(fixture(), catalog));
  assert.throws(() => createL00Context({...fixture(), cats: []}, catalog));
});

test('catalogs publish a 5 by 8 bounding box without filling the 37-cell irregular outline', () => {
  const server = JSON.parse(fs.readFileSync('server/internal/platform/catalog.json', 'utf8'));
  assert.deepEqual(catalog.stages, server.stages);
  const stage = catalog.stages.find(stage => stage.id === 'tunnel_boss')!;
  assert.deepEqual([stage.chapterId, stage.status, stage.lanes, stage.columns, stage.waves], ['rescue', 'demo', 5, 8, 8]);
  assert.equal(MAP.rows, 5); assert.equal(MAP.columns, 8); assert.equal(CELLS.length, 37);
  assert.deepEqual(Array.from({length: 5}, (_, y) => CELLS.filter(cell => cell.y === y).map(cell => cell.x + 1)), [
    [1,2,3,4,5,6,7,8], [1,2,3,4,5,6,7,8], [1,2,3,4,5,6,7,8], [1,2,3,4,5,6,7,8], [4,5,6,7,8],
  ]);
  for (const patch of [{columns: 9}, {lanes: 6}, {waves: 6}]) {
    assert.throws(() => createTunnelContext(fixture(), {stages: catalog.stages.map(stage => ({...stage, ...patch}))}));
  }
});

test('tunnel objectives are restricted to the active standalone trial', () => {
  const active = {...fixture(), lastResult: {stageId: 'tunnel_boss'}, mapId: 'tunnel', chapterId: 'alley', cats: [], flags: []} as GameState;
  assert.match(objective(active), /地下通道.*C2.*墨墨夜视.*四格首领/);
  assert.match(objective({...active, chapterId: 'finale', flags: ['chapter_4_started', 'finale_started', 'finale_completed']}), /地下通道.*C2.*墨墨夜视.*四格首领/);
  assert.match(objective({...active, phase: 'preparation', activeBattle: {...active.activeBattle!, status: 'lost'}}), /结束试玩/);
  assert.match(objective({...active, phase: 'home', activeBattle: null}), /把获救的伙伴安顿好/);
  assert.match(objective({...active, phase: 'explore', activeBattle: null, mapId: 'market'}), /探索午夜集市/);
});
