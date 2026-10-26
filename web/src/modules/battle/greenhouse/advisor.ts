import {CAT_DEFINITIONS, MAP, RULES, SKILLS} from './config';
import {cellName, getGreenhouseAdvice} from './engine';
import type {GreenhouseCatId, GreenhouseState} from './types';

export interface GreenhouseAdvice {title:string; text:string}
const aliases:readonly [GreenhouseCatId,RegExp][]=[
  ['caster',/绒绒|布偶|星绒|caster/i],['guard',/斑斑|盾卫|罐盖|guard/i],['tuanzi',/团子|橘猫|橘影|tuanzi/i],
  ['bruiser',/栗栗|狸花|斗士|栗盾|bruiser/i],['controller',/铃铃|银渐层|银铃|controller/i],['momo',/墨墨|黑猫|巡光|momo/i],
];

/** Only current visible state is read; local advice never changes the battle. */
export function getGreenhouseAnswer(state:GreenhouseState,question:string):GreenhouseAdvice {
  const prompt=typeof question==='string'?question.trim().slice(0,500):'';
  if(state.phase==='won'||state.phase==='lost')return {title:'本场花房守护已结束',text:getGreenhouseAdvice(state)};
  if(/下一波|下波|未来|后几波|还没出现|预知/.test(prompt))return {title:'只观察公开战况',text:'我不会预读尚未出现的波次。可以询问当前路线、荆棘、护盾、能量或猫咪技能。'};
  if(/喵喵|主角|金吉拉|阿策|军师/.test(prompt))return {title:'保护点与军师',text:'喵喵固定在 B1，阿策提供本地规则建议；两者不占六猫名额，不攻击或蓄能。'};
  const ids=aliases.filter(([,pattern])=>pattern.test(prompt)).map(([id])=>id),id=ids.length===1?ids[0]:undefined;
  const target=state.cats.find(cat=>cat.id===id),momo=state.cats.find(cat=>cat.id==='momo')!;
  if(/退场|复活|休整|重新上阵/.test(prompt))return {title:'体力归零退出本场',text:'体力大于零时继续战斗，归零后本场不能移动、施法、复活或重新部署。墨墨的护盾不治疗、不复活；所有猫退场会失败，重新挑战恢复出战状态。'};
  if(/点点|治疗|回血|喝药/.test(prompt))return {title:'本章用护盾保护伙伴',text:'点点本章休养，出战辅助是黑猫墨墨。巡光护行给仍在场伙伴 45 护盾并清除已经生成的荆棘，不恢复体力。本章没有治疗道具，也没有复活。注意提前换位、护盾与清棘。'};
  if(/墨墨|巡光|清.*荆|清.*棘|清除|护行/.test(prompt)&&!/所有|六只|全部.*技能/.test(prompt))return {title:'墨墨 · 巡光护行',text:`${momo.status==='retired'?'墨墨已退场，本场无法再释放技能。':`墨墨当前 ${Math.floor(momo.energy)} / 100 能量。`}满能手动释放，为全部在场伙伴提供 ${SKILLS.momo.shield} 护盾，持续 ${SKILLS.momo.duration} 秒，与已有护盾取较大值和较长时长，不相加；同时清掉所有已生成荆棘。不能取消尚未落地的播种预告；如果在预告阶段施放，预告仍会按时长成荆棘。${state.hazards.length?`当前已生成荆棘：${state.hazards.map(cellName).join('、')}。`:'当前没有已生成荆棘。'}`};
  if(/boss|首领|荆棘|播种|大招|预告|危险/i.test(prompt))return {title:'预告结束后，荆棘仍然危险',text:`荆冠首领占 C6、C7、D6、D7 四格，同一次范围攻击只结算一次。播种锁定最近两只在场猫的位置，${RULES.bossSeedWindup} 秒后长出持续 ${RULES.thornDuration} 秒的荆棘，每秒 ${RULES.thornDamage} 伤害；落地满 1 秒才开始造成伤害。预告锁点后不追踪，可以换位躲避。${state.boss.phase==='windup'?`当前预告：${state.boss.targetCells.map(cellName).join('、')}。`:''}${state.hazards.length?`当前持续荆棘：${state.hazards.map(cellName).join('、')}，首领收势或恢复普攻时这些地格仍不安全。`:'当前没有持续荆棘。'}墨墨只清已生成荆棘，不清未落地预告。`};
  if(/封能|横扫|熄灯/.test(prompt))return {title:'花房首领使用荆棘播种',text:'本章没有熄灯横扫或封能。需要躲开两处播种预告，并在荆棘持续期间离开危险格；也可以用墨墨清除已经生成的荆棘。'};
  if(/能量|蓄能|鱼干|冻干|充能|道具|背包/.test(prompt))return {title:'自动蓄能，手动施放',text:`在场猫每模拟秒 +${RULES.energyPerSecond} 能量，上限 100，20 秒蓄满；没有目标也增长，普攻不额外加能。暂停、军师、拖动期间停表，倍速同步。没有技能冷却或物品补能。${target?`${target.name}当前 ${Math.floor(target.energy)} / 100 能量。`:''}`};
  if(/技能|能力|本领|会什么/.test(prompt))return {title:target?`${target.name}的能力`:'六猫技能配合',text:state.cats.filter(cat=>!ids.length||ids.includes(cat.id)).map(cat=>`${cat.name}「${SKILLS[cat.id].name}」：${SKILLS[cat.id].description}`).join('\n')+'\n所有技能消耗 100 能量。本章没有治疗或复活。'};
  if(/阵|摆|站位|部署|路线|出怪|地图|入口|缺口|边界|花架/.test(prompt))return {title:'沿真实花房地格守线',text:`本图只有 A2–A5、B1–B7、C2–C8、D2–D9、E2–E8、F7，共 34 格；外框内其余 20 格不存在，不能移动、选点或穿行。入口 ${MAP.spawns.map(cellName).join('、')} 汇向 B1。C3、D3、D4 是花房障碍，Boss 占 C6、C7、D6、D7，合计 23 个候选部署格。初始站位：${state.cats.map(cat=>`${cat.name} ${cellName(CAT_DEFINITIONS[cat.id].initial)}`).join('，')}。看到播种标记及时移开，别把首领收势误当成荆棘消失。`};
  if(/敌|黑影|怪/.test(prompt))return {title:'当前可见敌情',text:state.enemies.length?`场上可见 ${state.enemies.length} 名普通黑影，包括 ${[...new Set(state.enemies.map(enemy=>enemy.name))].join('、')}；留意阻挡容量、持续荆棘与保护点。`:'当前没有普通黑影在场，我不预读未出现的波次。'};
  return {title:'阿策 · 花房建议',text:prompt?'我使用本地规则读取当前战况。可以问真实边界、三路站位、荆棘播种、墨墨护行或猫咪技能。':getGreenhouseAdvice(state)};
}
