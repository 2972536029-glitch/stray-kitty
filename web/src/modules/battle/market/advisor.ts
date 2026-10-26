import {CAT_DEFINITIONS, MAP, RULES, SKILLS} from './config';
import {cellName, getMarketAdvice} from './engine';
import type {MarketCatId, MarketState} from './types';

export interface MarketAdvice {title:string; text:string}
const aliases: readonly [MarketCatId, RegExp][] = [
  ['caster', /绒绒|布偶|星绒|caster/i], ['guard', /斑斑|盾卫|罐盖|guard/i],
  ['tuanzi', /团子|橘猫|橘影|tuanzi/i], ['diandian', /点点|暖心|呼噜|diandian/i],
  ['bruiser', /栗栗|狸花|斗士|栗盾|bruiser/i], ['controller', /铃铃|银渐层|银铃|controller/i],
];

/** Advice reads the visible battle only and never dispatches player actions. */
export function getMarketAnswer(state:MarketState, question:string):MarketAdvice {
  const prompt=typeof question==='string'?question.trim().slice(0,500):'';
  if(state.phase==='won'||state.phase==='lost')return {title:'本场集市守护已结束',text:getMarketAdvice(state)};
  if(/下一波|下波|未来|后几波|还没出现|预知/.test(prompt))return {title:'只看当前公开战况',text:'我不会把尚未出现的敌人当作当前敌情。可以询问七路站位、熄灯横扫、治疗或技能。'};
  if(/喵喵|主角|金吉拉|阿策|军师/.test(prompt))return {title:'指挥与军师',text:'喵喵留在 C1 保护点，阿策提供本地规则建议；两者不占六猫名额，不攻击或蓄能，技能由你操作。'};
  const ids=aliases.filter(([,pattern])=>pattern.test(prompt)).map(([id])=>id);
  const id=ids.length===1?ids[0]:undefined,target=state.cats.find(cat=>cat.id===id);
  if(/退场|复活|休整|重新上阵/.test(prompt))return {title:'零血退出本场',text:'体力大于零时继续战斗，归零才退场。本场不能复活、治疗或重新部署退场猫；全员退场会失败。新挑战重新出战。'};
  if(/boss|首领|横扫|熄灯|封能|大招/i.test(prompt))return {title:'熄灯横扫：先看危险行',text:state.boss.phase==='defeated'?'熄灯首领已击败，继续处理剩余普通敌人。':`首领固定在 C7，收拢灯杖、遮住灯火后会锁定 B、C、D 中的一行。${RULES.bossSweepWindup} 秒后横扫该行，造成 ${RULES.bossSweepDamage} 伤害并封能 ${RULES.bossEnergyBlockDuration} 秒；横扫锁定后不追踪，及时移到其他行。封能只暂停自动蓄能，已满的技能仍可释放。${state.boss.phase==='windup'&&state.boss.targetRow!==null?`当前危险行为 ${'ABCDE'[state.boss.targetRow]} 行。`:''}`};
  if(/治疗|回血|受伤|体力|血量|喝药/.test(prompt)){
    if(target?.status==='retired')return {title:`${target.name}已退场`,text:'本场无法治疗或复活，请保护仍在场的伙伴。'};
    const injured=state.cats.filter(cat=>cat.status==='active'&&cat.hp<cat.maxHp&&(!id||cat.id===id));
    const healer=state.cats.find(cat=>cat.id==='diandian');
    return {title:injured.length?'及时治疗在场伙伴':'当前询问的伙伴体力充足',text:`${injured.map(cat=>`${cat.name} ${Math.ceil(cat.hp)} / ${cat.maxHp}`).join('，')}${injured.length?'。':''}${healer?.status==='active'?`点点当前 ${Math.floor(healer.energy)} / 100 能量，蓄满后手动使用安心呼噜，恢复仍在场全队 ${SKILLS.diandian.heal} 体力。`:'点点已经退场，本场无法使用治疗技能。'}没有治疗道具，护盾不恢复血量。`};
  }
  if(/能量|蓄能|冻干|鱼干|充能|道具|背包/.test(prompt))return {title:'能量按战斗时间积攒',text:`在场伙伴每模拟秒自动 +${RULES.energyPerSecond}，满 100 后手动施法；无目标也能积攒，攻击不额外加能。暂停、军师面板、拖动期间停表，倍速与蓄能同步。封能持续时间内停止增长，已有能量保留；满能仍可释放。没有战斗物品或技能冷却。${target?`${target.name}当前 ${Math.floor(target.energy)} 能量${target.energyBlockedRemaining>0?`，封能剩余 ${target.energyBlockedRemaining.toFixed(1)} 秒`:''}。`:''}`};
  if(/能力|技能|本领|会什么/.test(prompt))return {title:target?`${target.name}的能力`:'伙伴的技能配合',text:state.cats.filter(cat=>!ids.length||ids.includes(cat.id)).map(cat=>`${cat.name}「${SKILLS[cat.id].name}」：${SKILLS[cat.id].description}`).join('\n')+'\n所有主动技能消耗 100 能量。铃铃减速只影响小怪移动，不改变固定首领。'};
  if(/阵|摆|站位|部署|路线|出怪|地图|摊位|入口/.test(prompt))return {title:'七个入口，向 C1 汇合',text:`入口 ${MAP.spawns.map(cellName).join('、')} 轮流来敌，上下路汇入 C 行，右侧三路向左推进。十四格摊位、C1、C7 与入口不能部署，其他 17 格可移动或交换。初始站位：${state.cats.map(cat=>`${cat.name} ${cellName(CAT_DEFINITIONS[cat.id].initial)}`).join('，')}。斑斑与栗栗挡 2 只，其余猫挡 1 只；不要把所有猫集中在同一行，看到横扫警告及时换行。`};
  if(/敌|黑影|怪/.test(prompt))return {title:'当前可见敌情',text:state.enemies.length?`当前场上 ${state.enemies.length} 名普通黑影：${[...new Set(state.enemies.map(enemy=>enemy.name))].join('、')}。铃铃的减速能延缓未被阻挡的小怪；首领需要单独击败。`:'当前没有普通黑影在场，继续观察入口；我不预读未出现的波次。'};
  return {title:'阿策 · 集市战术建议',text:prompt?'我目前使用本地规则，尚未接入模型。可以问七路站位、横扫、封能、治疗或六猫技能。':getMarketAdvice(state)};
}
