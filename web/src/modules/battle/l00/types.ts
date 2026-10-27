/** Battle-owned contract. The host maps its public API state to this boundary. */
export type BattleDifficulty = 'low' | 'medium' | 'high';
export interface BattleAttempt {
  id: string;
  stageId: string;
  status: 'active' | 'won' | 'lost';
}

export interface BattleStage {
  id: string;
  name: string;
  status: string;
  lanes: number;
  columns: number;
  waves: number;
}

export interface BattleContext {
  /** Selected before the attempt starts. Omission defaults to medium. */
  difficulty?: BattleDifficulty;
  attempt: BattleAttempt;
  stage: BattleStage;
  catIds: string[];
  /** Diagnostic source tags only; they do not change difficulty. */
  modifiers: string[];
}

export interface BattleResult {attemptId: string; outcome: 'won' | 'lost'}

export interface BattleModule {
  start(context: BattleContext, complete: (result: BattleResult) => void): void;
  pause(paused: boolean): void;
  stop(): void;
}
