import {CONFIG} from './config.ts';
import type {CombatState} from './state.ts';
import type {BasicSupplyId, BattleSupplyUsage} from './types.ts';

/** L00 teaching supplies are spent first; later chapters must not reuse this free baseline.
 * Teaching and checkpoint rewinds never mint warehouse items. */
export function getBattleSupplyUsage(state: CombatState): BattleSupplyUsage {
  const usedExtras: BattleSupplyUsage['usedExtras'] = {'warm-can': 0, 'bouncy-treat': 0};
  if (state.wave === 0) return {usedExtras};
  const free: Record<BasicSupplyId, number> = {'warm-can': CONFIG.MEDICINE_COUNT, 'bouncy-treat': CONFIG.ENERGY_ITEM_COUNT};
  for (const id of Object.keys(free) as BasicSupplyId[]) {
    const extra = Math.max(0, state.initialInventory[id] - free[id]);
    usedExtras[id] = Math.min(extra, Math.max(0, state.initialInventory[id] - state.inventory[id] - free[id]));
  }
  return {usedExtras};
}
