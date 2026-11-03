import {createRouteMovement} from '../shared/pathing';
import {advanceBattle, getBattleSpeed} from '../shared/clock';
import {cellName, createBattleGeometry, footprintCells, footprintDistance, inCells, sameCell as same} from '../shared/geometry';
import {createBattleCarry, finishCarryWave, startBattleCarry, startCarryWave, tickBattleCarry, useBattleCarry} from '../carry';
import {ALLY_DEFINITIONS, CAT_DEFINITIONS, CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, normalizeDifficulty, ROUTES, RULES, SKILLS, TOTAL_MINIONS, WAVES} from './config';
import type {FinaleAction, FinaleAlly, FinaleBoss, FinaleElite, FinaleCat, FinaleCatId, FinaleEnemy, FinaleOptions, FinaleState, Position} from './types';

const EPS = 1e-8;
const {releaseBlocks, moveEnemies} = createRouteMovement<FinaleCatId, FinaleEnemy['route']>(ROUTES, RULES.contactGap);
const geometry = createBattleGeometry(CELLS, MAP.obstacles);
const cross = geometry.cross;
const catById = (state: FinaleState, id: FinaleCatId) => state.cats.find(cat => cat.id === id);
const terminal = (state: FinaleState) => state.phase === 'won' || state.phase === 'lost';
export {cellName};

export function isFinaleCell(position: Position): boolean {return geometry.isCell(position);}
export function isObstacle(position: Position): boolean {return geometry.isObstacle(position);}
export function isPlayableCell(position: Position): boolean {return geometry.isPlayableCell(position);}
/** All combatants remain visible; night vision reveals the King's protective veil. */
export function isEnemyVisible(_state: FinaleState, _enemy: Position): boolean {return true;}
export function getEliteCells(elite: Position): Position[] {return [{x: elite.x, y: elite.y}];}
export function getBossDamageMultiplier(state: FinaleState): number {
  if (state.nightVisionRemaining > EPS || !state.elites.some(elite => elite.id === 'armor-guard' && elite.status === 'active')) return 1;
  return Math.min(1, RULES.armorMultiplier + state.lightStage * RULES.lightArmorStep);
}
/** Nine boss cells share one target and one HP pool; minions may cross the footprint. */
export function getBossCells(boss: Pick<FinaleBoss, 'x' | 'y' | 'width' | 'height'>): Position[] {return footprintCells(boss);}
export function getBossDistance(boss: FinaleBoss, target: Position): number {return footprintDistance(boss, target);}
export function isDeployableCell(position: Position): boolean {
  return isPlayableCell(position) && !same(position, MAP.goal) && !MAP.bossCells.some(cell => same(cell, position)) && !MAP.spawns.some(cell => same(cell, position))
    && !MAP.eliteCells.some(cell => same(cell, position)) && !ALLY_DEFINITIONS.some(ally => same(ally, position));
}
export function getAttackCells(cat: FinaleCat): Position[] {return geometry.attackCells(cat);}
export function getSkillCells(cat: FinaleCat, target?: Position | null): Position[] {
  if (cat.status !== 'active') return [];
  return geometry.skillCells(cat, SKILLS[cat.id].targeting, target);
}

