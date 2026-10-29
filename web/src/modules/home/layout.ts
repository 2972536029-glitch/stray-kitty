import type {GameState} from '../../contracts';
import type {CatBreed} from '../../adapters/canvas/pixelCat';

export const HOME_SIZE = {width: 800, height: 480} as const;
export const HOME_LAYOUT_ID = 'greenhouse-homestead-v1';
export type HomePoint = {x: number; y: number};
export const HOME_SLOTS: Readonly<Record<string, HomePoint>> = {
  corner: {x: 204, y: 316}, window: {x: 520, y: 184},
  courtyard: {x: 664, y: 360}, beam: {x: 368, y: 168}, sun_spot: {x: 496, y: 316},
};
export const HOME_RESIDENTS: Record<CatBreed, HomePoint> = {
  miaomiao: {x: 320, y: 286}, tuanzi: {x: 400, y: 280},
  diandian: {x: 464, y: 300}, momo: {x: 536, y: 240},
};
export const HOME_ROAM_NODES: readonly HomePoint[] = [
  {x: 264, y: 256}, {x: 328, y: 336}, {x: 416, y: 344},
  {x: 536, y: 336}, {x: 536, y: 256}, {x: 352, y: 232}, {x: 448, y: 248},
];
export const HOME_SHELTER_NODES: readonly HomePoint[] = [
  {x: 240, y: 310}, {x: 268, y: 334}, {x: 224, y: 348},
];

export function homeStage(state: Pick<GameState, 'flags'> & Partial<Pick<GameState, 'phase' | 'storyNodeId'>>): number {
  // The celebration is visible while it is narrated; completion flags are still
  // committed by the existing server story flow, not by the canvas.
  if (state.phase === 'dialogue' && /^finale_intro_[789]$/.test(state.storyNodeId ?? '')) return 4;
  if (state.flags.some(flag => flag === 'finale_completed' || flag === 'kingdom_founded')) return 4;
  if (state.flags.includes('greenhouse_fortified_full')) return 3;
  if (state.flags.includes('greenhouse_sealed')) return 2;
  return 1;
}
