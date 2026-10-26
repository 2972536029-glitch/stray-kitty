import {createBattleCarry, finishCarryWave, getCarrySpeedMultiplier, startBattleCarry, tickBattleCarry, useBattleCarry} from '../carry';
import {CAT_DEFINITIONS, CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, normalizeDifficulty, ROUTES, RULES, SKILLS, TOTAL_MINIONS, WAVES} from './config';
import type {GreenhouseAction, GreenhouseBoss, GreenhouseCat, GreenhouseCatId, GreenhouseEnemy, GreenhouseOptions, GreenhouseState, Position} from './types';

const EPS = 1e-8;
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
const positionOf = (entity: Position): Position => ({x: Math.round(entity.x), y: Math.round(entity.y)});
const cross = (origin: Position): Position[] => [{x: 0, y: 0}, {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}]
  .map(offset => ({x: origin.x + offset.x, y: origin.y + offset.y})).filter(isPlayableCell);
const inCells = (entity: Position, cells: readonly Position[]) => cells.some(cell => same(cell, positionOf(entity)));
const catById = (state: GreenhouseState, id: GreenhouseCatId) => state.cats.find(cat => cat.id === id);
const terminal = (state: GreenhouseState) => state.phase === 'won' || state.phase === 'lost';
export const cellName = ({x, y}: Position) => `${String.fromCharCode(65 + y)}${x + 1}`;

export function isGreenhouseCell(position: Position): boolean {
  return Number.isInteger(position.x) && Number.isInteger(position.y) && CELLS.some(cell => same(cell, position));
}
export function isObstacle(position: Position): boolean {return MAP.obstacles.some(cell => same(cell, position));}
export function isPlayableCell(position: Position): boolean {return isGreenhouseCell(position) && !isObstacle(position);}
/** Four boss cells share one target and one HP pool; minions may cross the footprint. */
export function getBossCells(boss: Pick<GreenhouseBoss, 'x' | 'y' | 'width' | 'height'>): Position[] {
  return Array.from({length: boss.width * boss.height}, (_, index) => ({x: boss.x + index % boss.width, y: boss.y + Math.floor(index / boss.width)}));
}
export function getBossDistance(boss: GreenhouseBoss, target: Position): number {
  return Math.min(...getBossCells(boss).map(cell => Math.abs(cell.x - target.x) + Math.abs(cell.y - target.y)));
}
export function isDeployableCell(position: Position): boolean {
  return isPlayableCell(position) && !same(position, MAP.goal) && !MAP.bossCells.some(cell => same(cell, position)) && !MAP.spawns.some(cell => same(cell, position));
}
export function getAttackCells(cat: GreenhouseCat): Position[] {
  if (cat.status !== 'active') return [];
  const offsets = cat.range === 'melee' ? [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1}]
    : Array.from({length: (cat.range === 'claws' ? 3 : 4) * 3}, (_, i) => ({x: Math.floor(i / 3), y: i % 3 - 1}));
  return offsets.map(offset => ({x: cat.x + offset.x, y: cat.y + offset.y})).filter(isPlayableCell);
}
export function getSkillCells(cat: GreenhouseCat, target?: Position | null): Position[] {
  if (cat.status !== 'active') return [];
  switch (SKILLS[cat.id].targeting) {
    case 'area': return target && isPlayableCell(target) ? cross(target) : [];
    case 'forward': return Array.from({length: 9}, (_, i) => ({x: cat.x + Math.floor(i / 3), y: cat.y + i % 3 - 1})).filter(isPlayableCell);
    case 'team': return CELLS.filter(isPlayableCell);
    default: return [{x: cat.x, y: cat.y}];
  }
}

