import {useEffect, useRef, useState, type ReactNode} from 'react';
import type {Catalog, EventResolution, GameCommand, GameState} from '../contracts';
import type {CatBreed} from '../adapters/canvas/pixelCat';
import type {SceneAnchor} from './DialogueBubble';
import {currentStory, objective} from '../core/story';
import {warehouseOptionalInvestigationHint} from '../modules/chapter5/eventHints';
import PixelCat from './PixelCat';
import DialoguePanel from './DialoguePanel';
import DiceEvent, {Dice} from './DiceEvent';
import DiceRollOverlay from './DiceRollOverlay';
import JourneyRecord from './JourneyRecord';
import EventResult from './EventResult';
import Modal from './Modal';
import {TutorialHighlight} from './PrologueSequence';
import {playSound} from './soundEffects';
import {ChapterLoadout} from '../modules/battle/ChapterLoadout';
import {MarketLoadout} from '../modules/battle/MarketLoadout';
import {GreenhouseLoadout} from '../modules/battle/GreenhouseLoadout';
import {TunnelLoadout} from '../modules/battle/TunnelLoadout';
import {FinaleLoadout} from '../modules/battle/FinaleLoadout';
import {explorationFooterText} from './explorationFooter';
import {useTouchDevice} from './MobileViewport';

