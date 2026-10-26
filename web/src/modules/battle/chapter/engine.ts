import {createBattleCarry, finishCarryWave, getCarrySpeedMultiplier, startBattleCarry, tickBattleCarry, useBattleCarry} from '../carry';
import {CAT_DEFINITIONS, CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, normalizeDifficulty, RULES, SKILLS, TOTAL_MINIONS, WAVES} from './config';
import type {ChapterAction, ChapterBoss, ChapterCat, ChapterCatId, ChapterEnemy, ChapterOptions, ChapterState, Position} from './types';

const EPS = 1e-8;
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
const positionOf = (entity: Position): Position => ({x: Math.round(entity.x), y: Math.round(entity.y)});
const cross = (origin: Position): Position[] => [{x: 0, y: 0}, {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}]
  .map(offset => ({x: origin.x + offset.x, y: origin.y + offset.y})).filter(isPlayableCell);
const inCells = (entity: Position, cells: readonly Position[]) => cells.some(cell => same(cell, positionOf(entity)));
const catById = (state: ChapterState, id: ChapterCatId) => state.cats.find(cat => cat.id === id);
const terminal = (state: ChapterState) => state.phase === 'won' || state.phase === 'lost';
export const cellName = ({x, y}: Position) => `${String.fromCharCode(65 + y)}${x + 1}`;

export function isChapterCell(position: Position): boolean {
  return Number.isInteger(position.x) && Number.isInteger(position.y) && CELLS.some(cell => same(cell, position));
}
export function isObstacle(position: Position): boolean {return MAP.obstacles.some(cell => same(cell, position));}
export function isPlayableCell(position: Position): boolean {return isChapterCell(position) && !isObstacle(position);}
/** A boss is one combat entity with four targetable, non-deployable cells. */
export function getBossCells(boss: Pick<ChapterBoss, 'x' | 'y' | 'width' | 'height'>): Position[] {
  return Array.from({length: boss.width * boss.height}, (_, index) => ({x: boss.x + index % boss.width, y: boss.y + Math.floor(index / boss.width)}));
}
export function getBossDistance(boss: ChapterBoss, target: Position): number {
  return Math.min(...getBossCells(boss).map(cell => Math.abs(cell.x - target.x) + Math.abs(cell.y - target.y)));
}
export function isDeployableCell(position: Position): boolean {
  return isPlayableCell(position) && !same(position, MAP.goal) && !MAP.bossCells.some(cell => same(cell, position)) && !MAP.spawns.some(cell => same(cell, position));
}
export function getAttackCells(cat: ChapterCat): Position[] {
  if (cat.status !== 'active') return [];
  const offsets = cat.range === 'melee' ? [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1}]
    : Array.from({length: (cat.range === 'claws' ? 3 : 4) * 3}, (_, i) => ({x: Math.floor(i / 3), y: i % 3 - 1}));
  return offsets.map(offset => ({x: cat.x + offset.x, y: cat.y + offset.y})).filter(isPlayableCell);
}
export function getSkillCells(cat: ChapterCat, target?: Position | null): Position[] {
  if (cat.status !== 'active') return [];
  switch (SKILLS[cat.id].targeting) {
    case 'area': return target && isPlayableCell(target) ? cross(target) : [];
    case 'forward': return Array.from({length: 9}, (_, i) => ({x: cat.x + Math.floor(i / 3), y: cat.y + i % 3 - 1})).filter(isPlayableCell);
    case 'team': return CELLS.filter(isPlayableCell);
    default: return [{x: cat.x, y: cat.y}];
  }
}

