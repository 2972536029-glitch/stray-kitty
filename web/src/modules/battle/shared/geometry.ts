export interface Position {x: number; y: number}

interface Footprint extends Position {width: number; height: number}
interface RangeCat extends Position {status: 'active' | 'retired'; range: 'melee' | 'ranged' | 'claws'}
type SkillTargeting = 'area' | 'self' | 'forward' | 'team';

export const sameCell = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y;
export const cellName = ({x, y}: Position): string => `${String.fromCharCode(65 + y)}${x + 1}`;
export const inCells = (entity: Position, cells: readonly Position[]): boolean =>
  cells.some(cell => sameCell(cell, {x: Math.round(entity.x), y: Math.round(entity.y)}));

export function footprintCells(entity: Footprint): Position[] {
  return Array.from({length: entity.width * entity.height}, (_, index) => ({
    x: entity.x + index % entity.width, y: entity.y + Math.floor(index / entity.width),
  }));
}

export function footprintDistance(entity: Footprint, target: Position): number {
  return Math.min(...footprintCells(entity).map(cell => Math.abs(cell.x - target.x) + Math.abs(cell.y - target.y)));
}

/** Chapter maps supply their real cells; ranges never fill holes or obstacles. */
export function createBattleGeometry(cells: readonly Position[], obstacles: readonly Position[]) {
  const isCell = (position: Position): boolean =>
    Number.isInteger(position.x) && Number.isInteger(position.y) && cells.some(cell => sameCell(cell, position));
  const isObstacle = (position: Position): boolean => obstacles.some(cell => sameCell(cell, position));
  const isPlayableCell = (position: Position): boolean => isCell(position) && !isObstacle(position);
  const cross = (origin: Position): Position[] => [{x: 0, y: 0}, {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}]
    .map(offset => ({x: origin.x + offset.x, y: origin.y + offset.y})).filter(isPlayableCell);

  function attackCells(cat: RangeCat): Position[] {
    if (cat.status !== 'active') return [];
    const offsets = cat.range === 'melee' ? [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1}]
      : Array.from({length: (cat.range === 'claws' ? 3 : 4) * 3}, (_, i) => ({x: Math.floor(i / 3), y: i % 3 - 1}));
    return offsets.map(offset => ({x: cat.x + offset.x, y: cat.y + offset.y})).filter(isPlayableCell);
  }

  function skillCells(cat: RangeCat, targeting: SkillTargeting, target?: Position | null): Position[] {
    if (cat.status !== 'active') return [];
    switch (targeting) {
      case 'area': return target && isPlayableCell(target) ? cross(target) : [];
      case 'forward': return Array.from({length: 9}, (_, i) => ({x: cat.x + Math.floor(i / 3), y: cat.y + i % 3 - 1})).filter(isPlayableCell);
      case 'team': return cells.filter(isPlayableCell);
      default: return [{x: cat.x, y: cat.y}];
    }
  }

  return {isCell, isObstacle, isPlayableCell, cross, attackCells, skillCells};
}
