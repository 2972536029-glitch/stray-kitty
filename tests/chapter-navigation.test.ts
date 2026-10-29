import test from 'node:test';
import assert from 'node:assert/strict';
import type {GameState} from '../web/src/contracts';
import {
  CHAPTER_MAP_ROUTES,
  chapterExploreCommand,
  chapterMapCommand,
  chapterMapIsUnlocked,
  chapterMapStatus,
  chapterPhaseForCommand,
  chapterStoryCommand,
} from '../web/src/core/chapter-navigation';

function state(phase: GameState['phase'], mapId = '', flags: string[] = []): Pick<GameState, 'phase' | 'mapId' | 'flags'> {
  return {phase, mapId, flags};
}

test('chapter map buttons select only implemented exploration destinations', () => {
  assert.deepEqual(CHAPTER_MAP_ROUTES.alley, {mapId: 'alley', chapterId: 'alley', scene: 'alley', availability: 'exploration'});
  assert.deepEqual(CHAPTER_MAP_ROUTES.market, {mapId: 'market', chapterId: 'market', scene: 'market', availability: 'exploration'});
  assert.deepEqual(CHAPTER_MAP_ROUTES.tunnel, {mapId: 'tunnel', chapterId: 'rescue', scene: 'tunnel', availability: 'exploration'});
  assert.equal(CHAPTER_MAP_ROUTES.greenhouse.scene, null);
  assert.equal(CHAPTER_MAP_ROUTES.warehouse.scene, null);
  assert.equal(chapterMapStatus('greenhouse', false, state('home', '', ['alley_rescued'])), '第三章剧情与独立战斗试玩；探索地图尚未开放');
  assert.equal(chapterMapStatus('warehouse', false, state('home')), '终章战斗试玩；探索地图尚未开放');
});

test('route buttons dispatch the intended map and phase and respect unlocks', () => {
  assert.deepEqual(chapterMapCommand('alley', state('home')), {type: 'GO_EXPLORE', mapId: 'alley'});
  assert.deepEqual(chapterMapCommand('market', state('home', '', ['alley_rescued'])), {type: 'GO_EXPLORE', mapId: 'market'});
  assert.deepEqual(chapterMapCommand('tunnel', state('home', '', ['chapter_4_started'])), {type: 'GO_EXPLORE', mapId: 'tunnel'});
  assert.equal(chapterMapCommand('market', state('home')), null);
  assert.equal(chapterMapCommand('tunnel', state('home')), null);
  assert.equal(chapterMapCommand('greenhouse', state('home', '', ['alley_rescued'])), null);
  assert.equal(chapterMapCommand('warehouse', state('home')), null);
  assert.equal(chapterMapCommand('alley', state('explore', 'alley')), null);
  assert.equal(chapterMapCommand('market', state('battle', 'alley', ['alley_rescued'])), null);
  assert.equal(chapterPhaseForCommand(chapterExploreCommand('alley')), 'explore');
  assert.equal(chapterPhaseForCommand(chapterExploreCommand('market')), 'explore');
  assert.equal(chapterPhaseForCommand(chapterExploreCommand('tunnel')), 'explore');
});

test('chapter story entry buttons start their matching story, separate from battle trials', () => {
  const entries = [
    ['alley', 'chapter1_intro'],
    ['market', 'market_intro_1'],
    ['greenhouse', 'greenhouse_intro_1'],
    ['rescue', 'rescue_intro_1'],
    ['finale', 'finale_intro_1'],
  ] as const;
  for (const [chapter, nodeId] of entries) {
    const command = chapterStoryCommand(chapter);
    assert.deepEqual(command, {type: 'START_STORY', nodeId});
    assert.equal(chapterPhaseForCommand(command), 'dialogue');
  }
  assert.equal(chapterPhaseForCommand({type: 'START_BATTLE', stageId: 'market_boss'}), 'preparation');
  assert.equal(chapterPhaseForCommand({type: 'GO_HOME'}), 'home');
  assert.equal(chapterMapIsUnlocked('market', state('home', '', ['alley_rescued'])), true);
  assert.equal(chapterMapIsUnlocked('greenhouse', state('home', '', ['alley_rescued'])), false);
});
