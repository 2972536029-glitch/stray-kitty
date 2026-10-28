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
import {MarketLoadout} from '../modules/battle/MarketLoadout';
import {GreenhouseLoadout} from '../modules/battle/GreenhouseLoadout';
import {TunnelLoadout} from '../modules/battle/TunnelLoadout';
import {FinaleLoadout} from '../modules/battle/FinaleLoadout';
import {simulateVictoryCommand} from '../modules/battle/qa';

const phases: Record<string, string> = {dialogue: '猫咪物语', explore: '小巷探索', event: '一次相遇', preparation: '守护准备', battle: '序章守护', settlement: '救援结果', home: '我们的花房'};
interface Props {
  state: GameState; catalog: Catalog; busy: boolean; pending: boolean; disabled: boolean; paused: boolean; near: boolean;
  nearTarget?: {id: string; label: string} | null;
  inspectHint?: string | null;
  journalOpen: boolean;
  onJournal: () => void;
  onSkip?: () => void;
  onReset?: () => void;
  onCommand: (command: GameCommand) => void; onInteract: (interactionId?: string) => void; onDirection: (direction: Direction, held: boolean) => void;
  onPause: () => void; onMap: () => void; onShop: () => void; onRecharge: () => void; onTitle: () => void; children: ReactNode;
}
export default function GameScreen({state, catalog, busy, pending, disabled, paused, near, nearTarget, inspectHint, journalOpen, onJournal, onSkip, onReset, onCommand, onInteract, onDirection, onPause, onMap, onShop, onRecharge, onTitle, children}: Props) {
  const [devOpen, setDevOpen] = useState(false);
  // Exploration shortcuts must not carry an overlay over the next battle's controls.
  useEffect(() => {if (state.phase === 'battle') setDevOpen(false);}, [state.phase, state.activeBattle?.id]);
  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'e2e';
  const node = currentStory(catalog, state);
  const chapter = catalog.chapters.find(c => c.id === state.chapterId);
  const event = catalog.events.find(e => e.id === state.pendingEventId);
  const map = catalog.maps.find(m => m.id === state.mapId);
  const alleyObjective = state.phase === 'explore' && state.mapId === 'alley'
    ? !state.flags.includes('alley_rescued')
      ? '循着求救声，寻找纸箱里的点点'
      : !state.flags.includes('lost_poster_found')
        ? '去看看墙上的寻猫启事'
        : null
    : null;
  const resolution = state.eventState?.lastResolution;
  const activeStage = state.activeBattle?.stageId ?? state.lastResult.stageId;
  const battleLocked = state.activeBattle?.status === 'active';
  const qaVictory = isDevelopment && state.phase === 'battle' && state.activeBattle
    ? simulateVictoryCommand(state.activeBattle, catalog.stages.map(stage => stage.id)) : null;
  const tutorialBattle = activeStage === 'l00_tutorial' && ['battle', 'settlement'].includes(state.phase);
  const chapterBattle = ['alley_rescue', 'alley_boss'].includes(activeStage ?? '') && ['battle', 'preparation', 'settlement'].includes(state.phase);
  const marketBattle = state.activeBattle?.stageId === 'market_boss' && ['battle', 'preparation', 'settlement'].includes(state.phase);
  const greenhouseBattle = state.activeBattle?.stageId === 'greenhouse_boss' && ['battle', 'preparation', 'settlement'].includes(state.phase);
  const tunnelBattle = state.activeBattle?.stageId === 'tunnel_boss' && ['battle', 'preparation', 'settlement'].includes(state.phase);
  const finaleBattle = state.activeBattle?.stageId === 'finale_boss' && ['battle', 'preparation', 'settlement'].includes(state.phase);
  const standaloneBattle = marketBattle || greenhouseBattle || tunnelBattle || finaleBattle;
  const retryStage = activeStage === 'alley_boss' ? 'alley_boss' : 'alley_rescue';
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
      <span className="chapter-pill">{finaleBattle ? '第五章 · 终局试玩' : tunnelBattle ? '第四章 · 地下通道试玩' : greenhouseBattle ? '第三章 · 废弃花房试玩' : marketBattle ? '第二章 · 午夜集市试玩' : tutorialBattle ? '序章 · 金枪鱼事件' : chapterBattle ? '第一章 · 陌生小巷' : chapter?.title}</span>
      <div className="wallet"><span><span className="wallet-label">✦ 猫爪邮票</span> <b data-testid="stamps">{state.currencies.stamp ?? 0}</b></span><span><span className="wallet-label">◆ 修缮材料</span> <b>{state.inventory.material ?? 0}</b></span><button className="wallet-tuna" onClick={onRecharge} aria-label="金枪鱼罐头，点击打开补给小站" title="点击打开金枪鱼补给小站"><span className="wallet-label">🥫 金枪鱼罐头</span> <b data-testid="tuna">{state.currencies.tuna ?? 0}</b><small>＋充值</small></button></div>
      <nav aria-label="旅程工具">{state.phase === 'battle' && <>{qaVictory && <button data-testid="qa-simulate-victory" className="dev-button" disabled={disabled || !battleLocked} onClick={() => onCommand(qaVictory)}>模拟胜利（QA）</button>}<button className="battle-host-pause" onClick={onPause}>{paused ? '继续旅程' : '暂停'}</button></>}<button className="journal-button" aria-label="旅程记录" aria-haspopup="dialog" aria-expanded={journalOpen} onClick={onJournal}>▤ <span>旅程记录</span></button><button className="map-button" aria-label="章节地图" onClick={onMap}>▦ <span>章节地图</span></button><button className="shop-button" aria-label="猫国商店" onClick={onShop}>▣ <span>猫国商店</span></button>{isDevelopment && <button className="dev-button" aria-label="验收工具" onClick={() => setDevOpen(!devOpen)}>🛠️ <span>验收</span></button>}</nav></header>
    <main><h1 className="visually-hidden">一只猫的旅程，一群猫的家。</h1>
      <div className="game-layout"><section className="world-panel"><div className="world-toolbar"><div><span className="live-dot"/><strong>{finaleBattle && state.phase === 'battle' ? '终局试玩' : tunnelBattle && state.phase === 'battle' ? '第四章试玩' : greenhouseBattle && state.phase === 'battle' ? '第三章试玩' : marketBattle && state.phase === 'battle' ? '第二章试玩' : chapterBattle && state.phase === 'battle' ? '第一章守护' : phases[state.phase]}</strong><span className="area-label">{finaleBattle ? '总仓库决战' : tunnelBattle ? '暗道守护' : greenhouseBattle ? '花房守护' : marketBattle ? '集市守护' : chapterBattle ? '深巷守护' : map?.name}</span></div>{state.phase !== 'battle' && <button className="quiet" onClick={onPause}>{paused ? '继续旅程' : '暂停'}</button>}</div>
        {isDevelopment && devOpen && (
          <div className="dev-bar" role="toolbar" aria-label="开发者验收栏">
            <b>🛠️ 验收模式:</b>
            {!['event', 'battle'].includes(state.phase) && <button data-testid="dev-direct-alley" disabled={disabled || battleLocked} onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'alley'})}>🗺️ 直达雨巷</button>}
            {state.phase === 'dialogue' && onSkip && <button onClick={onSkip}>⏩ 跳过本段对话</button>}
            {state.phase === 'explore' && <button onClick={() => onCommand({type: 'REPORT_MOVE', distance: 150})}>🚶 走一段(随机判定)</button>}
            {state.phase === 'explore' && state.mapId === 'alley' && <button onClick={() => onCommand({type: 'INTERACT', interactionId: 'alley_crate'})}>🐾 触发纸箱事件</button>}
            {state.phase === 'explore' && state.mapId === 'market' && (
              <>
                <button onClick={() => onCommand({type: 'INTERACT', interactionId: 'market_crow_stall'})}>🦅 访问乌鸦情报摊</button>
                <button onClick={() => onCommand({type: 'INTERACT', interactionId: 'market_pigeon_perch'})}>🕊️ 访问鸽子传言棚</button>
              </>
            )}
            {state.phase === 'preparation' && !chapterBattle && !standaloneBattle && <button onClick={() => onCommand({type: 'START_BATTLE', stageId: 'alley_rescue'})}>⚔️ 开始塔防</button>}
            {state.flags.includes('alley_rescued') && state.phase !== 'home' && <button onClick={() => onCommand({type: 'GO_HOME'})}>🏡 直达花房</button>}
            <button disabled={disabled || battleLocked} onClick={() => onCommand({type: 'START_STORY', nodeId: 'market_intro_1'})}>🌙 开启第二章剧情</button>
            <button disabled={disabled || battleLocked} onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'market'})}>🌃 直达午夜集市</button>
            <button disabled={disabled || battleLocked} onClick={() => onCommand({type: 'START_STORY', nodeId: 'finale_intro_1'})}>🌟 开启终章剧情</button>
            {battleLocked && <small>请先完成或撤离当前战斗，再切换章节。</small>}
            {onReset && <button className="dev-reset-btn" onClick={onReset}>↺ 重置为新存档</button>}
          </div>
        )}
        <div className="world-wrap">{children}
          {alleyObjective && <div className="alley-objective" role="status"><span>雨巷线索</span><strong>{alleyObjective}</strong></div>}
          {state.phase === 'home' && <div className="home-controls"><HomePanel state={state} catalog={catalog} disabled={disabled} onCommand={onCommand} onShop={onShop} onRecharge={onRecharge}/></div>}
          {state.phase === 'dialogue' && node && <DialoguePanel node={node} disabled={disabled} onNext={() => onCommand({type: 'ADVANCE_STORY', nodeId: node.id})} onSkip={onSkip} eventResult={resolution?.outcome.situation?.storyNodeId === node.id ? <EventResult resolution={resolution} compact/> : undefined}/>}
          {state.phase === 'event' && event && <DiceEvent key={event.id} event={event} disabled={disabled} rolling={busy} random={state.pendingEventSource === 'random'} teaser={state.pendingEventSource === 'random' ? state.lastResult.message : undefined} partyCats={state.cats} pushTokens={state.pushTokens ?? 0} onChoose={(optionId, usePush) => onCommand({type: 'CHOOSE_EVENT', eventId: event.id, optionId, usePush})}/>}
          {state.phase === 'preparation' && finaleBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><FinaleLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && tunnelBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><TunnelLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && greenhouseBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><GreenhouseLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && marketBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><MarketLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && chapterBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><ChapterLoadout stageId={retryStage} disabled={disabled} onCommand={onCommand}/></section>}
          {state.phase === 'preparation' && !chapterBattle && !standaloneBattle && <section className="event-card preparation-card"><span className="eyebrow">{state.mapId === 'market' ? 'MIDNIGHT MARKET INTEL' : 'RESCUE MISSION 01'}</span><h2>{state.mapId === 'market' ? '集市情报与收获' : '为伙伴点亮一条路'}</h2>{resolution ? <EventResult resolution={resolution}/> : state.lastResult.roll ? <div className="roll-result"><Dice value={state.lastResult.roll}/><span>骰子 · {state.lastResult.roll} 点</span></div> : <PixelCat breed="tuanzi" size={78}/>}<p>{!resolution || state.lastResult.outcome === 'lost' ? state.lastResult.message : state.mapId === 'market' ? '从鸟雀们那里得到了重要的线索与物资。' : '点点会跟上我们。准备好，就一起守住撤离路线。'}</p>{state.mapId === 'market' ? <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}><button disabled={disabled} onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'market'})}>带着收获继续探索集市 →</button><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回花房基地</button></div> : <><p className="muted">第一章守护 · 四位伙伴与八波黑影<br/>利用站位、蓄能与技能击败首领，最多允许 2 次突破。</p><button disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId: 'alley_rescue'})}>开始守护 →</button></>}</section>}
          {state.phase === 'settlement' && state.activeBattle?.stageId === 'l00_tutorial' && <section className="event-card rescue-card"><span className="eyebrow">L00 · FIRST LIGHT</span><div className="rescue-cats"><PixelCat size={90} mood="brave"/></div><h2>{state.lastResult.outcome === 'won' ? '第一道防线守住了。' : '再调整一次站位与技能时机。'}</h2><p>{state.lastResult.message}</p><button disabled={disabled} onClick={() => onCommand(state.lastResult.outcome === 'won' ? {type: 'CONTINUE'} : {type: 'START_BATTLE', stageId: 'l00_tutorial'})}>{state.lastResult.outcome === 'won' ? '进入雨夜小巷 →' : '重新开始教学'}</button></section>}
          {state.phase === 'settlement' && !standaloneBattle && state.activeBattle?.stageId !== 'l00_tutorial' && <section className="event-card rescue-card"><span className="eyebrow">{state.lastResult.outcome === 'won' ? 'A SAFE WAY HOME' : 'TRY A LITTLE DIFFERENTLY'}</span><div className="rescue-cats"><PixelCat size={90} mood="brave"/>{state.cats.includes('diandian') && <PixelCat breed="diandian" size={80}/>}<PixelCat breed="tuanzi" size={86}/></div><h2>{state.lastResult.outcome === 'won' ? activeStage === 'alley_boss' ? '深巷里的黑影散去了' : '回家的路，也是救援的开始。' : '再一起想想办法。'}</h2><p>{state.lastResult.message}</p>{state.lastResult.firstClear && state.lastResult.stageId === 'alley_rescue' && <p className="reward-note">点点加入 · 纸箱猫窝<br/>✦ 猫爪邮票 ×2 · ◆ 材料 ×3</p>}<button disabled={disabled} onClick={() => onCommand({type: 'CONTINUE'})}>{state.lastResult.outcome === 'won' ? '带伙伴回家 →' : '调整防线，再试一次'}</button></section>}
          {state.phase === 'settlement' && standaloneBattle && <section className="event-card rescue-card"><span className="eyebrow">{finaleBattle ? 'L05 · LIGHT THE WAY HOME' : tunnelBattle ? 'L04 · UNDERGROUND TUNNEL' : greenhouseBattle ? 'L03 · ABANDONED GREENHOUSE' : 'L02 · MIDNIGHT MARKET'}</span><h2>{state.lastResult.outcome === 'won' ? finaleBattle ? '所有的光，终于照亮归途' : tunnelBattle ? '暗道的归路守住了' : greenhouseBattle ? '花房的归路守住了' : '集市的灯火守住了' : finaleBattle ? '伙伴们还在，重新安排终局防线' : tunnelBattle ? '再调整一次暗道防线' : greenhouseBattle ? '再调整一次花房防线' : '再调整一次集市防线'}</h2><p>{state.lastResult.message}</p><button data-testid={finaleBattle ? 'finale-continue' : tunnelBattle ? 'tunnel-continue' : greenhouseBattle ? 'greenhouse-continue' : 'market-continue'} disabled={disabled} onClick={() => onCommand({type: 'CONTINUE'})}>{state.lastResult.outcome === 'won' ? '返回家园 →' : '调整防线，再试一次'}</button></section>}
          {showExploreResult && resolution && <section className="event-card explore-result-card"><span className="eyebrow">一次相遇的结果</span><EventResult resolution={resolution}/><button disabled={disabled} onClick={() => {setDismissedResult(resolutionKey);arrivedFromEvent.current = false;}}>继续赶路 →</button></section>}
          {paused && <div className="pause-label"><span>旅程已暂停</span><button onClick={onPause}>继续旅程</button></div>}
        </div>
        <div className="world-footer"><p className={inspectHint && state.phase === 'explore' ? 'inspect-hint' : ''}>{inspectHint && state.phase === 'explore' ? <><span className="hint-paw">🐾</span>{inspectHint}</> : finaleBattle && state.phase === 'battle' ? '躲开预告的横扫与坠击，选择护卫与首领的攻击顺序。十波清完、两精英与九格首领全部击败后获胜；援军固定支援，主力仍需你的指挥。' : tunnelBattle && state.phase === 'battle' ? '保护 C2 的喵喵；断灯时可用墨墨夜视恢复视野并为全队加盾。守完八波并击败首领；打开地图、商店或返回标题会暂停战斗。' : greenhouseBattle && state.phase === 'battle' ? '沿花房的不规则通路布阵，守住 B1；守完八波并击败四格首领。打开地图、商店或返回标题会暂停战斗。' : marketBattle && state.phase === 'battle' ? '点选伙伴查看与释放技能；守完八波并击败集市首领。打开地图、商店或返回标题会暂停战斗。' : chapterBattle && state.phase === 'battle' ? '点场上的猫查看和释放技能，守住 A4 与右侧两处巷口；守完八波并击败首领。打开地图、商店或返回标题会暂停战斗。' : (catalog.tutorials.find(t => t.phase === state.phase)?.text ?? '每次相遇，都可能成为回家路上的一点光。')}</p>
          {state.phase === 'explore' && <><div className="direction-pad">{(['up', 'left', 'down', 'right'] as Direction[]).map((d, i) => <button key={d} aria-label={`向${['上', '左', '下', '右'][i]}移动`} disabled={disabled} onPointerDown={e => {e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);onDirection(d, true);}} onPointerUp={() => onDirection(d, false)} onLostPointerCapture={() => onDirection(d, false)}>{['↑', '←', '↓', '→'][i]}</button>)}</div>{near && nearTarget && <button disabled={disabled} onClick={() => onInteract(nearTarget.id)}>{nearTarget.label}</button>}{state.flags.includes('lost_poster_found') && state.flags.includes('alley_rescued') && state.mapId !== 'market' && <button disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>回到花房</button>}</>}
        </div>
      </section></div>
    </main>
    {journalOpen && <Modal title="旅程记录" onClose={onJournal} className="journey-modal"><header><span className="eyebrow">OUR LITTLE JOURNEY</span><h2>旅程记录</h2></header><aside className="journal">
        <section className="journal-card"><span className="eyebrow">OUR LITTLE QUEST</span><h2>现在的小目标</h2><p>{objective(state)}</p><ol className="quest-steps"><li className={state.chapterId !== 'prologue' ? 'done' : ''}>遇见团子</li><li className={state.phase !== 'dialogue' || state.cats.includes('diandian') ? 'done' : ''}>寻找纸箱里的叫声</li><li className={state.cats.includes('diandian') ? 'done' : ''}>守护点点的撤离路线</li><li className={state.flags.includes('rescue_story_done') ? 'done' : ''}>一起安顿花房</li>{state.flags.includes('rescue_story_done') && <li className={state.flags.includes('chapter_2_started') || state.mapId === 'market' || state.flags.includes('chapter_3_started') ? 'done' : ''}>探访午夜集市</li>}{(state.flags.includes('chapter_2_started') || state.flags.includes('chapter_3_started')) && <li className={state.flags.includes('chapter_3_started') || state.flags.includes('chapter_4_started') ? 'done' : ''}>修缮花房要塞</li>}{(state.flags.includes('chapter_3_started') || state.flags.includes('chapter_4_started')) && <li className={state.flags.includes('chapter_4_started') ? 'done' : ''}>深入暗道营救</li>}{(state.flags.includes('chapter_4_started') || state.flags.includes('finale_started')) && <li className={state.flags.includes('finale_completed') ? 'done' : ''}>点亮流浪猫王国</li>}</ol></section>
        <section className="journal-card"><div className="card-title"><h2>一路上的伙伴</h2><span>{state.cats.length} / {catalog.cats.length}</span></div><div className="cat-list">{catalog.cats.map(cat => <div className={`cat-entry ${state.cats.includes(cat.id) ? '' : 'locked'}`} key={cat.id}><PixelCat breed={cat.id} size={54}/><div><strong>{cat.name}<span>{state.cats.includes(cat.id) ? cat.id === 'miaomiao' ? '领队' : '伙伴' : '未相遇'}</span></strong><small>{state.cats.includes(cat.id) ? cat.description : '还有新的相遇，在前方等待。'}</small></div></div>)}</div></section>
        <div className="save-note" role="status"><span className="live-dot"/>{busy ? '正在记录旅程……' : pending ? '有一次操作等待确认' : '旅程已自动保存'}<small>刷新页面后，可以继续。</small></div>
      </aside></Modal>}
  </div>;
}
