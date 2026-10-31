import type {GameState} from '../../contracts';
import type {CatBreed} from '../../adapters/canvas/pixelCat';

export const HOME_SIZE = {width: 1672, height: 941} as const;
export const HOME_LAYOUT_ID = 'arched-greenhouse-modular-v1';
export type HomePoint = {x: number; y: number};
export const HOME_SLOTS: Readonly<Record<string, HomePoint>> = {
  lounge:{x:600,y:538},desk:{x:820,y:375},cabinet:{x:555,y:373},planter:{x:1315,y:392},wall_clock:{x:1170,y:305},toy_corner:{x:980,y:672},reading_stool:{x:690,y:678},
  corner: {x: 254, y: 382}, window: {x: 1400, y: 618},
  courtyard: {x: 1255, y: 700}, beam: {x: 280, y: 640}, sun_spot: {x: 1050, y: 585},
};
export const HOME_RESIDENTS: Record<CatBreed, HomePoint> = {
  miaomiao: {x: 730, y: 510}, tuanzi: {x: 850, y: 540},
  diandian: {x: 1030, y: 530}, momo: {x: 1170, y: 440},
};
export const HOME_ROAM_NODES: readonly HomePoint[] = [
  {x: 540, y: 460}, {x: 630, y: 610}, {x: 820, y: 660},
  {x: 1170, y: 630}, {x: 1240, y: 470}, {x: 760, y: 430}, {x: 1030, y: 450},
];
export const HOME_SHELTER_NODES: readonly HomePoint[] = [
  {x: 280, y: 422}, {x: 356, y: 436}, {x: 315, y: 470},
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
