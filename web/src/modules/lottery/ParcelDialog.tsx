import {useEffect,useRef,useState} from 'react';
import type {Catalog,GameCommand,GameState} from '../../contracts';
import type {ParcelDraw} from './types';
import Modal from '../../ui/Modal';
import {playSound} from '../../ui/soundEffects';
import {FurnitureArt,ThemePreview} from './ParcelArt';
import {poolStatus} from './model';
import CapsuleMachine,{type CapsulePhase} from './CapsuleMachine';
import CapsuleCollection,{catNames} from './CapsuleCollection';
import './parcels.css';
import './capsules.css';

interface Props {
  state:GameState;catalog:Catalog;disabled:boolean;retryDisabled:boolean;error:string;
  initialPool?:string;onPool:(id:string)=>void;onCommand:(command:GameCommand)=>Promise<boolean>;
  onRetry:()=>void;onClose:()=>void;onRecharge:()=>void;onPlace:(id:string,slot:string)=>Promise<boolean>;
}
type Sheet='collection'|'history'|'rules'|null;
export default function ParcelDialog({state,catalog,disabled,retryDisabled,error,initialPool,onPool,onCommand,onRetry,onClose,onRecharge,onPlace}:Props){
  const [selected,setSelected]=useState(initialPool??catalog.pools[0]?.id),[sheet,setSheet]=useState<Sheet>(null);
  const pool=catalog.pools.find(p=>p.id===selected)??catalog.pools[0],premium=pool.currency==='tuna',status=poolStatus(state,pool),atHome=state.phase==='home';
  const [phase,setPhase]=useState<CapsulePhase>('idle'),[result,setResult]=useState<ParcelDraw|null>(null);
  const pending=useRef(false),lastDraw=useRef(state.lastResult.draw?.id),locked=useRef(false),started=useRef(0);
  const draw=state.lastResult.draw,opening=phase==='turning'||phase==='dropping'||phase==='opening',busy=disabled||opening;
  const item=catalog.furniture.find(f=>f.id===result?.furnitureId),owned=pool.entries.length-status.missing.length;
  useEffect(()=>{
    if(!draw||draw.id===lastDraw.current)return;
    lastDraw.current=draw.id;if(!pending.current)return;
    pending.current=false;setResult(draw);setPhase('turning');
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay=reduced?0:Math.max(80,700-(performance.now()-started.current));
    const timers=[window.setTimeout(()=>{setPhase('dropping');playSound('step');},delay),window.setTimeout(()=>{setPhase('opening');playSound('open');},delay+(reduced?50:550)),window.setTimeout(()=>{setPhase('result');playSound(draw.duplicate?'pickup':'chime');},delay+(reduced?100:1150))];
    return()=>timers.forEach(clearTimeout);
  },[draw?.id]);
  const turn=async()=>{
    if(locked.current||busy||status.locked||status.short||!atHome)return;
    locked.current=true;pending.current=true;started.current=performance.now();setResult(null);setPhase('turning');playSound('send');
    try{if(!await onCommand({type:'DRAW_FURNITURE',poolId:pool.id}))setPhase('idle');}
    finally{locked.current=false;}
  };
  const changePool=(id:string)=>{if(busy)return;setSelected(id);onPool(id);setResult(null);setPhase('idle');playSound('open');};
  const readReceipt=(receipt:ParcelDraw)=>{setSelected(receipt.poolId);onPool(receipt.poolId);setResult(receipt);setPhase('result');setSheet(null);};
  const notice=!atHome?'回到花房后，就能转动扭蛋机。':status.locked?'完成点点的救援后开放。':status.short?premium?'罐头还不够，可以去补给小站看看。':'邮票不足，可到猫国商店领取来信与心愿。':premium?'主题装扮 · 每次 60 罐头':'免费邮票 · 每次 1 张';
  return <Modal title="猫爪邮局" onClose={onClose} className={`parcel-dialog gacha-dialog ${premium?'parcel-moon':'parcel-moss'}`}>
    <header className="parcel-header"><div><span className="eyebrow">PAW POST · CAPSULE ATELIER</span><h2>猫爪邮局</h2><p>转一转，把一点喜欢带回家。</p></div><div className="parcel-wallet"><span>✦ <b>{state.currencies.stamp??0}</b> 邮票</span><button disabled={busy} onClick={onRecharge}>🥫 <b>{state.currencies.tuna??0}</b> 罐头 ＋</button></div></header>
    <div className="gacha-toolbar"><span>选一份心意，转进我们的家。</span><nav aria-label="扭蛋资料"><button disabled={busy} onClick={()=>setSheet('collection')}>▦ <span>家具图鉴</span><small>{owned}/{pool.entries.length}</small></button><button disabled={busy} onClick={()=>setSheet('history')}>▤ <span>收据</span></button><button disabled={busy} onClick={()=>setSheet('rules')}>ⓘ <span>规则</span></button></nav></div>
    <div className="gacha-body">
      <aside className="gacha-pool-rail"><span className="gacha-rail-caption">选择扭蛋池</span><div className="parcel-tabs" role="tablist" aria-label="主题扭蛋" aria-orientation="vertical">{catalog.pools.map(p=><button key={p.id} id={`tab-${p.id}`} role="tab" aria-selected={p.id===pool.id} aria-controls="parcel-theme-panel" disabled={busy} onClick={()=>changePool(p.id)}><i aria-hidden="true">{p.currency==='stamp'?'❧':'☾'}</i><span className="gacha-pool-kind">{p.currency==='stamp'?'普通':'限定'}</span><b>{p.theme}</b><small>{p.currency==='stamp'?'✦':'🥫'} {p.cost} / 次</small></button>)}</div><p>把喜欢收进花房，<br/>让伙伴多一个新角落。</p></aside>
      <section id="parcel-theme-panel" className="gacha-main" role="tabpanel" aria-labelledby={`tab-${pool.id}`}>
      <div className="gacha-counter" data-result={phase==='result'}><div className="gacha-machine-label"><span>{premium?'月海观星 · 星光号':'苔叶来信 · 森林号'}</span><small>FURNITURE CAPSULES</small></div><CapsuleMachine premium={premium} phase={phase} disabled={busy||!atHome||status.locked||status.short} onTurn={()=>void turn()}/>
        <section className={`parcel-reveal gacha-result ${phase==='result'?'revealed':'sealed'}`} role="region" aria-label="扭蛋结果" aria-live="polite">
          {phase==='result'&&result&&item?<><div className="parcel-result-art"><FurnitureArt id={item.id} name={item.name} detail/></div><div className="parcel-result-copy"><span className="parcel-edition">{result.duplicate?'熟悉的心意':result.guaranteed?'暖心保底 · 新家具':'新家具到家'}</span><h3>{item.name}</h3><p>{result.duplicate?`已收藏，化作 ${result.material} 份修缮材料。`:`${catNames[item.interactionCat??'']??'伙伴'}在等它的新角落。`}</p><button disabled={disabled||!atHome||!state.furniture.includes(item.id)} onClick={()=>void onPlace(item.id,'')}>布置这件家具 ›</button></div></>:<div className="gacha-waiting"><span aria-hidden="true">{opening?'✧':premium?'☾':'❧'}</span><b>{phase==='turning'?'咔哒咔哒，心意转动中':phase==='dropping'?'咕噜——一颗扭蛋滚下来啦':phase==='opening'?'轻轻打开，看看里面是什么':'每一颗，都装着家的新模样'}</b><small>{opening?'稍等一下，小小的惊喜就要出现了。':'转动把手，也可以点击下方按钮。'}</small></div>}
        </section>
        <button className="parcel-open-button gacha-draw" data-testid="parcel-draw" disabled={busy||!atHome||status.locked||status.short} onClick={()=>void turn()}><span>{opening?'扭蛋转动中…':phase==='result'?'再转一次':'转动一次'}</span><b>{premium?'🥫':'✦'} {pool.cost}</b></button>
        <p className={`gacha-cost-note ${status.short?'short':''}`} role="status">{opening?phase==='turning'?'咔哒咔哒，心意正在转动':phase==='dropping'?'咕噜——一颗扭蛋滚下来啦':'轻轻打开，看看里面是什么':notice}{!opening&&atHome&&!status.locked&&status.short&&premium&&<button disabled={busy} onClick={onRecharge}>去补给小站 ›</button>}</p>
      </div>
      <div className="gacha-showcase"><div className="gacha-theme-heading"><span className="parcel-edition">{premium?'MOONSEA / COLLECTION 02':'MOSS LETTERS / COLLECTION 01'}</span><h3>{pool.theme}</h3><p>{pool.description}</p></div><ThemePreview pool={pool}/><div className="gacha-collection"><div><span>这一套小小的家</span><b>已收藏 {owned} / {pool.entries.length}</b></div><span className="gacha-collection-track" aria-hidden="true"><i style={{width:`${owned/pool.entries.length*100}%`}}/></span><button disabled={busy} onClick={()=>setSheet('collection')}>展开全套图鉴 ›</button></div></div>
      </section>
    </div>
    <footer className="gacha-footer"><p className="parcel-pity" role="status">✦ {status.missing.length===0?'全套已集齐，重复家具将转为修缮材料。':status.guaranteed?'下一颗：必得未拥有家具。':`最多再 ${status.untilNew} 次，必得一件未拥有家具。`}</p><span>十二件成套家具 · 重复转材料 · 猫咪可以互动</span></footer>
    {error&&<div className="parcel-error" role="alert">{error}<button disabled={retryDisabled} onClick={onRetry}>重试上次操作</button></div>}
    {sheet==='collection'&&<CapsuleCollection key={pool.id} state={state} catalog={catalog} pool={pool} onClose={()=>setSheet(null)}/>}
    {sheet==='history'&&<Modal title="扭蛋收据" className="gacha-info-sheet" onClose={()=>setSheet(null)}><header><span className="eyebrow">LITTLE MOMENTS, SAFELY KEPT</span><h2>扭蛋收据 <small>最近 {state.lottery?.history.length??0} 次</small></h2><p>打开已有收据查看结果。</p></header><ol className="gacha-receipts">{[...(state.lottery?.history??[])].reverse().map(receipt=><li key={receipt.id}><div><small>{new Date(receipt.createdAt).toLocaleString('zh-CN')} · {catalog.pools.find(p=>p.id===receipt.poolId)?.theme}</small><b>{catalog.furniture.find(f=>f.id===receipt.furnitureId)?.name??receipt.furnitureId}</b><span>{receipt.duplicate?`重复 → 材料 +${receipt.material}`:receipt.guaranteed?'保底新家具':'新家具'} · {receipt.currency==='tuna'?'🥫':'✦'} {receipt.cost}</span></div><button onClick={()=>readReceipt(receipt)}>查看结果 ›</button></li>)}</ol>{!state.lottery?.history.length&&<p className="gacha-empty">还没有收据，第一颗小惊喜在等你。</p>}</Modal>}
    {sheet==='rules'&&<Modal title="扭蛋规则" className="gacha-info-sheet" onClose={()=>setSheet(null)}><header><span className="eyebrow">A LITTLE LUCK, A LOT OF WARMTH</span><h2>扭蛋规则</h2></header><div className="gacha-rule-copy"><h3>两套主题，各有十二件</h3><p>苔叶来信每次消耗 1 张猫爪邮票；月海观星每次消耗 60 罐金枪鱼。家具仅用于装扮与猫咪互动，不作为通关条件。</p><h3>最多三次，遇见一件新的</h3><p>未集齐时，连续两次没有获得新家具，下一次只在未拥有家具中按原权重抽取。获得新家具后重新计数；两池分别累计，刷新与跨日不重置。当前概率可在家具图鉴查看。</p><h3>熟悉的心意也有用处</h3><p>重复家具转为 2 份修缮材料；集齐后继续抽取也按此补偿。最近 50 次收据可查。来信与猫咪心愿在猫国商店领取，罐头充值目前使用模拟支付。</p></div></Modal>}
  </Modal>;
}
