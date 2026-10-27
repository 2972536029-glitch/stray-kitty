import type {TunnelCatId} from './types';

export const CAT_PRESENTATION:Readonly<Record<TunnelCatId,{label:string;positioning:string}>>={
  caster:{label:'远程',positioning:'远程单体普攻；主动星绒绽放可选择十字范围，按地下通道的真实地格裁切。'},
  guard:{label:'盾卫',positioning:'奶牛猫盾卫，阻挡 2 只黑影；推荐守住左侧管道绕行线，护盾先承伤，不恢复体力。'},
  tuanzi:{label:'近程',positioning:'橘猫近程输出，护住救援通路；橘影连爪攻击前方 3×3 通路格，缺口和障碍不补格。'},
  bruiser:{label:'斗士',positioning:'狸花近战，阻挡 2 只黑影；栗盾奋击提供护盾并暂时提高普攻伤害，可守右侧两路的汇合处。'},
  diandian:{label:'治疗',positioning:'暹罗猫辅助，本章随队出战；安心呼噜恢复仍在场伙伴的体力，不能复活。识破绊线和假哭声是剧情表现。'},
  momo:{label:'夜视',positioning:'黑猫辅助，本章解锁夜视；夜视护行恢复全场视野并给仍在场伙伴加盾，不治疗、不复活。'},
};
