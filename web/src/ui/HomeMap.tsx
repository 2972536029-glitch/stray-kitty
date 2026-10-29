import {useEffect, useRef, useState} from 'react';
import type {Catalog, GameState} from '../contracts';
import {HOME_LAYOUT_ID, HOME_SIZE, HOME_SLOTS, homeStage} from '../modules/home/layout';
import {paintHomestead} from '../modules/home/painter';
import {loadHomeArtwork, type HomeArtwork} from '../modules/home/assets';

export default function HomeMap({state, catalog}: {state: GameState; catalog: Catalog}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [art, setArt] = useState<HomeArtwork>();
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {let cancelled=false;void loadHomeArtwork().then(value=>{if(!cancelled)setArt(value);}).catch(()=>{if(!cancelled)setLoadError(true);});return()=>{cancelled=true;};}, []);
  const slots = catalog.slots.filter(slot => slot.id in HOME_SLOTS);
  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    paintHomestead(ctx, state, art);
    slots.forEach((slot, index) => {
      const {x, y} = HOME_SLOTS[slot.id];
      ctx.fillStyle = '#4e4535';ctx.fillRect(x - 17, y + 18, 36, 34);
      ctx.fillStyle = '#f2dfac';ctx.fillRect(x - 17, y + 16, 32, 30);
      ctx.fillStyle = '#4e4535';ctx.font = 'bold 23px monospace';ctx.textAlign = 'center';ctx.fillText(String.fromCharCode(65 + index), x, y + 40);
    });
  }, [state.flags, state.placements, state.phase, state.storyNodeId, catalog.slots, art]);
  return <figure className="home-map" data-layout={HOME_LAYOUT_ID}>
    <figcaption><div><span className="eyebrow">OUR LITTLE HOMESTEAD</span><h3>拱顶花房</h3></div><span>修缮 {homeStage(state)} / 4</span></figcaption>
    {loadError && <p role="alert">花房素材加载失败，请刷新重试。</p>}
    <canvas ref={canvas} width={HOME_SIZE.width} height={HOME_SIZE.height} data-artwork={art?'ready':'loading'} role="img" aria-label="单层拱顶花房地图，显示南侧入口、室内花圃、活动区和五处家具位置"/>
    <ul>{slots.map((slot, index) => <li key={slot.id}><b>{String.fromCharCode(65 + index)}</b><span>{slot.name}<small>{catalog.furniture.find(f => f.id === state.placements[slot.id])?.name ?? '还没有摆放家具'}</small></span></li>)}</ul>
  </figure>;
}
