/** Integer tile coordinates; a cell occupies [x, x + 1] by [y, y + 1]. */
export interface ScenePerimeterCell {
  x: number;
  y: number;
}

export type ScenePerimeterSide = 'N' | 'E' | 'S' | 'W';
export type ScenePerimeterOpeningKind = 'spawn' | 'goal';

export interface ScenePerimeterOpening extends ScenePerimeterCell {
  kind: ScenePerimeterOpeningKind;
  /** Omit to open all exposed sides of this cell. Interior sides stay absent. */
  side?: ScenePerimeterSide;
}

export interface ScenePerimeterEdge {
  cell: ScenePerimeterCell;
  side: ScenePerimeterSide;
  start: ScenePerimeterCell;
  end: ScenePerimeterCell;
  normal: ScenePerimeterCell;
  outside: ScenePerimeterCell;
  /** Non-null edges are thresholds, never solid curbs or walls. */
  opening: ScenePerimeterOpeningKind | null;
}

export interface ScenePerimeterSegment {
  side: ScenePerimeterSide;
  start: ScenePerimeterCell;
  end: ScenePerimeterCell;
  normal: ScenePerimeterCell;
  opening: ScenePerimeterOpeningKind | null;
  /** Consecutive unit edges, ordered left-to-right or top-to-bottom. */
  edges: ScenePerimeterEdge[];
}

export interface ScenePerimeterOutsideCell extends ScenePerimeterCell {
  edges: ScenePerimeterEdge[];
  /** Keep this entire exterior cell clear of raised beds if any opening touches it. */
  openings: ScenePerimeterOpeningKind[];
}

export interface ScenePerimeterLayout {
  edges: ScenePerimeterEdge[];
  segments: ScenePerimeterSegment[];
  /** Unique four-neighbor cells outside CELLS, including concave recesses and holes. */
  outsideCells: ScenePerimeterOutsideCell[];
}

const sides: readonly ScenePerimeterSide[] = ['N', 'E', 'S', 'W'];
const normals: Record<ScenePerimeterSide, ScenePerimeterCell> = {
  N: {x: 0, y: -1}, E: {x: 1, y: 0}, S: {x: 0, y: 1}, W: {x: -1, y: 0},
};
const key = ({x, y}: ScenePerimeterCell) => `${x},${y}`;
const rowOrder = (a: ScenePerimeterCell, b: ScenePerimeterCell) => a.y - b.y || a.x - b.x;
const validCell = (cell: ScenePerimeterCell) => cell && Number.isSafeInteger(cell.x) && Number.isSafeInteger(cell.y)
  && Math.abs(cell.x) < Number.MAX_SAFE_INTEGER && Math.abs(cell.y) < Number.MAX_SAFE_INTEGER;
const horizontal = (side: ScenePerimeterSide) => side === 'N' || side === 'S';

/** Derive only real exposed tile edges, without a bounding rectangle or pixel scale.
 * Endpoints increase along x or y; normal always points out of the occupied cell.
 * Duplicate cells are ignored. At overlapping spawn/goal openings, goal wins.
 * Multiply coordinates by the tile size and extrude along normal to draw outside combat. */
export function getScenePerimeterLayout(
  cells: readonly ScenePerimeterCell[],
  openings: readonly ScenePerimeterOpening[] = [],
): ScenePerimeterLayout {
  const occupied = new Map<string, ScenePerimeterCell>();
  for (const cell of cells) if (validCell(cell)) occupied.set(key(cell), {x: cell.x, y: cell.y});
  const openingByEdge = new Map<string, ScenePerimeterOpeningKind>();
  for (const opening of openings) {
    if (!validCell(opening) || (opening.kind !== 'spawn' && opening.kind !== 'goal')) continue;
    for (const side of opening.side === undefined ? sides : [opening.side]) {
      const id = `${key(opening)}:${side}`;
      if (openingByEdge.get(id) !== 'goal') openingByEdge.set(id, opening.kind);
    }
  }

  const edges: ScenePerimeterEdge[] = [];
  const outsideByCell = new Map<string, ScenePerimeterOutsideCell>();
  for (const cell of [...occupied.values()].sort(rowOrder)) {
    for (const side of sides) {
      const normal = {...normals[side]};
      const outside = {x: cell.x + normal.x, y: cell.y + normal.y};
      if (occupied.has(key(outside))) continue;
      const start = {x: cell.x + (side === 'E' ? 1 : 0), y: cell.y + (side === 'S' ? 1 : 0)};
      const end = {x: start.x + (horizontal(side) ? 1 : 0), y: start.y + (horizontal(side) ? 0 : 1)};
      const edge: ScenePerimeterEdge = {
        cell, side, start, end, normal, outside,
        opening: openingByEdge.get(`${key(cell)}:${side}`) ?? null,
      };
      edges.push(edge);
      const exterior = outsideByCell.get(key(outside)) ?? {...outside, edges: [], openings: []};
      exterior.edges.push(edge);
      if (edge.opening && !exterior.openings.includes(edge.opening)) exterior.openings.push(edge.opening);
      outsideByCell.set(key(outside), exterior);
    }
  }

  const segments: ScenePerimeterSegment[] = [];
  const sortedEdges = [...edges].sort((a, b) => sides.indexOf(a.side) - sides.indexOf(b.side)
    || (horizontal(a.side) ? a.start.y - b.start.y || a.start.x - b.start.x
      : a.start.x - b.start.x || a.start.y - b.start.y));
  for (const edge of sortedEdges) {
    const previous = segments.at(-1);
    if (previous && previous.side === edge.side && previous.opening === edge.opening
      && previous.end.x === edge.start.x && previous.end.y === edge.start.y) {
      previous.end = {...edge.end};
      previous.edges.push(edge);
    } else {
      segments.push({side: edge.side, start: {...edge.start}, end: {...edge.end}, normal: {...edge.normal},
        opening: edge.opening, edges: [edge]});
    }
  }
  return {edges, segments, outsideCells: [...outsideByCell.values()].sort(rowOrder)};
}
