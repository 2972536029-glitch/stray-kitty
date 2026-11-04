import {useEffect,useRef} from 'react';
import type {ParcelPool} from './types';
import {useState} from 'react';
import {loadParcelArtwork,parcelWidth,type ParcelArtwork} from './furnitureArt';
import {chapterBackgroundReady} from '../map/artwork';
import {paintCollectionPreview} from './previewScene';
import QueuedImage from './QueuedImage';

export function FurnitureArt({id,name,className='',detail=false,scale=.45}:{id:string;name:string;className?:string;detail?:boolean;scale?:number}) {
  return <div className={`parcel-art-stage ${detail?'detail':''} ${className}`}><QueuedImage url={`/assets/home/parcels/${id}.png`} alt={name} style={detail?undefined:{width:`${parcelWidth(id)*scale}px`}} className="parcel-furniture-art"/></div>;
}
export function ThemePreview({pool}:{pool:ParcelPool}) {
  const ref=useRef<HTMLCanvasElement>(null);
  const [art,setArt]=useState<ParcelArtwork>();
  const [room,setRoom]=useState<HTMLImageElement>();
  const [failed,setFailed]=useState(false);
  useEffect(()=>{let cancelled=false;void Promise.all([loadParcelArtwork(),chapterBackgroundReady('greenhouse')]).then(([furniture,house])=>{if(!cancelled){setArt(furniture);setRoom(house);}}).catch(()=>{if(!cancelled)setFailed(true);});return()=>{cancelled=true;};},[]);
  useEffect(()=>{
    const canvas=ref.current!,ctx=canvas.getContext('2d')!;
    const paint=()=>{const r=canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.round(r.width*ratio));canvas.height=Math.max(1,Math.round(r.height*ratio));ctx.fillStyle=pool.currency==='tuna'?'#384c60':'#a7ae91';ctx.fillRect(0,0,canvas.width,canvas.height);if(room&&art)paintCollectionPreview(ctx,pool,art,room,canvas.width,canvas.height);};
    const observer=new ResizeObserver(paint);observer.observe(canvas);paint();return()=>observer.disconnect();
  },[pool,art,room]);
  return <figure className="parcel-theme-preview"><canvas ref={ref} width={1000} height={720} data-artwork={art&&room?'ready':'loading'} role="img" aria-label={`${pool.theme}全套十二件家具搭配特写，墙面与地板为展示布景，无猫咪`}/><figcaption>{failed?'预览素材暂未送达，可刷新重试。':'真实家具搭配 · 全套十二件 · 墙面与地板为展示布景'}</figcaption></figure>;
}
