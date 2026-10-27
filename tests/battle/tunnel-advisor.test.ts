import test from 'node:test';
import assert from 'node:assert/strict';
import {createTunnelBattle} from '../../web/src/modules/battle/tunnel/engine.ts';
import {getTunnelAnswer} from '../../web/src/modules/battle/tunnel/advisor.ts';
import {MAP, RULES, SKILLS} from '../../web/src/modules/battle/tunnel/config.ts';
import type {TunnelEnemy} from '../../web/src/modules/battle/tunnel/types.ts';

function enemy(id:string,x:number,y:number,name:string):TunnelEnemy {
  return {id,x,y,name,kind:'scout',hp:73,maxHp:100,route:'lower',pathIndex:1,slowRemaining:0,slowMultiplier:1,
    damage:9,speed:.55,interval:1.4,cooldown:0,blockedBy:null};
}

test('tunnel map advice explains actual boundary, nine obstacles and safe pipe detour',()=>{
  const answer=getTunnelAnswer(createTunnelBattle(),'地图的边界和出怪入口？');
  for(const text of ['A1–D8','E4–E8','37 格','E1–E3','不能移动、选点或穿行','A2','B8','D8','C2','20 个候选部署格','绕 A1、B1、C1','B2 完全阻路'])assert.ok(answer.text.includes(text),text);
  assert.ok(answer.text.includes(MAP.obstacles.map(p=>String.fromCharCode(65+p.y)+(p.x+1)).join('、')));
  assert.doesNotMatch(answer.text,/34 格|F7|花架/);
});

test('momo advice matches L04 night vision and shield timers, including retired fallback',()=>{
  const state=createTunnelBattle();state.phase='battle';state.darknessRemaining=6;
  const answer=getTunnelAnswer(state,'墨墨现在能做什么？');
  for(const text of [`恢复全场视野 ${SKILLS.momo.nightVision} 秒`,`${SKILLS.momo.shield} 护盾`,`${SKILLS.momo.duration} 秒`,'不相加','未使用夜视也会自行恢复','不使用清理荆棘'])assert.ok(answer.text.includes(text),text);
  state.nightVisionRemaining=4.5;
  assert.match(getTunnelAnswer(state,'墨墨的夜视').text,/夜视还剩 4.5 秒/);
  state.cats.find(cat=>cat.id==='momo')!.status='retired';
  assert.match(getTunnelAnswer(state,'墨墨的夜视').text,/墨墨已退场，本场无法再释放技能/);
});

test('blackout advice uses full-board pulse and explains that ordinary controls keep working',()=>{
  const state=createTunnelBattle();state.phase='battle';state.darknessRemaining=5;
  const answer=getTunnelAnswer(state,'断灯监守大招怎么应对？');
  for(const text of ['C6、C7、D6、D7',`预警 ${RULES.bossPulseWindup} 秒`,`${RULES.bossPulseDamage} 点伤害`,`断灯 ${RULES.darknessDuration} 秒`,'不能靠换位躲开','猫与喵喵始终可见','曼哈顿距离 1 格','攻击、阻挡、移动和蓄能照常','不会封能','等待断灯自然结束'])assert.ok(answer.text.includes(text),text);
});

test('Diandian is a deployed Siamese healer while Meowmeow remains the noncombatant protection goal',()=>{
  const state=createTunnelBattle();
  const healing=getTunnelAnswer(state,'点点能治疗吗？').text;
  assert.match(healing,/随队出战的暹罗猫/);assert.match(healing,new RegExp(`${SKILLS.diandian.heal} 体力`));assert.match(healing,/不能复活/);
  assert.doesNotMatch(healing,/场外巡视/);
  const hero=getTunnelAnswer(state,'主角喵喵做什么？').text;
  for(const text of ['C2','全程不攻击、不阻挡、不蓄能','突破 3 次','不占六猫编队'])assert.ok(hero.includes(text),text);
  assert.match(getTunnelAnswer(state,'退场猫能复活吗？').text,/不能移动、施法、复活或重新部署/);
  const team=getTunnelAnswer(state,'六只猫有什么能力？').text;
  for(const name of ['绒绒','斑斑','团子','点点','栗栗','墨墨'])assert.ok(team.includes(name),name);
  assert.doesNotMatch(team,/铃铃|巡光护行/);
});

test('local enemy answers disclose only visible enemies during darkness, even when all are hidden',()=>{
  const state=createTunnelBattle();state.phase='battle';state.darknessRemaining=8;
  for(const cat of state.cats){cat.x=MAP.goal.x;cat.y=MAP.goal.y;}
  state.enemies=[enemy('near',0,2,'近处巡逻黑影'),enemy('far',7,1,'远处特殊黑影')];
  const visible=getTunnelAnswer(state,'当前有哪些敌人？').text;
  assert.match(visible,/可见 1 名/);assert.match(visible,/近处巡逻黑影/);
  assert.doesNotMatch(visible,/远处特殊黑影|B8|73/);
  state.enemies=state.enemies.filter(value=>value.id==='far');
  const hidden=getTunnelAnswer(state,'当前有哪些敌人？').text;
  assert.match(hidden,/当前视野内没有普通黑影/);assert.match(hidden,/不能据此判断远处是否安全/);
  assert.doesNotMatch(hidden,/远处特殊黑影|B8|73|当前没有普通黑影在场/);
  state.nightVisionRemaining=10;
  assert.match(getTunnelAnswer(state,'当前有哪些敌人？').text,/远处特殊黑影/);
});

test('only a dove unlocks real wave scouting; other carries do not unlock hidden current enemies',()=>{
  for(const carry of [undefined,'lantern','mirror','bell','box','dog']){
    assert.match(getTunnelAnswer(createTunnelBattle({carry}),'下一波是什么？').text,/不会预读/);
  }
  const state=createTunnelBattle({carry:'dove'});state.phase='battle';state.wave=1;state.darknessRemaining=8;
  const answer=getTunnelAnswer(state,'下一波是什么？').text;
  assert.match(answer,/下一波 · 第 2 波/);assert.match(answer,/A2|B8|D8/);
  assert.match(answer,/不揭示黑暗中敌人的实时位置或体力/);
});

test('rescue story keeps the trapped cats outside the six-cat roster and advice never mutates battle state',()=>{
  const state=createTunnelBattle(),before=structuredClone(state);
  const answer=getTunnelAnswer(state,'三号泄洪阀后的救援目标是谁？');
  for(const text of ['三号泄洪阀','花猫姐妹和幼猫','不加入本场六猫编队','不新增战斗随机事件'])assert.ok(answer.text.includes(text),text);
  for(const prompt of ['当前敌人','地图','六只猫有什么能力？','墨墨技能','怎样蓄能','主角职责','下一波是什么？',''])getTunnelAnswer(state,prompt);
  assert.deepEqual(state,before);
});
