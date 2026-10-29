import {useEffect, useRef} from 'react';
import type {Catalog, GameState} from '../contracts';
import {HOME_LAYOUT_ID, HOME_SIZE, HOME_SLOTS, homeStage} from '../modules/home/layout';
import {paintHomestead} from '../modules/home/painter';

export default function HomeMap({state, catalog}: {state: GameState; catalog: Catalog}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const slots = catalog.slots.filter(slot => slot.id in HOME_SLOTS);
  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    paintHomestead(ctx, state);
    slots.forEach((slot, index) => {
      const {x, y} = HOME_SLOTS[slot.id];
      ctx.fillStyle = '#4e4535';ctx.fillRect(x - 9, y + 12, 20, 20);
      ctx.fillStyle = '#f2dfac';ctx.fillRect(x - 9, y + 10, 18, 18);
      ctx.fillStyle = '#4e4535';ctx.font = 'bold 13px monospace';ctx.textAlign = 'center';ctx.fillText(String.fromCharCode(65 + index), x, y + 24);
    });
  }, [state.flags, state.placements, state.phase, state.storyNodeId, catalog.slots]);
  return <figure className="home-map" data-layout={HOME_LAYOUT_ID}>
    <figcaption><div><span className="eyebrow">OUR LITTLE HOMESTEAD</span><h3>花房与小庭院</h3></div><span>修缮 {homeStage(state)} / 4</span></figcaption>
    <canvas ref={canvas} width={HOME_SIZE.width} height={HOME_SIZE.height} role="img" aria-label="花房家园俯视地图，显示温室、南侧入口、东侧庭院和五处家具位置"/>
    <ul>{slots.map((slot, index) => <li key={slot.id}><b>{String.fromCharCode(65 + index)}</b><span>{slot.name}<small>{catalog.furniture.find(f => f.id === state.placements[slot.id])?.name ?? '还没有摆放家具'}</small></span></li>)}</ul>
  </figure>;
}
