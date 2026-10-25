import {CAT_DEFINITIONS, RULES, SKILLS} from './config';
import {cellName, getChapterAdvice, getItemTargetError} from './engine';
import type {BasicSupplyId, ChapterCat, ChapterCatId, ChapterState} from './types';

export interface ChapterAdvice {
  title: string;
  text: string;
  /** A suggestion, never an executed command. The UI must validate again on click. */
  itemId?: BasicSupplyId;
  catId?: ChapterCatId;
}

const aliases: readonly [ChapterCatId, RegExp][] = [
  ['caster', /绒绒|布偶|星绒|caster/i], ['guard', /斑斑|盾猫|奶牛|罐盾|guard/i],
  ['tabby', /狸花|护卫|巡巷|tabby/i], ['hammer', /彩狸|重锤|破阵|hammer/i],
  ['frost', /蓝猫|寒铃|霜环|frost/i], ['singer', /暹罗|歌者|和声|singer/i],
];
const requestedCat = (question: string) => aliases.find(([, pattern]) => pattern.test(question))?.[0];
const supportRole = (question: string) => /喵喵|主角|金吉拉|阿策|军师/.test(question);
const active = (cat: ChapterCat) => cat.status === 'active';
const cooldownNote = '收起军师和背包、继续战斗后，物品间隔才会继续计时。';

