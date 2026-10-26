import type {AllyDefinition, BattleDifficulty, CatDefinition, EnemyKind, FinaleCatId, FinaleRouteId, Position, SkillDefinition, WaveEntry} from './types';

export const MAP = Object.freeze({
  columns: 12, rows: 7, goal: {x: 1, y: 3}, boss: {x: 8, y: 2},
  bossCells: Array.from({length: 9}, (_, i) => ({x: 8 + i % 3, y: 2 + Math.floor(i / 3)})),
  eliteCells: [{x: 8, y: 1}, {x: 8, y: 5}],
  spawns: [{x: 10, y: 0}, {x: 11, y: 3}, {x: 10, y: 6}],
  obstacles: [{x: 3, y: 0}, {x: 4, y: 0}, {x: 1, y: 1}, {x: 2, y: 1}, {x: 10, y: 1}, {x: 11, y: 1},
    {x: 0, y: 2}, {x: 6, y: 2}, {x: 0, y: 3}, {x: 0, y: 4}, {x: 6, y: 4},
    {x: 1, y: 5}, {x: 2, y: 5}, {x: 10, y: 5}, {x: 11, y: 5}, {x: 3, y: 6}, {x: 4, y: 6}],
  lightWaypoints: [{x: 2, y: 3}, {x: 4, y: 3}, {x: 6, y: 3}, {x: 7, y: 3}],
});
/** The warehouse balconies form an irregular 74-cell footprint. */
export const CELLS: readonly Position[] = Object.freeze(Array.from({length: 7}, (_, y) => {
  const start = y === 0 || y === 6 ? 3 : y === 1 || y === 5 ? 1 : 0;
  const end = y === 0 || y === 6 ? 10 : 11;
  return Array.from({length: end - start + 1}, (_, i) => ({x: start + i, y}));
}).flat());
export const ROUTES: Readonly<Record<FinaleRouteId, readonly Position[]>> = Object.freeze({
  upper: [{x: 10, y: 0}, {x: 5, y: 0}, {x: 5, y: 2}, {x: 2, y: 2}, {x: 2, y: 3}, MAP.goal],
  lower: [{x: 10, y: 6}, {x: 5, y: 6}, {x: 5, y: 4}, {x: 2, y: 4}, {x: 2, y: 3}, MAP.goal],
  branch: [{x: 11, y: 3}, MAP.goal],
});
export const ALLY_DEFINITIONS: readonly AllyDefinition[] = Object.freeze([
  {id: 'controller', name: '铃铃', breed: '银渐层', role: '高台缓行', description: '固定高台自动射击，普通小怪减速25%持续2秒；不能移动，不计入主力人数。', x: 4, y: 1, arriveWave: 3, maxHp: 140, damage: 12, interval: 1.6, range: 5, color: '#afc7cc', slowMultiplier: 0.75, slowDuration: 2},
  {id: 'taotao', name: '桃桃', breed: '三花猫', role: '聚光炮台', description: '固定高台自动发射聚光弹，攻击范围内的小怪、精英或首领；不能移动。', x: 4, y: 5, arriveWave: 5, maxHp: 140, damage: 18, interval: 2, range: 5, color: '#d6b18a'},
  {id: 'yinyin', name: '音音', breed: '白猫', role: '合声鼓舞', description: '固定支援位，每5秒为全部仍在场主力补充5能量；不代替手动释放技能。', x: 3, y: 5, arriveWave: 7, maxHp: 120, damage: 0, interval: 5, range: 0, color: '#e8e3d2', energyPulse: 5},
]);
export const DIFFICULTIES: Readonly<Record<BattleDifficulty, {label: string; hpMultiplier: number}>> = Object.freeze({
  low: {label: '简单', hpMultiplier: 0.8}, medium: {label: '普通', hpMultiplier: 1}, high: {label: '困难', hpMultiplier: 1.2},
});
export const RULES = Object.freeze({step: 0.05, maxFrameSeconds: 30, maxLeaks: 3, maxCats: 6, waveGap: 5,
  energyPerSecond: 5, maxEnergy: 100, contactGap: 0.42,
  bossHp: 6500, bossDamage: 14, bossAttackInterval: 2.4, bossRange: 4,
  bossSkillWindup: 3, bossSkillRecovery: 1, bossSkillFirst: 24, bossSkillInterval: 24,
  bossSweepDamage: 90, bossCrownDamage: 95,
  eliteHp: 950, eliteDamage: 8, eliteAttackInterval: 2.6, eliteRange: 4,
  armorMultiplier: 0.55, lightArmorStep: 0.1, hornDamageMultiplier: 1.2,
});
export const CAT_DEFINITIONS: Readonly<Record<FinaleCatId, CatDefinition>> = Object.freeze({
  caster: {id: 'caster', name: '绒绒', breed: '布偶', role: '星绒术士', maxHp: 80, damage: 20, interval: 0.8, block: 1, range: 'ranged', color: '#cab9e6', initial: {x: 6, y: 1}},
  guard: {id: 'guard', name: '斑斑', breed: '奶牛猫', role: '罐盾卫士', maxHp: 240, damage: 8, interval: 1.1, block: 2, range: 'melee', color: '#e7e8d8', initial: {x: 4, y: 2}},
  tuanzi: {id: 'tuanzi', name: '团子', breed: '橘猫', role: '橘影先锋', maxHp: 220, damage: 28, interval: 1.2, block: 1, range: 'claws', color: '#d39251', initial: {x: 7, y: 3}},
  bruiser: {id: 'bruiser', name: '栗栗', breed: '狸花猫', role: '栗盾斗士', maxHp: 240, damage: 16, interval: 1, block: 2, range: 'melee', color: '#b98d68', initial: {x: 4, y: 4}},
  diandian: {id: 'diandian', name: '点点', breed: '暹罗猫', role: '暖心伙伴', maxHp: 140, damage: 10, interval: 1.1, block: 1, range: 'ranged', color: '#d9c7a8', initial: {x: 3, y: 3}},
  momo: {id: 'momo', name: '墨墨', breed: '黑猫', role: '巡光护卫', maxHp: 150, damage: 12, interval: 1.1, block: 1, range: 'ranged', color: '#60616d', initial: {x: 6, y: 5}},
});
export const SKILLS: Readonly<Record<FinaleCatId, SkillDefinition>> = Object.freeze({
  caster: {name: '星绒绽放', targeting: 'area', cost: 100, damage: 45, description: '以任意通路格为中心的五格十字，每名敌人受到 45 点伤害。'},
  guard: {name: '罐盖护盾', targeting: 'self', cost: 100, shield: 60, duration: 8, description: '自身获得 60 护盾，持续 8 秒；与既有护盾取较大盾值与较长时长，不叠加、不治疗。'},
  tuanzi: {name: '橘影连爪', targeting: 'forward', cost: 100, damage: 120, description: '自身至前两列、上下各一行的通路格，每名敌人受到 120 点伤害。'},
  bruiser: {name: '栗盾奋击', targeting: 'self', cost: 100, shield: 35, duration: 8, attackMultiplier: 1.5, description: '自身获得 35 护盾，普攻伤害提升 50%，持续 8 秒；护盾不叠加，保留既有较高盾值与较长时长。'},
  diandian: {name: '安心呼噜', targeting: 'team', cost: 100, heal: 80, description: '为全部仍在场伙伴恢复 80 体力，不超过体力上限，不能复活已经退场的伙伴。'},
  momo: {name: '夜视护行', targeting: 'team', cost: 100, shield: 45, duration: 8, nightVision: 10, description: '以夜视照破首领影幕 10 秒，为全部在场主力和援军提供 45 护盾，持续 8 秒。与既有护盾取较大值与较长时长，不叠加、不治疗。'},
});
export const ENEMY_DEFINITIONS: Readonly<Record<EnemyKind, {name: string; maxHp: number; damage: number; interval: number; speed: number}>> = Object.freeze({
  scout: {name: '巡逻黑影', maxHp: 100, damage: 9, interval: 1.4, speed: 0.55},
  runner: {name: '疾行黑影', maxHp: 70, damage: 6, interval: 1, speed: 0.85},
  heavy: {name: '厚衣黑影', maxHp: 210, damage: 15, interval: 1.8, speed: 0.38},
});
/** Long flanking routes and a direct middle route open at staggered times. */
export const WAVES: readonly (readonly WaveEntry[])[] = [
  [{at: 0, kind: 'scout', route: 'upper'}, {at: 4, kind: 'scout', route: 'lower'}, {at: 8, kind: 'runner', route: 'branch'}, {at: 12, kind: 'scout', route: 'upper'}],
  [{at: 0, kind: 'scout', route: 'lower'}, {at: 4, kind: 'runner', route: 'upper'}, {at: 8, kind: 'scout', route: 'branch'}, {at: 12, kind: 'runner', route: 'lower'}],
  [{at: 0, kind: 'heavy', route: 'upper'}, {at: 4, kind: 'scout', route: 'lower'}, {at: 8, kind: 'runner', route: 'branch'}, {at: 12, kind: 'scout', route: 'upper'}],
  [{at: 0, kind: 'heavy', route: 'lower'}, {at: 4, kind: 'scout', route: 'upper'}, {at: 8, kind: 'scout', route: 'branch'}, {at: 12, kind: 'runner', route: 'lower'}],
  [{at: 0, kind: 'heavy', route: 'upper'}, {at: 4, kind: 'runner', route: 'lower'}, {at: 8, kind: 'scout', route: 'branch'}, {at: 12, kind: 'scout', route: 'upper'}],
  [{at: 0, kind: 'heavy', route: 'lower'}, {at: 4, kind: 'scout', route: 'upper'}, {at: 8, kind: 'runner', route: 'branch'}, {at: 12, kind: 'scout', route: 'lower'}],
  [{at: 0, kind: 'heavy', route: 'upper'}, {at: 3, kind: 'heavy', route: 'lower'}, {at: 7, kind: 'scout', route: 'branch'}, {at: 11, kind: 'runner', route: 'upper'}, {at: 15, kind: 'runner', route: 'lower'}],
  [{at: 0, kind: 'heavy', route: 'lower'}, {at: 3, kind: 'scout', route: 'upper'}, {at: 7, kind: 'heavy', route: 'branch'}, {at: 11, kind: 'runner', route: 'lower'}, {at: 15, kind: 'scout', route: 'upper'}],
  [{at: 0, kind: 'heavy', route: 'upper'}, {at: 3, kind: 'heavy', route: 'lower'}, {at: 7, kind: 'runner', route: 'branch'}, {at: 11, kind: 'runner', route: 'upper'}, {at: 15, kind: 'scout', route: 'lower'}],
  [{at: 0, kind: 'heavy', route: 'lower'}, {at: 3, kind: 'heavy', route: 'upper'}, {at: 7, kind: 'heavy', route: 'branch'}, {at: 11, kind: 'runner', route: 'lower'}, {at: 15, kind: 'runner', route: 'upper'}],
];
export const TOTAL_MINIONS = WAVES.reduce((sum, wave) => sum + wave.length, 0);

export function normalizeDifficulty(value: unknown): BattleDifficulty {
  if (value === undefined) return 'medium';
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  throw Object.assign(new Error('战斗难度无效。'), {code: 'INVALID_BATTLE_DIFFICULTY'});
}
