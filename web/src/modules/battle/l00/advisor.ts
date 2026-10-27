import type {Advice, CombatState, CombatPhase} from './state.ts';
import {CONFIG, DIFFICULTY_CONFIG, SKILLS} from './config.ts';
import {getAttackCells} from './ranges.ts';

/** Only public, currently visible battle facts are available to this local advisor. */
export function buildAdvisorContext(state: CombatState) {
  return {
    mode: 'offline-rules', phase: state.phase, tutorialStep: state.tutorialStep, paused: state.paused, difficulty: state.difficulty,
    wave: state.wave, totalWaves: state.totalWaves, leaks: state.leaks, maxLeaks: state.maxLeaks,
    cats: state.cats.map(cat => {
      const {id, name, role, hp, maxHp, status, combatant, x, y, damage, interval, block, blockedCount, energy, shield, shieldRemaining} = cat;
      return {id, name, role, hp, maxHp, status, combatant, x, y, damage, interval, block, blockedCount, energy, shield, shieldRemaining, attackCells: getAttackCells(cat)};
    }),
    visibleEnemies: state.enemies.filter(enemy => !enemy.training && enemy.x >= 0 && enemy.x <= CONFIG.VISIBLE_MAX_X).map(({id, type, hp, maxHp, x, y, blockedBy}) => ({id, type, hp, maxHp, x, y, blockedBy})),
  };
}
type AdvisorContext = ReturnType<typeof buildAdvisorContext>;
function enemyAdvice(enemy: AdvisorContext['visibleEnemies'][number] | undefined): Advice {
  if (!enemy) return {title: '先观察公开的战场', text: '目前没有进入战斗区的黑影。军师不会预读尚未出现的敌情。'};
  return enemy.type === 'runner'
    ? {title: '疾行黑影出现了', text: '它移动较快。让斑斑在同一行拦截，绒绒用朝右的矩形普攻范围支援。斑斑最多挡住 2 只，超过容量的敌人会继续前进。', targetId: enemy.id}
    : {title: '巡逻黑影正在靠近', text: '用斑斑挡住路线，绒绒自动发射单体星绒。拖动猫咪能改变位置，已经越过伙伴的黑影不会被瞬移回去。', targetId: enemy.id};
}
export function getEnemyArrivalAdvice(state: CombatState, enemyId: string): Advice | null {
  const enemy = buildAdvisorContext(state).visibleEnemies.find(value => value.id === enemyId);
  return enemy ? enemyAdvice(enemy) : null;
}
const GATE_TIPS: Partial<Record<CombatPhase, Advice>> = {
  teach_position: {title: '第一步：侧面支援', text: '把仍在场的绒绒移到高亮 A4 格。血量归零的猫会本场退场，无法再次部署；现在练习的是移动在场伙伴。', targetId: 'caster'},
  teach_move: {title: '第二步：前排阻挡', text: '把斑斑移到高亮 B5 格，它能阻挡 2 只黑影，让绒绒在侧面输出。', targetId: 'guard'},
  teach_energy: {title: '第三步：自动蓄能', text: `在场猫每秒战斗时间自动增长 ${CONFIG.ENERGY_PER_SECOND} 能量，20 秒达到 100 后保留。暂停时停止增长，攻击不额外加能。点击开始蓄能练习。`},
  skill_charge: {title: '观察能量条', text: '两只猫都在自动蓄能，没有攻击目标时也会增长。练习木偶不会反击。满 100 后会暂停，等待你手动释放技能。'},
  teach_guard_skill: {title: '第四步：罐盖护盾', text: '点斑斑，再点它旁边的护盾图标，消耗 100 能量获得 60 护盾，持续 8 秒。护盾先承伤，但不恢复血量。', targetId: 'guard'},
  teach_caster_skill: {title: '第五步：选择技能落点', text: '点绒绒，再点星绒技能图标。全地图 21 格都可选中心，包括 B1、B7。让黄色十字覆盖 B6 木偶后释放；右键或 Esc 取消不扣能量。', targetId: 'caster'},
};
export function getAdvice(state: CombatState, question: unknown = ''): Advice {
  const context = buildAdvisorContext(state);
  const prompt = typeof question === 'string' ? question.trim().slice(0, 500) : '';
  const gate = GATE_TIPS[context.phase];
  if (gate) return {...gate};
  if (context.phase === 'ready') return {title: '准备进入小巷', text: '先观察救援，再学习站位、自动蓄能、护盾和范围技能。喵喵负责指挥，不参与攻击和阻挡。'};
  if (context.phase === 'hero_danger') return {title: '喵喵正在寻找掩护', text: '喵喵会从 B4 撤到 B1 固定指挥格，绒绒随后赶到。'};
  if (context.phase === 'caster_rescue') return {title: '绒绒正在保护指挥位', text: '观察绒绒的自动星绒攻击，斑斑和阿策马上赶来支援。', targetId: 'caster'};
  if (context.phase === 'failed') return {title: '本次防线失守', text: '三次突破或战斗伙伴全部退场会结束本场。完成结算后回准备阶段重新挑战，新的场次会恢复初始状态。'};
  if (context.phase === 'won') return {title: '守线完成', text: '你已经学会移动与交换站位、自动蓄能、护盾和十字技能。喵喵负责指挥，伙伴分别承担阻挡与输出。'};
  if (/难度|简单|普通|困难/.test(prompt)) {
    const setting = DIFFICULTY_CONFIG[context.difficulty];
    return {title: `当前是${setting.label}难度`, text: `教学后黑影体力为基础值的 ${Math.round(setting.enemyHpMultiplier * 100)}%，攻击与速度不变。难度来自入场快照，本场不会改档。三档均在三次突破或全员退场后结束。`};
  }
  if (/道具|背包|补给|冻干|罐罐|补能|药/.test(prompt)) return {title: '本关不使用战斗道具', text: `能量由在场伙伴每秒自动积攒 ${CONFIG.ENERGY_PER_SECOND} 点，不需要鱼干或其他物品；本关没有战斗背包、物品消耗或补给奖励。`};
  if (/退场|复活|休整|休息|治疗|恢复|加血|血量/.test(prompt)) return {title: '血量归零后本场退场', text: '伙伴体力大于 0 时仍能作战。归零后离开棋盘，不再攻击、阻挡、受伤或蓄能，也不能移动、施法或再次上阵。序章没有治疗技能；提前给斑斑护盾，必要时移动伙伴减少承伤。'};
  if (/技能|能力|大招|攻击|输出|射程|范围|能量|蓄能|护盾/.test(prompt)) return {title: '伙伴的实际能力', text: `绒绒以朝右 3 行 × 4 列矩形做单体普攻，斑斑覆盖自身、前方、两侧共四格，挡 2 只。每秒战斗时间自动蓄能 ${CONFIG.ENERGY_PER_SECOND}，满 100 后手动释放。星绒绽放全地图任选十字中心，每个敌人受到 ${SKILLS.caster.damage} 伤害；罐盖护盾只给斑斑 ${SKILLS.guard.shield} 护盾，持续 ${SKILLS.guard.duration} 秒。点猫查看为临时半速，瞄准恢复 1 倍；暂停优先，技能不会自动释放。`};
  if (/阵型|队形|布阵|摆阵|站位|前排|后排|拖|移动|部署|上阵/.test(prompt)) return {title: '前排阻挡，旁侧输出', text: '让斑斑拦住 B7 通往 B1 的路线，绒绒在射程内支援。在场猫可移动到除 B1、B7 外的 19 个候选格，A7、C7 是普通可用格；移到另一只在场猫身上会交换位置，不重置攻击间隔、血量、能量或护盾。退场猫不能再部署。', targetId: 'guard'};
  if (/黑影|敌人|怎么打/.test(prompt)) return enemyAdvice(context.visibleEnemies.find(enemy => enemy.type === 'runner') || context.visibleEnemies[0]);
  if (/规则|保护|失败|压力|阻挡/.test(prompt)) return {title: '保护 B1 指挥格', text: '本关只从 B7 出怪，斑斑挡 2 只，绒绒挡 1 只；超过容量的敌人继续前进，抵达 B1 立即算一次突破。三次突破或全员退场后本场失败，没有本波复活或重整。军师只解释规则，不会替你操作。'};
  if (prompt) return {title: '军师能帮助你理解战斗', text: '当前是本地规则顾问，可以询问站位、退场、阻挡容量、普攻范围、自动蓄能和已经出现的黑影。技能仍由你手动释放。'};
  const retired = context.cats.find(cat => cat.combatant && cat.status === 'retired');
  if (retired) return {title: `${retired.name}已经退场`, text: '这位伙伴本场不能重新上阵。调整剩余伙伴的位置，留意漏怪；全员退场后需要结算并重新挑战。', targetId: retired.id};
  const charged = context.cats.find(cat => cat.combatant && cat.status === 'active' && cat.energy >= CONFIG.MAX_ENERGY);
  if (charged) return {title: `${charged.name}的技能准备好了`, text: charged.id === 'caster' ? '点绒绒再选择星绒技能，在敌人聚集处释放十字范围攻击；取消会保留能量。' : '点斑斑再选择护盾技能，接敌前使用能减少实际血量损失。', targetId: charged.id};
  return enemyAdvice(context.visibleEnemies[0]);
}
