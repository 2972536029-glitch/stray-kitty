import type {Catalog, GameCommand, GameState} from '../contracts';
import {chapterMapCommand, chapterMapIsUnlocked, chapterMapStatus} from '../core/chapter-navigation';
import Modal from './Modal';
import PixelCat from './PixelCat';
import HomeMap from './HomeMap';

// 沿用 react-demo 的猫爪路线；当前区域与解锁状态读取实际存档。
export default function WorldMap({state, catalog, disabled, onNavigate, onClose}: {state: GameState; catalog: Catalog; disabled: boolean; onNavigate: (command: GameCommand) => void; onClose: () => void}) {
  return <Modal title="猫爪地图" onClose={onClose} className="world-map">
    <header><span className="eyebrow">CHAPTER ROUTE</span><h2>沿着气味，寻找家的方向</h2><p>“家”不只在终点，也会在伙伴身边慢慢长出来。</p></header>
    <div className="map-origin">⌂ 蓝碗之家 <span>咪最初想回去的地方</span></div>
    <HomeMap state={state} catalog={catalog}/>
    <ol className="map-route">{catalog.maps.map((map, index) => {
      const current = state.phase === 'home' ? map.id === 'greenhouse' : map.id === state.mapId;
      const command = chapterMapCommand(map.id, state);
      const status = current && map.id === 'greenhouse' ? `你在这里 · ${chapterMapStatus(map.id, false, state)}` : chapterMapStatus(map.id, current, state);
      const available = current || chapterMapIsUnlocked(map.id, state);
      return <li key={map.id} className={`map-stop ${current ? 'current' : ''} ${available ? '' : 'locked'}`}>
        <div className="map-dot" aria-hidden="true">{['▦', '★', '❀', '☾', '⌂'][index] ?? '◇'}</div>
        <div><h3>{map.name}</h3><p>{status}</p></div>
        {current && <PixelCat size={56}/>}<span>{current ? '当前' : available ? ['greenhouse', 'warehouse'].includes(map.id) ? '剧情' : '可探索' : '未开放'}</span>
        {command && <button disabled={disabled} onClick={() => onNavigate(command)}>前往{map.name}{['greenhouse', 'warehouse'].includes(map.id) ? '剧情' : ''}</button>}
      </li>;
    })}</ol>
    <footer>找回自己的家 <b>→</b> 帮伙伴找到家 <b>→</b> 一起创造家</footer>
  </Modal>;
}
