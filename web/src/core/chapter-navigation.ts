import type {GameCommand, GamePhase, GameState} from '../contracts';

export type ChapterMapId = 'alley' | 'market' | 'tunnel' | 'greenhouse' | 'warehouse';
export type ChapterMapRoute = {
  mapId: ChapterMapId;
  chapterId: string;
  scene: 'alley' | 'market' | 'tunnel' | null;
  availability: 'exploration' | 'story-and-trial';
};

// This registry names the exploration scenes that are actually wired into the game.
export const CHAPTER_MAP_ROUTES: Record<ChapterMapId, ChapterMapRoute> = {
  alley: {mapId: 'alley', chapterId: 'alley', scene: 'alley', availability: 'exploration'},
  market: {mapId: 'market', chapterId: 'market', scene: 'market', availability: 'exploration'},
  tunnel: {mapId: 'tunnel', chapterId: 'rescue', scene: 'tunnel', availability: 'exploration'},
  greenhouse: {mapId: 'greenhouse', chapterId: 'greenhouse', scene: null, availability: 'story-and-trial'},
  warehouse: {mapId: 'warehouse', chapterId: 'finale', scene: null, availability: 'story-and-trial'},
};

export function explorationScene(mapId: string) {
  return Object.hasOwn(CHAPTER_MAP_ROUTES, mapId) ? CHAPTER_MAP_ROUTES[mapId as ChapterMapId].scene : null;
}

export function chapterExploreCommand(mapId: 'alley' | 'market' | 'tunnel'): GameCommand {
  return {type: 'GO_EXPLORE', mapId};
}

const STORY_ENTRY_BY_CHAPTER = {
  alley: 'chapter1_intro',
  market: 'market_intro_1',
  greenhouse: 'greenhouse_intro_1',
  rescue: 'rescue_intro_1',
  finale: 'finale_intro_1',
} as const;

export function chapterStoryCommand(chapterId: keyof typeof STORY_ENTRY_BY_CHAPTER): GameCommand {
  return {type: 'START_STORY', nodeId: STORY_ENTRY_BY_CHAPTER[chapterId]};
}

export function chapterMapIsUnlocked(mapId: string, state: Pick<GameState, 'flags'> & {inventory?: GameState['inventory']}): boolean {
  if (mapId === 'alley') return true;
  if (mapId === 'market') return state.flags.includes('chapter_2_started');
  if (mapId === 'tunnel') return state.flags.includes('greenhouse_fortified');
  if (mapId === 'greenhouse') return state.flags.includes('market_cleared') && state.flags.includes('market_exit_crossed');
  if (mapId === 'warehouse') return state.flags.includes('tunnel_explored') && state.flags.includes('cats_rescued_batch1') && (state.inventory?.clue ?? 0) >= 3;
  return false;
}

export function chapterMapCommand(mapId: string, state: Pick<GameState, 'phase' | 'mapId' | 'flags'> & {inventory?: GameState['inventory']}): GameCommand | null {
  if (!Object.hasOwn(CHAPTER_MAP_ROUTES, mapId)) return null;
  if (state.phase !== 'home' && state.phase !== 'explore') return null;
  if (state.phase === 'explore' && state.mapId === mapId) return null;
  if (!chapterMapIsUnlocked(mapId, state)) return null;
  if (mapId === 'greenhouse') return chapterStoryCommand('greenhouse');
  if (mapId === 'warehouse') return chapterStoryCommand('finale');
  return chapterExploreCommand(mapId as 'alley' | 'market' | 'tunnel');
}

export function chapterMapStatus(mapId: string, current: boolean, state: Pick<GameState, 'flags'>): string {
  if (current) return '你在这里';
  if (mapId === 'greenhouse') return '第三章剧情与独立战斗试玩；探索地图尚未开放';
  if (mapId === 'warehouse') return '终章剧情与战斗试玩；探索地图尚未开放';
  if (mapId === 'market') return chapterMapIsUnlocked(mapId, state) ? '已解锁，可探索' : '在花房开启第二章剧情后开放';
  if (mapId === 'tunnel') return chapterMapIsUnlocked(mapId, state) ? '已解锁，可探索' : '完成第三章后开放';
  return '可探索';
}

export function chapterPhaseForCommand(command: GameCommand): GamePhase | null {
  if (command.type === 'GO_EXPLORE') return 'explore';
  if (command.type === 'START_STORY') return 'dialogue';
  if (command.type === 'GO_HOME') return 'home';
  if (command.type === 'START_BATTLE') return 'preparation';
  return null;
}
