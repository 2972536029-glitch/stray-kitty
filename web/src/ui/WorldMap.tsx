import type {Catalog, GameCommand, GameState} from '../contracts';
import Modal from './Modal';
import PixelCat from './PixelCat';

// 沿用 react-demo 的猫爪路线；当前区域与解锁状态读取实际存档。
export default function WorldMap({state, catalog, disabled, onNavigate, onClose}: {state: GameState; catalog: Catalog; disabled: boolean; onNavigate: (command: GameCommand) => void; onClose: () => void}) {
  const homeOpen = state.flags.includes('alley_rescued');
  return <Modal title="猫爪地图" onClose={onClose} className="world-map">
    <header><span className="eyebrow">CHAPTER ROUTE</span><h2>沿着气味，寻找家的方向</h2><p>“家”不只在终点，也会在伙伴身边慢慢长出来。</p></header>
    <div className="map-origin">⌂ 蓝碗之家 <span>咪最初想回去的地方</span></div>
    <ol className="map-route">{catalog.maps.map((map, index) => {
      const current = map.id === state.mapId;
      const tunnelOpen = state.flags.includes('chapter_4_started') || state.flags.includes('tunnel_unlocked');
      const unlocked = map.id === 'alley' || (map.id === 'greenhouse' && homeOpen) || (map.id === 'market' && homeOpen) || (map.id === 'tunnel' && tunnelOpen);
      let command: GameCommand | null = null;
      if (map.id === 'alley' && (state.phase === 'home' || (state.phase === 'explore' && state.mapId !== 'alley'))) {
        command = {type: 'GO_EXPLORE', mapId: 'alley'};
      } else if (map.id === 'market' && (state.phase === 'home' || (state.phase === 'explore' && state.mapId !== 'market')) && homeOpen) {
        command = {type: 'GO_EXPLORE', mapId: 'market'};
      } else if (map.id === 'tunnel' && (state.phase === 'home' || (state.phase === 'explore' && state.mapId !== 'tunnel')) && tunnelOpen) {
        command = {type: 'GO_EXPLORE', mapId: 'tunnel'};
      } else if (map.id === 'greenhouse' && state.phase === 'explore' && homeOpen) {
        command = {type: 'GO_HOME'};
      }
      return <li key={map.id} className={`map-stop ${current ? 'current' : ''} ${unlocked ? '' : 'locked'}`}>
        <div className="map-dot" aria-hidden="true">{['▦', '★', '❀', '☾', '⌂'][index] ?? '◇'}</div>
        <div><h3>{map.name}</h3><p>{current ? '你在这里' : unlocked ? '已经解锁' : map.status === 'planned' ? '后续章节开放' : '完成首次救援后开放'}</p></div>
        {current && <PixelCat size={56}/>}<span>{current ? '当前' : unlocked ? '可探索' : '未解锁'}</span>
        {command && <button disabled={disabled} onClick={() => onNavigate(command)}>前往{map.name}</button>}
      </li>;
    })}</ol>
    <footer>找回自己的家 <b>→</b> 帮伙伴找到家 <b>→</b> 一起创造家</footer>
  </Modal>;
}
