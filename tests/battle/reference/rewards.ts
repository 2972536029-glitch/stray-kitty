// Historical preview reference for regression tests; never use for production settlement.
import type {BasicSupplyId, BattleDifficulty} from '../../../web/src/modules/battle/l00/types.ts';

export type SupplyCounts = Record<BasicSupplyId, number>;
export const REWARD_COUNTS: Readonly<Record<BattleDifficulty, number>> = Object.freeze({low: 2, medium: 3, high: 4});
export const L00_STAGE_ID = 'alley_rescue';
export const L00_FIRST_CLEAR_BONUS = 2;
export const BASIC_REWARD_POOL = Object.freeze([
  Object.freeze({id: 'warm-can' as const, probability: 0.7}),
  Object.freeze({id: 'bouncy-treat' as const, probability: 0.3}),
]);

export interface RewardGrant {
  rewards: SupplyCounts;
  baseRewardCount: number;
  firstClearBonus: number;
  rewardCount: number;
}

/** A supply is a consumable portion; this pool includes only usable, implemented items. */
export function createBattleRewards(
  difficulty: BattleDifficulty, stageId: string, firstClear: boolean, random: () => number = Math.random,
): RewardGrant {
  if (typeof difficulty !== 'string' || !Object.hasOwn(REWARD_COUNTS, difficulty)) throw new Error('Invalid reward difficulty.');
  if (typeof stageId !== 'string' || !stageId.length || typeof firstClear !== 'boolean' || typeof random !== 'function') {
    throw new Error('Invalid reward request.');
  }
  const baseRewardCount = REWARD_COUNTS[difficulty];
  const firstClearBonus = stageId === L00_STAGE_ID && firstClear ? L00_FIRST_CLEAR_BONUS : 0;
  const rewardCount = baseRewardCount + firstClearBonus;
  const rewards: SupplyCounts = {'warm-can': 0, 'bouncy-treat': 0};
  for (let index = 0; index < rewardCount; index++) {
    const roll = random();
    if (typeof roll !== 'number' || !Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Invalid reward random value.');
    rewards[roll < BASIC_REWARD_POOL[0].probability ? 'warm-can' : 'bouncy-treat']++;
  }
  return {rewards, baseRewardCount, firstClearBonus, rewardCount};
}
