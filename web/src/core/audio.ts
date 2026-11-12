import type {GameState, StoryNode} from '../contracts';
import {homeStage} from '../modules/home/layout';

export type BgmMode =
  | 'title'
  | 'prologue'
  | 'alley'
  | 'market'
  | 'home_early'
  | 'home_warm'
  | 'tunnel'
  | 'warehouse'
  | 'lottery'
  | 'battle';

export type HomeBgmChoice = 'auto' | BgmMode;
export type AmbientMode = 'rain' | 'market' | null;

export interface BgmTrackMeta {
  id: BgmMode;
  title: string;
  sceneLabel: string;
  file: string;
  url: string;
  unlockHint: string;
}

// Track labels intentionally avoid topbar tool names such as "猫爪邮局" or "布置"
// so Settings UI controls stay distinct in automated checks and screen readers.
export const BGM_TRACKS: readonly BgmTrackMeta[] = [
  {
    id: 'title',
    title: '暮夜初星',
    sceneLabel: '标题主界面',
    file: 'title-first-stars.mp3',
    url: '/assets/bgm/title-first-stars.mp3',
    unlockHint: '随时可在花房点播',
  },
  {
    id: 'prologue',
    title: '草丛轻音',
    sceneLabel: '序章 · 金枪鱼事件',
    file: 'prologue-tall-grass.mp3',
    url: '/assets/bgm/prologue-tall-grass.mp3',
    unlockHint: '进入旅程后解锁',
  },
  {
    id: 'alley',
    title: '雨与街灯间',
    sceneLabel: '第一章 · 雨夜小巷',
    file: 'alley-rain-streetlights.mp3',
    url: '/assets/bgm/alley-rain-streetlights.mp3',
    unlockHint: '进入第一章小巷后解锁',
  },
  {
    id: 'home_early',
    title: '寂静爪印',
    sceneLabel: '花房 · 初建阶段 (1–2)',
    file: 'home-paws-quiet.mp3',
    url: '/assets/bgm/home-paws-quiet.mp3',
    unlockHint: '首次安顿花房后解锁',
  },
  {
    id: 'market',
    title: '午夜集市灯笼',
    sceneLabel: '第二章 · 午夜集市',
    file: 'market-midnight-lanterns.mp3',
    url: '/assets/bgm/market-midnight-lanterns.mp3',
    unlockHint: '开启第二章午夜集市后解锁',
  },
  {
    id: 'home_warm',
    title: '木板日光',
    sceneLabel: '花房 · 温馨阶段 (3–4)',
    file: 'home-sunlight-floorboards.mp3',
    url: '/assets/bgm/home-sunlight-floorboards.mp3',
    unlockHint: '花房修缮至三阶原木温室后解锁',
  },
  {
    id: 'tunnel',
    title: '拱洞足音',
    sceneLabel: '第四章 · 地下暗道',
    file: 'tunnel-steps-arch.mp3',
    url: '/assets/bgm/tunnel-steps-arch.mp3',
    unlockHint: '进入第四章地下暗道后解锁',
  },
  {
    id: 'warehouse',
    title: '封锁门扉',
    sceneLabel: '终章 · 废弃大仓库',
    file: 'warehouse-locked-threshold.mp3',
    url: '/assets/bgm/warehouse-locked-threshold.mp3',
    unlockHint: '踏入终章废弃大仓库后解锁',
  },
  {
    id: 'lottery',
    title: '邮票与星光',
    sceneLabel: '来信寄送与拆包柜台',
    file: 'lottery-stamps-starlight.mp3',
    url: '/assets/bgm/lottery-stamps-starlight.mp3',
    unlockHint: '救出点点或寄出明信片后解锁',
  },
  {
    id: 'battle',
    title: '小小猫卫队进行曲',
    sceneLabel: '守护防线战斗',
    file: 'battle-tiny-brigade.mp3',
    url: '/assets/bgm/battle-tiny-brigade.mp3',
    unlockHint: '完成任意一场守护战斗后解锁',
  },
];

export const BGM_SOURCES: Readonly<Record<BgmMode, string>> = Object.fromEntries(
  BGM_TRACKS.map(track => [track.id, track.url]),
) as Readonly<Record<BgmMode, string>>;

