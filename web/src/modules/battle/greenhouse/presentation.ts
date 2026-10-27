import type {GreenhouseCatId} from './types';

export const CAT_PRESENTATION:Readonly<Record<GreenhouseCatId,{label:string;positioning:string}>>={
  caster:{label:'远程',positioning:'远程单体普攻；主动星绒绽放可选择十字范围，按真实花房地格裁切。'},
  guard:{label:'盾卫',positioning:'近战承伤，阻挡 2 只黑影；护盾先承伤，不恢复血量。'},
  tuanzi:{label:'近程',positioning:'近程输出；橘影连爪攻击前方 3×3 通路格，缺口和障碍不补格。'},
  bruiser:{label:'斗士',positioning:'狸花近战，阻挡 2 只；栗盾奋击提供护盾并暂时提高普攻伤害。'},
  controller:{label:'控制',positioning:'银渐层远程；银铃缓行造成十字伤害并减慢小怪，不移动固定首领。'},
  momo:{label:'护行',positioning:'黑猫辅助；巡光护行为全队在场伙伴加盾并清除已生成荆棘，不取消播种预告，不回血或复活。'},
};
