import test from 'node:test';
import assert from 'node:assert/strict';
import {PrologueBattle} from '../../web/src/modules/battle/l00/runtime.ts';
import {getBattleSpeed} from '../../web/src/modules/battle/l00/engine.ts';
import {CONFIG} from '../../web/src/modules/battle/l00/config.ts';
import {winRuntimeBattle} from './helpers.ts';
import type {BattleContext, BattleDifficulty, BattleResult} from '../../web/src/modules/battle/l00/types.ts';
import type {CombatAction, CombatState} from '../../web/src/modules/battle/l00/state.ts';

const context = (): BattleContext => ({
  attempt: {id: 'attempt-prologue-1', stageId: 'test-prologue', status: 'active'},
  stage: {id: 'test-prologue', name: '小巷', status: 'ready', lanes: 3, columns: 7, waves: CONFIG.TOTAL_WAVES},
  catIds: ['miaomiao'], modifiers: ['event_success'],
});
const snapshot = (battle: PrologueBattle): CombatState => {const state = battle.getSnapshot(); assert.ok(state); return state;};
function until(battle: PrologueBattle, predicate: (state: CombatState) => boolean): CombatState {
  for (let step = 0; step < 2400 && !predicate(snapshot(battle)); step++) battle.tick(0.1);
  const state = snapshot(battle); assert.ok(predicate(state), `stalled at ${state.phase}`); return state;
}
const guide: CombatAction[] = [
  {type: 'OPEN_BAG'}, {type: 'SELECT_ITEM', itemId: 'warm-can'}, {type: 'SELECT_TARGET', catId: 'caster'},
  {type: 'DEPLOY_CAT', catId: 'caster', x: 3, y: 0}, {type: 'MOVE_CAT', catId: 'guard', x: 4, y: 1},
];
function teachEnergyItem(battle: PrologueBattle): void {
  until(battle, state => state.phase === 'teach_energy_item');
  battle.dispatch({type: 'OPEN_BAG'});
  battle.dispatch({type: 'SELECT_ITEM', itemId: 'bouncy-treat'});
  battle.dispatch({type: 'SELECT_TARGET', catId: 'caster'});
  assert.equal(snapshot(battle).phase, 'skill_charge');
}
function begin(battle: PrologueBattle): void {
  battle.dispatch({type: 'START'}); until(battle, state => state.phase === 'teach_bag');
  for (const action of guide) battle.dispatch(action);
  battle.dispatch({type: 'BEGIN_SKILL_PRACTICE'});
  teachEnergyItem(battle);
  until(battle, state => state.phase === 'teach_guard_skill');
  battle.dispatch({type: 'CAST_SKILL', catId: 'guard'});
  battle.dispatch({type: 'SELECT_SKILL', catId: 'caster'});
  battle.dispatch({type: 'AIM_SKILL', x: 5, y: 1});
  battle.dispatch({type: 'CAST_SKILL', catId: 'caster'});
  assert.equal(snapshot(battle).phase, 'battle');
}
function abandonLane(battle: PrologueBattle): void {
  battle.dispatch({type: 'MOVE_CAT', catId: 'guard', x: 0, y: 2});
  // Deliberately keep the ranged cat away from enemies using only legal player actions.
  for (let step = 0; step < 2400 && snapshot(battle).phase === 'battle'; step++) {
    const enemies = snapshot(battle).enemies;
    const distance = (x: number) => Math.min(...enemies.map(enemy => Math.hypot(enemy.x - x, enemy.y)));
    battle.dispatch({type: 'MOVE_CAT', catId: 'caster', x: distance(0) >= distance(5) ? 0 : 5, y: 0});
    battle.tick(0.1);
  }
}

