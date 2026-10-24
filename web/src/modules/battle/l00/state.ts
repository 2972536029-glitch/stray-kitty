import type {BattleDifficulty, ExtraSupplies} from './types.ts';

export type CatId = 'hero' | 'caster' | 'guard';
export type EnemyType = 'scout' | 'runner';
export type PlaybackSpeed = 0.5 | 1 | 2;
export type CombatPhase = 'ready' | 'hero_danger' | 'caster_rescue' | 'teach_bag' | 'teach_item' | 'teach_target' | 'teach_deploy' | 'teach_move' | 'teach_energy' | 'skill_charge' | 'teach_energy_item' | 'teach_guard_skill' | 'teach_caster_skill' | 'battle' | 'reform' | 'won' | 'failed';
export type TutorialStep = 'open_bag' | 'select_medicine' | 'select_resting_caster' | 'deploy_caster' | 'move_guard' | 'teach_energy' | 'skill_charge' | 'teach_energy_item' | 'teach_guard_skill' | 'teach_caster_skill' | 'battle';
export interface Position {x: number; y: number}
export interface SkillDefinition {name: string; targeting: 'self' | 'area' | 'forward'; cost: number; offsets: readonly Readonly<Position>[]; damage?: number; shield?: number; duration?: number}
export interface CatDefinition {name: string; breed: string; role: string; maxHp: number; combatant: boolean; damage: number; interval: number; block: number; restSlot?: number}
export interface CombatCatState extends CatDefinition, Position {
  id: CatId; hp: number; status: 'active' | 'resting' | 'ready'; cooldown: number;
  attacks: number; damageTaken: number; blockedCount: number; maxBlocks: number;
  energy: number; shield: number; shieldRemaining: number;
  energyItemCooldown: number;
}
export interface EnemyDefinition {name: string; maxHp: number; speed: number; damage: number; interval: number}
export interface CombatEnemy extends EnemyDefinition, Position {id: string; type: EnemyType; hp: number; cooldown: number; blockedBy: CatId | null; scripted?: boolean; training?: boolean}
export interface CombatEffect extends Position {id: string; tx: number; ty: number; kind: string; ttl: number; maxTtl: number; text?: string}
export interface WaveEntry {at: number; type: EnemyType; y: number}
export interface CombatOptions {mode?: 'tutorial' | 'standard'; shadowPressure?: number; difficulty?: BattleDifficulty; extraSupplies?: ExtraSupplies}
export type CombatAction =
  | {type: 'START' | 'RESTART' | 'PAUSE' | 'OPEN_BAG' | 'CLOSE_BAG' | 'REFORM' | 'BEGIN_SKILL_PRACTICE' | 'CANCEL_SKILL'}
  | {type: 'CLEAR_SKILL_TARGET'}
  | {type: 'SET_SPEED'; speed: PlaybackSpeed}
  | {type: 'INSPECT_CAT'; catId: string}
  | {type: 'CLOSE_INSPECTION'}
  | {type: 'SELECT_SKILL'; catId: string}
  | {type: 'AIM_SKILL'; x: number; y: number}
  | {type: 'CAST_SKILL'; catId: string; x?: number; y?: number}
  | {type: 'SELECT_ITEM'; itemId: string}
  | {type: 'SELECT_TARGET'; catId: string}
  | {type: 'USE_ITEM'; itemId: string; catId: string}
  | {type: 'DEPLOY_CAT' | 'MOVE_CAT'; catId: string; x: number; y: number};
export interface CombatState {
  version: 2; phase: CombatPhase; tutorialStep: TutorialStep | null; time: number; phaseTime: number; accumulator: number; sequence: number;
  cats: CombatCatState[]; advisor: {id: 'advisor'; name: string; role: string; visible: boolean; x: number; y: number};
  enemies: CombatEnemy[]; projectiles: CombatEffect[]; effects: CombatEffect[];
  inventory: Record<string, number>; initialInventory: Record<string, number>; healingCooldown: number; energyItemTaught: boolean;
  bagOpen: boolean; selectedItem: string | null; selectedCat: CatId | null;
  skillAim: {catId: 'caster' | 'guard'; target: Position | null} | null;
  playbackSpeed: PlaybackSpeed; inspectedCatId: 'caster' | 'guard' | null;
  wave: number; totalWaves: number; waveTime: number; spawnIndex: number; nextWaveIn: number | null;
  waveCheckpoint: {defeated: number; escaped: number; spawned: number; inventory: Record<string, number>} | null;
  defeated: number; totalEnemies: number; spawned: number; escaped: number;
  leaks: number; maxLeaks: number; reforms: number; paused: boolean; externallyPaused: boolean;
  mode: 'tutorial' | 'standard'; difficulty: BattleDifficulty; requestedPressure: number; effectivePressure: number;
  sourceModifiers: string[]; attemptId?: string; stageId?: string;
  healed: boolean; healingCount: number;
  lastAction: {id: number; type: string; ok: boolean; reason: string} | null;
  logs: {id: string; text: string; time: number}[];
}
export interface Advice {title: string; text: string; action?: 'USE_ITEM' | 'REFORM' | 'RESTART'; itemId?: string; targetId?: string}