export function getDeployError(state: ChapterState, catId: ChapterCatId, target: Position): string | null {
  const cat = catById(state, catId);
  if (!cat) return '没有这只战斗猫。';
  if (terminal(state)) return '这场战斗已经结束。';
  if (state.externallyPaused) return '请先关闭外部面板或继续冒险。';
  if (state.aim) return '请先完成或取消技能瞄准。';
  if (!isChapterCell(target)) return '这里没有可用地格。';
  if (isObstacle(target)) return '垃圾桶和杂物占用了这个位置。';
  if (!isDeployableCell(target)) return '保护点、刷怪口和首领位置不能部署。';
  if (cat.status !== 'active') return '这位伙伴已经退场，本场不能重新上阵。';
  if (state.enemies.some(enemy => inCells(enemy, [target]))) return '这格有黑影，暂时不能移动过去。';
  const occupant = state.cats.find(other => other.id !== catId && other.status === 'active' && same(other, target));
  if (occupant && cat.status !== 'active') return '这格已有伙伴，请选择空格。';
  if (occupant && state.enemies.some(enemy => inCells(enemy, [cat]))) return '原位置有黑影，不能让伙伴交换到危险格。';
  return null;
}
export function getChapterSpeed(state: ChapterState): number {
  if (state.phase !== 'battle' || state.paused || state.externallyPaused || state.uiPaused) return 0;
  if (state.aim) return 1;
  if (state.inspectedCatId) return 0.5;
  return state.baseSpeed;
}
export function getChapterAdvice(state: ChapterState): string {
  if (state.phase === 'ready') return '四位伙伴已就位。绒绒照看 A4 支巷，斑斑与团子守住右侧两路；点点蓄满能量后可治疗仍在场的队友。';
  if (state.phase === 'won') return state.leaks === 0 ? '零突破守护成功！八波敌人已处理，首领也被击败。' : '小怪已处理，首领已被击败，可以返回主流程。';
  if (state.phase === 'lost') return '本场守护已结束，重新挑战走主项目准备流程。';
  if (state.boss.phase === 'windup') return '首领正双手举起路障、向后蓄势！把裂纹格中的伙伴移开；落点已经锁定，不会追着猫走。';
  const healer = state.cats.find(cat => cat.id === 'diandian')!;
  if (healer.status === 'active' && healer.energy >= 100 && state.cats.some(cat => cat.status === 'active' && cat.hp < cat.maxHp * 0.75)) return '点点已经蓄满能量，可以用安心呼噜治疗仍在场的队友；不要等到体力归零才治疗。';
  const retired = state.cats.filter(cat => cat.status === 'retired');
  if (retired.length) return `${retired.map(cat => cat.name).join('、')}已退场，本场不能复活。调整剩余伙伴的位置，守住三路汇合处。`;
  if (state.boss.phase === 'defeated') return '首领已经倒下，还要守住余下的小怪波次。不要过早收起防线。';
  return '绒绒守支巷，斑斑挡上路，团子守下路，点点提供治疗。每模拟秒自动积攒 5 能量，满 100 后手动释放技能。';
}
function log(state: ChapterState, text: string): void {
  state.logs.push({id: ++state.sequence, time: state.elapsed, text});
  if (state.logs.length > 32) state.logs.shift();
}
function effect(state: ChapterState, kind: ChapterState['effects'][number]['kind'], from: Position, to: Position, cells?: Position[]): void {
  state.effects.push({id: ++state.sequence, kind, from: {...from}, to: {...to}, cells, remaining: kind === 'slam' ? 0.7 : 0.4});
}
function completePhase(state: ChapterState, phase: 'won' | 'lost', reason?: string): void {
  state.phase = phase; state.aim = null; state.inspectedCatId = null; state.accumulator = 0;
  log(state, phase === 'won' ? `八波黑影已处理，固定首领被击败。${state.leaks === 0 ? '零突破守护完成！' : `本场突破 ${state.leaks} 次。`}` : reason ?? '突破达到三次，守护失败。猫咪们已经安全撤离。');
}
function releaseBlocks(state: ChapterState): void {
  const counts = new Map<ChapterCatId, number>();
  for (const enemy of state.enemies) {
    const cat = enemy.blockedBy && catById(state, enemy.blockedBy);
    // Validate the contact on its actual route segment. Distance alone would retain
    // an enemy after its blocker moves across it or around the D4 corner.
    const touching = cat && (enemy.route === 'branch' && enemy.y < 3 - EPS
      ? cat.x === enemy.x && cat.y >= enemy.y - EPS && cat.y - enemy.y <= 0.42 + EPS
      : Math.abs(cat.y - enemy.y) < EPS && cat.x <= enemy.x + EPS && enemy.x - cat.x <= 0.42 + EPS);
    if (!cat || cat.status !== 'active' || enemy.hp <= 0 || !touching || (counts.get(cat.id) ?? 0) >= cat.block) enemy.blockedBy = null;
    else counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
  }
  for (const cat of state.cats) cat.blockedCount = counts.get(cat.id) ?? 0;
}
function hurtCat(state: ChapterState, cat: ChapterCat, damage: number): void {
  if (cat.status !== 'active') return;
  const absorbed = Math.min(cat.shield, damage);
  cat.shield -= absorbed;
  const actual = Math.min(cat.hp, damage - absorbed);
  cat.hp -= actual; state.stats.damageTaken += actual;
  if (cat.hp <= 0) {
    cat.hp = 0; cat.status = 'retired'; cat.energy = 0; cat.shield = 0; cat.shieldRemaining = 0;
    if (state.inspectedCatId === cat.id) state.inspectedCatId = null;
    if (state.aim?.catId === cat.id) state.aim = null;
    log(state, `${cat.name}体力归零，已经退场，本场无法重新上阵。`);
    releaseBlocks(state);
  }
}
function checkEnemyDeaths(state: ChapterState): void {
  for (const enemy of state.enemies.filter(enemy => enemy.hp <= 0)) {state.defeated++; effect(state, 'defeat', enemy, enemy);}
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
  if (state.boss.hp <= 0 && state.boss.phase !== 'defeated') {
    state.boss.hp = 0; state.boss.phase = 'defeated'; state.boss.phaseTime = 0; state.boss.targetCells = [];
    effect(state, 'defeat', state.boss, state.boss); log(state, '路障首领被击败！继续清理剩余波次，小怪全部处理完才能通关。');
  }
}
function startWave(state: ChapterState, wave: number): void {
  state.wave = wave; state.waveTime = 0; state.spawnIndex = 0; state.nextWaveIn = null;
  log(state, `第 ${wave} / ${WAVES.length} 波：留意 A4 支巷与右侧上下两处巷口。`);
}
export function createChapterBattle(options: ChapterOptions = {}): ChapterState {
  const difficulty = normalizeDifficulty(options.difficulty);
  const bossHp = Math.round(RULES.bossHp * DIFFICULTIES[difficulty].hpMultiplier);
  const firstLane = WAVES[0][0].lane;
  const carryRoute = firstLane === 0 ? 'branch' : firstLane === 3 ? 'upper' : 'lower';
  const carryAnchor = firstLane === 0 ? MAP.spawns[2] : {x: MAP.columns - 1, y: firstLane};
  return {
    carry: createBattleCarry(options.carry, carryRoute, carryAnchor),
    stageId: 'alley_boss', difficulty, phase: 'ready', elapsed: 0, accumulator: 0,
    wave: 0, totalWaves: WAVES.length, waveTime: 0, spawnIndex: 0, nextWaveIn: null, spawned: 0, defeated: 0,
    totalEnemies: TOTAL_MINIONS, leaks: 0, maxLeaks: RULES.maxLeaks,
    boss: {id: 'alley-chief', name: '路障首领', ...MAP.boss, width: 2, height: 2, hp: bossHp, maxHp: bossHp, phase: 'idle', phaseTime: 0, cooldown: 1.8, skillCooldown: 10, targetCells: [], attacks: 0, slams: 0},
    cats: Object.values(CAT_DEFINITIONS).map(def => ({...structuredClone(def), ...def.initial, hp: def.maxHp, energy: 0, cooldown: 0,
      shield: 0, shieldRemaining: 0, status: 'active', attacks: 0, skillUses: 0, blockedCount: 0})),
    enemies: [],
    paused: false, externallyPaused: false, uiPaused: false, baseSpeed: 1, inspectedCatId: null, aim: null,
    logs: [{id: 0, time: 0, text: '第一章 · 陌生小巷。四位伙伴就位，守住三处巷口并击败占据四格的固定首领。'}], effects: [], sequence: 0, lastAction: null,
    stats: {skills: 0, dodgedSlams: 0, damageTaken: 0},
  };
}
const distanceRemaining = (enemy: ChapterEnemy) => enemy.route === 'branch' && enemy.y < 3 ? 3 - enemy.y + MAP.spawns[2].x : enemy.x + Math.max(0, enemy.y - 3);
function moveEnemies(state: ChapterState, dt: number, enemySeconds: ReadonlyMap<string, number>): void {
  // Reserve all still-valid contacts before considering new arrivals. Reassigning
  // capacity every tick lets overflow enemies rotate into slots and push a held
  // enemy through its blocker, especially where the vertical branch meets D5.
  releaseBlocks(state);
  const counts = new Map<ChapterCatId, number>(state.cats.map(cat => [cat.id, cat.blockedCount]));
  for (const enemy of [...state.enemies].sort((a, b) => distanceRemaining(a) - distanceRemaining(b) || a.id.localeCompare(b.id))) {
    if (enemy.blockedBy) continue;
    const activeSeconds = enemySeconds.get(enemy.id) ?? dt;
    if (activeSeconds <= EPS) continue;
    const distance = enemy.speed * activeSeconds * getCarrySpeedMultiplier(state.carry, enemy.route);
    if (enemy.route === 'branch' && enemy.y < 3 - EPS) {
      const proposed = Math.min(3, enemy.y + distance);
      const cat = state.cats.filter(candidate => candidate.status === 'active' && candidate.x === MAP.spawns[2].x
        && candidate.y >= enemy.y - EPS && proposed >= candidate.y - 0.42 && (counts.get(candidate.id) ?? 0) < candidate.block)
        .sort((a, b) => a.y - b.y)[0];
      if (cat) {enemy.y = Math.max(enemy.y, cat.y - 0.42); enemy.blockedBy = cat.id; counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);}
      else enemy.y = proposed;
      continue;
    }
    if (enemy.x <= EPS && enemy.y > MAP.goal.y) {enemy.y = Math.max(MAP.goal.y, enemy.y - distance); continue;}
    const proposed = Math.max(0, enemy.x - distance);
    const cat = state.cats.filter(candidate => candidate.status === 'active' && Math.abs(candidate.y - enemy.y) < 0.1
      && candidate.x <= enemy.x + EPS && proposed <= candidate.x + 0.42 && (counts.get(candidate.id) ?? 0) < candidate.block)
      .sort((a, b) => b.x - a.x)[0];
    if (cat) {enemy.x = Math.min(enemy.x, cat.x + 0.42); enemy.blockedBy = cat.id; counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);}
    else enemy.x = proposed;
  }
  for (const cat of state.cats) cat.blockedCount = counts.get(cat.id) ?? 0;
}
function attackTargets(state: ChapterState, cells: Position[]): (ChapterEnemy | ChapterState['boss'])[] {
  return [...state.enemies.filter(enemy => inCells(enemy, cells)), ...(state.boss.phase !== 'defeated' && getBossCells(state.boss).some(footprint => cells.some(cell => same(cell, footprint))) ? [state.boss] : [])]
    .sort((a, b) => a.x - b.x || (a.id === 'alley-chief' ? 1 : -1));
}
function catsAttack(state: ChapterState): void {
  for (const cat of state.cats) {
    if (cat.status !== 'active' || cat.cooldown > EPS) continue;
    const target = attackTargets(state, getAttackCells(cat)).find(enemy => enemy.hp > 0);
    if (!target) continue;
    const damage = cat.damage;
    target.hp = Math.max(0, target.hp - damage); cat.cooldown = cat.interval; cat.attacks++;
    effect(state, 'attack', cat, target); checkEnemyDeaths(state);
  }
}
function bossTick(state: ChapterState, dt: number): void {
  const boss = state.boss;
  if (boss.phase === 'defeated') return;
  boss.phaseTime += dt;
  if (boss.phase === 'windup') {
    if (boss.phaseTime + EPS < RULES.bossSlamWindup) return;
    const targets = state.cats.filter(cat => cat.status === 'active' && inCells(cat, boss.targetCells));
    for (const cat of targets) hurtCat(state, cat, RULES.bossSlamDamage);
    if (!targets.length) state.stats.dodgedSlams++;
    boss.slams++; effect(state, 'slam', boss, boss.targetCells[0] ?? boss, boss.targetCells);
    log(state, targets.length ? `首领砸下路障，${targets.length} 位伙伴受到冲击。` : '路障砸在空处，伙伴们避开了重砸。');
    boss.phase = 'recovery'; boss.phaseTime = 0; return;
  }
  if (boss.phase === 'recovery') {
    if (boss.phaseTime + EPS >= RULES.bossSlamRecovery) {boss.phase = 'idle'; boss.phaseTime = 0; boss.targetCells = []; boss.skillCooldown = RULES.bossSlamInterval;}
    return;
  }
  boss.skillCooldown = Math.max(0, boss.skillCooldown - dt);
  boss.cooldown = Math.max(0, boss.cooldown - dt);
  const nearby = state.cats.filter(cat => cat.status === 'active' && getBossDistance(boss, cat) <= RULES.bossRange)
    .sort((a, b) => getBossDistance(boss, a) - getBossDistance(boss, b));
  if (boss.skillCooldown <= EPS && nearby.length) {
    const target = nearby[0]; boss.targetCells = cross(target); boss.phase = 'windup'; boss.phaseTime = 0;
    log(state, '首领双手举起路障、向后蓄势！裂纹落点已锁定，赶快移动伙伴。'); return;
  }
  if (boss.cooldown <= EPS && nearby.length) {
    hurtCat(state, nearby[0], RULES.bossDamage); boss.cooldown = RULES.bossAttackInterval; boss.attacks++;
    effect(state, 'boss-attack', boss, nearby[0]);
  }
}
function tick(state: ChapterState, dt: number): void {
  state.elapsed += dt;
  for (const cat of state.cats) {
    cat.cooldown = Math.max(0, cat.cooldown - dt);
    if (cat.status === 'active') cat.energy = Math.min(RULES.maxEnergy, cat.energy + RULES.energyPerSecond * dt);
    cat.shieldRemaining = Math.max(0, cat.shieldRemaining - dt); if (cat.shieldRemaining === 0) cat.shield = 0;
  }
  state.effects = state.effects.filter(effect => (effect.remaining -= dt) > 0);
  if (state.nextWaveIn !== null) {state.nextWaveIn -= dt; if (state.nextWaveIn <= EPS) startWave(state, state.wave + 1);}
  if (state.nextWaveIn === null) {
    state.waveTime += dt;
    const wave = WAVES[state.wave - 1];
    while (state.spawnIndex < wave.length && wave[state.spawnIndex].at <= state.waveTime + EPS) {
      const entry = wave[state.spawnIndex++], def = ENEMY_DEFINITIONS[entry.kind];
      const maxHp = Math.round(def.maxHp * DIFFICULTIES[state.difficulty].hpMultiplier);
      state.enemies.push({...def, maxHp, hp: maxHp, kind: entry.kind, id: `minion-${++state.sequence}`,
        x: entry.lane === 0 ? MAP.spawns[2].x : MAP.columns - 1, y: entry.lane, route: entry.lane === 0 ? 'branch' : entry.lane === 3 ? 'upper' : 'lower',
        cooldown: 0, blockedBy: null}); state.spawned++;
    }
  }
  const carryTick = tickBattleCarry(state.carry, dt, state.wave, state.enemies);
  for (const hit of carryTick.hits) effect(state, 'skill', state.carry.anchor, hit.position);
  if (carryTick.hits.length) checkEnemyDeaths(state);
  for (const enemy of state.enemies) enemy.cooldown = Math.max(0, enemy.cooldown - (carryTick.enemySeconds.get(enemy.id) ?? dt));
  moveEnemies(state, dt, carryTick.enemySeconds);
  const escaped = state.enemies.filter(enemy => enemy.x <= EPS && enemy.y <= MAP.goal.y + EPS);
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
export function advanceChapter(state: ChapterState, seconds: number): ChapterState {
  if (!Number.isFinite(seconds) || seconds <= 0 || getChapterSpeed(state) === 0) return state;
  const next = structuredClone(state);
  next.accumulator += Math.min(RULES.maxFrameSeconds, seconds) * getChapterSpeed(state);
  while (next.accumulator + EPS >= RULES.step && next.phase === 'battle') {next.accumulator = Math.max(0, next.accumulator - RULES.step); tick(next, RULES.step);}
  return next;
}
function actionResult(state: ChapterState, ok: boolean, message: string): ChapterState {state.lastAction = {ok, message}; return state;}
function castSkill(state: ChapterState, cat: ChapterCat, target?: Position | null): string | null {
  if (cat.status !== 'active') return '已经退场的伙伴不能释放技能。';
  if (cat.energy < 100) return '需要 100 能量才能释放技能。';
  const skill = SKILLS[cat.id];
  if (skill.targeting === 'area' && (!target || !isPlayableCell(target))) return '请在实际存在、没有杂物的格子选择技能中心。';
  const cells = getSkillCells(cat, target);
  if (skill.damage) {
    for (const enemy of attackTargets(state, cells)) {
      enemy.hp = Math.max(0, enemy.hp - skill.damage);
    }
    effect(state, 'skill', cat, target ?? cat, cells); checkEnemyDeaths(state);
  }
  if (skill.shield) {cat.shield = skill.shield; cat.shieldRemaining = skill.duration!; effect(state, 'shield', cat, cat);}
  if (skill.heal) for (const friend of state.cats.filter(friend => friend.status === 'active')) {friend.hp = Math.min(friend.maxHp, friend.hp + skill.heal); effect(state, 'heal', cat, friend);}
  cat.energy -= 100; cat.skillUses++; state.stats.skills++; state.aim = null; state.inspectedCatId = null;
  log(state, `${cat.name}使用「${skill.name}」。`);
  return null;
}
/** All UI actions pass through the same validation used by automated play and keyboard/touch controls. */
export function dispatchChapter(state: ChapterState, action: ChapterAction): ChapterState {
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
    if (SKILLS[cat.id].targeting !== 'area') return dispatchChapter(next, {type: 'CAST_SKILL', catId: cat.id});
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
