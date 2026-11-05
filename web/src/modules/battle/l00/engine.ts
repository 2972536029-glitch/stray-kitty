import type {CombatAction, CombatCatState, CombatEnemy, CombatOptions, CombatPhase, CombatState, CatId, EnemyType} from './state.ts';
import { CONFIG, CAT_TYPES, ENEMY_TYPES, TUTORIAL_TARGETS, TUTORIAL_STEPS, WAVES, COMMANDER_POSITION, DIFFICULTY_CONFIG, SKILLS, normalizeDifficulty, isSpawnCell } from './config.ts';
import {getAttackCells, getSkillCells, isEnemyInCells, isSkillTargetAllowed} from './ranges.ts';

const EPS = 1e-8;
const PHASES = new Set(['ready', 'hero_danger', 'caster_rescue', 'teach_position', 'teach_move', 'teach_live_move', 'teach_energy', 'skill_charge', 'teach_guard_skill', 'teach_caster_skill', 'battle', 'won', 'failed']);
const RUNNING = new Set(['hero_danger', 'caster_rescue', 'teach_live_move', 'skill_charge', 'battle']);
const validState = (state: CombatState) => state && PHASES.has(state.phase) && Array.isArray(state.cats) && Array.isArray(state.enemies);
const copy = (state: CombatState): CombatState => structuredClone(state);
const normalizePressure = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value !== 0 ? Math.sign(value) : 0;
const catById = (state: CombatState, id: string | null) => state.cats.find((cat) => cat.id === id);
const inGrid = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < CONFIG.COLUMNS && y >= 0 && y < CONFIG.ROWS;
const activeCombatCat = (state: CombatState, id: string | null) => {
  const cat = catById(state, id);
  return cat && cat.id !== 'hero' && cat.combatant && cat.status === 'active' && inGrid(cat.x, cat.y) ? cat : null;
};
export const getDeployedCatCount = (state: CombatState): number => state.cats.filter(cat =>
  cat.id !== 'hero' && cat.combatant && cat.status === 'active' && inGrid(cat.x, cat.y)).length;
/** Effective simulation speed; inspection and aiming never change the chosen baseline. */
export function getBattleSpeed(state: CombatState): number {
  if (state.paused || state.externallyPaused || !RUNNING.has(state.phase)) return 0;
  if (state.phase === 'teach_live_move') return 0.5;
  if (state.skillAim) return 1;
  if (activeCombatCat(state, state.inspectedCatId)) return 0.5;
  return state.playbackSpeed;
}
const blockX = (cat: CombatCatState) => Math.min(CONFIG.VISIBLE_MAX_X, cat.x + CONFIG.CONTACT_GAP);
const atGoal = (enemy: CombatEnemy) => enemy.x <= CONFIG.GOAL_X + EPS && Math.abs(enemy.y - CONFIG.GOAL_Y) < EPS;
const atContact = (enemy: CombatEnemy, cat: CombatCatState) =>
  (Math.abs(enemy.y - cat.y) < EPS && Math.abs(enemy.x - blockX(cat)) < EPS)
  || (Math.abs(enemy.x - cat.x) < EPS && Math.abs(Math.abs(enemy.y - cat.y) - CONFIG.CONTACT_GAP) < EPS);

