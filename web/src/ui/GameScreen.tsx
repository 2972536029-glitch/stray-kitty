import {useEffect, useRef, useState, type ReactNode} from 'react';
import type {Catalog, GameCommand, GameState} from '../contracts';
import type {Direction} from '../adapters/platform/input';
import {currentStory, objective} from '../core/story';
import PixelCat from './PixelCat';
import DialoguePanel from './DialoguePanel';
import DiceEvent, {Dice} from './DiceEvent';
import HomePanel from './HomePanel';
import EventResult from './EventResult';
import Modal from './Modal';
import {ChapterLoadout} from '../modules/battle/ChapterLoadout';

const phases: Record<string, string> = {dialogue: '猫咪物语', explore: '小巷探索', event: '一次相遇', preparation: '守护准备', battle: '序章守护', settlement: '救援结果', home: '我们的花房'};
interface Props {
  state: GameState; catalog: Catalog; busy: boolean; pending: boolean; disabled: boolean; paused: boolean; near: boolean;
  nearTarget?: {id: string; label: string} | null;
  inspectHint?: string | null;
  journalOpen: boolean;
  onJournal: () => void;
  onSkip?: () => void;
  onReset?: () => void;
  onCommand: (command: GameCommand) => void; onDirection: (direction: Direction, held: boolean) => void;
  onPause: () => void; onMap: () => void; onShop: () => void; onTitle: () => void; children: ReactNode;
}
export default function GameScreen({state, catalog, busy, pending, disabled, paused, near, nearTarget, inspectHint, journalOpen, onJournal, onSkip, onReset, onCommand, onDirection, onPause, onMap, onShop, onTitle, children}: Props) {
  const [devOpen, setDevOpen] = useState(false);
  const node = currentStory(catalog, state);
  const chapter = catalog.chapters.find(c => c.id === state.chapterId);
  const event = catalog.events.find(e => e.id === state.pendingEventId);
  const map = catalog.maps.find(m => m.id === state.mapId);
  const resolution = state.eventState?.lastResolution;
  const chapterBattle = state.activeBattle?.stageId === 'alley_boss' || (state.lastResult.stageId === 'alley_boss' && (state.phase === 'preparation' || state.phase === 'settlement'));
  // 随机事件结算后直接回到探索,这里补一个结果卡让玩家看清骰点与收获,再继续赶路。
  const resolutionKey = resolution ? `${resolution.eventId}:${resolution.optionId}:${resolution.dice[0]}${resolution.dice[1]}` : '';
  const [dismissedResult, setDismissedResult] = useState('');
  const arrivedFromEvent = useRef(false);
  useEffect(() => {
    if (state.phase === 'event') arrivedFromEvent.current = true;
    else if (state.phase !== 'explore') arrivedFromEvent.current = false;
  }, [state.phase]);
  const showExploreResult = state.phase === 'explore' && arrivedFromEvent.current && !!resolution && dismissedResult !== resolutionKey;
  return <div className="app-shell" data-phase={state.phase}>
    <header className="topbar"><button className="brand" onClick={onTitle} aria-label="返回标题"><span className="brand-mark">ฅ</span><span><strong>小猫回家记</strong><small>流 浪 猫 王 国</small></span></button>
      <span className="chapter-pill">{chapterBattle ? '第一章 · 陌生小巷' : chapter?.title}</span>
      <div className="wallet"><span><span className="wallet-label">✦ 猫爪邮票</span> <b data-testid="stamps">{state.currencies.stamp ?? 0}</b></span><span><span className="wallet-label">◆ 修缮材料</span> <b>{state.inventory.material ?? 0}</b></span></div>
      <nav aria-label="旅程工具"><button className="journal-button" aria-label="旅程记录" aria-haspopup="dialog" aria-expanded={journalOpen} onClick={onJournal}>▤ <span>旅程记录</span></button><button className="map-button" aria-label="章节地图" onClick={onMap}>▦ <span>章节地图</span></button><button className="shop-button" aria-label="猫国商店" onClick={onShop}>▣ <span>猫国商店</span></button><button className="dev-button" aria-label="验收工具" onClick={() => setDevOpen(!devOpen)}>🛠️ <span>验收</span></button></nav></header>
    <main><h1 className="visually-hidden">一只猫的旅程，一群猫的家。</h1>
      <div className="game-layout"><section className="world-panel"><div className="world-toolbar"><div><span className="live-dot"/><strong>{chapterBattle && state.phase === 'battle' ? '第一章守护' : phases[state.phase]}</strong><span className="area-label">{chapterBattle ? '深巷守护' : map?.name}</span></div><button className="quiet" onClick={onPause}>{paused ? '继续旅程' : '暂停'}</button></div>
        {devOpen && (
          <div className="dev-bar" role="toolbar" aria-label="开发者验收栏">
            <b>🛠️ 验收模式:</b>
            {state.phase === 'dialogue' && onSkip && <button onClick={onSkip}>⏩ 跳过本段对话</button>}
            {state.phase === 'explore' && <button onClick={() => onCommand({type: 'REPORT_MOVE', distance: 150})}>🚶 走一段(随机判定)</button>}
            {state.phase === 'explore' && state.mapId === 'alley' && <button onClick={() => onCommand({type: 'INTERACT', interactionId: 'alley_crate'})}>🐾 触发纸箱事件</button>}
            {state.phase === 'explore' && state.mapId === 'market' && (
              <>
                <button onClick={() => onCommand({type: 'INTERACT', interactionId: 'market_crow_stall'})}>🦅 访问乌鸦情报摊</button>
                <button onClick={() => onCommand({type: 'INTERACT', interactionId: 'market_pigeon_perch'})}>🕊️ 访问鸽子传言棚</button>
              </>
            )}
            {state.phase === 'preparation' && !chapterBattle && <button onClick={() => onCommand({type: 'START_BATTLE', stageId: 'alley_rescue'})}>⚔️ 开始塔防</button>}
            {state.flags.includes('alley_rescued') && state.phase !== 'home' && <button onClick={() => onCommand({type: 'GO_HOME'})}>🏡 直达花房</button>}
            <button onClick={() => onCommand({type: 'START_STORY', nodeId: 'market_intro_1'})}>🌙 开启第二章剧情</button>
            <button onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'market'})}>🌃 直达午夜集市</button>
            {onReset && <button className="dev-reset-btn" onClick={onReset}>↺ 重置为新存档</button>}
          </div>
        )}
        <div className="world-wrap">{children}
          {state.phase === 'home' && <div className="home-controls"><HomePanel state={state} catalog={catalog} disabled={disabled} onCommand={onCommand} onShop={onShop}/></div>}
          {state.phase === 'dialogue' && node && <DialoguePanel node={node} disabled={disabled} onNext={() => onCommand({type: 'ADVANCE_STORY', nodeId: node.id})} onSkip={onSkip} eventResult={resolution?.outcome.situation?.storyNodeId === node.id ? <EventResult resolution={resolution} compact/> : undefined}/>}
          {state.phase === 'event' && event && <DiceEvent key={event.id} event={event} disabled={disabled} rolling={busy} onChoose={optionId => onCommand({type: 'CHOOSE_EVENT', eventId: event.id, optionId})}/>}
          {state.phase === 'preparation' && chapterBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><ChapterLoadout state={state} disabled={disabled} onCommand={onCommand}/></section>}
          {state.phase === 'preparation' && !chapterBattle && <section className="event-card preparation-card"><span className="eyebrow">{state.mapId === 'market' ? 'MIDNIGHT MARKET INTEL' : 'RESCUE MISSION 01'}</span><h2>{state.mapId === 'market' ? '集市情报与收获' : '为伙伴点亮一条路'}</h2>{resolution ? <EventResult resolution={resolution}/> : state.lastResult.roll ? <div className="roll-result"><Dice value={state.lastResult.roll}/><span>骰子 · {state.lastResult.roll} 点</span></div> : <PixelCat breed="tuanzi" size={78}/>}<p>{!resolution || state.lastResult.outcome === 'lost' ? state.lastResult.message : state.mapId === 'market' ? '从鸟雀们那里得到了重要的线索与物资。' : '点点会跟上我们。准备好，就一起守住撤离路线。'}</p>{state.mapId === 'market' ? <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}><button disabled={disabled} onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'market'})}>带着收获继续探索集市 →</button><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回花房基地</button></div> : <><p className="muted">序章守护 · 3×7 棋盘与十波黑影<br/>九步教学将带你练习治疗、部署、蓄能和技能。</p><button disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId: 'alley_rescue'})}>开始守护 →</button></>}</section>}
          {state.phase === 'settlement' && <section className="event-card rescue-card"><span className="eyebrow">{state.lastResult.outcome === 'won' ? 'A SAFE WAY HOME' : 'TRY A LITTLE DIFFERENTLY'}</span><div className="rescue-cats"><PixelCat size={90} mood="brave"/>{state.cats.includes('diandian') && <PixelCat breed="diandian" size={80}/>}<PixelCat breed="tuanzi" size={86}/></div><h2>{state.lastResult.outcome === 'won' ? chapterBattle ? '深巷里的黑影散去了' : '回家的路，也是救援的开始。' : '再一起想想办法。'}</h2><p>{state.lastResult.message}</p>{state.lastResult.firstClear && !chapterBattle && <p className="reward-note">点点加入 · 纸箱猫窝<br/>✦ 猫爪邮票 ×2 · ◆ 材料 ×3</p>}{state.lastResult.battleRewards && <div className="reward-note" data-testid="battle-supply-rewards"><strong>战斗补给已存入仓库</strong><p>暖心罐罐 ×{state.lastResult.battleRewards.supplies['warm-can']} · 蹦蹦冻干 ×{state.lastResult.battleRewards.supplies['bouncy-treat']}</p><small>胜利奖励 {state.lastResult.battleRewards.baseCount} 份{state.lastResult.battleRewards.firstClearBonus > 0 && ` ＋ 本关首胜 ${state.lastResult.battleRewards.firstClearBonus} 份`}{state.lastResult.battleRewards.perfectBonus > 0 && ` ＋ 零漏怪 ${state.lastResult.battleRewards.perfectBonus} 份`}</small></div>}<button disabled={disabled} onClick={() => onCommand({type: 'CONTINUE'})}>{state.lastResult.outcome === 'won' ? '带伙伴回家 →' : '调整防线，再试一次'}</button></section>}
          {showExploreResult && resolution && <section className="event-card explore-result-card"><span className="eyebrow">一次相遇的结果</span><EventResult resolution={resolution}/><button disabled={disabled} onClick={() => {setDismissedResult(resolutionKey);arrivedFromEvent.current = false;}}>继续赶路 →</button></section>}
          {paused && <div className="pause-label"><span>旅程已暂停</span><button onClick={onPause}>继续旅程</button></div>}
        </div>
        <div className="world-footer"><p className={inspectHint && state.phase === 'explore' ? 'inspect-hint' : ''}>{inspectHint && state.phase === 'explore' ? <><span className="hint-paw">🐾</span>{inspectHint}</> : chapterBattle && state.phase === 'battle' ? '点场上的猫查看和释放技能，守住 A5 与右侧两处巷口；守完八波并击败首领。打开地图、商店或返回标题会暂停战斗。' : (catalog.tutorials.find(t => t.phase === state.phase)?.text ?? '每次相遇，都可能成为回家路上的一点光。')}</p>
          {state.phase === 'explore' && <><div className="direction-pad">{(['up', 'left', 'down', 'right'] as Direction[]).map((d, i) => <button key={d} aria-label={`向${['上', '左', '下', '右'][i]}移动`} disabled={disabled} onPointerDown={e => {e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);onDirection(d, true);}} onPointerUp={() => onDirection(d, false)} onLostPointerCapture={() => onDirection(d, false)}>{['↑', '←', '↓', '→'][i]}</button>)}</div>{near && state.mapId === 'alley' && <button disabled={disabled} onClick={() => onCommand({type: 'INTERACT', interactionId: 'alley_crate'})}>查看纸箱 · E</button>}{near && state.mapId === 'market' && nearTarget && <button disabled={disabled} onClick={() => onCommand({type: 'INTERACT', interactionId: nearTarget.id})}>{nearTarget.label}</button>}{(state.flags.includes('alley_rescued') || state.mapId === 'market') && <button disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>回到花房</button>}</>}
        </div>
      </section></div>
    </main>
    {journalOpen && <Modal title="旅程记录" onClose={onJournal} className="journey-modal"><header><span className="eyebrow">OUR LITTLE JOURNEY</span><h2>旅程记录</h2></header><aside className="journal">
        <section className="journal-card"><span className="eyebrow">OUR LITTLE QUEST</span><h2>现在的小目标</h2><p>{objective(state)}</p><ol className="quest-steps"><li className={state.chapterId !== 'prologue' ? 'done' : ''}>遇见团子</li><li className={state.phase !== 'dialogue' || state.cats.includes('diandian') ? 'done' : ''}>寻找纸箱里的叫声</li><li className={state.cats.includes('diandian') ? 'done' : ''}>守护点点的撤离路线</li><li className={state.flags.includes('rescue_story_done') ? 'done' : ''}>一起安顿花房</li>{state.flags.includes('rescue_story_done') && <li className={state.flags.includes('chapter_2_started') || state.mapId === 'market' ? 'done' : ''}>探访午夜集市</li>}</ol></section>
        <section className="journal-card"><div className="card-title"><h2>一路上的伙伴</h2><span>{state.cats.length} / {catalog.cats.length}</span></div><div className="cat-list">{catalog.cats.map(cat => <div className={`cat-entry ${state.cats.includes(cat.id) ? '' : 'locked'}`} key={cat.id}><PixelCat breed={cat.id} size={54}/><div><strong>{cat.name}<span>{state.cats.includes(cat.id) ? cat.id === 'miaomiao' ? '领队' : '伙伴' : '未相遇'}</span></strong><small>{state.cats.includes(cat.id) ? cat.description : '还有新的相遇，在前方等待。'}</small></div></div>)}</div></section>
        <div className="save-note" role="status"><span className="live-dot"/>{busy ? '正在记录旅程……' : pending ? '有一次操作等待确认' : '旅程已自动保存'}<small>刷新页面后，可以继续。</small></div>
      </aside></Modal>}
  </div>;
}
