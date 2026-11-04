const EPS = 1e-8;

interface BattleClockState {
  phase: 'ready' | 'battle' | 'won' | 'lost';
  paused: boolean; externallyPaused: boolean; uiPaused: boolean;
  aim: unknown; inspectedCatId: string | null;
  baseSpeed: 0.5 | 1 | 2; accumulator: number;
}

interface ClockRules {step: number; maxFrameSeconds: number}

export function getBattleSpeed(state: BattleClockState): number {
  if (state.phase !== 'battle' || state.paused || state.externallyPaused || state.uiPaused) return 0;
  if (state.aim) return 1;
  if (state.inspectedCatId) return 0.5;
  return state.baseSpeed;
}

/** Cap real frame time before scaling; chapter ticks consume only fixed simulation steps. */
export function advanceBattle<State extends BattleClockState>(
  state: State, seconds: number, rules: ClockRules, tick: (state: State, dt: number) => void,
): State {
  if (!Number.isFinite(seconds) || seconds <= 0 || getBattleSpeed(state) === 0) return state;
  const next = structuredClone(state);
  next.accumulator += Math.min(rules.maxFrameSeconds, seconds) * getBattleSpeed(state);
  while (next.accumulator + EPS >= rules.step && next.phase === 'battle') {
    next.accumulator = Math.max(0, next.accumulator - rules.step);
    tick(next, rules.step);
  }
  return next;
}
