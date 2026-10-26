import assert from 'node:assert/strict';
import {act, advanceGame, createGame} from '../../web/src/modules/battle/l00/engine.ts';
import {CONFIG, RECOMMENDED_POSITIONS, SKILLS} from '../../web/src/modules/battle/l00/config.ts';
import {getSkillCells, isEnemyInCells} from '../../web/src/modules/battle/l00/ranges.ts';
import type {CombatAction, CombatEnemy, CombatOptions, CombatState} from '../../web/src/modules/battle/l00/state.ts';
import type {PrologueBattle} from '../../web/src/modules/battle/l00/runtime.ts';

export function skillTutorialSnapshots(initial: CombatState): CombatState[] {
  assert.equal(initial.phase, 'teach_energy');
  let state = act(initial, {type: 'BEGIN_SKILL_PRACTICE'});
  const snapshots = [state];
  for (let step = 0; step < 500 && state.phase === 'skill_charge'; step++) state = advanceGame(state, 0.1);
  assert.equal(state.phase, 'teach_guard_skill'); snapshots.push(state);
  state = act(state, {type: 'CAST_SKILL', catId: 'guard'});
  assert.equal(state.phase, 'teach_caster_skill'); snapshots.push(state);
  state = act(state, {type: 'SELECT_SKILL', catId: 'caster'}); snapshots.push(state);
  state = act(state, {type: 'AIM_SKILL', x: 5, y: 1}); snapshots.push(state);
  state = act(state, {type: 'CAST_SKILL', catId: 'caster'});
  assert.equal(state.phase, 'battle'); snapshots.push(state);
  return snapshots;
}

export function finishSkillTutorial(initial: CombatState): CombatState {return skillTutorialSnapshots(initial).at(-1)!;}

/** Reach real wave one exclusively through the same legal tutorial actions as the player. */
export function beginBattle(options: CombatOptions = {}): CombatState {
  let state = act(createGame(options), {type: 'START'});
  for (let step = 0; step < 1000 && state.phase !== 'teach_position'; step++) state = advanceGame(state, 0.05);
  assert.equal(state.phase, 'teach_position');
  for (const action of [
    {type: 'MOVE_CAT', catId: 'caster', ...RECOMMENDED_POSITIONS.caster},
    {type: 'MOVE_CAT', catId: 'guard', ...RECOMMENDED_POSITIONS.guard},
  ] as CombatAction[]) state = act(state, action);
  return finishSkillTutorial(state);
}

export interface ManualPlayOptions {
  /** Both shield reaction and area aiming take this many simulated seconds. */
  reactionSeconds?: number;
  onSnapshot?: (state: CombatState) => void;
}
interface BattleDriver {
  snapshot(): CombatState;
  dispatch(action: CombatAction): CombatState;
  tick(seconds: number): CombatState;
}
const fighter = (state: CombatState, id: 'guard' | 'caster') => state.cats.find(cat => cat.id === id)!;

/** Inspect once a second and spend skills only after a human-sized delay.
 * Never writes combat state, tops up health/energy, revives cats or skips waves.
 * Aiming keeps simulation running; a cluster may disperse before the eventual release.
 */
function playManually(driver: BattleDriver, options: ManualPlayOptions = {}) {
  const reactionSeconds = options.reactionSeconds ?? 2;
  let state = driver.snapshot();
  assert.equal(state.phase, 'battle');
  const startTime = state.time;
  let casterDue: number | null = null;
  let guardDue: number | null = null;
  let nextObservation = state.time;
  const seen = new Set<string>();
  const spawns: CombatEnemy[] = [];
  const waves: number[] = [];
  const stats = {shieldCasts: 0, areaCasts: 0, areaHits: 0, cancelledAims: 0};
  const observe = () => {
    if (waves.at(-1) !== state.wave) waves.push(state.wave);
    for (const enemy of state.enemies) if (!enemy.training && !seen.has(enemy.id)) {
      seen.add(enemy.id); spawns.push(structuredClone(enemy));
    }
    options.onSnapshot?.(state);
  };
  const bestTarget = () => {
    let best = {x: 0, y: 1, hits: 0, damage: 0};
    for (let x = 0; x < CONFIG.COLUMNS; x++) {
      const cells = getSkillCells(fighter(state, 'caster'), {x, y: 1});
      const hit = state.enemies.filter(enemy => isEnemyInCells(enemy, cells));
      const damage = hit.reduce((sum, enemy) => sum + Math.min(enemy.hp, SKILLS.caster.damage!), 0);
      if (damage > best.damage) best = {x, y: 1, hits: hit.length, damage};
    }
    return best;
  };
  const dispatch = (action: CombatAction) => {state = driver.dispatch(action); return state.lastAction?.ok === true;};
  observe();
  for (let step = 0; step < 12000 && state.phase === 'battle'; step++) {
    if (casterDue !== null && state.time + 1e-8 >= casterDue) {
      const target = bestTarget();
      if (target.damage > 0) {
        if (dispatch({type: 'CAST_SKILL', catId: 'caster', x: target.x, y: target.y})) {
          stats.areaCasts++; stats.areaHits += target.hits;
        }
      } else if (dispatch({type: 'CANCEL_SKILL'})) stats.cancelledAims++;
      casterDue = null;
    }
    if (guardDue !== null && state.time + 1e-8 >= guardDue && !state.skillAim) {
      if (dispatch({type: 'CAST_SKILL', catId: 'guard'})) stats.shieldCasts++;
      guardDue = null;
    }
    if (state.time + 1e-8 >= nextObservation && !state.skillAim) {
      // Observations stay on a one-second clock, even while an aim prevents acting.
      nextObservation = startTime + Math.floor(state.time - startTime + 1e-8) + 1;
      const guard = fighter(state, 'guard');
      if (guardDue === null && guard.status === 'active' && guard.energy >= CONFIG.MAX_ENERGY && guard.shield <= 0
          && state.enemies.some(enemy => enemy.blockedBy === 'guard')) guardDue = state.time + reactionSeconds;
      if (guardDue === null && fighter(state, 'caster').status === 'active' && fighter(state, 'caster').energy >= CONFIG.MAX_ENERGY) {
        const target = bestTarget();
        if (target.hits >= 2 || (guard.hp <= 120 && target.damage >= 30) || (state.wave === CONFIG.TOTAL_WAVES && target.damage > 0)) {
          if (dispatch({type: 'SELECT_SKILL', catId: 'caster'})) {
            assert.equal(dispatch({type: 'AIM_SKILL', x: target.x, y: target.y}), true);
            casterDue = state.time + reactionSeconds;
          }
        }
      }
    }
    state = driver.tick(0.05);
    observe();
  }
  return {state, battleSeconds: Number((state.time - startTime).toFixed(2)), spawns, waves, ...stats};
}

export function playBattle(initial: CombatState, options: ManualPlayOptions = {}) {
  let state = initial;
  return playManually({snapshot: () => state,
    dispatch: action => state = act(state, action), tick: seconds => state = advanceGame(state, seconds)}, options);
}

export function winRuntimeBattle(runtime: PrologueBattle) {
  const snapshot = () => {const state = runtime.getSnapshot(); assert.ok(state); return state;};
  const result = playManually({snapshot,
    dispatch: action => {runtime.dispatch(action); return snapshot();},
    tick: seconds => {runtime.tick(seconds); return snapshot();}});
  assert.equal(result.state.phase, 'won', `manual play stopped in ${result.state.phase}, wave ${result.state.wave}`);
  return result.state;
}
