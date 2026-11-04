import type {Catalog, GameState} from '../../contracts';
import {createStageContext} from './shared/stage-context';
import {MAP, WAVES} from './finale/config';

export function createFinaleContext(state: Pick<GameState, 'phase' | 'activeBattle'>, catalog: Pick<Catalog, 'stages'>) {
  return createStageContext(state, catalog, {
    stageIds: ['finale_boss'], name: '终章总仓库',
    columns: MAP.columns, rows: MAP.rows, waves: WAVES.length,
  });
}
