import type {Catalog, GameState} from '../../contracts';
import {difficultyFromPressure} from './host-context';
import {MAP, WAVES} from './greenhouse/config';

/** Catalog dimensions describe the bounding box; the engine owns the 34-cell outline. */
export function createGreenhouseContext(state: Pick<GameState, 'phase' | 'activeBattle'>, catalog: Pick<Catalog, 'stages'>) {
  const attempt = state.activeBattle;
  if (state.phase !== 'battle' || !attempt?.id.trim() || attempt.status !== 'active' || attempt.stageId !== 'greenhouse_boss') {
    throw new Error('没有可进入的废弃花房战斗。');
  }
  const stage = catalog.stages.find(value => value.id === attempt.stageId);
  if (!stage || stage.columns !== MAP.columns || stage.lanes !== MAP.rows || stage.waves !== WAVES.length) {
    throw new Error('废弃花房关卡配置需要更新，请重新连接后再试。');
  }
  // Carry belongs to this persisted attempt, including an unknown legacy value for a non-blocking warning.
  const carry: unknown = attempt.modifiers?.carry;
  return {attemptId: attempt.id, difficulty: difficultyFromPressure(attempt.modifiers?.shadowPressure), ...(carry === undefined ? {} : {carry})};
}
