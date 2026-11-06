import {useEffect,useRef,useState} from 'react';
import type {Catalog,GameCommand,GameState,HomeSurface} from '../../contracts';
import {HOME_FRAMES,loadHomeArtwork,type HomeArtwork} from './assets';
import {homeInventory,type HomeItem} from './objects';
import {drawHomeSprite} from './painter';
import {FURNITURE_CATEGORIES} from './furnishings';
import {HOME_SURFACES,homeSurfaceSelection,ownsHomeSurface,surfaceCollectionProgress} from './surfaces';
import SurfacePreview from './SurfacePreview';

function FurniturePreview({item,art}:{item:HomeItem;art?:HomeArtwork}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=ref.current!.getContext('2d')!;ctx.clearRect(0,0,176,150);if(!art)return;const f=HOME_FRAMES[item.sprite];drawHomeSprite(ctx,art,item.sprite,88,140,Math.min(160,130*f.width/f.height));},[item.sprite,art]);
  return <canvas ref={ref} width={176} height={150} aria-hidden="true"/>;
}
interface Entry {key:string;name:string;owned:boolean;placed:boolean;theme:string;item?:HomeItem;surface?:HomeSurface}
export default function HomeCollection({state,catalog,locked,onDecorate,onCommand,onParcels}:{state:GameState;catalog:Catalog;locked:boolean;onDecorate:(id?:string)=>void;onCommand:(command:GameCommand)=>Promise<boolean>;onParcels:()=>void}){
  const [filter,setFilter]=useState('all'),[theme,setTheme]=useState('all'),[query,setQuery]=useState(''),[selection,setSelection]=useState('');
  const [art,setArt]=useState<HomeArtwork>();
  useEffect(()=>{let active=true;void loadHomeArtwork().then(a=>{if(active)setArt(a);}).catch(()=>{});return()=>{active=false;};},[]);
  const entries:Entry[]=homeInventory(state,true).map(item=>({key:item.layoutKey,name:catalog.furniture.find(f=>f.id===item.furnitureId)?.name??item.name,owned:item.owned!==false,placed:item.owned!==false&&!item.stored,theme:catalog.pools.find(pool=>pool.entries.some(e=>e.furnitureId===item.furnitureId))?.id??'basic',item}));
  const finishes=homeSurfaceSelection(state);
  const location=(entry:Entry)=>!entry.owned?entry.surface&&surfaceCollectionProgress(state,catalog,entry.surface)>=(entry.surface.requiredOwned??Infinity)?'可领取':entry.item?.acquisition?entry.item.acquisition.kind==='gift'?'可领取':'可制作':'待相遇':entry.surface?entry.placed?'使用中':'未使用':entry.placed?'已摆放':'背包中';
  entries.push(...HOME_SURFACES.map(surface=>({key:'surface:'+surface.id,name:surface.name,owned:ownsHomeSurface(state,surface),placed:finishes[surface.kind]===surface.id,theme:surface.kind,surface})));
  const themed=entries.filter(entry=>theme==='all'||entry.theme===theme);
  const matches=(entry:Entry,id:string)=>id==='all'||(id==='available'?!entry.owned:entry.owned&&(id==='stored'?!entry.placed:entry.placed));
  const shown=themed.filter(entry=>matches(entry,filter)&&entry.name.includes(query.trim()));
  const selected=shown.find(entry=>entry.key===selection)??shown[0],item=selected?.item,surface=selected?.surface;
  const definition=catalog.furniture.find(f=>f.id===item?.furnitureId),pool=catalog.pools.find(p=>p.id===(surface?.poolId??selected?.theme));
  const progress=surface?surfaceCollectionProgress(state,catalog,surface):0,required=surface?.requiredOwned??0,material=item?.acquisition?.material??0;
  const source=surface?surface.default?'花房原有':`${pool?.theme} · 收藏奖励`:item?.acquisition?item.acquisition.kind==='gift'?'终章庆典赠礼':'材料制作':pool?`猫爪邮局 · ${pool.theme}`:definition?'旅程赠礼':'花房修缮保留';
  const preview=(entry:Entry)=>entry.surface?<SurfacePreview item={entry.surface}/>:<FurniturePreview item={entry.item!} art={art}/>;
  return <section className="home-collection" aria-label="家具收藏">
    <nav className="home-collection-types" aria-label="收藏类别">{[['all','全部'],['basic','基础家具'],...catalog.pools.map(pool=>[pool.id,pool.theme]),['wallpaper','墙纸'],['floor','地板']].map(([id,label])=><button key={id} aria-pressed={theme===id} onClick={()=>setTheme(id)}>{label}</button>)}</nav>
    <div className="home-collection-toolbar"><div role="group" aria-label="家具位置">{[['all','全部'],['placed','已摆放'],['stored','背包'],['available','可获取']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label} {themed.filter(entry=>matches(entry,id)).length}</button>)}</div><input aria-label="搜索家具" placeholder="搜索家具" value={query} onChange={event=>setQuery(event.target.value)}/></div>
    <div className="home-collection-layout"><div className="home-hub-collection">{shown.map(entry=><button key={entry.key} aria-pressed={selected?.key===entry.key} onClick={()=>setSelection(entry.key)} className={!entry.owned?'unowned':''}>{preview(entry)}<b>{entry.name}</b><small>{location(entry)}</small></button>)}{!shown.length&&<p className="home-hub-note">没有找到符合条件的收藏。</p>}</div>
      {selected&&<aside className="home-collection-detail" aria-label="家具详情">
        <div className="home-collection-detail-heading"><span>{surface?surface.kind==='wallpaper'?'墙纸':'地板':FURNITURE_CATEGORIES[item!.category]}</span><span>{location(selected)}</span></div>
        <div className="home-collection-detail-body">{preview(selected)}<h3>{selected.name}</h3>
        {(surface?.description??item?.description??definition?.description)&&<p>{surface?.description??item?.description??definition?.description}</p>}
        <dl><div><dt>获取方式</dt><dd>{source}</dd></div>{surface&&!surface.default?<div><dt>主题收藏</dt><dd>{progress} / {required} 件</dd></div>:item&&<div><dt>布置宽度</dt><dd>约 {Math.round(item.width/1.7)} cm</dd></div>}</dl>
        </div><div className="home-collection-detail-footer">
          {selected.owned?<button disabled={locked} onClick={()=>onDecorate(surface?selected.key:item!.furnitureId??selected.key)}>{surface?surface.kind==='wallpaper'?'更换墙纸 →':'更换地板 →':'布置这件家具 →'}</button>
          :surface?progress>=required?<button disabled={locked} onClick={()=>void onCommand({type:'ACQUIRE_HOME_SURFACE',surfaceId:surface.id})}>领取收藏奖励</button>:<><p className="home-collection-cost">集齐 {required} 件{pool?.theme}家具后领取</p><button disabled={locked} onClick={onParcels}>前往猫爪邮局 →</button></>
          :item?.acquisition?<><p className="home-collection-cost">{material?`材料 ${material} · 持有 ${state.inventory.material??0}`:'庆典礼物 · 免费领取'}</p><button disabled={locked||(state.inventory.material??0)<material} onClick={()=>void onCommand({type:'ACQUIRE_HOME_DECOR',decorId:selected.key})}>{locked?'处理中…':material?(state.inventory.material??0)<material?'材料不足':`制作 · 材料 ${material}`:'领取庆典礼物'}</button></>
          :<button disabled={locked||!pool} onClick={onParcels}>{pool?'前往猫爪邮局 →':'继续旅程获取'}</button>}
        </div>
      </aside>}
    </div>
  </section>;
}
