import geometry from '../../../../level_design/chapter4/data/chapter4.surfaces.json' with { type: 'json' };
import {TunnelWalkableMask} from './TunnelWalkableMask';
import type {TunnelLayer, tunnelConnections} from './navigation';
import {tunnelExitBlockerPolygon} from './battleExit';

export const tunnelSurfaces = geometry;
export type RaisedTunnelSurface = 'tank-ridge' | 'south-ridge' | 'west-ridge';
export type TunnelSurface = 'ground' | RaisedTunnelSurface;
export const raisedSurfacePolygons = {'tank-ridge': [geometry.tankRidge], 'south-ridge': geometry.southRidge, 'west-ridge': geometry.westRidge};
export function tunnelClimbSurface(portalId: string): RaisedTunnelSurface | undefined {
  if (portalId === 'tank-climb' || portalId === 'tank-east-descent') return 'tank-ridge';
  if (portalId === 'west-ridge-climb' || portalId === 'west-ridge-east-descent') return 'west-ridge';
  if (portalId === 'ridge-climb' || portalId === 'niche-climb') return 'south-ridge';
  return undefined;
}
type Polygon = number[][];

function inside(polygon: Polygon, x: number, y: number) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
}

function paint(pixels: Uint8Array, width: number, height: number, polygon: Polygon, value: number) {
  const left = Math.max(0, Math.floor(Math.min(...polygon.map(p => p[0]))));
  const right = Math.min(width - 1, Math.ceil(Math.max(...polygon.map(p => p[0]))));
  const top = Math.max(0, Math.floor(Math.min(...polygon.map(p => p[1]))));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(...polygon.map(p => p[1]))));
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (inside(polygon, x, y)) pixels[y * width + x] = value;
  }
}

// Keep the approved image intact; these surveyed patches fix ground registration.
export function tunnelGroundMask(floor: TunnelLayer, width: number, height: number, original: Uint8Array, radius = 10) {
  const pixels = original.slice();
  for (const polygon of geometry[floor].blocked) paint(pixels, width, height, polygon, 0);
  // Every raised edge is solid on the ground floor. Only its C connection may
  // switch the actor onto the independent ridge surface.
  if (floor === 'L0') for (const polygons of Object.values(raisedSurfacePolygons)) {
    for (const polygon of polygons) paint(pixels, width, height, polygon, 0);
  }
  for (const polygon of geometry[floor].walkable) paint(pixels, width, height, polygon, 255);
  const layer = geometry[floor];
  if ('blockedAfterWalkable' in layer) for (const polygon of layer.blockedAfterWalkable) paint(pixels, width, height, polygon, 0);
  if (floor === 'L0') paint(pixels, width, height, tunnelExitBlockerPolygon, 0);
  return new TunnelWalkableMask(width, height, pixels, radius);
}

export function tankRidgeMask(width: number, height: number) {
  return raisedRidgeMask('tank-ridge', width, height);
}

export function raisedRidgeMask(surface: RaisedTunnelSurface, width: number, height: number) {
  const pixels = new Uint8Array(width * height);
  for (const polygon of raisedSurfacePolygons[surface]) paint(pixels, width, height, polygon, 255);
  // Follow the full stone-step bend while a cardinal key is held. This only
  // steers inside the raised polygon; it never opens a route across its edge.
  return new TunnelWalkableMask(width, height, pixels, 4, 28);
}

export function tunnelSurfaceConnections(floor: TunnelLayer, surface: TunnelSurface, connections: ReturnType<typeof tunnelConnections>) {
  return connections.filter(connection => {
    const raised = tunnelClimbSurface(connection.portal.id);
    if (raised) return floor === 'L0' && (surface === raised ? connection.from === connection.portal.b : surface === 'ground' && connection.from === connection.portal.a);
    return surface === 'ground';
  });
}
