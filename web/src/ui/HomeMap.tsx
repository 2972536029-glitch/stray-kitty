import {useEffect, useRef, useState} from 'react';
import type {Catalog, GameState} from '../contracts';
import {HOME_LAYOUT_ID, HOME_SIZE, homeStage} from '../modules/home/layout';
import {homeInventory} from '../modules/home/objects';
import {paintHomestead} from '../modules/home/painter';
import {loadHomeArtwork, type HomeArtwork} from '../modules/home/assets';

export default function HomeMap({state, catalog}: {state: GameState; catalog: Catalog}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [art, setArt] = useState<HomeArtwork>();
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {let cancelled=false;void loadHomeArtwork().then(value=>{if(!cancelled)setArt(value);}).catch(()=>{if(!cancelled)setLoadError(true);});return()=>{cancelled=true;};}, []);
  const placed = homeInventory(state).filter(item=>!item.stored);
  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    paintHomestead(ctx, state, art);
  }, [state.flags, state.placements, state.homeLayout, state.homeRepairs, state.phase, state.storyNodeId, catalog.slots, art]);
  return <figure className="home-map" data-layout={HOME_LAYOUT_ID}>
    <figcaption><div><span className="eyebrow">OUR LITTLE HOMESTEAD</span><h3>拱顶花房</h3></div><span>修缮 {homeStage(state)} / 4</span></figcaption>
    {loadError && <p role="alert">花房素材加载失败，请刷新重试。</p>}
    <canvas ref={canvas} width={HOME_SIZE.width} height={HOME_SIZE.height} data-artwork={art?'ready':'loading'} role="img" aria-label="单层拱顶花房地图，与场景中的家具布置同步"/>
    <p>{placed.length} 件家具 · 点击「布置家具」，可以拖动家具、收回或重新布置。</p>
    <ul>{placed.filter(item=>item.furnitureId).map(item=><li key={item.layoutKey}><span>{catalog.furniture.find(f => f.id === item.furnitureId)?.name ?? item.name}<small>已摆进花房</small></span></li>)}</ul>
  </figure>;
}
