import {createRouteMovement} from '../shared/pathing';
import {advanceBattle, getBattleSpeed} from '../shared/clock';
import {cellName, createBattleGeometry, footprintCells, footprintDistance, inCells, sameCell as same} from '../shared/geometry';
import {createBattleCarry, finishCarryWave, startBattleCarry, startCarryWave, tickBattleCarry, useBattleCarry} from '../carry';
import {CAT_DEFINITIONS, CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, normalizeDifficulty, ROUTES, RULES, SKILLS, TOTAL_MINIONS, WAVES} from './config';
import type {MarketAction, MarketBoss, MarketCat, MarketCatId, MarketEnemy, MarketOptions, MarketState, Position} from './types';

const EPS = 1e-8;
const {releaseBlocks, moveEnemies} = createRouteMovement<MarketCatId, MarketEnemy['route']>(ROUTES, RULES.contactGap);
const geometry = createBattleGeometry(CELLS, MAP.obstacles);
const catById = (state: MarketState, id: MarketCatId) => state.cats.find(cat => cat.id === id);
const terminal = (state: MarketState) => state.phase === 'won' || state.phase === 'lost';
export {cellName};

export function isMarketCell(position: Position): boolean {return geometry.isCell(position);}
export function isObstacle(position: Position): boolean {return geometry.isObstacle(position);}
export function isPlayableCell(position: Position): boolean {return geometry.isPlayableCell(position);}
/** The market boss is one stationary entity occupying C7; minions may cross its cell. */
export function getBossCells(boss: Pick<MarketBoss, 'x' | 'y' | 'width' | 'height'>): Position[] {return footprintCells(boss);}
export function getBossDistance(boss: MarketBoss, target: Position): number {return footprintDistance(boss, target);}
export function isDeployableCell(position: Position, state?: Pick<MarketState, 'boss'>): boolean {
  return isPlayableCell(position) && !same(position, MAP.goal)
    && (state?.boss.phase === 'defeated' || !MAP.bossCells.some(cell => same(cell, position)))
    && !MAP.spawns.some(cell => same(cell, position));
}
export function getAttackCells(cat: MarketCat): Position[] {return geometry.attackCells(cat);}
export function getSkillCells(cat: MarketCat, target?: Position | null): Position[] {
  if (cat.status !== 'active') return [];
  return geometry.skillCells(cat, SKILLS[cat.id].targeting, target);
}

export function getDeployError(state: MarketState, catId: MarketCatId, target: Position): string | null {
  const cat = catById(state, catId);
  if (!cat) return '没有这只战斗猫。';
  if (terminal(state)) return '这场战斗已经结束。';
  if (state.externallyPaused) return '请先关闭外部面板或继续冒险。';
  if (state.aim) return '请先完成或取消技能瞄准。';
  if (!isMarketCell(target)) return '这里没有可用地格。';
  if (isObstacle(target)) return '摊位和杂物占用了这个位置。';
  if (!isDeployableCell(target, state)) return '保护点、刷怪口和仍在场的首领位置不能部署。';
  if (cat.status !== 'active') return '这位伙伴已经退场，本场不能重新上阵。';
  if (state.enemies.some(enemy => inCells(enemy, [target]))) return '这格有黑影，暂时不能移动过去。';
  const occupant = state.cats.find(other => other.id !== catId && other.status === 'active' && same(other, target));
  if (occupant && state.enemies.some(enemy => inCells(enemy, [cat]))) return '原位置有黑影，不能让伙伴交换到危险格。';
  return null;
}
export function getMarketSpeed(state: MarketState): number {return getBattleSpeed(state);}
export function getMarketAdvice(state: MarketState): string {
  if (state.phase === 'ready') return '六位伙伴分守 B、C、D 三行。七处入口错峰来敌，守住 C1，并击败 C7 的守夜首领。';
  if (state.phase === 'won') return state.leaks === 0 ? '八波黑影与首领都已处理，零突破守护完成！' : '小怪与首领都已处理，可以返回主流程。';
  if (state.phase === 'lost') return '本场守护已结束，重新挑战按主流程开始新场次。';
  if (state.boss.phase === 'windup') return `首领正在蓄势「熄灯横扫」，${String.fromCharCode(65 + state.boss.targetRow!)} 行已经锁定！三秒预告结束前移开伙伴，落点不会追踪。`;
  const healer = state.cats.find(cat => cat.id === 'diandian')!;
  if (healer.status === 'active' && healer.energy >= 100 && state.cats.some(cat => cat.status === 'active' && cat.hp < cat.maxHp * .7)) return '点点能量已满，安心呼噜可治疗所有在场伙伴；退场的猫无法复活。';
  if (state.cats.some(cat => cat.status === 'active' && cat.energyBlockedRemaining > 0)) return '横扫命中的伙伴暂时停止自动蓄能，已蓄满的技能仍然可以释放。';
  if (state.boss.phase === 'defeated') return '首领原占格已可部署；首领倒下后仍要守完八波，小怪未全部处理前不会通关。';
  return '栗栗用盾与强化普攻守线，铃铃十字减速支援多路。每模拟秒自动蓄能 5 点，满 100 后主动释放；不要等体力归零再治疗。';
}
function log(state: MarketState, text: string): void {
  state.logs.push({id: ++state.sequence, time: state.elapsed, text});
  if (state.logs.length > 32) state.logs.shift();
}
function effect(state: MarketState, kind: MarketState['effects'][number]['kind'], from: Position, to: Position, cells?: Position[]): void {
  state.effects.push({id: ++state.sequence, kind, from: {...from}, to: {...to}, cells, remaining: kind === 'slam' ? 0.7 : 0.4});
}
function completePhase(state: MarketState, phase: 'won' | 'lost', reason?: string): void {
  state.phase = phase; state.aim = null; state.inspectedCatId = null; state.accumulator = 0;
  log(state, phase === 'won' ? `八波黑影已处理，固定首领被击败。${state.leaks === 0 ? '零突破守护完成！' : `本场突破 ${state.leaks} 次。`}` : reason ?? '突破达到三次，守护失败。猫咪们已经安全撤离。');
}

