import type {Catalog,GameCommand,GameState} from '../contracts';
import {useEffect,useState} from 'react';
import {trackRechargeEntryExpose, trackRechargeEntryClick} from '../observability/actions';
import Modal from './Modal';
import ParcelRewards from '../modules/lottery/ParcelRewards';
import PostalCurrencyIcon from '../modules/lottery/PostalCurrencyIcon';
import SupplyInventory from './SupplyInventory';
import './panels.css';

export default function ShopPanel({state,catalog,disabled,retryDisabled,error,onCommand,onRefresh,onRetry,onClose,onRecharge,onParcels}:{state:GameState;catalog:Catalog;disabled:boolean;retryDisabled?:boolean;error:string;onCommand:(command:GameCommand)=>Promise<boolean>;onRefresh:()=>Promise<void>;onRetry:()=>void;onClose:()=>void;onRecharge:()=>void;onParcels:()=>void}){
  useEffect(() => {trackRechargeEntryExpose('shop');}, []);
  const [tab,setTab]=useState<'rewards'|'inventory'>('rewards');
  return <Modal title="猫咪补给站" onClose={onClose} className="cat-shop supply-panel">
    <header className="supply-header"><h2>猫咪补给站</h2></header>
    <div className="supply-toolbar"><nav className="panel-tabs" aria-label="补给分类">{[['rewards','领取补给'],['inventory','随身物资']].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id as typeof tab)}>{label}</button>)}</nav><div className="shop-wallets" aria-label="邮票和罐头余额">
      <div className="shop-wallet"><PostalCurrencyIcon currency="stamp"/><span>邮票</span><b data-testid="shop-stamps">{state.currencies.stamp??0}</b></div>
      <button className="shop-wallet tuna" onClick={() => {trackRechargeEntryClick('shop');onRecharge();}} aria-label={`罐头 ${state.currencies.tuna??0}，前往补给小站`}><PostalCurrencyIcon currency="tuna"/><span>罐头</span><b>{state.currencies.tuna??0}</b><small aria-hidden="true">＋</small></button>
    </div></div>
    <div className="supply-body">{tab==='rewards'?<>
      {state.phase!=='home'&&<p className="shop-notice">回到花房后可领取补给。</p>}
      <ParcelRewards state={state} catalog={catalog} disabled={disabled} onCommand={onCommand} onRefresh={onRefresh}/>
    </>:<SupplyInventory state={state}/>}</div>
    <div className="shop-parcel-entry"><h3>主题家具</h3><button disabled={disabled} onClick={onParcels}>打开猫爪邮局 →</button></div>
    {error&&<div className="shop-notice shop-error" role="alert">{error}<button onClick={onRetry} disabled={retryDisabled??disabled}>重试上次操作</button></div>}
  </Modal>;
}
