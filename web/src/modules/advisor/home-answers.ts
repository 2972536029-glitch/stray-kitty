import type {Catalog, GameState} from '../../contracts';
import battleReference from '../../../../server/internal/service/advisor_battle_reference.json';

/** Small offline answers for home questions. No full catalog or imagined history. */
export function getHomePublicAnswer(state: GameState, catalog: Catalog, question: string): {title: string; text: string} | null {
  if (state.phase !== 'home') return null;
  const q = question.trim();
  if (/实时|当前战况|现在.*(?:多少血|血量|站位|能量|出战|能.*(?:开|放).*(?:技能|护盾))|(?:这场|本场).*(?:血量|站位|敌人|阵容)|在哪一格|剩.*血/.test(q) && !/机制|规则|上限|每秒|怎么(?:恢复|增加|蓄|涨)/.test(q)) {
    return {title: '家园没有实时战况', text: '家园里没有当前战斗快照，不能确认此刻的血量、能量、站位、敌人或出战名单。可以在战斗页询问当前战况；在这里我能解释已经公开的战斗机制。历史聊天中的数值也不能当作实时状态。'};
  }
  if (/事件|掷骰|骰子|鼓励|判定/.test(q) && !/上次|刚才|最近/.test(q)) {
    if (/概率|几率|失败率|百分/.test(q)) return {title: '事件基础概率', text: `${/鱼干|库存|购买|先买/.test(q) ? '普通事件选项不要求也不扣库存鱼干，不需要先购买。' : ''}普通一组两颗六面骰按总点数判定：12点为2.78%，9–11点为25%，5–8点为55.56%，2–4点为16.67%。伙伴鼓励会掷两组并取较高总和，这些基础概率不能直接当作鼓励后的概率，也不能预报某次结果。`};
    if (/鼓励/.test(q)) return {title: '伙伴鼓励', text: `鼓励要在掷骰前主动声明，消耗1次鼓励，掷两组两颗六面骰并取总和较高的一组，不是结算后重掷。当前记录有${state.pushTokens ?? 0}次鼓励；初始1次、上限2次，可恢复鼓励的非教学、非独立守护关卡首次成功补1次（如首次救回点点），同关重复和独立试玩不恢复，不保证每赢一场都补。`};
    return {title: '事件公开规则', text: '事件由两颗六面骰的总点数判定。普通选项不要求也不扣库存物品，题面里“放下鱼干”等叙事不等于库存费用；主动使用伙伴鼓励另扣鼓励次数。失败档至少保底1条线索，但仍可能有压力或剧情代价。我可以解释规则和有记录的已发生结果，不推荐或代选具体选项，也不预告隐藏结果。'};
  }
  if (/墨墨|夜视/.test(q) && /技能|护盾|夜视|效果|怎么用/.test(q)) {
    const known = state.cats.includes('momo');
    const experienced = (id: string) => state.completedStages.includes(id) ||
      state.lastResult.stageId === id && (state.lastResult.outcome === 'won' || state.lastResult.outcome === 'lost');
    const versions = [
      {id: 'finale_boss', label: '终章仓库', pattern: /第五章|第5章|终章|仓库/, flag: 'finale_completed'},
      {id: 'tunnel_boss', label: '地下通道', pattern: /第四章|第4章|地下通道|暗道/, flag: 'tunnel_explored'},
      {id: 'greenhouse_boss', label: '花房', pattern: /第三章|第3章|花房/, flag: 'greenhouse_fortified'},
    ];
    const explicit = versions.filter(version => version.pattern.test(q));
    const available = (version: typeof versions[number]) => experienced(version.id) || state.flags.includes(version.flag);
    // Explicit chapter requests must never silently borrow another chapter's skill.
    const requestedChapter = /第[一二三四五六七八九十0-9]+章|序章|小巷|集市/.test(q);
    const selected = explicit.length === 1 ? explicit[0] : explicit.length > 1 || requestedChapter ? undefined
      : versions.find(version => available(version) && (!/夜视/.test(q) || version.id !== 'greenhouse_boss'));
    const skill = selected && available(selected) ? battleReference.find(stage => stage.stageId === selected.id)?.cats.find(cat => cat.id === 'momo')?.skill : undefined;
    const description = skill && 'description' in skill ? skill.description : undefined;
    return {title: '伙伴能力说明', text: known && selected && skill && typeof description === 'string'
      ? `已体验的${selected.label}战斗中，墨墨技能「${skill.name}」：${description}这是该关卡的机制说明，不表示现在能施放，也不代表其他关卡的技能数值相同。`
      : '当前记录不足以确认所问章节的这项战斗能力；请明确要问哪个已体验的关卡，我不会套用另一章技能或提前介绍后续觉醒。家园里也无法判断此刻能否施放。'};
  }
  if (/技能|蓄能|能量|战斗.*(?:规则|怎么)|阻挡|突破|退场|复活|护盾|治疗/.test(q)) {
    return {title: '战斗机制', text: '战斗猫会自动攻击并按阻挡容量拦住接触的普通敌人，超出容量的敌人继续前进。技能需要蓄能后由玩家手动释放，暂停会停止战斗和蓄能。体力归零后本场退场，不能复活或重新部署；护盾不等于治疗。具体数值、技能效果与胜负阈值以已解锁关卡规则为准。喵喵是保护目标，阿策不参战。'};
  }
  if (/家具|摆放|收纳|家具背包|家园仓库/.test(q)) {
    const names = state.furniture.slice(0, 24).map(id => catalog.furniture.find(item => item.id === id)?.name).filter(Boolean);
    return {title: '家园家具', text: `家园家具和战斗补给是不同功能。当前拥有的家具：${names.join('、') || '暂无可核实记录'}。摆放、收纳和可用位置以家园当前界面为准；我只能解释，不会替你购买或摆放。`};
  }
  if (/完整历史|完整剧情|所有剧情|每次.*(?:选择|对话)|以前.*说|之前.*台词|未来剧情|后面.*(?:剧情|结局)/.test(q)) {
    return {title: '已知故事的范围', text: '目前记录能核实已完成关卡、当前进度和最近一次事件，不是完整的已读台词或全部选择日志。我可以解释这些已有记录；没有记录的旧对白和未来剧情无法确认，也不会编出一段回忆。'};
  }
  if (/剧情|故事|经历|通关|回顾/.test(q) && /已|以前|之前|前面|经历|通关|回顾/.test(q)) {
    const names = state.completedStages.slice(0, 16).map(id => catalog.stages.find(stage => stage.id === id)?.name).filter(Boolean);
    return {title: '有记录的旅程', text: `当前可核实的已完成关卡：${names.join('、') || '暂无具名记录'}。这只能证明通关进度，不代表完整剧情或全部选择日志；没有记录的对白和角色动机无法确认。`};
  }
  return null;
}
