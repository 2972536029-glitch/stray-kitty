import {getCarryWavePreview} from '../CarryPanel';
import {CAT_DEFINITIONS, CELLS, ENEMY_DEFINITIONS, MAP, ROUTES, RULES, SKILLS, WAVES} from './config';
import {cellName, getTunnelAdvice, isDarkened, isDeployableCell, isEnemyVisible} from './engine';
import type {TunnelCatId, TunnelState} from './types';

export interface TunnelAdvice {title:string; text:string}
const aliases:readonly [TunnelCatId,RegExp][]=[
  ['caster',/绒绒|布偶|星绒|caster/i],['guard',/斑斑|盾卫|罐盖|guard/i],['tuanzi',/团子|橘猫|橘影|tuanzi/i],
  ['bruiser',/栗栗|狸花|斗士|栗盾|bruiser/i],['diandian',/点点|暹罗|安心|呼噜|diandian/i],['momo',/墨墨|黑猫|夜视护行|momo/i],
];

/** Questions can only disclose currently visible enemies; a dove alone unlocks wave scouting. */
export function getTunnelAnswer(state:TunnelState,question:string):TunnelAdvice {
  const prompt=typeof question==='string'?question.trim().slice(0,500):'';
  if(state.phase==='won'||state.phase==='lost')return {title:'本场地下通道守护已结束',text:getTunnelAdvice(state)};
  if(/下一波|下波|未来|后几波|还没出现|预知|预览|预报/.test(prompt)){
    if(state.carry.id!=='dove')return {title:'只观察公开战况',text:'没有咕咕鸽子的侦察，我不会预读尚未出现的波次。可以询问当前可见敌情、管道路线、夜视、护盾或能量。'};
    const forecast=getCarryWavePreview(WAVES,state.wave,state.phase,Object.fromEntries(Object.entries(ROUTES).map(([route,path])=>[route,path[0]])),ENEMY_DEFINITIONS);
    return {title:'咕咕鸽子的波次预告',text:forecast.map(item=>`${item.label} · 第 ${item.wave} 波 · 共 ${item.total} 只：${item.groups.map(group=>`${group.entrance} ${group.enemy} ×${group.count}`).join('；')}`).join('\n')+'\n这是入口与波次预告，不揭示黑暗中敌人的实时位置或体力。'};
  }
  if(/喵喵|主角|金吉拉|阿策|军师/.test(prompt))return {title:'保护目标与军师',text:`喵喵固定在 ${cellName(MAP.goal)}，是需要保护的目标，全程不攻击、不阻挡、不蓄能。防线累计被突破 ${RULES.maxLeaks} 次就会失败。阿策在场外提供本地规则建议，两者都不占六猫编队名额。黑暗中喵喵和所有在场伙伴始终可见。`};
  const ids=aliases.filter(([,pattern])=>pattern.test(prompt)).map(([id])=>id),id=ids.length===1?ids[0]:undefined;
  const target=state.cats.find(cat=>cat.id===id),momo=state.cats.find(cat=>cat.id==='momo')!;
  if(/退场|复活|休整|重新上阵/.test(prompt))return {title:'体力归零退出本场',text:'体力大于零时继续战斗，归零后本场不能移动、施法、复活或重新部署。点点只治疗仍在场伙伴，墨墨只恢复视野和提供护盾。所有猫退场会失败，重新挑战恢复出战状态。'};
  if(/墨墨|夜视护行|清.*荆|清.*棘/.test(prompt)&&!/所有|六只|全部.*技能/.test(prompt))return {title:`墨墨 · ${SKILLS.momo.name}`,text:`${momo.status==='retired'?'墨墨已退场，本场无法再释放技能。':`墨墨当前 ${Math.floor(momo.energy)} / 100 能量。`}满能手动释放，恢复全场视野 ${SKILLS.momo.nightVision} 秒，并为全部在场伙伴提供 ${SKILLS.momo.shield} 护盾、持续 ${SKILLS.momo.duration} 秒。与已有护盾取较大值和较长时长，不相加。可以在断灯预警时提前保护队伍；断灯后也能释放恢复视野。本章不使用清理荆棘能力，也不治疗或复活。${state.nightVisionRemaining>0?`夜视还剩 ${state.nightVisionRemaining.toFixed(1)} 秒。`:isDarkened(state)?`当前断灯还剩 ${state.darknessRemaining.toFixed(1)} 秒，未使用夜视也会自行恢复。`:'当前通道视野正常。'}`};
  if(/点点|治疗|回血|喝药/.test(prompt)&&!/所有|六只|全部.*技能/.test(prompt)){
    const diandian=state.cats.find(cat=>cat.id==='diandian')!;
    return {title:'点点 · 安心呼噜',text:`点点是随队出战的暹罗猫辅助，剧情中识破绊线与假哭声。${diandian.status==='retired'?'点点已退场，本场无法再治疗。':`当前 ${Math.floor(diandian.energy)} / 100 能量。`}满能可为全部仍在场伙伴恢复 ${SKILLS.diandian.heal} 体力，不超过上限，不能复活。没有治疗道具；墨墨的护盾也不等于治疗。`};
  }
  if(state.boss.phase==='defeated'&&/boss|首领/i.test(prompt))return {title:'首领已退去',text:'首领原占格已可部署，仍需避开有普通黑影的格子，并完成剩余胜利条件。'};
  if(/boss|首领|大招|预告|危险|断灯|熄灯|变暗|黑暗|夜视|视野|封能|荆棘|播种/i.test(prompt))return {title:'断灯脉冲与夜视应对',text:`${state.boss.name}固定占据 ${MAP.bossCells.map(cellName).join('、')} 四格，同一次范围攻击只结算一次。断灯脉冲会先预警 ${RULES.bossPulseWindup} 秒，再对在场伙伴造成 ${RULES.bossPulseDamage} 点伤害并断灯 ${RULES.darknessDuration} 秒；全场脉冲不能靠换位躲开，可提前开盾。黑暗只隐藏远处普通黑影，猫与喵喵始终可见，距任一在场猫或喵喵曼哈顿距离 1 格内的黑影可见；攻击、阻挡、移动和蓄能照常。墨墨的夜视可恢复全部敌情，不会封能，也没有荆棘。${isDarkened(state)?`当前仍在断灯，${state.darknessRemaining.toFixed(1)} 秒后自然恢复。`:state.nightVisionRemaining>0?`夜视仍有 ${state.nightVisionRemaining.toFixed(1)} 秒。`:'当前视野正常。'}即使墨墨退场，也能等待断灯自然结束。`};
  if(/能量|蓄能|鱼干|冻干|充能|道具|背包/.test(prompt))return {title:'自动蓄能，手动施放',text:`在场猫每模拟秒 +${RULES.energyPerSecond} 能量，上限 ${RULES.maxEnergy}，${RULES.maxEnergy/RULES.energyPerSecond} 秒蓄满；没有目标也增长，普攻不额外加能。暂停、军师、拖动期间停表，倍速同步。没有技能冷却或可购买补给；事件带入的携带物仍按其说明生效。${target?`${target.name}当前 ${Math.floor(target.energy)} / 100 能量。`:''}`};
  if(/技能|能力|本领|会什么/.test(prompt))return {title:target?`${target.name}的能力`:'六猫技能配合',text:state.cats.filter(cat=>!ids.length||ids.includes(cat.id)).map(cat=>`${cat.name}「${SKILLS[cat.id].name}」：${SKILLS[cat.id].description}`).join('\n')+'\n所有技能消耗 100 能量。退场伙伴不能复活。'};
  if(/阵|摆|站位|部署|路线|出怪|地图|入口|缺口|边界|管道|障碍/.test(prompt))return {title:'沿地下通道的真实地格守线',text:`本图 A1–D8 全部存在，底边只有 E4–E8，共 ${CELLS.length} 格；E1–E3 是透明缺口，不能移动、选点或穿行。入口 ${MAP.spawns.map(cellName).join('、')} 汇向 ${cellName(MAP.goal)}。上路由 A2 暗管口绕 A1、B1、C1 后到 C2，B2 完全阻路，不直冲喵喵；其余两路从右侧汇向 C3。障碍为 ${MAP.obstacles.map(cellName).join('、')}，${state.boss.phase==='defeated'?'首领已退去，C6、C7、D6、D7 已可部署':'首领占 C6、C7、D6、D7，在场时不能部署'}，当前 ${CELLS.filter(cell=>isDeployableCell(cell,state)).length} 个候选部署格。推荐斑斑守左侧、栗栗守 C3，团子与绒绒压住首领侧。初始站位：${state.cats.map(cat=>`${cat.name} ${cellName(CAT_DEFINITIONS[cat.id].initial)}`).join('，')}。`};
  if(/三号|3号|花猫|姐妹|幼猫|救援|故事|剧情|假哭|绊线|诱饵/.test(prompt))return {title:'找到三号泄洪阀后的伙伴',text:'墨墨在第四章解锁夜视，带大家辨认暗处的三号泄洪阀；点点识破绊线与假幼猫哭声，团子护住救援撤离的通路。铁栅后的花猫姐妹和幼猫是待救对象，只作为场景展示，不加入本场六猫编队，也不新增战斗随机事件。'};
  if(/敌|黑影|怪/.test(prompt)){
    const visible=state.enemies.filter(enemy=>isEnemyVisible(state,enemy));
    return {title:'当前可见敌情',text:visible.length?`当前可见 ${visible.length} 名普通黑影，包括 ${[...new Set(visible.map(enemy=>enemy.name))].join('、')}。${isDarkened(state)?'远处敌情被黑暗遮蔽，无法确定其位置与体力；可用墨墨恢复视野。':'留意阻挡容量与喵喵的安全。'}`:isDarkened(state)?'当前视野内没有普通黑影，不能据此判断远处是否安全；墨墨可恢复视野，或等待断灯自然结束。':'当前没有普通黑影在场，我不预读未出现的波次。'};
  }
  return {title:'阿策 · 地下通道建议',text:prompt?'我使用本地规则读取当前可见战况。可以问管道绕行、三路站位、断灯脉冲、墨墨夜视、点点治疗或救援目标。':getTunnelAdvice(state)};
}
