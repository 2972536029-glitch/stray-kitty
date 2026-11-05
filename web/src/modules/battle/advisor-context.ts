import {buildAdvisorContext, getAdvice} from './l00/advisor';
import {CONFIG, COMMANDER_POSITION, SPAWN_POINTS, SKILLS as L00_SKILLS, ENEMY_TYPES} from './l00/config';
import type {CombatState} from './l00/state';
import type {ChapterState} from './chapter/types';
import type {MarketState} from './market/types';
import type {GreenhouseState} from './greenhouse/types';
import type {TunnelState} from './tunnel/types';
import type {FinaleState} from './finale/types';
import {MAP as CHAPTER_MAP, CELLS as CHAPTER_CELLS, RULES as CHAPTER_RULES, SKILLS as CHAPTER_SKILLS} from './chapter/config';
import {MAP as MARKET_MAP, CELLS as MARKET_CELLS, RULES as MARKET_RULES, SKILLS as MARKET_SKILLS} from './market/config';
import {MAP as GREENHOUSE_MAP, CELLS as GREENHOUSE_CELLS, RULES as GREENHOUSE_RULES, SKILLS as GREENHOUSE_SKILLS} from './greenhouse/config';
import {MAP as TUNNEL_MAP, CELLS as TUNNEL_CELLS, RULES as TUNNEL_RULES, SKILLS as TUNNEL_SKILLS} from './tunnel/config';
import {MAP as FINALE_MAP, CELLS as FINALE_CELLS, RULES as FINALE_RULES, SKILLS as FINALE_SKILLS, ALLY_DEFINITIONS} from './finale/config';
import {getAttackCells as chapterAttackCells, isDeployableCell as chapterDeployable} from './chapter/engine';
import {getAttackCells as marketAttackCells, isDeployableCell as marketDeployable} from './market/engine';
import {getAttackCells as greenhouseAttackCells, isDeployableCell as greenhouseDeployable} from './greenhouse/engine';
import {getAttackCells as tunnelAttackCells, isDeployableCell as tunnelDeployable, isDarkened, isEnemyVisible} from './tunnel/engine';
import {getAttackCells as finaleAttackCells, isDeployableCell as finaleDeployable, getBossDamageMultiplier} from './finale/engine';
import {carryDescription} from './CarryPanel';
import {getCarryPatrol, type BattleCarryId, type BattleCarryState} from './carry';

export type ModelAdvisorState = CombatState | ChapterState | MarketState | GreenhouseState | TunnelState | FinaleState;
type ChapterBattleState = Exclude<ModelAdvisorState, CombatState>;
interface Position {x: number; y: number}
interface Skill {name: string; cost: number; targeting: string; description: string}
interface Board {
  columns: number; rows: number; goal: Position;
  spawns: readonly Position[]; obstacles: readonly Position[]; bossCells: readonly Position[];
}
interface ChapterSpec<S extends ChapterBattleState> {
  title: string; map: Board; cells: readonly Position[];
  skills: Readonly<Record<string, Skill>>;
  attackCells: (cat: S['cats'][number]) => Position[];
  deployable: (position: Position, state: Pick<S, 'boss'>) => boolean;
  energyPerSecond: number; warningSeconds: number; bossRule: string;
}

const MAX_CHARACTERS = 24_000;
const MAX_VISIBLE_ENEMIES = 48;
const CARRY_NAMES: Record<BattleCarryId, string> = {
  lantern: '小灯', mirror: '镜片', bell: '铃铛', box: '纸箱', dog: '老黄大狗', dove: '咕咕鸽子',
  rats: '鼠群小队', kitten: '获救小猫',
};
const number = (value: number) => Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
const label = (value: string, limit = 80) => value.slice(0, limit);
// Moving enemies use the same nearest-cell rounding as engine hit tests.
const cell = ({x, y}: Position) => Number.isFinite(x) && Number.isFinite(y)
  ? `${String.fromCharCode(65 + Math.round(y))}${Math.round(x) + 1}` : '未知';
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
const cellsText = (positions: readonly Position[]) => positions.map(cell).join('、');
const knownCells = (positions: readonly Position[], board: readonly Position[]) =>
  board.filter(candidate => positions.some(position => same(candidate, position)));