function makeCat(id: CatId, x: number, y: number): CombatCatState {
  const type = CAT_TYPES[id];
  return { id, ...type, x, y, hp: type.maxHp, status: 'active', cooldown: 0, attacks: 0, damageTaken: 0, blockedCount: 0, maxBlocks: type.block, energy: 0, shield: 0, shieldRemaining: 0 };
}
function log(state: CombatState, text: string) {
  state.logs.push({ id: `log-${++state.sequence}`, text, time: state.time });
  state.logs = state.logs.slice(-CONFIG.LOG_LIMIT);
}
function effect(state: CombatState, text: string, x: number, y: number, kind = 'info') {
  state.effects.push({ id: `effect-${++state.sequence}`, text, x, y, tx: x, ty: y, kind, ttl: CONFIG.EFFECT_SECONDS, maxTtl: CONFIG.EFFECT_SECONDS });
}
function phase(state: CombatState, next: CombatPhase) {
  state.phase = next; state.tutorialStep = TUTORIAL_STEPS[next] || null;
  state.phaseTime = 0; state.accumulator = 0; state.paused = false;
  state.inspectedCatId = null; state.skillAim = null;
}
function spawn(state: CombatState, type: EnemyType = 'scout', y: number = CONFIG.LANE, extra: Partial<CombatEnemy> = {}) {
  const def = ENEMY_TYPES[type];
  // Every ordinary spawn derives from its immutable base, including wave replays.
  const maxHp = extra.scripted ? CONFIG.SCRIPT_ENEMY_HP : Math.round(def.maxHp * DIFFICULTY_CONFIG[state.difficulty].enemyHpMultiplier);
  state.enemies.push({ id: `shadow-${++state.sequence}`, type, ...def, maxHp, hp: maxHp, x: CONFIG.SPAWN_X, y, cooldown: 0, blockedBy: null, ...extra });
  if (!extra.training) state.spawned += 1;
}
function retire(state: CombatState, cat: CombatCatState) {
  const from = {x: cat.x, y: cat.y};
  cat.status = 'retired'; cat.hp = 0; cat.x = -1; cat.y = -1; cat.blockedCount = 0;
  cat.energy = 0; cat.shield = 0; cat.shieldRemaining = 0;
  if (state.inspectedCatId === cat.id) state.inspectedCatId = null;
  if (state.skillAim?.catId === cat.id) state.skillAim = null;
  for (const enemy of state.enemies) if (enemy.blockedBy === cat.id) enemy.blockedBy = null;
  effect(state, '本场退场', from.x, from.y, 'retire');
  log(state, `${cat.name}体力归零，已退场；本次战斗不能再次上阵。`);
}
function startWave(state: CombatState, wave: number) {
  state.wave = wave; state.waveTime = 0; state.spawnIndex = 0; state.nextWaveIn = null;
  log(state, `第 ${wave} / ${CONFIG.TOTAL_WAVES} 波开始。猫咪可拖到合法空格，战斗猫之间可交换位置。`);
}

