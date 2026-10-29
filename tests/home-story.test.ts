import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {GameState, StoryNode} from '../web/src/contracts';
import {HOME_SIZE, HOME_SLOTS, homeStage} from '../web/src/modules/home/layout';
import {homeStoryBeat, storyActorPosition} from '../web/src/modules/home/story';
import {homeAppearanceKey} from '../web/src/modules/home/painter';
import {canDispatch} from '../web/src/core/flow';

const story = JSON.parse(fs.readFileSync('web/content/story/nodes.json', 'utf8')) as StoryNode[];
const state = (id = 'greenhouse_intro_1'): GameState => ({
  phase: 'dialogue', chapterId: 'greenhouse', mapId: 'greenhouse', storyNodeId: id,
  cats: ['miaomiao', 'tuanzi', 'diandian'], flags: [], placements: {window: 'blue_bowl', corner: 'box_castle'},
} as unknown as GameState);
const node = (id: string) => story.find(n => n.id === id)!;

test('every existing flower-house dialogue owns its cast, while other scenes and free home do not', () => {
  for (const n of story.filter(n => n.scene === 'home' && n.chapterId !== 'prologue')) {
    const s = {...state(n.id), chapterId: n.chapterId};
    const before = structuredClone(s);
    assert.ok(homeStoryBeat(s, n), n.id);
    assert.deepEqual(s, before, 'staging cannot change the save, furniture or recruited cats');
  }
  assert.equal(homeStoryBeat({...state(), phase: 'home'}, node('greenhouse_intro_1')), null);
  assert.equal(homeStoryBeat({...state(), phase: 'event'}, node('greenhouse_intro_1')), null);
  assert.equal(homeStoryBeat({...state(), chapterId: 'prologue'}, node('prologue_1')), null);
  assert.equal(homeStoryBeat(state(), node('market_intro_1')), null);
});

test('Momo appears at the narrated entrance, lands exactly once and is not recruited by staging', () => {
  const s = state();
  assert.equal(homeStoryBeat(s, node('greenhouse_intro_2'))!.actors.some(a => a.breed === 'momo'), false);
  const beat = homeStoryBeat(s, node('greenhouse_intro_3'))!;
  const momo = beat.actors.find(a => a.breed === 'momo')!;
  assert.ok(momo.from);
  assert.ok(storyActorPosition(momo, momo.from!, beat.duration / 2, beat.duration).height > 40);
  const landed = storyActorPosition(momo, momo.from!, beat.duration, beat.duration);
  assert.equal(landed.x, momo.at.x);assert.equal(landed.y, momo.at.y);assert.equal(landed.moving, false);
  assert.deepEqual(storyActorPosition(momo, momo.from!, 100000, beat.duration), landed);
  assert.deepEqual(s.cats, ['miaomiao', 'tuanzi', 'diandian']);
});

test('chapter assignments and the final farewell have separate directed positions', () => {
  const briefing = homeStoryBeat(state(), node('greenhouse_intro_6'))!;
  const work = homeStoryBeat(state(), node('greenhouse_intro_7'))!;
  for (const breed of ['tuanzi', 'diandian', 'momo']) {
    assert.notDeepEqual(work.actors.find(a => a.breed === breed)!.at, briefing.actors.find(a => a.breed === breed)!.at);
  }
  const goodbye = homeStoryBeat({...state(), chapterId: 'finale'}, node('finale_intro_9'))!;
  assert.ok(goodbye.actors.find(a => a.breed === 'miaomiao')!.at.y > 400);
});

test('the home map shares every furniture slot and all four repair appearances with the live scene', () => {
  assert.equal(canDispatch('home', 'REPAIR_HOME'), true);
  assert.equal(canDispatch('dialogue', 'REPAIR_HOME'), false);
  assert.equal(canDispatch('explore', 'REPAIR_HOME'), false);
  const slots = JSON.parse(fs.readFileSync('web/content/home/slots.json', 'utf8')) as {id: string}[];
  assert.deepEqual(Object.keys(HOME_SLOTS).sort(), slots.map(s => s.id).sort());
  for (const p of Object.values(HOME_SLOTS)) assert.ok(p.x > 0 && p.x < HOME_SIZE.width && p.y > 0 && p.y < HOME_SIZE.height);
  const s = state();
  assert.equal(homeStage(s), 1);
  assert.equal(homeStage({...s, flags: ['greenhouse_sealed']}), 2);
  assert.equal(homeStage({...s, flags: ['greenhouse_fortified_full']}), 3);
  assert.equal(homeStage({...s, flags: ['kingdom_founded']}), 4);
  assert.equal(homeStage({...s, storyNodeId: 'finale_intro_7'}), 4);
  assert.equal(homeStage({...s, phase: 'home', storyNodeId: 'finale_intro_7'}), 1);
  assert.equal(homeAppearanceKey(s), homeAppearanceKey({...s, placements: {corner: 'box_castle', window: 'blue_bowl'}}));
  assert.notEqual(homeAppearanceKey(s), homeAppearanceKey({...s, placements: {corner: 'blue_bowl'}}));
});