test('runtime validates stage dimensions, waves, attempt status and stage match before starting', () => {
  const battle = new PrologueBattle();
  for (const changes of [{lanes: 4}, {columns: 5}, {waves: 2}, {waves: 9}, {waves: 11}]) {
    const input = context(); Object.assign(input.stage, changes);
    assert.throws(() => battle.start(input, () => {}), /Unsupported prologue stage/);
    assert.equal(battle.getSnapshot(), null);
  }
  const input = context(); input.attempt.status = 'won';
  assert.throws(() => battle.start(input, () => {}), /active attempt/);
  input.attempt.status = 'active'; input.attempt.stageId = 'other';
  assert.throws(() => battle.start(input, () => {}), /active attempt/);
});

test('runtime preserves incoming identifiers/modifiers without modifying shared context or persisting teaching supplies', () => {
  const battle = new PrologueBattle(); const input = context(); const before = structuredClone(input);
  battle.start(input, () => {});
  assert.equal(snapshot(battle).attemptId, input.attempt.id);
  assert.equal(snapshot(battle).stageId, input.stage.id);
  assert.deepEqual(snapshot(battle).sourceModifiers, ['event_success']);
  assert.notEqual(snapshot(battle).sourceModifiers, input.modifiers);
  assert.equal(snapshot(battle).effectivePressure, 0);
  begin(battle);
  assert.deepEqual(input, before);
  assert.equal(snapshot(battle).inventory['warm-can'], 2);
  battle.dispatch({type: 'RESTART'});
  assert.equal(snapshot(battle).attemptId, input.attempt.id);
  assert.deepEqual(snapshot(battle).sourceModifiers, ['event_success']);
});

test('external pause blocks ticks and every command and preserves independent manual pause', () => {
  const battle = new PrologueBattle(); battle.start(context(), () => {}); begin(battle);
  battle.dispatch({type: 'PAUSE'}); assert.equal(snapshot(battle).paused, true);
  battle.pause(true); const paused = snapshot(battle);
  for (const action of [{type: 'RESTART'}, {type: 'PAUSE'}, {type: 'OPEN_BAG'}, {type: 'MOVE_CAT', catId: 'guard', x: 5, y: 1}] as CombatAction[]) battle.dispatch(action);
  battle.tick(30); battle.complete(); assert.equal(snapshot(battle), paused);
  battle.pause(false); assert.equal(snapshot(battle).paused, true); assert.equal(snapshot(battle).externallyPaused, false);
  const time = snapshot(battle).time; battle.tick(1); assert.equal(snapshot(battle).time, time);
  battle.dispatch({type: 'PAUSE'}); battle.tick(0.1); assert.ok(snapshot(battle).time > time);
});

test('win completion is explicit, once only and uses the original attempt identifier', () => {
  const battle = new PrologueBattle(); const results: BattleResult[] = []; const input = context();
  battle.start(input, result => results.push(result));
  battle.complete(); assert.equal(results.length, 0);
  input.attempt.id = 'external-change'; begin(battle); winRuntimeBattle(battle);
  assert.equal(results.length, 0);
  battle.pause(true); battle.complete(); assert.equal(results.length, 0); battle.pause(false);
  battle.complete(); battle.complete();
  assert.deepEqual(results, [{attemptId: 'attempt-prologue-1', outcome: 'won'}]);
  const settled = snapshot(battle); battle.tick(10); battle.dispatch({type: 'RESTART'}); assert.equal(snapshot(battle), settled);
});

test('tutorial reform never settles and can continue to a successful completion', () => {
  const battle = new PrologueBattle(); const results: BattleResult[] = [];
  battle.start(context(), result => results.push(result)); begin(battle); abandonLane(battle);
  until(battle, state => state.phase === 'reform'); battle.complete(); assert.equal(results.length, 0);
  battle.dispatch({type: 'REFORM'}); winRuntimeBattle(battle); battle.complete();
  assert.deepEqual(results, [{attemptId: 'attempt-prologue-1', outcome: 'won'}]);
});

