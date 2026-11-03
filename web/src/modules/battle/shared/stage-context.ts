import type {Catalog, GameState} from '../../../contracts';
import {difficultyFromPressure} from '../host-context';

interface StageDefinition {
  stageIds: readonly string[];
  name: string;
  columns: number;
  rows: number;
  waves: number;
}

/** Validate the persisted attempt without rerolling its difficulty or event carry. */
export function createStageContext(
  state: Pick<GameState, 'phase' | 'activeBattle'>,
  catalog: Pick<Catalog, 'stages'>,
  definition: StageDefinition,
) {
  const attempt = state.activeBattle;
  if (state.phase !== 'battle' || !attempt?.id.trim() || attempt.status !== 'active' || !definition.stageIds.includes(attempt.stageId)) {
    throw new Error(`没有可进入的${definition.name}战斗。`);
  }
  const stage = catalog.stages.find(value => value.id === attempt.stageId);
  if (!stage || stage.columns !== definition.columns || stage.lanes !== definition.rows || stage.waves !== definition.waves) {
    throw new Error(`${definition.name}关卡配置需要更新，请重新连接后再试。`);
  }
  // Preserve unknown legacy carry values so the engine can show a non-blocking warning.
  const carry: unknown = attempt.modifiers?.carry;
  return {
    attemptId: attempt.id,
    difficulty: difficultyFromPressure(attempt.modifiers?.shadowPressure),
    ...(carry === undefined ? {} : {carry}),
  };
}
