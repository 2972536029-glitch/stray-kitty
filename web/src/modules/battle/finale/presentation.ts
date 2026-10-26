import type {FinaleCatId} from './types';

export const CAT_PRESENTATION:Readonly<Record<FinaleCatId,{label:string;positioning:string}>>={
  caster:{label:'远程',positioning:'远程单体普攻；星绒绽放选择十字范围，可打小怪、精英与首领。首领九格共用血条，同次范围攻击只结算一次。'},
  guard:{label:'盾卫',positioning:'奶牛猫盾卫，阻挡 2 只黑影；推荐守上路拐弯，护盾先承伤，不恢复体力。橙色危险格亮起时仍需移动躲避。'},
  tuanzi:{label:'近程',positioning:'橘猫近程输出，护住中央灯车与救援光路；橘影连爪攻击前方 3×3 通路格，可集中打击首领与护卫。'},
  bruiser:{label:'斗士',positioning:'狸花近战，阻挡 2 只黑影；栗盾奋击提供护盾并暂时提高普攻伤害，推荐守住下路拐弯。'},
  diandian:{label:'治疗',positioning:'暹罗猫辅助，入仓前排除绊线；安心呼噜治疗仍在场主力与已加入的援军，不能复活或提前召来待援伙伴。'},
  momo:{label:'夜视',positioning:'黑猫侦察辅助，夜视照破首领影幕并给全体在场伙伴加盾；本章敌情持续可见，夜视用于创造集火窗口。'},
};
