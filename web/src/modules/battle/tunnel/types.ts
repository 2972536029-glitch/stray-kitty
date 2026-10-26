import type {BattleCarryState} from '../carry';
import type {BattleDifficulty} from '../l00/types';

export type {BattleDifficulty};
export interface Position {x: number; y: number}
export type TunnelCatId = 'caster' | 'guard' | 'tuanzi' | 'bruiser' | 'diandian' | 'momo';
export type CatId = TunnelCatId;
export type EnemyKind = 'scout' | 'runner' | 'heavy';
export interface CatDefinition {
  id: TunnelCatId; name: string; breed: string; role: string; maxHp: number;
  damage: number; interval: number; block: number; range: 'melee' | 'ranged' | 'claws';
  color: string; initial: Position;
}
export interface TunnelCat extends CatDefinition, Position {
  hp: number; energy: number; cooldown: number; shield: number; shieldRemaining: number;
  attackBuffRemaining: number;
  status: 'active' | 'retired';
  attacks: number; skillUses: number; blockedCount: number;
}
export interface TunnelEnemy extends Position {
  id: string; kind: EnemyKind; name: string; hp: number; maxHp: number;
  route: TunnelRouteId; pathIndex: number;
  slowRemaining: number; slowMultiplier: number;
  damage: number; speed: number; interval: number; cooldown: number;
  blockedBy: TunnelCatId | null;
}
export interface TunnelBoss extends Position {
  id: 'tunnel-warden'; name: string; hp: number; maxHp: number;
  width: 2; height: 2;
  phase: 'idle' | 'windup' | 'recovery' | 'defeated'; phaseTime: number;
  cooldown: number; skillCooldown: number; targetCells: Position[];
  attacks: number; slams: number;
}
export interface SkillDefinition {
  name: string; targeting: 'area' | 'self' | 'forward' | 'team'; description: string;
  cost: 100; damage?: number; shield?: number; heal?: number; nightVision?: number; duration?: number;
  attackMultiplier?: number; slowMultiplier?: number; slowDuration?: number;
}
export interface TunnelEffect {
  id: number; kind: 'attack' | 'boss-attack' | 'skill' | 'blackout' | 'night-vision' | 'defeat' | 'shield' | 'heal';
  from: Position; to: Position; remaining: number; cells?: Position[];
}
export interface TunnelState {
  carry: BattleCarryState;
  stageId: 'tunnel_boss'; difficulty: BattleDifficulty; phase: 'ready' | 'battle' | 'won' | 'lost';
  elapsed: number; accumulator: number; wave: number; totalWaves: number; waveTime: number;
  spawnIndex: number; nextWaveIn: number | null; spawned: number; defeated: number;
  totalEnemies: number; leaks: number; maxLeaks: number;
  boss: TunnelBoss; cats: TunnelCat[]; enemies: TunnelEnemy[];
  darknessRemaining: number; nightVisionRemaining: number;
  paused: boolean; externallyPaused: boolean; uiPaused: boolean; baseSpeed: 0.5 | 1 | 2;
  inspectedCatId: TunnelCatId | null; aim: {catId: TunnelCatId; target: Position | null} | null;
  logs: {id: number; time: number; text: string}[]; effects: TunnelEffect[]; sequence: number;
  lastAction: {ok: boolean; message: string} | null;
  stats: {skills: number; damageTaken: number};
}
export type TunnelAction =
  | {type: 'START'} | {type: 'USE_CARRY'} | {type: 'RETREAT'} | {type: 'PAUSE'; paused?: boolean}
  | {type: 'SET_EXTERNAL_PAUSE' | 'SET_UI_PAUSE'; paused: boolean}
  | {type: 'SET_SPEED'; speed: 0.5 | 1 | 2}
  | {type: 'INSPECT'; catId: TunnelCatId} | {type: 'CLOSE_INSPECTION'}
  | {type: 'SELECT_SKILL'; catId: TunnelCatId} | {type: 'AIM_SKILL'; x: number; y: number}
  | {type: 'CANCEL_SKILL'} | {type: 'CAST_SKILL'; catId: TunnelCatId; target?: Position}
  | {type: 'MOVE_CAT'; catId: TunnelCatId; x: number; y: number};
export interface TunnelOptions {difficulty?: BattleDifficulty; carry?: unknown}
export type TunnelRouteId = 'upper' | 'lower' | 'branch';
export interface WaveEntry {at: number; kind: EnemyKind; route: TunnelRouteId}
