import type {MovementResult, Point, RainyAlleyGeometry} from './types';

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index], b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export class CollisionField {
  readonly columns: number;
  readonly rows: number;
  readonly raw: Uint8Array;
  readonly effective: Uint8Array;

  constructor(readonly geometry: RainyAlleyGeometry, readonly resolution = 2, readonly colliderRadius = 12) {
    this.columns = Math.ceil(geometry.width / resolution);
    this.rows = Math.ceil(geometry.height / resolution);
    this.raw = new Uint8Array(this.columns * this.rows);
    this.effective = new Uint8Array(this.columns * this.rows);
    this.build();
  }

  private build() {
    const {columns, rows, resolution, geometry} = this;
    for (let row = 0; row < rows; row++) {
      const y = row * resolution + resolution / 2;
      for (let column = 0; column < columns; column++) {
        const point = {x: column * resolution + resolution / 2, y};
        const inSqueeze = geometry.walkable.some(polygon => polygon.name === 'squeeze-corridor' && pointInPolygon(point, polygon.points));
        const inWalkable = geometry.walkable.some(polygon => pointInPolygon(point, polygon.points));
        const inSolid = geometry.solid.some(polygon => pointInPolygon(point, polygon.points));
        const inSqueezeSide = geometry.solid.some(polygon => polygon.name.startsWith('squeeze-side-') && pointInPolygon(point, polygon.points));
        // v0.9 defines the squeeze as an explicit union with the main floor.
        // It therefore restores this exact rectangle even where a floor-hole
        // contour would otherwise subtract it; footprint erosion still keeps
        // the cat out of the adjacent walls.
        this.raw[row * columns + column] = Number(!inSqueezeSide && (inSqueeze || (inWalkable && !inSolid)));
      }
    }
    const radius = Math.ceil(this.colliderRadius / resolution);
    const offsets: Point[] = [];
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) offsets.push({x, y});
    }
    for (let row = radius; row < rows - radius; row++) for (let column = radius; column < columns - radius; column++) {
      if (!this.raw[row * columns + column]) continue;
      this.effective[row * columns + column] = Number(offsets.every(offset => this.raw[(row + offset.y) * columns + column + offset.x]));
    }
  }

  isTraversable(x: number, y: number): boolean {
    const column = Math.floor(x / this.resolution), row = Math.floor(y / this.resolution);
    return column >= 0 && row >= 0 && column < this.columns && row < this.rows && this.effective[row * this.columns + column] === 1;
  }

  nearestTraversable(point: Point, maxDistance = 96): Point | null {
    if (this.isTraversable(point.x, point.y)) return point;
    const limit = Math.ceil(maxDistance / this.resolution);
    const originColumn = Math.floor(point.x / this.resolution), originRow = Math.floor(point.y / this.resolution);
    for (let radius = 1; radius <= limit; radius++) for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      if (Math.abs(x) !== radius && Math.abs(y) !== radius) continue;
      const column = originColumn + x, row = originRow + y;
      if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) continue;
      if (this.effective[row * this.columns + column]) return {x: column * this.resolution + this.resolution / 2, y: row * this.resolution + this.resolution / 2};
    }
    return null;
  }
}

export function sweepMove(field: CollisionField, position: Point, delta: Point, maxStep = 4): MovementResult {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / maxStep));
  const step = {x: delta.x / steps, y: delta.y / steps};
  const next = {...position};
  let blockedX = false, blockedY = false;
  for (let index = 0; index < steps; index++) {
    if (field.isTraversable(next.x + step.x, next.y + step.y)) {
      next.x += step.x; next.y += step.y;
      continue;
    }
    if (step.x && field.isTraversable(next.x + step.x, next.y)) next.x += step.x;
    else if (step.x) blockedX = true;
    if (step.y && field.isTraversable(next.x, next.y + step.y)) next.y += step.y;
    else if (step.y) blockedY = true;
  }
  return {position: next, blockedX, blockedY};
}

function segmentIsClear(field: CollisionField, start: Point, end: Point): boolean {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const samples = Math.max(1, Math.ceil(distance / field.resolution));
  for (let index = 0; index <= samples; index++) {
    const amount = index / samples;
    if (!field.isTraversable(start.x + (end.x - start.x) * amount, start.y + (end.y - start.y) * amount)) return false;
  }
  return true;
}

