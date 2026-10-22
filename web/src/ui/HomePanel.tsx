import {useState} from 'react';
import type {Catalog, GameCommand, GameState} from '../contracts';

export default function HomePanel({state, catalog, disabled, onCommand, onShop}: {state: GameState; catalog: Catalog; disabled: boolean; onCommand: (command: GameCommand) => void; onShop: () => void}) {
  const [selected, setSelected] = useState('cardboard_nest');
  const furniture = state.furniture.includes(selected) ? selected : state.furniture[0] ?? '';
  const name = (id: string) => catalog.furniture.find(f => f.id === id)?.name ?? id;
  const pool = catalog.pools.find(p => p.id === 'rainy_box');
  const total = pool?.entries.reduce((sum, e) => sum + e.weight, 0) ?? 0;
  return <section className="journal-card home-panel"><span className="eyebrow">MAKE IT OURS</span><h2>整理我们的家</h2>
    <label className="select-label">选择家具<select value={furniture} onChange={e => setSelected(e.target.value)} disabled={disabled}>{state.furniture.map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label>
    <div className="slot-list">{catalog.slots.map(slot => <button className="secondary" key={slot.id} disabled={disabled || !furniture} onClick={() => onCommand({type: 'PLACE_FURNITURE', furnitureId: furniture, slotId: slot.id})}>{slot.name}<small>{state.placements[slot.id] ? name(state.placements[slot.id]) : '还空着，放一件家具'}</small></button>)}</div>
    <button className="shop-home" disabled={disabled} onClick={onShop}>去猫国商店挑一件家具 ↗</button>
    {pool && <><button disabled={disabled || (state.currencies.stamp ?? 0) < pool.cost} onClick={() => onCommand({type: 'DRAW_FURNITURE', poolId: pool.id})}>打开雨夜包裹 · {pool.cost} 邮票</button><p className="muted">{pool.entries.map(e => `${name(e.furnitureId)} ${Math.round(e.weight / total * 100)}%`).join('，')}；重复家具转化为 2 份材料。</p></>}
    <p className="home-result" role="status">{state.lastResult.message}</p>
    <button className="quiet" disabled={disabled} onClick={() => onCommand({type: 'GO_EXPLORE'})}>再去小巷走走 →</button>
  </section>;
}
