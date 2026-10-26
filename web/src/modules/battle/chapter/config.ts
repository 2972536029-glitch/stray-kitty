import type {BattleDifficulty, CatDefinition, ChapterCatId, EnemyKind, Position, SkillDefinition, WaveEntry} from './types';

export const MAP = Object.freeze({
  columns: 10, rows: 5, goal: {x: 0, y: 3}, boss: {x: 7, y: 3},
  bossCells: [{x: 7, y: 3}, {x: 8, y: 3}, {x: 7, y: 4}, {x: 8, y: 4}],
  spawns: [{x: 9, y: 3}, {x: 9, y: 4}, {x: 3, y: 0}],
  obstacles: [{x: 4, y: 0}, {x: 4, y: 1}, {x: 4, y: 2}],
});
export const CELLS: readonly Position[] = Object.freeze(Array.from({length: MAP.columns * MAP.rows}, (_, i) => ({x: i % MAP.columns, y: Math.floor(i / MAP.columns)}))
  .filter(({x, y}) => y >= 3 || (x >= 3 && x <= 4)));
export const DIFFICULTIES: Readonly<Record<BattleDifficulty, {label: string; hpMultiplier: number}>> = Object.freeze({
  low: {label: '简单', hpMultiplier: 0.8}, medium: {label: '普通', hpMultiplier: 1}, high: {label: '困难', hpMultiplier: 1.2},
});
export const RULES = Object.freeze({step: 0.05, maxFrameSeconds: 30, maxLeaks: 3, maxCats: 4, waveGap: 5,
  energyPerSecond: 5, maxEnergy: 100,
  bossHp: 2600, bossDamage: 10, bossAttackInterval: 1.8, bossRange: 3,
  bossSlamDamage: 70, bossSlamWindup: 2.8, bossSlamRecovery: 1.2, bossSlamInterval: 18,
});
export const CAT_DEFINITIONS: Readonly<Record<ChapterCatId, CatDefinition>> = Object.freeze({
  caster: {id: 'caster', name: '绒绒', breed: '布偶', role: '星绒术士', maxHp: 80, damage: 20, interval: 0.8, block: 1, range: 'ranged', color: '#cab9e6', initial: {x: 3, y: 3}},
  guard: {id: 'guard', name: '斑斑', breed: '奶牛猫', role: '罐盾卫士', maxHp: 240, damage: 8, interval: 1.1, block: 2, range: 'melee', color: '#e7e8d8', initial: {x: 5, y: 3}},
  tuanzi: {id: 'tuanzi', name: '团子', breed: '橘猫', role: '橘影先锋', maxHp: 220, damage: 28, interval: 1.2, block: 1, range: 'claws', color: '#d39251', initial: {x: 5, y: 4}},
  diandian: {id: 'diandian', name: '点点', breed: '奶牛猫', role: '暖心伙伴', maxHp: 140, damage: 10, interval: 1.1, block: 1, range: 'ranged', color: '#d8ded5', initial: {x: 4, y: 3}},
});
export const SKILLS: Readonly<Record<ChapterCatId, SkillDefinition>> = Object.freeze({
  caster: {name: '星绒绽放', targeting: 'area', cost: 100, damage: 45, description: '任意可用格为中心的五格十字，每名敌人受到 45 点伤害。'},
  guard: {name: '罐盖护盾', targeting: 'self', cost: 100, shield: 60, duration: 8, description: '自身获得 60 护盾，持续 8 秒，不叠加、不治疗。'},
  tuanzi: {name: '橘影连爪', targeting: 'forward', cost: 100, damage: 120, description: '挥爪攻击自身至前两列、上下各一行的可用格，每名敌人受到 120 点伤害。'},
  diandian: {name: '安心呼噜', targeting: 'team', cost: 100, heal: 80, description: '为全部仍在场的战斗猫恢复 80 体力，不超过上限；不能复活已经退场的伙伴。'},
});
export const ENEMY_DEFINITIONS: Readonly<Record<EnemyKind, {name: string; maxHp: number; damage: number; interval: number; speed: number}>> = Object.freeze({
  scout: {name: '巡逻黑影', maxHp: 100, damage: 9, interval: 1.4, speed: 0.55},
  runner: {name: '疾行黑影', maxHp: 70, damage: 6, interval: 1.0, speed: 0.85},
  heavy: {name: '厚衣黑影', maxHp: 210, damage: 15, interval: 1.8, speed: 0.38},
});
export const WAVES: readonly (readonly WaveEntry[])[] = [
  [{at: 0, kind: 'scout', lane: 0}, {at: 2.5, kind: 'scout', lane: 4}, {at: 5, kind: 'runner', lane: 3}],
  [{at: 0, kind: 'scout', lane: 3}, {at: 1.5, kind: 'runner', lane: 0}, {at: 4, kind: 'scout', lane: 4}, {at: 6, kind: 'runner', lane: 3}],
  [{at: 0, kind: 'heavy', lane: 3}, {at: 2, kind: 'scout', lane: 0}, {at: 4.5, kind: 'runner', lane: 4}],
  [{at: 0, kind: 'runner', lane: 0}, {at: 1, kind: 'runner', lane: 4}, {at: 3, kind: 'scout', lane: 3}, {at: 5, kind: 'scout', lane: 0}],
  [{at: 0, kind: 'heavy', lane: 4}, {at: 2, kind: 'scout', lane: 0}, {at: 4, kind: 'runner', lane: 4}, {at: 6, kind: 'scout', lane: 3}],
  [{at: 0, kind: 'scout', lane: 3}, {at: 0.8, kind: 'scout', lane: 0}, {at: 3.5, kind: 'heavy', lane: 4}, {at: 5, kind: 'runner', lane: 0}],
  [{at: 0, kind: 'runner', lane: 3}, {at: 0.8, kind: 'runner', lane: 0}, {at: 3, kind: 'scout', lane: 4}, {at: 5, kind: 'heavy', lane: 3}],
  [{at: 0, kind: 'heavy', lane: 3}, {at: 1, kind: 'heavy', lane: 4}, {at: 3, kind: 'runner', lane: 0}, {at: 4, kind: 'runner', lane: 4}, {at: 7, kind: 'scout', lane: 0}],
];
export const TOTAL_MINIONS = WAVES.reduce((sum, wave) => sum + wave.length, 0);

export function normalizeDifficulty(value: unknown): BattleDifficulty {
  if (value === undefined) return 'medium';
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  throw Object.assign(new Error('战斗难度无效。'), {code: 'INVALID_BATTLE_DIFFICULTY'});
}
