import type {Catalog,GameCommand,GameState} from '../contracts';
import {useEffect} from 'react';
import {trackRechargeEntryExpose, trackRechargeEntryClick} from '../observability/actions';
import Modal from './Modal';
import ParcelRewards from '../modules/lottery/ParcelRewards';

export default function ShopPanel({state,catalog,disabled,error,onCommand,onRefresh,onRetry,onClose,onRecharge,onParcels}:{state:GameState;catalog:Catalog;disabled:boolean;error:string;onCommand:(command:GameCommand)=>Promise<boolean>;onRefresh:()=>Promise<void>;onRetry:()=>void;onClose:()=>void;onRecharge:()=>void;onParcels:()=>void}){
  useEffect(() => {trackRechargeEntryExpose('shop');}, []);
  return <Modal title="猫咪补给站" onClose={onClose} className="cat-shop">
    <header><div><span className="eyebrow">LITTLE EVERYDAY GIFTS</span><h2>猫咪补给站</h2><p>收下来信，完成伙伴的小心愿，为家攒下一点喜欢。</p></div><div className="shop-wallets">
      <div className="shop-wallet">✦ <b data-testid="shop-stamps">{state.currencies.stamp??0}</b><small>猫爪邮票</small></div>
      <button className="shop-wallet tuna" onClick={() => {trackRechargeEntryClick('shop');onRecharge();}} aria-label="金枪鱼罐头，点击充值">🥫 <b>{state.currencies.tuna??0}</b><small>金枪鱼罐头 · 充值</small></button>
    </div></header>
    {state.phase!=='home'&&<p className="shop-notice">回到花房后，就可以签收来信与猫咪心愿。</p>}
    <ParcelRewards state={state} catalog={catalog} disabled={disabled} onCommand={onCommand} onRefresh={onRefresh}/>
    <div className="shop-parcel-entry"><div><h3>给家挑一份心意</h3><p>攒下的邮票可以签收「苔叶来信」，金枪鱼罐头可以签收「月海观星」。</p></div><button disabled={disabled} onClick={onParcels}>去猫爪邮局挑选主题包裹 →</button></div>
    {error&&<div className="shop-notice shop-error" role="alert">{error}<button onClick={onRetry} disabled={disabled}>重试上次操作</button></div>}
    <footer>主题家具在猫爪邮局签收。金枪鱼补给目前使用模拟支付。</footer>
  </Modal>;
}