test('standard loss settles once as lost and cats remain alive', () => {
  const battle = new PrologueBattle({mode: 'standard'}); const results: BattleResult[] = [];
  battle.start(context(), result => results.push(result)); begin(battle); abandonLane(battle);
  const state = until(battle, current => current.phase === 'failed'); assert.ok(state.cats.every(cat => cat.hp > 0));
  battle.complete(); battle.complete(); assert.deepEqual(results, [{attemptId: 'attempt-prologue-1', outcome: 'lost'}]);
});

test('stop clears listeners, animation input, actions and completion; a fresh start has no stale callback', () => {
  const battle = new PrologueBattle(); let oldCalls = 0; let changes = 0;
  battle.subscribe(() => changes++); battle.start(context(), () => oldCalls++); battle.dispatch({type: 'START'});
  battle.stop(); const previousChanges = changes;
  battle.tick(30); battle.dispatch({type: 'START'}); battle.pause(true); battle.complete();
  assert.equal(battle.getSnapshot(), null); assert.equal(oldCalls, 0); assert.equal(changes, previousChanges);
  const next = context(); next.attempt.id = 'new-attempt'; const results: BattleResult[] = [];
  battle.start(next, result => results.push(result)); begin(battle); winRuntimeBattle(battle); battle.complete();
  assert.equal(changes, previousChanges); assert.equal(oldCalls, 0); assert.deepEqual(results, [{attemptId: 'new-attempt', outcome: 'won'}]);
});

test('unsubscribe removes only its listener and stopped runtime is initially inert', () => {
  const battle = new PrologueBattle(); let one = 0; let two = 0;
  battle.tick(5); battle.dispatch({type: 'START'}); battle.complete(); assert.equal(battle.getSnapshot(), null);
  const unsubscribe = battle.subscribe(() => one++); battle.subscribe(() => two++);
  battle.start(context(), () => {}); unsubscribe(); battle.dispatch({type: 'START'});
  assert.equal(one, 1); assert.equal(two, 2);
});

test('runtime uses the context difficulty, defaults omission to medium and retains it after restart', () => {
  const battle = new PrologueBattle({difficulty: 'high'});
  battle.start(context(), () => {});
  assert.equal(snapshot(battle).difficulty, 'medium');
  for (const difficulty of ['low', 'medium', 'high'] as const) {
    const input = {...context(), difficulty};
    input.attempt.id = `attempt-${difficulty}`;
    const before = structuredClone(input);
    battle.start(input, () => {});
    begin(battle);
    battle.dispatch({type: 'RESTART'});
    assert.equal(snapshot(battle).phase, 'ready');
    assert.equal(snapshot(battle).difficulty, difficulty);
    assert.equal(snapshot(battle).mode, 'tutorial');
    assert.equal(snapshot(battle).attemptId, input.attempt.id);
    assert.deepEqual(input, before);
  }
});

test('invalid difficulty cannot create partial state, notify listeners or replace a running attempt callback', () => {
  const battle = new PrologueBattle();
  let notifications = 0; let rejectedCalls = 0;
  battle.subscribe(() => notifications++);
  const invalidValues = [null, '', 0, 1, 2, false, 'hard', 'HIGH', 'low ', [], {}];
  const rejectStarts = () => {
    const previous = battle.getSnapshot();
    const previousNotifications = notifications;
    for (const difficulty of invalidValues) {
      const input = {...context(), difficulty: difficulty as BattleDifficulty};
      input.attempt.id = 'must-not-replace-original';
      assert.throws(() => battle.start(input, () => rejectedCalls++), {code: 'INVALID_BATTLE_DIFFICULTY'});
      assert.equal(battle.getSnapshot(), previous);
      assert.equal(notifications, previousNotifications);
    }
  };
  rejectStarts();
  assert.equal(battle.getSnapshot(), null);
  const results: BattleResult[] = [];
  battle.start({...context(), difficulty: 'high'}, result => results.push(result));
  begin(battle); battle.pause(true);
  rejectStarts();
  const paused = snapshot(battle);
  battle.tick(30); battle.dispatch({type: 'RESTART'}); battle.complete();
  assert.equal(snapshot(battle), paused);
  assert.equal(snapshot(battle).externallyPaused, true);
  battle.pause(false); winRuntimeBattle(battle); battle.complete();
  assert.deepEqual(results, [{attemptId: 'attempt-prologue-1', outcome: 'won'}]);
  rejectStarts();
  const settled = snapshot(battle);
  battle.complete(); battle.dispatch({type: 'RESTART'});
  assert.equal(snapshot(battle), settled);
  assert.equal(results.length, 1);
  assert.equal(rejectedCalls, 0);
});

