import {CAT_DEFINITIONS, RULES, SKILLS} from './config';
import {cellName, getChapterAdvice} from './engine';
import type {ChapterCatId, ChapterState} from './types';

export interface ChapterAdvice {title: string; text: string}
const aliases: readonly [ChapterCatId, RegExp][] = [
  ['caster', /绒绒|布偶|星绒|caster/i], ['guard', /斑斑|盾猫|罐盾|guard/i],
  ['tuanzi', /团子|橘猫|橘影|tuanzi/i], ['diandian', /点点|暖心|呼噜|diandian/i],
];
const requestedCat = (question: string) => aliases.find(([, pattern]) => pattern.test(question))?.[0];
const supportRole = (question: string) => /喵喵|主角|金吉拉|阿策|军师/.test(question);

/** Read-only local advice; never consumes resources or executes combat actions. */
export function getChapterAnswer(state: ChapterState, question: string): ChapterAdvice {
  const prompt = typeof question === 'string' ? question.trim().slice(0, 500) : '';
  if (state.phase === 'won' || state.phase === 'lost') return {title: '本场守护已经结束', text: getChapterAdvice(state)};
  if (/下一波|下波|未来|后几波|还没出现|预知/.test(prompt)) return {title: '只观察已经公开的战况', text: '我不会预读尚未出现的敌人或后续波次。可以问当前阵型、治疗、蓄能或猫咪能力。'};
  if (supportRole(prompt)) return {title: '喵喵与阿策的职责', text: '喵喵是 D1 的保护目标，阿策是场外本地规则军师；两者都不占四猫战斗名额，不普攻、不蓄能，也不释放战斗技能。'};
  const id = requestedCat(prompt), target = state.cats.find(cat => cat.id === id);
  if (/退场|复活|休整|重新上阵/.test(prompt)) return {title: '体力归零后退场', text: '猫咪会一直战斗到体力归零，然后永久退出本场，不能治疗、复活、移动或再次部署。点点只能治疗仍在场的伙伴；所有猫退场则本场失败。新一场挑战会重新出战。'};
  if (/治疗|回血|受伤|暖罐|罐罐|体力|血量|喝药/.test(prompt)) {
    if (target?.status === 'retired') return {title: `${target.name}已经退场`, text: '体力已经归零，本场无法被治疗或重新上阵。请保护仍在场的伙伴。'};
    const injured = state.cats.filter(cat => cat.status === 'active' && cat.hp < cat.maxHp && (!id || cat.id === id));
    const healer = state.cats.find(cat => cat.id === 'diandian')!;
    if (!injured.length) return {title: '当前伙伴体力充足', text: '你询问的在场伙伴体力已满，不需要治疗。点点的安心呼噜能治疗仍在场的全队，不能复活退场猫。'};
    const situation = injured.map(cat => `${cat.name} ${Math.ceil(cat.hp)} / ${cat.maxHp}`).join('，');
    return {title: '及时照顾在场伙伴', text: `${situation}。${healer.status === 'retired' ? '点点已退场，本场无法再使用治疗技能；依靠护盾与换位保护剩余伙伴。' : `点点当前 ${Math.floor(healer.energy)} / 100 能量，${healer.energy >= 100 ? '收起面板并恢复战斗后，可以手动使用' : '蓄满后可手动使用'}安心呼噜，为仍在场的全队恢复 ${SKILLS.diandian.heal} 体力。`}本章没有治疗道具，体力归零就退场。`};
  }
  if (/补能|能量|蓄能|冻干|充能|道具|背包/.test(prompt)) return {title: '自动蓄能，手动施法', text: `${target ? `${target.name}当前能量 ${Math.floor(target.energy)} / 100。` : ''}在场猫每模拟秒自动获得 ${RULES.energyPerSecond} 能量，约 20 秒蓄满；普攻不额外增加能量。满 100 后由你手动释放，能量扣回 0 后继续积攒；没有技能冷却或补能道具。暂停和打开军师时不蓄能，倍速跟随战斗时间，退场猫停止蓄能。`};
  if (/能力|技能|本领|会什么/.test(prompt)) return {title: target ? `${target.name}的能力` : '四位伙伴的能力', text: `${state.cats.filter(cat => !id || cat.id === id).map(cat => `${cat.name}「${SKILLS[cat.id].name}」：${SKILLS[cat.id].description}`).join('\n')}\n所有技能消耗 100 能量，在场时每模拟秒自动积攒 5 点。体力归零后本场退场。`};
  if (/boss|首领|大招|重砸|路障/i.test(prompt)) return {title: '看动作，躲重砸', text: state.boss.phase === 'defeated' ? '固定首领已经被击败，但还要处理完所有普通敌人的波次才能通关。' : `首领固定占 D8、D9、E8、E9 四格，任意占格被覆盖都只结算一次伤害。它平时普攻，举起路障并后仰时准备重砸；落点锁定后，移出裂纹就能躲开。${state.boss.phase === 'windup' ? `当前裂纹格：${state.boss.targetCells.map(cellName).join('、')}。` : ''}`};
  if (/阵|摆|站位|部署|路线|出怪|地图|a4/i.test(prompt)) return {title: '四猫守住三路', text: `A4 → B4 → C4 → D4 → D1 是向下汇入的支路；D10、E10 从右向左来敌。初始位置：${state.cats.map(cat => `${cat.name} ${cellName(CAT_DEFINITIONS[cat.id].initial)}`).join('，')}。斑斑挡 2 只，其余猫各挡 1 只，超员会通过。Boss 固定占 D8、D9、E8、E9；A5、B5、C5 是障碍，这些格不能部署。看到举路障动作先移开裂纹中的伙伴。退场猫无法重新上阵。`};
  if (/敌|黑影|怪/.test(prompt)) return {title: '当前可见敌情', text: state.enemies.length ? `当前可见普通黑影 ${state.enemies.length} 名，包括 ${[...new Set(state.enemies.map(enemy => enemy.name))].join('、')}。留意所在路线与阻挡容量，超员会通过。` : '当前没有普通黑影在场，我不会把尚未出现的波次当作当前敌情。'};
  return {title: '阿策 · 本地规则军师', text: prompt ? '我目前按本地规则读取公开战况，还没有接入远程模型。可以问当前阵型、治疗、蓄能或猫咪能力；技能由你手动释放。' : getChapterAdvice(state)};
}
