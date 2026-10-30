import {useEffect,useRef} from 'react';
import type {ParcelPool} from './types';
import {useState} from 'react';
import {paintParcelFurniture,loadParcelArtwork,parcelWidth,type ParcelArtwork} from './furnitureArt';

export function FurnitureArt({id,name,className='',detail=false}:{id:string;name:string;className?:string;detail?:boolean}) {
  return <div className={`parcel-art-stage ${detail?'detail':''} ${className}`}><img src={`/assets/home/parcels/${id}.png`} alt={name} style={detail?undefined:{width:`${parcelWidth(id)*.45}px`}} className="parcel-furniture-art"/></div>;
}
export function ThemePreview({pool}:{pool:ParcelPool}) {
  const ref=useRef<HTMLCanvasElement>(null);
  const [art,setArt]=useState<ParcelArtwork>();
  const [failed,setFailed]=useState(false);
  useEffect(()=>{let cancelled=false;void loadParcelArtwork().then(value=>{if(!cancelled)setArt(value);}).catch(()=>{if(!cancelled)setFailed(true);});return()=>{cancelled=true;};},[]);
  useEffect(()=>{
    const ctx=ref.current!.getContext('2d')!,premium=pool.currency==='tuna';ctx.imageSmoothingEnabled=false;
    ctx.fillStyle=premium?'#e8e6d4':'#e2e5ce';ctx.fillRect(0,0,800,450);
    ctx.fillStyle=premium?'#c4cfd1':'#b5c2a0';ctx.fillRect(0,0,800,160);
    for(let x=24;x<800;x+=190){ctx.fillStyle='#7a8170';ctx.fillRect(x,10,162,140);ctx.fillStyle='#e4efdb';ctx.fillRect(x+5,14,152,130);ctx.fillStyle='#fff5d6';ctx.fillRect(x+12,22,139,114);ctx.fillStyle='#a6b5a3';ctx.fillRect(x+82,14,3,130);ctx.fillRect(x+5,79,152,3);}
    ctx.fillStyle='#b59a75';ctx.fillRect(0,155,800,295);ctx.fillStyle='#d4bd95';
    for(let row=0;row<16;row++)for(let col=0;col<9;col++)ctx.fillRect(col*106+(row%2)*53-53,row*19+158,103,17);
    ctx.fillStyle='#f4e2ae70';ctx.fillRect(40,165,98,224);ctx.fillRect(405,165,98,224);
    const ids=pool.entries.map(e=>e.furnitureId);
    paintParcelFurniture(ctx,ids[4],506,441,parcelWidth(ids[4])*.52,art);
    for(const [i,x,y] of [[9,142,126],[7,699,232],[8,497,224],[6,333,234],[0,100,291],[1,205,250],[2,691,358],[5,295,366],[3,502,365],[10,713,premium?414:433],[11,152,432]])paintParcelFurniture(ctx,ids[i],x,y,parcelWidth(ids[i])*.52,art);
    ctx.fillStyle='#71654c';ctx.fillRect(0,445,800,5);
  },[pool,art]);
  return <figure className="parcel-theme-preview"><canvas ref={ref} width={800} height={450} role="img" aria-label={`${pool.theme}全套十二件家具按统一比例布置，无猫咪`}/><figcaption>{failed?'预览素材暂未送达，可刷新重试。':'全套十二件 · 按同一比例布置'}</figcaption></figure>;
}
