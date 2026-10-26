import type {MarketCatId} from './types';

export const CAT_PRESENTATION: Readonly<Record<MarketCatId, {label:string;positioning:string}>> = {
  caster: {label:'远程',positioning:'远程单体普攻；主动技能可自由选择十字范围，兼顾分路与首领。'},
  guard: {label:'盾卫',positioning:'近战承伤，最多阻挡 2 只黑影；主动护盾先承伤，不恢复体力。'},
  tuanzi: {label:'近程',positioning:'橘猫近程输出；橘影连爪打击前方 3×3 范围。'},
  diandian: {label:'辅助',positioning:'远程辅助；安心呼噜治疗全部仍在场伙伴，不能复活。'},
  bruiser: {label:'斗士',positioning:'狸花近战，阻挡 2 只；栗盾奋击提供护盾并暂时提高普攻伤害。'},
  controller: {label:'控制',positioning:'银渐层远程；银铃缓行造成十字伤害并减慢小怪，争取守线时间。'},
};
