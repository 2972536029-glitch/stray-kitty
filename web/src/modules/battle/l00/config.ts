import type {CatDefinition, CatId, EnemyDefinition, EnemyType, CombatPhase, TutorialStep, WaveEntry, SkillDefinition, Position} from './state.ts';
import type {BattleDifficulty} from './types.ts';

export const DIFFICULTY_CONFIG: Readonly<Record<BattleDifficulty, Readonly<{label: string; enemyHpMultiplier: number}>>> = Object.freeze({
  low: Object.freeze({label: '简单', enemyHpMultiplier: 0.8}),
  medium: Object.freeze({label: '普通', enemyHpMultiplier: 1}),
  high: Object.freeze({label: '困难', enemyHpMultiplier: 1.2}),
});

/** Validate the host boundary; only an omitted value receives the default. */
export function normalizeDifficulty(value: unknown): BattleDifficulty {
  if (value === undefined) return 'medium';
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  throw Object.assign(new Error('Invalid battle difficulty: expected low, medium or high.'), {code: 'INVALID_BATTLE_DIFFICULTY'});
}

/** Alternating small groups, relief waves and a final mixed push, all from B7. */
export const WAVES: readonly (readonly Readonly<WaveEntry>[])[] = Object.freeze(([
  [{at: 0, type: 'scout', y: 1}, {at: 3, type: 'scout', y: 1}],
  [{at: 0, type: 'scout', y: 1}, {at: 2.5, type: 'runner', y: 1}, {at: 5, type: 'scout', y: 1}],
  [{at: 0, type: 'scout', y: 1}, {at: 0.65, type: 'scout', y: 1}, {at: 4, type: 'runner', y: 1}],
  [{at: 0, type: 'scout', y: 1}, {at: 1.5, type: 'runner', y: 1}],
  [{at: 0, type: 'scout', y: 1}, {at: 0.4, type: 'scout', y: 1}, {at: 0.8, type: 'runner', y: 1}, {at: 5, type: 'scout', y: 1}],
  [{at: 0, type: 'runner', y: 1}, {at: 1.8, type: 'runner', y: 1}, {at: 4, type: 'scout', y: 1}],
] satisfies WaveEntry[][]).map(entries => Object.freeze(entries.map(entry => Object.freeze(entry)))));

export const CONFIG = Object.freeze({
  COLUMNS: 7, ROWS: 3, LANE: 1, STEP: 0.05, MAX_FRAME_SECONDS: 30,
  LOG_LIMIT: 24, EFFECT_SECONDS: 0.55, PROJECTILE_SECONDS: 0.3,
  HERO_MAX_HP: 100, HERO_RESCUE_HP: 50,
  CASTER_MAX_HP: 80, CASTER_DAMAGE: 20, CASTER_INTERVAL: 0.8,
  GUARD_MAX_HP: 240, GUARD_DAMAGE: 8, GUARD_INTERVAL: 1.1,
  MAX_ENERGY: 100, ENERGY_PER_SECOND: 5, MAX_DEPLOYED_CATS: 2,
  SCRIPT_ENEMY_HP: 240, SCRIPT_ENEMY_DAMAGE: 15, SCRIPT_ENEMY_INTERVAL: 1,
  SPAWN_X: 6.7, VISIBLE_MAX_X: 6, CONTACT_GAP: 0.55,
  GOAL_X: 0, GOAL_Y: 1, TURN_COLUMN_X: 0,
  WAVE_GAP: 5, TOTAL_WAVES: WAVES.length,
  // The opening pursuer counts once; the practice dummy never counts.
  TOTAL_ENEMIES: 1 + WAVES.reduce((total, wave) => total + wave.length, 0),
  MAX_LEAKS: 3, LEAK_DAMAGE: 10,
});

export const SKILLS: Readonly<Record<'caster' | 'guard', Readonly<SkillDefinition>>> = Object.freeze({
  caster: Object.freeze({name: '星绒绽放', targeting: 'area', cost: 100, damage: 45,
    offsets: Object.freeze([{x: 0, y: 0}, {x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1}].map(offset => Object.freeze(offset)))}),
  guard: Object.freeze({name: '罐盖护盾', targeting: 'self', cost: 100, shield: 60, duration: 8,
    offsets: Object.freeze([{x: 0, y: 0}].map(offset => Object.freeze(offset)))}),
});

/** B1 stays reserved even while the opening scene temporarily places the hero at B4. */
export const COMMANDER_POSITION = Object.freeze({x: CONFIG.GOAL_X, y: CONFIG.GOAL_Y});

/** B7 is this stage's only spawn entrance; the corner cells remain deployable. */
export const SPAWN_POINTS: readonly Readonly<Position>[] = Object.freeze(
  [Object.freeze({x: CONFIG.COLUMNS - 1, y: CONFIG.LANE})],
);
export function isSpawnCell(x: number, y: number): boolean {
  return SPAWN_POINTS.some(point => point.x === x && point.y === y);
}

export const CAT_TYPES: Readonly<Record<CatId, Readonly<CatDefinition>>> = Object.freeze({
  hero: Object.freeze({ name: '喵喵', breed: '金吉拉', role: '后方指挥', maxHp: CONFIG.HERO_MAX_HP, combatant: false, damage: 0, interval: 1, block: 0 }),
  caster: Object.freeze({ name: '绒绒', breed: '布偶', role: '星绒术士', maxHp: CONFIG.CASTER_MAX_HP, combatant: true, damage: CONFIG.CASTER_DAMAGE, interval: CONFIG.CASTER_INTERVAL, block: 1 }),
  guard: Object.freeze({ name: '斑斑', breed: '奶牛猫', role: '罐盾卫士', maxHp: CONFIG.GUARD_MAX_HP, combatant: true, damage: CONFIG.GUARD_DAMAGE, interval: CONFIG.GUARD_INTERVAL, block: 2 }),
});

export const ENEMY_TYPES: Readonly<Record<EnemyType, Readonly<EnemyDefinition>>> = Object.freeze({
  scout: Object.freeze({ name: '巡逻黑影', maxHp: 75, speed: 0.62, damage: 10, interval: 1.2 }),
  runner: Object.freeze({ name: '疾行黑影', maxHp: 50, speed: 1.0, damage: 7, interval: 0.9 }),
});

export const TUTORIAL_TARGETS = Object.freeze({ position_caster: Object.freeze({ x: 3, y: 0 }), move_guard: Object.freeze({ x: 4, y: 1 }) });
export const RECOMMENDED_POSITIONS = Object.freeze({ caster: TUTORIAL_TARGETS.position_caster, guard: TUTORIAL_TARGETS.move_guard });
export const TUTORIAL_STEPS: Readonly<Partial<Record<CombatPhase, TutorialStep>>> = Object.freeze({ teach_position: 'position_caster', teach_move: 'move_guard', teach_energy: 'teach_energy', skill_charge: 'skill_charge', teach_guard_skill: 'teach_guard_skill', teach_caster_skill: 'teach_caster_skill', battle: 'battle' });