test('an existing attempt locks difficulty across active, paused and settled states without replacing callbacks', () => {
  const battle = new PrologueBattle();
  const original = {...context(), difficulty: 'low' as const};
  const results: BattleResult[] = [];
  let rejectedCalls = 0; let notifications = 0;
  battle.subscribe(() => notifications++);
  battle.start(original, result => results.push(result));
  const rejectChanges = () => {
    const previous = snapshot(battle); const previousNotifications = notifications;
    for (const difficulty of ['medium', 'high'] as const) {
      assert.throws(() => battle.start({...original, difficulty}, () => rejectedCalls++), {code: 'BATTLE_DIFFICULTY_LOCKED'});
      assert.equal(snapshot(battle), previous);
      assert.equal(notifications, previousNotifications);
    }
  };
  begin(battle); rejectChanges();
  battle.pause(true); rejectChanges();
  const paused = snapshot(battle);
  battle.tick(10); battle.dispatch({type: 'RESTART'}); battle.complete();
  assert.equal(snapshot(battle), paused);
  battle.pause(false); winRuntimeBattle(battle); battle.complete();
  assert.deepEqual(results, [{attemptId: original.attempt.id, outcome: 'won'}]);
  rejectChanges();
  const settled = snapshot(battle);
  battle.complete(); battle.dispatch({type: 'RESTART'});
  assert.equal(snapshot(battle), settled);
  assert.equal(results.length, 1);
  assert.equal(rejectedCalls, 0);

  const next: BattleContext = {...original, difficulty: 'high', attempt: {...original.attempt, id: 'new-high-attempt'}};
  battle.start(next, result => results.push(result));
  assert.equal(snapshot(battle).difficulty, 'high');
  assert.equal(snapshot(battle).attemptId, next.attempt.id);
  assert.equal(snapshot(battle).phase, 'ready');
  begin(battle); winRuntimeBattle(battle); battle.complete();
  assert.deepEqual(results, [{attemptId: original.attempt.id, outcome: 'won'}, {attemptId: next.attempt.id, outcome: 'won'}]);
});

test('same-attempt same-difficulty start remains reusable and stop releases this runtime lock', () => {
  const battle = new PrologueBattle();
  const input = {...context(), difficulty: 'high' as const};
  let staleCalls = 0; const results: BattleResult[] = [];
  battle.start(input, () => staleCalls++); begin(battle);
  battle.start(input, result => results.push(result));
  assert.equal(snapshot(battle).phase, 'ready');
  assert.equal(snapshot(battle).difficulty, 'high');
  begin(battle); winRuntimeBattle(battle); battle.complete();
  assert.equal(staleCalls, 0);
  assert.deepEqual(results, [{attemptId: input.attempt.id, outcome: 'won'}]);
  battle.stop();
  battle.start({...input, difficulty: 'low'}, () => {});
  assert.equal(snapshot(battle).difficulty, 'low');
});

