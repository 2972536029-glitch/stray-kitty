import './unit-meters.css';
import './unit-labels.css';

interface HealthState {hp:number;maxHp:number;shield:number;shieldRemaining:number}
interface EnergyState {id:string;name:string;energy:number}

export function CatHealth({cat}:{cat:HealthState}){
  const capacity=cat.maxHp+Math.max(0,cat.shield),healthWidth=Math.max(0,cat.hp/capacity)*100;
  return <span className="btl-health" aria-label={`体力 ${Math.ceil(cat.hp)} / ${cat.maxHp}${cat.shield>0?`，额外护盾 ${Math.ceil(cat.shield)}，剩余 ${Math.ceil(cat.shieldRemaining)} 秒`:''}`}><i style={{width:`${healthWidth}%`}}/>{cat.shield>0&&<b style={{left:`${cat.maxHp/capacity*100}%`,width:`${cat.shield/capacity*100}%`}}/>}</span>;
}
export function CatEnergy({cat,compact=false,maxEnergy=100,testId,blocked=false}:{cat:EnergyState;compact?:boolean;maxEnergy?:number;testId?:string;blocked?:boolean}){
  const ready=cat.energy>=maxEnergy;
  return <span className={`btl-energy${compact?' btl-energy-compact':''}${ready?' btl-energy-ready':''}${blocked?' btl-energy-blocked':''}`} role="meter" aria-label={`${cat.name}能量`} aria-valuemin={0} aria-valuemax={maxEnergy} aria-valuenow={cat.energy} data-testid={testId??`battle-energy-${cat.id}${compact?'-compact':''}`} data-charging-blocked={blocked||undefined}><i style={{width:`${Math.min(100,cat.energy/maxEnergy*100)}%`}}/>{!compact&&<span>{ready?'能量已满':`能量 ${Math.floor(cat.energy)} / ${maxEnergy}`}</span>}</span>;
}

/** Presentation-only meters shared by board units; combat values remain owned by each engine. */
export function UnitMeters({cat,prefix,energyBlocked=false}:{cat:HealthState & {id:string;name:string;energy?:number};prefix:string;energyBlocked?:boolean}){
  return <span className="btl-unit-meters" data-testid={`${prefix}-meters-${cat.id}`}><CatHealth cat={cat}/>{cat.energy!==undefined&&<CatEnergy cat={{id:cat.id,name:cat.name,energy:cat.energy}} compact blocked={energyBlocked} testId={`${prefix}-energy-${cat.id}-compact`}/>}</span>;
}
