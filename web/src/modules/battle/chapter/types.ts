import type {BattleDifficulty} from '../l00/types';

export type {BattleDifficulty};
export interface Position {x: number; y: number}
export type ChapterCatId = 'caster' | 'guard' | 'tuanzi' | 'diandian';
export type CatId = ChapterCatId;
export type EnemyKind = 'scout' | 'runner' | 'heavy';
export interface CatDefinition {
  id: ChapterCatId; name: string; breed: string; role: string; maxHp: number;
  damage: number; interval: number; block: number; range: 'melee' | 'ranged' | 'claws';
  color: string; initial: Position;
}
export interface ChapterCat extends CatDefinition, Position {
  hp: number; energy: number; cooldown: number; shield: number; shieldRemaining: number;
  status: 'active' | 'retired';
  attacks: number; skillUses: number; blockedCount: number;
}
export interface ChapterEnemy extends Position {
  id: string; kind: EnemyKind; name: string; hp: number; maxHp: number;
  route: 'upper' | 'lower' | 'branch';
  damage: number; speed: number; interval: number; cooldown: number;
  blockedBy: ChapterCatId | null;
}
export interface ChapterBoss extends Position {
  id: 'alley-chief'; name: string; hp: number; maxHp: number;
  width: 2; height: 2;
  phase: 'idle' | 'windup' | 'recovery' | 'defeated'; phaseTime: number;
  cooldown: number; skillCooldown: number; targetCells: Position[];
  attacks: number; slams: number;
}
export interface SkillDefinition {
  name: string; targeting: 'area' | 'self' | 'forward' | 'team'; description: string;
  cost: 100; damage?: number; heal?: number; shield?: number; duration?: number;
}
export interface ChapterEffect {
  id: number; kind: 'attack' | 'boss-attack' | 'skill' | 'heal' | 'slam' | 'defeat' | 'shield';
  from: Position; to: Position; remaining: number; cells?: Position[];
}
export interface ChapterState {
  stageId: 'alley_boss'; difficulty: BattleDifficulty; phase: 'ready' | 'battle' | 'won' | 'lost';
  elapsed: number; accumulator: number; wave: number; totalWaves: number; waveTime: number;
  spawnIndex: number; nextWaveIn: number | null; spawned: number; defeated: number;
  totalEnemies: number; leaks: number; maxLeaks: number;
  boss: ChapterBoss; cats: ChapterCat[]; enemies: ChapterEnemy[];
  paused: boolean; externallyPaused: boolean; uiPaused: boolean; baseSpeed: 0.5 | 1 | 2;
  inspectedCatId: ChapterCatId | null; aim: {catId: ChapterCatId; target: Position | null} | null;
  logs: {id: number; time: number; text: string}[]; effects: ChapterEffect[]; sequence: number;
  lastAction: {ok: boolean; message: string} | null;
  stats: {skills: number; dodgedSlams: number; damageTaken: number};
}
export type ChapterAction =
  | {type: 'START'} | {type: 'RETREAT'} | {type: 'PAUSE'; paused?: boolean}
  | {type: 'SET_EXTERNAL_PAUSE' | 'SET_UI_PAUSE'; paused: boolean}
  | {type: 'SET_SPEED'; speed: 0.5 | 1 | 2}
  | {type: 'INSPECT'; catId: ChapterCatId} | {type: 'CLOSE_INSPECTION'}
  | {type: 'SELECT_SKILL'; catId: ChapterCatId} | {type: 'AIM_SKILL'; x: number; y: number}
  | {type: 'CANCEL_SKILL'} | {type: 'CAST_SKILL'; catId: ChapterCatId; target?: Position}
  | {type: 'MOVE_CAT'; catId: ChapterCatId; x: number; y: number};
export interface ChapterOptions {difficulty?: BattleDifficulty}
export interface WaveEntry {at: number; kind: EnemyKind; lane: 0 | 3 | 4}
