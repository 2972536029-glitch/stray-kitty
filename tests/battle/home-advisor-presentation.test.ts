import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Catalog, GameState} from '../../web/src/contracts';
import {homeAdvisorBlock, homeAdvisorCopy, knownHomeStorySummaries, type HomeAdvisorActivity} from '../../web/src/modules/advisor/home-presentation';

const catalog = JSON.parse(readFileSync(new URL('../../web/content/catalog.json', import.meta.url), 'utf8')) as Catalog;
const activity: HomeAdvisorActivity = {entered: true, externalPaused: false, overlayOpen: false,
  busy: false, pending: false, renovating: false, repairCardOpen: false, tutorialOpen: false, pageHidden: false};
function home(changes: Partial<GameState> = {}): GameState {
  return {schemaVersion: 1, contentVersion: catalog.version, revision: 1, phase: 'home', chapterId: 'alley',
    storyNodeId: '', mapId: 'greenhouse', flags: [], cats: ['miaomiao', 'tuanzi'], inventory: {}, currencies: {},
    furniture: [], placements: {}, completedStages: [], pendingEventId: '', activeBattle: null,
    lastResult: {message: ''}, ...changes};
}

test('home advisor never interrupts other phases or the prologue, and opening is manual', () => {
  assert.equal(homeAdvisorBlock(home(), activity), null);
  for (const phase of ['dialogue', 'explore', 'event', 'preparation', 'battle', 'settlement'] as const) {
    assert.equal(homeAdvisorBlock(home({phase}), activity), 'outside-home');
    assert.equal(homeAdvisorCopy(home({phase}), catalog), null);
  }
  assert.equal(homeAdvisorBlock(home({chapterId: 'prologue'}), activity), 'outside-home');
  assert.equal(homeAdvisorCopy(home({chapterId: 'prologue'}), catalog), null);
  assert.equal(homeAdvisorBlock(home(), {...activity, entered: false}), 'not-entered');
});

test('commands, overlays, repairs, tutorials and external pause all take priority over home chat', () => {
  const cases = {externalPaused: 'external-pause', overlayOpen: 'overlay', busy: 'command',
    pending: 'command', renovating: 'renovation', repairCardOpen: 'repair-card', tutorialOpen: 'tutorial', pageHidden: 'page-hidden'};
  for (const [flag, reason] of Object.entries(cases)) {
    assert.equal(homeAdvisorBlock(home(), {...activity, [flag]: true}), reason, flag);
  }
});

test('battle trials and recent victories never unlock autobiographical story summaries', () => {
  const state = home({completedStages: ['alley_rescue', 'market_boss', 'greenhouse_boss', 'tunnel_boss', 'finale_boss'],
    lastResult: {message: '通关', stageId: 'finale_boss', outcome: 'won'},
    flags: ['alley_rescued', 'market_cleared', 'greenhouse_fortified', 'finale_boss_victory'],
    cats: ['miaomiao', 'tuanzi', 'diandian', 'momo']});
  assert.deepEqual(knownHomeStorySummaries(state), []);
  assert.doesNotMatch(JSON.stringify(homeAdvisorCopy(state, catalog)), /主人重逢|暗道安全转移|我们已经走到/);
});

test('authored milestones require their complete gates, and joining also requires the actual companion', () => {
  const state = home({flags: ['alley_rescued', 'rescue_story_done', 'chapter_3_started', 'momo_joined'], cats: ['diandian', 'momo']});
  assert.deepEqual(knownHomeStorySummaries(state).map(note => note.id), ['shelter', 'momo-joined']);
  assert.deepEqual(knownHomeStorySummaries({...state, cats: ['diandian']}).map(note => note.id), ['shelter']);
  assert.deepEqual(knownHomeStorySummaries(home({flags: ['chapter_4_started', 'tunnel_explored']})), []);
  assert.equal(knownHomeStorySummaries(home({flags: ['chapter_4_started', 'tunnel_explored', 'cats_rescued_batch1']}))[0]?.id, 'tunnel-rescue');
  assert.deepEqual(knownHomeStorySummaries(home({flags: ['finale_boss_victory', 'finale_started']})), []);
  assert.equal(knownHomeStorySummaries(home({flags: ['finale_started', 'finale_completed', 'kingdom_founded']}))[0]?.id, 'kingdom');
});

test('QA fixture flags are scene state, never evidence of a played story', () => {
  const state = home({qaCheckpointId: 'finale.home', flags: ['finale_started', 'finale_completed', 'kingdom_founded']});
  assert.deepEqual(knownHomeStorySummaries(state), []);
  assert.doesNotMatch(JSON.stringify(homeAdvisorCopy(state, catalog)), /主人重逢|我们已经走到/);
});

test('story handoff references real authored nodes and known partners without serializing hidden gates', () => {
  const notes = JSON.parse(readFileSync(new URL('../../web/content/story/advisor-home.json', import.meta.url), 'utf8')) as {
    id: string; requiredFlags: string[]; requiredCats: string[]; sourceNodes: string[];
  }[];
  for (const note of notes) {
    assert.ok(note.requiredFlags.length > 0, note.id);
    for (const id of note.sourceNodes) assert.ok(catalog.story.some(node => node.id === id), id);
    for (const id of note.requiredCats) assert.ok(catalog.cats.some(cat => cat.id === id), id);
  }
  const state = home({flags: notes.flatMap(note => note.requiredFlags), cats: ['diandian', 'momo']});
  assert.equal(knownHomeStorySummaries(state).length, notes.length);
  assert.ok(knownHomeStorySummaries(state).every(note => !('requiredFlags' in note) && !('sourceNodes' in note)));
  assert.deepEqual(knownHomeStorySummaries({...state, phase: 'explore'}), []);
});

test('welcome uses the visible home stage, makes no purchase prompt and never changes the save', () => {
  const state = home(), before = structuredClone(state);
  assert.match(homeAdvisorCopy(state, catalog)!.welcome, /先在花房歇一会儿/);
  assert.match(homeAdvisorCopy({...state, flags: ['greenhouse_sealed']}, catalog)!.welcome, /暖和/);
  assert.match(homeAdvisorCopy({...state, flags: ['greenhouse_fortified_full']}, catalog)!.welcome, /家具/);
  const complete = homeAdvisorCopy({...state, flags: ['finale_completed', 'kingdom_founded']}, catalog)!;
  assert.match(complete.welcome, /灯串/);
  assert.ok(!complete.prompts.some(question => question.includes('修缮')));
  assert.doesNotMatch(JSON.stringify(complete), /充值|付费|抽十|保证.*(?:抽|赢)/);
  assert.deepEqual(state, before);
});
