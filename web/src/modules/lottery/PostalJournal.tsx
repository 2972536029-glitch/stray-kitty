import {useEffect,useRef,useState} from 'react';
import type {Catalog,GameCommand,GameState} from '../../contracts';
import type {ParcelDraw} from './types';
import Modal from '../../ui/Modal';
import {playSound} from '../../ui/soundEffects';
import {ThemePreview} from './ParcelArt';
import {poolStatus} from './model';
import CapsuleCollection from './CapsuleCollection';
import CollectionPolaroid from './CollectionPolaroid';
import PostcardCanvas,{type StrokePoint} from './PostcardCanvas';
import PostalMark from './PostalMark';
import ParcelDelivery,{ParcelSprite} from './ParcelDelivery';
import './parcels.css';
import './capsules.css';
import './postal-journal.css';

interface Props{state:GameState;catalog:Catalog;disabled:boolean;retryDisabled:boolean;error:string;initialPool?:string;onPool:(id:string)=>void;onCommand:(command:GameCommand)=>Promise<boolean>;onRetry:()=>void;onClose:()=>void;onRecharge:()=>void;onPlace:(id:string,slot:string)=>Promise<boolean>}
type Stage='preview'|'drawing'|'sending'|'arriving'|'parcels'|'opening'|'result';
type Saved={poolId:string;ids:string[];opened:string[];stroke:StrokePoint[]};
function storageKey(){try{return 'stray-kitty.postal.v1:'+JSON.parse(localStorage.getItem('stray-kitty.session.v1')??'{}').playerId;}catch{return 'stray-kitty.postal.v1:local';}}
function restore(state:GameState):Saved|null{
  try{const d=JSON.parse(localStorage.getItem(storageKey())??'null') as Saved|null;
    if(!d||!Array.isArray(d.ids)||![1,10].includes(d.ids.length)||!Array.isArray(d.opened)||!Array.isArray(d.stroke))return null;
    if(!d.ids.every(id=>state.lottery?.history.some(r=>r.id===id&&r.poolId===d.poolId))||d.ids.every(id=>d.opened.includes(id)))return null;
    return {...d,stroke:d.stroke.filter(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n))).slice(0,4096)};
  }catch{return null;}
}
export default function PostalJournal({state,catalog,disabled,retryDisabled,error,initialPool,onPool,onCommand,onRetry,onClose,onRecharge,onPlace}:Props){
  const [saved]=useState(()=>restore(state));
  const [selected,setSelected]=useState(saved?.poolId??initialPool??catalog.pools[0]?.id),[sheet,setSheet]=useState<'collection'|'history'|'rules'|null>(null);
  const [stage,setStage]=useState<Stage>(saved?'parcels':'preview'),[count,setCount]=useState<1|10>(saved?.ids.length===10?10:1),[stroke,setStroke]=useState<StrokePoint[]>(saved?.stroke??[]);
  const [draws,setDraws]=useState<ParcelDraw[]>(()=>saved?saved.ids.map(id=>state.lottery!.history.find(r=>r.id===id)!):[]),[opened,setOpened]=useState<string[]>(saved?.opened??[]),[opening,setOpening]=useState<string|null>(null),[focused,setFocused]=useState<string|null>(null);
  const pending=useRef<{poolId:string;count:1|10;started:number}|null>(null),locked=useRef(false),last=useRef(state.lastResult.draw?.id);
  const pool=catalog.pools.find(p=>p.id===selected)??catalog.pools[0],status=poolStatus(state,pool),atHome=state.phase==='home',owned=pool.entries.length-status.missing.length;
  const balance=state.currencies[pool.currency]??0,currency=pool.currency==='tuna'?'罐头':'邮票',active=stage!=='preview',inFlight=['sending','arriving','opening'].includes(stage),allOpened=draws.length>0&&draws.every(d=>opened.includes(d.id));
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(()=>{
    const result=state.lastResult.draw;if(!result||result.id===last.current)return;last.current=result.id;
    const request=pending.current;if(!request||result.poolId!==request.poolId)return;
    const receipts=state.lastResult.draws??[result];if(receipts.length!==request.count||!receipts.every(d=>d.poolId===request.poolId))return;
    pending.current=null;setDraws(receipts);setOpened([]);setFocused(null);
    const timer=window.setTimeout(()=>{setStage('arriving');playSound('step');},reduced()?0:Math.max(0,1000-(performance.now()-request.started)));return()=>clearTimeout(timer);
  },[state.lastResult.draw?.id]);
  useEffect(()=>{if(stage!=='arriving')return;const timer=window.setTimeout(()=>setStage('parcels'),reduced()?40:1050);return()=>clearTimeout(timer);},[stage]);
  useEffect(()=>{if(!opening)return;const timer=window.setTimeout(()=>{setOpened(ids=>ids.includes(opening)?ids:[...ids,opening]);setFocused(opening);setOpening(null);setStage('result');playSound('chime');},reduced()?40:740);return()=>clearTimeout(timer);},[opening]);
  useEffect(()=>{if(!draws.length)return;try{if(allOpened)localStorage.removeItem(storageKey());else localStorage.setItem(storageKey(),JSON.stringify({poolId:draws[0].poolId,ids:draws.map(d=>d.id),opened,stroke} satisfies Saved));}catch{/* Presentation storage never blocks a confirmed delivery. */}},[draws,opened,stroke,allOpened]);
  const begin=(n:1|10)=>{if(disabled||active||status.locked||!atHome||balance<pool.cost*n)return;setCount(n);setStroke([]);setDraws([]);setOpened([]);setFocused(null);setStage('drawing');playSound('open');};
  const send=async()=>{if(locked.current||disabled||stage!=='drawing')return;locked.current=true;pending.current={poolId:pool.id,count,started:performance.now()};setStage('sending');playSound('send');try{await onCommand({type:'DRAW_FURNITURE',poolId:pool.id,count});}finally{locked.current=false;}};
  const back=()=>{if(inFlight||draws.some(d=>!opened.includes(d.id)))return;setStage('preview');setDraws([]);setOpened([]);setFocused(null);setStroke([]);};
  const changePool=(id:string)=>{if(active||disabled)return;setSelected(id);onPool(id);playSound('open');};
  const openParcel=(id:string)=>{
    if(inFlight)return;
    if(draws.length>1){setOpened(ids=>ids.includes(id)?ids:[...ids,id]);setFocused(null);setStage('parcels');playSound('pickup');return;}
    if(opened.includes(id)){setFocused(id);setStage('result');return;}
    setOpening(id);setStage('opening');playSound('open');
  };
  const receipt=(r:ParcelDraw)=>{setSelected(r.poolId);onPool(r.poolId);setDraws([r]);setOpened([r.id]);setFocused(r.id);setStage('result');setSheet(null);};
  const notice=!atHome?'回到花房后，就能签收家具包裹。':status.locked?'完成点点的救援后开放。':balance<pool.cost?`${currency}不足，${pool.currency==='tuna'?'可以去补给小站看看。':'可到猫国商店领取来信与心愿。'}`:'先寄一张小小的期待，再拆开送给家的心意。';
  const heading=stage==='preview'?'把期待，寄给小小的家':stage==='drawing'?'这一笔，随心就好':stage==='sending'?'你的心意，正在寄出':stage==='arriving'?'包裹正在送来':'拆一份，家的新模样';
  return <Modal title="猫爪邮局" onClose={()=>{if(!inFlight)onClose();}} className="postal-journal">
    <div className="postal-layout" data-stage={stage}>
      <header className="postal-header"><div className="postal-brand"><PostalMark/><span>猫爪邮局<small>PAW POST · LITTLE DELIVERIES</small></span></div><div className="postal-wallet"><span>邮票 <b>{state.currencies.stamp??0}</b></span><button disabled={active||disabled} onClick={onRecharge}>罐头 <b>{state.currencies.tuna??0}</b> ＋</button></div><nav aria-label="邮局资料"><button disabled={active||disabled} onClick={()=>setSheet('collection')}>家具图鉴 <small>{owned}/{pool.entries.length}</small></button><button disabled={active||disabled} onClick={()=>setSheet('history')}>收据</button><button disabled={active||disabled} onClick={()=>setSheet('rules')}>规则</button></nav></header>
      <div className="postal-body"><aside className="postal-aside"><span className="postal-kicker">A LITTLE LETTER TO HOME</span><h2>{heading}</h2><span className="postal-underline" aria-hidden="true"/><div className="postal-pools" role="tablist" aria-label="家具卡池" aria-orientation="vertical">{catalog.pools.map(p=><button key={p.id} role="tab" id={`postal-tab-${p.id}`} aria-selected={p.id===pool.id} aria-controls="postal-stage" disabled={active||disabled} onClick={()=>changePool(p.id)}><span>{p.currency==='stamp'?'日常来信':'特别来信'}</span><b>{p.theme}</b><small>{p.cost} {p.currency==='tuna'?'罐头':'邮票'} / 份</small></button>)}</div><CollectionPolaroid key={pool.id} pool={pool} catalog={catalog} owned={state.furniture}/></aside>
      <main id="postal-stage" className={`postal-stage stage-${stage}`} role="tabpanel" aria-labelledby={`postal-tab-${pool.id}`}>
        <div className="postal-paper-stack"><span className="postal-paper-back" aria-hidden="true"/><section className="postal-paper">
          <div className="postal-suite" aria-hidden={active}><div className="postal-suite-heading"><span className="postal-kicker">THE FURNITURE COLLECTION</span><h3>{pool.theme}</h3><p>{pool.description}</p></div><ThemePreview pool={pool}/><span className="postal-suite-caption">把喜欢的这一套，慢慢寄回家。</span></div>
          <div className="postal-postcard" aria-hidden={stage!=='drawing'&&stage!=='sending'}><span className="postal-card-border" aria-hidden="true"/><span className="postal-card-clip" aria-hidden="true"/><div className="postal-address"><small>PAW POST / A NOTE TO HOME</small><span>致：我们的小小的家</span></div><div className="postal-card-letterhead" aria-hidden="true"><span>一封寄给家的心意</span><small>POSTCARD · {String(count).padStart(2,'0')}</small></div><div className="postal-postage" aria-hidden="true"><PostalMark/><span>PAW POST</span></div><div className="postal-postmark" aria-hidden="true">POST<br/>WITH LOVE</div><div className="postal-writing"><PostcardCanvas stroke={stroke} onChange={setStroke} onComplete={()=>void send()} disabled={stage!=='drawing'}/>{!stroke.length&&stage==='drawing'&&<div className="postal-writing-hint"><span>按住，画下随心的一笔</span><small>画完松开，包裹就会寄来</small></div>}</div><div className="postal-card-colophon" aria-hidden="true"><PostalMark/><span>来自猫爪邮局<small>DELIVERED WITH CARE</small></span></div><p className="postal-card-caption">随手留下一笔，余下的交给惊喜。</p>{stage==='sending'&&<div className="postal-sent-stamp" aria-hidden="true">已寄出<PostalMark/></div>}</div>
          {draws.length>0&&stage!=='sending'&&<div className="postal-delivery-stage"><ParcelDelivery draws={draws} opened={opened} opening={opening} focused={focused} catalog={catalog} disabled={disabled} onOpen={openParcel} onDismiss={()=>{setFocused(null);setStage('parcels');}} onPlace={id=>void onPlace(id,'')}/></div>}
        </section><span className="postal-corner-stamps" aria-hidden="true"><i/><i/></span></div>
      </main></div>
      <footer className="postal-footer"><div className="postal-pity" role="status">{status.missing.length===0?'全套已集齐 · 重复家具转为修缮材料':status.guaranteed?'暖心保底 · 下一份必得未拥有家具':`最多再 ${status.untilNew} 次，遇见一件新家具`}<small>{active?'自由涂画，只为这一刻的小小仪式。':notice}</small>{!active&&balance<pool.cost&&pool.currency==='tuna'&&<button onClick={onRecharge}>去补给小站 ›</button>}</div>
        <div className="postal-actions">{stage==='preview'?<>{([1,10] as const).map(n=><button key={n} className={`postal-ticket ${n===1?'primary':''}`} data-testid={n===1?'parcel-draw':'parcel-draw-ten'} disabled={disabled||!atHome||status.locked||balance<pool.cost*n} onClick={()=>begin(n)}><span>寄出{n===1?'一':'十'}份</span><small>{currency} ×{pool.cost*n}</small></button>)}</>
        :stage==='drawing'?<>{stroke.length>0&&<button className="postal-text-button" onClick={()=>setStroke([])}>↶ 重画</button>}<button className="postal-text-button" onClick={()=>{setStage('preview');setStroke([]);}}>取消</button><div className="postal-auto-note"><span>画完松开，自动寄出</span><small>{count} 份包裹 · {pool.cost*count} {currency}</small></div><button className="postal-ticket" data-testid="postcard-skip" onClick={()=>void send()} disabled={disabled}>跳过涂画，直接寄出</button></>
        :inFlight?<span className="postal-sending" role="status">{stage==='sending'?'盖上邮戳，把期待寄出去…':stage==='arriving'?'包裹送达，轻轻放好…':'纸绳松开，惊喜就要出现…'}</span>
        :<>{!allOpened&&<button className="postal-text-button" onClick={onClose}>稍后再拆</button>}<button className="postal-ticket primary" onClick={()=>{if(allOpened){back();return;}setOpened(draws.map(d=>d.id));setFocused(null);setStage('parcels');playSound('chime');}}>{allOpened?'回到套装':'全部拆开'}<small>{allOpened?'再寄一份喜欢':'已拆 '+opened.length+' / '+draws.length}</small></button></>}</div><ParcelSprite className="postal-footer-parcel"/>
      </footer><p className="postal-disclaimer">涂画仅供互动，不影响抽取结果</p>
      {error&&<div className="parcel-error postal-error" role="alert"><span>{error}</span><button disabled={retryDisabled} onClick={onRetry}>重试上次操作</button>{stage==='sending'&&!disabled&&<button onClick={()=>{pending.current=null;setStage('drawing');}}>返回明信片</button>}</div>}
    </div>
    {sheet==='collection'&&<CapsuleCollection key={pool.id} state={state} catalog={catalog} pool={pool} onClose={()=>setSheet(null)}/>}
    {sheet==='history'&&<Modal title="包裹收据" className="gacha-info-sheet postal-info" onClose={()=>setSheet(null)}><header><span className="eyebrow">LITTLE MOMENTS, SAFELY KEPT</span><h2>包裹收据 <small>最近 {state.lottery?.history.length??0} 次</small></h2><p>打开已有收据查看结果，不会再次扣费。</p></header><ol className="gacha-receipts">{[...(state.lottery?.history??[])].reverse().map(r=><li key={r.id}><div><small>{new Date(r.createdAt).toLocaleString('zh-CN')} · {catalog.pools.find(p=>p.id===r.poolId)?.theme}</small><b>{catalog.furniture.find(f=>f.id===r.furnitureId)?.name??r.furnitureId}</b><span>{r.duplicate?`重复 → 材料 +${r.material}`:r.guaranteed?'保底新家具':'新家具'} · {r.cost} {r.currency==='tuna'?'罐头':'邮票'}</span></div><button onClick={()=>receipt(r)}>查看结果 ›</button></li>)}</ol>{!state.lottery?.history.length&&<p className="gacha-empty">还没有收据，第一份心意在等你。</p>}</Modal>}
    {sheet==='rules'&&<Modal title="包裹规则" className="gacha-info-sheet postal-info" onClose={()=>setSheet(null)}><header><span className="eyebrow">A LITTLE LETTER TO HOME</span><h2>包裹规则</h2></header><div className="gacha-rule-copy"><h3>先看看，再寄出</h3><p>选好套装和一份或十份后，可以在明信片上连续画一笔，画完松开即自动寄出，也可以跳过。寄出时扣除对应费用；开始画之前可以取消。涂画不参与抽奖计算，包裹到货后由你亲手拆开，十连直接在原位展示家具。</p><h3>每一份，沿用同一份约定</h3><p>苔叶来信每份 1 张邮票，月海观星每份 60 罐头。十份一次确认，按顺序独立抽取，保底与重复补偿按每份累计。家具只用于装扮与猫咪互动。</p><h3>最多三份，遇见一件新的</h3><p>未集齐时，连续两份未获得新家具，下一份只在未拥有家具中按原权重抽取；两池分别累计。重复转为 2 份修缮材料，最近 50 次收据可查。网络失败使用原操作重试，不会重复扣费。</p></div></Modal>}
  </Modal>;
}
