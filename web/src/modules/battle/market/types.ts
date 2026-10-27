import type {BattleDifficulty} from '../l00/types';

export type {BattleDifficulty};
export interface Position {x: number; y: number}
export type MarketCatId = 'caster' | 'guard' | 'tuanzi' | 'diandian' | 'bruiser' | 'controller';
export type CatId = MarketCatId;
export type EnemyKind = 'scout' | 'runner' | 'heavy';
export interface CatDefinition {
  id: MarketCatId; name: string; breed: string; role: string; maxHp: number;
  damage: number; interval: number; block: number; range: 'melee' | 'ranged' | 'claws';
  color: string; initial: Position;
}
export interface MarketCat extends CatDefinition, Position {
  hp: number; energy: number; cooldown: number; shield: number; shieldRemaining: number;
  energyBlockedRemaining: number; attackBuffRemaining: number;
  status: 'active' | 'retired';
  attacks: number; skillUses: number; blockedCount: number;
}
export interface MarketEnemy extends Position {
  id: string; kind: EnemyKind; name: string; hp: number; maxHp: number;
  route: MarketRouteId; pathIndex: number;
  slowRemaining: number; slowMultiplier: number;
  damage: number; speed: number; interval: number; cooldown: number;
  blockedBy: MarketCatId | null;
}
export interface MarketBoss extends Position {
  id: 'market-warden'; name: string; hp: number; maxHp: number;
  width: 1; height: 1;
  phase: 'idle' | 'windup' | 'recovery' | 'defeated'; phaseTime: number;
  cooldown: number; skillCooldown: number; targetCells: Position[];
  attacks: number; slams: number; targetRow: 1 | 2 | 3 | null; sweepCursor: number;
}
export interface SkillDefinition {
  name: string; targeting: 'area' | 'self' | 'forward' | 'team'; description: string;
  cost: 100; damage?: number; heal?: number; shield?: number; duration?: number;
  attackMultiplier?: number; slowMultiplier?: number; slowDuration?: number;
}
export interface MarketEffect {
  id: number; kind: 'attack' | 'boss-attack' | 'skill' | 'heal' | 'slam' | 'defeat' | 'shield';
  from: Position; to: Position; remaining: number; cells?: Position[];
}
export interface MarketState {
  stageId: 'market_boss'; difficulty: BattleDifficulty; phase: 'ready' | 'battle' | 'won' | 'lost';
  elapsed: number; accumulator: number; wave: number; totalWaves: number; waveTime: number;
  spawnIndex: number; nextWaveIn: number | null; spawned: number; defeated: number;
  totalEnemies: number; leaks: number; maxLeaks: number;
  boss: MarketBoss; cats: MarketCat[]; enemies: MarketEnemy[];
  paused: boolean; externallyPaused: boolean; uiPaused: boolean; baseSpeed: 0.5 | 1 | 2;
  inspectedCatId: MarketCatId | null; aim: {catId: MarketCatId; target: Position | null} | null;
  logs: {id: number; time: number; text: string}[]; effects: MarketEffect[]; sequence: number;
  lastAction: {ok: boolean; message: string} | null;
  stats: {skills: number; dodgedSlams: number; damageTaken: number};
}
export type MarketAction =
  | {type: 'START'} | {type: 'RETREAT'} | {type: 'PAUSE'; paused?: boolean}
  | {type: 'SET_EXTERNAL_PAUSE' | 'SET_UI_PAUSE'; paused: boolean}
  | {type: 'SET_SPEED'; speed: 0.5 | 1 | 2}
  | {type: 'INSPECT'; catId: MarketCatId} | {type: 'CLOSE_INSPECTION'}
  | {type: 'SELECT_SKILL'; catId: MarketCatId} | {type: 'AIM_SKILL'; x: number; y: number}
  | {type: 'CANCEL_SKILL'} | {type: 'CAST_SKILL'; catId: MarketCatId; target?: Position}
  | {type: 'MOVE_CAT'; catId: MarketCatId; x: number; y: number};
export interface MarketOptions {difficulty?: BattleDifficulty}
export type MarketRouteId = 'north4' | 'north5' | 'eastB' | 'eastC' | 'eastD' | 'south4' | 'south5';
export interface WaveEntry {at: number; kind: EnemyKind; route: MarketRouteId}