class MinHeap {
  private values: Array<{id: number; score: number}> = [];
  get length() {return this.values.length;}
  push(value: {id: number; score: number}) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].score <= value.score) break;
      this.values[index] = this.values[parent]; index = parent;
    }
    this.values[index] = value;
  }
  pop() {
    const first = this.values[0], last = this.values.pop();
    if (!first || !last || !this.values.length) return first;
    this.values[0] = last;
    for (let index = 0;;) {
      const left = index * 2 + 1, right = left + 1;
      if (left >= this.values.length) break;
      const child = right < this.values.length && this.values[right].score < this.values[left].score ? right : left;
      if (this.values[index].score <= this.values[child].score) break;
      [this.values[index], this.values[child]] = [this.values[child], this.values[index]]; index = child;
    }
    return first;
  }
}

export function findPath(field: CollisionField, start: Point, destination: Point, step = 4): Point[] {
  const snappedStart = field.nearestTraversable(start), snappedEnd = field.nearestTraversable(destination);
  if (!snappedStart || !snappedEnd) return [];
  const columns = Math.ceil(field.geometry.width / step), rows = Math.ceil(field.geometry.height / step);
  const idFor = (point: Point) => Math.floor(point.y / step) * columns + Math.floor(point.x / step);
  const pointFor = (id: number): Point => ({x: (id % columns) * step + step / 2, y: Math.floor(id / columns) * step + step / 2});
  const startId = idFor(snappedStart), endId = idFor(snappedEnd);
  const costs = new Float64Array(columns * rows); costs.fill(Number.POSITIVE_INFINITY); costs[startId] = 0;
  const parents = new Int32Array(columns * rows); parents.fill(-1);
  const closed = new Uint8Array(columns * rows), heap = new MinHeap();
  heap.push({id: startId, score: 0});
  const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const;
  while (heap.length) {
    const current = heap.pop(); if (!current || closed[current.id]) continue;
    if (current.id === endId) break;
    closed[current.id] = 1;
    const column = current.id % columns, row = Math.floor(current.id / columns);
    for (const [dx, dy] of directions) {
      const nextColumn = column + dx, nextRow = row + dy;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= columns || nextRow >= rows) continue;
      const next = {x: nextColumn * step + step / 2, y: nextRow * step + step / 2};
      if (!field.isTraversable(next.x, next.y)) continue;
      if (dx && dy) {
        if (!field.isTraversable((column + dx) * step + step / 2, row * step + step / 2) || !field.isTraversable(column * step + step / 2, (row + dy) * step + step / 2)) continue;
      }
      const nextId = nextRow * columns + nextColumn;
      const tentative = costs[current.id] + (dx && dy ? Math.SQRT2 : 1);
      if (tentative >= costs[nextId]) continue;
      costs[nextId] = tentative; parents[nextId] = current.id;
      const targetColumn = endId % columns, targetRow = Math.floor(endId / columns);
      const xDistance = Math.abs(targetColumn - nextColumn), yDistance = Math.abs(targetRow - nextRow);
      const heuristic = Math.max(xDistance, yDistance) + (Math.SQRT2 - 1) * Math.min(xDistance, yDistance);
      heap.push({id: nextId, score: tentative + heuristic});
    }
  }
  if (startId !== endId && parents[endId] < 0) {
    return step > field.resolution ? findPath(field, start, destination, field.resolution) : [];
  }
  const raw: Point[] = [];
  for (let id = endId; id >= 0; id = parents[id]) {raw.push(pointFor(id)); if (id === startId) break;}
  raw.reverse(); raw[0] = snappedStart; raw[raw.length - 1] = snappedEnd;
  const smoothed: Point[] = [raw[0]];
  for (let anchor = 0; anchor < raw.length - 1;) {
    let next = raw.length - 1;
    while (next > anchor + 1 && !segmentIsClear(field, raw[anchor], raw[next])) next--;
    smoothed.push(raw[next]); anchor = next;
  }
  return smoothed;
}
