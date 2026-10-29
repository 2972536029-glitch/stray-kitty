import type {GameState, StoryNode} from '../../contracts';
import {breeds, type CatBreed} from '../../adapters/canvas/pixelCat';
import {HOME_RESIDENTS, type HomePoint} from './layout';

export interface HomeStoryActor {
  breed: CatBreed;
  at: HomePoint;
  from?: HomePoint;
  jump?: number;
}
export interface HomeStoryBeat {
  id: string;
  actors: HomeStoryActor[];
  speaker?: CatBreed;
  duration: number;
  lookAt?: HomePoint;
}
const speakers: Record<string, CatBreed> = {喵喵: 'miaomiao', 团子: 'tuanzi', 点点: 'diandian', 墨墨: 'momo'};

// Story nodes own casting and blocking. Furniture preferences and wandering only
// apply after the server exits dialogue; no narrative progress is advanced here.
export function homeStoryBeat(state: Pick<GameState, 'phase' | 'mapId' | 'cats' | 'storyNodeId' | 'chapterId'>, node?: StoryNode): HomeStoryBeat | null {
  if (state.phase !== 'dialogue' || state.chapterId === 'prologue') return null;
  if (node?.scene !== 'home' && !(node?.scene === undefined && state.mapId === 'greenhouse')) return null;
  const id = node?.id ?? state.storyNodeId;
  const cats = state.cats.filter((cat): cat is CatBreed => cat in breeds);
  const positions: Record<CatBreed, HomePoint> = {
    miaomiao: {x: 820, y: 510}, tuanzi: {x: 685, y: 500},
    diandian: {x: 975, y: 510}, momo: {x: 1110, y: 420},
  };
  let duration = 650, lookAt: HomePoint | undefined;
  let momoFrom: HomePoint | undefined, jump: number | undefined;
  if (id.startsWith('greenhouse_intro_')) {
    const step = Number(id.slice('greenhouse_intro_'.length));
    // 墨墨 is staged on the beam before recruitment, then lands when named.
    // This cast belongs to the cutscene and never changes state.cats.
    if (step >= 3 && !cats.includes('momo')) cats.push('momo');
    if (step < 3) {
      const index = cats.indexOf('momo');
      if (index >= 0) cats.splice(index, 1);
    }
    if (step === 2) {positions.diandian = {x: 975, y: 470}; lookAt = {x: 1100, y: 255};}
    if (step === 3) {momoFrom = {x: 1100, y: 280}; jump = 92; duration = 1000;}
    if (step >= 4 && step <= 6) lookAt = positions.momo;
    if (step === 7) {
      positions.tuanzi = {x: 765, y: 408};
      positions.diandian = {x: 1240, y: 618};
      positions.momo = {x: 1080, y: 410};
      duration = 1300;
    }
  } else if (id.startsWith('finale_intro_')) {
    positions.miaomiao = {x: 820, y: 550};
    positions.tuanzi = {x: 960, y: 550};
    positions.diandian = {x: 1080, y: 515};
    positions.momo = {x: 700, y: 500};
    if (id === 'finale_intro_8') positions.tuanzi = {x: 900, y: 550};
    if (id === 'finale_intro_9') {positions.miaomiao = {x: 820, y: 778}; duration = 1700;}
  }
  return {
    id, duration, speaker: node ? speakers[node.speaker] : undefined, lookAt,
    actors: cats.map(breed => ({breed, at: positions[breed] ?? HOME_RESIDENTS[breed],
      ...(breed === 'momo' && momoFrom ? {from: momoFrom, jump} : {})})),
  };
}

export function storyActorPosition(actor: HomeStoryActor, from: HomePoint, elapsed: number, duration: number): HomePoint & {height: number; moving: boolean} {
  const t = Math.max(0, Math.min(1, elapsed / Math.max(1, duration)));
  const ease = t * t * (3 - 2 * t);
  return {
    x: from.x + (actor.at.x - from.x) * ease,
    y: from.y + (actor.at.y - from.y) * ease,
    height: Math.sin(t * Math.PI) * (actor.jump ?? 0),
    moving: t < 1 && Math.hypot(from.x - actor.at.x, from.y - actor.at.y) > 1,
  };
}
