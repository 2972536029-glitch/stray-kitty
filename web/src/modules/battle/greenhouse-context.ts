import type {Catalog, GameState} from '../../contracts';
import {createStageContext} from './shared/stage-context';
import {MAP, WAVES} from './greenhouse/config';

export function createGreenhouseContext(state: Pick<GameState, 'phase' | 'activeBattle'>, catalog: Pick<Catalog, 'stages'>) {
  return createStageContext(state, catalog, {
    stageIds: ['greenhouse_boss'], name: '废弃花房',
    columns: MAP.columns, rows: MAP.rows, waves: WAVES.length,
  });
}
