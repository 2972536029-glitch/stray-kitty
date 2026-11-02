/** Recognize clear non-combat requests without excluding mixed combat questions.
 * Ambiguous questions still go to the battle-only model prompt. */
export function battleScopeRedirect(question: string): {title: string; text: string} | null {
  const nonCombat = /家园|家具|修缮|修床|修屋顶|修窗|修地板|摆放|收纳|剧情|故事|台词|事件.*(?:概率|选项|骰|鼓励)|(?:掷骰|骰子|抽卡|充值|付款)/.test(question);
  const combat = /战斗|技能|蓄能|能量|护盾|治疗|阻挡|突破|退场|敌人|黑影|首领|站位|阵容|出战|守线|防线|夜视|减速|携带|支援|必胜|(?:这[一场个]?|本)(?:波|关)|怎么打|怎么过|防守/.test(question);
  return nonCombat && !combat ? {title: '回家园再聊', text: '战斗页的阿策专注战斗相关问题。家园、家具、剧情和事件规则等内容，可以回到家园问我；这里可以继续询问当前战况、技能和战斗规则。'} : null;
}
