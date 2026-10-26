import type {BattleDifficulty} from '../l00/types';

export type {BattleDifficulty};
export interface Position {x: number; y: number}
export type GreenhouseCatId = 'caster' | 'guard' | 'tuanzi' | 'bruiser' | 'controller' | 'momo';
export type CatId = GreenhouseCatId;
export type EnemyKind = 'scout' | 'runner' | 'heavy';
export interface CatDefinition {
  id: GreenhouseCatId; name: string; breed: string; role: string; maxHp: number;
  damage: number; interval: number; block: number; range: 'melee' | 'ranged' | 'claws';
  color: string; initial: Position;
}
export interface GreenhouseCat extends CatDefinition, Position {
  hp: number; energy: number; cooldown: number; shield: number; shieldRemaining: number;
  attackBuffRemaining: number;
  status: 'active' | 'retired';
  attacks: number; skillUses: number; blockedCount: number;
}
export interface GreenhouseEnemy extends Position {
  id: string; kind: EnemyKind; name: string; hp: number; maxHp: number;
  route: GreenhouseRouteId; pathIndex: number;
  slowRemaining: number; slowMultiplier: number;
  damage: number; speed: number; interval: number; cooldown: number;
  blockedBy: GreenhouseCatId | null;
}
export interface GreenhouseBoss extends Position {
  id: 'thorn-crown'; name: string; hp: number; maxHp: number;
  width: 2; height: 2;
  phase: 'idle' | 'windup' | 'recovery' | 'defeated'; phaseTime: number;
  cooldown: number; skillCooldown: number; targetCells: Position[];
  attacks: number; slams: number;
}
export interface SkillDefinition {
  name: string; targeting: 'area' | 'self' | 'forward' | 'team'; description: string;
  cost: 100; damage?: number; shield?: number; clearHazards?: boolean; duration?: number;
  attackMultiplier?: number; slowMultiplier?: number; slowDuration?: number;
}
export interface GreenhouseEffect {
  id: number; kind: 'attack' | 'boss-attack' | 'skill' | 'seed' | 'thorn' | 'defeat' | 'shield';
  from: Position; to: Position; remaining: number; cells?: Position[];
}
export interface GreenhouseHazard extends Position {
  id: number; remaining: number; tickIn: number; ticks: number;
}
export interface GreenhouseState {
  stageId: 'greenhouse_boss'; difficulty: BattleDifficulty; phase: 'ready' | 'battle' | 'won' | 'lost';
  elapsed: number; accumulator: number; wave: number; totalWaves: number; waveTime: number;
  spawnIndex: number; nextWaveIn: number | null; spawned: number; defeated: number;
  totalEnemies: number; leaks: number; maxLeaks: number;
  boss: GreenhouseBoss; cats: GreenhouseCat[]; enemies: GreenhouseEnemy[]; hazards: GreenhouseHazard[];
  paused: boolean; externallyPaused: boolean; uiPaused: boolean; baseSpeed: 0.5 | 1 | 2;
  inspectedCatId: GreenhouseCatId | null; aim: {catId: GreenhouseCatId; target: Position | null} | null;
  logs: {id: number; time: number; text: string}[]; effects: GreenhouseEffect[]; sequence: number;
  lastAction: {ok: boolean; message: string} | null;
  stats: {skills: number; dodgedSlams: number; damageTaken: number};
}
export type GreenhouseAction =
  | {type: 'START'} | {type: 'RETREAT'} | {type: 'PAUSE'; paused?: boolean}
  | {type: 'SET_EXTERNAL_PAUSE' | 'SET_UI_PAUSE'; paused: boolean}
  | {type: 'SET_SPEED'; speed: 0.5 | 1 | 2}
  | {type: 'INSPECT'; catId: GreenhouseCatId} | {type: 'CLOSE_INSPECTION'}
  | {type: 'SELECT_SKILL'; catId: GreenhouseCatId} | {type: 'AIM_SKILL'; x: number; y: number}
  | {type: 'CANCEL_SKILL'} | {type: 'CAST_SKILL'; catId: GreenhouseCatId; target?: Position}
  | {type: 'MOVE_CAT'; catId: GreenhouseCatId; x: number; y: number};
export interface GreenhouseOptions {difficulty?: BattleDifficulty}
export type GreenhouseRouteId = 'upper' | 'lower' | 'branch';
export interface WaveEntry {at: number; kind: EnemyKind; route: GreenhouseRouteId}
