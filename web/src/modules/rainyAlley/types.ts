export interface Point {x: number; y: number}

export interface WorldPolygon {
  id: number;
  name: string;
  points: Point[];
}

export interface RainyAlleyGeometry {
  width: number;
  height: number;
  walkable: WorldPolygon[];
  solid: WorldPolygon[];
  randomEventZones: Array<{id: number; name: string; x: number; y: number; width: number; height: number}>;
}

export interface MovementResult {
  position: Point;
  blockedX: boolean;
  blockedY: boolean;
}
