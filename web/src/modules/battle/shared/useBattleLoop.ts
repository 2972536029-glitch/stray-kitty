import {useEffect, useRef} from 'react';
import {triggerBossSkillShake} from '../battleFx';

interface Position {x: number; y: number}
interface LoopState {
  externallyPaused: boolean;
  uiPaused: boolean;
  boss: {slams: number};
}
type PauseAction = {type: 'SET_EXTERNAL_PAUSE' | 'SET_UI_PAUSE'; paused: boolean};

export interface BattleLoopOptions<State extends LoopState, CatId extends string> {
  gameRef: {current: State};
  canvasRef: {current: HTMLCanvasElement | null};
  boardRef: {current: HTMLDivElement | null};
  paused: boolean;
  uiPaused: boolean;
  selected: CatId | null;
  hover: Position | null;
  dispatch: (state: State, action: PauseAction) => State;
  advance: (state: State, seconds: number) => State;
  paint: (context: CanvasRenderingContext2D, state: State, selected: CatId | null, hover: Position | null) => void;
  setGame: (state: State) => void;
  setHidden: (hidden: boolean) => void;
}

/** Run one chapter simulation. Attempts replace gameRef.current without restarting the clock. */
export function startBattleLoop<State extends LoopState, CatId extends string>(
  getOptions: () => BattleLoopOptions<State, CatId>,
): () => void {
  let stopped = false, handle = 0, last = performance.now(), lastRender = 0;
  const visibility = () => {
    const options = getOptions();
    last = performance.now();
    options.setHidden(document.hidden);
    const next = options.dispatch(options.gameRef.current, {
      type: 'SET_EXTERNAL_PAUSE', paused: options.paused || document.hidden,
    });
    options.gameRef.current = next;
    options.setGame(next);
  };
  const frame = (time: number) => {
    if (stopped) return;
    const options = getOptions();
    const dt = Math.max(0, Math.min(1, (time - last) / 1000));
    last = time;
    let current = options.gameRef.current;
    const frozen = options.paused || document.hidden;
    if (current.externallyPaused !== frozen) {
      current = options.dispatch(current, {type: 'SET_EXTERNAL_PAUSE', paused: frozen});
    }
    if (current.uiPaused !== options.uiPaused) {
      current = options.dispatch(current, {type: 'SET_UI_PAUSE', paused: options.uiPaused});
    }
    const previousBossSkills = current.boss.slams;
    current = options.advance(current, dt);
    options.gameRef.current = current;
    triggerBossSkillShake(options.boardRef.current, previousBossSkills, current.boss.slams);
    const context = options.canvasRef.current?.getContext('2d');
    if (context) options.paint(context, current, options.selected, options.hover);
    if (time - lastRender >= 50) {
      options.setGame(current);
      lastRender = time;
    }
    handle = requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', visibility);
  handle = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
    document.removeEventListener('visibilitychange', visibility);
  };
}

/** Keep one RAF subscription while painting and pausing with the latest React values. */
export function useBattleLoop<State extends LoopState, CatId extends string>(options: BattleLoopOptions<State, CatId>): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => startBattleLoop(() => optionsRef.current), []);
}
