import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {Catalog,GameCommand,GameState} from '../../contracts';
import type {ParcelDraw} from './types';
import Modal from '../../ui/Modal';
import WindowHeading from '../../ui/WindowHeading';
import {playSound} from '../../ui/soundEffects';
import {trackRechargeEntryExpose, trackRechargeEntryClick} from '../../observability/actions';
import {ThemePreview} from './ParcelArt';
import {poolStatus} from './model';
import {currentStory} from '../../core/story';
import CapsuleCollection from './CapsuleCollection';
import CollectionPolaroid from './CollectionPolaroid';
import type {StrokePoint} from './PostcardCanvas';
import PostcardPaper from './PostcardPaper';
import PostalMark from './PostalMark';
import PostalCurrencyIcon from './PostalCurrencyIcon';
import ParcelDelivery,{ParcelSprite} from './ParcelDelivery';
import {PostalJournalBackdrop} from './QueuedImage';
import {usePostalPresentation} from './presentation';
import {postalPresentationStyle,previewTheme} from './presentationModel';
import {usePostalElements} from './postalElements';
import './parcels.css';
import './capsules.css';
import './postal-journal.css';
import './postcard.css';

interface Props{state:GameState;catalog:Catalog;disabled:boolean;retryDisabled:boolean;error:string;initialPool?:string;storageScope?:string;onPool:(id:string)=>void;onCommand:(command:GameCommand)=>Promise<boolean>;onRetry:()=>void;onClose:()=>void;onRecharge:()=>void;onPlace:(id:string,slot:string)=>Promise<boolean>}
type Stage='preview'|'drawing'|'sending'|'arriving'|'parcels'|'opening'|'result';
type Saved={poolId:string;ids:string[];opened:string[];stroke:StrokePoint[]};
function storageKey(){try{return 'stray-kitty.postal.v1:'+JSON.parse(localStorage.getItem('stray-kitty.session.v1')??'{}').playerId;}catch{return 'stray-kitty.postal.v1:local';}}
function restore(state:GameState,key:string):Saved|null{
  try{const d=JSON.parse(localStorage.getItem(key)??'null') as Saved|null;
    if(!d||!Array.isArray(d.ids)||![1,10].includes(d.ids.length)||!Array.isArray(d.opened)||!Array.isArray(d.stroke))return null;
    if(!d.ids.every(id=>state.lottery?.history.some(r=>r.id===id&&r.poolId===d.poolId))||d.ids.every(id=>d.opened.includes(id)))return null;
    return {...d,stroke:d.stroke.filter(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n))).slice(0,4096)};
  }catch{return null;}
}
export default function PostalJournal({state,catalog,disabled,retryDisabled,error,initialPool,storageScope,onPool,onCommand,onRetry,onClose,onRecharge,onPlace}:Props){
  // 模块二埋点:邮局面板每次打开计一次充值入口曝光;充值按钮(余额卡片、底部去补给小站)同属邮局位置。
  useEffect(() => {trackRechargeEntryExpose('parcels');}, []);
  const key=storageScope??storageKey(),presentation=usePostalPresentation();
  const layoutRoot=useRef<HTMLDivElement>(null);usePostalElements(layoutRoot,presentation.elements);
  const actionsRoot=useRef<HTMLDivElement>(null),drawButtons=useRef<(HTMLButtonElement|null)[]>([]);
  const [saved]=useState(()=>restore(state,key));
  const [selected,setSelected]=useState(saved?.poolId??initialPool??catalog.pools[0]?.id),[sheet,setSheet]=useState<'collection'|'rules'|null>(null),[infoTab,setInfoTab]=useState<'rules'|'history'>('rules');
  const [stage,setStage]=useState<Stage>(saved?'parcels':'preview'),[count,setCount]=useState<1|10>(saved?.ids.length===10?10:1),[stroke,setStroke]=useState<StrokePoint[]>(saved?.stroke??[]);
  const [draws,setDraws]=useState<ParcelDraw[]>(()=>saved?saved.ids.map(id=>state.lottery!.history.find(r=>r.id===id)!):[]),[opened,setOpened]=useState<string[]>(saved?.opened??[]),[opening,setOpening]=useState<string|null>(null),[focused,setFocused]=useState<string|null>(null);
  const pending=useRef<{poolId:string;count:1|10;started:number}|null>(null),locked=useRef(false),last=useRef(state.lastResult.draw?.id);
  const pool=catalog.pools.find(p=>p.id===selected)??catalog.pools[0],status=poolStatus(state,pool),atHome=state.phase==='home'||state.phase==='dialogue'&&currentStory(catalog,state)?.scene==='home',owned=pool.entries.length-status.missing.length;
  const presentationStyle=useMemo(()=>postalPresentationStyle(presentation,previewTheme(pool.currency)),[presentation,pool.currency]);
  const balance=state.currencies[pool.currency]??0,currency=pool.currency==='tuna'?'罐头':'邮票',active=stage!=='preview',inFlight=['sending','arriving','opening'].includes(stage),allOpened=draws.length>0&&draws.every(d=>opened.includes(d.id));
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useLayoutEffect(()=>{
    const root=layoutRoot.current,frame=root?.parentElement;if(!root||!frame)return;
    // Keep the saved composition intact when the in-game window is shorter than the design desk.
    const fit=()=>root.style.setProperty('--postal-viewport-fit',String(frame.clientWidth>800&&frame.clientHeight>0?Math.min(1,frame.clientHeight/1052):1));
    fit();const observer=new ResizeObserver(fit);observer.observe(frame);return()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    const root=actionsRoot.current;if(!root)return;
    const align=()=>{const buttons=drawButtons.current;if(!buttons[0]||!buttons[1])return;
      const centers=buttons.map(button=>{const offset=getComputedStyle(button!).translate.split(' ').map(n=>parseFloat(n)||0);return{x:button!.offsetLeft+button!.offsetWidth/2+(offset[0]??0),y:button!.offsetTop+button!.offsetHeight/2+(offset[1]??0)};});
      root.style.setProperty('--postal-action-center-x',`${(centers[0].x+centers[1].x)/2}px`);root.style.setProperty('--postal-action-center-y',`${(centers[0].y+centers[1].y)/2}px`);
    };
    align();const observer=new ResizeObserver(align);observer.observe(root);drawButtons.current.forEach(button=>{if(button)observer.observe(button);});return()=>observer.disconnect();
  },[presentation,stage]);
  useEffect(()=>{
    const result=state.lastResult.draw;if(!result||result.id===last.current)return;last.current=result.id;
    const request=pending.current;if(!request||result.poolId!==request.poolId)return;
    const receipts=state.lastResult.draws??[result];if(receipts.length!==request.count||!receipts.every(d=>d.poolId===request.poolId))return;
    pending.current=null;setDraws(receipts);setOpened([]);setFocused(null);
    const timer=window.setTimeout(()=>{setStage('arriving');playSound('step');},reduced()?0:Math.max(0,1000-(performance.now()-request.started)));return()=>clearTimeout(timer);
  },[state.lastResult.draw?.id]);
  useEffect(()=>{if(stage!=='arriving')return;const timer=window.setTimeout(()=>setStage('parcels'),reduced()?40:1050);return()=>clearTimeout(timer);},[stage]);
  useEffect(()=>{if(!opening)return;const timer=window.setTimeout(()=>{setOpened(ids=>ids.includes(opening)?ids:[...ids,opening]);setFocused(opening);setOpening(null);setStage('result');playSound('chime');},reduced()?40:740);return()=>clearTimeout(timer);},[opening]);
  useEffect(()=>{if(!draws.length)return;try{if(allOpened)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify({poolId:draws[0].poolId,ids:draws.map(d=>d.id),opened,stroke} satisfies Saved));}catch{/* Presentation storage never blocks a confirmed delivery. */}},[draws,opened,stroke,allOpened,key]);
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
  const pendingNotice=disabled&&!retryDisabled?'上一次操作尚未确认，请先重试，确认后即可继续抽取。':'';
  const notice=disabled?(pendingNotice||'正在确认操作，请稍候。'):!atHome?'回到花房后可寄出。':status.locked?'完成点点的救援后开放。':balance<pool.cost?`${currency}不足` :'';
  const heading=stage==='preview'?'把期待，寄给小小的家':stage==='drawing'?'这一笔，随心就好':stage==='sending'?'你的心意，正在寄出':stage==='arriving'?'包裹正在送来':'拆一份，家的新模样';
  return <Modal title="猫爪邮局" onClose={()=>{if(!inFlight)onClose();}} className="postal-journal">
    <div className="postal-viewport"><div ref={layoutRoot} className="postal-layout" data-stage={stage} style={presentationStyle}>
      <PostalJournalBackdrop/>
      <header className="postal-header"><div className="postal-brand"><PostalMark/><span><span>猫爪邮局</span></span></div></header>
      <div className="postal-balances" aria-label="邮票和罐头余额"><span className="postal-balance-card"><PostalCurrencyIcon currency="stamp"/><span className="postal-balance-value"><span>邮票</span><b>{state.currencies.stamp??0}</b></span></span><button className="postal-balance-card" aria-label={`罐头 ${state.currencies.tuna??0}，前往补给小站`} disabled={active||disabled} onClick={() => {trackRechargeEntryClick('parcels');onRecharge();}}><PostalCurrencyIcon currency="tuna"/><span className="postal-balance-value"><span>罐头</span><b>{state.currencies.tuna??0}</b></span><i className="postal-balance-plus" aria-hidden="true">＋</i></button></div>
      <div className="postal-suite-heading" data-theme={previewTheme(pool.currency)} aria-hidden={active}><h3>{pool.theme}</h3></div>
      <div className="postal-body"><aside className="postal-aside"><span className="postal-kicker">A LITTLE LETTER TO HOME</span><h2>{heading}</h2><span className="postal-underline" aria-hidden="true"/><div className="postal-pools" role="tablist" aria-label="家具卡池" aria-orientation="vertical">{catalog.pools.map(p=><button key={p.id} role="tab" id={`postal-tab-${p.id}`} aria-selected={p.id===pool.id} aria-controls="postal-stage" disabled={active||disabled} onClick={()=>changePool(p.id)}><span>{p.currency==='stamp'?'日常来信':'特别来信'}</span><b>{p.theme}</b><small>{p.cost} {p.currency==='tuna'?'罐头':'邮票'} / 份</small></button>)}</div><CollectionPolaroid key={pool.id} pool={pool} catalog={catalog} owned={state.furniture}/></aside>
      <main id="postal-stage" className={`postal-stage stage-${stage}`} role="tabpanel" aria-labelledby={`postal-tab-${pool.id}`}>
        <div className="postal-paper-stack"><span className="postal-paper-back" aria-hidden="true"/><section className="postal-paper">
          <div className="postal-suite" data-theme={pool.currency==='tuna'?'moon':'moss'} aria-hidden={active}><div className="postal-preview-mount"><ThemePreview pool={pool}/><span className="postal-preview-corner top-left" aria-hidden="true"/><span className="postal-preview-corner bottom-right" aria-hidden="true"/><div className="postal-suite-register"><span><b>{String(pool.entries.length).padStart(2,'0')}</b> 件套装家具<small>墙面与地板为搭配展示</small></span><span><button className="postal-owned-link" disabled={active||disabled} onClick={()=>setSheet('collection')} aria-label={`查看家具图鉴，已收藏 ${owned}/${pool.entries.length}`}><span>已收藏</span> <b>{owned}</b> / {pool.entries.length}<i aria-hidden="true">›</i></button></span></div></div></div>
          <PostcardPaper count={count} stroke={stroke} onChange={setStroke} onComplete={()=>void send()} drawing={stage==='drawing'} sending={stage==='sending'}/>
          {draws.length>0&&stage!=='sending'&&<div className="postal-delivery-stage"><ParcelDelivery draws={draws} opened={opened} opening={opening} focused={focused} catalog={catalog} disabled={disabled} onOpen={openParcel} onDismiss={()=>{setFocused(null);setStage('parcels');}} onPlace={id=>void onPlace(id,'')}/></div>}
        </section><span className="postal-corner-stamps" aria-hidden="true"><i/><i/></span></div>
      </main></div>
      <footer className="postal-footer">
        <div ref={actionsRoot} className="postal-actions">{([1,10] as const).map((n,i)=><button key={n} ref={button=>{drawButtons.current[i]=button;}} className={`postal-ticket ${n===1?'primary':''}`} data-testid={n===1?'parcel-draw':'parcel-draw-ten'} aria-hidden={active} tabIndex={active?-1:0} disabled={active||disabled||!atHome||status.locked||balance<pool.cost*n} title={disabled||!atHome||status.locked?notice:balance<pool.cost*n?`还需 ${pool.cost*n-balance} ${currency}`:undefined} onClick={()=>begin(n)}><span>寄出{n===1?'一':'十'}份</span><small>{currency} ×{pool.cost*n}</small></button>)}
        {active&&<div className="postal-stage-actions">{stage==='drawing'?<><div className="postal-stage-secondary">{stroke.length>0&&<button className="postal-text-button" onClick={()=>setStroke([])}>↶ 重画</button>}<button className="postal-text-button" onClick={()=>{setStage('preview');setStroke([]);}}>取消</button></div><button className="postal-stage-ticket postal-ticket" data-testid="postcard-skip" onClick={()=>void send()} disabled={disabled}><span>跳过涂画</span><small>直接寄出 · {count} 份包裹</small></button></>
        :inFlight?<span className="postal-sending" role="status">{stage==='sending'?'盖上邮戳，把期待寄出去…':stage==='arriving'?'包裹送达，轻轻放好…':'纸绳松开，惊喜就要出现…'}</span>
        :<>{!allOpened&&<div className="postal-stage-secondary"><button className="postal-text-button" onClick={onClose}>稍后再拆</button></div>}<button className="postal-stage-ticket postal-ticket primary" data-testid="parcel-stage-action" onClick={()=>{if(allOpened){back();return;}setOpened(draws.map(d=>d.id));setFocused(null);setStage('parcels');playSound('chime');}}><span>{allOpened?'回到套装':'全部拆开'}</span><small>{allOpened?'再寄一份喜欢':'已拆 '+opened.length+' / '+draws.length}</small></button></>}</div>}
        {!active&&<div className="postal-pity" role="status"><span>{status.missing.length===0?'全套已集齐 · 重复转为修缮材料':status.guaranteed?'下一份必得未拥有家具':`最多再 ${status.untilNew} 次，遇见新家具`}</span>{notice&&<small>{notice}{balance<pool.cost&&pool.currency==='tuna'&&<button onClick={() => {trackRechargeEntryClick('parcels');onRecharge();}}>去补给小站 ›</button>}</small>}</div>}
        </div><ParcelSprite className="postal-footer-parcel"/><nav className="postal-info-links" aria-label="邮局手册"><button className="postal-rules-button" disabled={active||disabled} onClick={()=>{setInfoTab('rules');setSheet('rules');}}><span>规则</span></button></nav>
      </footer>
      {(error||pendingNotice)&&<div className="parcel-error postal-error" role="alert"><span>{error||pendingNotice}</span><button disabled={retryDisabled} onClick={onRetry}>重试上次操作</button>{stage==='sending'&&!disabled&&<button onClick={()=>{pending.current=null;setStage('drawing');}}>返回明信片</button>}</div>}
    </div></div>
    {sheet==='collection'&&<CapsuleCollection key={pool.id} state={state} catalog={catalog} pool={pool} onClose={()=>setSheet(null)}/>}
    {sheet==='rules'&&<Modal variant="paper" title="邮局规则与收据" className="gacha-info-sheet postal-info" onClose={()=>setSheet(null)}><WindowHeading title="邮局手册" icon="manual"/><div className="postal-info-tabs" role="group" aria-label="查看规则或收据"><button aria-pressed={infoTab==='rules'} onClick={()=>setInfoTab('rules')}>抽取规则</button><button aria-pressed={infoTab==='history'} onClick={()=>setInfoTab('history')}>包裹收据 <small>{state.lottery?.history.length??0}</small></button></div>
      {infoTab==='rules'?<div className="gacha-rule-copy"><h3>费用与寄出</h3><p>{catalog.pools.map(p=>`${p.theme}每份 ${p.cost} ${p.currency==='tuna'?'罐头':'邮票'}`).join('；')}。寄出时扣费，涂画可跳过，不影响结果。家具概率可在图鉴中查看。</p><h3>新家具保底</h3><p>未集齐时，连续两份未获得新家具，第三份只从未拥有家具中按原权重抽取。两池分别累计，十连按顺序逐份计算。</p><h3>重复与收据</h3><p>重复家具转为 2 份修缮材料，收据保留最近 50 次。网络失败时重试原操作，不会重复扣费。</p></div>
      :<><ol className="gacha-receipts">{[...(state.lottery?.history??[])].reverse().map(r=><li key={r.id}><div><small>{new Date(r.createdAt).toLocaleString('zh-CN')} · {catalog.pools.find(p=>p.id===r.poolId)?.theme}</small><b>{catalog.furniture.find(f=>f.id===r.furnitureId)?.name??r.furnitureId}</b><span>{r.duplicate?`重复 → 材料 +${r.material}`:r.guaranteed?'保底新家具':'新家具'} · {r.cost} {r.currency==='tuna'?'罐头':'邮票'}</span></div><button onClick={()=>receipt(r)}>查看结果 ›</button></li>)}</ol>{!state.lottery?.history.length&&<p className="gacha-empty">还没有收据</p>}</>}
    </Modal>}
  </Modal>;
}