function keyFacts(cats: readonly {name: string; status: string}[], leaks: number, maxLeaks: number) {
  const active = cats.filter(cat => cat.status === 'active');
  const current = number(leaks), threshold = number(maxLeaks);
  const untilFailure = Math.max(0, threshold - current);
  return {
    当前主力: `在场可操作主力共${active.length}只：${active.length ? active.map(cat => label(cat.name)).join('、') : '无'}。这个完整名单不含主角喵喵、顾问阿策、固定援军或已经退场的猫。`,
    突破判定: `当前已突破${current}次；累计达到${threshold}次即因突破失败。${untilFailure > 0
      ? `还可容许${Math.max(0, untilFailure - 1)}次新突破而不触发突破失败；再发生${untilFailure}次新突破就会达到失败阈值。`
      : '当前已达到突破失败阈值，不能再容许突破。'}`,
  };
}

const COMMON_RULES = {
  主角与顾问: '喵喵是需要保护的主角和防线终点，全程不攻击、不阻挡、不蓄能，不占战斗猫名额。阿策只提供建议，不替玩家移动或施法。',
  退场: '战斗猫体力归零后本场退场，不再攻击、阻挡、蓄能或受伤；不能移动、施法、治疗复活或重新部署。没有休整系统。',
  技能: '技能消耗100能量，由玩家手动释放；没有技能冷却。普攻不额外增加能量，满100会保留。护盾先承伤，不恢复体力；护盾叠加取较大盾值和较长时长。',
  阻挡: '在场战斗猫按阻挡容量拦住接触的普通黑影，超出容量的敌人继续前进。移动不会把已经越过防线的黑影传送回来。',
  敌人处理: '普通黑影被击退或已经突破都算处理完成。突破未达到失败阈值时仍可能胜利，不要求零突破或击杀每一只普通黑影；有首领的章节仍须真正击败本章首领及要求的精英。',
  移动: '拖动仍在场的猫到地图候选部署格。目标格有敌人时不可进入；同伴占格可交换，但原位置有敌人时不可把同伴换入。交换保留体力、能量、护盾和普攻间隔。',
  技能操作: '点猫查看技能，再选择技能；范围技能需要选择落点并确认，自身或全队技能无需选落点。右键或Esc取消瞄准，不扣能量。外部面板暂停时先关闭面板。',
  时间: '数值中的秒都是战斗模拟时间。暂停停止战斗和蓄能；查看猫咪临时半速，瞄准恢复1倍，暂停优先。',
  道具: '没有背包、可购买补给、道具消耗或战斗奖励库存。第一章以后可接收事件带来的单件正向携带效果，以当前携带说明为准。',
  信息边界: '这份快照只包含当前公开信息。不能据此推断未出现敌人的数量、出场顺序或时间；没有提供下一波敌情。坐标字母是行，数字是列，移动敌人的坐标取最近地格。',
};

function mapContext(map: Board, cells: readonly Position[], deployable: (position: Position) => boolean) {
  return {
    外接矩形: `${map.columns}列×${map.rows}行`,
    实际存在地格: cellsText(cells),
    边界: '只有列出的地格存在，矩形内未列出的部分是缺口，不能部署、移动或作为技能落点。',
    障碍格: cellsText(map.obstacles), 出怪口: cellsText(map.spawns), 保护点: cell(map.goal),
    首领占格: cellsText(map.bossCells), 候选部署格: cellsText(cells.filter(deployable)),
    部署说明: '候选部署格仅表示地形允许，仍需避开敌人占格；不是对当前每格安全性的保证。',
  };
}

function carryContext(carry: BattleCarryState) {
  if (!carry.id) return {携带: '无有效事件携带效果'};
  const patrol = carry.id === 'rats' ? getCarryPatrol(carry) : null;
  return {
    携带: carry.id,
    名称: CARRY_NAMES[carry.id],
    效果: carryDescription(carry),
    ...(carry.id === 'mirror' || carry.id === 'bell' ? {已使用: carry.used} : {}),
    ...(carry.id === 'mirror' ? {小怪停滞剩余秒: number(carry.freezeRemaining)} : {}),
    ...(carry.id === 'box' ? {首波效果进行中: carry.boxActive} : {}),
    ...(carry.id === 'lantern' ? {已触发次数: number(carry.pulses)} : {}),
    ...(patrol ? {当前轮巡入口: cell(patrol.anchor), 换路剩余秒: number(8 - carry.elapsed % 8)} : {}),
    ...(carry.id === 'kitten' ? {最近补能波次: number(carry.kittenWave)} : {}),
    ...(carry.id === 'dove' ? {预告边界: '鸽子预告可在战斗界面查看；模型快照不传递任何未来波表，不能编造预告。'} : {}),
  };
}

