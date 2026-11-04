import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {Catalog} from '../../contracts';
import type {ParcelDraw} from './types';
import {FurnitureArt} from './ParcelArt';
import {catNames} from './CapsuleCollection';
import QueuedImage from './QueuedImage';
import {cancelQueuedImage,queueImage} from '../../core/image-loading';

export function ParcelSprite({open=false,className=''}:{open?:boolean;className?:string}){return <span className={`postal-parcel-sprite ${open?'is-open':''} ${className}`} aria-hidden="true">{['closed','open'].map(frame=><span key={frame} className={`postal-parcel-frame ${frame}`}><QueuedImage url="/assets/lottery/postal-parcels.png" alt="" hideUntilReady/></span>)}</span>;}
interface Props{draws:ParcelDraw[];opened:string[];opening:string|null;focused:string|null;catalog:Catalog;disabled:boolean;onOpen:(id:string)=>void;onDismiss:()=>void;onPlace:(id:string)=>void}
export default function ParcelDelivery({draws,opened,opening,focused,catalog,disabled,onOpen,onDismiss,onPlace}:Props){
  const previous=useRef(new Set(opened)),timers=useRef(new Set<number>()),[revealing,setRevealing]=useState<Record<string,number>>({});
  useEffect(()=>()=>{for(const timer of timers.current)clearTimeout(timer);},[]);
  useEffect(()=>{const images=draws.map(draw=>{const image=new Image();void queueImage(image,`/assets/home/parcels/${draw.furnitureId}.png`).catch(()=>{});return image;});return()=>images.forEach(cancelQueuedImage);},[draws]);
  useLayoutEffect(()=>{
    const fresh=opened.filter(id=>!previous.current.has(id));previous.current=new Set(opened);
    if(draws.length===1||!fresh.length||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    setRevealing(active=>({...active,...Object.fromEntries(fresh.map((id,i)=>[id,Math.min(i*65,325)]))}));
    fresh.forEach((id,i)=>{const timer=window.setTimeout(()=>{setRevealing(active=>{const next={...active};delete next[id];return next;});timers.current.delete(timer);},980+Math.min(i*65,325));timers.current.add(timer);});
  },[opened,draws.length]);
  const selected=draws.find(d=>d.id===focused&&opened.includes(d.id)),item=selected&&catalog.furniture.find(f=>f.id===selected.furnitureId);
  if(selected&&item)return <section className="postal-reward" role="region" aria-label="包裹家具" aria-live="polite"><span className="postal-result-label">{selected.duplicate?'熟悉的心意':selected.guaranteed?'暖心保底 · 新家具':'新家具到家'}</span><div className="postal-reward-art"><FurnitureArt id={item.id} name={item.name} detail/></div><div className="parcel-result-copy"><h3>{item.name}</h3><p>{selected.duplicate?`已经收藏，化作 ${selected.material} 份修缮材料。`:`${catNames[item.interactionCat??'']??'猫咪伙伴'}在等它的新角落。`}</p></div><div className="postal-reward-actions"><button className="postal-ticket" onClick={onDismiss}>{draws.some(d=>!opened.includes(d.id))?'继续拆包':'查看全部家具'}</button><button className="postal-ticket primary" disabled={disabled} onClick={()=>onPlace(item.id)}>布置这件家具 ›</button></div></section>;
  return <section className={`postal-delivery ${draws.length===1?'single':''}`} aria-label="收到的包裹"><header><span className="postal-kicker">PAW POST · SPECIAL DELIVERY</span><h3>{opened.length===draws.length?'这一份份喜欢，都到家了':'有包裹寄到了'}</h3><p>{opened.length===draws.length?'家具已收进背包，随时可以去花房布置。':'点击包裹拆开，看看寄来了什么。'} <small>已拆 {opened.length} / {draws.length}</small></p></header><div className="postal-parcel-grid">{draws.map((draw,i)=>{const isOpen=opened.includes(draw.id),unwrapping=draw.id in revealing,f=isOpen?catalog.furniture.find(f=>f.id===draw.furnitureId):undefined;return <button key={draw.id} style={{'--parcel-index':i,'--reveal-delay':`${revealing[draw.id]??0}ms`} as CSSProperties} className={`postal-parcel ${isOpen?'opened':''} ${unwrapping?'unwrapping':''} ${opening===draw.id?'opening':''}`} disabled={!!opening||(draws.length>1&&isOpen)} aria-label={isOpen?`${f?.name??'家具'}，已拆开`:`拆开第 ${i+1} 个包裹`} onClick={()=>onOpen(draw.id)} data-testid="delivered-parcel" data-opened={isOpen}><span className="postal-parcel-number">{String(i+1).padStart(2,'0')}</span>{(!isOpen||unwrapping)&&<ParcelSprite open={opening===draw.id||unwrapping}/>} {unwrapping&&<span className="postal-unwrapping-rays" aria-hidden="true">✧</span>}{isOpen&&f&&<><FurnitureArt id={f.id} name={f.name}/><span className="postal-parcel-name">{f.name}{draw.duplicate&&<small>材料 +{draw.material}</small>}</span></>}{!isOpen&&<span className="postal-parcel-hint">{opening===draw.id?'轻轻拆开…':'点我拆开'}</span>}</button>;})}</div></section>;
}