const phases: Record<string, string> = {dialogue: '猫咪物语', explore: '小巷探索', event: '一次相遇', preparation: '守护准备', battle: '序章守护', settlement: '救援结果', home: '我们的花房'};
interface Props {
  onHomeAdvisor?:()=>void;
  homeAdvisorDisabled?:boolean;
  onHomeTutorialChange?:(active:boolean)=>void;
  homeEditing?:boolean;
  onHomeManual:()=>void;
  state: GameState; catalog: Catalog; busy: boolean; pending: boolean; disabled: boolean; paused: boolean; near: boolean;
  nearTarget?: {id: string; label: string} | null;
  inspectHint?: string | null;
  journalOpen: boolean;
  topExpanded: boolean;
  onToggleTopbar: (expanded: boolean) => void;
  speakerAnchor?: (breed: CatBreed) => SceneAnchor | null;
  onJournal: () => void;
  onSkip?: () => void;
  qaOpen: boolean; onQA: () => void;
  onCommand: (command: GameCommand) => void; onInteract: (interactionId?: string) => void;
  onPause: () => void; onMap: () => void; onShop: () => void; onParcels: () => void; onRecharge: () => void; onSettings: () => void; onWarehouse: () => void; onDecorate: () => void; onTitle: () => void; children: ReactNode;
}
export default function GameScreen({onHomeAdvisor,homeAdvisorDisabled,onHomeTutorialChange,homeEditing,onHomeManual,state, catalog, busy, pending, disabled, paused, near, nearTarget, inspectHint, journalOpen, topExpanded, onToggleTopbar, speakerAnchor, onJournal, onSkip, qaOpen, onQA, onCommand, onInteract, onPause, onMap, onShop, onParcels, onRecharge, onSettings, onWarehouse, onDecorate, onTitle, children}: Props) {
  const touchDevice = useTouchDevice();
  // 首次进入守护准备时的教学高亮；完成后记在本地，不再打扰。
  const [battleTutorialDone, setBattleTutorialDone] = useState(() => {try {return localStorage.getItem('stray-kitty.tutorial.battle') === 'done';} catch {return true;}});
  const [homeTutorialDone, setHomeTutorialDone] = useState(() => {try {return localStorage.getItem('stray-kitty.tutorial.home') === 'done';} catch {return true;}});
  // 线上验收:构建时注入 VITE_QA_TOOLS=1 可在生产镜像里显示流程验收入口。
  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'e2e' || import.meta.env.VITE_QA_TOOLS === '1';
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
  const tutorialBattle = activeStage === 'l00_tutorial' && ['battle', 'settlement'].includes(state.phase);
  const needsCrateRecovery=state.phase==='preparation'&&state.mapId==='alley'&&!state.flags.includes('alley_rescued')&&!state.drawnEvents?.includes('node:crate_event');
  const chapterBattle = !needsCrateRecovery && state.mapId!=='warehouse' && ['alley_rescue', 'alley_boss'].includes(activeStage ?? '') && ['battle', 'preparation', 'settlement'].includes(state.phase);
  const marketBattle = state.activeBattle?.stageId === 'market_boss' && ['battle', 'preparation', 'settlement'].includes(state.phase);
  const greenhouseBattle = state.activeBattle?.stageId === 'greenhouse_boss' && ['battle', 'preparation', 'settlement'].includes(state.phase);
  const tunnelBattle = state.activeBattle?.stageId === 'tunnel_boss' && ['battle', 'preparation', 'settlement'].includes(state.phase);
  const finaleBattle = (state.activeBattle?.stageId === 'finale_boss' || (state.mapId==='warehouse'&&state.phase==='preparation')) && ['battle', 'preparation', 'settlement'].includes(state.phase);
  const standaloneBattle = marketBattle || greenhouseBattle || tunnelBattle || finaleBattle;
  const retryStage = activeStage === 'alley_boss' ? 'alley_boss' : 'alley_rescue';
  // 随机事件结算后直接回到探索,这里补一个结果卡让玩家看清骰点与收获,再继续赶路。
  const resolutionKey = resolution ? `${resolution.eventId}:${resolution.optionId}:${resolution.dice[0]}${resolution.dice[1]}` : '';
  const [dismissedResult, setDismissedResult] = useState('');
  // 掷骰仪式：点击“掷出骰子”即接管全屏，结算归来后揭晓骰点与四档专属像素特效。
  // prior 记下点击前的旧结算，靠引用变化识别“这次掷骰”的新结果（随机事件会同 ID 复现）。
  const [ceremony, setCeremony] = useState<{eventId: string; prior: EventResolution | undefined; startedAt: number} | null>(null);
  const ceremonyResolution = ceremony && resolution && resolution.eventId === ceremony.eventId && resolution !== ceremony.prior ? resolution : undefined;
  // 服务端驳回/网络失败（busy 结束却没有新结算）时收起仪式，把画面还给错误提示。
  useEffect(() => {
    if (!ceremony || ceremonyResolution || busy) return;
    const timer = setTimeout(() => setCeremony(null), 150);
    return () => clearTimeout(timer);
  }, [ceremony, ceremonyResolution, busy]);
  // 首次通关奖励卡出现时来一声“拾取”叮咚（按 revision 记忆，避免重复播）。
  const rewardMoment = state.phase === 'settlement' && state.lastResult.firstClear ? state.revision : null;
  useEffect(() => {if (rewardMoment !== null) playSound('pickup');}, [rewardMoment]);
  const arrivedFromEvent = useRef(false);
  useEffect(() => {
    if (state.phase === 'event') arrivedFromEvent.current = true;
    else if (state.phase !== 'explore') arrivedFromEvent.current = false;
  }, [state.phase]);
  const showExploreResult = state.phase === 'explore' && arrivedFromEvent.current && !!resolution && dismissedResult !== resolutionKey;
  // 沉浸式 HUD（探索阶段）的智能感知：进场教学只亮 3 秒便整栏淡出下落，把画面还给雨巷；
  // 靠近可交互物（纸箱/老黄/寻猫启事……）时提示栏再滑出并切换为该目标的引导文案，离开后再次淡出。
  const [introHintDone, setIntroHintDone] = useState(false);
  useEffect(() => {
    if (state.phase !== 'explore') {setIntroHintDone(false); return;}
    const timer = window.setTimeout(() => setIntroHintDone(true), 3000);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.mapId]);
  const nearHint = state.phase === 'explore' && near && nearTarget
    ? `靠近「${nearTarget.label.replace(/\s*·\s*E$/, '')}」了，${touchDevice ? '点击右下角「互动」' : '按 E 互动'}`
    : null;
  const warehouseOptionalHint=warehouseOptionalInvestigationHint(state,near&&nearTarget?nearTarget.id:undefined);
  const hintHidden = state.phase === 'explore' && introHintDone && !nearHint && !inspectHint;
  // 沉浸化：底部提示只保留真正有用的引导（战斗说明/章节目标/操作教学），删除“每次相遇，都可能成为回家路上的一点光。”常驻兜底。
  const footerGuideText = finaleBattle && state.phase === 'battle' ? '躲开预告的横扫与坠击，选择护卫与首领的攻击顺序。十波清完、两精英与九格首领全部击败后获胜；援军固定支援，主力仍需你的指挥。' : tunnelBattle && state.phase === 'battle' ? '保护 C2 的喵喵；断灯时可用墨墨夜视恢复视野并为全队加盾。守完八波并击败首领；打开地图、商店或返回标题会暂停战斗。' : greenhouseBattle && state.phase === 'battle' ? '沿花房的不规则通路布阵，守住 B1；守完八波并击败四格首领。打开地图、商店或返回标题会暂停战斗。' : marketBattle && state.phase === 'battle' ? '点选伙伴查看与释放技能；守完八波并击败集市首领。打开地图、商店或返回标题会暂停战斗。' : chapterBattle && state.phase === 'battle' ? '点场上的猫查看和释放技能，守住 A4 与右侧两处巷口；守完八波并击败首领。打开地图、商店或返回标题会暂停战斗。' : (explorationFooterText(state.phase, state.mapId, catalog.tutorials.find(t => t.phase === state.phase)?.text, objective(state)) ?? '');
  // 没有任何要展示的内容时整条 world-footer 不再渲染（连同 DOM 一起消失，不留空壳长条）。
  const homeButtonVisible = state.phase === 'explore' && state.flags.includes('lost_poster_found') && state.flags.includes('alley_rescued') && state.mapId !== 'market';
  const footerVisible = !!nearHint || (!!inspectHint && state.phase === 'explore') || !!footerGuideText || homeButtonVisible;
  // 教学期（进场 3 秒）结束后，探索阶段不再回落到“方向键 / WASD”类兜底教学文案：
  // 否则离开交互物时 <p key> 变化重挂、把兜底字重新点亮 6 秒，看起来像提示“变成”了移动教学（所有地图一致修掉）。
  const footerTextVisible = !!nearHint || (!!inspectHint && state.phase === 'explore') || (!!footerGuideText && (state.phase !== 'explore' || !introHintDone));
  const displayedGuide = touchDevice && state.phase === 'explore' ? '左手拖动摇杆移动 · 右手点击互动，攀爬或穿过障碍' : footerGuideText;
  const displayedInspectHint = touchDevice ? inspectHint?.replace(/C\s*·\s*/g, '点击「攀爬」· ').replace(/Q\s*·\s*/g, '点击「钻缝」· ').replace('松开移动键，再轻按 Q', '松开摇杆，再点「钻缝」').replace(/按\s*E/g, '点击「互动」') : inspectHint;
  // 悬停感知：鼠标进入顶部感应条 / 顶栏本体即滑出；离开后延时 2.4s 自动淡出收起
  // （倒计时内再次移入则取消）。点击木签小钮仍是辅助入口（触屏无 hover 时靠它）。
  const [hoverPeek, setHoverPeek] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const topbarHoverIn = () => {
    if (hideTimer.current !== null) {window.clearTimeout(hideTimer.current); hideTimer.current = null;}
    setHoverPeek(true);
  };
  const topbarHoverOut = () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      setHoverPeek(false);
      if (topExpanded) onToggleTopbar(false); // 无操作也收起手动展开态，交互统一为“悬停显示”
    }, 2400);
  };
  useEffect(() => () => {if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);}, []);
  // 所有阶段（含战斗）顶栏统一为悬停唤出 + 离开延时淡出；点击外部可收起手动展开态。
  const topbarOpen = topExpanded || hoverPeek;
  useEffect(() => {
    if (!topExpanded || state.phase === 'battle') return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      // .tutorial-highlight 与顶栏同源：教学卡（含「知道了」）虽渲染在 world-wrap，
      // 点击它绝不能当成“点空白”折叠顶栏——否则教学组件在 click 前被卸载，
      // stray-kitty.tutorial.* 永远写不进 done，顶栏还塌下去。
      if (target?.closest('.topbar, .topbar-toggle, dialog, .game-modal, .tutorial-highlight')) return;
      onToggleTopbar(false);
    };
    window.addEventListener('pointerdown', dismiss);
    return () => {window.removeEventListener('pointerdown', dismiss);};
  }, [topExpanded, state.phase, onToggleTopbar]);
  // 顶栏唤出方式：鼠标探入顶部感应条或顶栏本体即滑出，离开 2.4s 后自动淡出（原可拖拽木签小钮已移除，统一为悬停交互）。
  const isHomeScene = state.chapterId !== 'prologue' && (state.phase === 'home' || (state.phase === 'dialogue' && node?.scene === 'home'));
  const homeTutorialVisible=state.phase==='home'&&topbarOpen&&!homeTutorialDone;
  useEffect(()=>{onHomeTutorialChange?.(homeTutorialVisible);return()=>onHomeTutorialChange?.(false);},[homeTutorialVisible,onHomeTutorialChange]);
  return <div className="app-shell" data-home-editing={homeEditing||undefined} data-phase={state.phase} data-home-scene={isHomeScene || undefined}>
    {!homeEditing && <div className="topbar-sensor" aria-hidden="true" onMouseEnter={topbarHoverIn} onMouseLeave={topbarHoverOut}/>}
    <header className={`topbar${topbarOpen ? '' : ' topbar-collapsed'}`} onMouseEnter={topbarHoverIn} onMouseLeave={topbarHoverOut}><button className="brand" onClick={onTitle} aria-label="返回标题"><span className="brand-mark">ฅ</span><span><strong>小猫回家记</strong><small>流 浪 猫 王 国</small></span></button>
      <span className="chapter-pill">{finaleBattle ? '第五章 · 终局试玩' : tunnelBattle ? '第四章 · 地下通道试玩' : greenhouseBattle ? '第三章 · 废弃花房试玩' : marketBattle ? '第二章 · 集市防线战斗试玩' : tutorialBattle ? '序章 · 金枪鱼事件' : chapterBattle ? '第一章 · 陌生小巷' : chapter?.title}</span>
      {state.phase!=='home'&&state.phase!=='explore'&&<div className="wallet"><span><span className="wallet-label">✦ 猫爪邮票</span> <b data-testid="stamps">{state.currencies.stamp ?? 0}</b></span><span><span className="wallet-label">◆ 修缮材料</span> <b>{state.inventory.material ?? 0}</b></span><button className="wallet-tuna" onClick={onRecharge} aria-label="金枪鱼罐头，点击打开补给小站" title="点击打开金枪鱼补给小站"><span className="wallet-label">🥫 金枪鱼罐头</span> <b data-testid="tuna">{state.currencies.tuna ?? 0}</b><small>＋充值</small></button></div>}
      <nav aria-label="旅程工具">
        {state.phase==='battle'&&<button className="battle-host-pause" onClick={onPause}>{paused?'继续旅程':'暂停'}</button>}
        {state.phase==='home'?<button className="home-manual-button" aria-label="家园手册" data-tip="打开家园手册：花房总览 · 旅程记录 · 家具收藏" aria-haspopup="dialog" disabled={disabled} onClick={onHomeManual}>⌂ <span>家园手册</span></button>:<button className="journal-button" aria-label="旅程记录" aria-haspopup="dialog" aria-expanded={journalOpen} onClick={onJournal}>▤ <span>旅程记录</span></button>}
        {state.phase==='home'&&state.chapterId!=='prologue'&&onHomeAdvisor&&<button className="home-advisor-button" aria-label="问阿策" title="和阿策聊聊修缮、家具、伙伴和公开规则" aria-haspopup="dialog" disabled={disabled||homeAdvisorDisabled} onClick={onHomeAdvisor}><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 3h14v10H8l-5 4V3Z"/><path d="M6 7h8M6 10h5"/></svg><span>问阿策</span></button>}
        <button className="parcel-button" aria-label="猫爪邮局" aria-haspopup="dialog" onClick={onParcels}>✉ <span>猫爪邮局</span></button>
        <button className="shop-button" aria-label="猫国商店" aria-haspopup="dialog" onClick={onShop}>▣ <span>猫国商店</span></button>
        <button className="map-button" aria-label="章节地图" aria-haspopup="dialog" onClick={onMap}>▦ <span>章节地图</span></button>
        {state.phase==='home'&&<><button className="warehouse-button" aria-label="家园仓库" data-tip="打开家园仓库：出战携带清单" aria-haspopup="dialog" disabled={disabled} onClick={onWarehouse}>▤ <span>家园仓库</span></button><button className="home-decorate-button" aria-label="布置家具" data-tip="进入家具布置模式：移动 / 收回 / 重新摆放家具" disabled={disabled} onClick={onDecorate}>▧ <span>布置</span></button></>}
        {state.phase !== 'battle' && <button className="settings-button" aria-label="游戏设置" onClick={onSettings}>⚙ <span>设置</span></button>}{isDevelopment&&<button className="dev-button" aria-label="验收工具" aria-haspopup="dialog" aria-expanded={qaOpen} onClick={onQA}>🛠️ <span>验收</span></button>}
      </nav></header>
    <main><h1 className="visually-hidden">一只猫的旅程，一群猫的家。</h1>
      <div className="game-layout"><section className="world-panel"><div className="world-toolbar"><div><span className="live-dot"/><strong>{finaleBattle && state.phase === 'battle' ? '终局试玩' : tunnelBattle && state.phase === 'battle' ? '第四章试玩' : greenhouseBattle && state.phase === 'battle' ? '第三章试玩' : marketBattle && state.phase === 'battle' ? '第二章试玩' : chapterBattle && state.phase === 'battle' ? '第一章守护' : phases[state.phase]}</strong><span className="area-label">{finaleBattle ? '总仓库决战' : tunnelBattle ? '暗道守护' : greenhouseBattle ? '花房守护' : marketBattle ? '集市守护' : chapterBattle ? '深巷守护' : isHomeScene ? '拱顶花房' : map?.name}</span></div>{state.phase !== 'battle' && <button className="quiet" onClick={onPause}>{paused ? '继续旅程' : '暂停'}</button>}</div>
        <div className="world-wrap">{children}
          {state.qaCheckpointId && state.phase !== 'battle' && <aside className="qa-active-badge" role="status"><span>正在使用验收进度</span><button onClick={onQA}>返回原进度 / 切换节点</button></aside>}
          {alleyObjective && <div className="alley-objective" key={alleyObjective} role="status"><span>雨巷线索</span><strong>{alleyObjective}</strong></div>}
          {isHomeScene && <aside className="home-life-status"><span>{state.phase === 'dialogue' ? '故事进行中' : '花房日常'}</span><strong>{state.phase === 'dialogue' ? '伙伴们正跟随故事行动' : '拖动猫咪到家具或伙伴身边，一起玩一会儿'}</strong></aside>}

          {state.phase === 'dialogue' && node && <DialoguePanel node={node} disabled={disabled} onNext={() => onCommand({type: 'ADVANCE_STORY', nodeId: node.id})} onSkip={onSkip} getSpeakerAnchor={speakerAnchor} eventResult={resolution?.outcome.situation?.storyNodeId === node.id ? <EventResult resolution={resolution} compact/> : undefined}/>}
          {state.phase === 'event' && event && <DiceEvent key={event.id} event={event} disabled={disabled} rolling={busy} random={state.pendingEventSource === 'random'} teaser={state.pendingEventSource === 'random' ? state.lastResult.message : undefined} partyCats={state.cats} pushTokens={state.pushTokens ?? 0} onChoose={(optionId, usePush) => {setCeremony({eventId: event.id, prior: resolution, startedAt: performance.now()});onCommand({type: 'CHOOSE_EVENT', eventId: event.id, optionId, usePush});}}/>}
          {state.phase === 'preparation' && finaleBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><FinaleLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && tunnelBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><TunnelLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && greenhouseBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><GreenhouseLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && marketBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><MarketLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && chapterBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><ChapterLoadout stageId={retryStage} disabled={disabled} onCommand={onCommand}/></section>}
          {needsCrateRecovery && <section className="event-card preparation-card"><h2>先找到纸箱里的伙伴</h2><p>回到小巷继续寻找，发现伙伴后再准备守护。</p><button disabled={disabled} onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'alley'})}>返回小巷寻找纸箱 →</button></section>}
          {state.phase === 'preparation' && !needsCrateRecovery && !chapterBattle && !standaloneBattle && <section className="event-card preparation-card"><span className="eyebrow">{state.mapId === 'market' ? 'MIDNIGHT MARKET INTEL' : 'RESCUE MISSION 01'}</span><h2>{state.mapId === 'market' ? '集市情报与收获' : '为伙伴点亮一条路'}</h2>{resolution ? <EventResult resolution={resolution}/> : state.lastResult.roll ? <div className="roll-result"><Dice value={state.lastResult.roll}/><span>骰子 · {state.lastResult.roll} 点</span></div> : <PixelCat breed="tuanzi" size={78}/>}<p>{!resolution || state.lastResult.outcome === 'lost' ? state.lastResult.message : state.mapId === 'market' ? '从鸟雀们那里得到了重要的线索与物资。' : '点点会跟上我们。准备好，就一起守住撤离路线。'}</p>{state.mapId === 'market' ? <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}><button disabled={disabled} onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'market'})}>带着收获继续探索集市 →</button><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回花房基地</button></div> : <><p className="muted">第一章守护 · 四位伙伴与八波黑影<br/>利用站位、蓄能与技能击败首领，最多允许 2 次突破。</p><button className="tutorial-target-battle" disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId: 'alley_rescue'})}>开始守护 →</button></>}</section>}
          {state.phase === 'preparation' && !battleTutorialDone && <TutorialHighlight selector=".tutorial-target-battle" kicker="守护教学" text="每盏灯消耗 2 格能量，每 4 秒回复 1 格。点击「开始守护」，为点点点亮第一条撤离路线。" storageKey="stray-kitty.tutorial.battle" onDone={() => setBattleTutorialDone(true)}/>}
          {homeTutorialVisible && <TutorialHighlight selector=".home-decorate-button" kicker="整理家园" text="顶栏可以分别打开手册、邮局、商店与章节地图。点击「布置」，在当前场景的底部背包里整理家具。" storageKey="stray-kitty.tutorial.home" onDone={() => setHomeTutorialDone(true)}/>}
          {state.phase === 'settlement' && state.activeBattle?.stageId === 'l00_tutorial' && <section className="event-card rescue-card"><span className="eyebrow">L00 · FIRST LIGHT</span><div className="rescue-cats"><PixelCat size={90} mood="brave"/></div><h2>{state.lastResult.outcome === 'won' ? '第一道防线守住了。' : '再调整一次站位与技能时机。'}</h2><p>{state.lastResult.message}</p><button disabled={disabled} onClick={() => onCommand(state.lastResult.outcome === 'won' ? {type: 'CONTINUE'} : {type: 'START_BATTLE', stageId: 'l00_tutorial'})}>{state.lastResult.outcome === 'won' ? '进入雨夜小巷 →' : '重新开始教学'}</button></section>}
          {state.phase === 'settlement' && !standaloneBattle && state.activeBattle?.stageId !== 'l00_tutorial' && <section className="event-card rescue-card"><span className="eyebrow">{state.lastResult.outcome === 'won' ? 'A SAFE WAY HOME' : 'TRY A LITTLE DIFFERENTLY'}</span><div className="rescue-cats"><PixelCat size={90} mood="brave"/>{state.cats.includes('diandian') && <PixelCat breed="diandian" size={80}/>}<PixelCat breed="tuanzi" size={86}/></div><h2>{state.lastResult.outcome === 'won' ? activeStage === 'alley_boss' ? '深巷里的黑影散去了' : '回家的路，也是救援的开始。' : '再一起想想办法。'}</h2><p>{state.lastResult.message}</p>{state.lastResult.firstClear && state.lastResult.stageId === 'alley_rescue' && <p className="reward-note">点点加入 · 纸箱猫窝<br/>✦ 猫爪邮票 ×2 · ◆ 材料 ×3</p>}<button disabled={disabled} onClick={() => onCommand({type: 'CONTINUE'})}>{state.lastResult.outcome === 'won' ? '带伙伴回家 →' : '调整防线，再试一次'}</button></section>}
          {state.phase === 'settlement' && standaloneBattle && <section className="event-card rescue-card"><span className="eyebrow">{finaleBattle ? 'L05 · LIGHT THE WAY HOME' : tunnelBattle ? 'L04 · UNDERGROUND TUNNEL' : greenhouseBattle ? 'L03 · ABANDONED GREENHOUSE' : 'L02 · MIDNIGHT MARKET'}</span><h2>{state.lastResult.outcome === 'won' ? finaleBattle ? '所有的光，终于照亮归途' : tunnelBattle ? '暗道的归路守住了' : greenhouseBattle ? '花房的归路守住了' : '集市的灯火守住了' : finaleBattle ? '伙伴们还在，重新安排终局防线' : tunnelBattle ? '再调整一次暗道防线' : greenhouseBattle ? '再调整一次花房防线' : '再调整一次集市防线'}</h2><p>{state.lastResult.message}</p><button data-testid={finaleBattle ? 'finale-continue' : tunnelBattle ? 'tunnel-continue' : greenhouseBattle ? 'greenhouse-continue' : 'market-continue'} disabled={disabled} onClick={() => onCommand({type: 'CONTINUE'})}>{state.lastResult.outcome === 'won' ? state.mapId==='warehouse'?'返回仓库 →':'返回家园 →' : '调整防线，再试一次'}</button></section>}
          {showExploreResult && resolution && <section className="event-card explore-result-card"><span className="eyebrow">一次相遇的结果</span><EventResult resolution={resolution}/><button disabled={disabled} onClick={() => {setDismissedResult(resolutionKey);arrivedFromEvent.current = false;}}>继续赶路 →</button></section>}
          {paused && <div className="pause-label"><span>旅程已暂停</span><button onClick={onPause}>继续旅程</button></div>}
        </div>
        {footerVisible && <div className={`world-footer${hintHidden ? ' hint-idle' : ''}`}>{footerTextVisible && <p key={nearHint ?? inspectHint ?? footerGuideText ?? 'hint'} className={inspectHint && state.phase === 'explore' ? 'inspect-hint' : ''}>{nearHint ? <><span className="hint-paw">🐾</span>{nearHint}{warehouseOptionalHint&&<small className="optional-investigation-hint">{warehouseOptionalHint}</small>}</> : inspectHint && state.phase === 'explore' ? <><span className="hint-paw">🐾</span>{displayedInspectHint}</> : displayedGuide}</p>}
          {state.phase === 'explore' && <>{near && nearTarget && <button disabled={disabled} onClick={() => onInteract(nearTarget.id)}>{nearTarget.label}</button>}{state.flags.includes('lost_poster_found') && state.flags.includes('alley_rescued') && state.mapId !== 'market' && <button className="home-return-button" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>回到花房</button>}</>}
        </div>}
      </section></div>
    </main>
    {journalOpen && <Modal title="旅程记录" onClose={onJournal} className="journey-modal"><header><span className="eyebrow">OUR LITTLE JOURNEY</span><h2>旅程记录</h2></header><JourneyRecord state={state} busy={busy} pending={pending}/></Modal>}
    {ceremony && <DiceRollOverlay resolution={ceremonyResolution} startedAt={ceremony.startedAt} onClose={() => setCeremony(null)}/>}
  </div>;
}
