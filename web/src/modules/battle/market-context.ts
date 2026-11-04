import type {Catalog, GameState} from '../../contracts';
import {createStageContext} from './shared/stage-context';
import {MAP, WAVES} from './market/config';

export function createMarketContext(state: Pick<GameState, 'phase' | 'activeBattle'>, catalog: Pick<Catalog, 'stages'>) {
  return createStageContext(state, catalog, {
    stageIds: ['market_boss'], name: '午夜集市',
    columns: MAP.columns, rows: MAP.rows, waves: WAVES.length,
  });
}
