import {useEffect,useRef,useState} from 'react';
import type {Catalog,GameCommand,GameState} from '../../contracts';
import type {ParcelDraw} from './types';
import Modal from '../../ui/Modal';
import {playSound} from '../../ui/soundEffects';
import {FurnitureArt,ThemePreview} from './ParcelArt';
import {poolStatus,rewardStatus} from './model';
import './parcels.css';

interface Props {
  state:GameState;catalog:Catalog;disabled:boolean;retryDisabled:boolean;error:string;
  initialPool?:string;onPool:(id:string)=>void;onCommand:(command:GameCommand)=>Promise<boolean>;
  onRetry:()=>void;onClose:()=>void;onRecharge:()=>void;onRefresh:()=>Promise<void>;onPlace:(id:string,slot:string)=>Promise<boolean>;
}
const catNames:Record<string,string>={miaomiao:'喵喵',tuanzi:'团子',diandian:'点点',momo:'墨墨'};
const interactions:Record<string,string>={castle_peek:'探头躲猫猫',belly:'翻肚休息',hammock_sleep:'跳上去打盹',knead:'踩奶',sniff:'凑近嗅一嗅',watch:'抬头看摆锤',bat_ball:'拨弄毛线球',perch:'跳上坐好',bat_chime:'抬爪拨风铃'};
export default function ParcelDialog({state,catalog,disabled,retryDisabled,error,initialPool,onPool,onCommand,onRetry,onClose,onRecharge,onRefresh,onPlace}:Props) {
  const [selected,setSelected]=useState(initialPool??catalog.pools[0]?.id);
  const pool=catalog.pools.find(p=>p.id===selected)??catalog.pools[0];
  const [opening,setOpening]=useState(false),[result,setResult]=useState<ParcelDraw|null>(null);
  const [inspected,setInspected]=useState<string|null>(null);
  const [shown,setShown]=useState(false);
  const pending=useRef(false),lastDraw=useRef(state.lastResult.draw?.id),lockedRef=useRef(false);
  const revealRef=useRef<HTMLElement>(null);
  const [placeNotice,setPlaceNotice]=useState('');
  const status=poolStatus(state,pool),atHome=state.phase==='home',premium=pool.currency==='tuna';
  const busy=disabled||opening;
  const draw=state.lastResult.draw;
  const lastHistory=state.lottery?.history.at(-1);
  const item=catalog.furniture.find(f=>f.id===result?.furnitureId);
  const detailItem=catalog.furniture.find(f=>f.id===inspected);
  const lockedSlots=new Set((catalog.renovations??[]).filter(r=>!state.flags.includes(r.grantsFlag)).flatMap(r=>r.unlockSlots??[]));
  useEffect(()=>{
    if(!draw||draw.id===lastDraw.current)return;
    lastDraw.current=draw.id;
    if(!pending.current)return;
    pending.current=false;setResult(draw);setPlaceNotice('');setShown(false);
  },[draw]);
  useEffect(()=>{
    if(!result)return;
    setOpening(true);setShown(false);
    const timer=window.setTimeout(()=>{setShown(true);setOpening(false);playSound(result.duplicate?'pickup':'chime');},window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:950);
    return()=>clearTimeout(timer);
  },[result]);
  useEffect(()=>{if(shown)revealRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});},[shown]);
  useEffect(()=>{
    if(disabled)return;
    const shifted=Date.now()+8*3600000,day=new Date(shifted).toISOString().slice(0,10),midnight=new Date(shifted);midnight.setUTCHours(24,0,0,500);
    const timer=window.setTimeout(()=>void onRefresh(),state.lottery?.day!==day?500:midnight.getTime()-shifted);
    return()=>clearTimeout(timer);
  },[state.lottery?.day,disabled,onRefresh]);
  const openParcel=async()=>{
    if(lockedRef.current||busy||status.locked||status.short||!atHome)return;
    lockedRef.current=true;pending.current=true;setResult(null);setOpening(true);setPlaceNotice('');playSound('send');
    const success=await onCommand({type:'DRAW_FURNITURE',poolId:pool.id});
    // Unknown network outcomes keep the API's original idempotency key for Retry.
    if(!success)setOpening(false);
    lockedRef.current=false;
  };
  const changePool=(id:string)=>{setSelected(id);onPool(id);setResult(null);setPlaceNotice('');playSound('open');};
  return <Modal title="猫爪邮局" onClose={onClose} className={`parcel-dialog ${premium?'parcel-moon':'parcel-moss'}`}>
    <header className="parcel-header"><div><span className="eyebrow">LITTLE PAW POST OFFICE</span><h2>猫爪邮局</h2><p>把一份小小的喜欢，寄给我们的家。</p></div><div className="parcel-wallet"><span>✦ <b>{state.currencies.stamp??0}</b> 邮票</span><button onClick={onRecharge} disabled={busy}>🥫 <b>{state.currencies.tuna??0}</b> 罐头 ＋</button></div></header>
    <div className="parcel-tabs" role="tablist" aria-label="主题包裹">{catalog.pools.map(p=><button key={p.id} id={`tab-${p.id}`} role="tab" aria-selected={p.id===pool.id} aria-controls="parcel-theme-panel" disabled={opening} onClick={()=>changePool(p.id)}><span>{p.currency==='stamp'?'邮票免费池':'罐头付费池'}</span><b>{p.theme}</b></button>)}</div>
    <section id="parcel-theme-panel" role="tabpanel" aria-labelledby={`tab-${pool.id}`}>
      <div className="parcel-hero"><div className="parcel-intro"><span className="parcel-edition">{premium?'MOONSEA COLLECTION / 02':'MOSS LETTERS / 01'}</span><h3>{pool.theme}</h3><p>{pool.description}</p><div className="parcel-collection">已收藏 <b>{pool.entries.length-status.missing.length} / {pool.entries.length}</b> 件</div><p className="parcel-pity" role="status">{status.missing.length===0?'全套已集齐，继续抽取会转为修缮材料。':status.guaranteed?'下一封包裹：必得未拥有家具。':`最多再 ${status.untilNew} 抽，必得一件未拥有家具。`}</p></div><ThemePreview pool={pool}/></div>
      <p className="parcel-size-note">家具按同一比例展示 · 点击家具查看细节</p>
      <div className="parcel-prizes" aria-label={`${pool.theme}家具清单`}>{pool.entries.map(entry=>{
        const f=catalog.furniture.find(f=>f.id===entry.furnitureId)!,owned=state.furniture.includes(f.id);
        return <article key={f.id} className={owned?'parcel-prize owned':'parcel-prize'}><span className="parcel-owned">{owned?'已收藏':'待签收'}</span><button className="parcel-art-preview" aria-label={`${f.name}，放大查看`} onClick={()=>setInspected(f.id)}><FurnitureArt id={f.id} name={f.name}/></button><h4>{f.name}</h4><small className="parcel-size">布置宽度约 {f.widthCm} cm</small><p>{f.description}</p><small>{catNames[f.interactionCat??'']} · {interactions[f.interaction??'']}</small><b className="parcel-chance">{status.guaranteed?'本次保底':'基础概率'} {Number(status.chance(f.id).toFixed(1))}%</b></article>;
      })}</div>
      <div className="parcel-send"><div><b>{pool.name}</b><p>{!atHome?'回到花房后就能签收包裹。':status.locked?'完成点点的救援后开放。':premium?'罐头用于主题装扮；主线家具随剧情免费赠送。':'邮票来自剧情、探索、今日来信与猫咪心愿。'}</p></div><div className="parcel-send-actions"><button className="parcel-open-button" data-testid="parcel-draw" disabled={busy||!atHome||status.locked||status.short} onClick={()=>void openParcel()}>{opening?'正在拆开包裹…':`签收一次 · ${premium?'🥫':'✦'} ${pool.cost}`}</button>{atHome&&!status.locked&&status.short&&premium&&<button className="parcel-recharge-button" disabled={busy} onClick={onRecharge}>罐头不足，去补给小站 →</button>}{status.short&&!premium&&<small>邮票不足，看看下方的来信与心愿。</small>}</div></div>
    </section>
    {error&&<div className="parcel-error" role="alert">{error}<button disabled={retryDisabled} onClick={onRetry}>重试上次操作</button></div>}
    {(opening||result)&&<section ref={revealRef} className={`parcel-reveal ${shown?'revealed':'sealed'}`} aria-label="包裹开箱" aria-live="polite">
      {!shown?<div className="parcel-box-stage" role="status"><div className="parcel-paper-box"><span className="parcel-twine"/><span className="parcel-seal">{premium?'☽':'✦'}</span><span className="parcel-lid"/></div><p>刺啦——一份心意正在打开。</p></div>:result&&<><div className="parcel-sparkles" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{'--particle':i} as React.CSSProperties}/>)}</div><div className="parcel-result-art"><FurnitureArt id={result.furnitureId} name={item?.name??result.furnitureId} detail/></div><div className="parcel-result-copy"><span className="parcel-edition">{result.duplicate?'熟悉的心意':result.guaranteed?'暖心保底 · 新家具':'新家具送达'}</span><h3>{item?.name}</h3><p>{result.duplicate?`已收藏的家具化作了 ${result.material} 份修缮材料。`:state.cats.includes(item?.interactionCat??'')?`${catNames[item?.interactionCat??'']}已经在等它的新角落啦。`:'先给它留个位置，等伙伴加入后一起玩。'}</p><div className="parcel-place"><button disabled={disabled||!atHome||!state.furniture.includes(result.furnitureId)} onClick={async()=>{if(await onPlace(result.furnitureId,'')){setPlaceNotice('已放入家具背包。');playSound('pickup');}}}>打开背包布置</button></div>{item?.preferredSlot&&lockedSlots.has(item.preferredSlot)&&<small>推荐位置尚未修缮完成，可先摆在其他角落。</small>}{placeNotice&&<p role="status">{placeNotice}</p>}<button className="parcel-return" onClick={onClose}>回花房看看 →</button></div></>}
    </section>}
    <section className="parcel-rewards" aria-label="来信与猫咪心愿"><div className="parcel-section-head"><h3>来信与猫咪心愿</h3><small>每日 00:00（北京时间）换新</small></div><div className="parcel-reward-list">{(catalog.parcelRewards??[]).map(reward=>{
      const r=rewardStatus(state,reward);return <article key={reward.id}><div><span>{reward.kind==='daily'?'今日小事':'旅程纪念'}</span><h4>{reward.name}</h4><p>{reward.description}</p></div><div><b>{reward.stamp>0?`✦ ${reward.stamp}`:''}{reward.tuna>0?`　🥫 ${reward.tuna}`:''}</b><button data-testid={`claim-${reward.id}`} disabled={busy||!atHome||status.locked||r.claimed||r.locked||r.wish} onClick={()=>void onCommand({type:'CLAIM_PARCEL_REWARD',rewardId:reward.id})}>{r.claimed?'已签收':r.locked?'旅程尚未到达':r.wish?'先布置一件家具':'签收心意'}</button></div></article>;
    })}</div></section>
    <details className="parcel-history"><summary>包裹收据 · 最近 {state.lottery?.history.length??0} 次</summary>{!lastHistory?<p>第一封来信，还在等你拆开。</p>:<><button disabled={busy} onClick={()=>{setResult(lastHistory);setPlaceNotice('');}}>查看最近一次包裹</button><ol>{[...(state.lottery?.history??[])].reverse().map(receipt=><li key={receipt.id}><time>{new Date(receipt.createdAt).toLocaleString('zh-CN')}</time><span>{catalog.pools.find(p=>p.id===receipt.poolId)?.theme} · 第 {receipt.number} 抽</span><b>{catalog.furniture.find(f=>f.id===receipt.furnitureId)?.name??receipt.furnitureId}</b><small>{receipt.duplicate?`重复 → 材料 +${receipt.material}`:receipt.guaranteed?'保底新家具':'新家具'} · {receipt.currency==='tuna'?'🥫':'✦'} {receipt.cost}</small></li>)}</ol></>}</details>
    <details className="parcel-rules"><summary>包裹规则与概率说明</summary><p>两池各含十二件独立主题家具，不含剧情赠送家具。普通抽取按展示权重独立结算；未集齐时，连续两次未获得新家具后，下一抽只在未拥有家具中按原权重抽取。获得新家具后计数归零，两池分别累计，刷新与跨日不重置。</p><p>重复家具转为 2 份修缮材料；集齐后继续抽取也按此补偿，不再触发新家具保底。最近 50 次收据可查。主题包裹常驻开放；罐头充值目前为演示支付。家具没有战斗数值，也不作为通关条件。摆放后点击家具，可以邀请对应猫咪过来；剧情期间由故事接管。</p></details>
    {detailItem&&<Modal title={`${detailItem.name}细节`} className="parcel-detail-dialog" onClose={()=>setInspected(null)}><span className="eyebrow">{detailItem.theme}</span><h2>{detailItem.name}</h2><FurnitureArt id={detailItem.id} name={detailItem.name} detail/><p>{detailItem.description}</p><p>布置宽度约 <b>{detailItem.widthCm} cm</b> · {catNames[detailItem.interactionCat??'']}可以{interactions[detailItem.interaction??'']}</p></Modal>}
  </Modal>;
}