export function getDeployError(state: GreenhouseState, catId: GreenhouseCatId, target: Position): string | null {
  const cat = catById(state, catId);
  if (!cat) return '没有这只战斗猫。';
  if (terminal(state)) return '这场战斗已经结束。';
  if (state.externallyPaused) return '请先关闭外部面板或继续冒险。';
  if (state.aim) return '请先完成或取消技能瞄准。';
  if (!isGreenhouseCell(target)) return '这里没有可用地格。';
  if (isObstacle(target)) return '花架和杂物占用了这个位置。';
  if (!isDeployableCell(target)) return '保护点、刷怪口和首领位置不能部署。';
  if (cat.status !== 'active') return '这位伙伴已经退场，本场不能重新上阵。';
  if (state.enemies.some(enemy => inCells(enemy, [target]))) return '这格有黑影，暂时不能移动过去。';
  const occupant = state.cats.find(other => other.id !== catId && other.status === 'active' && same(other, target));
  if (occupant && state.enemies.some(enemy => inCells(enemy, [cat]))) return '原位置有黑影，不能让伙伴交换到危险格。';
  return null;
}
export function getGreenhouseSpeed(state: GreenhouseState): number {
  if (state.phase !== 'battle' || state.paused || state.externallyPaused || state.uiPaused) return 0;
  if (state.aim) return 1;
  if (state.inspectedCatId) return 0.5;
  return state.baseSpeed;
}
export function getGreenhouseAdvice(state: GreenhouseState): string {
  if (state.phase === 'ready') return '六位伙伴守护温室。点点在场外巡视陷阱，墨墨以全队护盾支援；留意 C8、E8、F7 三条路径，守住 B1。';
  if (state.phase === 'won') return state.leaks === 0 ? '八波黑影与荆冠首领都已处理，零突破守护完成！' : '小怪与首领都已处理，可以返回主流程。';
  if (state.phase === 'lost') return '本场守护已结束，重新挑战按主流程开始新场次。';
  if (state.boss.phase === 'windup') return `荆棘播种已锁定 ${state.boss.targetCells.map(cellName).join('、')}！三秒后落地，不会追踪伙伴。先移开；墨墨不能取消尚未落地的预告。`;
  const momo = catById(state, 'momo')!;
  if (state.hazards.length) return momo.status === 'active' && momo.energy >= 100
    ? '墨墨能量已满，巡光护行可以清掉全部已生成荆棘并给在场伙伴加盾。'
    : '荆棘已落地，每秒伤害持续六秒。危险格仍可移动进入，但先在外等待，消失后再回原位。';
  if (state.cats.some(cat => cat.status === 'retired')) return '体力归零的伙伴本场不能返回。墨墨只能提供护盾，不能治疗或复活。';
  if (state.boss.phase === 'defeated') return '首领倒下，预告与荆棘已消散；仍需守完余下小怪波次。';
  return '缺口不是地格，三条路线会绕开花架。每模拟秒积攒 5 能量；墨墨用护盾保护在场伙伴，栗栗与斑斑守住两路。';
}
function log(state: GreenhouseState, text: string): void {
  state.logs.push({id: ++state.sequence, time: state.elapsed, text});
  if (state.logs.length > 32) state.logs.shift();
}
function effect(state: GreenhouseState, kind: GreenhouseState['effects'][number]['kind'], from: Position, to: Position, cells?: Position[]): void {
  state.effects.push({id: ++state.sequence, kind, from: {...from}, to: {...to}, cells, remaining: kind === 'seed' || kind === 'thorn' ? 0.7 : 0.4});
}
function completePhase(state: GreenhouseState, phase: 'won' | 'lost', reason?: string): void {
  state.phase = phase; state.aim = null; state.inspectedCatId = null; state.accumulator = 0;
  log(state, phase === 'won' ? `八波黑影已处理，固定首领被击败。${state.leaks === 0 ? '零突破守护完成！' : `本场突破 ${state.leaks} 次。`}` : reason ?? '突破达到三次，守护失败。猫咪们已经安全撤离。');
}
function segment(enemy: GreenhouseEnemy): {dx: number; dy: number; target: Position} | null {
  const path = ROUTES[enemy.route];
  if (enemy.pathIndex >= path.length) return null;
  const from = path[enemy.pathIndex - 1], target = path[enemy.pathIndex];
  return {dx: Math.sign(target.x - from.x), dy: Math.sign(target.y - from.y), target};
}
function distanceRemaining(enemy: GreenhouseEnemy): number {
  const path = ROUTES[enemy.route];
  let position: Position = enemy, remaining = 0;
  for (let i = enemy.pathIndex; i < path.length; i++) {
    remaining += Math.abs(path[i].x - position.x) + Math.abs(path[i].y - position.y); position = path[i];
  }
  return remaining;
}
function releaseBlocks(state: GreenhouseState): void {
  const counts = new Map<GreenhouseCatId, number>();
  for (const enemy of state.enemies) {
    const cat = enemy.blockedBy && catById(state, enemy.blockedBy), direction = segment(enemy);
    // Contact is directed: a cat moved behind a shadow cannot retain that block.
    const ahead = cat && direction ? (cat.x - enemy.x) * direction.dx + (cat.y - enemy.y) * direction.dy : -1;
    const aligned = cat && direction && (direction.dx ? Math.abs(cat.y - enemy.y) < EPS : Math.abs(cat.x - enemy.x) < EPS);
    if (!cat || !direction || cat.status !== 'active' || enemy.hp <= 0 || !aligned || ahead < -EPS || ahead > RULES.contactGap + EPS
        || (counts.get(cat.id) ?? 0) >= cat.block) enemy.blockedBy = null;
    else counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
  }
  for (const cat of state.cats) cat.blockedCount = counts.get(cat.id) ?? 0;
}
function hurtCat(state: GreenhouseState, cat: GreenhouseCat, damage: number): void {
  if (cat.status !== 'active') return;
  const absorbed = Math.min(cat.shield, damage);
  cat.shield -= absorbed;
  const actual = Math.min(cat.hp, damage - absorbed);
  cat.hp -= actual; state.stats.damageTaken += actual;
  if (cat.hp <= 0) {
    cat.hp = 0; cat.status = 'retired'; cat.energy = 0; cat.shield = 0; cat.shieldRemaining = 0; cat.attackBuffRemaining = 0;
    if (state.inspectedCatId === cat.id) state.inspectedCatId = null;
    if (state.aim?.catId === cat.id) state.aim = null;
    log(state, `${cat.name}体力归零，已经退场，本场无法重新上阵。`);
    releaseBlocks(state);
  }
}
function checkEnemyDeaths(state: GreenhouseState): void {
  for (const enemy of state.enemies.filter(enemy => enemy.hp <= 0)) {state.defeated++; effect(state, 'defeat', enemy, enemy);}
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
  if (state.boss.hp <= 0 && state.boss.phase !== 'defeated') {
    state.boss.hp = 0; state.boss.phase = 'defeated'; state.boss.phaseTime = 0; state.boss.targetCells = []; state.hazards = [];
    effect(state, 'defeat', state.boss, state.boss); log(state, '荆冠首领被击败，预告与荆棘已经消散！继续清理剩余波次，小怪全部处理完才能通关。');
  }
}
function startWave(state: GreenhouseState, wave: number): void {
  state.wave = wave; state.waveTime = 0; state.spawnIndex = 0; state.nextWaveIn = null;
  log(state, `第 ${wave} / ${WAVES.length} 波：留意 C8、E8 与 F7 三处入口。`);
}
export function createGreenhouseBattle(options: GreenhouseOptions = {}): GreenhouseState {
  const difficulty = normalizeDifficulty(options.difficulty);
  const bossHp = Math.round(RULES.bossHp * DIFFICULTIES[difficulty].hpMultiplier);
  return {
    carry: createBattleCarry(options.carry, WAVES[0][0].route, ROUTES[WAVES[0][0].route][0]),
    stageId: 'greenhouse_boss', difficulty, phase: 'ready', elapsed: 0, accumulator: 0,
    wave: 0, totalWaves: WAVES.length, waveTime: 0, spawnIndex: 0, nextWaveIn: null, spawned: 0, defeated: 0,
    totalEnemies: TOTAL_MINIONS, leaks: 0, maxLeaks: RULES.maxLeaks,
    boss: {id: 'thorn-crown', name: '荆冠首领', ...MAP.boss, width: 2, height: 2, hp: bossHp, maxHp: bossHp, phase: 'idle', phaseTime: 0, cooldown: RULES.bossAttackInterval, skillCooldown: RULES.bossSeedFirst, targetCells: [], attacks: 0, slams: 0},
    cats: Object.values(CAT_DEFINITIONS).map(def => ({...structuredClone(def), ...def.initial, hp: def.maxHp, energy: 0, cooldown: 0,
      shield: 0, shieldRemaining: 0, attackBuffRemaining: 0, status: 'active', attacks: 0, skillUses: 0, blockedCount: 0})),
    enemies: [], hazards: [],
    paused: false, externallyPaused: false, uiPaused: false, baseSpeed: 1, inspectedCatId: null, aim: null,
    logs: [{id: 0, time: 0, text: '第三章 · 温室长廊。点点在场外巡视陷阱，墨墨加入守护；六位伙伴守住三条路线，击败荆冠首领。'}], effects: [], sequence: 0, lastAction: null,
    stats: {skills: 0, dodgedSlams: 0, damageTaken: 0},
  };
}
function moveEnemies(state: GreenhouseState, dt: number, enemySeconds: ReadonlyMap<string, number>): void {
  releaseBlocks(state);
  const counts = new Map<GreenhouseCatId, number>(state.cats.map(cat => [cat.id, cat.blockedCount]));
  for (const enemy of [...state.enemies].sort((a, b) => distanceRemaining(a) - distanceRemaining(b) || a.id.localeCompare(b.id))) {
    if (enemy.blockedBy) continue;
    const activeSeconds = enemySeconds.get(enemy.id) ?? dt;
    if (activeSeconds <= EPS) continue;
    const slowed = Math.min(activeSeconds, enemy.slowRemaining);
    const routeMultiplier = getCarrySpeedMultiplier(state.carry, enemy.route);
    let distance = routeMultiplier === 1
      ? enemy.speed * (slowed * enemy.slowMultiplier + activeSeconds - slowed)
      : enemy.speed * (slowed * Math.min(enemy.slowMultiplier, routeMultiplier) + (activeSeconds - slowed) * routeMultiplier);
    while (distance > EPS) {
      const direction = segment(enemy); if (!direction) break;
      const {dx, dy, target} = direction;
      const toCorner = Math.abs(target.x - enemy.x) + Math.abs(target.y - enemy.y);
      if (toCorner <= EPS) {enemy.pathIndex++; continue;}
      const step = Math.min(distance, toCorner);
      const contacts = state.cats.flatMap(cat => {
        if (cat.status !== 'active' || (counts.get(cat.id) ?? 0) >= cat.block) return [];
        if (dx ? Math.abs(cat.y - enemy.y) >= EPS : Math.abs(cat.x - enemy.x) >= EPS) return [];
        const ahead = (cat.x - enemy.x) * dx + (cat.y - enemy.y) * dy;
        const contact = ahead - RULES.contactGap;
        return ahead >= -EPS && ahead <= toCorner + EPS && contact <= step + EPS && contact >= -EPS ? [{cat, contact}] : [];
      }).sort((a, b) => a.contact - b.contact || a.cat.id.localeCompare(b.cat.id));
      if (contacts.length) {
        const {cat, contact} = contacts[0]; enemy.x += dx * Math.max(0, contact); enemy.y += dy * Math.max(0, contact);
        enemy.blockedBy = cat.id; counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1); break;
      }
      enemy.x += dx * step; enemy.y += dy * step; distance -= step;
      if (Math.abs(enemy.x - target.x) < EPS && Math.abs(enemy.y - target.y) < EPS) {
        enemy.x = target.x; enemy.y = target.y; enemy.pathIndex++;
      }
    }
  }
  for (const cat of state.cats) cat.blockedCount = counts.get(cat.id) ?? 0;
}
function attackTargets(state: GreenhouseState, cells: Position[]): (GreenhouseEnemy | GreenhouseState['boss'])[] {
  return [...state.enemies.filter(enemy => inCells(enemy, cells)), ...(state.boss.phase !== 'defeated' && getBossCells(state.boss).some(footprint => cells.some(cell => same(cell, footprint))) ? [state.boss] : [])]
    .sort((a, b) => a.x - b.x || (a.id === 'thorn-crown' ? 1 : -1));
}
function catsAttack(state: GreenhouseState): void {
  for (const cat of state.cats) {
    if (cat.status !== 'active' || cat.cooldown > EPS) continue;
    const target = attackTargets(state, getAttackCells(cat)).find(enemy => enemy.hp > 0);
    if (!target) continue;
    const damage = cat.damage * (cat.attackBuffRemaining > EPS ? SKILLS[cat.id].attackMultiplier ?? 1 : 1);
    target.hp = Math.max(0, target.hp - damage); cat.cooldown = cat.interval; cat.attacks++;
    effect(state, 'attack', cat, target); checkEnemyDeaths(state);
  }
}
function tickHazards(state: GreenhouseState, dt: number): void {
  for (const hazard of state.hazards) {
    const activeTime = Math.min(dt, hazard.remaining);
    hazard.remaining = Math.max(0, hazard.remaining - activeTime);
    hazard.tickIn -= activeTime;
    while (hazard.tickIn <= EPS && hazard.ticks < RULES.thornMaxTicks) {
      hazard.ticks++; hazard.tickIn += RULES.thornTickInterval;
      for (const cat of state.cats) if (cat.status === 'active' && same(cat, hazard)) {
        hurtCat(state, cat, RULES.thornDamage); effect(state, 'thorn', hazard, cat);
      }
    }
    if (hazard.remaining < EPS) hazard.remaining = 0;
  }
  state.hazards = state.hazards.filter(hazard => hazard.remaining > 0 && hazard.ticks < RULES.thornMaxTicks);
}
function bossTick(state: GreenhouseState, dt: number): void {
  const boss = state.boss;
  if (boss.phase === 'defeated') return;
  boss.phaseTime += dt;
  // Start-to-start interval includes the three-second warning and one-second recovery.
  boss.skillCooldown = Math.max(0, boss.skillCooldown - dt);
  if (boss.phase === 'windup') {
    if (boss.phaseTime + EPS < RULES.bossSeedWindup) return;
    if (!state.cats.some(cat => cat.status === 'active' && inCells(cat, boss.targetCells))) state.stats.dodgedSlams++;
    for (const cell of boss.targetCells) state.hazards.push({...cell, id: ++state.sequence,
      remaining: RULES.thornDuration, tickIn: RULES.thornTickInterval, ticks: 0});
    boss.slams++; effect(state, 'seed', boss, boss.targetCells[0] ?? boss, boss.targetCells);
    log(state, '荆棘已落地，六秒内每秒伤害一次；墨墨可用巡光护行清除已生成的荆棘。');
    boss.targetCells = []; boss.phase = 'recovery'; boss.phaseTime = 0; return;
  }
  if (boss.phase === 'recovery') {
    if (boss.phaseTime + EPS >= RULES.bossSeedRecovery) {boss.phase = 'idle'; boss.phaseTime = 0;}
    return;
  }
  boss.cooldown = Math.max(0, boss.cooldown - dt);
  const active = state.cats.filter(cat => cat.status === 'active')
    .sort((a, b) => getBossDistance(boss, a) - getBossDistance(boss, b) || a.id.localeCompare(b.id));
  if (boss.skillCooldown <= EPS && active.length) {
    boss.targetCells = active.slice(0, 2).map(cat => ({x: cat.x, y: cat.y}));
    boss.phase = 'windup'; boss.phaseTime = 0; boss.skillCooldown = RULES.bossSeedInterval;
    log(state, `荆冠首领开始播种，${boss.targetCells.map(cellName).join('、')} 已锁定！3 秒后生成荆棘，移位不会改变落点。`); return;
  }
  const nearby = active.filter(cat => getBossDistance(boss, cat) <= RULES.bossRange);
  if (boss.cooldown <= EPS && nearby.length) {
    hurtCat(state, nearby[0], RULES.bossDamage); boss.cooldown = RULES.bossAttackInterval; boss.attacks++;
    effect(state, 'boss-attack', boss, nearby[0]);
  }
}
function tick(state: GreenhouseState, dt: number): void {
  state.elapsed += dt;
  for (const cat of state.cats) {
    cat.cooldown = Math.max(0, cat.cooldown - dt);
    if (cat.status === 'active') cat.energy = Math.min(RULES.maxEnergy, cat.energy + RULES.energyPerSecond * dt);
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
  // Existing hazards advance before new seeds land, so landing itself never deals a tick.
  tickHazards(state, dt); bossTick(state, dt); releaseBlocks(state);
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
export function advanceGreenhouse(state: GreenhouseState, seconds: number): GreenhouseState {
  if (!Number.isFinite(seconds) || seconds <= 0 || getGreenhouseSpeed(state) === 0) return state;
  const next = structuredClone(state);
  next.accumulator += Math.min(RULES.maxFrameSeconds, seconds) * getGreenhouseSpeed(state);
  while (next.accumulator + EPS >= RULES.step && next.phase === 'battle') {next.accumulator = Math.max(0, next.accumulator - RULES.step); tick(next, RULES.step);}
  return next;
}
function actionResult(state: GreenhouseState, ok: boolean, message: string): GreenhouseState {state.lastAction = {ok, message}; return state;}
function castSkill(state: GreenhouseState, cat: GreenhouseCat, target?: Position | null): string | null {
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
  if (skill.shield) {
    if (skill.targeting === 'team') {
      for (const friend of state.cats.filter(friend => friend.status === 'active')) {
        friend.shield = Math.max(friend.shield, skill.shield); friend.shieldRemaining = Math.max(friend.shieldRemaining, skill.duration!);
        effect(state, 'shield', cat, friend);
      }
    } else {
      cat.shield = Math.max(cat.shield, skill.shield);
      cat.shieldRemaining = Math.max(cat.shieldRemaining, skill.duration!);
      effect(state, 'shield', cat, cat);
    }
  }
  if (skill.clearHazards) state.hazards = [];
  if (skill.attackMultiplier) cat.attackBuffRemaining = skill.duration!;
  cat.energy -= 100; cat.skillUses++; state.stats.skills++; state.aim = null; state.inspectedCatId = null;
  log(state, `${cat.name}使用「${skill.name}」。`);
  return null;
}
/** All UI actions pass through the same validation used by automated play and keyboard/touch controls. */
export function dispatchGreenhouse(state: GreenhouseState, action: GreenhouseAction): GreenhouseState {
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
    if (SKILLS[cat.id].targeting !== 'area') return dispatchGreenhouse(next, {type: 'CAST_SKILL', catId: cat.id});
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
