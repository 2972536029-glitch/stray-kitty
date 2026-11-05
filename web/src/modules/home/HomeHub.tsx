import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {Catalog,GameState} from '../../contracts';
import Modal,{EmbeddedModalContext} from '../../ui/Modal';
import HomeMap from '../../ui/HomeMap';
import PixelCat from '../../ui/PixelCat';
import {HOME_FRAMES,loadHomeArtwork,type HomeArtwork} from './assets';
import {homeInventory,type HomeItem} from './objects';
import {drawHomeSprite} from './painter';
import {homeStage} from './layout';
import {currentHomeRenovation} from './repairs';
import {HomeMemories} from '../../ui/HomePanel';
import './hub.css';

export type HomeHubTab='overview'|'parcels'|'shop'|'depart'|'recharge';
const titles:Record<HomeHubTab,string>={overview:'家园手册',parcels:'猫爪邮局',shop:'猫咪补给站',depart:'章节地图',recharge:'金枪鱼补给小站'};
const stageNames=['漏雨避雨处','简易庇护所','原木温室','王国庆典'];
interface Props {state:GameState;catalog:Catalog;tab:HomeHubTab;locked:boolean;busy:boolean;error:string;onDecorate:(id?:string)=>void;onClose:()=>void;onRetry:()=>void;journal:ReactNode;children:ReactNode}

export function HomeFurniturePreview({item,art}:{item:HomeItem;art?:HomeArtwork}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=ref.current!.getContext('2d')!;ctx.clearRect(0,0,176,130);if(!art)return;const f=HOME_FRAMES[item.sprite];drawHomeSprite(ctx,art,item.sprite,88,120,Math.min(155,108*f.width/f.height));},[item.sprite,art]);
  return <canvas ref={ref} width={176} height={130} aria-hidden="true"/>;
}

export default function HomeHub({state,catalog,tab,locked,busy,error,onDecorate,onClose,onRetry,journal,children}:Props) {
  const [section,setSection]=useState<'home'|'journey'|'cats'|'collection'>('home');
  const [filter,setFilter]=useState<'all'|'placed'|'stored'>('all'),[query,setQuery]=useState('');
  const [art,setArt]=useState<HomeArtwork>();
  const stage=homeStage(state),items=homeInventory(state),project=currentHomeRenovation(state,catalog);
  const named=items.map(item=>({...item,name:catalog.furniture.find(f=>f.id===item.furnitureId)?.name??item.name}));
  const shown=named.filter(item=>(filter==='all'||(filter==='stored'?item.stored:!item.stored))&&item.name.includes(query.trim()));
  const body=useRef<HTMLDivElement>(null);
  useEffect(()=>{let active=true;void loadHomeArtwork().then(a=>{if(active)setArt(a);}).catch(()=>{});return()=>{active=false;};},[]);
  useEffect(()=>{body.current?.scrollTo(0,0);},[tab,section]);
  return <Modal title={titles[tab]} className={`home-hub home-hub-${tab}`} onClose={()=>{if(!locked)onClose();}}>
    <header className="home-hub-header"><div className="home-hub-title"><h2>{titles[tab]}</h2>{tab==='overview'&&<span>{stageNames[stage-1]}</span>}</div>{tab==='overview'&&section==='home'&&<div className="home-overview-actions"><button disabled={locked} onClick={()=>onDecorate()}>布置花房</button><button className="secondary" onClick={()=>setSection('journey')}>查看旅程 →</button></div>}</header>
    <div className="home-hub-layout"><div className="home-hub-content" ref={body}>
      {tab==='overview'?<>
        <nav className="home-hub-tabs" aria-label="家园手册分类">{[['home','花房总览'],['journey','旅程记录'],['cats','猫咪伙伴'],['collection','家具收藏']].map(([id,title])=><button key={id} aria-pressed={section===id} disabled={locked} onClick={()=>setSection(id as typeof section)}>{title}</button>)}</nav>
        {section==='home'?<div className="home-hub-overview"><div><HomeMap state={state} catalog={catalog}/></div>
          <aside className="home-hub-growth"><h3>修缮进度 <span>{stage} / 4</span></h3><ol>{stageNames.map((name,i)=><li key={name} className={stage===i+1?'current':stage>i+1?'done':''}><i>{stage>i+1?'✓':i+1}</i><b>{name}</b>{stage===i+1&&<span>当前</span>}</li>)}</ol>
            {project?<div className="home-hub-repairs"><h4>接下来修缮</h4><p>{project.name}</p><ul>{project.parts?.map(part=><li key={part.id}><span>{state.homeRepairs?.includes(part.id)?'✓':'○'}</span>{part.name}</li>)}</ul><button disabled={locked} onClick={onClose}>回花房修缮 →</button></div>:<p className="home-hub-note">{stage===4?'花房已完成全部修缮。':'结构修缮完成，继续旅程开启庆典。'}</p>}
          </aside></div>
        :section==='journey'?journal
        :section==='cats'?<><div className="home-hub-companions-head"><h3>一路上的伙伴</h3><span>{state.cats.length} / {catalog.cats.length}</span></div><div className="home-hub-cats">{catalog.cats.map(cat=>{const known=state.cats.includes(cat.id);return <article key={cat.id} className={known?'':'locked'}><PixelCat breed={cat.id} size={100}/><h4>{cat.name}<small>{known?cat.id==='miaomiao'?'领队':'伙伴':'尚未结识'}</small></h4><p>{known?cat.description:'继续旅程，与新的伙伴相遇。'}</p></article>;})}</div><HomeMemories state={state}/></>
        :<><div className="home-collection-toolbar"><div role="group" aria-label="家具位置">{[['all','全部'],['placed','已摆放'],['stored','背包']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id as typeof filter)}>{label} {items.filter(item=>id==='all'||(id==='stored'?item.stored:!item.stored)).length}</button>)}</div><input aria-label="搜索已解锁家具" placeholder="搜索家具" value={query} onChange={event=>setQuery(event.target.value)}/></div>
          <div className="home-hub-collection">{shown.map(item=><button key={item.layoutKey} disabled={locked} onClick={()=>onDecorate(item.furnitureId??item.layoutKey)}><HomeFurniturePreview item={item} art={art}/><b>{item.name}</b><small>{item.stored?'背包中':'已摆放'} · 去布置 →</small></button>)}</div>{!shown.length&&<p className="home-hub-note">没有找到符合条件的家具。</p>}</>}
      </>:<EmbeddedModalContext.Provider value={true}>{children}</EmbeddedModalContext.Provider>}
    </div></div>
    {error&&tab!=='shop'&&<footer className="home-hub-footer" role="alert"><span>{error}</span><button disabled={busy} onClick={onRetry}>重试上次操作</button></footer>}
  </Modal>;
}
