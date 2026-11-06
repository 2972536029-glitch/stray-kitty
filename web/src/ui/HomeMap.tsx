import {useEffect, useRef, useState} from 'react';
import type {Catalog, GameState} from '../contracts';
import {HOME_LAYOUT_ID, HOME_FRAMING, homeStage} from '../modules/home/layout';
import {homeInventory} from '../modules/home/objects';
import {paintHomestead} from '../modules/home/painter';
import {HOME_FRAMES,loadHomeArtwork, type HomeArtwork} from '../modules/home/assets';

export default function HomeMap({state, catalog}: {state: GameState; catalog: Catalog}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [art, setArt] = useState<HomeArtwork>();
  const [loadError, setLoadError] = useState(false);
  const items = homeInventory(state),placed = items.filter(item=>!item.stored);
  const sheetKey=[...new Set(placed.map(item=>HOME_FRAMES[item.sprite].sheet))].sort().join('|');
  useEffect(() => {let cancelled=false;setLoadError(false);void loadHomeArtwork(placed.map(item=>item.sprite)).then(value=>{if(!cancelled)setArt(current=>({...current,...value}));}).catch(()=>{if(!cancelled)setLoadError(true);});return()=>{cancelled=true;};}, [sheetKey]);
  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    ctx.save();ctx.translate(-HOME_FRAMING.x,-HOME_FRAMING.y);paintHomestead(ctx, state, art);ctx.restore();
  }, [state.flags, state.placements, state.homeLayout, state.homeDecorOwned, state.homeSurfaces, state.homeRepairs, state.phase, state.storyNodeId, catalog.slots, art]);
  return <figure className="home-map" data-layout={HOME_LAYOUT_ID}>
    <figcaption><h3>拱顶花房</h3><span>修缮 {homeStage(state)} / 4</span></figcaption>
    {loadError && <p role="alert">花房素材加载失败，请刷新重试。</p>}
    <canvas ref={canvas} width={HOME_FRAMING.width} height={HOME_FRAMING.height} data-artwork={art?'ready':'loading'} role="img" aria-label="单层拱顶花房地图，与场景中的家具布置同步"/>
    <p>已摆放 {placed.length} 件 · 背包 {items.length-placed.length} 件</p>
    <ul>{placed.filter(item=>item.furnitureId).map(item=><li key={item.layoutKey}><span>{catalog.furniture.find(f => f.id === item.furnitureId)?.name ?? item.name}<small>已摆进花房</small></span></li>)}</ul>
  </figure>;
}
