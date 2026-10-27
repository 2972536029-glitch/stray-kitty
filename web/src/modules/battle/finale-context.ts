import type {Catalog, GameState} from '../../contracts';
import {difficultyFromPressure} from './host-context';
import {MAP, WAVES} from './finale/config';

/** Catalog dimensions describe the bounding box; the engine owns the 74-cell outline. */
export function createFinaleContext(state: Pick<GameState, 'phase' | 'activeBattle'>, catalog: Pick<Catalog, 'stages'>) {
  const attempt = state.activeBattle;
  if (state.phase !== 'battle' || !attempt?.id.trim() || attempt.status !== 'active' || attempt.stageId !== 'finale_boss') {
    throw new Error('没有可进入的终章总仓库战斗。');
  }
  const stage = catalog.stages.find(value => value.id === attempt.stageId);
  if (!stage || stage.columns !== MAP.columns || stage.lanes !== MAP.rows || stage.waves !== WAVES.length) {
    throw new Error('终章总仓库关卡配置需要更新，请重新连接后再试。');
  }
  // Carry belongs to this persisted attempt, including an unknown legacy value for a non-blocking warning.
  const carry: unknown = attempt.modifiers?.carry;
  return {attemptId: attempt.id, difficulty: difficultyFromPressure(attempt.modifiers?.shadowPressure), ...(carry === undefined ? {} : {carry})};
}
