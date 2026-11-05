import {sweepMove, type CollisionField} from './collision';
import {SQUEEZE_BOUNDS, SQUEEZE_CENTER_X, squeezeExitTarget} from './runtimeGeometry';
import type {Point} from './types';

const approachSpeed = 96;
const passageSpeed = 58;
const blendDistance = 14;

/** A continuous, collision-checked turn into the mouth, followed by the passage. */
export class SqueezeMotion {
  private next = 0;
  private current: Point;
  constructor(start: Point, private readonly route: readonly Point[], private readonly field: CollisionField) {
    this.current = {...start};
  }

  get compression() {
    const outside = Math.max(SQUEEZE_BOUNDS.top - this.current.y, this.current.y - SQUEEZE_BOUNDS.bottom, 0);
    return Math.max(0, 1 - outside / blendDistance);
  }

  advance(seconds: number) {
    let remaining = Math.max(0, seconds);
    while (remaining > 0 && this.next < this.route.length) {
      const target = this.route[this.next];
      const dx = target.x - this.current.x, dy = target.y - this.current.y, distance = Math.hypot(dx, dy);
      if (distance < 1e-6) {this.next++;continue;}
      const speed = passageSpeed + (approachSpeed - passageSpeed) * (1 - this.compression);
      const amount = Math.min(distance, speed * remaining);
      const result = sweepMove(this.field, this.current, {x: dx / distance * amount, y: dy / distance * amount}, 1);
      // The route is checked before starting; never slide along a wall if it is blocked.
      if (result.blockedX || result.blockedY) break;
      this.current = amount === distance ? {...target} : result.position;
      remaining -= amount / speed;
      if (amount === distance) this.next++;
    }
    return {position: {...this.current}, done: this.next === this.route.length};
  }
}

export function createSqueezeMotion(start: Point, normal: CollisionField, field: CollisionField, direction: -1 | 1) {
  const distanceFromMouth = direction > 0 ? SQUEEZE_BOUNDS.top - start.y : start.y - SQUEEZE_BOUNDS.bottom;
  if (Math.abs(start.x - SQUEEZE_CENTER_X) > 10 || distanceFromMouth < 0 || distanceFromMouth > 18 || !normal.isTraversable(start.x, start.y)) return null;
  const exit = squeezeExitTarget(normal, field, direction);
  if (!exit || !field.isTraversable(start.x, start.y)) return null;
  // Finish the lateral turn before the small footprint reaches the wall edges.
  // The quadratic's final tangent points straight through the opening.
  const clearance = field.colliderRadius + field.resolution;
  const entry = {x: SQUEEZE_CENTER_X, y: direction > 0
    ? Math.max(start.y, SQUEEZE_BOUNDS.top - clearance)
    : Math.min(start.y, SQUEEZE_BOUNDS.bottom + clearance)};
  const control = {x: SQUEEZE_CENTER_X, y: start.y};
  const samples = Math.max(2, Math.ceil((Math.abs(control.x - start.x) + Math.abs(entry.y - start.y)) / .5));
  const route: Point[] = [];
  for (let i = 1; i <= samples; i++) {
    const t = i / samples, u = 1 - t;
    route.push({x: u * u * start.x + 2 * u * t * control.x + t * t * entry.x,
      y: u * u * start.y + 2 * u * t * control.y + t * t * entry.y});
  }
  route.push({...exit});
  let previous = start;
  for (const point of route) {
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / .5));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      if (!field.isTraversable(previous.x + (point.x - previous.x) * t, previous.y + (point.y - previous.y) * t)) return null;
    }
    previous = point;
  }
  return new SqueezeMotion(start, route, field);
}