function buildChapter<S extends ChapterBattleState>(stageId: string, state: S, spec: ChapterSpec<S>) {
  // Do not use enemy counts, logs or summaries before this visibility filter.
  const visible = state.stageId === 'tunnel_boss'
    ? (state as TunnelState).enemies.filter(enemy => isEnemyVisible(state as TunnelState, enemy))
    : state.enemies;
  const warning = state.boss.phase === 'windup';
  const mainCats = state.cats.filter(cat => Object.hasOwn(spec.skills, cat.id)).slice(0, 6);
  return {
    关键事实: keyFacts(mainCats, state.leaks, state.maxLeaks),
    关卡: {入口: stageId, 名称: spec.title},
    当前: {
      阶段: state.phase, 难度: state.difficulty, 波次: number(state.wave), 总波数: number(state.totalWaves),
      已突破: number(state.leaks), 失败突破数: number(state.maxLeaks),
      已暂停: state.paused || state.externallyPaused || state.uiPaused,
      已瞄准猫: state.aim?.catId ?? null,
      当前瞄准格: state.aim?.target ? cell(state.aim.target) : null,
    },
    地图: mapContext({...spec.map, bossCells: state.boss.phase === 'defeated' ? [] : spec.map.bossCells}, spec.cells,
      position => spec.deployable(position, state)),
    规则: {...COMMON_RULES,
      能量: `仍在场的主力每模拟秒自动增加${spec.energyPerSecond}能量，上限100；封能期间暂停增长，已满能仍可释放。`,
      胜利: state.stageId === 'finale_boss' ? '守完全部波次、处理全部普通黑影，并击败永夜之王和两名精英。' : '守完全部波次、处理全部普通黑影，并击败本章首领。',
      失败: `累计突破达到${state.maxLeaks}次，或全部主力退场即失败；固定援军存活也不能抵消主力全退场。`,
      首领机制: spec.bossRule,
      首领退场: '首领被击退后，原占格立即成为候选部署格；仍须避开敌人占格，战斗结束后不能继续移动。',
    },
    主力: mainCats.map(cat => ({
      编号: cat.id, 名称: label(cat.name), 职责: label(cat.role),
      状态: cat.status === 'retired' ? '已退场' : '在场', 位置: cat.status === 'active' ? cell(cat) : null,
      体力: number(cat.hp), 体力上限: number(cat.maxHp),
      能量: number(cat.energy), 技能已蓄满: cat.status === 'active' && cat.energy >= spec.skills[cat.id].cost,
      护盾: number(cat.shield), 护盾剩余秒: number(cat.shieldRemaining),
      ...( 'energyBlockedRemaining' in cat ? {封能剩余秒: number(cat.energyBlockedRemaining)} : {}),
      ...( 'attackBuffRemaining' in cat ? {普攻强化剩余秒: number(cat.attackBuffRemaining)} : {}),
      普攻伤害: number(cat.damage), 普攻间隔秒: number(cat.interval),
      阻挡容量: number(cat.block), 当前阻挡数: number(cat.blockedCount),
      当前普攻覆盖格: cellsText(knownCells(spec.attackCells(cat), spec.cells)),
      技能: {名称: spec.skills[cat.id].name, 消耗能量: spec.skills[cat.id].cost,
        选取方式: spec.skills[cat.id].targeting, 说明: spec.skills[cat.id].description},
    })),
    首领: {
      名称: label(state.boss.name), 体力: number(state.boss.hp), 体力上限: number(state.boss.maxHp),
      状态: state.boss.phase,
      当前预警: warning ? {
        危险格: cellsText(knownCells(state.boss.targetCells, spec.cells)),
        剩余秒: number(Math.max(0, spec.warningSeconds - state.boss.phaseTime)),
        应对: state.stageId === 'tunnel_boss'
          ? '全场脉冲，不能靠换位躲过；可用护盾承伤，墨墨夜视恢复视野。'
          : '这是当前已经锁定的危险格，预警后不会追踪新站位；可拖到危险格外的候选部署格，注意敌人占格与阻挡路线。',
      } : null,
    },
    事件携带: carryContext(state.carry),
    可见普通敌人数: visible.length,
    可见普通敌人: visible.slice(0, MAX_VISIBLE_ENEMIES).map(enemy => ({
      编号: label(enemy.id), 名称: label(enemy.name), 所在格: cell(enemy),
      体力: number(enemy.hp), 体力上限: number(enemy.maxHp), 被谁阻挡: enemy.blockedBy,
      ...( 'slowRemaining' in enemy ? {技能减速剩余秒: number(enemy.slowRemaining), 技能移速倍率: number(enemy.slowMultiplier)} : {}),
    })),
    省略可见敌人明细数: Math.max(0, visible.length - MAX_VISIBLE_ENEMIES),
  };
}

