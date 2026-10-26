import type {BattleDifficulty, CatDefinition, EnemyKind, GreenhouseCatId, GreenhouseRouteId, Position, SkillDefinition, WaveEntry} from './types';

export const MAP = Object.freeze({
  columns: 9, rows: 6, goal: {x: 0, y: 1}, boss: {x: 5, y: 2},
  bossCells: [{x: 5, y: 2}, {x: 6, y: 2}, {x: 5, y: 3}, {x: 6, y: 3}],
  spawns: [{x: 7, y: 2}, {x: 7, y: 4}, {x: 6, y: 5}],
  obstacles: [{x: 2, y: 2}, {x: 2, y: 3}, {x: 3, y: 3}],
});
/** Missing portions of the outer rectangle are genuinely absent, not decorative terrain. */
export const CELLS: readonly Position[] = Object.freeze([
  ...Array.from({length: 4}, (_, i) => ({x: i + 1, y: 0})),
  ...Array.from({length: 7}, (_, i) => ({x: i, y: 1})),
  ...Array.from({length: 7}, (_, i) => ({x: i + 1, y: 2})),
  ...Array.from({length: 8}, (_, i) => ({x: i + 1, y: 3})),
  ...Array.from({length: 7}, (_, i) => ({x: i + 1, y: 4})),
  {x: 6, y: 5},
]);
/** Each axis-aligned segment traverses existing, unobstructed cells only. */
export const ROUTES: Readonly<Record<GreenhouseRouteId, readonly Position[]>> = Object.freeze({
  upper: [{x: 7, y: 2}, {x: 4, y: 2}, {x: 4, y: 1}, MAP.goal],
  lower: [{x: 7, y: 4}, {x: 1, y: 4}, {x: 1, y: 1}, MAP.goal],
  branch: [{x: 6, y: 5}, {x: 6, y: 4}, {x: 5, y: 4}, {x: 5, y: 3}, {x: 4, y: 3}, {x: 4, y: 1}, MAP.goal],
});
export const DIFFICULTIES: Readonly<Record<BattleDifficulty, {label: string; hpMultiplier: number}>> = Object.freeze({
  low: {label: '简单', hpMultiplier: 0.8}, medium: {label: '普通', hpMultiplier: 1}, high: {label: '困难', hpMultiplier: 1.2},
});
export const RULES = Object.freeze({step: 0.05, maxFrameSeconds: 30, maxLeaks: 3, maxCats: 6, waveGap: 5,
  energyPerSecond: 5, maxEnergy: 100, contactGap: 0.42,
  bossHp: 3000, bossDamage: 12, bossAttackInterval: 2, bossRange: 3,
  bossSeedWindup: 3, bossSeedRecovery: 1, bossSeedFirst: 14, bossSeedInterval: 24,
  thornDuration: 6, thornTickInterval: 1, thornDamage: 12, thornMaxTicks: 6,
});
export const CAT_DEFINITIONS: Readonly<Record<GreenhouseCatId, CatDefinition>> = Object.freeze({
  caster: {id: 'caster', name: '绒绒', breed: '布偶', role: '星绒术士', maxHp: 80, damage: 20, interval: 0.8, block: 1, range: 'ranged', color: '#cab9e6', initial: {x: 3, y: 1}},
  guard: {id: 'guard', name: '斑斑', breed: '奶牛猫', role: '罐盾卫士', maxHp: 240, damage: 8, interval: 1.1, block: 2, range: 'melee', color: '#e7e8d8', initial: {x: 4, y: 2}},
  tuanzi: {id: 'tuanzi', name: '团子', breed: '橘猫', role: '橘影先锋', maxHp: 220, damage: 28, interval: 1.2, block: 1, range: 'claws', color: '#d39251', initial: {x: 4, y: 3}},
  bruiser: {id: 'bruiser', name: '栗栗', breed: '狸花猫', role: '栗盾斗士', maxHp: 240, damage: 16, interval: 1, block: 2, range: 'melee', color: '#b98d68', initial: {x: 3, y: 4}},
  controller: {id: 'controller', name: '铃铃', breed: '银渐层', role: '银铃术士', maxHp: 110, damage: 14, interval: 1, block: 1, range: 'ranged', color: '#afc7cc', initial: {x: 1, y: 4}},
  momo: {id: 'momo', name: '墨墨', breed: '黑猫', role: '巡光护卫', maxHp: 150, damage: 12, interval: 1.1, block: 1, range: 'ranged', color: '#60616d', initial: {x: 2, y: 1}},
});
export const SKILLS: Readonly<Record<GreenhouseCatId, SkillDefinition>> = Object.freeze({
  caster: {name: '星绒绽放', targeting: 'area', cost: 100, damage: 45, description: '以任意通路格为中心的五格十字，每名敌人受到 45 点伤害。'},
  guard: {name: '罐盖护盾', targeting: 'self', cost: 100, shield: 60, duration: 8, description: '自身获得 60 护盾，持续 8 秒；与既有护盾取较大盾值与较长时长，不叠加、不治疗。'},
  tuanzi: {name: '橘影连爪', targeting: 'forward', cost: 100, damage: 120, description: '自身至前两列、上下各一行的通路格，每名敌人受到 120 点伤害。'},
  bruiser: {name: '栗盾奋击', targeting: 'self', cost: 100, shield: 35, duration: 8, attackMultiplier: 1.5, description: '自身获得 35 护盾，普攻伤害提升 50%，持续 8 秒；护盾不叠加，保留既有较高盾值与较长时长。'},
  controller: {name: '银铃缓行', targeting: 'area', cost: 100, damage: 25, slowMultiplier: 0.6, slowDuration: 4, description: '五格十字内敌人受到 25 点伤害，小怪移动速度降低 40%，持续 4 秒。'},
  momo: {name: '巡光护行', targeting: 'team', cost: 100, shield: 45, duration: 8, clearHazards: true, description: '为全部在场伙伴提供 45 护盾，持续 8 秒；与既有护盾取较大值与较长时长，并清除所有已生成荆棘，不取消尚未落地的预告。'},
});
export const ENEMY_DEFINITIONS: Readonly<Record<EnemyKind, {name: string; maxHp: number; damage: number; interval: number; speed: number}>> = Object.freeze({
  scout: {name: '巡逻黑影', maxHp: 100, damage: 9, interval: 1.4, speed: 0.55},
  runner: {name: '疾行黑影', maxHp: 70, damage: 6, interval: 1, speed: 0.85},
  heavy: {name: '厚衣黑影', maxHp: 210, damage: 15, interval: 1.8, speed: 0.38},
});
/** Three entrances alternate; every wave staggers its arrivals. */
export const WAVES: readonly (readonly WaveEntry[])[] = [
  [{at: 0, kind: 'scout', route: 'upper'}, {at: 3, kind: 'scout', route: 'upper'}, {at: 6, kind: 'runner', route: 'lower'}],
  [{at: 0, kind: 'scout', route: 'upper'}, {at: 2, kind: 'runner', route: 'branch'}, {at: 4, kind: 'scout', route: 'lower'}, {at: 6, kind: 'runner', route: 'branch'}],
  [{at: 0, kind: 'heavy', route: 'upper'}, {at: 2.5, kind: 'scout', route: 'upper'}, {at: 5, kind: 'runner', route: 'lower'}, {at: 7, kind: 'scout', route: 'upper'}],
  [{at: 0, kind: 'runner', route: 'branch'}, {at: 1.5, kind: 'runner', route: 'branch'}, {at: 4, kind: 'scout', route: 'lower'}, {at: 6, kind: 'scout', route: 'upper'}],
  [{at: 0, kind: 'heavy', route: 'upper'}, {at: 2, kind: 'scout', route: 'lower'}, {at: 4, kind: 'runner', route: 'upper'}, {at: 6, kind: 'scout', route: 'lower'}],
  [{at: 0, kind: 'scout', route: 'branch'}, {at: 1.5, kind: 'scout', route: 'branch'}, {at: 3.5, kind: 'heavy', route: 'lower'}, {at: 6, kind: 'runner', route: 'upper'}],
  [{at: 0, kind: 'runner', route: 'upper'}, {at: 1.5, kind: 'runner', route: 'upper'}, {at: 3, kind: 'scout', route: 'lower'}, {at: 5, kind: 'heavy', route: 'upper'}, {at: 7, kind: 'scout', route: 'branch'}],
  [{at: 0, kind: 'heavy', route: 'upper'}, {at: 2, kind: 'heavy', route: 'lower'}, {at: 4, kind: 'runner', route: 'branch'}, {at: 6, kind: 'runner', route: 'branch'}, {at: 8, kind: 'scout', route: 'upper'}],
];
export const TOTAL_MINIONS = WAVES.reduce((sum, wave) => sum + wave.length, 0);

export function normalizeDifficulty(value: unknown): BattleDifficulty {
  if (value === undefined) return 'medium';
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  throw Object.assign(new Error('战斗难度无效。'), {code: 'INVALID_BATTLE_DIFFICULTY'});
}
