import {CONFIG, SKILLS} from './config.ts';
import type {CombatCatState, CombatEnemy, Position, SkillDefinition} from './state.ts';

export function isBoardCell(position: Position): boolean {
  return Number.isInteger(position.x) && Number.isInteger(position.y)
    && position.x >= 0 && position.x < CONFIG.COLUMNS && position.y >= 0 && position.y < CONFIG.ROWS;
}

/** Clip cells to the board without translating the original range. Cats face right. */
export function getAttackCells(cat: CombatCatState): Position[] {
  if (!cat.combatant || cat.status !== 'active' || !isBoardCell(cat)) return [];
  const offsets = cat.id === 'guard'
    ? [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1}]
    : Array.from({length: 12}, (_, index) => ({x: Math.floor(index / 3), y: index % 3 - 1}));
  return offsets.map(offset => ({x: cat.x + offset.x, y: cat.y + offset.y})).filter(isBoardCell);
}

export function isEnemyInCells(enemy: CombatEnemy, cells: readonly Position[]): boolean {
  if (enemy.x < 0 || enemy.x > CONFIG.VISIBLE_MAX_X || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) return false;
  const cell = {x: Math.floor(enemy.x + 0.5), y: Math.floor(enemy.y + 0.5)};
  return isBoardCell(cell) && cells.some(position => position.x === cell.x && position.y === cell.y);
}

/** Area skills choose any board cell; self and forward skills keep a fixed origin. */
export function getSkillTargetCells(cat: CombatCatState): Position[] {
  if (!cat.combatant || cat.status !== 'active' || !isBoardCell(cat) || cat.id === 'hero' || SKILLS[cat.id].targeting !== 'area') return [];
  return Array.from({length: CONFIG.COLUMNS * CONFIG.ROWS}, (_, index) => ({x: index % CONFIG.COLUMNS, y: Math.floor(index / CONFIG.COLUMNS)}));
}

export function isSkillTargetAllowed(cat: CombatCatState, position: Position): boolean {
  return isBoardCell(position)
    && getSkillTargetCells(cat).some(cell => cell.x === position.x && cell.y === position.y);
}

/** Shared geometry for self, area and future forward-targeted skills. */
export function getSkillDefinitionCells(cat: CombatCatState, skill: Readonly<SkillDefinition>, target?: Position | null): Position[] {
  if (!cat.combatant || cat.status !== 'active' || !isBoardCell(cat)) return [];
  if (skill.targeting === 'area' && (!target || !isSkillTargetAllowed(cat, target))) return [];
  const origin = skill.targeting === 'area' ? target! : cat;
  return skill.offsets.map(offset => ({x: origin.x + offset.x, y: origin.y + offset.y})).filter(isBoardCell);
}

export function getSkillCells(cat: CombatCatState, target?: Position | null): Position[] {
  return cat.id === 'hero' ? [] : getSkillDefinitionCells(cat, SKILLS[cat.id], target);
}