function hurtCat(state: MarketState, cat: MarketCat, damage: number): void {
  if (cat.status !== 'active') return;
  const absorbed = Math.min(cat.shield, damage);
  cat.shield -= absorbed;
  const actual = Math.min(cat.hp, damage - absorbed);
  cat.hp -= actual; state.stats.damageTaken += actual;
  if (cat.hp <= 0) {
    cat.hp = 0; cat.status = 'retired'; cat.energy = 0; cat.shield = 0; cat.shieldRemaining = 0; cat.energyBlockedRemaining = 0; cat.attackBuffRemaining = 0;
    if (state.inspectedCatId === cat.id) state.inspectedCatId = null;
    if (state.aim?.catId === cat.id) state.aim = null;
    log(state, `${cat.name}体力归零，已经退场，本场无法重新上阵。`);
    releaseBlocks(state);
  }
}
function checkEnemyDeaths(state: MarketState): void {
  for (const enemy of state.enemies.filter(enemy => enemy.hp <= 0)) {state.defeated++; effect(state, 'defeat', enemy, enemy);}
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
  if (state.boss.hp <= 0 && state.boss.phase !== 'defeated') {
    state.boss.hp = 0; state.boss.phase = 'defeated'; state.boss.phaseTime = 0; state.boss.targetCells = []; state.boss.targetRow = null;
    effect(state, 'defeat', state.boss, state.boss); log(state, '守夜首领被击败！继续清理剩余波次，小怪全部处理完才能通关。');
  }
}
function startWave(state: MarketState, wave: number): void {
  state.wave = wave; state.waveTime = 0; state.spawnIndex = 0; state.nextWaveIn = null;
  startCarryWave(state.carry, wave, state.cats);
  log(state, `第 ${wave} / ${WAVES.length} 波：留意上下支路与右侧三个入口。`);
}
export function createMarketBattle(options: MarketOptions = {}): MarketState {
  const difficulty = normalizeDifficulty(options.difficulty);
  const bossHp = Math.round(RULES.bossHp * DIFFICULTIES[difficulty].hpMultiplier);
  return {
    carry: createBattleCarry(options.carry, WAVES[0][0].route, ROUTES[WAVES[0][0].route][0], Object.entries(ROUTES).map(([route, path]) => ({route, anchor: path[0]}))),
    stageId: 'market_boss', difficulty, phase: 'ready', elapsed: 0, accumulator: 0,
    wave: 0, totalWaves: WAVES.length, waveTime: 0, spawnIndex: 0, nextWaveIn: null, spawned: 0, defeated: 0,
    totalEnemies: TOTAL_MINIONS, leaks: 0, maxLeaks: RULES.maxLeaks,
    boss: {id: 'market-warden', name: '守夜首领', ...MAP.boss, width: 1, height: 1, hp: bossHp, maxHp: bossHp, phase: 'idle', phaseTime: 0, cooldown: RULES.bossAttackInterval, skillCooldown: RULES.bossSweepFirst, targetCells: [], attacks: 0, slams: 0, targetRow: null, sweepCursor: 0},
    cats: Object.values(CAT_DEFINITIONS).map(def => ({...structuredClone(def), ...def.initial, hp: def.maxHp, energy: 0, cooldown: 0,
      shield: 0, shieldRemaining: 0, energyBlockedRemaining: 0, attackBuffRemaining: 0, status: 'active', attacks: 0, skillUses: 0, blockedCount: 0})),
    enemies: [],
    paused: false, externallyPaused: false, uiPaused: false, baseSpeed: 1, inspectedCatId: null, aim: null,
    logs: [{id: 0, time: 0, text: '第二章 · 夜市守护。六位伙伴就位，守住七处错峰入口，击败 C7 的守夜首领。'}], effects: [], sequence: 0, lastAction: null,
    stats: {skills: 0, dodgedSlams: 0, damageTaken: 0},
  };
}

