import {useState} from 'react';
import type {Catalog,GameState} from '../../contracts';
import type {ParcelPool} from './types';
import Modal from '../../ui/Modal';
import {FurnitureArt} from './ParcelArt';
import {poolStatus} from './model';
import {parcelFrame,parcelWidth} from './furnitureArt';

export const catNames:Record<string,string>={miaomiao:'喵喵',tuanzi:'团子',diandian:'点点',momo:'墨墨'};
const actions:Record<string,string>={castle_peek:'探头躲猫猫',belly:'翻肚休息',hammock_sleep:'跳上去打盹',knead:'踩奶',sniff:'凑近嗅一嗅',watch:'抬头看摆锤',bat_ball:'拨弄毛线球',perch:'跳上坐好',bat_chime:'抬爪拨风铃'};
export default function CapsuleCollection({state,catalog,pool,onClose}:{state:GameState;catalog:Catalog;pool:ParcelPool;onClose:()=>void}){
  const [selected,setSelected]=useState(pool.entries[0]?.furnitureId),status=poolStatus(state,pool),item=catalog.furniture.find(f=>f.id===selected);
  const scale=Math.min(.45,...pool.entries.map(e=>{const f=parcelFrame(e.furnitureId),w=parcelWidth(e.furnitureId);return f?Math.min(110/w,84/(w*f.height/f.width)):.45;}));
  return <Modal title={`${pool.theme}家具图鉴`} className={`capsule-collection ${pool.currency==='tuna'?'collection-moon':''}`} onClose={onClose}>
    <header className="collection-header"><span className="eyebrow">THE LITTLE FURNITURE ARCHIVE</span><h2>{pool.theme} <small>家具图鉴</small></h2><p>已收藏 {pool.entries.length-status.missing.length} / {pool.entries.length} 件 · 点选家具查看细节与互动</p></header>
    <div className="collection-body"><div className="parcel-prizes" aria-label={`${pool.theme}家具清单`}>{pool.entries.map(entry=>{
      const f=catalog.furniture.find(f=>f.id===entry.furnitureId)!,owned=state.furniture.includes(f.id);
      return <article key={f.id} className={`parcel-prize ${owned?'owned':''}`}><button className="parcel-art-preview" aria-label={`${f.name}，放大查看`} aria-pressed={selected===f.id} onClick={()=>setSelected(f.id)}><span className="parcel-owned">{owned?'✓ 已收藏':'待相遇'}</span><FurnitureArt id={f.id} name={f.name} scale={scale}/><b>{f.name}</b><small>{Number(status.chance(f.id).toFixed(1))}%</small></button></article>;
    })}</div>{item&&<section className="collection-detail" aria-label={`${item.name}细节`}><span className="eyebrow">{state.furniture.includes(item.id)?'ALREADY HOME':'WAITING FOR A LITTLE HOME'}</span><h3>{item.name}</h3><FurnitureArt id={item.id} name={item.name} detail/><p>{item.description}</p><dl><div><dt>布置宽度</dt><dd>约 {item.widthCm} cm</dd></div><div><dt>{status.guaranteed?'本次保底概率':'基础抽取概率'}</dt><dd>{Number(status.chance(item.id).toFixed(1))}%</dd></div></dl><p className="collection-cat">{catNames[item.interactionCat??'']??'猫咪伙伴'}可以{actions[item.interaction??'']??'过来一起玩'}。</p><small>获得后在花房布置，原有猫咪家具互动继续生效。</small></section>}</div>
  </Modal>;
}