const BGM_MODE_SET = new Set<string>(BGM_TRACKS.map(track => track.id));

export const AUDIO_STORAGE_KEYS = {
  muted: 'stray-kitty.audio.muted',
  music: 'stray-kitty.audio.music',
  sfx: 'stray-kitty.audio.sfx',
  homeBgm: 'stray-kitty.audio.homeBgm',
} as const;

export const DEFAULT_MUSIC_VOLUME = 40;
export const DEFAULT_SFX_VOLUME = 65;

export interface AudioPreferences {
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  homeBgm: HomeBgmChoice;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampVolume(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function computeEffectiveVolume(percent: number, muted: boolean, gain = 1): number {
  if (muted) return 0;
  const normalized = clampVolume(percent, 0) / 100;
  return Math.min(1, Math.max(0, normalized * gain));
}

export function isBgmMode(value: unknown): value is BgmMode {
  return typeof value === 'string' && BGM_MODE_SET.has(value);
}

export function parseHomeBgmChoice(value: string | null | undefined): HomeBgmChoice {
  if (!value || value === 'auto') return 'auto';
  return isBgmMode(value) ? value : 'auto';
}

export function readAudioPrefs(storage?: StorageLike | null): AudioPreferences {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) {
    return {
      muted: false,
      musicVolume: DEFAULT_MUSIC_VOLUME,
      sfxVolume: DEFAULT_SFX_VOLUME,
      homeBgm: 'auto',
    };
  }
  try {
    const rawMuted = store.getItem(AUDIO_STORAGE_KEYS.muted);
    const rawMusic = store.getItem(AUDIO_STORAGE_KEYS.music);
    const rawSfx = store.getItem(AUDIO_STORAGE_KEYS.sfx);
    const rawHomeBgm = store.getItem(AUDIO_STORAGE_KEYS.homeBgm);
    return {
      muted: rawMuted === '1' || rawMuted === 'true',
      musicVolume: rawMusic === null ? DEFAULT_MUSIC_VOLUME : clampVolume(Number(rawMusic), DEFAULT_MUSIC_VOLUME),
      sfxVolume: rawSfx === null ? DEFAULT_SFX_VOLUME : clampVolume(Number(rawSfx), DEFAULT_SFX_VOLUME),
      homeBgm: parseHomeBgmChoice(rawHomeBgm),
    };
  } catch {
    return {
      muted: false,
      musicVolume: DEFAULT_MUSIC_VOLUME,
      sfxVolume: DEFAULT_SFX_VOLUME,
      homeBgm: 'auto',
    };
  }
}

export function writeAudioPref(key: keyof typeof AUDIO_STORAGE_KEYS, value: string | number | boolean, storage?: StorageLike | null): void {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;
  try {
    const serialized = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
    store.setItem(AUDIO_STORAGE_KEYS[key], serialized);
  } catch {
    /* Ignore storage quota or private-mode restrictions */
  }
}

function hasAnyFlag(state: Pick<GameState, 'flags'>, expected: readonly string[]): boolean {
  return expected.some(flag => state.flags.includes(flag));
}

export function isHomeBgmUnlocked(choice: HomeBgmChoice, state: GameState | null | undefined): boolean {
  if (choice === 'auto' || choice === 'title') return true;
  if (!state) return false;

  const homeReached =
    state.phase === 'home' ||
    hasAnyFlag(state, [
      'rescue_story_done',
      'alley_rescued',
      'greenhouse_fortified',
      'greenhouse_sealed',
      'greenhouse_fortified_full',
      'chapter_3_started',
      'chapter_4_started',
      'finale_started',
      'finale_completed',
      'kingdom_founded',
    ]);

  switch (choice) {
    case 'prologue':
      return true;
    case 'alley':
      return (
        state.chapterId === 'alley' ||
        state.completedStages.some(stage => stage === 'l00_tutorial' || stage === 'alley_rescue' || stage === 'alley_boss') ||
        hasAnyFlag(state, [
          'l00_completed',
          'alley_rescued',
          'lost_poster_found',
          'rescue_story_done',
          'market_unlocked',
          'chapter_2_started',
          'chapter_3_started',
          'chapter_4_started',
          'finale_started',
          'finale_completed',
        ])
      );
    case 'home_early':
      return homeReached;
    case 'market':
      return (
        state.mapId === 'market' ||
        state.chapterId === 'market' ||
        state.completedStages.includes('market_boss') ||
        hasAnyFlag(state, [
          'market_unlocked',
          'chapter_2_started',
          'market_cleared',
          'market_exit_crossed',
          'chapter_3_started',
          'chapter_4_started',
          'finale_started',
          'finale_completed',
        ])
      );
    case 'home_warm':
      return homeReached && homeStage(state) >= 3;
    case 'tunnel':
      return (
        state.mapId === 'tunnel' ||
        state.chapterId === 'rescue' ||
        state.completedStages.includes('tunnel_boss') ||
        hasAnyFlag(state, [
          'chapter_4_started',
          'tunnel_unlocked',
          'tunnel_false_kitten_trap_found',
          'valve_three_investigated',
          'tunnel_boss_cleared',
          'tunnel_explored',
          'cats_rescued_batch1',
          'finale_started',
          'finale_completed',
        ])
      );
    case 'warehouse':
      return (
        state.mapId === 'warehouse' ||
        state.chapterId === 'finale' ||
        state.completedStages.includes('finale_boss') ||
        hasAnyFlag(state, ['finale_started', 'finale_boss_victory', 'finale_completed', 'kingdom_founded'])
      );
    case 'lottery':
      return (
        (state.lottery?.history?.length ?? 0) > 0 ||
        hasAnyFlag(state, ['alley_rescued', 'rescue_story_done', 'finale_completed'])
      );
    case 'battle':
      return (
        state.phase === 'battle' ||
        state.completedStages.length > 0 ||
        hasAnyFlag(state, ['l00_completed', 'alley_rescued', 'market_cleared', 'tunnel_boss_cleared', 'finale_boss_victory'])
      );
    default:
      return false;
  }
}

export interface SceneBgmInput {
  entered: boolean;
  state: GameState | null | undefined;
  storyScene?: StoryNode['scene'];
  overlay?: string | null;
  homeTab?: string | null;
  homeBgm?: HomeBgmChoice;
}

export function resolveSceneBgm({
  entered,
  state,
  storyScene,
  overlay = null,
  homeTab = null,
  homeBgm = 'auto',
}: SceneBgmInput): BgmMode {
  if (!entered || !state) return 'title';

  if (overlay === 'parcels' || (overlay === 'home' && homeTab === 'parcels')) {
    return 'lottery';
  }

  if (state.phase === 'battle') {
    return 'battle';
  }

  if (state.chapterId === 'prologue') {
    return 'prologue';
  }

  const isHomeScene =
    state.phase === 'home' ||
    (state.phase === 'dialogue' && storyScene === 'home') ||
    (state.mapId === 'greenhouse' && state.phase !== 'explore');

  if (isHomeScene) {
    if (
      (state.phase === 'home' || (state.mapId === 'greenhouse' && state.phase !== 'dialogue')) &&
      homeBgm !== 'auto' &&
      isHomeBgmUnlocked(homeBgm, state)
    ) {
      return homeBgm;
    }
    return homeStage(state) >= 3 ? 'home_warm' : 'home_early';
  }

  if (state.mapId === 'warehouse' || state.chapterId === 'finale') return 'warehouse';
  if (state.mapId === 'tunnel' || state.chapterId === 'rescue') return 'tunnel';
  if (state.mapId === 'market' || state.chapterId === 'market') return 'market';
  return 'alley';
}

export function resolveSceneAmbient({
  entered,
  state,
  bgm,
}: {
  entered: boolean;
  state: GameState | null | undefined;
  bgm: BgmMode;
}): AmbientMode {
  if (!entered || !state || state.phase !== 'explore' || bgm === 'lottery') return null;
  if (state.mapId === 'alley') return 'rain';
  if (state.mapId === 'market') return 'market';
  return null;
}
