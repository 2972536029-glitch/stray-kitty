import type {Advice, CombatState, CombatPhase} from './state.ts';
import { CONFIG, DIFFICULTY_CONFIG, TUTORIAL_TARGETS, SKILLS } from './config.ts';
import {getItemTargetError} from './engine.ts';
import {getAttackCells} from './ranges.ts';

export function buildAdvisorContext(state: CombatState) {
  return {
    mode: 'offline-rules', phase: state.phase, tutorialStep: state.tutorialStep, paused: state.paused, difficulty: state.difficulty,
    wave: state.wave, totalWaves: state.totalWaves, leaks: state.leaks, maxLeaks: state.maxLeaks,
    inventory: { ...state.inventory }, initialInventory: {...state.initialInventory}, bagOpen: state.bagOpen, healingCooldown: state.healingCooldown, energyItemTaught:state.energyItemTaught,
    cats: state.cats.map(cat => {
      const {id, name, role, hp, maxHp, status, combatant, x, y, damage, interval, block, blockedCount, energy, shield, shieldRemaining, energyItemCooldown} = cat;
      return {id, name, role, hp, maxHp, status, combatant, x, y, damage, interval, block, blockedCount, energy, shield, shieldRemaining, energyItemCooldown, attackCells: getAttackCells(cat)};
    }),
    visibleEnemies: state.enemies.filter((enemy) => !enemy.training && enemy.x >= 0 && enemy.x <= CONFIG.VISIBLE_MAX_X).map(({ id, type, hp, maxHp, x, y, blockedBy }) => ({ id, type, hp, maxHp, x, y, blockedBy })),
  };
}

type AdvisorContext = ReturnType<typeof buildAdvisorContext>;
function enemyAdvice(enemy: AdvisorContext['visibleEnemies'][number] | undefined): Advice {
  if (!enemy) return { title: '先观察公开的战场', text: '目前没有进入战斗区的黑影。军师不会预读尚未出现的敌情。' };
  return enemy.type === 'runner'
    ? { title: '疾行黑影出现了', text: '它移动较快。让斑斑站在同一行拦截，绒绒用朝右的矩形普攻范围支援；斑斑最多同时挡住 2 只，超过容量的敌人会走过去。能量满后可以手动释放技能。', targetId: enemy.id }
    : { title: '巡逻黑影正在靠近', text: '用斑斑的罐盾拦住路线，绒绒会自动发射单体星绒。拖动猫咪能改变位置；已经越过猫咪的黑影不会被瞬移回去。', targetId: enemy.id };
}

export function getEnemyArrivalAdvice(state: CombatState, enemyId: string): Advice | null {
  const context = buildAdvisorContext(state);
  const enemy = context.visibleEnemies.find((item) => item.id === enemyId);
  return enemy ? enemyAdvice(enemy) : null;
}

