export interface TunnelPoint {x: number; y: number}

/** The supplied white raster is the walkable surface. Test the full cat footprint against it. */
export class TunnelWalkableMask {
  private readonly offsets: TunnelPoint[];
  constructor(readonly width: number, readonly height: number, private readonly pixels: Uint8Array, radius = 10) {
    this.offsets = [{x: 0, y: 0}];
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) this.offsets.push({x, y});
    }
  }
  isWalkable(point: TunnelPoint) {
    const x = Math.round(point.x), y = Math.round(point.y);
    for (const offset of this.offsets) {
      const px = x + offset.x, py = y + offset.y;
      if (px < 0 || py < 0 || px >= this.width || py >= this.height || this.pixels[py * this.width + px] < 128) return false;
    }
    return true;
  }
  move(point: TunnelPoint, delta: TunnelPoint, maxStep = 4) {
    const count = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / maxStep));
    const dx = delta.x / count, dy = delta.y / count;
    const result = {...point}; let blockedX = false, blockedY = false;
    for (let i = 0; i < count; i++) {
      if (this.isWalkable({x: result.x + dx, y: result.y + dy})) {result.x += dx; result.y += dy; continue;}
      if (dx && this.isWalkable({x: result.x + dx, y: result.y})) result.x += dx; else if (dx) blockedX = true;
      if (dy && this.isWalkable({x: result.x, y: result.y + dy})) result.y += dy; else if (dy) blockedY = true;
    }
    return {position: result, blockedX, blockedY};
  }
}
