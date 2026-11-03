import {eventTiers} from '../events/presentation';

// Public explanations shared by home answers and visible journey snapshots.
// Event selection, dice rolls and rewards remain owned by the event system.
export const eventInventoryRule = '当前可见的普通事件选项不要求拥有库存物品，也不扣除库存物品。选项里“放鱼干”等文字是叙事行动，不是鱼干库存费用；不能因鱼干为0而判定选项不可用，也不能说会花掉现有鱼干。';
export const eventEncouragementRule = '选择伙伴鼓励时额外消耗1次鼓励次数，掷两组取总和较高的一组；普通掷骰不消耗鼓励次数。';
export const eventChoiceRule = '阿策只解释当前题面、选项字面行动和公开规则，不推荐、排名或代选具体选项；选什么由玩家决定，不预报骰点或未结算后果。';
export const eventFailureRule = '按当前公开规则，事件失败档至少保底1条线索，故事仍会推进；仍可能出现黑影压力或剧情代价，不代表失败没有任何代价。';
export const eventEncouragementRecovery = '鼓励初始1次、上限2次；可恢复鼓励的非教学、非独立守护关卡首次成功补1次，例如首次救回点点成功后补1次，达到上限不再增加，同关重复和独立试玩不恢复，不是每场战斗都会补。';
export const eventProbabilityMeaning = '表中是普通一组2d6的基础概率，不能直接当作使用鼓励后两组取高的概率。';

export function publicEventPointRanges() {
  return eventTiers.map(tier => ({点数: tier.range, 档位: tier.label, 基础概率: tier.probability}));
}

export function publicEventProbabilityText() {
  return publicEventPointRanges().map(tier => `${tier.点数}点为${tier.基础概率}`).join('，');
}
