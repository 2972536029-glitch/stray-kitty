import {useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode} from 'react';
import type {Catalog, GameCommand, GameState} from '../contracts';
import type {CatBreed} from '../adapters/canvas/pixelCat';
import type {SceneAnchor} from './DialogueBubble';
import {currentStory, objective} from '../core/story';
import PixelCat from './PixelCat';
import DialoguePanel from './DialoguePanel';
import DiceEvent, {Dice} from './DiceEvent';
import HomePanel from './HomePanel';
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

const phases: Record<string, string> = {dialogue: '猫咪物语', explore: '小巷探索', event: '一次相遇', preparation: '守护准备', battle: '序章守护', settlement: '救援结果', home: '我们的花房'};
interface Props {
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
export default function GameScreen({state, catalog, busy, pending, disabled, paused, near, nearTarget, inspectHint, journalOpen, topExpanded, onToggleTopbar, speakerAnchor, onJournal, onSkip, qaOpen, onQA, onCommand, onInteract, onPause, onMap, onShop, onParcels, onRecharge, onSettings, onWarehouse, onDecorate, onTitle, children}: Props) {
  // 首次进入守护准备时的教学高亮；完成后记在本地，不再打扰。
  const [battleTutorialDone, setBattleTutorialDone] = useState(() => {try {return localStorage.getItem('stray-kitty.tutorial.battle') === 'done';} catch {return true;}});
  const [homeTutorialDone, setHomeTutorialDone] = useState(() => {try {return localStorage.getItem('stray-kitty.tutorial.home') === 'done';} catch {return true;}});
  const [homeOpen, setHomeOpen] = useState(true);
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
    ? `靠近「${nearTarget.label.replace(/\s*·\s*E$/, '')}」了，按 E 互动`
    : null;
  const hintHidden = state.phase === 'explore' && introHintDone && !nearHint && !inspectHint;
  // 沉浸化：底部提示只保留真正有用的引导（战斗说明/章节目标/操作教学），删除“每次相遇，都可能成为回家路上的一点光。”常驻兜底。
  const footerGuideText = finaleBattle && state.phase === 'battle' ? '躲开预告的横扫与坠击，选择护卫与首领的攻击顺序。十波清完、两精英与九格首领全部击败后获胜；援军固定支援，主力仍需你的指挥。' : tunnelBattle && state.phase === 'battle' ? '保护 C2 的喵喵；断灯时可用墨墨夜视恢复视野并为全队加盾。守完八波并击败首领；打开地图、商店或返回标题会暂停战斗。' : greenhouseBattle && state.phase === 'battle' ? '沿花房的不规则通路布阵，守住 B1；守完八波并击败四格首领。打开地图、商店或返回标题会暂停战斗。' : marketBattle && state.phase === 'battle' ? '点选伙伴查看与释放技能；守完八波并击败集市首领。打开地图、商店或返回标题会暂停战斗。' : chapterBattle && state.phase === 'battle' ? '点场上的猫查看和释放技能，守住 A4 与右侧两处巷口；守完八波并击败首领。打开地图、商店或返回标题会暂停战斗。' : (explorationFooterText(state.phase, state.mapId, catalog.tutorials.find(t => t.phase === state.phase)?.text, objective(state)) ?? '');
  // 没有任何要展示的内容时整条 world-footer 不再渲染（连同 DOM 一起消失，不留空壳长条）。
  const homeButtonVisible = state.phase === 'explore' && state.flags.includes('lost_poster_found') && state.flags.includes('alley_rescued') && state.mapId !== 'market';
  const footerVisible = !!nearHint || (!!inspectHint && state.phase === 'explore') || !!footerGuideText || homeButtonVisible;
  // 教学期（进场 3 秒）结束后，探索阶段不再回落到“方向键 / WASD”类兜底教学文案：
  // 否则离开交互物时 <p key> 变化重挂、把兜底字重新点亮 6 秒，看起来像提示“变成”了移动教学（所有地图一致修掉）。
  const footerTextVisible = !!nearHint || (!!inspectHint && state.phase === 'explore') || (!!footerGuideText && (state.phase !== 'explore' || !introHintDone));
  // 沉浸式顶栏：展开时点顶栏以外的空白（画布、面板外壳）自动收起；战斗阶段点画布频繁，只允许手动收起。
  const topbarOpen = topExpanded;
  useEffect(() => {
    if (!topExpanded || state.phase === 'battle') return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.topbar, .topbar-toggle, dialog, .game-modal')) return;
      onToggleTopbar(false);
    };
    window.addEventListener('pointerdown', dismiss);
    return () => {window.removeEventListener('pointerdown', dismiss);};
  }, [topExpanded, state.phase, onToggleTopbar]);
  // 折叠小钮可自由拖拽：松手后吸附到最近的屏幕边（上/下/左/右），沿边位置随手指保留，记忆在本地。
  type ToggleEdge = 'top' | 'bottom' | 'left' | 'right';
  interface ToggleAnchor {edge: ToggleEdge; pos: number}
  const clampRange = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const legacyAnchor = (id: string): ToggleAnchor => {
    const vw = window.innerWidth;
    const map: Record<string, ToggleAnchor> = {
      'top-left': {edge: 'top', pos: 60}, 'top-center': {edge: 'top', pos: vw / 2}, 'top-right': {edge: 'top', pos: vw - 186},
      'bottom-left': {edge: 'bottom', pos: 60}, 'bottom-center': {edge: 'bottom', pos: vw / 2}, 'bottom-right': {edge: 'bottom', pos: vw - 60},
    };
    return map[id] ?? {edge: 'top', pos: vw / 2};
  };
  const [toggleAnchor, setToggleAnchor] = useState<ToggleAnchor>(() => {
    try {
      const raw = localStorage.getItem('stray-kitty.hud.topbarToggle');
      if (!raw) return {edge: 'top', pos: window.innerWidth / 2};
      const parsed = JSON.parse(raw) as ToggleAnchor;
      if (parsed && ['top', 'bottom', 'left', 'right'].includes(parsed.edge) && typeof parsed.pos === 'number') return parsed;
      return legacyAnchor(raw);
    } catch {return {edge: 'top', pos: window.innerWidth / 2};}
  });
  const [toggleDrag, setToggleDrag] = useState<{x: number; y: number} | null>(null);
  const toggleGrab = useRef<{x: number; y: number; moved: boolean} | null>(null);
  const snapToggle = (x: number, y: number) => {
    const vw = window.innerWidth, vh = window.innerHeight;
    // 四条边取最近者：上下边沿保留水平落点，左右边沿保留垂直落点（钳在安全范围内）。
    const distances: Record<ToggleEdge, number> = {top: y, bottom: vh - y, left: x, right: vw - x};
    const edge = (Object.entries(distances) as [ToggleEdge, number][]).sort((a, b) => a[1] - b[1])[0][0];
    const next: ToggleAnchor = edge === 'top' || edge === 'bottom'
      ? {edge, pos: clampRange(x, 64, vw - 64)}
      : {edge, pos: clampRange(y, 44, vh - 44)};
    setToggleAnchor(next);
    try {localStorage.setItem('stray-kitty.hud.topbarToggle', JSON.stringify(next));} catch {/* 隐私模式下跳过记忆 */}
  };
  // 窗口尺寸变化后重算静止落点（否则吸在右/下边缘的小钮在窗口缩小后可能跑出屏幕）。
  const [viewportTick, setViewportTick] = useState(0);
  useEffect(() => {
    const onResize = () => setViewportTick(tick => tick + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // 静止态的落点：按边换算成 left/top（钮宽约 64、高约 33，用中心坐标减半居中）。
  const toggleRestStyle = useMemo((): CSSProperties => {
    const vw = window.innerWidth, vh = window.innerHeight, {edge, pos} = toggleAnchor;
    if (edge === 'top') return {left: clampRange(pos - 32, 10, vw - 74), top: 8};
    if (edge === 'bottom') return {left: clampRange(pos - 32, 10, vw - 74), top: vh - 46};
    if (edge === 'left') return {left: 12, top: clampRange(pos - 17, 8, vh - 52)};
    return {left: vw - 76, top: clampRange(pos - 17, 8, vh - 52)};
  }, [toggleAnchor, viewportTick]);
  const onTogglePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    toggleGrab.current = {x: event.clientX, y: event.clientY, moved: false};
  };
  const onTogglePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const grab = toggleGrab.current;
    if (!grab) return;
    if (!grab.moved && Math.hypot(event.clientX - grab.x, event.clientY - grab.y) < 6) return;
    grab.moved = true;
    setToggleDrag({x: event.clientX, y: event.clientY});
  };
  const onTogglePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const grab = toggleGrab.current;
    toggleGrab.current = null;
    if (!grab) return;
    if (!grab.moved) {onToggleTopbar(!topExpanded);playSound(topExpanded ? 'close' : 'open');return;}
    snapToggle(event.clientX, event.clientY);
    setToggleDrag(null);
  };
  const isHomeScene = state.chapterId !== 'prologue' && (state.phase === 'home' || (state.phase === 'dialogue' && node?.scene === 'home'));
  return <div className="app-shell" data-phase={state.phase} data-home-scene={isHomeScene || undefined}>
    <button type="button"
      className={`topbar-toggle${topExpanded ? ' expanded' : ''}${toggleDrag ? ' dragging' : ''}`}
      style={toggleDrag ? {left: toggleDrag.x - 32, top: toggleDrag.y - 17} : toggleRestStyle}
      aria-expanded={topExpanded} aria-label={topExpanded ? '收起顶部信息栏' : '展开顶部信息栏（可拖拽）'}
      onPointerDown={onTogglePointerDown} onPointerMove={onTogglePointerMove} onPointerUp={onTogglePointerUp} onPointerCancel={onTogglePointerUp}>
      <span className="topbar-toggle-paw" aria-hidden="true">ฅ</span><span className="topbar-toggle-chev" aria-hidden="true">▾</span>
    </button>
    <header className={`topbar${topbarOpen ? '' : ' topbar-collapsed'}`}><button className="brand" onClick={onTitle} aria-label="返回标题"><span className="brand-mark">ฅ</span><span><strong>小猫回家记</strong><small>流 浪 猫 王 国</small></span></button>
      <span className="chapter-pill">{finaleBattle ? '第五章 · 终局试玩' : tunnelBattle ? '第四章 · 地下通道试玩' : greenhouseBattle ? '第三章 · 废弃花房试玩' : marketBattle ? '第二章 · 集市防线战斗试玩' : tutorialBattle ? '序章 · 金枪鱼事件' : chapterBattle ? '第一章 · 陌生小巷' : chapter?.title}</span>
      <div className="wallet"><span><span className="wallet-label">✦ 猫爪邮票</span> <b data-testid="stamps">{state.currencies.stamp ?? 0}</b></span><span><span className="wallet-label">◆ 修缮材料</span> <b>{state.inventory.material ?? 0}</b></span><button className="wallet-tuna" onClick={onRecharge} aria-label="金枪鱼罐头，点击打开补给小站" title="点击打开金枪鱼补给小站"><span className="wallet-label">🥫 金枪鱼罐头</span> <b data-testid="tuna">{state.currencies.tuna ?? 0}</b><small>＋充值</small></button></div>
      <nav aria-label="旅程工具">{state.phase === 'battle' && <button className="battle-host-pause" onClick={onPause}>{paused ? '继续旅程' : '暂停'}</button>}<button className="journal-button" aria-label="旅程记录" aria-haspopup="dialog" aria-expanded={journalOpen} onClick={onJournal}>▤ <span>旅程记录</span></button><button className="map-button" aria-label="章节地图" onClick={onMap}>▦ <span>章节地图</span></button><button className="parcel-button" aria-label="猫爪邮局" onClick={onParcels}>✉ <span>猫爪邮局</span></button><button className="shop-button" aria-label="猫国商店" onClick={onShop}>▣ <span>猫国商店</span></button><button className="settings-button" aria-label="游戏设置" onClick={onSettings}>⚙ <span>设置</span></button>{isDevelopment && <button className="dev-button" aria-label="验收工具" aria-haspopup="dialog" aria-expanded={qaOpen} onClick={onQA}>🛠️ <span>验收</span></button>}</nav></header>
    <main><h1 className="visually-hidden">一只猫的旅程，一群猫的家。</h1>
      <div className="game-layout"><section className="world-panel"><div className="world-toolbar"><div><span className="live-dot"/><strong>{finaleBattle && state.phase === 'battle' ? '终局试玩' : tunnelBattle && state.phase === 'battle' ? '第四章试玩' : greenhouseBattle && state.phase === 'battle' ? '第三章试玩' : marketBattle && state.phase === 'battle' ? '第二章试玩' : chapterBattle && state.phase === 'battle' ? '第一章守护' : phases[state.phase]}</strong><span className="area-label">{finaleBattle ? '总仓库决战' : tunnelBattle ? '暗道守护' : greenhouseBattle ? '花房守护' : marketBattle ? '集市守护' : chapterBattle ? '深巷守护' : isHomeScene ? '拱顶花房' : map?.name}</span></div>{state.phase !== 'battle' && <button className="quiet" onClick={onPause}>{paused ? '继续旅程' : '暂停'}</button>}</div>
        <div className="world-wrap">{children}
          {state.qaCheckpointId && <aside className="qa-active-badge" role="status"><span>正在使用验收进度</span><button onClick={onQA}>返回原进度 / 切换节点</button></aside>}
          {alleyObjective && <div className="alley-objective" key={alleyObjective} role="status"><span>雨巷线索</span><strong>{alleyObjective}</strong></div>}
          {isHomeScene && <aside className="home-life-status"><span>{state.phase === 'dialogue' ? '故事进行中' : '花房日常'}</span><strong>{state.phase === 'dialogue' ? '伙伴们正跟随故事行动' : '拖动猫咪到家具或伙伴身边，一起玩一会儿'}</strong></aside>}
          {state.phase === 'home' && <><button className="home-backpack-entry" disabled={disabled} onClick={onDecorate}>▧ 家具背包<small>拖拽布置 · 移动与收回</small></button><button className="home-tools-toggle" aria-expanded={homeOpen} aria-controls="home-management" onClick={() => setHomeOpen(!homeOpen)}>{homeOpen ? '收起家园面板' : '整理家园'} <span aria-hidden="true">{homeOpen ? '−' : '＋'}</span></button>{homeOpen && <div id="home-management" className="home-controls"><HomePanel state={state} catalog={catalog} disabled={disabled} onCommand={onCommand} onShop={onShop} onParcels={onParcels} onRecharge={onRecharge} onWarehouse={onWarehouse} onDecorate={onDecorate}/></div>}</>}
          {state.phase === 'dialogue' && node && <DialoguePanel node={node} disabled={disabled} onNext={() => onCommand({type: 'ADVANCE_STORY', nodeId: node.id})} onSkip={onSkip} getSpeakerAnchor={speakerAnchor} eventResult={resolution?.outcome.situation?.storyNodeId === node.id ? <EventResult resolution={resolution} compact/> : undefined}/>}
          {state.phase === 'event' && event && <DiceEvent key={event.id} event={event} disabled={disabled} rolling={busy} random={state.pendingEventSource === 'random'} teaser={state.pendingEventSource === 'random' ? state.lastResult.message : undefined} partyCats={state.cats} pushTokens={state.pushTokens ?? 0} onChoose={(optionId, usePush) => onCommand({type: 'CHOOSE_EVENT', eventId: event.id, optionId, usePush})}/>}
          {state.phase === 'preparation' && finaleBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><FinaleLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && tunnelBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><TunnelLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && greenhouseBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><GreenhouseLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && marketBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><MarketLoadout disabled={disabled} onCommand={onCommand}/><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回家园</button></section>}
          {state.phase === 'preparation' && chapterBattle && <section className="event-card preparation-card"><p>{state.lastResult.message}</p><ChapterLoadout stageId={retryStage} disabled={disabled} onCommand={onCommand}/></section>}
          {needsCrateRecovery && <section className="event-card preparation-card"><h2>先找到纸箱里的伙伴</h2><p>回到小巷继续寻找，发现伙伴后再准备守护。</p><button disabled={disabled} onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'alley'})}>返回小巷寻找纸箱 →</button></section>}
          {state.phase === 'preparation' && !needsCrateRecovery && !chapterBattle && !standaloneBattle && <section className="event-card preparation-card"><span className="eyebrow">{state.mapId === 'market' ? 'MIDNIGHT MARKET INTEL' : 'RESCUE MISSION 01'}</span><h2>{state.mapId === 'market' ? '集市情报与收获' : '为伙伴点亮一条路'}</h2>{resolution ? <EventResult resolution={resolution}/> : state.lastResult.roll ? <div className="roll-result"><Dice value={state.lastResult.roll}/><span>骰子 · {state.lastResult.roll} 点</span></div> : <PixelCat breed="tuanzi" size={78}/>}<p>{!resolution || state.lastResult.outcome === 'lost' ? state.lastResult.message : state.mapId === 'market' ? '从鸟雀们那里得到了重要的线索与物资。' : '点点会跟上我们。准备好，就一起守住撤离路线。'}</p>{state.mapId === 'market' ? <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}><button disabled={disabled} onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'market'})}>带着收获继续探索集市 →</button><button className="secondary" disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>返回花房基地</button></div> : <><p className="muted">第一章守护 · 四位伙伴与八波黑影<br/>利用站位、蓄能与技能击败首领，最多允许 2 次突破。</p><button className="tutorial-target-battle" disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId: 'alley_rescue'})}>开始守护 →</button></>}</section>}
          {state.phase === 'preparation' && !battleTutorialDone && <TutorialHighlight selector=".tutorial-target-battle" kicker="守护教学" text="每盏灯消耗 2 格能量，每 4 秒回复 1 格。点击「开始守护」，为点点点亮第一条撤离路线。" storageKey="stray-kitty.tutorial.battle" onDone={() => setBattleTutorialDone(true)}/>}
          {state.phase === 'home' && homeOpen && !homeTutorialDone && <TutorialHighlight selector=".home-backpack-entry" kicker="整理家园" text="打开底部家具背包，把家具往上拖进场景。也能拖猫咪到家具或伙伴身边互动，按 Esc 取消拖动。" storageKey="stray-kitty.tutorial.home" onDone={() => setHomeTutorialDone(true)}/>}
          {state.phase === 'settlement' && state.activeBattle?.stageId === 'l00_tutorial' && <section className="event-card rescue-card"><span className="eyebrow">L00 · FIRST LIGHT</span><div className="rescue-cats"><PixelCat size={90} mood="brave"/></div><h2>{state.lastResult.outcome === 'won' ? '第一道防线守住了。' : '再调整一次站位与技能时机。'}</h2><p>{state.lastResult.message}</p><button disabled={disabled} onClick={() => onCommand(state.lastResult.outcome === 'won' ? {type: 'CONTINUE'} : {type: 'START_BATTLE', stageId: 'l00_tutorial'})}>{state.lastResult.outcome === 'won' ? '进入雨夜小巷 →' : '重新开始教学'}</button></section>}
          {state.phase === 'settlement' && !standaloneBattle && state.activeBattle?.stageId !== 'l00_tutorial' && <section className="event-card rescue-card"><span className="eyebrow">{state.lastResult.outcome === 'won' ? 'A SAFE WAY HOME' : 'TRY A LITTLE DIFFERENTLY'}</span><div className="rescue-cats"><PixelCat size={90} mood="brave"/>{state.cats.includes('diandian') && <PixelCat breed="diandian" size={80}/>}<PixelCat breed="tuanzi" size={86}/></div><h2>{state.lastResult.outcome === 'won' ? activeStage === 'alley_boss' ? '深巷里的黑影散去了' : '回家的路，也是救援的开始。' : '再一起想想办法。'}</h2><p>{state.lastResult.message}</p>{state.lastResult.firstClear && state.lastResult.stageId === 'alley_rescue' && <p className="reward-note">点点加入 · 纸箱猫窝<br/>✦ 猫爪邮票 ×2 · ◆ 材料 ×3</p>}<button disabled={disabled} onClick={() => onCommand({type: 'CONTINUE'})}>{state.lastResult.outcome === 'won' ? '带伙伴回家 →' : '调整防线，再试一次'}</button></section>}
          {state.phase === 'settlement' && standaloneBattle && <section className="event-card rescue-card"><span className="eyebrow">{finaleBattle ? 'L05 · LIGHT THE WAY HOME' : tunnelBattle ? 'L04 · UNDERGROUND TUNNEL' : greenhouseBattle ? 'L03 · ABANDONED GREENHOUSE' : 'L02 · MIDNIGHT MARKET'}</span><h2>{state.lastResult.outcome === 'won' ? finaleBattle ? '所有的光，终于照亮归途' : tunnelBattle ? '暗道的归路守住了' : greenhouseBattle ? '花房的归路守住了' : '集市的灯火守住了' : finaleBattle ? '伙伴们还在，重新安排终局防线' : tunnelBattle ? '再调整一次暗道防线' : greenhouseBattle ? '再调整一次花房防线' : '再调整一次集市防线'}</h2><p>{state.lastResult.message}</p><button data-testid={finaleBattle ? 'finale-continue' : tunnelBattle ? 'tunnel-continue' : greenhouseBattle ? 'greenhouse-continue' : 'market-continue'} disabled={disabled} onClick={() => onCommand({type: 'CONTINUE'})}>{state.lastResult.outcome === 'won' ? state.mapId==='warehouse'?'返回仓库 →':'返回家园 →' : '调整防线，再试一次'}</button></section>}
          {showExploreResult && resolution && <section className="event-card explore-result-card"><span className="eyebrow">一次相遇的结果</span><EventResult resolution={resolution}/><button disabled={disabled} onClick={() => {setDismissedResult(resolutionKey);arrivedFromEvent.current = false;}}>继续赶路 →</button></section>}
          {paused && <div className="pause-label"><span>旅程已暂停</span><button onClick={onPause}>继续旅程</button></div>}
        </div>
        {footerVisible && <div className={`world-footer${hintHidden ? ' hint-idle' : ''}`}>{footerTextVisible && <p key={nearHint ?? inspectHint ?? footerGuideText ?? 'hint'} className={inspectHint && state.phase === 'explore' ? 'inspect-hint' : ''}>{nearHint ? <><span className="hint-paw">🐾</span>{nearHint}</> : inspectHint && state.phase === 'explore' ? <><span className="hint-paw">🐾</span>{inspectHint}</> : footerGuideText}</p>}
          {state.phase === 'explore' && <>{near && nearTarget && <button disabled={disabled} onClick={() => onInteract(nearTarget.id)}>{nearTarget.label}</button>}{state.flags.includes('lost_poster_found') && state.flags.includes('alley_rescued') && state.mapId !== 'market' && <button disabled={disabled} onClick={() => onCommand({type: 'GO_HOME'})}>回到花房</button>}</>}
        </div>}
      </section></div>
    </main>
    {journalOpen && <Modal title="旅程记录" onClose={onJournal} className="journey-modal"><header><span className="eyebrow">OUR LITTLE JOURNEY</span><h2>旅程记录</h2></header><aside className="journal">
        <section className="journal-card"><span className="eyebrow">OUR LITTLE QUEST</span><h2>现在的小目标</h2><p>{objective(state)}</p><ol className="quest-steps"><li className={state.chapterId !== 'prologue' ? 'done' : ''}>遇见团子</li><li className={state.phase !== 'dialogue' || state.cats.includes('diandian') ? 'done' : ''}>寻找纸箱里的叫声</li><li className={state.cats.includes('diandian') ? 'done' : ''}>守护点点的撤离路线</li><li className={state.flags.includes('rescue_story_done') ? 'done' : ''}>一起安顿花房</li>{state.flags.includes('rescue_story_done') && <li className={state.flags.includes('chapter_2_started') || state.mapId === 'market' || state.flags.includes('chapter_3_started') ? 'done' : ''}>探访午夜集市</li>}{(state.flags.includes('chapter_2_started') || state.flags.includes('chapter_3_started')) && <li className={state.flags.includes('chapter_3_started') || state.flags.includes('chapter_4_started') ? 'done' : ''}>修缮花房要塞</li>}{(state.flags.includes('chapter_3_started') || state.flags.includes('chapter_4_started')) && <li className={state.flags.includes('chapter_4_started') ? 'done' : ''}>深入暗道营救</li>}{(state.flags.includes('chapter_4_started') || state.flags.includes('finale_started')) && <li className={state.flags.includes('finale_completed') ? 'done' : ''}>点亮流浪猫王国</li>}</ol></section>
        <section className="journal-card"><div className="card-title"><h2>一路上的伙伴</h2><span>{state.cats.length} / {catalog.cats.length}</span></div><div className="cat-list">{catalog.cats.map(cat => <div className={`cat-entry ${state.cats.includes(cat.id) ? '' : 'locked'}`} key={cat.id}><PixelCat breed={cat.id} size={54}/><div><strong>{cat.name}<span>{state.cats.includes(cat.id) ? cat.id === 'miaomiao' ? '领队' : '伙伴' : '未相遇'}</span></strong><small>{state.cats.includes(cat.id) ? cat.description : '还有新的相遇，在前方等待。'}</small></div></div>)}</div></section>
        <div className="save-note" role="status"><span className="live-dot"/>{busy ? '正在记录旅程……' : pending ? '有一次操作等待确认' : '旅程已自动保存'}<small>刷新页面后，可以继续。</small></div>
      </aside></Modal>}
  </div>;
}
