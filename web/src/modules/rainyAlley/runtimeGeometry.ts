import {CollisionField} from './collision';
import {rainyAlleyMapData} from './mapData';
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

const contours = svgSubpaths(rainyAlleyMapData.geometry.walkable_path_d);
const squeeze = svgSubpaths(rainyAlleyMapData.geometry.squeeze_connector.svg_path_d)[0];
export const SQUEEZE_BOUNDS = {left: 478, right: 507, top: 305, bottom: 352} as const;
export const SQUEEZE_OPENING_WIDTH = 12;
export const SQUEEZE_FOOTPRINT_RADIUS = 4;
export const SQUEEZE_CENTER_X = (SQUEEZE_BOUNDS.left + SQUEEZE_BOUNDS.right) / 2;
export const CRATE_CLIMB_RADIUS = 24;
export interface CrateClimb {crateId: 'west' | 'east'; from: Point; to: Point}
export const CRATE_CLIMBS = [
  {crateId: 'west' as const, ends: [{x: 330, y: 382}, {x: 330, y: 314}] as const, rescueRequired: false},
  {crateId: 'east' as const, ends: [{x: 975, y: 380}, {x: 975, y: 445}] as const, rescueRequired: true}
] as const;

export function battleReturnPositionTarget(position: Point | undefined, field: CollisionField): Point | null {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || position.x < 0 || position.x >= field.geometry.width || position.y < 0 || position.y >= field.geometry.height) return null;
  return field.isTraversable(position.x, position.y) ? {...position} : field.nearestTraversable(position, 48);
}

export function crateClimbTarget(point: Point, normalField: CollisionField, rescueComplete: boolean): CrateClimb | null {
  for (const climb of CRATE_CLIMBS) {
    if (climb.rescueRequired && !rescueComplete) continue;
    const [first, second] = climb.ends;
    if (!normalField.isTraversable(first.x, first.y) || !normalField.isTraversable(second.x, second.y)) continue;
    if (Math.hypot(point.x - first.x, point.y - first.y) <= CRATE_CLIMB_RADIUS) return {crateId: climb.crateId, from: first, to: second};
    if (Math.hypot(point.x - second.x, point.y - second.y) <= CRATE_CLIMB_RADIUS) return {crateId: climb.crateId, from: second, to: first};
  }
  return null;
}

export function squeezeExitTarget(normalField: CollisionField, squeezeField: CollisionField, direction: -1 | 1) {
  // Release beyond the narrow mouth so the ordinary footprint can turn again.
  const clearance = normalField.colliderRadius + 6;
  const ideal = {x: SQUEEZE_CENTER_X, y: direction > 0 ? SQUEEZE_BOUNDS.bottom + clearance : SQUEEZE_BOUNDS.top - clearance};
  const target = normalField.nearestTraversable(ideal, 48);
  return target && squeezeField.isTraversable(target.x, target.y) ? target : null;
}

const squeezeSideWidth = (SQUEEZE_BOUNDS.right - SQUEEZE_BOUNDS.left - SQUEEZE_OPENING_WIDTH) / 2;
const squeezeLeftBlocker = [
  {x: SQUEEZE_BOUNDS.left, y: SQUEEZE_BOUNDS.top}, {x: SQUEEZE_BOUNDS.left + squeezeSideWidth, y: SQUEEZE_BOUNDS.top},
  {x: SQUEEZE_BOUNDS.left + squeezeSideWidth, y: SQUEEZE_BOUNDS.bottom}, {x: SQUEEZE_BOUNDS.left, y: SQUEEZE_BOUNDS.bottom}
];
const squeezeRightBlocker = [
  {x: SQUEEZE_BOUNDS.right - squeezeSideWidth, y: SQUEEZE_BOUNDS.top}, {x: SQUEEZE_BOUNDS.right, y: SQUEEZE_BOUNDS.top},
  {x: SQUEEZE_BOUNDS.right, y: SQUEEZE_BOUNDS.bottom}, {x: SQUEEZE_BOUNDS.right - squeezeSideWidth, y: SQUEEZE_BOUNDS.bottom}
];
const gateRect = rainyAlleyMapData.geometry.conditional_barrier.rect;
const pushcart = svgSubpaths(rainyAlleyMapData.geometry.obstacle_paths.pushcart)[0];
const gate = [
  {x: gateRect.x, y: gateRect.y}, {x: gateRect.x + gateRect.width, y: gateRect.y},
  {x: gateRect.x + gateRect.width, y: gateRect.y + gateRect.height}, {x: gateRect.x, y: gateRect.y + gateRect.height}
];
// Registered to the approved background: the small timber crate below the rail.
const westWoodenCrate = [
  {x: 319, y: 349}, {x: 342, y: 349}, {x: 342, y: 372}, {x: 319, y: 372}
];
// The adjacent iron railing is a separate permanent obstacle and is never C-climbable.
const westRailing = [
  {x: 313, y: 327}, {x: 368, y: 327}, {x: 368, y: 346}, {x: 313, y: 346}
];
// Close the narrow seam between the floor edge and the west end of the rail.
// The short segment sits on the boundary, leaving the walkway below it open.
const westRailClosure = [
  {x: 283, y: 327}, {x: 316, y: 327}, {x: 316, y: 330}, {x: 283, y: 330}
];
const makePolygon = (id: number, name: string, points: Point[]): WorldPolygon => ({id, name, points});