const requestedCat=(prompt:string)=>/喵喵|主角|金吉拉/.test(prompt)?'hero':/绒绒|布偶|caster/.test(prompt)?'caster':/斑斑|盾猫|奶牛|guard/.test(prompt)?'guard':null;
function treatmentAdvice(state:CombatState,context: AdvisorContext, prompt = ''): Advice {
  const requestedId = requestedCat(prompt);
  if (requestedId === 'hero') return { title: '喵喵留在 B1 指挥格', text: '喵喵固定在棋盘内 B1，不使用战斗药品，也不能拖动。暖心罐罐只用于体力不足的绒绒或斑斑。', targetId: 'hero' };
  const injured = context.cats.filter((cat) => cat.combatant && cat.hp < cat.maxHp && (!requestedId || cat.id === requestedId)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (!injured && requestedId) return { title: '这位伙伴不需要治疗', text: '你指定的战斗猫目前没有缺失体力，不必消耗补给。', targetId: requestedId };
  if (!injured) return { title: '伙伴目前不需要治疗', text: '战斗猫目前都是满体力，不必消耗补给。喵喵是指挥角色，不使用战斗药品。' };
  if (context.inventory['warm-can'] <= 0) return { title: '暖心罐罐已经用完', text: `${injured.name}需要照顾，但本场背包已经没有暖心罐罐。蹦蹦冻干只补能量，不能代替治疗。先调整防线；教学保护触发后可免费重整当前波。`, targetId: injured.id };
  const error=getItemTargetError(state,'warm-can',injured.id);
  if(error)return {title:'暂时不能使用暖心罐罐',text:`${error}${context.healingCooldown>0?' 治疗类道具共用冷却；关闭背包、收起军师对话并恢复战斗，倒计时才会继续。':''}`,targetId:injured.id};
  const amount = Math.min(CONFIG.MEDICINE_HEAL, injured.maxHp - injured.hp);
  return { title: `可以照顾${injured.name}`, text: `${injured.name}目前 ${Math.ceil(injured.hp)} / ${injured.maxHp} 体力。使用暖心罐罐实际恢复 ${amount} 点，消耗 1 份库存，并触发 ${CONFIG.HEALING_ITEM_COOLDOWN} 秒治疗类共享冷却。${injured.status === 'active' ? '治疗后留在战场。' : '恢复到一半体力后，仍需你手动将它部署回合法空格。'}`, action: 'USE_ITEM', itemId: 'warm-can', targetId: injured.id };
}

function energyAdvice(state:CombatState,context:AdvisorContext,prompt=''):Advice{
  const requestedId=requestedCat(prompt);
  const target=requestedId?context.cats.find(cat=>cat.id===requestedId):context.cats.filter(cat=>cat.combatant&&cat.status==='active'&&cat.energy<CONFIG.MAX_ENERGY).sort((a,b)=>a.energyItemCooldown-b.energyItemCooldown||b.energy-a.energy)[0];
  if(!target)return {title:'伙伴暂时不需要补能',text:'蹦蹦冻干只用于场上能量不足的战斗猫；满能量不会消耗。休整中的猫先恢复体力并手动部署，再考虑补能。'};
  const error=getItemTargetError(state,'bouncy-treat',target.id);
  if(error)return {title:'暂时不能使用蹦蹦冻干',text:`${error}${target.energyItemCooldown>0?' 每只猫的补能间隔独立计算；关闭背包、收起军师对话并恢复战斗后继续倒计时。':''}`,targetId:target.id};
  const amount=Math.min(CONFIG.ENERGY_ITEM_GAIN,CONFIG.MAX_ENERGY-target.energy);
  return {title:`可以为${target.name}补能`,text:`${target.name}目前 ${target.energy} / ${CONFIG.MAX_ENERGY} 能量。蹦蹦冻干实际补充 ${amount} 点，消耗 1 份；能量最多 ${CONFIG.MAX_ENERGY}，不足 ${CONFIG.ENERGY_ITEM_GAIN} 点缺口也会消耗一整份。使用后这只猫需间隔 ${CONFIG.ENERGY_ITEM_COOLDOWN} 秒战斗时间才能再次补能，另一只猫不受这个间隔影响。它不恢复体力。`,action:'USE_ITEM',itemId:'bouncy-treat',targetId:target.id};
}

const GATE_TIPS: Partial<Record<CombatPhase, Advice>> = {
  teach_bag: { title: '第一步：打开背包', text: '先点击背包按钮。军师现在只做引导，必须亲自完成背包操作才能继续。' },
  teach_item: { title: '第二步：选择暖心罐罐', text: '背包已经打开，点击暖心罐罐。这一步只选择道具，还不会消耗库存。' },
  teach_target: { title: '第三步：照顾休整中的绒绒', text: '点击休整区里的绒绒，消耗 1 份罐罐，为它恢复 60 点体力。喵喵不使用战斗药品。', targetId: 'caster' },
  teach_deploy: { title: '第四步：把绒绒放回战场', text: `绒绒已经恢复，请将它拖到高亮格：第 ${TUTORIAL_TARGETS.deploy_caster.y + 1} 行、第 ${TUTORIAL_TARGETS.deploy_caster.x + 1} 列。治疗不会自动把猫送回战场。`, targetId: 'caster' },
  teach_move: { title: '第五步：移动罐盾卫士', text: `把斑斑拖到第 ${TUTORIAL_TARGETS.move_guard.y + 1} 行、第 ${TUTORIAL_TARGETS.move_guard.x + 1} 列的高亮格。接着练习普攻蓄能和主动技能。`, targetId: 'guard' },
  teach_energy: { title: '第六步：认识普攻蓄能', text: `开始练习后，观察两只猫攻击练习木偶。每次普攻命中积攒 ${CONFIG.ENERGY_PER_HIT} 点能量，满 100 点可手动释放一次技能。绒绒达到 70 时会暂停，学习用蹦蹦冻干补齐最后 30 点。` },
  skill_charge: { title: '观察能量条增长', text: `伙伴正在自动攻击木偶，每次普攻命中 +${CONFIG.ENERGY_PER_HIT}。练习期间站位固定且木偶不会反击；绒绒在 70 能量时学习补能。两只猫都达到 100 后，战场会暂停等待技能操作。` },
  teach_energy_item:{title:'第七步：用冻干补充能量',text:'先打开背包，选择蹦蹦冻干，再点击场上的绒绒，把能量从 70 补到 100。它只补能量、不回血；同一只猫再次补能需间隔 12 秒战斗时间。选错目标不会扣库存。',targetId:'caster'},
  teach_guard_skill: { title: '第八步：释放罐盖护盾', text: '先点斑斑，再点它身旁亮起的护盾图标；悬停图标可以查看说明。消耗 100 能量获得额外护盾，异色盾条优先抵挡伤害，不会恢复实际体力。', targetId: 'guard' },
  teach_caster_skill: { title: '第九步：选择技能落点', text: '先点绒绒，再点它身旁的星绒图标。全地图 21 格均可选为技能中心，包括 B1 和 B7，不受普攻范围限制。移动鼠标预览整个黄色十字范围，覆盖 B6 练习木偶后左键直接释放；右键或 Esc 取消。这一步教学会停住等待操作；实战点猫时为 0.5 倍、进入瞄准时为 1 倍，黑影仍会移动。取消和错误落点都不扣能量。', targetId: 'caster' },
};

export function getAdvice(state: CombatState, question: unknown = ''): Advice {
  const context = buildAdvisorContext(state);
  const prompt = typeof question === 'string' ? question.trim().slice(0, 500) : '';
  const gateTip = GATE_TIPS[context.phase];
  if(context.phase==='skill_charge'&&context.energyItemTaught)return {title:'补能完成，等待斑斑蓄满',text:'绒绒已经达到 100 能量，斑斑会继续普攻蓄能。两只猫都就绪后，再依次练习护盾和十字技能。进入正式守线时恢复本次初始道具，教学不会耗掉实战补给。'};
  if (gateTip) return {...gateTip};
  if (context.phase === 'ready') return { title: '准备进入小巷', text: '喵喵是指挥角色，不会攻击。先观察它与绒绒的遭遇，再跟着教学学习背包、治疗、补能、部署、拖动、普攻蓄能与技能释放。' };
  if (context.phase === 'hero_danger') return { title: '喵喵正在寻找掩护', text: '金吉拉喵喵不会攻击或阻挡。它会在半体力时从 B4 退到棋盘内 B1 固定指挥格，绒绒随后赶到。' };
  if (context.phase === 'caster_rescue') return { title: '绒绒正在保护指挥位', text: '观察布偶的自动星绒攻击。体力不足时它会回到安全区休整，随后学习怎样使用道具照顾伙伴。', targetId: 'caster' };
  if (context.phase === 'reform') return { title: '一起重新整理防线', text: '这是序章教学重整，不会消耗正式资源。免费恢复当前波和猫咪体力，回到推荐站位，再试一次。', action: 'REFORM' };
  if (context.phase === 'failed') return { title: '本次防线失守', text: '这是标准模式的失败结果；猫咪已经撤离。可以重新开始，从部署和阻挡容量重新规划。', action: 'RESTART' };
  if (context.phase === 'won') return { title: '守线完成', text: '你已经学会背包治疗与补能、部署和拖动，以及普攻蓄能、护盾和十字技能选区。喵喵负责指挥，伙伴们各自承担阻挡与输出。' };
  if (/难度|简单|普通|困难/.test(prompt)) {
    const setting = DIFFICULTY_CONFIG[context.difficulty];
    const protection = state.mode === 'tutorial' ? '三档的救援和强制教学相同，都保留 3 次突破后的免费重整保护。' : '当前是标准模式，3 次突破后本场结束；免费重整仅用于序章教学模式。';
    return { title: `当前是${setting.label}难度`, text: `教学后的黑影体力为基础值的 ${Math.round(setting.enemyHpMultiplier * 100)}%，攻击与速度不变。${protection}困难档要多留意斑斑体力，让绒绒保持在支援范围内。换档需要开始新的挑战，不会在当前战斗中改变。` };
  }
  if(/冻干|补能|能量道具|补充能量|能量补给/.test(prompt))return energyAdvice(state,context,prompt);
  if (/技能|能力|大招|攻击|输出|射程|范围|能量|护盾/.test(prompt)) return { title: '猫咪的实际能力', text: `喵喵不攻击、不阻挡。斑斑的普攻覆盖自身、前方与左右共四格，最多阻挡 2 只；绒绒使用朝右的 3 行 × 4 列矩形单体普攻，阻挡 1 只，超出地图的范围会裁切。普攻每次命中积攒 ${CONFIG.ENERGY_PER_HIT} 能量，满 100 后手动释放。绒绒的${SKILLS.caster.name}可在全地图 21 格选择落点，包括 B1 和 B7，不受普攻范围限制；对十字最多 5 格内每只黑影造成 ${SKILLS.caster.damage} 伤害，超出地图的部分裁切，不伤害伙伴。斑斑的${SKILLS.guard.name}仅自身获得 ${SKILLS.guard.shield} 点护盾、持续 ${SKILLS.guard.duration} 秒。技能不增加普攻能量，护盾不回血。背包中暖心罐罐治疗，蹦蹦冻干补能；补能仅用于场上的战斗猫。实战点猫时临时使用 0.5 倍速，进入瞄准时使用 1 倍速，黑影仍会移动；退出技能操作后恢复所选倍速，手动暂停优先。` };
  if (/治疗|恢复|罐罐|加血|血量|休息|休整/.test(prompt)) return treatmentAdvice(state,context, prompt);
  if(/背包|补给|道具|携带|冷却/.test(prompt))return {title:'两类补给，各有用途',text:`暖心罐罐恢复 ${CONFIG.MEDICINE_HEAL} 体力，治疗类共用 ${CONFIG.HEALING_ITEM_COOLDOWN} 秒冷却；蹦蹦冻干为场上战斗猫补充 ${CONFIG.ENERGY_ITEM_GAIN} 能量，每只猫独立间隔 ${CONFIG.ENERGY_ITEM_COOLDOWN} 秒。默认携带 2 罐罐和 1 冻干；整场携带最多 ${CONFIG.MAX_SUPPLIES} 份，其中治疗最多 ${CONFIG.MAX_HEALING_SUPPLIES}、能量最多 ${CONFIG.MAX_ENERGY_SUPPLIES}。当前剩余罐罐 ${context.inventory['warm-can']}、冻干 ${context.inventory['bouncy-treat']}。冷却按战斗时间倒计时，背包和聊天会暂停；要等待冷却，请关闭背包、收起对话并恢复战斗。`};
  if (/阵型|队形|布阵|摆阵|站位|前排|后排|拖|移动|部署|上阵/.test(prompt)) {
    const ready = context.cats.find((cat) => cat.combatant && cat.status === 'ready');
    return ready
      ? { title: `${ready.name}可以回到战场`, text: '它已达到一半体力，请手动拖到合法空格。已占格不能直接部署；战场上的两只猫可通过拖动交换位置。', targetId: ready.id }
      : { title: '前排阻挡，旁侧输出', text: '让斑斑拦住通往 B1 的路线，绒绒在射程内支援。战斗猫可拖到 3×7 区域内除 B1 和 B7 出怪口外的 19 个候选格，A7、C7 是普通可部署格；落在另一只战斗猫上会交换位置，不会重置攻击冷却或挪动敌人。B1 永久保留给喵喵。', targetId: 'guard' };
  }
  if (/黑影|敌人|怎么打/.test(prompt)) return enemyAdvice(context.visibleEnemies.find((enemy) => enemy.type === 'runner') || context.visibleEnemies[0]);
  if (/规则|保护|失败|压力|难度|阻挡/.test(prompt)) return { title: '保护棋盘内 B1 指挥格', text: '斑斑挡 2 只，绒绒挡 1 只；超出容量的敌人会继续前进。本关实际只从 B7 出怪，A7、C7 是普通可部署格。棋盘路径分别是 A7→A1→B1、B7→B1、C7→C1→B1，上下路到第一列才转向；抵达 B1 立即算一次突破。3 次突破后，教学模式暂停并免费重整当前波，标准模式判负。军师目前是离线规则顾问，不会预读敌情或替你操作。' };
  if (prompt) return { title: '军师能帮助你理解战斗', text: '当前是离线规则顾问，可以询问背包治疗与补能、自由拖动、阻挡容量、普攻范围、蓄能技能和已经出现的黑影。技能由你手动释放，军师不会替你执行操作。' };
  const ready = context.cats.find((cat) => cat.combatant && cat.status === 'ready');
  if (ready) return { title: `${ready.name}已经准备好了`, text: '请手动把它拖回空格，治疗不会自动部署。', targetId: ready.id };
  if (context.cats.some((cat) => cat.combatant && cat.hp <= cat.maxHp * 0.5)) return treatmentAdvice(state,context);
  const charged = context.cats.find(cat => cat.id !== 'hero' && cat.status === 'active' && cat.energy >= CONFIG.MAX_ENERGY);
  if (charged) return {title: `${charged.name}的技能准备好了`, text: charged.id === 'caster' ? '星绒绽放的能量已满。点绒绒以 0.5 倍慢速查看，再点身旁的技能图标进入 1 倍速瞄准，全地图 21 格均可选为技能中心，包括 B1 和 B7，不受普攻范围限制。移动鼠标预览整个黄色十字范围，左键直接释放，右键或 Esc 取消；暂时不用也可以继续保留能量。' : '罐盖护盾的能量已满。点斑斑以 0.5 倍慢速查看，再点身旁的护盾图标，可以在黑影接敌前手动增加临时护盾。护盾先承伤，但不会恢复已经损失的体力。', targetId: charged.id};
  return enemyAdvice(context.visibleEnemies[0]);
}
