import type {BattleContext, BattleModule, BattleResult} from './types.ts';
import type {CombatAction, CombatOptions, CombatState} from './state.ts';
import {act, advanceGame, createGame} from './engine.ts';
import {CONFIG, normalizeDifficulty, createSupplyInventory} from './config.ts';

/** A battle-local adapter. The app owns the animation loop and persistent settlement. */
export class PrologueBattle implements BattleModule {
  private state: CombatState | null = null;
  private callback: ((result: BattleResult) => void) | null = null;
  private listeners = new Set<(state: CombatState | null) => void>();
  private settled = false;
  private externalPause = false;
  private attemptId: string | null = null;
  private readonly options: CombatOptions;

  constructor(options: CombatOptions = {}) {
    // Validate before cloning: structuredClone normalizes custom prototypes and drops symbol keys.
    createSupplyInventory(options.extraSupplies);
    this.options = structuredClone(options);
  }

  start(context: BattleContext, complete: (result: BattleResult) => void): void {
    const difficulty = normalizeDifficulty(context.difficulty);
    const extraSupplies = context.extraSupplies === undefined ? this.options.extraSupplies : context.extraSupplies;
    const inventory = createSupplyInventory(extraSupplies);
    if (this.state && this.attemptId === context.attempt.id && this.state.difficulty !== difficulty) {
      throw Object.assign(new Error('An existing battle attempt cannot change difficulty.'), {code: 'BATTLE_DIFFICULTY_LOCKED'});
    }
    if (this.state && this.attemptId === context.attempt.id && Object.entries(inventory).some(([id, count]) => this.state!.initialInventory[id] !== count)) {
      throw Object.assign(new Error('An existing battle attempt cannot change its supplies.'), {code: 'BATTLE_SUPPLIES_LOCKED'});
    }
    if (context.attempt.status !== 'active' || context.attempt.stageId !== context.stage.id || !context.attempt.id) {
      throw new Error('PrologueBattle requires an active attempt matching its stage.');
    }
    if (context.stage.lanes !== CONFIG.ROWS || context.stage.columns !== CONFIG.COLUMNS || context.stage.waves !== CONFIG.TOTAL_WAVES) {
      throw new Error(`Unsupported prologue stage: expected ${CONFIG.ROWS} lanes, ${CONFIG.COLUMNS} columns and ${CONFIG.TOTAL_WAVES} waves.`);
    }
    const nextState = {...createGame({...this.options, difficulty, extraSupplies}), attemptId: context.attempt.id, stageId: context.stage.id, sourceModifiers: [...context.modifiers]};
    this.callback = complete;
    this.attemptId = context.attempt.id;
    this.settled = false;
    this.externalPause = false;
    this.state = nextState;
    this.emit();
  }

  getSnapshot(): CombatState | null { return this.state; }

  subscribe(listener: (state: CombatState | null) => void): () => void {
    this.listeners.add(listener);
    return () => {this.listeners.delete(listener);};
  }

  pause(paused: boolean): void {
    if (!this.state || this.settled || this.externalPause === paused) return;
    this.externalPause = paused;
    this.state = {...this.state, externallyPaused: paused};
    this.emit();
  }

  dispatch(action: CombatAction): void {
    if (!this.state || this.settled || this.externalPause) return;
    const previous = this.state;
    const next = act(previous, action);
    this.state = {...next, attemptId: previous.attemptId, stageId: previous.stageId, sourceModifiers: previous.sourceModifiers, externallyPaused: false};
    this.emit();
  }

  tick(seconds: number): void {
    if (!this.state || this.settled || this.externalPause) return;
    const next = advanceGame(this.state, seconds);
    if (next === this.state) return;
    this.state = next;
    this.emit();
  }

  complete(): void {
    if (!this.state || this.settled || this.externalPause || !this.callback || !this.attemptId) return;
    if (this.state.phase !== 'won' && this.state.phase !== 'failed') return;
    this.settled = true;
    const complete = this.callback;
    this.callback = null;
    complete({attemptId: this.attemptId, outcome: this.state.phase === 'won' ? 'won' : 'lost'});
  }

  stop(): void {
    this.state = null;
    this.callback = null;
    this.attemptId = null;
    this.settled = true;
    this.externalPause = false;
    this.listeners.clear();
  }

  private emit(): void { for (const listener of this.listeners) listener(this.state); }
}
