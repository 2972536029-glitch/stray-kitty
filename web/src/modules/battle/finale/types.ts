import type {BattleCarryState} from '../carry';
import type {BattleDifficulty} from '../l00/types';

export type {BattleDifficulty};
export interface Position {x: number; y: number}
export type FinaleCatId = 'caster' | 'guard' | 'tuanzi' | 'bruiser' | 'diandian' | 'momo';
export type CatId = FinaleCatId;
export type EnemyKind = 'scout' | 'runner' | 'heavy';
export interface CatDefinition {
  id: FinaleCatId; name: string; breed: string; role: string; maxHp: number;
  damage: number; interval: number; block: number; range: 'melee' | 'ranged' | 'claws';
  color: string; initial: Position;
}
export interface FinaleCat extends CatDefinition, Position {
  hp: number; energy: number; cooldown: number; shield: number; shieldRemaining: number;
  attackBuffRemaining: number;
  status: 'active' | 'retired';
  attacks: number; skillUses: number; blockedCount: number;
}
export interface FinaleEnemy extends Position {
  id: string; kind: EnemyKind; name: string; hp: number; maxHp: number;
  route: FinaleRouteId; pathIndex: number;
  slowRemaining: number; slowMultiplier: number;
  damage: number; speed: number; interval: number; cooldown: number;
  blockedBy: FinaleCatId | null;
}
export interface FinaleBoss extends Position {
  id: 'eternal-shadow'; name: string; hp: number; maxHp: number;
  width: 3; height: 3;
  tierPhase: 1 | 2; skill: 'sweep' | 'crown';
  phase: 'idle' | 'windup' | 'recovery' | 'defeated'; phaseTime: number;
  cooldown: number; skillCooldown: number; targetCells: Position[];
  attacks: number; slams: number;
}
export interface SkillDefinition {
  name: string; targeting: 'area' | 'self' | 'forward' | 'team'; description: string;
  cost: 100; damage?: number; shield?: number; heal?: number; nightVision?: number; duration?: number;
  attackMultiplier?: number; slowMultiplier?: number; slowDuration?: number;
}
export interface FinaleEffect {
  id: number; kind: 'attack' | 'boss-attack' | 'skill' | 'boss-skill' | 'elite-attack' | 'ally-attack' | 'arrival' | 'inspire' | 'light' | 'night-vision' | 'defeat' | 'shield' | 'heal';
  from: Position; to: Position; remaining: number; cells?: Position[];
}
export interface FinaleState {
  carry: BattleCarryState;
  stageId: 'finale_boss'; difficulty: BattleDifficulty; phase: 'ready' | 'battle' | 'won' | 'lost';
  elapsed: number; accumulator: number; wave: number; totalWaves: number; waveTime: number;
  spawnIndex: number; nextWaveIn: number | null; spawned: number; defeated: number;
  totalEnemies: number; leaks: number; maxLeaks: number;
  boss: FinaleBoss; cats: FinaleCat[]; enemies: FinaleEnemy[];
  nightVisionRemaining: number; lightStage: 0 | 1 | 2 | 3;
  elites: FinaleElite[]; allies: FinaleAlly[];
  paused: boolean; externallyPaused: boolean; uiPaused: boolean; baseSpeed: 0.5 | 1 | 2;
  inspectedCatId: FinaleCatId | null; aim: {catId: FinaleCatId; target: Position | null} | null;
  logs: {id: number; time: number; text: string}[]; effects: FinaleEffect[]; sequence: number;
  lastAction: {ok: boolean; message: string} | null;
  stats: {skills: number; damageTaken: number; dodgedSlams: number};
}
export type FinaleAction =
  | {type: 'START'} | {type: 'USE_CARRY'} | {type: 'RETREAT'} | {type: 'PAUSE'; paused?: boolean}
  | {type: 'SET_EXTERNAL_PAUSE' | 'SET_UI_PAUSE'; paused: boolean}
  | {type: 'SET_SPEED'; speed: 0.5 | 1 | 2}
  | {type: 'INSPECT'; catId: FinaleCatId} | {type: 'CLOSE_INSPECTION'}
  | {type: 'SELECT_SKILL'; catId: FinaleCatId} | {type: 'AIM_SKILL'; x: number; y: number}
  | {type: 'CANCEL_SKILL'} | {type: 'CAST_SKILL'; catId: FinaleCatId; target?: Position}
  | {type: 'MOVE_CAT'; catId: FinaleCatId; x: number; y: number};
export interface FinaleOptions {difficulty?: BattleDifficulty; carry?: unknown}
export type FinaleRouteId = 'upper' | 'lower' | 'branch';
export interface WaveEntry {at: number; kind: EnemyKind; route: FinaleRouteId}

export type EliteId = 'armor-guard' | 'horn-guard';
export interface FinaleElite extends Position {
  id: EliteId; name: string; hp: number; maxHp: number; damage: number; interval: number; range: number;
  cooldown: number; attacks: number; status: 'active' | 'defeated';
}
export type AllyId = 'controller' | 'taotao' | 'yinyin';
export interface AllyDefinition extends Position {
  id: AllyId; name: string; breed: string; role: string; description: string; arriveWave: number;
  maxHp: number; damage: number; interval: number; range: number; color: string;
  slowMultiplier?: number; slowDuration?: number; energyPulse?: number;
}
export interface FinaleAlly extends AllyDefinition {
  hp: number; shield: number; shieldRemaining: number; cooldown: number;
  status: 'waiting' | 'active' | 'retired'; attacks: number; arrivals: number;
}