test('skill teaching and its paused aim never settle; external pause protects casting and a new attempt clears all skill state', () => {
  const battle = new PrologueBattle(); const results: BattleResult[] = [];
  battle.start(context(), result => results.push(result));
  battle.dispatch({type: 'START'}); until(battle, state => state.phase === 'teach_bag');
  for (const action of guide) battle.dispatch(action);
  assert.equal(snapshot(battle).phase, 'teach_energy'); battle.complete(); assert.equal(results.length, 0);
  battle.dispatch({type: 'BEGIN_SKILL_PRACTICE'});
  assert.equal(snapshot(battle).phase, 'skill_charge'); battle.complete(); assert.equal(results.length, 0);
  teachEnergyItem(battle);
  until(battle, state => state.phase === 'teach_guard_skill');
  battle.complete(); assert.equal(results.length, 0);
  battle.pause(true); const paused = snapshot(battle);
  battle.dispatch({type: 'CAST_SKILL', catId: 'guard'}); battle.tick(10); assert.equal(snapshot(battle), paused);
  battle.pause(false); battle.dispatch({type: 'CAST_SKILL', catId: 'guard'});
  assert.equal(snapshot(battle).phase, 'teach_caster_skill'); battle.complete(); assert.equal(results.length, 0);
  battle.dispatch({type: 'SELECT_SKILL', catId: 'caster'});
  battle.dispatch({type: 'AIM_SKILL', x: 5, y: 1});
  const aiming = snapshot(battle); battle.tick(10); assert.equal(snapshot(battle), aiming);
  battle.dispatch({type: 'CLEAR_SKILL_TARGET'});
  const cleared = snapshot(battle); assert.deepEqual(cleared.skillAim, {catId: 'caster', target: null});
  battle.tick(10); assert.equal(snapshot(battle), cleared);
  battle.dispatch({type: 'CAST_SKILL', catId: 'caster'}); assert.equal(snapshot(battle).lastAction!.ok, false);
  assert.equal(snapshot(battle).cats.find(cat => cat.id === 'caster')!.energy, 100);
  battle.dispatch({type: 'AIM_SKILL', x: 5, y: 1});
  battle.pause(true); const pausedAim = snapshot(battle);
  battle.dispatch({type: 'CAST_SKILL', catId: 'caster'}); battle.dispatch({type: 'CANCEL_SKILL'}); battle.dispatch({type: 'CLEAR_SKILL_TARGET'});
  battle.complete(); assert.equal(snapshot(battle), pausedAim); assert.equal(results.length, 0);
  const fresh = context(); fresh.attempt.id = 'new-skill-attempt';
  battle.start(fresh, result => results.push(result));
  assert.equal(snapshot(battle).skillAim, null); assert.equal(snapshot(battle).externallyPaused, false);
  assert.ok(snapshot(battle).cats.every(cat => cat.energy === 0 && cat.shield === 0 && cat.shieldRemaining === 0));
  begin(battle); winRuntimeBattle(battle); battle.complete(); battle.complete();
  assert.deepEqual(results, [{attemptId: fresh.attempt.id, outcome: 'won'}]);
});

test('runtime passes raw tick seconds to engine speed control and a new attempt resets speed and inspection', () => {
  const battle = new PrologueBattle(); const results: BattleResult[] = [];
  battle.start(context(), result => results.push(result)); begin(battle);
  battle.dispatch({type: 'SET_SPEED', speed: 2});
  const normal = snapshot(battle); battle.tick(0.5);
  assert.ok(Math.abs(snapshot(battle).time - normal.time - 1) < 1e-8);
  battle.dispatch({type: 'INSPECT_CAT', catId: 'caster'});
  const inspected = snapshot(battle); battle.tick(0.5);
  assert.ok(Math.abs(snapshot(battle).time - inspected.time - 0.25) < 1e-8);
  assert.equal(snapshot(battle).playbackSpeed, 2); assert.equal(getBattleSpeed(snapshot(battle)), 0.5);
  battle.dispatch({type: 'PAUSE'}); battle.dispatch({type: 'SET_SPEED', speed: 1});
  const manuallyPaused = snapshot(battle); battle.tick(10); assert.equal(snapshot(battle), manuallyPaused);
  battle.pause(true); const externallyPaused = snapshot(battle);
  battle.dispatch({type: 'CLOSE_INSPECTION'}); battle.dispatch({type: 'SET_SPEED', speed: 2}); battle.tick(10);
  assert.equal(snapshot(battle), externallyPaused);
  battle.pause(false); assert.equal(snapshot(battle).paused, true);
  const next = context(); next.attempt.id = 'attempt-speed-reset';
  battle.start(next, result => results.push(result));
  assert.equal(snapshot(battle).playbackSpeed, 1); assert.equal(snapshot(battle).inspectedCatId, null);
  assert.equal(snapshot(battle).skillAim, null); assert.equal(snapshot(battle).paused, false);
  assert.equal(results.length, 0);
});

