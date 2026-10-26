import type {ChapterCatId} from './types';

export const CAT_PRESENTATION: Readonly<Record<ChapterCatId, {label:string;positioning:string}>> = {
  caster: {label:'远程',positioning:'远程输出。普攻攻击单个目标，主动技能可选择十字范围造成群体伤害。'},
  guard: {label:'盾卫',positioning:'近战承伤，最多阻挡 2 只普通黑影。主动护盾先承伤，不恢复体力。'},
  tuanzi: {label:'近程',positioning:'橘猫近程输出。普攻攻击单个目标，橘影连爪打击前方范围，兼顾下路与首领。'},
  diandian: {label:'辅助',positioning:'远程辅助。普攻攻击单个目标；安心呼噜治疗全部仍在场的队友，不能复活退场猫。'},
};
