import type {Catalog, GameState} from '../../contracts';
import {CONFIG} from './l00/config';
import type {BattleContext} from './l00/types';

/** The host owns attempts and persistence; this adapter only routes the fixed L00 module. */
export function createL00Context(
  state: Pick<GameState, 'phase' | 'activeBattle' | 'cats'>,
  catalog: Pick<Catalog, 'stages'>,
): BattleContext {
  const attempt = state.activeBattle;
  if (state.phase !== 'battle' || !attempt?.id.trim() || attempt.status !== 'active') {
    throw new Error('没有可进入的进行中战斗。');
  }
  if (attempt.stageId !== 'alley_rescue') throw new Error('这个关卡的战斗尚未开放。');
  const stage = catalog.stages.find(candidate => candidate.id === attempt.stageId);
  if (!stage || stage.lanes !== CONFIG.ROWS || stage.columns !== CONFIG.COLUMNS || stage.waves !== CONFIG.TOTAL_WAVES) {
    throw new Error('关卡配置需要更新，请重新连接游戏后再试。');
  }
  return {
    attempt: {id: attempt.id, stageId: attempt.stageId, status: attempt.status},
    stage: {...stage},
    catIds: [...state.cats],
    // Events determine the tier; the host will map the saved event output to low/medium/high.
    // That mapping and the loadout integration are pending, so keep medium compatibility for now.
    difficulty: 'medium',
    modifiers: [],
    extraSupplies: {},
  };
}