function geometry(normalFootprint = true): RainyAlleyGeometry {
  const solids = [
    ...contours.slice(1).map((points, index) => makePolygon(100 + index, `svg_hole_${index + 1}`, points)),
    makePolygon(200, 'pushcart-blocker', pushcart),
    makePolygon(204, 'west-wooden-crate-hitbox', westWoodenCrate),
    makePolygon(205, 'west-railing-hitbox', westRailing),
    makePolygon(206, 'west-railing-gap-closure', westRailClosure),
    makePolygon(202, 'squeeze-side-left', squeezeLeftBlocker),
    makePolygon(203, 'squeeze-side-right', squeezeRightBlocker)
  ];
  // The ordinary footprint must stop on one flush edge, not enter the tiny
  // rounded pocket between the piers and lose sideways movement. The S field
  // omits this lip so the smaller squeezing footprint can traverse normally.
  if (normalFootprint) solids.push(makePolygon(207, 'squeeze-side-upper-mouth-normal-only', [
    {x: SQUEEZE_BOUNDS.left, y: SQUEEZE_BOUNDS.top}, {x: SQUEEZE_BOUNDS.right, y: SQUEEZE_BOUNDS.top},
    {x: SQUEEZE_BOUNDS.right, y: SQUEEZE_BOUNDS.top + 2}, {x: SQUEEZE_BOUNDS.left, y: SQUEEZE_BOUNDS.top + 2}
  ]));
  // The eastern wooden crates remain solid before and after rescue; C is the only crossing.
  solids.push(makePolygon(201, 'crate-gate-hitbox', gate));
  return {
    width: rainyAlleyMapData.geometry.coordinate_space.width,
    height: rainyAlleyMapData.geometry.coordinate_space.height,
    walkable: [makePolygon(1, 'walkable', contours[0]), makePolygon(2, 'squeeze-corridor', squeeze)],
    solid: solids,
    randomEventZones: rainyAlleyMapData.objects.zones.map((zone, index) => ({
      id: 300 + index, name: zone.id, x: zone.x - zone.r, y: zone.y - zone.r, width: zone.r * 2, height: zone.r * 2
    }))
  };
}

export const rainyAlleyGeometryClosed = geometry();
export const rainyAlleyGeometryOpen = geometry();
export const rainyAlleyFieldClosed = new CollisionField(rainyAlleyGeometryClosed, 2, rainyAlleyMapData.geometry.player_test_radius_graybox_pixels);
export const rainyAlleyFieldOpen = new CollisionField(rainyAlleyGeometryOpen, 2, rainyAlleyMapData.geometry.player_test_radius_graybox_pixels);
export const rainyAlleySqueezeFieldClosed = new CollisionField(geometry(false), 2, SQUEEZE_FOOTPRINT_RADIUS);
export const rainyAlleySqueezeFieldOpen = new CollisionField(geometry(false), 2, SQUEEZE_FOOTPRINT_RADIUS);
