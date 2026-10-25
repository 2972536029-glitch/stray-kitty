import type {BattleDifficulty, CatDefinition, ChapterCatId, EnemyKind, Position, SkillDefinition, Supplies, WaveEntry} from './types';

export const MAP = Object.freeze({
  columns: 12, rows: 5, goal: {x: 0, y: 3}, boss: {x: 9, y: 3},
  bossCells: [{x: 9, y: 3}, {x: 10, y: 3}, {x: 9, y: 4}, {x: 10, y: 4}],
  spawns: [{x: 11, y: 3}, {x: 11, y: 4}, {x: 4, y: 0}],
  obstacles: [{x: 5, y: 0}, {x: 5, y: 1}, {x: 5, y: 2}],
});
export const CELLS: readonly Position[] = Object.freeze(Array.from({length: 60}, (_, i) => ({x: i % 12, y: Math.floor(i / 12)}))
  .filter(({x, y}) => y >= 3 || (x >= 4 && x <= 5)));
export const DIFFICULTIES: Readonly<Record<BattleDifficulty, {label: string; hpMultiplier: number}>> = Object.freeze({
  low: {label: '简单', hpMultiplier: 0.8}, medium: {label: '普通', hpMultiplier: 1}, high: {label: '困难', hpMultiplier: 1.2},
});
export const RULES = Object.freeze({step: 0.05, maxFrameSeconds: 30, maxLeaks: 3, maxCats: 6, waveGap: 5,
  restRatio: 0.25, readyRatio: 0.5, energyPerHit: 10, maxEnergy: 100,
  warmCanHeal: 60, treatEnergy: 30, healingCooldown: 4, energyCooldown: 12,
  bossHp: 2600, bossDamage: 10, bossAttackInterval: 1.8, bossRange: 3,
  bossSlamDamage: 70, bossSlamWindup: 2.8, bossSlamRecovery: 1.2, bossSlamInterval: 18,
});
export const CAT_DEFINITIONS: Readonly<Record<ChapterCatId, CatDefinition>> = Object.freeze({
  caster: {id: 'caster', name: '绒绒', breed: '布偶', role: '星绒术士', maxHp: 80, damage: 20, interval: 0.8, block: 1, range: 'ranged', color: '#cab9e6', initial: {x: 6, y: 3}},
  guard: {id: 'guard', name: '斑斑', breed: '奶牛猫', role: '罐盾卫士', maxHp: 240, damage: 8, interval: 1.1, block: 2, range: 'melee', color: '#e7e8d8', initial: {x: 8, y: 3}},
  tabby: {id: 'tabby', name: '狸花护卫', breed: '狸花', role: '巡巷护卫', maxHp: 170, damage: 15, interval: 0.9, block: 1, range: 'melee', color: '#b89d73', initial: {x: 4, y: 2}},
  hammer: {id: 'hammer', name: '彩狸重锤', breed: '彩狸', role: '破阵重锤', maxHp: 190, damage: 30, interval: 1.8, block: 1, range: 'hammer', color: '#d69e78', initial: {x: 8, y: 4}},
  frost: {id: 'frost', name: '蓝猫寒铃', breed: '蓝猫', role: '寒铃守望', maxHp: 110, damage: 11, interval: 1.05, block: 1, range: 'ranged', color: '#91b7cb', initial: {x: 6, y: 4}},
  singer: {id: 'singer', name: '暹罗歌者', breed: '暹罗', role: '共鸣歌者', maxHp: 115, damage: 10, interval: 1.1, block: 1, range: 'ranged', color: '#d6c8a7', initial: {x: 4, y: 3}},
});
export const SKILLS: Readonly<Record<ChapterCatId, SkillDefinition>> = Object.freeze({
  caster: {name: '星绒绽放', targeting: 'area', cost: 100, damage: 45, description: '任意可用格为中心的五格十字，每名敌人受到 45 点伤害。'},
  guard: {name: '罐盖护盾', targeting: 'self', cost: 100, shield: 60, duration: 8, description: '自身获得 60 护盾，持续 8 秒，不叠加、不治疗。'},
  tabby: {name: '巡巷奋起', targeting: 'self', cost: 100, duration: 8, description: '8 秒内普攻伤害提升 50%，自身获得 35 护盾。'},
  hammer: {name: '破阵重砸', targeting: 'forward', cost: 100, damage: 95, description: '砸向自身至前两列、上下各一行的可用格，每名敌人受到 95 点伤害。'},
  frost: {name: '寒铃霜环', targeting: 'area', cost: 100, damage: 25, duration: 4, description: '五格十字造成 25 点伤害，使普通黑影减速 40%，持续 4 秒；不叠加，固定首领也受到伤害。'},
  singer: {name: '归家和声', targeting: 'team', cost: 100, heal: 55, description: '为全部战斗猫恢复 55 体力，包括休整猫；仍需玩家重新部署休整猫。'},
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

export function normalizeLoadout(value: unknown): Supplies {
  const result: Supplies = {'warm-can': 0, 'bouncy-treat': 0};
  if (value === undefined) return result;
  const fail = () => Object.assign(new Error('出战补给无效：最多携带 4 份暖罐、2 份冻干，共 6 份。'), {code: 'INVALID_CHAPTER_SUPPLIES'});
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !Object.hasOwn(result, key)) throw fail();
    const amount = (value as Record<string, unknown>)[key];
    if (!Number.isSafeInteger(amount) || (amount as number) < 0) throw fail();
    result[key as keyof Supplies] = amount as number;
  }
  if (result['warm-can'] > 4 || result['bouncy-treat'] > 2 || result['warm-can'] + result['bouncy-treat'] > 6) throw fail();
  return result;
}
export function normalizeDifficulty(value: unknown): BattleDifficulty {
  if (value === undefined) return 'medium';
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  throw Object.assign(new Error('战斗难度无效。'), {code: 'INVALID_BATTLE_DIFFICULTY'});
}