export function getDeployError(state: FinaleState, catId: FinaleCatId, target: Position): string | null {
  const cat = catById(state, catId);
  if (!cat) return state.allies.some(ally => ally.id === String(catId)) ? '援军在固定支援位协作，不能移动。' : '没有这只战斗猫。';
  if (terminal(state)) return '这场战斗已经结束。';
  if (state.externallyPaused) return '请先关闭外部面板或继续冒险。';
  if (state.aim) return '请先完成或取消技能瞄准。';
  if (!isFinaleCell(target)) return '这里没有可用地格。';
  if (isObstacle(target)) return '钢架与仓库杂物占用了这个位置。';
  if (!isDeployableCell(target)) return '保护点、入口、首领、精英及固定援军席位不能部署。';
  if (cat.status !== 'active') return '这位伙伴已经退场，本场不能重新上阵。';
  const occupying = state.enemies.filter(enemy => inCells(enemy, [target]));
  if (occupying.length) return occupying.some(enemy => isEnemyVisible(state, enemy))
    ? '这格有黑影，暂时不能移动过去。' : '黑暗中暂时无法安全移到这格。';
  const occupant = state.cats.find(other => other.id !== catId && other.status === 'active' && same(other, target));
  if (occupant && state.enemies.some(enemy => inCells(enemy, [cat]))) return '原位置有黑影，不能让伙伴交换到危险格。';
  return null;
}
export function getFinaleSpeed(state: FinaleState): number {return getBattleSpeed(state);}
export function getFinaleAdvice(state: FinaleState): string {
  if (state.phase === 'ready') return '六猫先遣队守住 D2；永夜之王与两名精英必须全部击败。第 3、5、7 波将有固定援军接应，聚光车随防线推进。';
  if (state.phase === 'won') return '十波黑影、两名精英与永夜之王全部击退，伙伴沿光之走廊撤离！';
  if (state.phase === 'lost') return '防线失守，固定援军不能代替主力挽回终局。调整站位、治疗和躲避预警后再挑战。';
  if (state.boss.phase === 'windup') return state.boss.skill === 'sweep'
    ? '裂影横扫正在锁定一整行！3 秒后重击，优先把脆弱伙伴移出金色预警格，再补盾与治疗。'
    : '永夜之王进入第二阶段，王冠坠击锁定十字区域！预警不会跟随移动，及时让伙伴离开。';
  if (state.cats.some(cat => cat.status === 'active' && cat.hp < cat.maxHp * .5)) return '主力体力偏低，点点满能可治疗全部在场伙伴；已退场猫不能复活，援军也要保护。';
  if (state.elites.some(elite => elite.id === 'armor-guard' && elite.status === 'active')) return '影甲卫为首领投射影幕。墨墨的夜视可暂时照破影幕；击败影甲卫会永久解除，聚光车推进也能逐步削弱。';
  if (state.elites.some(elite => elite.status === 'active')) return '鸣影卫让普通黑影攻击更强，留意下侧精英；两名精英都需要处理，不能只击倒巨型首领。';
  return '援军自动协助，主力技能仍需手动。守住三条路线，看到首领预警及时挪位，维持治疗与护盾循环。';
}
function log(state: FinaleState, text: string): void {
  state.logs.push({id: ++state.sequence, time: state.elapsed, text});
  if (state.logs.length > 32) state.logs.shift();
}
function effect(state: FinaleState, kind: FinaleState['effects'][number]['kind'], from: Position, to: Position, cells?: Position[]): void {
  state.effects.push({id: ++state.sequence, kind, from: {...from}, to: {...to}, cells, remaining: kind === 'boss-skill' || kind === 'night-vision' || kind === 'arrival' ? 0.7 : 0.4});
}
function completePhase(state: FinaleState, phase: 'won' | 'lost', reason?: string): void {
  state.phase = phase; state.aim = null; state.inspectedCatId = null; state.accumulator = 0;
  state.nightVisionRemaining = 0;
  log(state, phase === 'won' ? `十波黑影已处理，巨型首领与两名精英已击败。${state.leaks === 0 ? '零突破守护完成！' : `本场突破 ${state.leaks} 次。`}` : reason ?? '突破达到三次，守护失败。猫咪们已经安全撤离。');
}

