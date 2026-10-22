import type {ReactNode} from 'react';
import type {Catalog, GameCommand, GameState} from '../contracts';
import type {Direction} from '../adapters/platform/input';
import {currentStory, objective} from '../core/story';
import PixelCat from './PixelCat';
import DialoguePanel from './DialoguePanel';
import DiceEvent, {Dice} from './DiceEvent';
import HomePanel from './HomePanel';
import EventResult from './EventResult';

const phases: Record<string, string> = {dialogue: '猫咪物语', explore: '小巷探索', event: '一次相遇', preparation: '守护准备', battle: '点亮防线', settlement: '救援结果', home: '我们的花房'};
interface Props {
  state: GameState; catalog: Catalog; busy: boolean; pending: boolean; disabled: boolean; paused: boolean; near: boolean;
  onCommand: (command: GameCommand) => void; onDirection: (direction: Direction, held: boolean) => void;
  onPause: () => void; onMap: () => void; onShop: () => void; onTitle: () => void; children: ReactNode;
}
export default function GameScreen({state, catalog, busy, pending, disabled, paused, near, onCommand, onDirection, onPause, onMap, onShop, onTitle, children}: Props) {
  const node = currentStory(catalog, state);
  const chapter = catalog.chapters.find(c => c.id === state.chapterId);
  const event = catalog.events.find(e => e.id === state.pendingEventId);
  const map = catalog.maps.find(m => m.id === state.mapId);
  const resolution = state.eventState?.lastResolution;
  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={onTitle} aria-label="返回标题"><span className="brand-mark">ฅ</span><span><strong>小猫回家记</strong><small>流 浪 猫 王 国</small></span></button>
      <span className="chapter-pill">{chapter?.title}</span><nav aria-label="旅程工具"><button className="map-button" aria-label="章节地图" onClick={onMap}>▦ <span>章节地图</span></button><button className="shop-button" aria-label="猫国商店" onClick={onShop}>▣ <span>猫国商店</span></button></nav></header>
    <main><div className="page-heading"><div><span className="eyebrow">A LITTLE JOURNEY HOME</span><h1>{state.phase === 'home' ? '这里，慢慢有了家的样子。' : '一只猫的旅程，一群猫的家。'}</h1><p>咪想回家。那就先帮伙伴找到家。</p></div><div className="wallet"><span>✦ 猫爪邮票 <b data-testid="stamps">{state.currencies.stamp ?? 0}</b></span><span>◆ 修缮材料 <b>{state.inventory.material ?? 0}</b></span></div></div>
      <div className="game-layout"><section className="world-panel"><div className="world-toolbar"><div><span className="live-dot"/><strong>{phases[state.phase]}</strong><span className="area-label">{map?.name}</span></div><button className="quiet" onClick={onPause}>{paused ? '继续旅程' : '暂停'}</button></div>
        <div className="world-wrap">{children}
          {state.phase === 'dialogue' && node && <DialoguePanel node={node} disabled={disabled} onNext={() => onCommand({type: 'ADVANCE_STORY', nodeId: node.id})} eventResult={resolution?.outcome.situation?.storyNodeId === node.id ? <EventResult resolution={resolution} compact/> : undefined}/>}
          {state.phase === 'event' && event && <DiceEvent key={event.id} event={event} disabled={disabled} rolling={busy} onChoose={optionId => onCommand({type: 'CHOOSE_EVENT', eventId: event.id, optionId})}/>}
          {state.phase === 'preparation' && <section className="event-card preparation-card"><span className="eyebrow">RESCUE MISSION 01</span><h2>为伙伴点亮一条路</h2>{resolution ? <EventResult resolution={resolution}/> : state.lastResult.roll ? <div className="roll-result"><Dice value={state.lastResult.roll}/><span>骰子 · {state.lastResult.roll} 点</span></div> : <PixelCat breed="tuanzi" size={78}/>}<p>{!resolution || state.lastResult.outcome === 'lost' ? state.lastResult.message : '点点会跟上我们。准备好，就一起守住撤离路线。'}</p><p className="muted">三路守护 · 点击格子布置光源<br/>每盏消耗 2 格能量，每 4 秒恢复 1 格。</p><button disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId: 'alley_rescue'})}>开始守护 →</button></section>}
          {state.phase === 'settlement' && <section className="event-card rescue-card"><span className="eyebrow">{state.lastResult.outcome === 'won' ? 'A SAFE WAY HOME' : 'TRY A LITTLE DIFFERENTLY'}</span><div className="rescue-cats"><PixelCat size={90} mood="brave"/>{state.cats.includes('diandian') && <PixelCat breed="diandian" size={80}/>}<PixelCat breed="tuanzi" size={86}/></div><h2>{state.lastResult.outcome === 'won' ? '回家的路，也是救援的开始。' : '再一起想想办法。'}</h2><p>{state.lastResult.message}</p>{state.lastResult.firstClear && <p className="reward-note">点点加入 · 纸箱猫窝<br/>✦ 猫爪邮票 ×2 · ◆ 材料 ×3</p>}<button disabled={disabled} onClick={() => onCommand({type: 'CONTINUE'})}>{state.lastResult.outcome === 'won' ? '带伙伴回家 →' : '调整防线，再试一次'}</button></section>}
          {paused && <div className="pause-label"><span>旅程已暂停</span><button onClick={onPause}>继续旅程</button></div>}
        </div>
        <div className="world-footer"><p>{catalog.tutorials.find(t => t.phase === state.phase)?.text ?? '每次相遇，都可能成为回家路上的一点光。'}</p>
          {state.phase === 'explore' && <><div className="direction-pad">{(['up', 'left', 'down', 'right'] as Direction[]).map((d, i) => <button key={d} aria-label={`向${['上', '左', '下', '右'][i]}移动`} disabled={disabled} onPointerDown={e => {e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);onDirection(d, true);}} onPointerUp={() => onDirection(d, false)} onLostPointerCapture={() => onDirection(d, false)}>{['↑', '←', '↓', '→'][i]}</button>)}</div>{near && <button disabled={disabled} onClick={() => onCommand({type: 'INTERACT', interactionId: 'alley_crate'})}>查看纸箱 · E</button>}{state.flags.includes('alley_rescued') && <button disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>回到花房</button>}</>}
        </div>
      </section><aside className="journal">
        <section className="journal-card"><span className="eyebrow">OUR LITTLE QUEST</span><h2>现在的小目标</h2><p>{objective(state)}</p><ol className="quest-steps"><li className={state.chapterId !== 'prologue' ? 'done' : ''}>遇见团子</li><li className={state.phase !== 'dialogue' || state.cats.includes('diandian') ? 'done' : ''}>寻找纸箱里的叫声</li><li className={state.cats.includes('diandian') ? 'done' : ''}>守护点点的撤离路线</li><li className={state.flags.includes('rescue_story_done') ? 'done' : ''}>一起安顿花房</li></ol></section>
        {state.phase === 'home' && <HomePanel state={state} catalog={catalog} disabled={disabled} onCommand={onCommand} onShop={onShop}/>}
        <section className="journal-card"><div className="card-title"><h2>一路上的伙伴</h2><span>{state.cats.length} / {catalog.cats.length}</span></div><div className="cat-list">{catalog.cats.map(cat => <div className={`cat-entry ${state.cats.includes(cat.id) ? '' : 'locked'}`} key={cat.id}><PixelCat breed={cat.id} size={54}/><div><strong>{cat.name}<span>{state.cats.includes(cat.id) ? cat.id === 'miaomiao' ? '领队' : '伙伴' : '未相遇'}</span></strong><small>{state.cats.includes(cat.id) ? cat.description : '还有新的相遇，在前方等待。'}</small></div></div>)}</div></section>
        <div className="save-note" role="status"><span className="live-dot"/>{busy ? '正在记录旅程……' : pending ? '有一次操作等待确认' : '旅程已自动保存'}<small>刷新页面后，可以继续。</small></div>
      </aside></div>
    </main><footer className="site-footer"><span>不是所有猫都有家。那就为彼此，创造一个家。</span><b>XSOLLA GARAGE · SPRINT 1</b></footer>
  </div>;
}
