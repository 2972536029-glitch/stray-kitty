import type {GameState} from '../../contracts';
import type {ParcelPool, ParcelReward} from './types';

export function poolStatus(state:GameState,pool:ParcelPool) {
  const missing=pool.entries.filter(entry=>!state.furniture.includes(entry.furnitureId));
  const progress=state.lottery?.progress[pool.id]??{draws:0,misses:0};
  const guaranteed=missing.length>0&&progress.misses>=pool.pityEvery-1;
  const active=guaranteed?missing:pool.entries,total=active.reduce((sum,entry)=>sum+entry.weight,0);
  return {missing,progress,guaranteed,untilNew:Math.max(1,pool.pityEvery-progress.misses),
    locked:!state.flags.includes(pool.requiredFlag),short:(state.currencies[pool.currency]??0)<pool.cost,
    chance:(id:string)=>(active.find(entry=>entry.furnitureId===id)?.weight??0)/total*100};
}
export function rewardStatus(state:GameState,reward:ParcelReward) {
  const claimed=(reward.kind==='daily'?state.lottery?.dailyClaims:state.lottery?.milestones)?.includes(reward.id)??false;
  const locked=!!reward.requiredFlag&&!state.flags.includes(reward.requiredFlag);
  const furnished=Object.entries(state.placements).some(([,id])=>!state.homeLayout?.['furniture:'+id]?.stored)||Object.entries(state.homeLayout??{}).some(([key,p])=>key.startsWith('furniture:')&&!p.stored);
  const wish=reward.condition==='furnished'&&!furnished;
  return {claimed,locked,wish};
}
