import type {Catalog, GameState} from '../../contracts';
import {createStageContext} from './shared/stage-context';
import {MAP, WAVES} from './chapter/config';

export function createChapterContext(state: Pick<GameState, 'phase' | 'activeBattle'>, catalog: Pick<Catalog, 'stages'>) {
  return createStageContext(state, catalog, {
    stageIds: ['alley_rescue', 'alley_boss'], name: '第一章',
    columns: MAP.columns, rows: MAP.rows, waves: WAVES.length,
  });
}
