import {buildModelAdvisorContext} from '../battle/advisor-context';
import type {ModelAdvisorRequest} from '../battle/model-advisor-client';

export type BattleAdvisorSnapshot = Parameters<typeof buildModelAdvisorContext>[1];

// Both the standalone battle hook and the shared advisor bridge use the same
// visible snapshot projection. Session lifecycle and local fallback stay with
// their callers; this function does not read game state or issue a request.
export function prepareBattleAdvisorRequest(
  scope: {attemptId: string; stageId: string},
  snapshot: BattleAdvisorSnapshot,
  question: string,
): Omit<ModelAdvisorRequest, 'history'> {
  return {
    attemptId: scope.attemptId,
    stageId: scope.stageId,
    question,
    context: buildModelAdvisorContext(scope.stageId, snapshot),
  };
}
