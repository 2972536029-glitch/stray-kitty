import type {CatDefinition, CatId, EnemyDefinition, EnemyType, CombatPhase, TutorialStep, WaveEntry, SkillDefinition, Position} from './state.ts';
import type {BattleDifficulty, BasicSupplyId} from './types.ts';

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
  [{at: 0, type: 'scout', y: 1}, {at: 3, type: 'scout', y: 1}],
  [{at: 0, type: 'scout', y: 1}, {at: 0.6, type: 'scout', y: 1}, {at: 3, type: 'runner', y: 1}, {at: 3.6, type: 'runner', y: 1}],
  [{at: 0, type: 'scout', y: 1}, {at: 0.8, type: 'runner', y: 1}, {at: 3, type: 'scout', y: 1}],
  [{at: 0, type: 'scout', y: 1}, {at: 0.4, type: 'scout', y: 1}, {at: 0.8, type: 'runner', y: 1}, {at: 4, type: 'scout', y: 1}, {at: 4.5, type: 'runner', y: 1}],
] satisfies WaveEntry[][]).map(entries => Object.freeze(entries.map(entry => Object.freeze(entry)))));

export const CONFIG = Object.freeze({
  COLUMNS: 7, ROWS: 3, LANE: 1, STEP: 0.05, MAX_FRAME_SECONDS: 30,
  LOG_LIMIT: 24, EFFECT_SECONDS: 0.55, PROJECTILE_SECONDS: 0.3,
  HERO_MAX_HP: 100, HERO_RESCUE_HP: 50,
  CASTER_MAX_HP: 80, CASTER_DAMAGE: 20, CASTER_INTERVAL: 0.8,
  GUARD_MAX_HP: 240, GUARD_DAMAGE: 8, GUARD_INTERVAL: 1.1,
  MAX_ENERGY: 100, ENERGY_PER_HIT: 10, MAX_DEPLOYED_CATS: 6,
  REST_RATIO: 0.25, READY_RATIO: 0.5,
  MEDICINE_COUNT: 2, MEDICINE_HEAL: 60,
  ENERGY_ITEM_COUNT: 1, ENERGY_ITEM_GAIN: 30,
  MAX_SUPPLIES: 6, MAX_HEALING_SUPPLIES: 4, MAX_ENERGY_SUPPLIES: 2,
  HEALING_ITEM_COOLDOWN: 4, ENERGY_ITEM_COOLDOWN: 12,
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
  caster: Object.freeze({ name: '绒绒', breed: '布偶', role: '星绒术士', maxHp: CONFIG.CASTER_MAX_HP, combatant: true, damage: CONFIG.CASTER_DAMAGE, interval: CONFIG.CASTER_INTERVAL, block: 1, restSlot: 0 }),
  guard: Object.freeze({ name: '斑斑', breed: '奶牛猫', role: '罐盾卫士', maxHp: CONFIG.GUARD_MAX_HP, combatant: true, damage: CONFIG.GUARD_DAMAGE, interval: CONFIG.GUARD_INTERVAL, block: 2, restSlot: 1 }),
});

export const ENEMY_TYPES: Readonly<Record<EnemyType, Readonly<EnemyDefinition>>> = Object.freeze({
  scout: Object.freeze({ name: '巡逻黑影', maxHp: 75, speed: 0.62, damage: 10, interval: 1.2 }),
  runner: Object.freeze({ name: '疾行黑影', maxHp: 50, speed: 1.0, damage: 7, interval: 0.9 }),
});

export interface ItemDefinition {id: BasicSupplyId; name: string; category: 'healing' | 'energy'; heal?: number; energy?: number; description: string}
export const ITEMS: Readonly<Record<string, Readonly<ItemDefinition>>> = Object.freeze({
  'warm-can': Object.freeze({ id: 'warm-can', name: '暖心罐罐', category: 'healing', heal: CONFIG.MEDICINE_HEAL, description: '啪地打开罐盖，为战斗猫恢复 60 点体力；全队治疗间隔 4 秒。' }),
  'bouncy-treat': Object.freeze({ id: 'bouncy-treat', name: '蹦蹦冻干', category: 'energy', energy: CONFIG.ENERGY_ITEM_GAIN, description: '叼住鱼形冻干，为场上战斗猫恢复 30 点能量；同一只猫补能间隔 12 秒。' }),
});
/** Reject malformed/over-cap host loadouts instead of silently discarding supplies. */
export function createSupplyInventory(extra: unknown = undefined): Record<BasicSupplyId, number> {
  const inventory: Record<BasicSupplyId, number> = {'warm-can': CONFIG.MEDICINE_COUNT, 'bouncy-treat': CONFIG.ENERGY_ITEM_COUNT};
  if (extra === undefined) return inventory;
  const invalid = () => Object.assign(new Error('Invalid extra battle supplies: expected up to 2 warm cans and 1 bouncy treat.'), {code: 'INVALID_BATTLE_SUPPLIES'});
  if (!extra || typeof extra !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(extra))) throw invalid();
  for (const key of Reflect.ownKeys(extra)) {
    if (typeof key !== 'string' || !Object.hasOwn(inventory, key)) throw invalid();
    const count: unknown = (extra as Record<string, unknown>)[key];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw invalid();
    inventory[key as BasicSupplyId] += count;
  }
  if (inventory['warm-can'] > CONFIG.MAX_HEALING_SUPPLIES || inventory['bouncy-treat'] > CONFIG.MAX_ENERGY_SUPPLIES
      || Object.values(inventory).reduce((sum, count) => sum + count, 0) > CONFIG.MAX_SUPPLIES) throw invalid();
  return inventory;
}
export const TUTORIAL_TARGETS = Object.freeze({ deploy_caster: Object.freeze({ x: 3, y: 0 }), move_guard: Object.freeze({ x: 4, y: 1 }) });
export const RECOMMENDED_POSITIONS = Object.freeze({ caster: TUTORIAL_TARGETS.deploy_caster, guard: TUTORIAL_TARGETS.move_guard });
export const TUTORIAL_STEPS: Readonly<Partial<Record<CombatPhase, TutorialStep>>> = Object.freeze({ teach_bag: 'open_bag', teach_item: 'select_medicine', teach_target: 'select_resting_caster', teach_deploy: 'deploy_caster', teach_move: 'move_guard', teach_energy: 'teach_energy', skill_charge: 'skill_charge', teach_energy_item: 'teach_energy_item', teach_guard_skill: 'teach_guard_skill', teach_caster_skill: 'teach_caster_skill', battle: 'battle' });