function activeFriends(state: FinaleState): (FinaleCat | FinaleAlly)[] {
  return [...state.cats.filter(cat => cat.status === 'active'), ...state.allies.filter(ally => ally.status === 'active')];
}
function hurtCat(state: FinaleState, cat: FinaleCat | FinaleAlly, damage: number): void {
  if (cat.status !== 'active') return;
  const absorbed = Math.min(cat.shield, damage); cat.shield -= absorbed;
  const actual = Math.min(cat.hp, damage - absorbed); cat.hp -= actual; state.stats.damageTaken += actual;
  if (cat.hp <= 0) {
    cat.hp = 0; cat.status = 'retired'; cat.shield = 0; cat.shieldRemaining = 0;
    if ('energy' in cat) {
      cat.energy = 0; cat.attackBuffRemaining = 0;
      if (state.inspectedCatId === cat.id) state.inspectedCatId = null;
      if (state.aim?.catId === cat.id) state.aim = null;
    }
    log(state, cat.name + '体力归零，安全退场，本场无法重新上阵。'); releaseBlocks(state);
  }
}
function hurtEnemy(state: FinaleState, target: FinaleEnemy | FinaleBoss | FinaleElite, damage: number): void {
  target.hp = Math.max(0, target.hp - damage * (target.id === state.boss.id ? getBossDamageMultiplier(state) : 1));
}
function checkEnemyDeaths(state: FinaleState): void {
  for (const enemy of state.enemies.filter(enemy => enemy.hp <= 0)) {state.defeated++; effect(state, 'defeat', enemy, enemy);}
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
  for (const elite of state.elites) if (elite.hp <= 0 && elite.status !== 'defeated') {
    elite.hp = 0; elite.status = 'defeated'; effect(state, 'defeat', elite, elite);
    log(state, elite.name + (elite.id === 'armor-guard' ? '已被击败，首领影幕永久解除！' : '已被击败，小怪的鼓号强化消散！'));
  }
  if (state.boss.hp <= 0 && state.boss.phase !== 'defeated') {
    state.boss.hp = 0; state.boss.phase = 'defeated'; state.boss.phaseTime = 0; state.boss.targetCells = [];
    effect(state, 'defeat', state.boss, state.boss); log(state, '永夜之王被击败！继续处理精英与剩余波次，全部完成才能护送伙伴撤离。');
  }
}
function startWave(state: FinaleState, wave: number): void {
  state.wave = wave; state.waveTime = 0; state.spawnIndex = 0; state.nextWaveIn = null;
  startCarryWave(state.carry, wave, state.cats);
  const lightStage = (wave >= 7 ? 3 : wave >= 5 ? 2 : wave >= 3 ? 1 : 0) as FinaleState['lightStage'];
  if (lightStage > state.lightStage) {
    state.lightStage = lightStage; effect(state, 'light', MAP.goal, MAP.lightWaypoints[lightStage]);
    log(state, '聚光小车推进到第 ' + lightStage + ' 段，更多伙伴沿光之走廊接应。');
  }
  for (const ally of state.allies) if (ally.status === 'waiting' && wave >= ally.arriveWave) {
    ally.status = 'active'; ally.arrivals++; ally.cooldown = ally.interval;
    effect(state, 'arrival', ally, ally); log(state, ally.name + '赶来支援，固定守在 ' + cellName(ally) + '！');
  }
  log(state, '第 ' + wave + ' / ' + WAVES.length + ' 波：留意 A11、D12、G11 三条通路。');
}
export function createFinaleBattle(options: FinaleOptions = {}): FinaleState {
  const difficulty = normalizeDifficulty(options.difficulty);
  const bossHp = Math.round(RULES.bossHp * DIFFICULTIES[difficulty].hpMultiplier);
  return {
    carry: createBattleCarry(options.carry, WAVES[0][0].route, ROUTES[WAVES[0][0].route][0], Object.entries(ROUTES).map(([route, path]) => ({route, anchor: path[0]}))),
    stageId: 'finale_boss', difficulty, phase: 'ready', elapsed: 0, accumulator: 0,
    wave: 0, totalWaves: WAVES.length, waveTime: 0, spawnIndex: 0, nextWaveIn: null, spawned: 0, defeated: 0,
    totalEnemies: TOTAL_MINIONS, leaks: 0, maxLeaks: RULES.maxLeaks,
    boss: {id: 'eternal-shadow', name: '永夜之王', ...MAP.boss, width: 3, height: 3, tierPhase: 1, skill: 'sweep', hp: bossHp, maxHp: bossHp, phase: 'idle', phaseTime: 0, cooldown: RULES.bossAttackInterval, skillCooldown: RULES.bossSkillFirst, targetCells: [], attacks: 0, slams: 0},
    cats: Object.values(CAT_DEFINITIONS).map(def => ({...structuredClone(def), ...def.initial, hp: def.maxHp, energy: 0, cooldown: 0,
      shield: 0, shieldRemaining: 0, attackBuffRemaining: 0, status: 'active', attacks: 0, skillUses: 0, blockedCount: 0})),
    enemies: [], nightVisionRemaining: 0, lightStage: 0,
    elites: MAP.eliteCells.map((position, index) => ({...position, id: index === 0 ? 'armor-guard' : 'horn-guard', name: index === 0 ? '影甲卫' : '鸣影卫',
      hp: Math.round(RULES.eliteHp * DIFFICULTIES[difficulty].hpMultiplier), maxHp: Math.round(RULES.eliteHp * DIFFICULTIES[difficulty].hpMultiplier),
      damage: RULES.eliteDamage, interval: RULES.eliteAttackInterval, range: RULES.eliteRange, cooldown: RULES.eliteAttackInterval, attacks: 0, status: 'active'})),
    allies: ALLY_DEFINITIONS.map(def => ({...structuredClone(def), hp: def.maxHp, shield: 0, shieldRemaining: 0, cooldown: def.interval, status: 'waiting', attacks: 0, arrivals: 0})),
    paused: false, externallyPaused: false, uiPaused: false, baseSpeed: 1, inspectedCatId: null, aim: null,
    logs: [{id: 0, time: 0, text: '终章 · 点亮流浪猫王国。六猫先遣队保护喵喵，十波攻势中将有三位固定援军加入；击败永夜之王与两名精英，打通光之走廊。'}], effects: [], sequence: 0, lastAction: null,
    stats: {skills: 0, damageTaken: 0, dodgedSlams: 0},
  };
}

