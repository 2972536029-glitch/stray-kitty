import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import type {GameState} from '../web/src/contracts/index.ts';
import {
  AUDIO_STORAGE_KEYS,
  BGM_SOURCES,
  BGM_TRACKS,
  clampVolume,
  computeEffectiveVolume,
  isHomeBgmUnlocked,
  readAudioPrefs,
  resolveSceneAmbient,
  resolveSceneBgm,
  writeAudioPref,
  type StorageLike,
} from '../web/src/core/audio.ts';
import {playSfx} from '../web/src/core/sound.ts';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    schemaVersion: 1,
    contentVersion: '1',
    revision: 0,
    phase: 'dialogue',
    chapterId: 'prologue',
    storyNodeId: 'prologue_1',
    mapId: 'alley',
    flags: [],
    cats: ['miaomiao'],
    inventory: {},
    currencies: {},
    furniture: [],
    placements: {},
    completedStages: [],
    pendingEventId: '',
    activeBattle: null,
    lastResult: {message: ''},
    ...overrides,
  };
}

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

test('BGM track metadata maps all 10 existing MP3 files and avoids settings button name collisions', () => {
  assert.equal(BGM_TRACKS.length, 10);
  const bgmDir = path.resolve(import.meta.dirname, '../web/public/assets/bgm');
  const forbiddenNames = /猫爪邮局|猫咪补给站|家园仓库|布置/;

  for (const track of BGM_TRACKS) {
    assert.equal(BGM_SOURCES[track.id], track.url);
    assert.equal(fs.existsSync(path.join(bgmDir, track.file)), true, `missing mp3 ${track.file}`);
    assert.equal(forbiddenNames.test(`${track.title} ${track.sceneLabel} ${track.unlockHint}`), false, `forbidden substring in track ${track.id}`);
  }
});

test('resolveSceneBgm prioritizes title, lottery overlay, battle, prologue, home stages, and chapter exploration', () => {
  const prologueHome = makeState({phase: 'dialogue', chapterId: 'prologue', storyNodeId: 'prologue_1', mapId: 'alley'});
  assert.equal(resolveSceneBgm({entered: false, state: prologueHome}), 'title');
  assert.equal(resolveSceneBgm({entered: true, state: null}), 'title');

  // Opening parcels overlay switches to lottery BGM from exploration or home hub
  assert.equal(resolveSceneBgm({entered: true, state: makeState({phase: 'explore', chapterId: 'alley', mapId: 'alley'}), overlay: 'parcels'}), 'lottery');
  assert.equal(resolveSceneBgm({entered: true, state: makeState({phase: 'home', chapterId: 'alley', mapId: 'greenhouse'}), overlay: 'home', homeTab: 'parcels'}), 'lottery');

  // Only battle phase uses battle BGM; preparation and settlement keep scene BGM
  assert.equal(resolveSceneBgm({entered: true, state: makeState({phase: 'battle', chapterId: 'alley', mapId: 'alley'})}), 'battle');
  assert.equal(resolveSceneBgm({entered: true, state: makeState({phase: 'battle', chapterId: 'finale', mapId: 'warehouse'})}), 'battle');
  assert.equal(resolveSceneBgm({entered: true, state: makeState({phase: 'preparation', chapterId: 'alley', mapId: 'alley'})}), 'alley');
  assert.equal(resolveSceneBgm({entered: true, state: makeState({phase: 'settlement', chapterId: 'greenhouse', mapId: 'greenhouse'})}), 'home_early');

  // Prologue home intro beat still uses prologue BGM rather than home BGM
  assert.equal(resolveSceneBgm({entered: true, state: prologueHome, storyScene: 'home'}), 'prologue');

  // Chapters route to their respective MP3s
  assert.equal(resolveSceneBgm({entered: true, state: makeState({phase: 'explore', chapterId: 'alley', mapId: 'alley'})}), 'alley');
  assert.equal(resolveSceneBgm({entered: true, state: makeState({phase: 'explore', chapterId: 'market', mapId: 'market'})}), 'market');
  assert.equal(resolveSceneBgm({entered: true, state: makeState({phase: 'explore', chapterId: 'rescue', mapId: 'tunnel'})}), 'tunnel');
  assert.equal(resolveSceneBgm({entered: true, state: makeState({phase: 'explore', chapterId: 'finale', mapId: 'warehouse'})}), 'warehouse');

  // Home stage 1-2 vs stage 3-4
  const homeStage1 = makeState({phase: 'home', chapterId: 'alley', mapId: 'greenhouse', flags: ['alley_rescued', 'rescue_story_done']});
  const homeStage2 = makeState({phase: 'home', chapterId: 'greenhouse', mapId: 'greenhouse', flags: ['alley_rescued', 'greenhouse_sealed']});
  const homeStage3 = makeState({phase: 'home', chapterId: 'greenhouse', mapId: 'greenhouse', flags: ['alley_rescued', 'greenhouse_fortified_full']});
  const celebration = makeState({phase: 'dialogue', chapterId: 'finale', mapId: 'warehouse', storyNodeId: 'finale_intro_8', flags: ['alley_rescued', 'greenhouse_fortified_full']});
  assert.equal(resolveSceneBgm({entered: true, state: homeStage1}), 'home_early');
  assert.equal(resolveSceneBgm({entered: true, state: homeStage2}), 'home_early');
  assert.equal(resolveSceneBgm({entered: true, state: homeStage3}), 'home_warm');
  assert.equal(resolveSceneBgm({entered: true, state: celebration, storyScene: 'home'}), 'home_warm');
});

