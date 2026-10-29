import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Catalog, GamePhase, GameState} from '../web/src/contracts';
import {canDispatch} from '../web/src/core/flow';
import {QA_CHAPTERS, qaCurrentActions} from '../web/src/modules/qa/flow';

const catalog = JSON.parse(fs.readFileSync('web/content/catalog.json', 'utf8')) as Catalog;
const state = (phase: GamePhase, extra: Partial<GameState> = {}) => ({phase, chapterId: 'alley', mapId: 'alley', storyNodeId: 'chapter1_intro', flags: [], lastResult: {message: ''}, activeBattle: null, ...extra} as GameState);

test('QA follows the authored chapter order and only fixed checkpoint commands can cross phases', () => {
  assert.deepEqual(QA_CHAPTERS.map(c => c.id), catalog.chapters.map(c => c.id));
  for (const phase of ['dialogue', 'explore', 'event', 'preparation', 'battle', 'settlement', 'home'] as const) {
    assert.equal(canDispatch(phase, 'QA_CHECKPOINT'), true);
    assert.equal(canDispatch(phase, 'QA_RESTORE'), true);
    assert.equal(canDispatch(phase, 'QA_SIMULATE_DEFEAT'), phase === 'battle');
    for (const action of qaCurrentActions(state(phase), catalog, true)) if (action.command) assert.equal(canDispatch(phase, action.command.type), true, action.id);
  }
});

test('normal-flow shortcuts cannot issue distant NPC interaction, redraw a completed crate or skip a pending event', () => {
  assert.deepEqual(qaCurrentActions(state('event'), catalog, true), []);
  assert.deepEqual(qaCurrentActions(state('explore', {mapId: 'market'}), catalog, true), []);
  assert.deepEqual(qaCurrentActions(state('explore', {flags: ['alley_rescued', 'lost_poster_found']}), catalog, true), []);
  assert.deepEqual(qaCurrentActions(state('explore', {flags: ['alley_rescued']}), catalog, true)[0].command, {type: 'INTERACT', interactionId: 'alley_poster'});
  assert.deepEqual(qaCurrentActions(state('explore', {drawnEvents: ['node:crate_event']}), catalog, true), []);
  assert.deepEqual(qaCurrentActions(state('explore'), catalog, true)[0].command, {type: 'INTERACT', interactionId: 'alley_crate'});
});

test('battle controls follow the active attempt and expose the actual server gate', () => {
  for (const stage of catalog.stages) {
    const activeBattle = {id: `${stage.id}-current`, stageId: stage.id, status: 'active' as const};
    const allowed = qaCurrentActions(state('battle', {activeBattle}), catalog, true);
    assert.equal(allowed.length, 2);
    assert.ok(allowed.every(a => a.command && 'attemptId' in a.command && a.command.attemptId === activeBattle.id && !a.reason));
    const blocked = qaCurrentActions(state('battle', {activeBattle}), catalog, false);
    assert.ok(blocked.every(a => a.reason?.includes('服务端')));
  }
  assert.deepEqual(qaCurrentActions(state('battle'), catalog, true), []);
  assert.equal(qaCurrentActions(state('settlement', {lastResult: {message: '', outcome: 'lost'}}), catalog, true)[0].label, '进入重试准备');
});
