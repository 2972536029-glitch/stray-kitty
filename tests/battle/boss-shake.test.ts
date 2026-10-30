import assert from 'node:assert/strict';
import test from 'node:test';
import {triggerBossSkillShake} from '../../web/src/modules/battle/battleFx.ts';
import {advanceChapter, createChapterBattle, dispatchChapter} from '../../web/src/modules/battle/chapter/engine.ts';
import {advanceMarket, createMarketBattle, dispatchMarket} from '../../web/src/modules/battle/market/engine.ts';
import {advanceGreenhouse, createGreenhouseBattle, dispatchGreenhouse} from '../../web/src/modules/battle/greenhouse/engine.ts';
import {advanceTunnel, createTunnelBattle, dispatchTunnel} from '../../web/src/modules/battle/tunnel/engine.ts';
import {advanceFinale, createFinaleBattle, dispatchFinale} from '../../web/src/modules/battle/finale/engine.ts';

function board() {
  const classes = new Set<string>();
  let shakes = 0;
  const events = new Map<string, Set<(event: AnimationEvent) => void>>();
  const element = {
    classList: {
      add(value: string) { classes.add(value); shakes++; },
      remove(value: string) { classes.delete(value); },
    },
    offsetWidth: 800,
    addEventListener(name: string, listener: (event: AnimationEvent) => void) {
      const listeners = events.get(name) ?? new Set();
      listeners.add(listener); events.set(name, listeners);
    },
    removeEventListener(name: string, listener: (event: AnimationEvent) => void) { events.get(name)?.delete(listener); },
  } as unknown as HTMLElement;
  return {element, classes, get shakes() {return shakes;}, finish(animationName: string, target = element) {
    for (const listener of events.get('animationend') ?? []) listener({animationName, target} as unknown as AnimationEvent);
  }};
}

interface BossScene {
  paused: boolean;
  boss: {x: number; y: number; cooldown: number; skillCooldown: number; attacks: number; slams: number; phase: string};
  cats: {id: string; x: number; y: number; hp: number; cooldown: number}[];
}

function verifyChapter<T extends BossScene>(name: string, start: () => T, advance: (state: T, seconds: number) => T) {
  test(`${name}: only the boss skill impact shakes; basic attacks, windup, pause and reset stay still`, () => {
    let state = start();
    for (const cat of state.cats) cat.cooldown = 999;
    const guard = state.cats.find(cat => cat.id === 'guard')!;
    guard.x = state.boss.x - 1; guard.y = state.boss.y;
    state.boss.cooldown = 0; state.boss.skillCooldown = 999;
    const visual = board();
    function frame(seconds: number) {
      const before = state.boss.slams;
      state = advance(state, seconds);
      triggerBossSkillShake(visual.element, before, state.boss.slams);
    }

    frame(.1);
    assert.ok(state.boss.attacks > 0, 'exercise a real boss basic attack');
    assert.equal(visual.shakes, 0);

    state.boss.cooldown = 999; state.boss.skillCooldown = 0;
    frame(.1);
    assert.equal(state.boss.phase, 'windup');
    assert.equal(visual.shakes, 0, 'the warning itself must not shake');

    state.paused = true;
    frame(10);
    assert.equal(state.boss.slams, 0);
    assert.equal(visual.shakes, 0, 'paused windup does not fire');
    state.paused = false;
    frame(3.1);
    assert.equal(state.boss.slams, 1, 'exercise the actual chapter skill execution');
    assert.equal(visual.shakes, 1);
    assert.ok(visual.classes.has('fx-shake-strong'));

    frame(.05);
    assert.equal(visual.shakes, 1, 'subsequent frames do not replay the impact');
    state.paused = true;
    frame(10);
    assert.equal(visual.shakes, 1, 'pausing after impact does not replay it');
    triggerBossSkillShake(visual.element, state.boss.slams, start().boss.slams);
    assert.equal(visual.shakes, 1, 'restarting an attempt does not shake');
  });
}

verifyChapter('chapter 1', () => dispatchChapter(createChapterBattle(), {type: 'START'}), advanceChapter);
verifyChapter('chapter 2', () => dispatchMarket(createMarketBattle(), {type: 'START'}), advanceMarket);
verifyChapter('chapter 3', () => dispatchGreenhouse(createGreenhouseBattle(), {type: 'START'}), advanceGreenhouse);
verifyChapter('chapter 4', () => dispatchTunnel(createTunnelBattle(), {type: 'START'}), advanceTunnel);
verifyChapter('chapter 5', () => dispatchFinale(createFinaleBattle(), {type: 'START'}), advanceFinale);

test('boss shake cleans up only its own animation and honors reduced motion', () => {
  const visual = board();
  triggerBossSkillShake(visual.element, 0, 1);
  visual.finish('unrelated-animation');
  assert.ok(visual.classes.has('fx-shake-strong'));
  visual.finish('fx-screen-shake-strong', {} as HTMLElement);
  assert.ok(visual.classes.has('fx-shake-strong'));
  visual.finish('fx-screen-shake-strong');
  assert.equal(visual.classes.has('fx-shake-strong'), false);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  Object.defineProperty(globalThis, 'matchMedia', {configurable: true, value: () => ({matches: true})});
  try {
    triggerBossSkillShake(visual.element, 1, 2);
    assert.equal(visual.shakes, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'matchMedia', original);
    else Reflect.deleteProperty(globalThis, 'matchMedia');
  }
});
