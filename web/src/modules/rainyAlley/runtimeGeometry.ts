import {CollisionField} from './collision';
import {rainyAlleySource} from './assets';
import type {Point, RainyAlleyGeometry, WorldPolygon} from './types';

function svgSubpaths(path: string): Point[][] {
  const tokens = path.match(/[MLHVZ]|-?\d+(?:\.\d+)?/gi) ?? [];
  const result: Point[][] = [];
  let index = 0, command = '', x = 0, y = 0, points: Point[] = [];
  const close = () => {if (points.length) result.push(points); points = [];};
  while (index < tokens.length) {
    const token = tokens[index++];
    if (/^[MLHVZ]$/i.test(token)) command = token.toUpperCase();
    else index--;
    if (command === 'Z') {close(); command = ''; continue;}
    if (command === 'M' || command === 'L') {
      x = Number(tokens[index++]); y = Number(tokens[index++]);
      if (command === 'M' && points.length) close();
      points.push({x, y}); command = 'L';
    } else if (command === 'H') {
      x = Number(tokens[index++]); points.push({x, y});
    } else if (command === 'V') {
      y = Number(tokens[index++]); points.push({x, y});
    }
  }
  close();
  return result;
}

const contours = svgSubpaths(rainyAlleySource.geometry.walkable_path_d);
const squeeze = svgSubpaths(rainyAlleySource.geometry.squeeze_connector.svg_path_d)[0];
export const SQUEEZE_BOUNDS = {left: 478, right: 507, top: 283, bottom: 352} as const;
export const SQUEEZE_OPENING_WIDTH = 12;
export const SQUEEZE_FOOTPRINT_RADIUS = 4;
export const SQUEEZE_CENTER_X = (SQUEEZE_BOUNDS.left + SQUEEZE_BOUNDS.right) / 2;
const squeezeSideWidth = (SQUEEZE_BOUNDS.right - SQUEEZE_BOUNDS.left - SQUEEZE_OPENING_WIDTH) / 2;
const squeezeLeftBlocker = [
  {x: SQUEEZE_BOUNDS.left, y: SQUEEZE_BOUNDS.top}, {x: SQUEEZE_BOUNDS.left + squeezeSideWidth, y: SQUEEZE_BOUNDS.top},
  {x: SQUEEZE_BOUNDS.left + squeezeSideWidth, y: SQUEEZE_BOUNDS.bottom}, {x: SQUEEZE_BOUNDS.left, y: SQUEEZE_BOUNDS.bottom}
];
const squeezeRightBlocker = [
  {x: SQUEEZE_BOUNDS.right - squeezeSideWidth, y: SQUEEZE_BOUNDS.top}, {x: SQUEEZE_BOUNDS.right, y: SQUEEZE_BOUNDS.top},
  {x: SQUEEZE_BOUNDS.right, y: SQUEEZE_BOUNDS.bottom}, {x: SQUEEZE_BOUNDS.right - squeezeSideWidth, y: SQUEEZE_BOUNDS.bottom}
];
const pushcart = svgSubpaths(rainyAlleySource.geometry.obstacle_paths.pushcart)[0];
const gateRect = rainyAlleySource.geometry.conditional_barrier.rect;
const gate = [
  {x: gateRect.x, y: gateRect.y}, {x: gateRect.x + gateRect.width, y: gateRect.y},
  {x: gateRect.x + gateRect.width, y: gateRect.y + gateRect.height}, {x: gateRect.x, y: gateRect.y + gateRect.height}
];
const makePolygon = (id: number, name: string, points: Point[]): WorldPolygon => ({id, name, points});

function geometry(gateClosed: boolean): RainyAlleyGeometry {
  const solids = [
    ...contours.slice(1).map((points, index) => makePolygon(100 + index, `svg_hole_${index + 1}`, points)),
    makePolygon(200, 'pushcart-blocker', pushcart),
    makePolygon(202, 'squeeze-side-left', squeezeLeftBlocker),
    makePolygon(203, 'squeeze-side-right', squeezeRightBlocker)
  ];
  if (gateClosed) solids.push(makePolygon(201, 'crate-gate-hitbox', gate));
  return {
    width: rainyAlleySource.geometry.coordinate_space.width,
    height: rainyAlleySource.geometry.coordinate_space.height,
    walkable: [makePolygon(1, 'walkable', contours[0]), makePolygon(2, 'squeeze-corridor', squeeze)],
    solid: solids,
    randomEventZones: rainyAlleySource.objects.zones.map((zone, index) => ({
      id: 300 + index, name: zone.id, x: zone.x - zone.r, y: zone.y - zone.r, width: zone.r * 2, height: zone.r * 2
    }))
  };
}

export const rainyAlleyGeometryClosed = geometry(true);
export const rainyAlleyGeometryOpen = geometry(false);
export const rainyAlleyFieldClosed = new CollisionField(rainyAlleyGeometryClosed, 2, rainyAlleySource.geometry.player_test_radius_graybox_pixels);
export const rainyAlleyFieldOpen = new CollisionField(rainyAlleyGeometryOpen, 2, rainyAlleySource.geometry.player_test_radius_graybox_pixels);
export const rainyAlleySqueezeFieldClosed = new CollisionField(rainyAlleyGeometryClosed, 2, SQUEEZE_FOOTPRINT_RADIUS);
export const rainyAlleySqueezeFieldOpen = new CollisionField(rainyAlleyGeometryOpen, 2, SQUEEZE_FOOTPRINT_RADIUS);
