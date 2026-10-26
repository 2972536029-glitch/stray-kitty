import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Catalog, GameState} from '../../web/src/contracts/index.ts';
import {createChapterContext} from '../../web/src/modules/battle/chapter-context.ts';
import {createL00Context} from '../../web/src/modules/battle/host-context.ts';

const catalog: Pick<Catalog, 'stages'> = JSON.parse(fs.readFileSync('web/content/catalog.json', 'utf8'));
function state(): Pick<GameState, 'phase' | 'activeBattle'> {
  return {phase: 'battle', activeBattle: {id: 'persisted-l01', stageId: 'alley_boss', status: 'active', modifiers: {shadowPressure: 1}, supplies: {'warm-can': 2, 'bouncy-treat': 1}}};
}

test('chapter host restores the original attempt, difficulty and reserved loadout without sharing mutable inventory', () => {
  const original = state();
  const restored = createChapterContext(JSON.parse(JSON.stringify(original)), catalog);
  assert.deepEqual(restored, {attemptId: 'persisted-l01', difficulty: 'high', loadout: {'warm-can': 2, 'bouncy-treat': 1}});
  restored.loadout['warm-can'] = 0;
  assert.equal(original.activeBattle!.supplies!['warm-can'], 2);
  original.activeBattle!.modifiers = undefined;
  original.activeBattle!.supplies = undefined;
  assert.deepEqual(createChapterContext(original, catalog), {attemptId: 'persisted-l01', difficulty: 'medium', loadout: {'warm-can': 0, 'bouncy-treat': 0}});
});

test('chapter host rejects non-active, unknown and stale layouts rather than routing them into L01', () => {
  for (const change of [{phase: 'home'}, {activeBattle: null}, {activeBattle: {...state().activeBattle!, status: 'won'}}, {activeBattle: {...state().activeBattle!, stageId: 'alley_rescue'}}]) {
    assert.throws(() => createChapterContext(Object.assign(state(), change), catalog));
  }
  assert.throws(() => createChapterContext(state(), {stages: catalog.stages.map(stage => ({...stage, waves: 1}))}));
  const invalid = state();
  invalid.activeBattle!.supplies = {'warm-can': 5};
  assert.throws(() => createChapterContext(invalid, catalog));
  Object.assign(invalid.activeBattle!, {supplies: {}, modifiers: {shadowPressure: 3}});
  assert.throws(() => createChapterContext(invalid, catalog), {code: 'INVALID_BATTLE_PRESSURE'});
});

test('L00 receives only its reserved extras and retains the original chapter boundary', () => {
  const original = {...state(), cats: ['miaomiao']};
  original.activeBattle!.stageId = 'alley_rescue';
  assert.deepEqual(createL00Context(original, catalog).extraSupplies, {'warm-can': 2, 'bouncy-treat': 1});
  original.activeBattle!.stageId = 'alley_boss';
  assert.throws(() => createL00Context(original, catalog));
});
