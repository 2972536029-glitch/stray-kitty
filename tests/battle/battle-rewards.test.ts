import test from 'node:test';
import assert from 'node:assert/strict';
import {BASIC_REWARD_POOL, createBattleRewards, L00_STAGE_ID, REWARD_COUNTS} from './reference/rewards.ts';
import type {BattleDifficulty} from '../../web/src/modules/battle/l00/types.ts';

test('reward tiers vary quantities, with the same usable 70/30 item pool at every difficulty', () => {
  assert.deepEqual(REWARD_COUNTS, {low: 2, medium: 3, high: 4});
  assert.deepEqual(BASIC_REWARD_POOL, [{id: 'warm-can', probability: 0.7}, {id: 'bouncy-treat', probability: 0.3}]);
  for (const difficulty of ['low', 'medium', 'high'] as const) {
    let calls = 0;
    const grant = createBattleRewards(difficulty, L00_STAGE_ID, false, () => {calls++; return calls % 2 === 0 ? 0.7 : 0.699999;});
    assert.equal(grant.rewardCount, REWARD_COUNTS[difficulty]);
    assert.equal(grant.baseRewardCount, grant.rewardCount);
    assert.equal(grant.firstClearBonus, 0);
    assert.equal(calls, grant.rewardCount);
    assert.equal(grant.rewards['warm-can'], Math.ceil(grant.rewardCount / 2));
    assert.equal(grant.rewards['bouncy-treat'], Math.floor(grant.rewardCount / 2));
  }
});

test('the implemented L00 first victory adds two portions; arbitrary stages do not acquire a chapter bonus', () => {
  for (const difficulty of ['low', 'medium', 'high'] as const) {
    const grant = createBattleRewards(difficulty, L00_STAGE_ID, true, () => 0);
    assert.equal(grant.firstClearBonus, 2);
    assert.equal(grant.rewardCount, REWARD_COUNTS[difficulty] + 2);
    assert.deepEqual(grant.rewards, {'warm-can': REWARD_COUNTS[difficulty] + 2, 'bouncy-treat': 0});
  }
  assert.equal(createBattleRewards('high', 'future-stage', true, () => 0).firstClearBonus, 0);
});

test('rolls select implemented portions independently and never produce future items', () => {
  let calls = 0;
  const grant = createBattleRewards('low', L00_STAGE_ID, true, () => [0, 0.69999, 0.7, 0.999999][calls++]);
  assert.deepEqual(grant.rewards, {'warm-can': 2, 'bouncy-treat': 2});
  assert.equal(calls, 4);
});

test('invalid reward parameters and RNG values fail instead of creating undefined or inflated grants', () => {
  for (const value of ['hard', 'constructor', '__proto__', '', null, undefined, 1, {}, new String('low')]) {
    assert.throws(() => createBattleRewards(value as BattleDifficulty, L00_STAGE_ID, true));
  }
  for (const value of [-1, 1, Infinity, -Infinity, NaN, '0', null, undefined]) {
    assert.throws(() => createBattleRewards('medium', L00_STAGE_ID, false, () => value as number));
  }
  assert.throws(() => createBattleRewards('low', '', true));
  assert.throws(() => createBattleRewards('low', L00_STAGE_ID, 'yes' as unknown as boolean));
});
