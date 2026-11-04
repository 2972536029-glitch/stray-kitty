import type {Catalog, GameState} from '../../contracts';
import {createStageContext} from './shared/stage-context';
import {MAP, WAVES} from './tunnel/config';

export function createTunnelContext(state: Pick<GameState, 'phase' | 'activeBattle'>, catalog: Pick<Catalog, 'stages'>) {
  return createStageContext(state, catalog, {
    stageIds: ['tunnel_boss'], name: '地下通道',
    columns: MAP.columns, rows: MAP.rows, waves: WAVES.length,
  });
}
