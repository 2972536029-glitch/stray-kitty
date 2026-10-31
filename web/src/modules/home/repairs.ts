import type {Catalog,GameState,HomeRepairPart} from '../../contracts';

export function currentHomeRenovation(state:GameState,catalog:Catalog){
  if(state.flags.includes('kingdom_founded')||state.flags.includes('finale_completed'))return undefined;
  return [...catalog.renovations??[]].sort((a,b)=>a.stage-b.stage).find(r=>!state.flags.includes(r.grantsFlag));
}
export function repairBalance(state:GameState,key:string){return (key==='material'?state.inventory:state.currencies)[key]??0;}
export function repairRequirements(state:GameState,part:HomeRepairPart){
  const missing=(part.requires??[]).filter(id=>!state.homeRepairs?.includes(id));
  return {missing,affordable:Object.entries(part.cost).every(([key,n])=>repairBalance(state,key)>=n)};
}
export const REPAIR_COST_LABELS:Record<string,string>={material:'◆ 修缮材料',stamp:'✦ 猫爪邮票',tuna:'金枪鱼罐头'};
