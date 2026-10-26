/** Battle-owned contract. The host maps its public API state to this boundary. */
export type BattleDifficulty = 'low' | 'medium' | 'high';
export type BasicSupplyId = 'warm-can' | 'bouncy-treat';
/** Prologue-only additions to its teaching 2-can / 1-treat baseline, not a persistent inventory.
 * Later chapters have no free baseline and need their own full warehouse loadout contract. */
export type ExtraSupplies = Partial<Record<BasicSupplyId, number>>;

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
  extraSupplies?: ExtraSupplies;
  attempt: BattleAttempt;
  stage: BattleStage;
  catIds: string[];
  /** Diagnostic source tags only; they do not change difficulty. */
  modifiers: string[];
}

export interface BattleResult {attemptId: string; outcome: 'won' | 'lost'}

/** Prologue-only effective use of the host's extras, after teaching supplies and checkpoint rollbacks. */
export interface BattleSupplyUsage {usedExtras: Record<BasicSupplyId, number>}

export interface BattleModule {
  start(context: BattleContext, complete: (result: BattleResult) => void): void;
  pause(paused: boolean): void;
  stop(): void;
}