function healAnswer(state: ChapterState, question: string): ChapterAdvice {
  if (supportRole(question)) return {title: '照顾战斗伙伴', text: '喵喵是保护目标，阿策是场外军师，都不使用战斗道具。暖罐可以治疗六位战斗猫，包括正在安全区休整的伙伴。'};
  const id = requestedCat(question);
  const injured = state.cats.filter(cat => cat.hp < cat.maxHp && (!id || cat.id === id)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
  if (!injured.length) return {title: '现在不需要暖罐', text: id ? '你指定的伙伴当前体力已满，使用暖罐不会生效，也不应扣除物资。' : '六位战斗猫当前体力都已满，不必消耗暖罐。冻干只补能量，不能代替治疗。'};
  const target = injured.find(cat => !getItemTargetError(state, 'warm-can', cat.id)) ?? injured[0];
  const problem = getItemTargetError(state, 'warm-can', target.id);
  if (problem) {
    const singer = state.cats.find(cat => cat.id === 'singer');
    const fallback = state.inventory['warm-can'] === 0
      ? singer && active(singer) && singer.energy >= 100
        ? '歌者已经蓄满能量；结束瞄准、收起面板并恢复战斗后，可以手动施放归家和声治疗全队。'
        : '歌者的归家和声能够治疗全队和休整猫，需要普攻蓄满 100 能量后由你手动施放；本章没有免费补给或免费本波重整。'
      : state.healingCooldown > 0 ? cooldownNote : '';
    return {title: `${target.name}需要照顾`, text: `${target.name}当前体力 ${Math.ceil(target.hp)} / ${target.maxHp}。${problem}${fallback}`};
  }
  const recovery = Math.min(RULES.warmCanHeal, target.maxHp - target.hp);
  return {title: `可以为${target.name}使用暖罐`, text: `${target.name}当前体力 ${Math.ceil(target.hp)} / ${target.maxHp}，一份暖罐实际恢复 ${Math.ceil(recovery)} 体力，消耗本场自带物资 1 份；全队治疗共享 ${RULES.healingCooldown} 秒间隔。${target.status === 'resting' ? '休整猫恢复到一半体力后，仍需手动部署回合法空格。' : '伙伴继续留在场上。'}`, itemId: 'warm-can', catId: target.id};
}

function energyAnswer(state: ChapterState, question: string): ChapterAdvice {
  if (supportRole(question)) return {title: '能量属于战斗猫', text: '喵喵和阿策不参加攻击，不接受冻干补能。六位战斗猫每次有效普攻命中获得 10 能量，满 100 后手动释放各自技能。'};
  const id = requestedCat(question);
  const candidates = id ? state.cats.filter(cat => cat.id === id)
    : state.cats.filter(cat => active(cat) && cat.energy < 100).sort((a, b) => b.energy - a.energy);
  if (!candidates.length) return {title: '暂时不需要补能', text: '目前没有场上且能量未满的战斗猫。休整伙伴先恢复到一半体力并重新部署；满能量时不用冻干，实际使用会被拒绝。'};
  const target = candidates.find(cat => !getItemTargetError(state, 'bouncy-treat', cat.id)) ?? candidates[0];
  const problem = getItemTargetError(state, 'bouncy-treat', target.id);
  if (problem) return {title: '暂时不能为这位伙伴补能', text: `${target.name}当前能量 ${target.energy} / 100。${problem}${target.energyItemCooldown > 0 ? cooldownNote : '普通攻击每次有效命中 +10 能量；技能命中不返还能量，冻干也不能恢复体力。'}`};
  const recovery = Math.min(RULES.treatEnergy, 100 - target.energy);
  return {title: `可以为${target.name}补能`, text: `${target.name}当前能量 ${target.energy} / 100，一份冻干实际增加 ${recovery} 点；不足 30 的缺口仍消耗整份。使用后这只猫有 ${RULES.energyCooldown} 秒补能间隔，其他猫各自计算。只会在你点击使用、并再次通过当前战况校验后执行。`, itemId: 'bouncy-treat', catId: target.id};
}

function formationAnswer(state: ChapterState): ChapterAdvice {
  const warning = state.boss.phase === 'windup'
    ? `首领先举起路障，当前裂纹落点是 ${state.boss.targetCells.map(cellName).join('、')}。先把这些格中的伙伴移开，重砸落地后再恢复阵型。`
    : '留意首领举起路障、身体后仰的动作；落点锁定后，把裂纹格中的伙伴移动到合法安全格。';
  const positions = state.cats.map(cat => `${cat.name} ${cellName(CAT_DEFINITIONS[cat.id].initial)}`).join('，');
  const resting = state.cats.filter(cat => !active(cat));
  return {title: '守住三处巷口', text: `A5 → B5 → C5 → D5 → D1 是向下汇入的支路；右侧 D12、E12 分别从主巷向左来敌。可参考初始位置：${positions}。斑斑挡 2 只，其余猫各挡 1 只；超出容量的黑影会继续前进。Boss 固定占 D10、D11、E10、E11 四格，禁止部署；A6、B6、C6 被垃圾占用，同样不能部署。${warning}${resting.length ? `目前 ${resting.map(cat => cat.name).join('、')}在休整，恢复到一半体力后才可重新部署。` : ''}`};
}

function abilitiesAnswer(state: ChapterState, question: string): ChapterAdvice {
  if (supportRole(question)) return {title: '喵喵与阿策的职责', text: '喵喵是 D1 的保护目标，阿策是场外本地规则军师；两者都不占六猫战斗名额，不普攻、不蓄能，也不释放战斗技能。'};
  const id = requestedCat(question), cats = state.cats.filter(cat => !id || cat.id === id);
  const detail = cats.map(cat => `${cat.name}「${SKILLS[cat.id].name}」：${SKILLS[cat.id].description}`).join('\n');
  return {title: id ? `${cats[0]?.name ?? '伙伴'}的能力` : '六位伙伴的真实能力', text: `${detail}\n每只猫通过有效普攻命中每次 +10 蓄能，手动技能消耗 100；技能伤害不返还能量。体力降至 25% 或以下会安全休整；恢复到至少 50% 后需要手动重新部署。`};
}

/** Local rules and currently visible state only: no network, future waves or automatic actions. */
export function getChapterAnswer(state: ChapterState, question: string): ChapterAdvice {
  const prompt = typeof question === 'string' ? question.trim().slice(0, 500) : '';
  if (state.phase === 'won' || state.phase === 'lost') return {title: '本场守护已经结束', text: getChapterAdvice(state)};
  if (/下一波|下波|未来|后几波|还没出现|预知/.test(prompt)) return {title: '只观察已经公开的战况', text: '我不会预读尚未出现的敌人或后续波次。可以问我当前阵型、治疗、补能、猫咪能力，或场上已经出现的黑影。'};
  if (/治疗|回血|受伤|暖罐|罐罐|体力|血量|喝药/.test(prompt)) return healAnswer(state, prompt);
  if (/补能|能量|蓄能|冻干|充能/.test(prompt)) return energyAnswer(state, prompt);
  if (/能力|技能|本领|会什么/.test(prompt)) return abilitiesAnswer(state, prompt);
  if (/boss|首领|大招|重砸|路障/i.test(prompt)) return {title: '看动作，躲重砸', text: state.boss.phase === 'defeated' ? '固定首领已经被击败，但还要处理完所有普通敌人的波次才能通关。' : `${state.boss.name}固定占 D10–E11 四格，任意占格被覆盖都只结算一次伤害。它平时普攻，举起路障并后仰时是在准备重砸；落点锁定后按命中瞬间的位置判定，移出裂纹可以躲开。${state.boss.phase === 'windup' ? `当前裂纹格：${state.boss.targetCells.map(cellName).join('、')}。` : '目前没有正在锁定的重砸落点。'}`};
  if (/阵|摆|站位|部署|路线|出怪|地图|a5/i.test(prompt)) return formationAnswer(state);
  if (/敌|黑影|怪/.test(prompt)) {
    if (!state.enemies.length) return {title: '当前没有普通黑影在场', text: '我不会把尚未出现的波次当作当前敌情。先观察三处巷口和首领的公开动作。'};
    const kinds = [...new Set(state.enemies.map(enemy => enemy.name))];
    return {title: '场上已经出现的黑影', text: `当前可见普通黑影 ${state.enemies.length} 名，包括 ${kinds.join('、')}。检查它们所在路线和猫咪阻挡容量；斑斑可挡 2 名，其余猫各挡 1 名，超员会通过。`};
  }
  if (!prompt) return {title: '阿策正在观察战况', text: getChapterAdvice(state)};
  return {title: '阿策 · 本地规则军师', text: '我目前按本地规则读取公开战况，还没有接入远程模型。可以问“现在怎么摆阵？”“谁需要治疗？”“怎样补能？”或“猫咪有什么能力？”。我只提出建议，使用道具和释放技能都由你确认。'};
}
