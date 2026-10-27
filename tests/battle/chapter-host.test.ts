import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Catalog, GameState} from '../../web/src/contracts/index.ts';
import {createChapterContext} from '../../web/src/modules/battle/chapter-context.ts';
import {createL00Context} from '../../web/src/modules/battle/host-context.ts';

const catalog: Pick<Catalog, 'stages'> = JSON.parse(fs.readFileSync('web/content/catalog.json', 'utf8'));
function state(stageId = 'alley_boss'): Pick<GameState, 'phase' | 'activeBattle'> {
  return {phase: 'battle', activeBattle: {id: 'persisted-l01', stageId, status: 'active', modifiers: {shadowPressure: 1}}};
}

test('first rescue and home replay restore their original attempt and locked tier without a loadout', () => {
  for (const id of ['alley_rescue', 'alley_boss']) {
    const original = state(id);
    Object.assign(original.activeBattle!, {supplies: {'warm-can': 2, 'bouncy-treat': 1}});
    const before = structuredClone(original);
    assert.deepEqual(createChapterContext(JSON.parse(JSON.stringify(original)), catalog), {attemptId: 'persisted-l01', difficulty: 'high'});
    assert.deepEqual(original, before);
    original.activeBattle!.modifiers = undefined;
    assert.deepEqual(createChapterContext(original, catalog), {attemptId: 'persisted-l01', difficulty: 'medium'});
  }
});

test('chapter host rejects non-active, unknown and stale layouts', () => {
  for (const change of [{phase: 'home'}, {activeBattle: null}, {activeBattle: {...state().activeBattle!, status: 'won'}}, {activeBattle: {...state().activeBattle!, stageId: 'l00_tutorial'}}]) {
    assert.throws(() => createChapterContext(Object.assign(state(), change), catalog));
  }
  for (const change of [{waves: 1}, {columns: 12}, {lanes: 4}]) {
    assert.throws(() => createChapterContext(state(), {stages: catalog.stages.map(stage => ({...stage, ...change}))}));
  }
  const invalid = state();
  Object.assign(invalid.activeBattle!, {modifiers: {shadowPressure: 3}});
  assert.throws(() => createChapterContext(invalid, catalog), {code: 'INVALID_BATTLE_PRESSURE'});
});

test('the prologue tutorial is distinct from both first chapter stage IDs', () => {
  const original = {...state('l00_tutorial'), cats: ['miaomiao']};
  assert.equal(createL00Context(original, catalog).attempt.stageId, 'l00_tutorial');
  for (const stageId of ['alley_rescue', 'alley_boss']) {
    original.activeBattle!.stageId = stageId;
    assert.throws(() => createL00Context(original, catalog));
    assert.deepEqual(createChapterContext(original, catalog), {attemptId: 'persisted-l01', difficulty: 'high'});
    const stage = catalog.stages.find(stage => stage.id === stageId)!;
    assert.deepEqual([stage.lanes, stage.columns, stage.waves], [5, 10, 8]);
  }
});