function buildL00(state: CombatState) {
  const visible = buildAdvisorContext(state);
  const cells = Array.from({length: CONFIG.COLUMNS * CONFIG.ROWS}, (_, i) => ({x: i % CONFIG.COLUMNS, y: Math.floor(i / CONFIG.COLUMNS)}));
  const mainCats = visible.cats.filter(cat => cat.combatant).slice(0, 2);
  return {
    关键事实: keyFacts(mainCats, visible.leaks, visible.maxLeaks),
    关卡: {入口: 'l00_tutorial', 名称: '序章·教学战'},
    当前: {阶段: visible.phase, 教学步骤: visible.tutorialStep, 难度: visible.difficulty,
      波次: number(visible.wave), 总波数: number(visible.totalWaves), 已突破: number(visible.leaks),
      失败突破数: number(visible.maxLeaks), 已暂停: state.paused || state.externallyPaused,
      当前指引: state.phase === 'battle' ? null : label(getAdvice(state).text, 500)},
    地图: mapContext({columns: CONFIG.COLUMNS, rows: CONFIG.ROWS, goal: COMMANDER_POSITION,
      spawns: SPAWN_POINTS, obstacles: [], bossCells: []}, cells,
    position => !same(position, COMMANDER_POSITION) && !SPAWN_POINTS.some(spawn => same(spawn, position))),
    规则: {...COMMON_RULES,
      能量: `教学要求开始蓄能练习后，在场战斗猫每秒增加${CONFIG.ENERGY_PER_SECOND}能量，上限${CONFIG.MAX_ENERGY}；满能后按教程手动施法。`,
      主角开场: '开场喵喵暂在B4，受伤后撤至B1，绒绒、斑斑和阿策来救场。主角不参与攻击、阻挡或蓄能。',
      胜利: `完成教学并守完${CONFIG.TOTAL_WAVES}波，处理全部黑影。没有首领。`,
      失败: `正式守线中累计突破达到${CONFIG.MAX_LEAKS}次，或所有战斗猫退场即失败。`,
      技能落点: '绒绒范围技能可选全部21个地图格为十字中心，包括B1和B7；斑斑技能只作用自身。',
      道具: '序章不启用任何事件携带物、战斗背包或补给奖励。',
    },
    主力: mainCats.map(cat => {
      const skill = L00_SKILLS[cat.id as 'caster' | 'guard'];
      return {
        编号: cat.id, 名称: label(cat.name), 职责: label(cat.role), 状态: cat.status === 'retired' ? '已退场' : '在场',
        位置: cat.status === 'active' ? cell(cat) : null, 体力: number(cat.hp), 体力上限: number(cat.maxHp),
        能量: number(cat.energy), 技能已蓄满: cat.status === 'active' && cat.energy >= skill.cost,
        护盾: number(cat.shield), 护盾剩余秒: number(cat.shieldRemaining),
        普攻伤害: number(cat.damage), 普攻间隔秒: number(cat.interval), 阻挡容量: number(cat.block), 当前阻挡数: number(cat.blockedCount),
        当前普攻覆盖格: cellsText(knownCells(cat.attackCells, cells)),
        技能: {名称: skill.name, 消耗能量: skill.cost, 选取方式: skill.targeting,
          说明: cat.id === 'caster' ? `任意地图格为中心的五格十字，每名敌人受到${skill.damage}伤害。`
            : `自身获得${skill.shield}护盾，持续${skill.duration}秒；不叠加、不治疗。`},
      };
    }),
    主角: visible.cats.filter(cat => cat.id === 'hero').slice(0, 1).map(cat => ({名称: '喵喵', 位置: cell(cat), 体力: number(cat.hp), 体力上限: number(cat.maxHp)})),
    可见普通敌人数: visible.visibleEnemies.length,
    可见普通敌人: visible.visibleEnemies.slice(0, MAX_VISIBLE_ENEMIES).map(enemy => ({
      编号: label(enemy.id), 名称: ENEMY_TYPES[enemy.type].name, 所在格: cell(enemy),
      体力: number(enemy.hp), 体力上限: number(enemy.maxHp), 被谁阻挡: enemy.blockedBy,
    })),
    省略可见敌人明细数: Math.max(0, visible.visibleEnemies.length - MAX_VISIBLE_ENEMIES),
  };
}

