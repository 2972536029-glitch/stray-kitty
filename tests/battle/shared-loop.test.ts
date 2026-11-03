import assert from 'node:assert/strict';
import test from 'node:test';
import type {TestContext} from 'node:test';
import {startBattleLoop} from '../../web/src/modules/battle/shared/useBattleLoop.ts';
import type {BattleLoopOptions} from '../../web/src/modules/battle/shared/useBattleLoop.ts';

function browser(t: TestContext) {
  let now = 0, nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const visibility = Object.assign(new EventTarget(), {hidden: false});
  const globals = {
    document: visibility,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callbacks.set(++nextId, callback);
      return nextId;
    },
    cancelAnimationFrame: (id: number) => callbacks.delete(id),
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {configurable: true, value});
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  t.mock.method(performance, 'now', () => now);
  return {
    callbacks,
    frame(time: number) {
      now = time;
      const [id, callback] = callbacks.entries().next().value!;
      callbacks.delete(id);
      callback(time);
    },
    visibility(hidden: boolean, time: number) {
      now = time;
      visibility.hidden = hidden;
      visibility.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

function scene() {
  const initial = {externallyPaused: false, uiPaused: false, boss: {slams: 0}, elapsed: 0};
  const renders: number[] = [], hidden: boolean[] = [], deltas: number[] = [];
  const paintings: {selected: string | null; hover: {x: number; y: number} | null}[] = [];
  const options: BattleLoopOptions<typeof initial, string> = {
    gameRef: {current: initial}, canvasRef: {current: {getContext: () => ({})} as unknown as HTMLCanvasElement},
    boardRef: {current: null}, paused: false, uiPaused: false, selected: null, hover: null,
    dispatch: (state, action) => ({...state,
      [action.type === 'SET_EXTERNAL_PAUSE' ? 'externallyPaused' : 'uiPaused']: action.paused}),
    advance: (state, dt) => {
      deltas.push(dt);
      return state.externallyPaused || state.uiPaused ? state : {...state, elapsed: state.elapsed + dt};
    },
    paint: (_context, _state, selected, hover) => paintings.push({selected, hover}),
    setGame: state => renders.push(state.elapsed),
    setHidden: value => hidden.push(value),
  };
  return {options, renders, hidden, deltas, paintings};
}

test('shared loop reads current selection and attempt state, caps time steps and throttles UI publication', t => {
  let stop = () => {};
  t.after(() => stop());
  const env = browser(t), battle = scene();
  let options = battle.options;
  stop = startBattleLoop(() => options);

  env.frame(20);
  assert.equal(battle.renders.length, 0);
  options = {...options, selected: 'guard', hover: {x: 2, y: 3}};
  env.frame(60);
  assert.deepEqual(battle.paintings.at(-1), {selected: 'guard', hover: {x: 2, y: 3}});
  assert.equal(battle.renders.length, 1);

  env.frame(5000);
  assert.equal(battle.deltas.at(-1), 1, 'long frame gaps cannot advance over one second at once');
  options.gameRef.current = {...options.gameRef.current, elapsed: 0};
  env.frame(5100);
  assert.equal(options.gameRef.current.elapsed, .1, 'a replacement attempt is used by the existing loop');
  assert.equal(env.callbacks.size, 1, 'render changes do not create additional loops');
});

test('shared loop combines host, UI and visibility pauses, resets hidden time and cleans up on unmount', t => {
  let stop = () => {};
  t.after(() => stop());
  const env = browser(t), battle = scene(), options = battle.options;
  stop = startBattleLoop(() => options);
  env.frame(100);
  assert.equal(options.gameRef.current.elapsed, .1);

  env.visibility(true, 1000);
  assert.equal(options.gameRef.current.externallyPaused, true);
  assert.deepEqual(battle.hidden, [true]);
  assert.equal(battle.renders.at(-1), .1, 'visibility publishes the pause immediately');
  env.frame(5000);
  assert.equal(options.gameRef.current.elapsed, .1);

  options.paused = true;
  env.visibility(false, 10000);
  assert.equal(options.gameRef.current.externallyPaused, true, 'showing the tab must preserve a host pause');
  options.paused = false;
  env.frame(10050);
  assert.equal(battle.deltas.at(-1), .05, 'hidden time is discarded');
  assert.ok(Math.abs(options.gameRef.current.elapsed - .15) < 1e-9);

  options.uiPaused = true;
  env.frame(10100);
  assert.equal(options.gameRef.current.uiPaused, true);
  assert.ok(Math.abs(options.gameRef.current.elapsed - .15) < 1e-9);
  options.uiPaused = false;
  env.frame(10150);
  assert.equal(options.gameRef.current.elapsed, .2);

  const pending = env.callbacks.values().next().value!;
  const elapsed = options.gameRef.current.elapsed, publications = battle.renders.length;
  stop();
  assert.equal(env.callbacks.size, 0);
  env.visibility(true, 20000);
  pending(20050);
  assert.equal(options.gameRef.current.elapsed, elapsed);
  assert.equal(battle.renders.length, publications);
  assert.deepEqual(battle.hidden, [true, false], 'unmounted loops no longer observe the document');
});
