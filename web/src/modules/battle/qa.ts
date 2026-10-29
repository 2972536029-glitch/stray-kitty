import type {BattleAttempt, GameCommand} from '../../contracts';

/** Build the server-gated QA command; the server routes it through normal completion validation. */
export function simulateVictoryCommand(attempt: BattleAttempt, configuredStages: readonly string[]): GameCommand | null {
  if (attempt.status !== 'active' || !configuredStages.includes(attempt.stageId)) return null;
  return {type: 'QA_SIMULATE_VICTORY', attemptId: attempt.id};
}