test('runtime validates supply input before replacing state, callback, notifications or external pause', () => {
  const battle = new PrologueBattle(); let notifications = 0; let rejectedCalls = 0;
  battle.subscribe(() => notifications++);
  const invalidValues = [null, [], NaN, '1', true, new Date(), {'warm-can': -1}, {'warm-can': 1.5},
    {'warm-can': NaN}, {'warm-can': Infinity}, {'warm-can': 3}, {'bouncy-treat': 2}, {'other': 0}];
  const rejectStarts = () => {
    const previous = battle.getSnapshot(); const previousNotifications = notifications;
    for (const extraSupplies of invalidValues) {
      const input = {...context(), attempt: {...context().attempt, id: 'invalid-replacement'}, extraSupplies} as BattleContext;
      assert.throws(() => battle.start(input, () => rejectedCalls++), {code: 'INVALID_BATTLE_SUPPLIES'});
      assert.equal(battle.getSnapshot(), previous); assert.equal(notifications, previousNotifications);
    }
  };
  rejectStarts(); assert.equal(battle.getSnapshot(), null);
  const results: BattleResult[] = [];
  battle.start(context(), result => results.push(result)); begin(battle); battle.pause(true);
  rejectStarts(); assert.equal(snapshot(battle).externallyPaused, true);
  battle.pause(false); winRuntimeBattle(battle); battle.complete();
  assert.deepEqual(results, [{attemptId: context().attempt.id, outcome: 'won'}]); assert.equal(rejectedCalls, 0);
});

test('same attempt supply lock survives use, restart, external pause and settlement without changing callbacks', () => {
  const battle = new PrologueBattle(); const results: BattleResult[] = [];
  const input = {...context(), extraSupplies: {'warm-can': 1, 'bouncy-treat': 1}};
  let rejectedCalls = 0; let notifications = 0; battle.subscribe(() => notifications++);
  battle.start(input, result => results.push(result)); begin(battle);
  until(battle, state => state.cats.find(cat => cat.id === 'guard')!.hp < 240);
  battle.dispatch({type: 'USE_ITEM', itemId: 'warm-can', catId: 'guard'});
  assert.equal(snapshot(battle).lastAction!.ok, true); assert.equal(snapshot(battle).inventory['warm-can'], 2);
  const rejectChanges = () => {
    const previous = snapshot(battle); const previousNotifications = notifications;
    for (const extraSupplies of [undefined, {}, {'warm-can': 0, 'bouncy-treat': 1}, {'warm-can': 2, 'bouncy-treat': 1}]) {
      assert.throws(() => battle.start({...input, extraSupplies}, () => rejectedCalls++), {code: 'BATTLE_SUPPLIES_LOCKED'});
      assert.equal(snapshot(battle), previous); assert.equal(notifications, previousNotifications);
    }
  };
  rejectChanges(); battle.dispatch({type: 'RESTART'});
  assert.deepEqual(snapshot(battle).inventory, {'warm-can': 3, 'bouncy-treat': 2}); rejectChanges();
  begin(battle); battle.pause(true); rejectChanges(); battle.pause(false);
  winRuntimeBattle(battle); battle.complete(); rejectChanges();
  assert.deepEqual(results, [{attemptId: input.attempt.id, outcome: 'won'}]); assert.equal(rejectedCalls, 0);
  battle.start({...context(), attempt: {...context().attempt, id: 'new-supply-attempt'}}, () => {});
  assert.deepEqual(snapshot(battle).initialInventory, {'warm-can': 2, 'bouncy-treat': 1});
  battle.stop(); battle.start(input, () => {});
  assert.deepEqual(snapshot(battle).initialInventory, {'warm-can': 3, 'bouncy-treat': 2});
});

