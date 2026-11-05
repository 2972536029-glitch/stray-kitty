import {useEffect} from 'react';
import type {Catalog,GameCommand,GameState} from '../../contracts';
import {rewardStatus} from './model';
import './parcels.css';

export default function ParcelRewards({state,catalog,disabled,onCommand,onRefresh}:{state:GameState;catalog:Catalog;disabled:boolean;onCommand:(command:GameCommand)=>Promise<boolean>;onRefresh:()=>Promise<void>}){
  useEffect(()=>{
    if(disabled)return;
    const shifted=Date.now()+8*3600000,day=new Date(shifted).toISOString().slice(0,10),midnight=new Date(shifted);midnight.setUTCHours(24,0,0,500);
    const timer=window.setTimeout(()=>void onRefresh(),state.lottery?.day!==day?500:midnight.getTime()-shifted);
    return()=>clearTimeout(timer);
  },[state.lottery?.day,disabled,onRefresh]);
  const locked=disabled||state.phase!=='home'||!state.flags.includes('alley_rescued');
  return <section className="parcel-rewards" aria-label="来信与猫咪心愿"><div className="parcel-section-head"><h3>来信与猫咪心愿</h3><small>每日 00:00（北京时间）换新</small></div><div className="parcel-reward-list">{(catalog.parcelRewards??[]).map(reward=>{
    const r=rewardStatus(state,reward);return <article key={reward.id} className={r.claimed?'claimed':''}><div><span>{reward.kind==='daily'?'每日补给':'旅程奖励'}</span><h4>{reward.name}</h4><p>{reward.description}</p></div><div><b>{reward.stamp>0?`邮票 +${reward.stamp}`:''}{reward.tuna>0?`${reward.stamp>0?' · ':''}罐头 +${reward.tuna}`:''}</b><button data-testid={`claim-${reward.id}`} disabled={locked||r.claimed||r.locked||r.wish} onClick={()=>void onCommand({type:'CLAIM_PARCEL_REWARD',rewardId:reward.id})}>{r.claimed?'已领取':r.locked?'尚未解锁':r.wish?'先布置家具':'领取'}</button></div></article>;
  })}</div></section>;
}
