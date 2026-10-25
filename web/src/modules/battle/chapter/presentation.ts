import type {ChapterCatId} from './types';

/** Display-only descriptions of existing abilities; combat rules remain in config/engine. */
export const CAT_PRESENTATION: Readonly<Record<ChapterCatId, {label:string;positioning:string}>> = {
  caster: {label:'远程',positioning:'远程输出。普攻攻击单个目标，主动技能可选择十字范围造成群体伤害。'},
  guard: {label:'盾卫',positioning:'近战承伤，最多阻挡 2 只普通黑影。主动护盾先承伤，不恢复体力。'},
  tabby: {label:'近程',positioning:'近程输出、守住路线。主动技能强化自身普攻并获得护盾，普攻仍攻击单个目标。'},
  hammer: {label:'近程',positioning:'近程输出。普攻攻击单个目标，主动技能造成前方范围伤害。'},
  frost: {label:'控制',positioning:'远程控制。普攻攻击单个目标；主动技能减速普通黑影，固定首领只受到伤害，不受减速。'},
  singer: {label:'辅助',positioning:'远程辅助。普攻攻击单个目标；主动技能治疗全队，包含休整猫。休整猫恢复后仍需手动重新上阵。'},
};