/** Serialize a whitelist, never the original state, config, logs, tokens or future wave tables. */
export function buildModelAdvisorContext(stageId: string, state: ModelAdvisorState): string {
  if (stageId === 'l00_tutorial') {
    if (!('version' in state) || state.version !== 2) throw new Error('序章战斗快照与入口不匹配。');
    return boundedJSON(buildL00(state));
  }
  const engineStage = stageId === 'alley_rescue' ? 'alley_boss' : stageId;
  if ('version' in state || state.stageId !== engineStage) throw new Error('战斗快照与章节入口不匹配。');
  switch (state.stageId) {
    case 'alley_boss': return boundedJSON(buildChapter(stageId, state, {
      title: '第一章·小巷救援', map: CHAPTER_MAP, cells: CHAPTER_CELLS, skills: CHAPTER_SKILLS,
      attackCells: chapterAttackCells, deployable: chapterDeployable, energyPerSecond: CHAPTER_RULES.energyPerSecond,
      warningSeconds: CHAPTER_RULES.bossSlamWindup,
      bossRule: `路障首领占2×2格，共用血条；十字重砸预警${CHAPTER_RULES.bossSlamWindup}秒，命中造成${CHAPTER_RULES.bossSlamDamage}伤害，锁定后可换位躲开。`,
    }));
    case 'market_boss': return boundedJSON(buildChapter(stageId, state, {
      title: '第二章·午夜集市', map: MARKET_MAP, cells: MARKET_CELLS, skills: MARKET_SKILLS,
      attackCells: marketAttackCells, deployable: marketDeployable, energyPerSecond: MARKET_RULES.energyPerSecond,
      warningSeconds: MARKET_RULES.bossSweepWindup,
      bossRule: `守夜首领占1格，熄灯横扫锁定一行，预警${MARKET_RULES.bossSweepWindup}秒；命中造成${MARKET_RULES.bossSweepDamage}伤害并封能${MARKET_RULES.bossEnergyBlockDuration}秒。封能只停止蓄能，满能技能仍可用；此章不隐藏敌人。`,
    }));
    case 'greenhouse_boss': return boundedJSON({...buildChapter(stageId, state, {
      title: '第三章·废弃花房', map: GREENHOUSE_MAP, cells: GREENHOUSE_CELLS, skills: GREENHOUSE_SKILLS,
      attackCells: greenhouseAttackCells, deployable: greenhouseDeployable, energyPerSecond: GREENHOUSE_RULES.energyPerSecond,
      warningSeconds: GREENHOUSE_RULES.bossSeedWindup,
      bossRule: `荆冠首领占2×2格，锁定至多两名伙伴原位置，预警${GREENHOUSE_RULES.bossSeedWindup}秒后长出荆棘；荆棘持续${GREENHOUSE_RULES.thornDuration}秒，每秒伤害${GREENHOUSE_RULES.thornDamage}。墨墨能清除已落地荆棘，不能取消尚未落地预告。`,
    }), 已生成荆棘: state.hazards.slice(0, GREENHOUSE_CELLS.length).map(hazard => ({位置: cell(hazard), 剩余秒: number(hazard.remaining)}))});
    case 'tunnel_boss': return boundedJSON({...buildChapter(stageId, state, {
      title: '第四章·地下通道', map: TUNNEL_MAP, cells: TUNNEL_CELLS, skills: TUNNEL_SKILLS,
      attackCells: tunnelAttackCells, deployable: tunnelDeployable, energyPerSecond: TUNNEL_RULES.energyPerSecond,
      warningSeconds: TUNNEL_RULES.bossPulseWindup,
      bossRule: `断灯监守占2×2格，全场脉冲预警${TUNNEL_RULES.bossPulseWindup}秒，造成${TUNNEL_RULES.bossPulseDamage}伤害并断灯${TUNNEL_RULES.darknessDuration}秒；不能通过换位躲避。墨墨改为夜视与全员护盾，不清荆棘。A2暗管绕经A1、B1到C2，B2仍是障碍。`,
    }), 视野: {正在断灯: isDarkened(state), 断灯剩余秒: number(state.darknessRemaining), 夜视剩余秒: number(state.nightVisionRemaining),
      规则: '猫咪始终可见。断灯且无夜视时只显示在场猫和保护点附近曼哈顿距离1以内的普通黑影，其余位置、血量和数量未知。猫仍能攻击、阻挡和蓄能，断灯自然结束，不要求墨墨存活才能继续。'}});
    case 'finale_boss': return boundedJSON({...buildChapter(stageId, state, {
      title: '第五章·终极守护', map: FINALE_MAP, cells: FINALE_CELLS, skills: FINALE_SKILLS,
      attackCells: finaleAttackCells, deployable: finaleDeployable, energyPerSecond: FINALE_RULES.energyPerSecond,
      warningSeconds: FINALE_RULES.bossSkillWindup,
      bossRule: `永夜之王占3×3格，共用血条，同一次范围攻击只伤害一次。半血进入第二阶段；裂影横扫伤害${FINALE_RULES.bossSweepDamage}，王冠坠击伤害${FINALE_RULES.bossCrownDamage}，均预警${FINALE_RULES.bossSkillWindup}秒并锁定危险格。击败影甲卫永久解除影幕，墨墨夜视可暂时破幕；本章没有断灯。`,
    }), 终章机制: {
      首领阶段: state.boss.tierPhase,
      当前预警技能: state.boss.phase === 'windup' ? state.boss.skill === 'crown' ? '王冠坠击' : '裂影横扫' : null,
      首领当前承伤倍率: number(getBossDamageMultiplier(state)), 夜视剩余秒: number(state.nightVisionRemaining),
      光路阶段: state.lightStage, 聚光车位置: cell(FINALE_MAP.lightWaypoints[state.lightStage]),
      光路说明: '第3、5、7波开始时推进光路，无需消耗道具，削弱影幕；仍须完成胜利条件。',
      固定支援席位: cellsText(ALLY_DEFINITIONS),
      精英: state.elites.slice(0, 2).map(elite => ({名称: label(elite.name), 位置: cell(elite), 状态: elite.status,
        体力: number(elite.hp), 体力上限: number(elite.maxHp),
        作用: elite.id === 'armor-guard' ? '守护首领影幕' : '鼓舞普通黑影，击败可减轻守线压力'})),
      援军: ALLY_DEFINITIONS.map(definition => {
        const ally = state.allies.find(candidate => candidate.id === definition.id);
        const publicRule = {名称: definition.name, 公开加入波次: definition.arriveWave, 能力: definition.description};
        if (!ally || ally.status === 'waiting') return {...publicRule, 状态: '尚未入场'};
        return {...publicRule, 状态: ally.status === 'active' ? '在场' : '已退场',
          位置: ally.status === 'active' ? cell(ally) : null, 体力: number(ally.hp), 体力上限: number(ally.maxHp),
          护盾: number(ally.shield), 护盾剩余秒: number(ally.shieldRemaining)};
      }),
      援军规则: '援军自动战斗、固定站位，不能拖动、交换或手动放技能，不计入六位主力。点点治疗与墨墨护盾覆盖已在场援军，不召来等待援军、不复活退场猫。援军不保证胜利，主力技能仍需玩家操作。',
    }});
    default: throw new Error('当前章节尚不支持模型顾问。');
  }
}

function boundedJSON<T extends {可见普通敌人: unknown[]; 省略可见敌人明细数: number}>(context: T): string {
  let result = JSON.stringify(context, null, 2);
  // Drop only lower-priority visible-enemy details, preserving cats, rules and telegraphs.
  while (result.length > MAX_CHARACTERS && context.可见普通敌人.length) {
    context.可见普通敌人.pop(); context.省略可见敌人明细数++;
    result = JSON.stringify(context, null, 2);
  }
  if (result.length > MAX_CHARACTERS) throw new Error('公开战斗快照超过长度限制。');
  return result;
}
