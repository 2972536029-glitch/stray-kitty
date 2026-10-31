import {useEffect,useRef} from 'react';
import type {ParcelPool} from './types';
import {useState} from 'react';
import {paintParcelFurniture,loadParcelArtwork,parcelWidth,type ParcelArtwork} from './furnitureArt';
import {loadHomeArtwork,type HomeArtwork} from '../home/assets';
import {HOME_SIZE} from '../home/layout';

export function FurnitureArt({id,name,className='',detail=false,scale=.45}:{id:string;name:string;className?:string;detail?:boolean;scale?:number}) {
  return <div className={`parcel-art-stage ${detail?'detail':''} ${className}`}><img src={`/assets/home/parcels/${id}.png`} alt={name} style={detail?undefined:{width:`${parcelWidth(id)*scale}px`}} className="parcel-furniture-art"/></div>;
}
export function ThemePreview({pool}:{pool:ParcelPool}) {
  const ref=useRef<HTMLCanvasElement>(null);
  const [art,setArt]=useState<ParcelArtwork>();
  const [room,setRoom]=useState<HomeArtwork>();
  const [failed,setFailed]=useState(false);
  useEffect(()=>{let cancelled=false;void Promise.all([loadParcelArtwork(),loadHomeArtwork()]).then(([furniture,house])=>{if(!cancelled){setArt(furniture);setRoom(house);}}).catch(()=>{if(!cancelled)setFailed(true);});return()=>{cancelled=true;};},[]);
  useEffect(()=>{
    const ctx=ref.current!.getContext('2d')!,premium=pool.currency==='tuna';ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.fillStyle=premium?'#dce3e5':'#e2e5ce';ctx.fillRect(0,0,1000,564);
    if(!room||!art){ctx.restore();return;}
    ctx.scale(1000/HOME_SIZE.width,564/HOME_SIZE.height);
    ctx.filter=premium?'saturate(.75) hue-rotate(8deg)':'none';ctx.drawImage(room.base,0,0,HOME_SIZE.width,HOME_SIZE.height);ctx.filter='none';
    if(premium){ctx.fillStyle='#afc6dd26';ctx.fillRect(150,30,1360,260);ctx.fillStyle='#fff0b2';for(let i=0;i<19;i++){const x=240+i*67,y=72+(i*53)%170;ctx.fillRect(x,y,3,7);ctx.fillRect(x-2,y+2,7,3);}}
    else {ctx.fillStyle='#f8e3ab24';ctx.fillRect(150,30,1360,260);}
    const ids=pool.entries.map(e=>e.furnitureId);
    paintParcelFurniture(ctx,ids[4],840,680,parcelWidth(ids[4]),art);
    for(const [i,x,y] of [[9,485,290],[10,1090,premium?350:650],[8,1110,390],[1,500,435],[7,1280,440],[6,850,445],[0,310,460],[2,1385,615],[5,660,630],[3,345,660],[11,1080,715]].sort((a,b)=>a[2]-b[2]))paintParcelFurniture(ctx,ids[i],x,y,parcelWidth(ids[i]),art);
    ctx.restore();
  },[pool,art,room]);
  return <figure className="parcel-theme-preview"><canvas ref={ref} width={1000} height={564} data-artwork={art&&room?'ready':'loading'} role="img" aria-label={`${pool.theme}全套十二件家具按统一比例布置，无猫咪`}/><figcaption>{failed?'预览素材暂未送达，可刷新重试。':'真实家具搭配 · 全套十二件 · 不含猫咪'}</figcaption></figure>;
}
