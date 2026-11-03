import {getCarrySpeedMultiplier, type BattleCarryState} from '../carry';
import type {Position} from './geometry';

const EPS = 1e-8;

interface Blocker<CatId extends string> extends Position {
  id: CatId; status: 'active' | 'retired'; block: number; blockedCount: number;
}

interface RouteEnemy<CatId extends string, RouteId extends string> extends Position {
  id: string; hp: number; speed: number; route: RouteId; pathIndex: number;
  blockedBy: CatId | null; slowRemaining: number; slowMultiplier: number;
}

interface RouteState<CatId extends string, RouteId extends string> {
  carry: BattleCarryState;
  cats: Blocker<CatId>[];
  enemies: RouteEnemy<CatId, RouteId>[];
}

/** Shared by chapters with explicit axis-aligned routes; prologue/alley keep their own paths. */
export function createRouteMovement<CatId extends string, RouteId extends string>(
  routes: Readonly<Record<RouteId, readonly Position[]>>, contactGap: number,
) {
  type Enemy = RouteEnemy<CatId, RouteId>;
  type State = RouteState<CatId, RouteId>;

  function segment(enemy: Enemy): {dx: number; dy: number; target: Position} | null {
    const path = routes[enemy.route];
    if (enemy.pathIndex >= path.length) return null;
    const from = path[enemy.pathIndex - 1], target = path[enemy.pathIndex];
    return {dx: Math.sign(target.x - from.x), dy: Math.sign(target.y - from.y), target};
  }

  function distanceRemaining(enemy: Enemy): number {
    const path = routes[enemy.route];
    let position: Position = enemy, remaining = 0;
    for (let i = enemy.pathIndex; i < path.length; i++) {
      remaining += Math.abs(path[i].x - position.x) + Math.abs(path[i].y - position.y); position = path[i];
    }
    return remaining;
  }

  function releaseBlocks(state: State): void {
    const counts = new Map<CatId, number>();
    for (const enemy of state.enemies) {
      const cat = enemy.blockedBy && state.cats.find(candidate => candidate.id === enemy.blockedBy), direction = segment(enemy);
      // Contact is directed: moving behind a shadow cannot retain its block.
      const ahead = cat && direction ? (cat.x - enemy.x) * direction.dx + (cat.y - enemy.y) * direction.dy : -1;
      const aligned = cat && direction && (direction.dx ? Math.abs(cat.y - enemy.y) < EPS : Math.abs(cat.x - enemy.x) < EPS);
      if (!cat || !direction || cat.status !== 'active' || enemy.hp <= 0 || !aligned || ahead < -EPS || ahead > contactGap + EPS
          || (counts.get(cat.id) ?? 0) >= cat.block) enemy.blockedBy = null;
      else counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
    }
    for (const cat of state.cats) cat.blockedCount = counts.get(cat.id) ?? 0;
  }

  function moveEnemies(state: State, dt: number, enemySeconds: ReadonlyMap<string, number>): void {
    // Reserve existing valid contacts before allowing new arrivals to claim capacity.
    releaseBlocks(state);
    const counts = new Map<CatId, number>(state.cats.map(cat => [cat.id, cat.blockedCount]));
    for (const enemy of [...state.enemies].sort((a, b) => distanceRemaining(a) - distanceRemaining(b) || a.id.localeCompare(b.id))) {
      if (enemy.blockedBy) continue;
      const activeSeconds = enemySeconds.get(enemy.id) ?? dt;
      if (activeSeconds <= EPS) continue;
      const slowed = Math.min(activeSeconds, enemy.slowRemaining);
      const routeMultiplier = getCarrySpeedMultiplier(state.carry, enemy.route);
      let distance = routeMultiplier === 1
        ? enemy.speed * (slowed * enemy.slowMultiplier + activeSeconds - slowed)
        : enemy.speed * (slowed * Math.min(enemy.slowMultiplier, routeMultiplier) + (activeSeconds - slowed) * routeMultiplier);
      while (distance > EPS) {
        const direction = segment(enemy); if (!direction) break;
        const {dx, dy, target} = direction;
        const toCorner = Math.abs(target.x - enemy.x) + Math.abs(target.y - enemy.y);
        if (toCorner <= EPS) {enemy.pathIndex++; continue;}
        const step = Math.min(distance, toCorner);
        const contacts = state.cats.flatMap(cat => {
          if (cat.status !== 'active' || (counts.get(cat.id) ?? 0) >= cat.block) return [];
          if (dx ? Math.abs(cat.y - enemy.y) >= EPS : Math.abs(cat.x - enemy.x) >= EPS) return [];
          const ahead = (cat.x - enemy.x) * dx + (cat.y - enemy.y) * dy;
          const contact = ahead - contactGap;
          return ahead >= -EPS && ahead <= toCorner + EPS && contact <= step + EPS && contact >= -EPS ? [{cat, contact}] : [];
        }).sort((a, b) => a.contact - b.contact || a.cat.id.localeCompare(b.cat.id));
        if (contacts.length) {
          const {cat, contact} = contacts[0]; enemy.x += dx * Math.max(0, contact); enemy.y += dy * Math.max(0, contact);
          enemy.blockedBy = cat.id; counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1); break;
        }
        enemy.x += dx * step; enemy.y += dy * step; distance -= step;
        if (Math.abs(enemy.x - target.x) < EPS && Math.abs(enemy.y - target.y) < EPS) {
          enemy.x = target.x; enemy.y = target.y; enemy.pathIndex++;
        }
      }
    }
    for (const cat of state.cats) cat.blockedCount = counts.get(cat.id) ?? 0;
  }

  return {releaseBlocks, moveEnemies};
}
