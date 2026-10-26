import {CAT_DEFINITIONS, CELLS, MAP, SKILLS} from '../../web/src/modules/battle/chapter/config.ts';
import {advanceChapter, createChapterBattle, dispatchChapter, getBossCells, getDeployError, getSkillCells, isPlayableCell} from '../../web/src/modules/battle/chapter/engine.ts';
import type {BattleDifficulty, ChapterAction, ChapterCatId, ChapterState, Position, Supplies} from '../../web/src/modules/battle/chapter/types.ts';

/** A deterministic player: observe once a second, move away from locked slam cells,
 * then restore the formation when cells are clear and use one ready skill per observation.
 * Only dispatches actions available to the UI; it never writes health, wave or inventory state.
 */
export function playChapter(difficulty: BattleDifficulty, options: {loadout?: Partial<Supplies>; dodge?: boolean; skills?: boolean; limit?: number; onSnapshot?: (state: ChapterState) => void} = {}) {
  let state = dispatchChapter(createChapterBattle({difficulty, loadout: options.loadout}), {type: 'START'});
  let observeAt = 0;
  const readySince = new Map<ChapterCatId, number>();
  const actions: {time: number; action: ChapterAction}[] = [];
  function act(action: ChapterAction) {
    const next = dispatchChapter(state, action);
    if (next.lastAction?.ok !== false) actions.push({time: state.elapsed, action});
    state = next;
  }
  function chooseTarget(catId: ChapterCatId): Position {
    const cat = state.cats.find(cat => cat.id === catId)!;
    const enemies = [...state.enemies, ...(state.boss.phase === 'defeated' ? [] : [state.boss])];
    let target: Position = {...MAP.boss}, best = -1;
    for (const cell of CELLS.filter(isPlayableCell)) {
      const cells = getSkillCells(cat, cell);
      const weight = enemies.reduce((sum, enemy) => {
        const footprint = 'width' in enemy ? getBossCells(enemy) : [{x: Math.round(enemy.x), y: Math.round(enemy.y)}];
        return sum + (footprint.some(point => cells.some(c => c.x === point.x && c.y === point.y)) ? Math.min(enemy.hp, SKILLS[catId].damage ?? 0) : 0);
      }, 0);
      if (weight > best) {best = weight; target = cell;}
    }
    return target;
  }
  while (state.phase === 'battle' && state.elapsed < (options.limit ?? 400)) {
    options.onSnapshot?.(state);
    if (state.elapsed + 1e-6 >= observeAt) {
      observeAt = state.elapsed + 1;
      if (options.dodge !== false && state.boss.phase === 'windup' && state.boss.phaseTime >= 0.7) {
        if (state.aim) act({type: 'CANCEL_SKILL'});
        for (const cat of [...state.cats]) {
          if (cat.status !== 'active' || !state.boss.targetCells.some(cell => cell.x === cat.x && cell.y === cat.y)) continue;
          const candidates = CELLS.filter(cell => !state.boss.targetCells.some(danger => danger.x === cell.x && danger.y === cell.y)
            && !state.cats.some(friend => friend.status === 'active' && friend.x === cell.x && friend.y === cell.y)
            && !getDeployError(state, cat.id, cell))
            .sort((a, b) => (Math.abs(a.x - cat.x) + Math.abs(a.y - cat.y)) - (Math.abs(b.x - cat.x) + Math.abs(b.y - cat.y)) || b.x - a.x);
          if (candidates[0]) act({type: 'MOVE_CAT', catId: cat.id, ...candidates[0]});
        }
      } else if (state.boss.phase !== 'windup') {
        for (const cat of [...state.cats]) {
          const desired = CAT_DEFINITIONS[cat.id].initial;
          if ((cat.x !== desired.x || cat.y !== desired.y || cat.status === 'resting') && !getDeployError(state, cat.id, desired)) act({type: 'MOVE_CAT', catId: cat.id, ...desired});
        }
      }
      if (options.skills !== false) {
        for (const cat of state.cats) {
          if (cat.energy === 100 && cat.status === 'active') {if (!readySince.has(cat.id)) readySince.set(cat.id, state.elapsed);}
          else readySince.delete(cat.id);
        }
        const order: ChapterCatId[] = ['singer', 'guard', 'tabby', 'caster', 'hammer', 'frost'];
        for (const id of order) {
          const cat = state.cats.find(cat => cat.id === id)!;
          if (!readySince.has(id) || state.elapsed - readySince.get(id)! < 1) continue;
          if (id === 'singer' && state.cats.reduce((sum, c) => sum + c.maxHp - c.hp, 0) < 40) continue;
          if (SKILLS[id].targeting === 'area') act({type: 'CAST_SKILL', catId: id, target: chooseTarget(id)});
          else act({type: 'CAST_SKILL', catId: id});
          readySince.delete(id); break;
        }
      }
    }
    state = advanceChapter(state, 0.1);
  }
  return {state, actions};
}
