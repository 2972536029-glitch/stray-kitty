import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinaleBattle, getBossDamageMultiplier} from '../../web/src/modules/battle/finale/engine.ts';
import {getFinaleAnswer} from '../../web/src/modules/battle/finale/advisor.ts';
import {ALLY_DEFINITIONS, CELLS, MAP, RULES, SKILLS} from '../../web/src/modules/battle/finale/config.ts';
import {cellName, mapCell} from '../../web/src/modules/battle/finale/painter.ts';
import type {FinaleEnemy} from '../../web/src/modules/battle/finale/types.ts';

test('finale map advice describes the actual warehouse perimeter, three entrances and fixed pads',()=>{
  const answer=getFinaleAnswer(createFinaleBattle(),'地图的边界和出怪入口？').text;
  for(const phrase of ['74 格','A/G 行仅 4–11 列','B/F 行为 2–12 列','C/D/E 行为 1–12 列','透明缺口','A11、D12、G11','D2','固定支援台'])assert.ok(answer.includes(phrase),phrase);
  assert.ok(answer.includes(MAP.obstacles.map(cellName).join('、')));
  assert.equal(CELLS.length,74);assert.equal(mapCell(0,0),false);assert.equal(mapCell(10,6),true);assert.equal(mapCell(11,6),false);
  assert.doesNotMatch(answer,/37 格|C2|地下通道|四格/);
});

test('main squad and noncombatant protection goal are distinct from fixed allies',()=>{
  const state=createFinaleBattle(),hero=getFinaleAnswer(state,'主角喵喵做什么？').text;
  for(const phrase of ['D2','全程不攻击、不阻挡、不蓄能','突破 3 次','不占六猫编队','六位主力全部退场'])assert.ok(hero.includes(phrase),phrase);
  const skills=getFinaleAnswer(state,'六只猫有什么能力？').text;
  for(const name of ['绒绒','斑斑','团子','栗栗','点点','墨墨'])assert.ok(skills.includes(name),name);
  const heal=getFinaleAnswer(state,'点点能治疗吗？').text;
  for(const phrase of ['随队出战的暹罗猫',`${SKILLS.diandian.heal} 体力`,'已加入的援军','不能复活','不会提前召来等待援军'])assert.ok(heal.includes(phrase),phrase);
});

test('nine-cell two-stage boss advice matches damage, telegraph timer and current exact target cells',()=>{
  const state=createFinaleBattle();state.phase='battle';state.boss.tierPhase=2;state.boss.skill='crown';state.boss.phase='windup';state.boss.targetCells=[{x:4,y:2},{x:4,y:3}];
  const answer=getFinaleAnswer(state,'王冠坠击怎么躲？').text;
  for(const phrase of [MAP.bossCells.map(cellName).join('、'),'九格，共用一条血条','同一次范围攻击只结算一次','裂影横扫','半血后进入第二阶段','最多两名主力',`预警 ${RULES.bossSkillWindup} 秒`,`${RULES.bossSweepDamage} 点伤害`,`${RULES.bossCrownDamage} 点伤害`,'C5、D5','预警后不会追踪新站位','两名精英全部击败'])assert.ok(answer.includes(phrase),phrase);
  assert.doesNotMatch(answer,/全场脉冲|不能靠换位/);
});

test('elite advice reports independent current HP and changing boss armor without inventing invulnerability',()=>{
  const state=createFinaleBattle();state.elites[0].hp=570;
  let answer=getFinaleAnswer(state,'两名精英先打谁？').text;
  for(const phrase of ['B9','F9','可以直接攻击、都必须击败','570/','影幕不是无敌',`${Math.round(getBossDamageMultiplier(state)*100)}%`])assert.ok(answer.includes(phrase),phrase);
  state.elites[0].status='defeated';state.elites[0].hp=0;
  answer=getFinaleAnswer(state,'精英护卫有什么能力？').text;assert.match(answer,/影甲卫：已击败/);assert.match(answer,/首领当前承受 100% 伤害/);
});