test('omitted, empty and explicit zero extras are equivalent, and host/constructor objects are copied', () => {
  const battle = new PrologueBattle();
  for (const extraSupplies of [undefined, {}, {'warm-can': 0}, {'bouncy-treat': 0}, {'warm-can': 0, 'bouncy-treat': 0}]) {
    battle.start({...context(), extraSupplies}, () => {});
    assert.deepEqual(snapshot(battle).initialInventory, {'warm-can': 2, 'bouncy-treat': 1});
  }
  const extras = {'warm-can': 1, 'bouncy-treat': 1};
  const configured = new PrologueBattle({extraSupplies: extras}); extras['warm-can'] = 2;
  configured.start(context(), () => {});
  assert.deepEqual(snapshot(configured).initialInventory, {'warm-can': 3, 'bouncy-treat': 2});
  const hostExtras = {'warm-can': 2};
  configured.start({...context(), attempt: {...context().attempt, id: 'host-overrides-defaults'}, extraSupplies: hostExtras}, () => {});
  hostExtras['warm-can'] = 0;
  assert.deepEqual(snapshot(configured).initialInventory, {'warm-can': 4, 'bouncy-treat': 1});
  begin(configured);
  assert.deepEqual(snapshot(configured).inventory, {'warm-can': 4, 'bouncy-treat': 1});
  configured.dispatch({type: 'RESTART'});
  assert.deepEqual(snapshot(configured).inventory, {'warm-can': 4, 'bouncy-treat': 1});
});

test('constructor validates original supply prototypes and symbol keys before cloning can erase them', () => {
  const inherited = Object.create({'warm-can': 1});
  const customPrototype = Object.assign(Object.create({custom: true}), {'warm-can': 1});
  const symbolKey = {'warm-can': 1, [Symbol('unknown-supply')]: 1};
  for (const extraSupplies of [inherited, customPrototype, symbolKey]) {
    assert.throws(() => new PrologueBattle({extraSupplies}), {code: 'INVALID_BATTLE_SUPPLIES'});
  }
  const allowed = Object.assign(Object.create(null), {'warm-can': 1});
  const battle = new PrologueBattle({extraSupplies: allowed});
  allowed['warm-can'] = 2;
  battle.start(context(), () => {});
  assert.deepEqual(snapshot(battle).initialInventory, {'warm-can': 3, 'bouncy-treat': 1});
});

test('energy-item teaching cannot settle and external pause protects the complete bag targeting path', () => {
  const battle = new PrologueBattle(); const results: BattleResult[] = [];
  battle.start(context(), result => results.push(result));
  battle.dispatch({type: 'START'}); until(battle, state => state.phase === 'teach_bag');
  for (const action of guide) battle.dispatch(action);
  battle.dispatch({type: 'BEGIN_SKILL_PRACTICE'}); until(battle, state => state.phase === 'teach_energy_item');
  battle.complete(); assert.equal(results.length, 0); battle.pause(true);
  const paused = snapshot(battle);
  for (const action of [
    {type: 'OPEN_BAG'}, {type: 'SELECT_ITEM', itemId: 'bouncy-treat'}, {type: 'SELECT_TARGET', catId: 'caster'},
    {type: 'USE_ITEM', itemId: 'bouncy-treat', catId: 'caster'}, {type: 'PAUSE'},
  ] as CombatAction[]) battle.dispatch(action);
  battle.tick(30); assert.equal(snapshot(battle), paused);
  assert.equal(snapshot(battle).cats.find(cat => cat.id === 'caster')!.energy, 70);
  battle.pause(false); teachEnergyItem(battle);
  assert.equal(snapshot(battle).energyItemTaught, true); assert.equal(results.length, 0);
});
