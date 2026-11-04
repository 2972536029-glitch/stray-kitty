import {useEffect,useState} from 'react';
import type {Catalog} from '../../contracts';
import type {ParcelPool} from './types';
import {FurnitureArt} from './ParcelArt';

export default function CollectionPolaroid({pool,catalog,owned}:{pool:ParcelPool;catalog:Catalog;owned:string[]}){
  const [featured,setFeatured]=useState(()=>pool.entries[Math.floor(Math.random()*pool.entries.length)]?.furnitureId);
  const shuffle=()=>setFeatured(previous=>{
    const choices=pool.entries.filter(entry=>entry.furnitureId!==previous);
    return choices.length?choices[Math.floor(Math.random()*choices.length)].furnitureId:previous;
  });
  useEffect(()=>{const timer=window.setInterval(()=>{if(!document.hidden)shuffle();},5200);return()=>clearInterval(timer);},[pool.id]);
  const furniture=catalog.furniture.find(item=>item.id===featured);if(!furniture)return null;
  return <div className="postal-preview-note" aria-label="套装藏品轮播" aria-live="off"><span className="postal-tape" aria-hidden="true"/><div className="postal-featured-frame"><FurnitureArt key={furniture.id} id={furniture.id} name={furniture.name} className="postal-featured-item"/></div><b>{furniture.name}</b><small>{owned.includes(furniture.id)?'已收藏':'待相遇'} · 套装藏品</small><button type="button" className="postal-feature-next" aria-label="随机展示另一件藏品" onClick={shuffle}>↻</button></div>;
}