function attackTargets(state: FinaleState, cells: Position[]): (FinaleEnemy | FinaleBoss | FinaleElite)[] {
  return [...state.enemies.filter(enemy => inCells(enemy, cells)), ...state.elites.filter(elite => elite.status === 'active' && inCells(elite, cells)),
    ...(state.boss.phase !== 'defeated' && getBossCells(state.boss).some(part => cells.some(cell => same(cell, part))) ? [state.boss] : [])]
    .sort((a, b) => a.x - b.x || (a.id === state.boss.id ? 1 : b.id === state.boss.id ? -1 : a.id.localeCompare(b.id)));
}
function catsAttack(state: FinaleState): void {
  for (const cat of state.cats) {
    if (cat.status !== 'active' || cat.cooldown > EPS) continue;
    const target = attackTargets(state, getAttackCells(cat)).find(enemy => enemy.hp > 0); if (!target) continue;
    const damage = cat.damage * (cat.attackBuffRemaining > EPS ? SKILLS[cat.id].attackMultiplier ?? 1 : 1);
    hurtEnemy(state, target, damage); cat.cooldown = cat.interval; cat.attacks++;
    effect(state, 'attack', cat, target); checkEnemyDeaths(state);
  }
}
function alliesTick(state: FinaleState, dt: number): void {
  for (const ally of state.allies) {
    if (ally.status !== 'active') continue;
    ally.cooldown = Math.max(0, ally.cooldown - dt);
    if (ally.cooldown > EPS) continue;
    if (ally.energyPulse) {
      for (const cat of state.cats) if (cat.status === 'active') cat.energy = Math.min(RULES.maxEnergy, cat.energy + ally.energyPulse);
      effect(state, 'inspire', ally, ally); ally.cooldown = ally.interval; ally.attacks++; continue;
    }
    const cells = CELLS.filter(cell => Math.abs(cell.x - ally.x) + Math.abs(cell.y - ally.y) <= ally.range);
    const target = attackTargets(state, cells).find(enemy => enemy.hp > 0); if (!target) continue;
    hurtEnemy(state, target, ally.damage);
    if ('kind' in target && ally.slowMultiplier) {target.slowMultiplier = Math.min(target.slowMultiplier, ally.slowMultiplier); target.slowRemaining = Math.max(target.slowRemaining, ally.slowDuration!);}
    effect(state, 'ally-attack', ally, target); ally.cooldown = ally.interval; ally.attacks++; checkEnemyDeaths(state);
  }
}
function elitesTick(state: FinaleState, dt: number): void {
  for (const elite of state.elites) {
    if (elite.status !== 'active') continue;
    elite.cooldown = Math.max(0, elite.cooldown - dt); if (elite.cooldown > EPS) continue;
    const targets = activeFriends(state).filter(cat => Math.abs(cat.x - elite.x) + Math.abs(cat.y - elite.y) <= elite.range)
      .sort((a,b) => Math.abs(a.x-elite.x)+Math.abs(a.y-elite.y)-Math.abs(b.x-elite.x)-Math.abs(b.y-elite.y) || a.id.localeCompare(b.id));
    if (targets[0]) {hurtCat(state, targets[0], elite.damage); effect(state, 'elite-attack', elite, targets[0]); elite.cooldown = elite.interval; elite.attacks++;}
  }
}
function bossTick(state: FinaleState, dt: number): void {
  const boss = state.boss; if (boss.phase === 'defeated') return;
  if (boss.tierPhase === 1 && boss.hp <= boss.maxHp * .5) {boss.tierPhase = 2; log(state, '永夜之王的王冠崩裂，进入第二阶段！后续预警将锁定十字坠击。');}
  boss.phaseTime += dt; boss.skillCooldown = Math.max(0, boss.skillCooldown - dt);
  if (boss.phase === 'windup') {
    if (boss.phaseTime + EPS < RULES.bossSkillWindup) return;
    const victims = activeFriends(state).filter(cat => inCells(cat, boss.targetCells));
    const damage = boss.skill === 'sweep' ? RULES.bossSweepDamage : RULES.bossCrownDamage;
    for (const cat of victims) hurtCat(state, cat, damage);
    if (!victims.length) state.stats.dodgedSlams++;
    boss.slams++; effect(state, 'boss-skill', boss, MAP.goal, boss.targetCells);
    log(state, (boss.skill === 'sweep' ? '裂影横扫' : '王冠坠击') + '落下，及时离开预警区域的伙伴避开了伤害。');
    boss.targetCells = []; boss.phase = 'recovery'; boss.phaseTime = 0; return;
  }
  if (boss.phase === 'recovery') {if (boss.phaseTime + EPS >= RULES.bossSkillRecovery) {boss.phase = 'idle'; boss.phaseTime = 0;} return;}
  boss.cooldown = Math.max(0, boss.cooldown - dt);
  const active = activeFriends(state).sort((a,b) => getBossDistance(boss,a)-getBossDistance(boss,b) || a.id.localeCompare(b.id));
  if (boss.skillCooldown <= EPS && state.cats.some(cat => cat.status === 'active')) {
    boss.skill = boss.tierPhase === 1 ? 'sweep' : 'crown';
    if (boss.skill === 'sweep') {
      const row = Array.from({length: MAP.rows}, (_, y) => ({y, count: active.filter(cat => cat.y === y).length})).sort((a,b) => b.count-a.count || Math.abs(a.y-MAP.goal.y)-Math.abs(b.y-MAP.goal.y) || a.y-b.y)[0].y;
      boss.targetCells = CELLS.filter(cell => cell.y === row);
    } else {
      const locked = state.cats.filter(cat => cat.status === 'active').sort((a,b) => getBossDistance(boss,a)-getBossDistance(boss,b) || a.id.localeCompare(b.id)).slice(0,2);
      boss.targetCells = [...new Map(locked.flatMap(cat => cross(cat)).map(cell => [cellName(cell),cell])).values()];
    }
    boss.phase = 'windup'; boss.phaseTime = 0; boss.skillCooldown = RULES.bossSkillInterval;
    log(state, (boss.skill === 'sweep' ? '裂影横扫锁定整行' : '王冠坠击锁定十字') + '，3 秒后落下！移动伙伴避开预警，或用护盾保护。'); return;
  }
  const target = active.find(cat => getBossDistance(boss, cat) <= RULES.bossRange);
  if (boss.cooldown <= EPS && target) {hurtCat(state, target, RULES.bossDamage); boss.cooldown = RULES.bossAttackInterval; boss.attacks++; effect(state, 'boss-attack', boss, target);}
}
function tick(state: FinaleState, dt: number): void {
  state.elapsed += dt;
  state.nightVisionRemaining = Math.max(0, state.nightVisionRemaining - dt);
  if (state.nightVisionRemaining < EPS) state.nightVisionRemaining = 0;
  for (const cat of state.cats) {
    cat.cooldown = Math.max(0, cat.cooldown - dt);
    if (cat.status === 'active') cat.energy = Math.min(RULES.maxEnergy, cat.energy + RULES.energyPerSecond * dt);
    cat.shieldRemaining = Math.max(0, cat.shieldRemaining - dt);
    if (cat.shieldRemaining < EPS) {cat.shieldRemaining = 0; cat.shield = 0;}
  }
  for (const ally of state.allies) {
    if (ally.status !== 'active') continue;
    ally.shieldRemaining = Math.max(0, ally.shieldRemaining - dt);
    if (ally.shieldRemaining < EPS) {ally.shieldRemaining = 0; ally.shield = 0;}
  }
  state.effects = state.effects.filter(effect => (effect.remaining -= dt) > 0);
  if (state.nextWaveIn !== null) {state.nextWaveIn -= dt; if (state.nextWaveIn <= EPS) startWave(state, state.wave + 1);}
  if (state.nextWaveIn === null) {
    state.waveTime += dt;
    const wave = WAVES[state.wave - 1];
    while (state.spawnIndex < wave.length && wave[state.spawnIndex].at <= state.waveTime + EPS) {
      const entry = wave[state.spawnIndex++], def = ENEMY_DEFINITIONS[entry.kind];
      const maxHp = Math.round(def.maxHp * DIFFICULTIES[state.difficulty].hpMultiplier);
      state.enemies.push({...def, ...ROUTES[entry.route][0], maxHp, hp: maxHp, kind: entry.kind, id: `minion-${++state.sequence}`,
        route: entry.route, pathIndex: 1, slowRemaining: 0, slowMultiplier: 1, cooldown: 0, blockedBy: null}); state.spawned++;
    }
  }
  const carryTick = tickBattleCarry(state.carry, dt, state.wave, state.enemies);
  for (const hit of carryTick.hits) effect(state, 'skill', state.carry.anchor, hit.position);
  if (carryTick.hits.length) checkEnemyDeaths(state);
  for (const enemy of state.enemies) enemy.cooldown = Math.max(0, enemy.cooldown - (carryTick.enemySeconds.get(enemy.id) ?? dt));
  moveEnemies(state, dt, carryTick.enemySeconds);
  const escaped = state.enemies.filter(enemy => enemy.pathIndex >= ROUTES[enemy.route].length);
  if (escaped.length) {
    state.leaks += escaped.length; state.enemies = state.enemies.filter(enemy => !escaped.includes(enemy));
    log(state, `${escaped.length} 名黑影突破保护点（${state.leaks} / ${state.maxLeaks}）。`);
    if (state.leaks >= state.maxLeaks) {completePhase(state, 'lost'); return;}
  }
  catsAttack(state); alliesTick(state, dt);
  for (const enemy of state.enemies) {
    const cat = enemy.blockedBy && catById(state, enemy.blockedBy);
    if (cat && cat.status === 'active' && enemy.cooldown <= EPS && (carryTick.enemySeconds.get(enemy.id) ?? dt) > EPS) {hurtCat(state, cat, enemy.damage * (state.elites.some(elite => elite.id === 'horn-guard' && elite.status === 'active') ? RULES.hornDamageMultiplier : 1)); enemy.cooldown = enemy.interval; effect(state, 'attack', enemy, cat);}
  }
  elitesTick(state, dt); bossTick(state, dt); releaseBlocks(state);
  for (const cat of state.cats) {
    cat.attackBuffRemaining = Math.max(0, cat.attackBuffRemaining - dt);
    if (cat.attackBuffRemaining < EPS) cat.attackBuffRemaining = 0;
  }
  for (const enemy of state.enemies) {enemy.slowRemaining = Math.max(0, enemy.slowRemaining - dt); if (enemy.slowRemaining <= EPS) {enemy.slowRemaining = 0; enemy.slowMultiplier = 1;}}
  if (state.cats.every(cat => cat.status === 'retired')) {
    completePhase(state, 'lost', '六位主力全部退场，本场守护结束；固定援军不能代替主力继续推进。'); return;
  }
  if (state.nextWaveIn === null && state.spawnIndex === WAVES[state.wave - 1].length && state.enemies.length === 0) {
    finishCarryWave(state.carry, state.wave);
    if (state.wave < WAVES.length) state.nextWaveIn = RULES.waveGap;
    else if (state.spawned === TOTAL_MINIONS && state.boss.phase === 'defeated' && state.elites.every(elite => elite.status === 'defeated')) completePhase(state, 'won');
  }
}
/** Receives real seconds; a single fixed-step clock applies the effective speed exactly once. */
export function advanceFinale(state: FinaleState, seconds: number): FinaleState {
  return advanceBattle(state, seconds, RULES, tick);
}
function actionResult(state: FinaleState, ok: boolean, message: string): FinaleState {state.lastAction = {ok, message}; return state;}
function castSkill(state: FinaleState, cat: FinaleCat, target?: Position | null): string | null {
  if (cat.status !== 'active') return '已经退场的伙伴不能释放技能。';
  if (cat.energy < 100) return '需要 100 能量才能释放技能。';
  const skill = SKILLS[cat.id];
  if (skill.targeting === 'area' && (!target || !isPlayableCell(target))) return '请在实际存在、没有杂物的格子选择技能中心。';
  const cells = getSkillCells(cat, target);
  if (skill.damage) {
    for (const enemy of attackTargets(state, cells)) {
      hurtEnemy(state, enemy, skill.damage);
      if (skill.slowMultiplier && 'kind' in enemy) {enemy.slowMultiplier = skill.slowMultiplier; enemy.slowRemaining = skill.slowDuration!;}
    }
    effect(state, 'skill', cat, target ?? cat, cells); checkEnemyDeaths(state);
  }
  if (skill.shield) {
    if (skill.targeting === 'team') {
      for (const friend of activeFriends(state)) {
        friend.shield = Math.max(friend.shield, skill.shield); friend.shieldRemaining = Math.max(friend.shieldRemaining, skill.duration!);
        effect(state, 'shield', cat, friend);
      }
    } else {
      cat.shield = Math.max(cat.shield, skill.shield);
      cat.shieldRemaining = Math.max(cat.shieldRemaining, skill.duration!);
      effect(state, 'shield', cat, cat);
    }
  }
  if (skill.heal) for (const friend of activeFriends(state)) {
    friend.hp = Math.min(friend.maxHp, friend.hp + skill.heal);
    effect(state, 'heal', cat, friend);
  }
  if (skill.nightVision) {
    state.nightVisionRemaining = Math.max(state.nightVisionRemaining, skill.nightVision);
    effect(state, 'night-vision', cat, cat);
  }
  if (skill.attackMultiplier) cat.attackBuffRemaining = skill.duration!;
  cat.energy -= 100; cat.skillUses++; state.stats.skills++; state.aim = null; state.inspectedCatId = null;
  log(state, `${cat.name}使用「${skill.name}」。`);
  return null;
}
/** All UI actions pass through the same validation used by automated play and keyboard/touch controls. */
export function dispatchFinale(state: FinaleState, action: FinaleAction): FinaleState {
  const next = structuredClone(state);
  next.lastAction = null;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return actionResult(next, false, '无法识别的操作。');
  if (action.type === 'SET_EXTERNAL_PAUSE' || action.type === 'SET_UI_PAUSE') {
    if (typeof action.paused !== 'boolean') return actionResult(next, false, '暂停参数无效。');
    if (action.type === 'SET_EXTERNAL_PAUSE') {
      next.externallyPaused = action.paused;
      if (action.paused) {next.aim = null; next.inspectedCatId = null;}
    } else next.uiPaused = action.paused;
    return next;
  }
  if (action.type === 'PAUSE') {
    if (action.paused !== undefined && typeof action.paused !== 'boolean') return actionResult(next, false, '暂停参数无效。');
    next.paused = action.paused ?? !next.paused; return next;
  }
  if (action.type === 'SET_SPEED') {
    if (![0.5, 1, 2].includes(action.speed)) return actionResult(next, false, '速度参数无效。');
    next.baseSpeed = action.speed; return next;
  }
  if (action.type === 'CANCEL_SKILL') {next.aim = null; next.inspectedCatId = null; return next;}
  if (action.type === 'CLOSE_INSPECTION') {next.inspectedCatId = null; return next;}
  if (next.externallyPaused) return actionResult(next, false, '宿主已暂停这场战斗。');
  if (terminal(next)) return actionResult(next, false, '这场战斗已经结束。');
  if (action.type === 'RETREAT') {
    if (next.phase !== 'battle') return actionResult(next, false, '守护尚未开始。');
    completePhase(next, 'lost', '队伍主动撤离本场，按失败返回主流程。');
    return actionResult(next, true, '伙伴们已安全撤离。');
  }
  if (action.type === 'START') {
    if (next.phase !== 'ready') return actionResult(next, false, '这场守护已经开始。');
    next.phase = 'battle'; startBattleCarry(next.carry, next.cats); startWave(next, 1); return actionResult(next, true, '守护开始！');
  }
  if (action.type === 'USE_CARRY') {
    if (next.phase !== 'battle' || next.paused || next.uiPaused) return actionResult(next, false, '准备、暂停或结束期间不能使用镜片。');
    const problem = useBattleCarry(next.carry);
    if (!problem) log(next, '镜片映出强光，普通黑影停止移动和攻击 3 秒，首领与精英不受影响。');
    return actionResult(next, !problem, problem ?? '镜片已使用。');
  }
  if (action.type === 'MOVE_CAT') {
    const problem = getDeployError(next, action.catId, action); if (problem) return actionResult(next, false, problem);
    const cat = catById(next, action.catId)!;
    const occupant = next.cats.find(friend => friend.id !== cat.id && friend.status === 'active' && same(friend, action));
    if (!same(cat, action)) for (const enemy of next.enemies) {
      if (enemy.blockedBy === cat.id || enemy.blockedBy === occupant?.id) enemy.blockedBy = null;
    }
    if (occupant) {occupant.x = cat.x; occupant.y = cat.y;}
    cat.x = action.x; cat.y = action.y; cat.status = 'active'; releaseBlocks(next); next.inspectedCatId = null;
    return actionResult(next, true, occupant ? '伙伴交换位置，体力、能量和冷却保留。' : `${cat.name}移动到 ${cellName(cat)}。`);
  }
  if (action.type === 'INSPECT') {
    const cat = catById(next, action.catId); if (!cat || cat.status !== 'active') return actionResult(next, false, '请选择场上的伙伴。');
    next.aim = null; next.inspectedCatId = action.catId; return next;
  }
  if (action.type === 'SELECT_SKILL') {
    const cat = catById(next, action.catId);
    if (next.phase !== 'battle' || !cat || cat.status !== 'active' || cat.energy < 100) return actionResult(next, false, '伙伴需要在战斗中蓄满能量。');
    if (SKILLS[cat.id].targeting !== 'area') return dispatchFinale(next, {type: 'CAST_SKILL', catId: cat.id});
    if (next.paused || next.uiPaused) return actionResult(next, false, '请先继续战斗，再瞄准技能。');
    next.aim = {catId: cat.id, target: null}; next.inspectedCatId = null; return next;
  }
  if (action.type === 'AIM_SKILL') {
    if (!next.aim) return actionResult(next, false, '尚未选择区域技能。');
    next.aim.target = isPlayableCell(action) ? {x: action.x, y: action.y} : null; return next;
  }
  if (action.type === 'CAST_SKILL') {
    if (next.phase !== 'battle' || next.paused || next.uiPaused) return actionResult(next, false, '暂停或准备期间不能释放技能。');
    const cat = catById(next, action.catId); if (!cat) return actionResult(next, false, '没有这只战斗猫。');
    if (next.aim && next.aim.catId !== cat.id) return actionResult(next, false, '请先完成或取消当前瞄准。');
    const target = action.target ?? (next.aim?.catId === cat.id ? next.aim.target : null);
    const problem = castSkill(next, cat, target);
    return actionResult(next, !problem, problem ?? '技能已释放。');
  }
  return actionResult(next, false, '无法识别的操作。');
}
