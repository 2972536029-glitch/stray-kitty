import type {Catalog,GameCommand,GameState} from '../contracts';
import {chapterMapCommand,chapterMapIsUnlocked,chapterMapStatus} from '../core/chapter-navigation';
import {preloadChapterArtwork} from '../modules/map/artwork';
import Modal from './Modal';
import WindowHeading from './WindowHeading';
import './panels.css';

const chapters:Record<string,string>={alley:'第一章',market:'第二章',greenhouse:'第三章',tunnel:'第四章',warehouse:'终章'};
const summaries:Record<string,string>={alley:'寻找点点，穿过雨后的小巷。',market:'拜访集市街坊，打听伙伴与黑影的消息。',greenhouse:'和墨墨相遇，一起守护花房。',tunnel:'沿着地下暗道，寻找失踪的猫咪。',warehouse:'进入仓库，照亮最后一段救援之路。'};

export default function WorldMap({state,catalog,disabled,onNavigate,onClose}:{state:GameState;catalog:Catalog;disabled:boolean;onNavigate:(command:GameCommand)=>void;onClose:()=>void}) {
  const currentId=state.phase==='home'?'greenhouse':state.mapId;
  return <Modal variant="paper" title="猫爪地图" onClose={onClose} className="world-map chapter-map">
    <WindowHeading title="章节地图" icon="map" className="chapter-map-header" actions={state.phase==='explore'&&state.flags.includes('rescue_story_done')?<button disabled={disabled} onClick={()=>onNavigate({type:'GO_HOME'})}>返回花房</button>:undefined}/>

    <div className="chapter-map-body">
      <ol className="map-route">{catalog.maps.map(map=>{
        const current=map.id===currentId,available=current||chapterMapIsUnlocked(map.id,state),command=chapterMapCommand(map.id,state);
        const status=available?summaries[map.id]:map.id==='greenhouse'?'穿过集市出口后开放':chapterMapStatus(map.id,false,state);
        return <li key={map.id} aria-current={current?'location':undefined} className={`map-stop ${current?'current':''} ${available?'':'locked'}`}>
          <div className="chapter-cover"><img src={`/assets/chapters/${map.id}-cover-v1.webp`} alt="" loading="lazy"/><span>{chapters[map.id]}</span></div>
          <div className="chapter-stop-copy"><div><h3>{state.phase==='home'&&current?'拱顶花房':map.name}</h3><span className="chapter-status">{current?'⌖ 你在这里':available?'已解锁':'未开放'}</span></div><p>{status}</p></div>
          {command&&<button disabled={disabled} onPointerEnter={()=>preloadChapterArtwork(map.id)} onFocus={()=>preloadChapterArtwork(map.id)} onPointerDown={()=>preloadChapterArtwork(map.id)} onClick={()=>onNavigate(command)}>{map.id==='greenhouse'?'重温故事':map.id==='warehouse'&&!state.flags.includes('finale_started')?'开启终章':current?'继续探索':'前往探索'} →</button>}
        </li>;
      })}</ol>
    </div>
  </Modal>;
}