test('momo advice describes the finale armor window and shields, not a reused blackout',()=>{
  const state=createFinaleBattle();state.phase='battle';state.nightVisionRemaining=4.5;
  const answer=getFinaleAnswer(state,'墨墨的夜视技能？').text;
  for(const phrase of [`照破首领影幕 ${SKILLS.momo.nightVision} 秒`,`${SKILLS.momo.shield} 护盾`,`${SKILLS.momo.duration} 秒`,'全部在场主力与援军','不相加、不治疗、不复活','没有全场熄灯','不使用清理荆棘','夜视还剩 4.5 秒','击败影甲卫也能永久解除影幕'])assert.ok(answer.includes(phrase),phrase);
  state.cats.find(cat=>cat.id==='momo')!.status='retired';assert.match(getFinaleAnswer(state,'墨墨能用技能吗？').text,/墨墨已退场，本场无法再释放技能/);
});

test('reinforcement advice shows public arrival order, actual states and the need for player control',()=>{
  const state=createFinaleBattle();state.allies[1].status='active';state.allies[1].hp=91;state.allies[2].status='retired';state.allies[2].hp=0;
  const answer=getFinaleAnswer(state,'援军何时加入？').text;
  for(const ally of ALLY_DEFINITIONS)for(const phrase of [ally.name,cellName(ally),`第 ${ally.arriveWave} 波加入`])assert.ok(answer.includes(phrase),phrase);
  for(const phrase of ['等待入场','在场，体力 91','已退场，不会再次入场','主力不能占用或交换','不能拖动或手动施法','不能保证胜利','手动使用技能'])assert.ok(answer.includes(phrase),phrase);
  const retired=getFinaleAnswer(state,'退场援军能复活吗？').text;assert.match(retired,/等待援军不会提前入场/);assert.match(retired,/六位主力全部退场会失败，即使仍有援军/);
});

test('light corridor advice follows current stage and actual cart waypoint without adding consumables',()=>{
  for(const stage of [0,1,2,3] as const){const state=createFinaleBattle();state.lightStage=stage;const answer=getFinaleAnswer(state,'光路有什么用？').text;
    for(const phrase of [`光路 ${stage} / 3`,cellName(MAP.lightWaypoints[stage]),`${Math.round(getBossDamageMultiplier(state)*100)}%`,'第 3、5、7 波','无需消耗道具','击败两名精英与首领'])assert.ok(answer.includes(phrase),phrase);
  }
});

test('only a dove previews future minions; current enemies remain visible in finale',()=>{
  for(const carry of [undefined,'lantern','mirror','bell','box','dog'])assert.match(getFinaleAnswer(createFinaleBattle({carry}),'下一波是什么？').text,/不会预读/);
  const state=createFinaleBattle({carry:'dove'});state.phase='battle';state.wave=1;
  const forecast=getFinaleAnswer(state,'下一波是什么？').text;assert.match(forecast,/下一波 · 第 2 波/);assert.match(forecast,/A11|D12|G11/);
  state.enemies=[{id:'seen',kind:'runner',name:'疾行黑影',x:11,y:3,hp:70,maxHp:70,route:'branch',pathIndex:0,slowRemaining:0,slowMultiplier:1,damage:6,speed:.85,interval:1,cooldown:0,blockedBy:null} satisfies FinaleEnemy];
  const visible=getFinaleAnswer(state,'当前有哪些敌人？').text;assert.match(visible,/1 名普通黑影/);assert.match(visible,/疾行黑影/);assert.match(visible,/敌人一直可见/);
});

test('local advice preserves no-item rules, independent trial boundary and all battle state',()=>{
  const state=createFinaleBattle(),before=structuredClone(state),story=getFinaleAnswer(state,'剧情和正式结局如何对接？').text;
  for(const phrase of ['团子携带灯具','点点排除绊线','墨墨侦察','家园独立试玩','不写主线完成旗标','不永久招募新猫','不发放道具奖励'])assert.ok(story.includes(phrase),phrase);
  const energy=getFinaleAnswer(state,'技能能量和道具？').text;assert.match(energy,/没有技能冷却、背包奖励或可购买补给/);assert.match(energy,/事件带入的单件携带物仍按其说明生效/);
  for(const question of ['敌人','地图','两名精英先打谁','援军','光路','六只猫有什么能力？','墨墨技能','点点治疗','主角职责','下一波是什么？',''])getFinaleAnswer(state,question);
  assert.deepEqual(state,before);
});
