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

export type HomeHubTab='overview'|'parcels'|'shop'|'depart'|'warehouse'|'recharge';
const titles:Record<HomeHubTab,string>={overview:'家园手册',parcels:'猫爪邮局',shop:'猫咪补给站',depart:'章节地图',warehouse:'家园仓库',recharge:'金枪鱼补给小站'};
const stageNames=['漏雨避雨处','简易庇护所','原木温室','王国庆典'];
interface Props {state:GameState;catalog:Catalog;tab:HomeHubTab;locked:boolean;busy:boolean;error:string;onDecorate:()=>void;onClose:()=>void;onRetry:()=>void;journal:ReactNode;children:ReactNode}
export function HomeFurniturePreview({item,art}:{item:HomeItem;art?:HomeArtwork}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=ref.current!.getContext('2d')!;ctx.clearRect(0,0,176,130);if(!art)return;const f=HOME_FRAMES[item.sprite];drawHomeSprite(ctx,art,item.sprite,88,120,Math.min(155,108*f.width/f.height));},[item.sprite,art]);
  return <canvas ref={ref} width={176} height={130} aria-hidden="true"/>;
}
export default function HomeHub({state,catalog,tab,locked,busy,error,onDecorate,onClose,onRetry,journal,children}:Props){
  const [section,setSection]=useState<'home'|'journey'|'cats'|'collection'>('home'),[art,setArt]=useState<HomeArtwork>();
  const stage=homeStage(state),items=homeInventory(state),owned=items.filter(i=>i.furnitureId),project=currentHomeRenovation(state,catalog);
  useEffect(()=>{let active=true;void loadHomeArtwork().then(a=>{if(active)setArt(a);}).catch(()=>{});return()=>{active=false;};},[]);
  const body=useRef<HTMLDivElement>(null);
  useEffect(()=>{body.current?.scrollTo(0,0);},[tab,section]);
  return <Modal title={titles[tab]} className="home-hub" onClose={()=>{if(!locked)onClose();}}>
    <header className="home-hub-header"><div className="home-hub-title"><h2>{titles[tab]} <small>{stageNames[stage-1]}</small></h2></div></header>
    <div className="home-hub-layout">
      <div className="home-hub-content" ref={body}>
        {tab==='overview'?<><div className="home-hub-page-head"><nav aria-label="家园手册分类">{[['home','花房总览'],['journey','旅程记录'],['cats','猫咪伙伴'],['collection','家具收藏']].map(([id,title])=><button key={id} aria-pressed={section===id} disabled={locked} onClick={()=>setSection(id as typeof section)}>{title}</button>)}</nav><div><span className="eyebrow">A PLACE TO CALL HOME</span><p>看看我们的家，慢慢长成喜欢的样子。</p></div></div>
          {section==='home'?<div className="home-hub-overview"><div><HomeMap state={state} catalog={catalog}/></div><aside className="home-hub-growth"><span className="eyebrow">GROWING TOGETHER</span><h4>家的成长 <small>{stage} / 4</small></h4><ol>{stageNames.map((name,i)=><li key={name} className={stage===i+1?'current':stage>i+1?'done':''}><i>{stage>i+1?'✓':i+1}</i><div><b>{name}</b><small>{stage===i+1?'现在的花房':stage>i+1?'已经完成':i===3?'随终章故事点亮':'等待我们一起修好'}</small></div></li>)}</ol>{project?<div className="home-hub-repairs"><h5>{project.name}</h5>{project.parts?.map(p=><p key={p.id}><span>{state.homeRepairs?.includes(p.id)?'✓':'·'}</span>{p.name}</p>)}<button disabled={locked} onClick={onClose}>回场景查看修补位置 ›</button></div>:<div className="home-hub-note">{stage===4?'灯串亮起，伙伴们终于有了温暖的家。':'原木修缮已完成。继续旅程，终章故事会为花房带来庆典。'}</div>}</aside></div>
          :section==='journey'?journal:section==='cats'?<><div className="home-hub-companions-head"><h3>一路上的伙伴</h3><span>{state.cats.length} / {catalog.cats.length}</span></div><div className="home-hub-cats">{catalog.cats.map(cat=>{const known=state.cats.includes(cat.id);return <article key={cat.id} className={known?'':'locked'}><PixelCat breed={cat.id} size={90}/><h4>{cat.name} <small>{known?cat.id==='miaomiao'?'领队':'伙伴':'未相遇'}</small></h4><p>{known?cat.description:'还有新的相遇，在前方等待。'}</p>{known&&<small>回到场景，可以轻轻摸摸或拖到家具旁互动。</small>}</article>;})}</div><HomeMemories state={state}/></>
          :<><p className="home-hub-section-note">已收藏 {owned.length} 件家具。进入「布置家具」后，可以移动、收回或重新摆放。</p><div className="home-hub-collection">{owned.map(item=><button key={item.layoutKey} disabled={locked} onClick={onDecorate}><HomeFurniturePreview item={item} art={art}/><b>{catalog.furniture.find(f=>f.id===item.furnitureId)?.name??item.name}</b><small>{item.stored?'在背包里':'已摆进花房'} · 去布置 ›</small></button>)}{!owned.length&&<p>旅途中的礼物和主题包裹，会成为这里的收藏。</p>}</div></>}
        </>:<EmbeddedModalContext.Provider value={true}>{children}</EmbeddedModalContext.Provider>}
      </div>
    </div><footer className="home-hub-footer">{error?<div role="alert">{error}<button disabled={busy} onClick={onRetry}>重试上次操作</button></div>:<><span>我们的花房 · {stageNames[stage-1]}</span><small>{state.lastResult.message}</small></>}</footer>
  </Modal>;
}
