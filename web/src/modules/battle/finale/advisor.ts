import {getCarryWavePreview} from '../CarryPanel';
import {CAT_DEFINITIONS, CELLS, ENEMY_DEFINITIONS, MAP, ROUTES, RULES, SKILLS, WAVES} from './config';
import {cellName, getBossDamageMultiplier, getFinaleAdvice, isDeployableCell} from './engine';
import type {FinaleCatId, FinaleState} from './types';

export interface FinaleAdvice {title:string;text:string}
const aliases:readonly [FinaleCatId,RegExp][]=[
  ['caster',/绒绒|布偶|星绒|caster/i],['guard',/斑斑|盾卫|罐盖|guard/i],['tuanzi',/团子|橘猫|橘影|tuanzi/i],
  ['bruiser',/栗栗|狸花|斗士|栗盾|bruiser/i],['diandian',/点点|暹罗|安心|呼噜|diandian/i],['momo',/墨墨|黑猫|夜视护行|momo/i],
];

/** Local, read-only advice; only a dove unlocks information about future minion waves. */
export function getFinaleAnswer(state:FinaleState,question:string):FinaleAdvice{
  const prompt=typeof question==='string'?question.trim().slice(0,500):'';
  if(state.phase==='won'||state.phase==='lost')return {title:'本场仓库决战已结束',text:getFinaleAdvice(state)};
  if(/下一波|下波|未来|后几波|还没出现|预知|预览|预报/.test(prompt)){
    if(state.carry.id!=='dove')return {title:'只观察公开战况',text:'没有咕咕鸽子的侦察，我不会预读尚未出现的波次。援军第 3、5、7 波加入属于公开规则，可以随时询问。'};
    const forecast=getCarryWavePreview(WAVES,state.wave,state.phase,Object.fromEntries(Object.entries(ROUTES).map(([route,path])=>[route,path[0]])),ENEMY_DEFINITIONS);
    return {title:'咕咕鸽子的波次预告',text:forecast.map(item=>`${item.label} · 第 ${item.wave} 波 · 共 ${item.total} 只：${item.groups.map(group=>`${group.entrance} ${group.enemy} ×${group.count}`).join('；')}`).join('\n')};
  }
  if(/喵喵|主角|金吉拉|阿策|军师/.test(prompt))return {title:'保护目标与军师',text:`喵喵固定在 ${cellName(MAP.goal)}，全程不攻击、不阻挡、不蓄能。防线累计被突破 ${RULES.maxLeaks} 次就会失败。阿策在场外提供本地规则建议，两者都不占六猫编队名额。六位主力全部退场也会失败，固定援军不能替代主力守护任务。`};
  const ids=aliases.filter(([,pattern])=>pattern.test(prompt)).map(([id])=>id),id=ids.length===1?ids[0]:undefined;
  const target=state.cats.find(cat=>cat.id===id),momo=state.cats.find(cat=>cat.id==='momo')!;
  if(/退场|复活|休整|重新上阵/.test(prompt))return {title:'主力与援军都不会在本场复活',text:'体力归零后本场不能移动、施法、复活或重新部署。点点只治疗仍在场主力与已加入的援军；墨墨只提供护盾与破影幕。等待援军不会提前入场，已退场援军不会再次入场。六位主力全部退场会失败，即使仍有援军。重新挑战会重置出战与援军到达时序。'};
  if(/援军|支援|铃铃|桃桃|音音|炮台|固定/.test(prompt))return {title:'伙伴们分批来到固定支援台',text:state.allies.map(ally=>`${ally.name} · ${cellName(ally)} · 第 ${ally.arriveWave} 波加入 · ${ally.status==='waiting'?'等待入场':ally.status==='retired'?'已退场，不会再次入场':`在场，体力 ${Math.ceil(ally.hp)} / ${ally.maxHp}`}：${ally.description}`).join('\n')+'\n三座支援台始终保留，主力不能占用或交换；援军自动协助、不能拖动或手动施法，不计入六位主力。援军会受伤、会退场，不能保证胜利；主力仍要守线、躲避预警并手动使用技能。'};
  if(/墨墨|夜视护行|清.*荆|清.*棘/.test(prompt)&&!/所有|六只|全部.*技能/.test(prompt))return {title:`墨墨 · ${SKILLS.momo.name}`,text:`${momo.status==='retired'?'墨墨已退场，本场无法再释放技能。':`墨墨当前 ${Math.floor(momo.energy)} / 100 能量。`}满能手动释放，照破首领影幕 ${SKILLS.momo.nightVision} 秒，使首领受到完整伤害，并为全部在场主力与援军提供 ${SKILLS.momo.shield} 护盾、持续 ${SKILLS.momo.duration} 秒。与已有护盾取较大值和较长时长，不相加、不治疗、不复活。本章敌情始终可见，没有全场熄灯，也不使用清理荆棘能力。夜视可以配合团子与绒绒集火；即使墨墨退场，击败影甲卫也能永久解除影幕。${state.nightVisionRemaining>0?`夜视还剩 ${state.nightVisionRemaining.toFixed(1)} 秒。`:''}`};
  if(/点点|治疗|回血|喝药/.test(prompt)&&!/所有|六只|全部.*技能/.test(prompt)){
    const diandian=state.cats.find(cat=>cat.id==='diandian')!;
    return {title:'点点 · 安心呼噜',text:`点点是随队出战的暹罗猫辅助，入仓前排除绊线。${diandian.status==='retired'?'点点已退场，本场无法再治疗。':`当前 ${Math.floor(diandian.energy)} / 100 能量。`}满能可为全部仍在场主力与已加入的援军恢复 ${SKILLS.diandian.heal} 体力，不超过上限，不能复活；不会提前召来等待援军。没有治疗道具，护盾也不等于治疗。`};
  }
  if(/精英|护卫|影甲|鸣影|守卫|减伤|先打谁/.test(prompt))return {title:'两名护卫各自有独立血条',text:`影甲卫位于 ${cellName(state.elites[0])}，存活时给首领影幕减伤；鸣影卫位于 ${cellName(state.elites[1])}，存活时让普通黑影伤害提高 ${Math.round((RULES.hornDamageMultiplier-1)*100)}%。它们可以直接攻击、都必须击败。先处理影甲卫有利于集火首领，先处理鸣影卫有利于守住三路。首领当前承受 ${Math.round(getBossDamageMultiplier(state)*100)}% 伤害，影幕不是无敌；光路推进会削弱影幕，墨墨夜视暂时照破，影甲卫被击败则永久解除。${state.elites.map(elite=>`${elite.name}：${elite.status==='defeated'?'已击败':`${Math.ceil(elite.hp)}/${elite.maxHp} 体力`}`).join('；')}。`};
  if(/光路|灯车|灯具|照明|推进/.test(prompt))return {title:'伙伴们一起推进救援光路',text:`当前光路 ${state.lightStage} / 3，聚光小车在 ${cellName(MAP.lightWaypoints[state.lightStage])}。第 3、5、7 波各推进一次，团子带来的灯具逐步照向仓库深处；影甲卫存活时，每推进一级让首领额外承受 ${Math.round(RULES.lightArmorStep*100)} 个百分点伤害。当前首领承受 ${Math.round(getBossDamageMultiplier(state)*100)}% 伤害。光路属于战场进程，无需消耗道具；胜利仍要守完全部波次、击败两名精英与首领。`};
  if(state.boss.phase==='defeated'&&/boss|首领/i.test(prompt))return {title:'首领已退去',text:'首领原占格已可部署，仍需避开有普通黑影的格子，并完成剩余胜利条件。'};
  if(/boss|首领|大招|危险|横扫|坠击|王冠|阶段|断灯|熄灯|黑暗|视野/i.test(prompt))return {title:'永夜之王 · 两阶段决战',text:`首领固定占据 ${MAP.bossCells.map(cellName).join('、')} 九格，共用一条血条，同一次范围攻击只结算一次。第一阶段「裂影横扫」锁定整行，造成 ${RULES.bossSweepDamage} 点伤害；半血后进入第二阶段，「王冠坠击」锁定最多两名主力的十字区域，造成 ${RULES.bossCrownDamage} 点伤害。两种技能都先预警 ${RULES.bossSkillWindup} 秒，橙色危险格是实际命中范围，拖动主力移出范围可以躲避。预警后不会追踪新站位；移出时也要留意小怪与阻挡空缺。${state.boss.phase==='windup'?`当前${state.boss.skill==='sweep'?'横扫':'坠击'}危险格：${state.boss.targetCells.map(cellName).join('、')}。`:`当前第 ${state.boss.tierPhase} 阶段。`}本章敌情一直可见，夜视用于照破首领影幕。首领和两名精英全部击败、全部波次清理后才能获胜。`};
  if(/能量|蓄能|鱼干|冻干|充能|道具|背包/.test(prompt))return {title:'自动蓄能，手动施放',text:`在场主力每模拟秒 +${RULES.energyPerSecond} 能量，上限 ${RULES.maxEnergy}；没有目标也增长，普攻不额外加能。音音入场后会少量鼓舞补能，但不会代替玩家施法。暂停、军师聊天和拖动期间停表，倍速同步。没有技能冷却、背包奖励或可购买补给；事件带入的单件携带物仍按其说明生效。${target?`${target.name}当前 ${Math.floor(target.energy)} / 100 能量。`:''}`};
  if(/技能|能力|本领|会什么/.test(prompt))return {title:target?`${target.name}的能力`:'六猫技能配合',text:state.cats.filter(cat=>!ids.length||ids.includes(cat.id)).map(cat=>`${cat.name}「${SKILLS[cat.id].name}」：${SKILLS[cat.id].description}`).join('\n')+'\n所有主力技能消耗 100 能量，满能仍需手动释放。'};
  if(/阵|摆|站位|部署|路线|出怪|地图|入口|缺口|边界|障碍/.test(prompt))return {title:'三路汇入废仓库守护点',text:`真实棋盘共 ${CELLS.length} 格：A/G 行仅 4–11 列，B/F 行为 2–12 列，C/D/E 行为 1–12 列。其余是透明缺口，不能部署、选点或通行。入口 ${MAP.spawns.map(cellName).join('、')} 汇向 ${cellName(MAP.goal)}；上下路绕仓库侧廊，中路直进。障碍为 ${MAP.obstacles.map(cellName).join('、')}。喵喵、入口、精英和固定支援台不能部署；${state.boss.phase==='defeated'?'首领已退去，原九格已可部署':'首领仍在场，原九格不能部署'}，当前 ${CELLS.filter(cell=>isDeployableCell(cell,state)).length} 个候选部署格。推荐斑斑守上路、栗栗守下路，团子压住中路；精英退场后可前移远程集火首领。初始站位：${state.cats.map(cat=>`${cat.name} ${cellName(CAT_DEFINITIONS[cat.id].initial)}`).join('，')}。`};
  if(/救援|故事|剧情|结局|招募|解锁|通关|旗标|绊线|仓库/.test(prompt))return {title:'一起照亮仓库深处',text:'团子携带灯具、点点排除绊线、墨墨侦察并引导视线，阿策协助指挥，六位主力保护喵喵。既有伙伴分批抵达固定支援台，仓库隔间里的受困猫在胜利后撤离。本战目前是家园独立试玩，不写主线完成旗标、不永久招募新猫，也不发放道具奖励；正式结局与主线衔接留待团队接入。'};
  if(/敌|黑影|怪/.test(prompt))return {title:'当前公开敌情',text:state.enemies.length?`当前有 ${state.enemies.length} 名普通黑影，包括 ${[...new Set(state.enemies.map(enemy=>enemy.name))].join('、')}。本章敌人一直可见，留意两侧慢线和中路快线。`:'当前没有普通黑影在场，我不预读未出现的波次。两名精英与首领的状态可直接查看顶部血条。'};
  return {title:'阿策 · 仓库决战建议',text:prompt?'我使用本地规则读取当前战况。可以问三路站位、两名精英、首领预警、墨墨破影幕、固定援军或光路推进。':getFinaleAdvice(state)};
}
