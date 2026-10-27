import type {BattleCarryId} from '../../contracts';

export type {BattleCarryId};
export interface CarryPosition {x: number; y: number}
export interface CarryPatrolRoute {route: string; anchor: CarryPosition}
export interface BattleCarryState {
  id: BattleCarryId | null;
  used: boolean;
  freezeRemaining: number;
  route: string;
  anchor: CarryPosition;
  elapsed: number;
  warning: string | null;
  boxActive: boolean;
  boxWait: Record<string, number>;
  boxSeen: string[];
  pulses: number;
  patrolRoutes: CarryPatrolRoute[];
  kittenWave: number;
}
export interface CarryEnemy extends CarryPosition {id: string; route: string; hp: number}
export interface CarryTick {
  /** Effective time available for each minion's movement and attack clock in this step. */
  enemySeconds: ReadonlyMap<string, number>;
  hits: {position: CarryPosition; kind: 'light'; damage: number}[];
}
const EPS = 1e-8;
const IDS: readonly BattleCarryId[] = ['lantern', 'mirror', 'bell', 'box', 'dog', 'dove', 'rats', 'kitten'];

/** Unknown or malformed event data never prevents entering a battle. */
export function createBattleCarry(input: unknown, route: string, anchor: CarryPosition, patrolRoutes: readonly CarryPatrolRoute[] = []): BattleCarryState {
  const id = typeof input === 'string' && IDS.includes(input as BattleCarryId) ? input as BattleCarryId : null;
  const routes = [{route, anchor}, ...patrolRoutes].filter((value, index, all) => all.findIndex(entry => entry.route === value.route) === index)
    .map(value => ({route: value.route, anchor: {...value.anchor}}));
  return {id, route, anchor: {...anchor}, used: false, freezeRemaining: 0, elapsed: 0,
    warning: input === undefined || input === null || id ? null : '无法识别这次携带物，已按原有战斗规则继续。',
    boxActive: id === 'box', boxWait: {}, boxSeen: [], pulses: 0, patrolRoutes: routes, kittenWave: 0};
}

export function startBattleCarry(carry: BattleCarryState, cats: {status: string; energy: number}[]): void {
  if (carry.id !== 'bell' || carry.used) return;
  for (const cat of cats) if (cat.status === 'active') cat.energy = Math.max(0, Math.min(100, cat.energy + 20));
  carry.used = true;
}

/** Each real wave can help active main cats once; no inventory, revival or automatic skill use. */
export function startCarryWave(carry: BattleCarryState, wave: number, cats: {status: string; energy: number; energyBlockedRemaining?: number}[]): void {
  if (carry.id !== 'kitten' || !Number.isInteger(wave) || wave < 1 || wave <= carry.kittenWave) return;
  carry.kittenWave = wave;
  for (const cat of cats) if (cat.status === 'active' && (cat.energyBlockedRemaining ?? 0) <= 0) cat.energy = Math.max(0, Math.min(100, cat.energy + 8));
}

/** Patrol follows the simulation clock and real entrances, including while a wave is clearing. */
export function getCarryPatrol(carry: BattleCarryState): CarryPatrolRoute {
  const routes = carry.patrolRoutes;
  const current = routes[Math.floor((carry.elapsed + EPS) / 8) % routes.length];
  return current ?? {route: carry.route, anchor: carry.anchor};
}

/** Engine validates lifecycle and pause before calling this; rejection never spends the mirror. */
export function useBattleCarry(carry: BattleCarryState): string | null {
  if (carry.id !== 'mirror') return '本场没有可以主动使用的镜片。';
  if (carry.used) return '镜片本场已经使用过了。';
  carry.used = true; carry.freezeRemaining = 3;
  return null;
}

export function getCarrySpeedMultiplier(carry: BattleCarryState, route: string): number {
  if (carry.id === 'rats' && getCarryPatrol(carry).route === route) return 0.8;
  return carry.id === 'dog' && carry.route === route ? 0.75 : 1;
}

export function finishCarryWave(carry: BattleCarryState, wave: number): void {
  if (carry.id === 'box' && wave === 1) {carry.boxActive = false; carry.boxWait = {};}
}

/** Deterministic simulation only: no host writes, randomness, wall clock or extra victory participants. */
export function tickBattleCarry<T extends CarryEnemy>(
  carry: BattleCarryState, dt: number, wave: number, enemies: T[],
): CarryTick {
  const enemySeconds = new Map<string, number>(), hits: CarryTick['hits'] = [];
  if (!carry.id) return {enemySeconds, hits};
  const before = carry.elapsed;
  carry.elapsed += dt;
  const frozenTime = Math.min(dt, carry.freezeRemaining);
  carry.freezeRemaining = Math.max(0, carry.freezeRemaining - dt);
  if (carry.freezeRemaining < EPS) carry.freezeRemaining = 0;
  const activeSeconds = dt - frozenTime > EPS ? dt - frozenTime : 0;
  if (wave > 1) finishCarryWave(carry, 1);
  for (const enemy of enemies) {
    let available = activeSeconds;
    if (carry.boxActive && wave === 1 && enemy.route === carry.route) {
      // Register only at the real entrance; a passing survivor must never be caught again.
      if (!carry.boxSeen.includes(enemy.id) && Math.abs(enemy.x - carry.anchor.x) + Math.abs(enemy.y - carry.anchor.y) < EPS) {
        carry.boxSeen.push(enemy.id); carry.boxWait[enemy.id] = 2;
      }
      const wait = carry.boxWait[enemy.id] ?? 0;
      if (wait > 0) {
        carry.boxWait[enemy.id] = Math.max(0, wait - dt);
        available = Math.max(0, available - Math.min(dt, wait));
        if (carry.boxWait[enemy.id] < EPS) delete carry.boxWait[enemy.id];
      }
    }
    enemySeconds.set(enemy.id, available > EPS ? available : 0);
  }
  if (carry.id === 'lantern') {
    const interval = 4;
    const count = Math.floor((carry.elapsed + EPS) / interval) - Math.floor((before + EPS) / interval);
    for (let pulse = 0; pulse < count; pulse++) {
      carry.pulses++;
      const alive = enemies.filter(enemy => enemy.hp > 0);
      const targets = alive.filter(enemy => Math.abs(enemy.x - carry.anchor.x) + Math.abs(enemy.y - carry.anchor.y) <= 2 + EPS);
      for (const enemy of targets) {
        const damage = Math.min(enemy.hp, 20);
        enemy.hp -= damage;
        hits.push({position: {x: enemy.x, y: enemy.y}, kind: 'light', damage});
      }
    }
  }
  return {enemySeconds, hits};
}