function attackTargets(state: MarketState, cells: Position[]): (MarketEnemy | MarketState['boss'])[] {
  return [...state.enemies.filter(enemy => inCells(enemy, cells)), ...(state.boss.phase !== 'defeated' && getBossCells(state.boss).some(footprint => cells.some(cell => same(cell, footprint))) ? [state.boss] : [])]
    .sort((a, b) => a.x - b.x || (a.id === 'market-warden' ? 1 : -1));
}
function catsAttack(state: MarketState): void {
  for (const cat of state.cats) {
    if (cat.status !== 'active' || cat.cooldown > EPS) continue;
    const target = attackTargets(state, getAttackCells(cat)).find(enemy => enemy.hp > 0);
    if (!target) continue;
    const damage = cat.damage * (cat.attackBuffRemaining > EPS ? SKILLS[cat.id].attackMultiplier ?? 1 : 1);
    target.hp = Math.max(0, target.hp - damage); cat.cooldown = cat.interval; cat.attacks++;
    effect(state, 'attack', cat, target); checkEnemyDeaths(state);
  }
}
function bossTick(state: MarketState, dt: number): void {
  const boss = state.boss;
  if (boss.phase === 'defeated') return;
  boss.phaseTime += dt;
  // The interval is measured between windup starts, including the windup and recovery.
  boss.skillCooldown = Math.max(0, boss.skillCooldown - dt);
  if (boss.phase === 'windup') {
    if (boss.phaseTime + EPS < RULES.bossSweepWindup) return;
    const targets = state.cats.filter(cat => cat.status === 'active' && inCells(cat, boss.targetCells));
    for (const cat of targets) {
      hurtCat(state, cat, RULES.bossSweepDamage);
      if (cat.status === 'active') cat.energyBlockedRemaining = RULES.bossEnergyBlockDuration;
    }
    if (!targets.length) state.stats.dodgedSlams++;
    boss.slams++; effect(state, 'slam', boss, boss.targetCells[0] ?? boss, boss.targetCells);
    log(state, targets.length ? `熄灯横扫命中 ${targets.length} 位伙伴，造成 45 伤害并停止蓄能 4 秒；已满能技能仍可释放。` : '伙伴们离开危险行，成功避开熄灯横扫。');
    boss.phase = 'recovery'; boss.phaseTime = 0; return;
  }
  if (boss.phase === 'recovery') {
    if (boss.phaseTime + EPS >= RULES.bossSweepRecovery) {boss.phase = 'idle'; boss.phaseTime = 0; boss.targetCells = []; boss.targetRow = null;}
    return;
  }
  boss.cooldown = Math.max(0, boss.cooldown - dt);
  if (boss.skillCooldown <= EPS) {
    const rows = [1, 2, 3] as const;
    const counts = rows.map(row => state.cats.filter(cat => cat.status === 'active' && cat.y === row).length);
    const most = Math.max(...counts);
    const index = Array.from({length: 3}, (_, i) => (boss.sweepCursor + i) % 3).find(i => counts[i] === most)!;
    boss.targetRow = rows[index]; boss.sweepCursor = (index + 1) % 3;
    boss.targetCells = CELLS.filter(cell => cell.y === boss.targetRow && isPlayableCell(cell));
    boss.phase = 'windup'; boss.phaseTime = 0; boss.skillCooldown = RULES.bossSweepInterval;
    log(state, `守夜首领正在熄灯蓄势！${String.fromCharCode(65 + boss.targetRow)} 行已锁定，3 秒后横扫；请移开伙伴。`); return;
  }
  const nearby = state.cats.filter(cat => cat.status === 'active' && getBossDistance(boss, cat) <= RULES.bossRange)
    .sort((a, b) => getBossDistance(boss, a) - getBossDistance(boss, b) || a.id.localeCompare(b.id));
  if (boss.cooldown <= EPS && nearby.length) {
    hurtCat(state, nearby[0], RULES.bossDamage); boss.cooldown = RULES.bossAttackInterval; boss.attacks++;
    effect(state, 'boss-attack', boss, nearby[0]);
  }
}
function tick(state: MarketState, dt: number): void {
  state.elapsed += dt;
  for (const cat of state.cats) {
    cat.cooldown = Math.max(0, cat.cooldown - dt);
    const chargingTime = Math.max(0, dt - cat.energyBlockedRemaining);
    cat.energyBlockedRemaining = Math.max(0, cat.energyBlockedRemaining - dt);
    if (cat.energyBlockedRemaining < EPS) cat.energyBlockedRemaining = 0;
    if (cat.status === 'active' && chargingTime > EPS) cat.energy = Math.min(RULES.maxEnergy, cat.energy + RULES.energyPerSecond * chargingTime);
    cat.shieldRemaining = Math.max(0, cat.shieldRemaining - dt);
    if (cat.shieldRemaining < EPS) {cat.shieldRemaining = 0; cat.shield = 0;}
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
  catsAttack(state);
  for (const enemy of state.enemies) {
    const cat = enemy.blockedBy && catById(state, enemy.blockedBy);
    if (cat && cat.status === 'active' && enemy.cooldown <= EPS && (carryTick.enemySeconds.get(enemy.id) ?? dt) > EPS) {hurtCat(state, cat, enemy.damage); enemy.cooldown = enemy.interval; effect(state, 'attack', enemy, cat);}
  }
  bossTick(state, dt); releaseBlocks(state);
  for (const cat of state.cats) {
    cat.attackBuffRemaining = Math.max(0, cat.attackBuffRemaining - dt);
    if (cat.attackBuffRemaining < EPS) cat.attackBuffRemaining = 0;
  }
  for (const enemy of state.enemies) {enemy.slowRemaining = Math.max(0, enemy.slowRemaining - dt); if (enemy.slowRemaining <= EPS) {enemy.slowRemaining = 0; enemy.slowMultiplier = 1;}}
  if (state.cats.every(cat => cat.status === 'retired')) {
    completePhase(state, 'lost', '所有伙伴都已退场，本场守护结束。准备好后再来挑战。'); return;
  }
  if (state.nextWaveIn === null && state.spawnIndex === WAVES[state.wave - 1].length && state.enemies.length === 0) {
    finishCarryWave(state.carry, state.wave);
    if (state.wave < WAVES.length) state.nextWaveIn = RULES.waveGap;
    else if (state.spawned === TOTAL_MINIONS && state.boss.phase === 'defeated') completePhase(state, 'won');
  }
}
/** Receives real seconds; a single fixed-step clock applies the effective speed exactly once. */
export function advanceMarket(state: MarketState, seconds: number): MarketState {
  return advanceBattle(state, seconds, RULES, tick);
}
function actionResult(state: MarketState, ok: boolean, message: string): MarketState {state.lastAction = {ok, message}; return state;}
function castSkill(state: MarketState, cat: MarketCat, target?: Position | null): string | null {
  if (cat.status !== 'active') return '已经退场的伙伴不能释放技能。';
  if (cat.energy < 100) return '需要 100 能量才能释放技能。';
  const skill = SKILLS[cat.id];
  if (skill.targeting === 'area' && (!target || !isPlayableCell(target))) return '请在实际存在、没有杂物的格子选择技能中心。';
  const cells = getSkillCells(cat, target);
  if (skill.damage) {
    for (const enemy of attackTargets(state, cells)) {
      enemy.hp = Math.max(0, enemy.hp - skill.damage);
      if (skill.slowMultiplier && 'kind' in enemy) {enemy.slowMultiplier = skill.slowMultiplier; enemy.slowRemaining = skill.slowDuration!;}
    }
    effect(state, 'skill', cat, target ?? cat, cells); checkEnemyDeaths(state);
  }
  if (skill.shield) {cat.shield = skill.shield; cat.shieldRemaining = skill.duration!; effect(state, 'shield', cat, cat);}
  if (skill.attackMultiplier) cat.attackBuffRemaining = skill.duration!;
  if (skill.heal) for (const friend of state.cats.filter(friend => friend.status === 'active')) {friend.hp = Math.min(friend.maxHp, friend.hp + skill.heal); effect(state, 'heal', cat, friend);}
  cat.energy -= 100; cat.skillUses++; state.stats.skills++; state.aim = null; state.inspectedCatId = null;
  log(state, `${cat.name}使用「${skill.name}」。`);
  return null;
}
/** All UI actions pass through the same validation used by automated play and keyboard/touch controls. */
export function dispatchMarket(state: MarketState, action: MarketAction): MarketState {
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
    if (!problem) log(next, '镜片映出强光，普通黑影停止移动和攻击 3 秒，首领不受影响。');
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
    if (SKILLS[cat.id].targeting !== 'area') return dispatchMarket(next, {type: 'CAST_SKILL', catId: cat.id});
    if (next.paused) return actionResult(next, false, '请先继续战斗，再瞄准技能。');
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
