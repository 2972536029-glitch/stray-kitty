import type {BattleDifficulty, CatDefinition, EnemyKind, MarketCatId, MarketRouteId, Position, SkillDefinition, WaveEntry} from './types';

export const MAP = Object.freeze({
  columns: 8, rows: 5, goal: {x: 0, y: 2}, boss: {x: 6, y: 2}, bossCells: [{x: 6, y: 2}],
  spawns: [{x: 3, y: 0}, {x: 4, y: 0}, {x: 7, y: 1}, {x: 7, y: 2}, {x: 7, y: 3}, {x: 3, y: 4}, {x: 4, y: 4}],
  obstacles: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 5, y: 0}, {x: 6, y: 0}, {x: 7, y: 0},
    {x: 0, y: 1}, {x: 0, y: 3}, {x: 0, y: 4}, {x: 1, y: 4}, {x: 2, y: 4}, {x: 5, y: 4}, {x: 6, y: 4}, {x: 7, y: 4}],
});
export const CELLS: readonly Position[] = Object.freeze(Array.from({length: 40}, (_, i) => ({x: i % 8, y: Math.floor(i / 8)})));
/** Axis-aligned waypoints include entrance and goal. Opposing vertical entrances merge onto row C. */
export const ROUTES: Readonly<Record<MarketRouteId, readonly Position[]>> = Object.freeze({
  north4: [{x: 3, y: 0}, {x: 3, y: 2}, MAP.goal],
  north5: [{x: 4, y: 0}, {x: 4, y: 2}, MAP.goal],
  eastB: [{x: 7, y: 1}, {x: 1, y: 1}, {x: 1, y: 2}, MAP.goal],
  eastC: [{x: 7, y: 2}, MAP.goal],
  eastD: [{x: 7, y: 3}, {x: 1, y: 3}, {x: 1, y: 2}, MAP.goal],
  south4: [{x: 3, y: 4}, {x: 3, y: 2}, MAP.goal],
  south5: [{x: 4, y: 4}, {x: 4, y: 2}, MAP.goal],
});
export const DIFFICULTIES: Readonly<Record<BattleDifficulty, {label: string; hpMultiplier: number}>> = Object.freeze({
  low: {label: '简单', hpMultiplier: 0.8}, medium: {label: '普通', hpMultiplier: 1}, high: {label: '困难', hpMultiplier: 1.2},
});
export const RULES = Object.freeze({step: 0.05, maxFrameSeconds: 30, maxLeaks: 3, maxCats: 6, waveGap: 5,
  energyPerSecond: 5, maxEnergy: 100, contactGap: 0.42,
  bossHp: 1800, bossDamage: 8, bossAttackInterval: 2.2, bossRange: 3,
  bossSweepDamage: 45, bossSweepWindup: 3, bossSweepRecovery: 1, bossSweepFirst: 14,
  bossSweepInterval: 24, bossEnergyBlockDuration: 4,
});
export const CAT_DEFINITIONS: Readonly<Record<MarketCatId, CatDefinition>> = Object.freeze({
  caster: {id: 'caster', name: '绒绒', breed: '布偶', role: '星绒术士', maxHp: 80, damage: 20, interval: 0.8, block: 1, range: 'ranged', color: '#cab9e6', initial: {x: 2, y: 1}},
  guard: {id: 'guard', name: '斑斑', breed: '奶牛猫', role: '罐盾卫士', maxHp: 240, damage: 8, interval: 1.1, block: 2, range: 'melee', color: '#e7e8d8', initial: {x: 4, y: 1}},
  tuanzi: {id: 'tuanzi', name: '团子', breed: '橘猫', role: '橘影先锋', maxHp: 220, damage: 28, interval: 1.2, block: 1, range: 'claws', color: '#d39251', initial: {x: 4, y: 2}},
  diandian: {id: 'diandian', name: '点点', breed: '奶牛猫', role: '暖心伙伴', maxHp: 140, damage: 10, interval: 1.1, block: 1, range: 'ranged', color: '#d8ded5', initial: {x: 2, y: 2}},
  bruiser: {id: 'bruiser', name: '栗栗', breed: '狸花猫', role: '栗盾斗士', maxHp: 240, damage: 16, interval: 1, block: 2, range: 'melee', color: '#b98d68', initial: {x: 4, y: 3}},
  controller: {id: 'controller', name: '铃铃', breed: '银渐层', role: '银铃术士', maxHp: 110, damage: 14, interval: 1, block: 1, range: 'ranged', color: '#afc7cc', initial: {x: 2, y: 3}},
});
export const SKILLS: Readonly<Record<MarketCatId, SkillDefinition>> = Object.freeze({
  caster: {name: '星绒绽放', targeting: 'area', cost: 100, damage: 45, description: '以任意通路格为中心的五格十字，每名敌人受到 45 点伤害。'},
  guard: {name: '罐盖护盾', targeting: 'self', cost: 100, shield: 60, duration: 8, description: '自身获得 60 护盾，持续 8 秒，不叠加、不治疗。'},
  tuanzi: {name: '橘影连爪', targeting: 'forward', cost: 100, damage: 120, description: '自身至前两列、上下各一行的通路格，每名敌人受到 120 点伤害。'},
  diandian: {name: '安心呼噜', targeting: 'team', cost: 100, heal: 80, description: '为仍在场的全部伙伴恢复 80 体力，不能复活退场伙伴。'},
  bruiser: {name: '栗盾奋击', targeting: 'self', cost: 100, shield: 35, duration: 8, attackMultiplier: 1.5, description: '自身获得 35 护盾，普攻伤害提升 50%，持续 8 秒。'},
  controller: {name: '银铃缓行', targeting: 'area', cost: 100, damage: 25, slowMultiplier: 0.6, slowDuration: 4, description: '五格十字内敌人受到 25 点伤害，小怪移动速度降低 40%，持续 4 秒。'},
});
export const ENEMY_DEFINITIONS: Readonly<Record<EnemyKind, {name: string; maxHp: number; damage: number; interval: number; speed: number}>> = Object.freeze({
  scout: {name: '巡逻黑影', maxHp: 100, damage: 9, interval: 1.4, speed: 0.55},
  runner: {name: '疾行黑影', maxHp: 70, damage: 6, interval: 1, speed: 0.85},
  heavy: {name: '厚衣黑影', maxHp: 210, damage: 15, interval: 1.8, speed: 0.38},
});
/** Seven entrances take turns: no wave opens more than one entrance at the same instant. */
export const WAVES: readonly (readonly WaveEntry[])[] = [
  [{at: 0, kind: 'scout', route: 'north4'}, {at: 3, kind: 'scout', route: 'eastC'}, {at: 6, kind: 'runner', route: 'south4'}],
  [{at: 0, kind: 'scout', route: 'eastB'}, {at: 2, kind: 'runner', route: 'north5'}, {at: 4, kind: 'scout', route: 'eastD'}, {at: 6, kind: 'runner', route: 'south5'}],
  [{at: 0, kind: 'heavy', route: 'eastC'}, {at: 2.5, kind: 'scout', route: 'north4'}, {at: 5, kind: 'runner', route: 'south4'}, {at: 7, kind: 'scout', route: 'eastB'}],
  [{at: 0, kind: 'runner', route: 'north5'}, {at: 1.5, kind: 'runner', route: 'south5'}, {at: 4, kind: 'scout', route: 'eastD'}, {at: 6, kind: 'scout', route: 'eastC'}],
  [{at: 0, kind: 'heavy', route: 'eastB'}, {at: 2, kind: 'scout', route: 'south4'}, {at: 4, kind: 'runner', route: 'north4'}, {at: 6, kind: 'scout', route: 'eastD'}],
  [{at: 0, kind: 'scout', route: 'north5'}, {at: 1.5, kind: 'scout', route: 'south5'}, {at: 3.5, kind: 'heavy', route: 'eastD'}, {at: 6, kind: 'runner', route: 'eastC'}],
  [{at: 0, kind: 'runner', route: 'eastB'}, {at: 1.5, kind: 'runner', route: 'north4'}, {at: 3, kind: 'scout', route: 'south4'}, {at: 5, kind: 'heavy', route: 'eastC'}, {at: 7, kind: 'scout', route: 'south5'}],
  [{at: 0, kind: 'heavy', route: 'eastC'}, {at: 2, kind: 'heavy', route: 'eastD'}, {at: 4, kind: 'runner', route: 'north5'}, {at: 6, kind: 'runner', route: 'south5'}, {at: 8, kind: 'scout', route: 'eastB'}],
];
export const TOTAL_MINIONS = WAVES.reduce((sum, wave) => sum + wave.length, 0);

export function normalizeDifficulty(value: unknown): BattleDifficulty {
  if (value === undefined) return 'medium';
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  throw Object.assign(new Error('战斗难度无效。'), {code: 'INVALID_BATTLE_DIFFICULTY'});
}
