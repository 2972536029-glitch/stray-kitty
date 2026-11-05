import {useEffect,useRef,useState} from 'react';
import type {Catalog,GameCommand,GameState} from '../../contracts';
import {HOME_FRAMES,loadHomeArtwork,type HomeArtwork} from './assets';
import {homeInventory,type HomeItem} from './objects';
import {drawHomeSprite} from './painter';
import {FURNITURE_CATEGORIES} from './furnishings';

function FurniturePreview({item,art}:{item:HomeItem;art?:HomeArtwork}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=ref.current!.getContext('2d')!;ctx.clearRect(0,0,176,150);if(!art)return;const f=HOME_FRAMES[item.sprite];drawHomeSprite(ctx,art,item.sprite,88,140,Math.min(160,130*f.width/f.height));},[item.sprite,art]);
  return <canvas ref={ref} width={176} height={150} aria-hidden="true"/>;
}
const location=(item:HomeItem)=>item.owned===false?item.acquisition?.kind==='gift'?'可领取':'可制作':item.stored?'背包中':'已摆放';
export default function HomeCollection({state,catalog,locked,onDecorate,onCommand}:{state:GameState;catalog:Catalog;locked:boolean;onDecorate:(id?:string)=>void;onCommand:(command:GameCommand)=>Promise<boolean>}){
  const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[selection,setSelection]=useState('');
  const [art,setArt]=useState<HomeArtwork>();
  useEffect(()=>{let active=true;void loadHomeArtwork().then(a=>{if(active)setArt(a);}).catch(()=>{});return()=>{active=false;};},[]);
  const items=homeInventory(state,true).map(item=>({...item,name:catalog.furniture.find(f=>f.id===item.furnitureId)?.name??item.name}));
  const matches=(item:HomeItem,id:string)=>id==='all'||(id==='available'?item.owned===false:item.owned!==false&&(id==='stored'?item.stored:!item.stored));
  const shown=items.filter(item=>matches(item,filter)&&item.name.includes(query.trim()));
  const selected=shown.find(item=>item.layoutKey===selection)??shown[0];
  const definition=catalog.furniture.find(f=>f.id===selected?.furnitureId);
  const source=selected?.acquisition?selected.acquisition.kind==='gift'?'终章庆典赠礼':'材料制作':definition?definition.source==='free_pool'?'猫爪邮局 · 苔叶来信':definition.source==='paid_pool'?'猫爪邮局 · 月海观星':'旅程赠礼':'花房修缮保留';
  const material=selected?.acquisition?.material??0;
  return <section className="home-collection" aria-label="家具收藏">
    <div className="home-collection-toolbar"><div role="group" aria-label="家具位置">{[['all','全部'],['placed','已摆放'],['stored','背包'],['available','可获取']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label} {items.filter(item=>matches(item,id)).length}</button>)}</div><input aria-label="搜索家具" placeholder="搜索家具" value={query} onChange={event=>setQuery(event.target.value)}/></div>
    <div className="home-collection-layout"><div className="home-hub-collection">{shown.map(item=><button key={item.layoutKey} aria-pressed={selected?.layoutKey===item.layoutKey} onClick={()=>setSelection(item.layoutKey)} className={item.owned===false?'unowned':''}><FurniturePreview item={item} art={art}/><b>{item.name}</b><small>{location(item)}</small></button>)}{!shown.length&&<p className="home-hub-note">没有找到符合条件的家具。</p>}</div>
      {selected&&<aside className="home-collection-detail" aria-label="家具详情">
        <div className="home-collection-detail-heading"><span>{FURNITURE_CATEGORIES[selected.category]}</span><span>{location(selected)}</span></div>
        <div className="home-collection-detail-body"><FurniturePreview item={selected} art={art}/><h3>{selected.name}</h3>
        {(selected.description??definition?.description)&&<p>{selected.description??definition?.description}</p>}
        <dl><div><dt>获取方式</dt><dd>{source}</dd></div><div><dt>布置宽度</dt><dd>约 {Math.round(selected.width/1.7)} cm</dd></div></dl>
        </div><div className="home-collection-detail-footer">{selected.owned===false?<><p className="home-collection-cost">{material?`材料 ${material} · 持有 ${state.inventory.material??0}`:'庆典礼物 · 免费领取'}</p><button disabled={locked||(state.inventory.material??0)<material} onClick={()=>void onCommand({type:'ACQUIRE_HOME_DECOR',decorId:selected.layoutKey})}>{locked?'处理中…':material?(state.inventory.material??0)<material?'材料不足':`制作 · 材料 ${material}`:'领取庆典礼物'}</button></>:<button disabled={locked} onClick={()=>onDecorate(selected.furnitureId??selected.layoutKey)}>布置这件家具 →</button>}</div>
      </aside>}
    </div>
  </section>;
}
