import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Catalog, GameState} from '../web/src/contracts/index.ts';
import {createL00Context} from '../web/src/modules/battle/host-context.ts';
import {PrologueBattle} from '../web/src/modules/battle/l00/runtime.ts';

function fixtures() {
  const state: Pick<GameState, 'phase' | 'activeBattle' | 'cats'> = {
    phase: 'battle', cats: ['miaomiao'],
    activeBattle: {id: 'server-attempt-1', stageId: 'alley_rescue', status: 'active', modifiers: {shadowPressure: 1}},
  };
  const catalog: Pick<Catalog, 'stages'> = JSON.parse(fs.readFileSync('web/content/catalog.json', 'utf8'));
  return {state, catalog};
}

test('L00 uses the server attempt and synchronized 3×7/10-wave catalog without converting event pressure to difficulty', () => {
  for (const shadowPressure of [-1, 0, 1] as const) {
    const {state, catalog} = fixtures();
    state.activeBattle!.modifiers = {shadowPressure, situation: 'forced_chase'};
    const context = createL00Context(state, catalog);
    assert.deepEqual(context.attempt, {id: 'server-attempt-1', stageId: 'alley_rescue', status: 'active'});
    assert.equal(context.difficulty, 'medium');
    assert.deepEqual(context.extraSupplies, {});
    assert.deepEqual(context.modifiers, []);
    const battle = new PrologueBattle();
    assert.doesNotThrow(() => battle.start(context, () => {}));
    assert.equal(battle.getSnapshot().difficulty, 'medium');
    battle.stop();
  }
});

test('L00 adapter rejects inactive attempts, other chapters and stale layouts instead of silently using the prologue', () => {
  const {state, catalog} = fixtures();
  assert.throws(() => createL00Context({...state, phase: 'preparation'}, catalog));
  assert.throws(() => createL00Context({...state, activeBattle: null}, catalog));
  assert.throws(() => createL00Context({...state, activeBattle: {...state.activeBattle!, status: 'won'}}, catalog));
  assert.throws(() => createL00Context({...state, activeBattle: {...state.activeBattle!, id: ' '}}, catalog));
  assert.throws(() => createL00Context({...state, activeBattle: {...state.activeBattle!, stageId: 'chapter-2'}}, catalog));
  assert.throws(() => createL00Context(state, {stages: []}));
  for (const change of [{lanes: 2}, {columns: 5}, {waves: 2}]) {
    assert.throws(() => createL00Context(state, {stages: [{...catalog.stages[0], ...change}]}));
  }
});

test('L00 context owns copies and cannot mutate host progress or content', () => {
  const {state, catalog} = fixtures();
  const before = structuredClone({state, catalog});
  const context = createL00Context(state, catalog);
  context.catIds.push('temporary-reinforcement');
  context.attempt.status = 'won';
  context.stage.waves = 2;
  assert.deepEqual({state, catalog}, before);
});

test('both generated catalogs publish the same L00 layout and retain the server-supported entry status', () => {
  const {catalog} = fixtures();
  const serverCatalog = JSON.parse(fs.readFileSync('server/internal/platform/catalog.json', 'utf8'));
  assert.deepEqual(catalog.stages, serverCatalog.stages);
  const stage = catalog.stages.find(stage => stage.id === 'alley_rescue')!;
  assert.deepEqual([stage.lanes, stage.columns, stage.waves], [3, 7, 10]);
  assert.equal(stage.status, 'demo');
});
