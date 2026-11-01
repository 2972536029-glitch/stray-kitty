import map from '../../../../level_design/chapter4/data/chapter4.map.json' with { type: 'json' };
import type {TunnelLayer, TunnelPoint} from './navigation';
import type {TunnelSurface} from './surfaces';

export const tunnelBattleExit = map.battleExit;
const {left, right, top, bottom} = tunnelBattleExit.blocker;
export const tunnelExitBlockerPolygon = [[left,top],[right,top],[right,bottom],[left,bottom]];

export function tunnelBossAt(floor: TunnelLayer, surface: TunnelSurface, point: TunnelPoint, flags: readonly string[]) {
  const box = tunnelBattleExit.trigger;
  return floor === 'L0' && surface === 'ground'
    && flags.includes('tunnel_false_kitten_trap_found') && flags.includes('valve_three_investigated')
    && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

// A solid grate across the painted exit deck, beyond the existing boss trigger.
// Its west edge shares the collision boundary; no extra image request is needed.
export function drawTunnelExitBarrier(context: CanvasRenderingContext2D) {
  const {left: x, top, bottom} = tunnelBattleExit.blocker;
  context.save();
  context.fillStyle = 'rgba(4,10,14,.55)'; context.fillRect(x + 4, top + 3, 18, bottom - top + 5);
  context.fillStyle = '#202e35'; context.fillRect(x, top, 14, bottom - top);
  context.fillStyle = '#69786c'; context.fillRect(x, top, 3, bottom - top); context.fillRect(x + 11, top, 3, bottom - top);
  context.fillStyle = '#a17b51'; context.fillRect(x + 3, top + 2, 2, bottom - top - 4);
  for (let y = top + 7; y < bottom - 4; y += 12) {
    context.fillStyle = '#7e8879'; context.fillRect(x + 3, y, 8, 3);
    context.fillStyle = '#3f514d'; context.fillRect(x + 5, y + 3, 3, 8);
    context.fillStyle = '#b18b58'; context.fillRect(x + 10, y, 2, 2);
  }
  for (const y of [top - 2, bottom - 5]) {
    context.fillStyle = '#23353a'; context.fillRect(x - 3, y, 20, 8);
    context.fillStyle = '#a6865b'; context.fillRect(x - 2, y, 18, 2);
    context.fillStyle = '#c0c0a0'; context.fillRect(x + 1, y + 3, 2, 2); context.fillRect(x + 11, y + 3, 2, 2);
  }
  context.restore();
}
