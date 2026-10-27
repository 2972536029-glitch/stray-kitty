import type {Catalog, GameState} from '../../contracts';
import {difficultyFromPressure} from './host-context';
import {MAP, WAVES} from './chapter/config';

export function createChapterContext(state: Pick<GameState, 'phase' | 'activeBattle'>, catalog: Pick<Catalog, 'stages'>) {
  const attempt = state.activeBattle;
  if (state.phase !== 'battle' || !attempt?.id.trim() || attempt.status !== 'active' || !['alley_rescue', 'alley_boss'].includes(attempt.stageId)) {
    throw new Error('没有可进入的第一章战斗。');
  }
  const stage = catalog.stages.find(value => value.id === attempt.stageId);
  if (!stage || stage.columns !== MAP.columns || stage.lanes !== MAP.rows || stage.waves !== WAVES.length) {
    throw new Error('第一章关卡配置需要更新，请重新连接后再试。');
  }
  // Carry belongs to this persisted attempt, including an unknown legacy value for a non-blocking warning.
  const carry: unknown = attempt.modifiers?.carry;
  return {attemptId: attempt.id, difficulty: difficultyFromPressure(attempt.modifiers?.shadowPressure), ...(carry === undefined ? {} : {carry})};
}