export function createGame(options: CombatOptions | null = {}): CombatState {
  const difficulty = normalizeDifficulty(options?.difficulty);
  return {
    version: 2, phase: 'ready', tutorialStep: null, time: 0, phaseTime: 0, accumulator: 0, sequence: 0,
    tutorialProgress: {moved: false, guardSkill: false, casterSkill: false},
    cats: [makeCat('hero', 3, 1)], advisor: { id: 'advisor', name: '阿策', role: '军师喵', visible: false, x: -1, y: 0 },
    enemies: [], projectiles: [], effects: [],
    skillAim: null,
    playbackSpeed: 1, inspectedCatId: null,
    wave: 0, totalWaves: CONFIG.TOTAL_WAVES, waveTime: 0, spawnIndex: 0, nextWaveIn: null,
    defeated: 0, totalEnemies: CONFIG.TOTAL_ENEMIES, spawned: 0, escaped: 0,
    leaks: 0, maxLeaks: CONFIG.MAX_LEAKS, paused: false, externallyPaused: false, sourceModifiers: [],
    mode: options?.mode === 'standard' ? 'standard' : 'tutorial', difficulty, requestedPressure: normalizePressure(options?.shadowPressure), effectivePressure: 0,
    lastAction: null,
    logs: [{ id: 'initial', text: '序章：喵喵是需要保护的指挥目标，不参加攻击。战斗伙伴可以在全棋盘合法格之间随时调动；在真实战斗中学习移动、自然蓄能和手动技能。', time: 0 }],
  };
}
function finishCasterRescue(state: CombatState) {
  state.defeated += state.enemies.length; state.enemies = []; state.projectiles = [];
  state.cats.push(makeCat('guard', 2, 1)); state.advisor.visible = true;
  if (state.mode === 'standard') {
    Object.assign(catById(state, 'caster')!, TUTORIAL_TARGETS.position_caster);
    Object.assign(catById(state, 'guard')!, TUTORIAL_TARGETS.move_guard);
    state.tutorialProgress = {moved: true, guardSkill: true, casterSkill: true};
    phase(state, 'battle'); startWave(state, 1); return;
  }
  phase(state, 'teach_position');
  log(state, '斑斑和阿策赶到。先把绒绒移到任意合法的其他格：A4 只是推荐站位，不是固定岗位。');
}
function hurtCat(state: CombatState, cat: CombatCatState, damage: number) {
  if (!cat.combatant || cat.status !== 'active') return;
  const absorbed = Math.min(cat.shield, damage);
  cat.shield -= absorbed; damage -= absorbed;
  if (absorbed > 0) effect(state, `护盾 −${absorbed}`, cat.x, cat.y, 'shield');
  if (cat.shield <= 0) cat.shieldRemaining = 0;
  if (damage <= 0) return;
  const actual = Math.min(cat.hp, damage);
  cat.hp = Math.max(0, cat.hp - damage); cat.damageTaken += actual;
  effect(state, `−${actual}`, cat.x, cat.y, 'damage');
  if (cat.hp === 0) retire(state, cat);
}
function catsAttack(state: CombatState, dt: number) {
  for (const cat of state.cats) {
    if (!cat.combatant || cat.status !== 'active') continue;
    cat.cooldown = Math.max(0, cat.cooldown - dt);
    if (cat.cooldown > EPS) continue;
    const cells = getAttackCells(cat);
    const targets = state.enemies.filter((enemy) => enemy.hp > 0 && isEnemyInCells(enemy, cells));
    targets.sort((a, b) => Number(b.blockedBy === cat.id) - Number(a.blockedBy === cat.id) || Math.hypot(a.x - cat.x, a.y - cat.y) - Math.hypot(b.x - cat.x, b.y - cat.y) || a.id.localeCompare(b.id));
    const target = targets[0];
    if (!target) continue;
    const damage = Math.min(target.hp, cat.damage);
    target.hp = Math.max(0, target.hp - damage); cat.cooldown = cat.interval; cat.attacks += 1;
    state.projectiles.push({ id: `attack-${++state.sequence}`, x: cat.x, y: cat.y, tx: target.x, ty: target.y, kind: cat.id === 'caster' ? 'starlight' : 'shield', ttl: CONFIG.PROJECTILE_SECONDS, maxTtl: CONFIG.PROJECTILE_SECONDS });
    if (target.hp <= 0 && !target.training) { state.defeated += 1; effect(state, '黑影退去', target.x, target.y, 'defeat'); }
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}
function scriptedTick(state: CombatState, dt: number) {
  const target = catById(state, state.phase === 'hero_danger' ? 'hero' : 'caster')!;
  const enemy = state.enemies[0];
  if (!enemy) return;
  enemy.x = Math.max(target.x + CONFIG.CONTACT_GAP, enemy.x - enemy.speed * dt);
  enemy.cooldown = Math.max(0, enemy.cooldown - dt);
  // The scripted pursuer chooses to stop; the noncombatant hero has no block slot.
  enemy.blockedBy = state.phase === 'caster_rescue' ? 'caster' : null;
  target.blockedCount = state.phase === 'caster_rescue' ? 1 : 0;
  catsAttack(state, dt);
  if (enemy.hp <= 0) {
    spawn(state, 'scout', 1, { scripted: true, hp: CONFIG.SCRIPT_ENEMY_HP, maxHp: CONFIG.SCRIPT_ENEMY_HP, damage: CONFIG.SCRIPT_ENEMY_DAMAGE, interval: CONFIG.SCRIPT_ENEMY_INTERVAL });
    return;
  }
  if (enemy.x > target.x + CONFIG.CONTACT_GAP + EPS || enemy.cooldown > EPS) return;
  enemy.cooldown = enemy.interval;
  if (state.phase === 'hero_danger') {
    const previous = target.hp;
    target.hp = Math.max(CONFIG.HERO_RESCUE_HP, target.hp - enemy.damage); target.damageTaken += previous - target.hp;
    effect(state, `−${previous - target.hp}`, target.x, target.y, 'damage');
    if (target.hp <= CONFIG.HERO_RESCUE_HP) {
      Object.assign(target, COMMANDER_POSITION); state.cats.push(makeCat('caster', 3, 1));
      phase(state, 'caster_rescue'); log(state, '喵喵退到棋盘内 B1 固定指挥格。绒绒赶到，正在用星绒保护它。');
    }
  } else {
    hurtCat(state, target, enemy.damage);
    finishCasterRescue(state);
  }
}
function moveEnemies(state: CombatState, dt: number) {
  const blockers = state.cats.filter((cat) => cat.combatant && cat.status === 'active');
  const counts = new Map(blockers.map((cat) => [cat.id, 0]));
  // Preserve existing engagements first so overflow enemies cannot steal block slots.
  for (const enemy of state.enemies) {
    const cat = blockers.find((item) => item.id === enemy.blockedBy);
    if (cat && atContact(enemy, cat) && (counts.get(cat.id) ?? 0) < cat.block) counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
    else enemy.blockedBy = null;
  }
  for (const enemy of [...state.enemies].sort((a, b) => a.x - b.x)) {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    if (enemy.blockedBy) continue;
    let distanceLeft = enemy.speed * dt;
    // Side routes reach A1/C1 before turning vertically into B1. Each
    // axis-aligned segment participates in capacity-based blocking; no teleport.
    for (let segment = 0; segment < 3 && distanceLeft > EPS && !atGoal(enemy); segment++) {
      const target = enemy.x > CONFIG.TURN_COLUMN_X + EPS
        ? {x: CONFIG.TURN_COLUMN_X, y: enemy.y}
        : Math.abs(enemy.y - CONFIG.GOAL_Y) > EPS
          ? Math.abs(enemy.x - CONFIG.TURN_COLUMN_X) > EPS ? {x: CONFIG.TURN_COLUMN_X, y: enemy.y} : {x: CONFIG.TURN_COLUMN_X, y: CONFIG.GOAL_Y}
          : COMMANDER_POSITION;
      const length = Math.hypot(target.x - enemy.x, target.y - enemy.y);
      if (length < EPS) break;
      const dx = (target.x - enemy.x) / length; const dy = (target.y - enemy.y) / length;
      const step = Math.min(distanceLeft, length);
      const contacts = blockers.flatMap(cat => {
        if ((counts.get(cat.id) ?? 0) >= cat.block) return [];
        if (Math.abs(dy) < EPS && Math.abs(cat.y - enemy.y) >= EPS) return [];
        if (Math.abs(dx) < EPS && Math.abs(cat.x - enemy.x) >= EPS) return [];
        const x = dx < 0 ? blockX(cat) : dx > 0 ? Math.max(CONFIG.GOAL_X, cat.x - CONFIG.CONTACT_GAP) : cat.x;
        const y = dy === 0 ? cat.y : cat.y - dy * CONFIG.CONTACT_GAP;
        const distance = (x - enemy.x) * dx + (y - enemy.y) * dy;
        return distance >= -EPS && distance <= step + EPS ? [{cat, x, y, distance}] : [];
      }).sort((a, b) => a.distance - b.distance || a.cat.id.localeCompare(b.cat.id));
      const contact = contacts[0];
      if (contact) {
        enemy.x = contact.x; enemy.y = contact.y; enemy.blockedBy = contact.cat.id;
        counts.set(contact.cat.id, (counts.get(contact.cat.id) ?? 0) + 1); break;
      }
      enemy.x += dx * step; enemy.y += dy * step; distanceLeft -= step;
      if (Math.abs(enemy.x - target.x) < EPS) enemy.x = target.x;
      if (Math.abs(enemy.y - target.y) < EPS) enemy.y = target.y;
    }
  }
  for (const cat of state.cats) cat.blockedCount = counts.get(cat.id) || 0;
}
function battleTick(state: CombatState, dt: number) {
  if (state.nextWaveIn !== null) { state.nextWaveIn -= dt; if (state.nextWaveIn <= EPS) startWave(state, state.wave + 1); }
  if (state.nextWaveIn === null) {
    state.waveTime += dt; const wave = WAVES[state.wave - 1];
    while (state.spawnIndex < wave.length && wave[state.spawnIndex].at <= state.waveTime + EPS) { const entry = wave[state.spawnIndex++]; spawn(state, entry.type, entry.y); }
  }
  moveEnemies(state, dt);
  const escaped = state.enemies.filter(atGoal);
  if (escaped.length) {
    state.enemies = state.enemies.filter((enemy) => !atGoal(enemy));
    state.leaks += escaped.length; state.escaped += escaped.length;
    catById(state, 'hero')!.hp = Math.max(10, CONFIG.HERO_RESCUE_HP - state.leaks * CONFIG.LEAK_DAMAGE);
    log(state, `${escaped.length} 只黑影抵达 B1，喵喵受到惊扰（${Math.min(state.leaks, state.maxLeaks)} / ${state.maxLeaks}）。`);
    if (state.leaks >= state.maxLeaks) {
      phase(state, 'failed');
      log(state, '指挥位失守，本次战斗结束。结算后可重新挑战，新场次的伙伴恢复初始状态。'); return;
    }
  }
  catsAttack(state, dt);
  for (const enemy of state.enemies) {
    if (enemy.cooldown > EPS || !enemy.blockedBy) continue;
    const cat = catById(state, enemy.blockedBy);
    if (!cat || cat.status !== 'active') continue;
    enemy.cooldown = enemy.interval; hurtCat(state, cat, enemy.damage);
  }
  releaseInvalidBlocks(state);
  if (state.cats.filter(cat => cat.combatant).every(cat => cat.status === 'retired')) {
    phase(state, 'failed'); log(state, '全部战斗伙伴已退场，本次战斗结束。'); return;
  }
  if (state.nextWaveIn === null && state.spawnIndex === WAVES[state.wave - 1].length && state.enemies.length === 0) {
    if (state.wave === CONFIG.TOTAL_WAVES) { phase(state, 'won'); state.projectiles = []; log(state, '守线完成，黑影已离开小巷。所有猫咪都可以安全休息。'); }
    else state.nextWaveIn = CONFIG.WAVE_GAP;
  }
}
export function advanceGame(state: CombatState, dtSeconds: unknown): CombatState {
  if (!validState(state)) return createGame();
  if (typeof dtSeconds !== 'number' || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return state;
  const speed = getBattleSpeed(state); if (speed === 0) return state;
  const next = copy(state); next.accumulator += Math.min(dtSeconds, CONFIG.MAX_FRAME_SECONDS) * speed;
  while (next.accumulator + EPS >= CONFIG.STEP && RUNNING.has(next.phase)) {
    next.accumulator = Math.max(0, next.accumulator - CONFIG.STEP); next.time += CONFIG.STEP; next.phaseTime += CONFIG.STEP;
    next.effects = next.effects.map((item) => ({ ...item, ttl: item.ttl - CONFIG.STEP })).filter((item) => item.ttl > 0);
    next.projectiles = next.projectiles.map((item) => ({ ...item, ttl: item.ttl - CONFIG.STEP })).filter((item) => item.ttl > 0);
    for (const cat of next.cats) {
      if (cat.combatant && cat.status === 'active' && ['battle', 'skill_charge', 'teach_live_move'].includes(next.phase)) {
        cat.energy = Math.min(CONFIG.MAX_ENERGY, cat.energy + CONFIG.ENERGY_PER_SECOND * CONFIG.STEP);
      }
      cat.shieldRemaining = Math.max(0, cat.shieldRemaining - CONFIG.STEP);
      if (cat.shieldRemaining < EPS) { cat.shieldRemaining = 0; cat.shield = 0; }
    }
    if (['battle', 'skill_charge', 'teach_live_move'].includes(next.phase)) {
      battleTick(next, CONFIG.STEP);
      if (next.phase === 'skill_charge') advanceLiveTutorial(next);
    } else scriptedTick(next, CONFIG.STEP);
  }
  return next;
}
/** Teaching pauses the existing encounter; it never replaces enemies or restarts waves. */
function advanceLiveTutorial(state: CombatState) {
  const guard = activeCombatCat(state, 'guard');
  const caster = activeCombatCat(state, 'caster');
  if (!guard) {state.tutorialProgress.moved = true; state.tutorialProgress.guardSkill = true;}
  if (!caster) state.tutorialProgress.casterSkill = true;
  const visibleEnemy = state.enemies.some(enemy => enemy.hp > 0 && enemy.x <= CONFIG.VISIBLE_MAX_X);
  if (!state.tutorialProgress.moved && visibleEnemy) {
    phase(state, 'teach_move');
    log(state, '黑影已经进入战场，先暂停片刻。把斑斑调到另一个合法格接敌；战斗开始后也能随时换位，不消耗能量。');
    return;
  }
  if (state.tutorialProgress.moved && visibleEnemy) {
    if (!state.tutorialProgress.guardSkill && guard && guard.energy >= CONFIG.MAX_ENERGY) {
      phase(state, 'teach_guard_skill'); log(state, '斑斑自然蓄能已满。点击斑斑，再手动释放罐盖护盾。'); return;
    }
    if (state.tutorialProgress.guardSkill && !state.tutorialProgress.casterSkill && caster && caster.energy >= CONFIG.MAX_ENERGY) {
      phase(state, 'teach_caster_skill'); log(state, '绒绒自然蓄能已满。点击技能，再让十字区域覆盖当前战场上的黑影。'); return;
    }
  }
  if (state.tutorialProgress.moved && state.tutorialProgress.guardSkill && state.tutorialProgress.casterSkill) {
    phase(state, 'battle'); log(state, '实战教学完成，继续守住剩余波次。伙伴可在全棋盘合法格之间自由移动或交换；喵喵留在 B1。');
  }
}
function response(state: CombatState, action: {type: string}, ok: boolean, reason: string) { state.lastAction = { id: ++state.sequence, type: action.type, ok, reason }; return state; }
const reject = (state: CombatState, action: {type: string}, reason: string) => response(copy(state), action, false, reason);
export function validatePlacement(state: CombatState, cat: CombatCatState, x: number, y: number, allowSwap: boolean) {
  if (!inGrid(x, y)) return '请放在 3 行 × 7 列战斗区的完整格子内。';
  if (x === CONFIG.GOAL_X && y === CONFIG.GOAL_Y) return 'B1 是喵喵的固定指挥格与敌人终点，不能部署、移动或交换战斗猫。';
  if (isSpawnCell(x, y)) return 'B7 是黑影出怪口，不能部署、移动或交换战斗猫。';
  const occupiedByEnemy = (cellX: number, cellY: number) => state.enemies.some((enemy) => Math.abs(enemy.y - cellY) < 0.45 && Math.abs(enemy.x - cellX) < 0.45);
  if (occupiedByEnemy(x, y)) return '这个格子正被黑影占据，请换一个位置。';
  const occupant = state.cats.find((item) => item.id !== cat.id && item.status === 'active' && item.x === x && item.y === y);
  if (occupant && (!allowSwap || !occupant.combatant)) return '这个格子已有猫咪，请先选择空格。';
  if (occupant && (isSpawnCell(cat.x, cat.y) || cat.x === CONFIG.GOAL_X && cat.y === CONFIG.GOAL_Y)) return '交换后另一只猫会进入保护终点或出怪口，请先移动到合法空格。';
  if (occupant && occupiedByEnemy(cat.x, cat.y)) return '交换后另一只猫会进入黑影占据的格子，请先移动到合法空格。';
  return null;
}
function releaseInvalidBlocks(state: CombatState) {
  for (const cat of state.cats) cat.blockedCount = 0;
  for (const enemy of state.enemies) {
    const cat = catById(state, enemy.blockedBy);
    if (!cat || !cat.combatant || cat.status !== 'active' || !atContact(enemy, cat)) enemy.blockedBy = null;
    else cat.blockedCount += 1;
  }
}
function isCombatAction(value: Record<string, unknown>): value is Record<string, unknown> & CombatAction {
  switch (value.type) {
    case 'START': case 'PAUSE': case 'BEGIN_SKILL_PRACTICE': case 'CANCEL_SKILL': case 'CLEAR_SKILL_TARGET': case 'CLOSE_INSPECTION': return true;
    case 'SELECT_SKILL': case 'INSPECT_CAT': return typeof value.catId === 'string';
    case 'SET_SPEED': return value.speed === 0.5 || value.speed === 1 || value.speed === 2;
    case 'AIM_SKILL': return typeof value.x === 'number' && typeof value.y === 'number';
    case 'CAST_SKILL': return typeof value.catId === 'string' && (value.x === undefined || typeof value.x === 'number') && (value.y === undefined || typeof value.y === 'number');
    case 'MOVE_CAT': return typeof value.catId === 'string' && typeof value.x === 'number' && typeof value.y === 'number';
    default: return false;
  }
}
export function act(state: CombatState, input: unknown): CombatState {
  if (!validState(state)) return createGame();
  if (!input || typeof input !== 'object' || !('type' in input) || typeof input.type !== 'string') return state;
  const candidate = input as Record<string, unknown>;
  if (!isCombatAction(candidate)) return reject(state, {type: input.type}, '无法识别的战斗操作或参数。');
  const action = candidate;
  if (state.externallyPaused) return reject(state, action, '外部暂停期间不能操作战斗。');
  if (action.type === 'CLOSE_INSPECTION') return state.inspectedCatId === null ? state : {...state, inspectedCatId: null};
  if (action.type === 'SET_SPEED') {
    if (state.phase === 'won' || state.phase === 'failed') return reject(state, action, '战斗已经结束，不能调整速度。');
    return response({...state, playbackSpeed: action.speed}, action, true, `基础速度已设为 ${action.speed} 倍`);
  }
  if (state.skillAim && !['AIM_SKILL', 'CLEAR_SKILL_TARGET', 'CANCEL_SKILL', 'CAST_SKILL', 'PAUSE'].includes(action.type)) return reject(state, action, '正在选择技能区域，请先释放或取消技能。');
  if (action.type === 'INSPECT_CAT') {
    const cat = activeCombatCat(state, action.catId);
    if (!cat || state.phase === 'won' || state.phase === 'failed') return reject(state, action, '当前只能查看战场上可用的战斗猫。');
    return response({...state, inspectedCatId: cat.id as 'caster' | 'guard'}, action, true, `正在查看${cat.name}，运行时使用半速`);
  }
  if (action.type === 'START' && state.phase === 'ready') {
    const next = copy(state); phase(next, 'hero_danger');
    spawn(next, 'scout', 1, { scripted: true, hp: CONFIG.SCRIPT_ENEMY_HP, maxHp: CONFIG.SCRIPT_ENEMY_HP, damage: CONFIG.SCRIPT_ENEMY_DAMAGE, interval: CONFIG.SCRIPT_ENEMY_INTERVAL });
    log(next, '迷路的喵喵遭遇黑影，正在寻找撤离机会。'); return response(next, action, true, '序章开始');
  }
  if (action.type === 'PAUSE' && RUNNING.has(state.phase)) return response({ ...state, paused: !state.paused }, action, true, state.paused ? '继续' : '已暂停');
  if (action.type === 'BEGIN_SKILL_PRACTICE' && state.phase === 'teach_energy' && !state.paused) {
    const next = copy(state);
    phase(next, 'skill_charge'); startWave(next, 1);
    log(next, '真实战斗开始：能量随战斗时间每秒增长 5 点，满 100 后保留。可以继续自由调动猫咪，能量不因移动而丢失。');
    return response(next, action, true, '开始实战，留意黑影与能量条');
  }
  if (action.type === 'CANCEL_SKILL') {
    if (!state.skillAim) return reject(state, action, '当前没有正在选择的技能。');
    return response({...state, skillAim: null}, action, true, '已取消技能，能量保留');
  }
  if (action.type === 'SELECT_SKILL' || action.type === 'AIM_SKILL' || action.type === 'CLEAR_SKILL_TARGET' || action.type === 'CAST_SKILL') {
    if ((state.paused && action.type !== 'CLEAR_SKILL_TARGET')) return reject(state, action, '暂停期间不能释放技能。');
    const id = action.type === 'AIM_SKILL' || action.type === 'CLEAR_SKILL_TARGET' ? state.skillAim?.catId : action.catId;
    const cat = catById(state, id ?? null);
    if (!cat || cat.id === 'hero' || !cat.combatant || cat.status !== 'active' || !inGrid(cat.x, cat.y)) return reject(state, action, '只有战场上的战斗猫可以使用技能。');
    const skill = SKILLS[cat.id];
    if (cat.energy < skill.cost) return reject(state, action, '能量不足，随战斗时间继续自动蓄能。');
    const allowedPhase = state.phase === 'battle' || (state.phase === 'teach_guard_skill' && cat.id === 'guard') || (state.phase === 'teach_caster_skill' && cat.id === 'caster');
    if (!allowedPhase) return reject(state, action, '请按军师提示完成当前步骤后使用技能。');
    if (state.skillAim && state.skillAim.catId !== cat.id) return reject(state, action, '请先完成或取消当前技能选区。');
    if (action.type === 'SELECT_SKILL') {
      if (skill.targeting !== 'area') return reject(state, action, '这个技能无需选择区域。');
      return response({...state, inspectedCatId: null, skillAim: {catId: cat.id, target: null}}, action, true, '全地图均可选择落点，移动鼠标预览整个十字范围；左键释放，右键或 Esc 取消');
    }
    if (action.type === 'CLEAR_SKILL_TARGET') return response({...state, skillAim: {catId: cat.id, target: null}}, action, true, '鼠标已离开有效范围；移回棋盘继续预览，右键或 Esc 取消');
    if (action.type === 'AIM_SKILL') {
      if (!state.skillAim || !isSkillTargetAllowed(cat, action)) return reject(state, action, '请选择地图内的完整格子作为技能落点。');
      return response({...state, skillAim: {catId: cat.id, target: {x: action.x, y: action.y}}}, action, true, '正在预览整个十字范围；左键释放，右键或 Esc 取消');
    }
    const hasCoordinates = action.x !== undefined || action.y !== undefined;
    const target = hasCoordinates ? {x: action.x!, y: action.y!} : state.skillAim?.target;
    if (skill.targeting === 'area' && (!target || !isSkillTargetAllowed(cat, target))) return reject(state, action, '请选择地图内的完整格子作为技能落点。');
    if (skill.targeting === 'self' && hasCoordinates && (action.x !== cat.x || action.y !== cat.y)) return reject(state, action, '罐盖护盾只能作用于斑斑自己。');
    const cells = getSkillCells(cat, target);
    if (state.phase === 'teach_caster_skill' && !state.enemies.some(enemy => enemy.hp > 0 && isEnemyInCells(enemy, cells))) return reject(state, action, '请让十字范围覆盖当前战场上的黑影；高亮只是建议落点。');
    const next = copy(state); const caster = catById(next, cat.id)!;
    caster.energy -= skill.cost; next.skillAim = null; next.inspectedCatId = null;
    if (skill.shield !== undefined) {
      caster.shield = skill.shield; caster.shieldRemaining = skill.duration ?? 0;
      effect(next, `${skill.name} +${skill.shield}`, caster.x, caster.y, 'skill-shield');
    }
    if (skill.damage !== undefined) {
      for (const cell of cells) effect(next, skill.name, cell.x, cell.y, 'skill-area');
      for (const enemy of next.enemies) if (enemy.hp > 0 && isEnemyInCells(enemy, cells)) {
        enemy.hp = Math.max(0, enemy.hp - skill.damage);
        if (enemy.hp === 0 && !enemy.training) { next.defeated += 1; effect(next, '黑影退去', enemy.x, enemy.y, 'defeat'); }
      }
      next.enemies = next.enemies.filter(enemy => enemy.hp > 0);
    }
    log(next, `${cat.name}释放${skill.name}，消耗 ${skill.cost} 能量。`);
    if (state.phase === 'teach_guard_skill') {
      next.tutorialProgress.guardSkill = true; phase(next, 'skill_charge'); advanceLiveTutorial(next);
    }
    else if (state.phase === 'teach_caster_skill') {
      next.tutorialProgress.casterSkill = true; phase(next, 'skill_charge'); advanceLiveTutorial(next);
    }
    releaseInvalidBlocks(next);
    return response(next, action, true, `${skill.name}已释放`);
  }
  if (action.type === 'MOVE_CAT' && ['teach_position', 'teach_move', 'teach_live_move', 'skill_charge', 'battle'].includes(state.phase)) {
    if (state.phase === 'teach_live_move' && state.paused) return reject(state, action, '请先继续战斗，再试着一边观察黑影、一边移动伙伴。');
    const cat = catById(state, action.catId);
    if (state.phase === 'teach_position' && action.catId !== 'caster') return reject(state, action, '先试着移动绒绒：棋盘上的其他合法格都可以，A4 只是推荐。');
    if (state.phase === 'teach_move' && action.catId !== 'guard') return reject(state, action, '这次请亲手调动斑斑，体验战斗中换位；其他合法格都可以。');
    if (!cat?.combatant || cat.status !== 'active') return reject(state, action, '只有战场上的战斗猫可以移动；喵喵留在指挥位。');
    if (cat.x === action.x && cat.y === action.y) return reject(state, action, '请拖到另一个格子。');
    const error = validatePlacement(state, cat, action.x, action.y, true); if (error) return reject(state, action, error);
    const next = copy(state); const moved = catById(next, cat.id)!;
    const occupant = next.cats.find((item) => item.id !== cat.id && item.status === 'active' && item.x === action.x && item.y === action.y);
    if (occupant) Object.assign(occupant, { x: moved.x, y: moved.y }); Object.assign(moved, { x: action.x, y: action.y }); releaseInvalidBlocks(next);
    if (state.phase === 'teach_position') {phase(next, 'teach_energy'); log(next, '站位不是固定的。接下来边守线边自然蓄能，战斗中仍可自由移动。');}
    else if (state.phase === 'teach_move') {phase(next, 'teach_live_move'); log(next, '黑影继续前进，战斗以半速进行。现在再把任意一只伙伴移动到其他合法格，亲手试试边战斗边换位。');}
    else if (state.phase === 'teach_live_move') {next.tutorialProgress.moved = true; phase(next, 'skill_charge'); log(next, '实战换位成功！战斗中随时可移动或交换伙伴，不消耗能量。继续守线并留意自然蓄能。');}
    return response(next, action, true, occupant ? '两只战斗猫已交换位置' : '位置已调整');
  }
  return reject(state, action, '当前步骤不能执行这个操作，请按军师提示完成眼前的教学。');
}