test('home BGM selection honors unlocked tracks and falls back safely when locked or reset', () => {
  const earlyHome = makeState({
    phase: 'home',
    chapterId: 'alley',
    mapId: 'greenhouse',
    flags: ['l00_completed', 'alley_rescued', 'rescue_story_done'],
    completedStages: ['l00_tutorial', 'alley_rescue'],
  });
  const fullHome = makeState({
    phase: 'home',
    chapterId: 'finale',
    mapId: 'greenhouse',
    flags: ['l00_completed', 'alley_rescued', 'market_unlocked', 'greenhouse_sealed', 'greenhouse_fortified_full', 'tunnel_unlocked', 'finale_completed'],
    completedStages: ['l00_tutorial', 'alley_rescue', 'market_boss', 'tunnel_boss', 'finale_boss'],
  });

  // Fresh prologue state only has auto/title/prologue unlocked
  const fresh = makeState();
  assert.equal(isHomeBgmUnlocked('auto', fresh), true);
  assert.equal(isHomeBgmUnlocked('title', fresh), true);
  assert.equal(isHomeBgmUnlocked('prologue', fresh), true);
  assert.equal(isHomeBgmUnlocked('alley', fresh), false);
  assert.equal(isHomeBgmUnlocked('market', fresh), false);
  assert.equal(isHomeBgmUnlocked('warehouse', fresh), false);

  // Early home can select alley or lottery or battle, but not market or warehouse
  assert.equal(isHomeBgmUnlocked('alley', earlyHome), true);
  assert.equal(isHomeBgmUnlocked('lottery', earlyHome), true);
  assert.equal(isHomeBgmUnlocked('battle', earlyHome), true);
  assert.equal(isHomeBgmUnlocked('market', earlyHome), false);
  assert.equal(resolveSceneBgm({entered: true, state: earlyHome, homeBgm: 'alley'}), 'alley');
  assert.equal(resolveSceneBgm({entered: true, state: earlyHome, homeBgm: 'market'}), 'home_early');

  // Unlocked selection only overrides Home scene, never chapter exploration or lottery overlay
  assert.equal(resolveSceneBgm({entered: true, state: fullHome, homeBgm: 'warehouse'}), 'warehouse');
  assert.equal(resolveSceneBgm({entered: true, state: {...fullHome, phase: 'explore', mapId: 'alley', chapterId: 'alley'}, homeBgm: 'warehouse'}), 'alley');
  assert.equal(resolveSceneBgm({entered: true, state: fullHome, overlay: 'parcels', homeBgm: 'warehouse'}), 'lottery');
});

test('resolveSceneAmbient enables rain in alley explore, market in market explore, and mutes ambient in parcels', () => {
  assert.equal(resolveSceneAmbient({entered: false, state: makeState({phase: 'explore', mapId: 'alley'}), bgm: 'title'}), null);
  assert.equal(resolveSceneAmbient({entered: true, state: makeState({phase: 'explore', mapId: 'alley'}), bgm: 'alley'}), 'rain');
  assert.equal(resolveSceneAmbient({entered: true, state: makeState({phase: 'explore', mapId: 'market'}), bgm: 'market'}), 'market');
  assert.equal(resolveSceneAmbient({entered: true, state: makeState({phase: 'explore', mapId: 'alley'}), bgm: 'lottery'}), null);
});

test('audio preferences clamp volumes, compute effective gain, persist across storage, and playSfx stays safe in Node', () => {
  assert.equal(clampVolume(-10, 40), 0);
  assert.equal(clampVolume(150, 40), 100);
  assert.equal(clampVolume(Number.NaN, 40), 40);
  assert.equal(computeEffectiveVolume(50, true, 0.72), 0);
  assert.equal(computeEffectiveVolume(50, false, 0.72), 0.36);

  const storage = new MemoryStorage();
  assert.deepEqual(readAudioPrefs(storage), {muted: false, musicVolume: 40, sfxVolume: 65, homeBgm: 'auto'});

  writeAudioPref('muted', true, storage);
  writeAudioPref('music', 75, storage);
  writeAudioPref('sfx', 30, storage);
  writeAudioPref('homeBgm', 'market', storage);
  assert.equal(storage.getItem(AUDIO_STORAGE_KEYS.muted), '1');
  assert.deepEqual(readAudioPrefs(storage), {muted: true, musicVolume: 75, sfxVolume: 30, homeBgm: 'market'});

  storage.setItem(AUDIO_STORAGE_KEYS.homeBgm, 'nonexistent_track');
  assert.equal(readAudioPrefs(storage).homeBgm, 'auto');

  assert.doesNotThrow(() => playSfx('/assets/sfx/ui-click.ogg', 0.3));
});
