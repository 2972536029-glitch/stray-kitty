export interface TunnelPoint {x: number; y: number}

/** White pixels describe ground under the paws, not the cat's upright body. */
export class TunnelWalkableMask {
  private readonly offsets: TunnelPoint[];
  constructor(readonly width: number, readonly height: number, private readonly pixels: Uint8Array, radius = 10, private readonly cornerReach = 12) {
    this.offsets = [{x: 0, y: 0}];
    const depth = Math.min(radius, 3);
    for (let y = -depth; y <= depth; y++) for (let x = -radius; x <= radius; x++) {
      if (x * x / (radius * radius || 1) + y * y / (depth * depth || 1) <= 1) this.offsets.push({x, y});
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
      const before = {...result};
      if (this.isWalkable({x: result.x + dx, y: result.y + dy})) {result.x += dx; result.y += dy; continue;}
      if (dx && this.isWalkable({x: result.x + dx, y: result.y})) result.x += dx; else if (dx) blockedX = true;
      if (dy && this.isWalkable({x: result.x, y: result.y + dy})) result.y += dy; else if (dy) blockedY = true;
      // Holding a cardinal direction should follow a small painted corner,
      // rather than requiring a pixel-perfect diagonal correction. Look only
      // a bounded distance sideways; verify the entire detour before sliding.
      if (((dx === 0) !== (dy === 0)) && result.x === before.x && result.y === before.y) {
        const forward = {x: result.x + dx, y: result.y + dy};
        if (this.isWalkable(forward)) continue;
        const stride = Math.max(Math.abs(dx), Math.abs(dy));
        let side = 0;
        for (let offset = 2; offset <= this.cornerReach && !side; offset += 2) for (const sign of [-1, 1]) {
          let clear = true;
          for (let n = 1; n <= offset; n++) {
            const point = {x: result.x + (dy ? n * sign : 0), y: result.y + (dx ? n * sign : 0)};
            if (!this.isWalkable(point)) {clear = false; break;}
          }
          if (clear && this.isWalkable({x: forward.x + (dy ? offset * sign : 0), y: forward.y + (dx ? offset * sign : 0)})) {side = sign; break;}
        }
        if (side) {
          const slide = {x: result.x + (dy ? stride * side : 0), y: result.y + (dx ? stride * side : 0)};
          if (this.isWalkable(slide)) {result.x = slide.x; result.y = slide.y;}
        }
      }
    }
    return {position: result, blockedX, blockedY};
  }
}
