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

test('L00 maps the saved event pressure to its three difficulty tiers without applying another pressure multiplier', () => {
  for (const [shadowPressure, difficulty] of [[-1, 'low'], [0, 'medium'], [1, 'high']] as const) {
    const {state, catalog} = fixtures();
    state.activeBattle!.modifiers = {shadowPressure, situation: 'forced_chase'};
    const context = createL00Context(state, catalog);
    assert.deepEqual(context.attempt, {id: 'server-attempt-1', stageId: 'alley_rescue', status: 'active'});
    assert.equal(context.difficulty, difficulty);
    assert.deepEqual(context.extraSupplies, {});
    assert.deepEqual(context.modifiers, []);
    const battle = new PrologueBattle();
    assert.doesNotThrow(() => battle.start(context, () => {}));
    assert.equal(battle.getSnapshot().difficulty, difficulty);
    assert.equal(battle.getSnapshot().effectivePressure, 0);
    battle.dispatch({type: 'START'});
    // Scripted rescue is shared by all tiers; event pressure must not scale this pursuer.
    assert.equal(battle.getSnapshot().enemies[0].maxHp, 240);
    battle.dispatch({type: 'RESTART'});
    assert.equal(battle.getSnapshot().phase, 'ready');
    assert.equal(battle.getSnapshot().attemptId, 'server-attempt-1');
    assert.equal(battle.getSnapshot().difficulty, difficulty);
    battle.stop();
  }
});

test('L00 uses normal difficulty for legacy attempts with omitted modifiers or pressure', () => {
  for (const modifiers of [undefined, {}]) {
    const {state, catalog} = fixtures();
    // The runtime boundary may receive old JSON without the newer optional data.
    state.activeBattle = JSON.parse(JSON.stringify({...state.activeBattle, modifiers}));
    assert.equal(createL00Context(state, catalog).difficulty, 'medium');
  }
});

test('L00 rejects malformed pressure instead of silently choosing a different tier', () => {
  for (const shadowPressure of [null, -2, 2, 0.5, '1', 'high', false, {}, [], NaN]) {
    const {state, catalog} = fixtures();
    Object.assign(state.activeBattle!.modifiers!, {shadowPressure});
    assert.throws(() => createL00Context(state, catalog), {code: 'INVALID_BATTLE_PRESSURE'});
  }
});

test('L00 reconstructs the same attempt tier after serialization and ignores later pending event results', () => {
  for (const [shadowPressure, difficulty] of [[-1, 'low'], [0, 'medium'], [1, 'high']] as const) {
    const {state, catalog} = fixtures();
    state.activeBattle!.modifiers = {shadowPressure};
    // A pending result belongs to a later battle; this host consumes only activeBattle.
    const saved = {...state, eventState: {pendingModifiers: {shadowPressure: shadowPressure === 1 ? -1 : 1}}};
    const restored = JSON.parse(JSON.stringify(saved));
    const first = new PrologueBattle();
    first.start(createL00Context(saved, catalog), () => {});
    first.dispatch({type: 'START'});
    first.stop();
    const reloaded = new PrologueBattle();
    reloaded.start(createL00Context(restored, catalog), () => {});
    assert.equal(reloaded.getSnapshot().difficulty, difficulty);
    assert.equal(reloaded.getSnapshot().attemptId, saved.activeBattle!.id);
    assert.equal(reloaded.getSnapshot().phase, 'ready');
    const changedTier = structuredClone(restored);
    changedTier.activeBattle.modifiers.shadowPressure = shadowPressure === 1 ? -1 : 1;
    assert.throws(() => reloaded.start(createL00Context(changedTier, catalog), () => {}), {code: 'BATTLE_DIFFICULTY_LOCKED'});
    assert.equal(reloaded.getSnapshot().difficulty, difficulty);
    reloaded.stop();
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
