import {useEffect, useState} from 'react';
import type {Catalog, GameCommand, GameState, QATools} from '../contracts';
import {QA_CHAPTERS, QA_PHASE_LABELS, qaCurrentActions} from '../modules/qa/flow';
import Modal from './Modal';
import {HomeBattleTrials} from './HomePanel';
import './acceptance.css';

interface Props {
  state: GameState; catalog: Catalog; busy: boolean; pending: boolean; error: string;
  loadTools: () => Promise<QATools>;
  onCommand: (command: GameCommand) => Promise<boolean>;
  onSkip: () => Promise<boolean>; onRetry: () => void; onClose: () => void;
}

export default function AcceptancePanel({state, catalog, busy, pending, error, loadTools, onCommand, onSkip, onRetry, onClose}: Props) {
  const [tools, setTools] = useState<QATools | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [chapter, setChapter] = useState(state.chapterId);
  const [eventId, setEventId] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoadError('');setTools(null);
    void loadTools().then(value => {if (!cancelled) setTools(value);}).catch(e => {if (!cancelled) setLoadError(e instanceof Error ? e.message : '验收能力读取失败');});
    return () => {cancelled = true;};
  }, [loadTools, loadAttempt]);
  const selected = QA_CHAPTERS.find(item => item.id === chapter) ?? QA_CHAPTERS[0];
  const current = QA_CHAPTERS.find(item => item.id === state.chapterId);
  const checkpoints = tools?.checkpoints.filter(point => point.chapterId === selected.id && point.kind !== 'event') ?? [];
  const events = tools?.checkpoints.filter(point => point.chapterId === selected.id && point.kind === 'event') ?? [];
  const event = events.find(item => item.id === eventId) ?? events[0];
  const actions = qaCurrentActions(state, catalog, tools?.enabled ?? false);
  const locked = busy || pending;
  const activeStage = catalog.stages.find(stage => stage.id === state.activeBattle?.stageId)?.name;
  const currentEvent = catalog.events.find(item => item.id === state.pendingEventId)?.title;
  return <Modal title="流程验收" onClose={onClose} className="acceptance-panel">
    <header><span className="eyebrow">PLAY THROUGH THE JOURNEY</span><h2>按旅程验收</h2><p>先选章节，再选要检查的节点。进入节点会准备对应测试进度，可随时返回验收前的进度。</p></header>
    <section className="qa-current" aria-label="当前游戏进度">
      <div><span className="eyebrow">{state.qaCheckpointId ? '验收进度' : '当前进度'}</span><h3>{current?.label} · {current?.title}</h3><p>{QA_PHASE_LABELS[state.phase]}{activeStage ? ` · ${activeStage}` : currentEvent ? ` · ${currentEvent}` : ''}</p></div>
      <button className="secondary" onClick={onClose}>回到场景继续验收</button>
      {state.qaCheckpointId && <button data-testid="qa-restore" disabled={locked} onClick={() => void onCommand({type: 'QA_RESTORE'})}>返回验收前进度</button>}
    </section>
    {(error || loadError) && <div className="qa-error" role="alert"><p>{error || loadError}</p>{loadError ? <button disabled={locked} onClick={() => setLoadAttempt(value => value + 1)}>重新读取验收能力</button> : pending ? <button disabled={busy} onClick={onRetry}>重试未确认操作</button> : null}</div>}
    {!tools && !loadError && <p role="status">正在读取服务端验收能力……</p>}
    {tools && !tools.enabled && <p className="qa-unavailable" role="status">服务端未启用验收模式。章节跳转与战斗模拟不可用，仍可继续当前流程{state.qaCheckpointId ? '或返回验收前进度' : ''}。部署需启用 GAME_QA_ENABLED=true。</p>}
    {actions.length > 0 && <section className="qa-actions" aria-label="当前流程操作"><h3>接着当前流程</h3><div>{actions.map(action => <div key={action.id}><button data-testid={action.id} disabled={locked || !!action.reason} onClick={() => action.skip ? void onSkip() : action.command && void onCommand(action.command)}>{action.label}</button>{action.reason && <small>{action.reason}</small>}</div>)}</div></section>}
    <nav className="qa-chapters" aria-label="按章节选择验收"><div role="tablist" aria-label="验收章节">{QA_CHAPTERS.map(item => <button key={item.id} id={`qa-tab-${item.id}`} role="tab" aria-selected={selected.id === item.id} aria-controls={`qa-chapter-${item.id}`} data-testid={`qa-chapter-${item.id}`} onClick={() => {setChapter(item.id);setEventId('');}}><span>{item.label}</span><strong>{item.title}</strong>{item.id === state.chapterId && <small>当前章节</small>}</button>)}</div></nav>
    <section className="qa-chapter" id={`qa-chapter-${selected.id}`} role="tabpanel" aria-labelledby={`qa-tab-${selected.id}`}>
      <header><div><span className="eyebrow">{selected.label}</span><h3>{selected.title}</h3></div><p>{selected.route}</p></header>
      {tools?.enabled && <ol className="qa-checkpoints">{checkpoints.map((point, index) => <li key={point.id} data-current={state.qaCheckpointId === point.id || undefined}><span className="qa-step" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h4>{point.title}<small>{QA_PHASE_LABELS[point.phase]}</small></h4><p>{point.detail}</p></div><button data-testid={point.id === 'market.explore' ? 'dev-enter-market-exploration' : point.id === 'market.story' ? 'dev-start-market-story' : point.id === 'alley.explore' ? 'dev-direct-alley' : `qa-load-${point.id}`} disabled={locked} onClick={() => void onCommand({type: 'QA_CHECKPOINT', checkpointId: point.id})}>{state.qaCheckpointId === point.id ? '重新验收' : '进入验收'}</button></li>)}</ol>}
      {tools?.enabled && events.length > 0 && <section className="qa-events"><div><h4>单张事件卡</h4><p>直接打开指定事件，检查选项、掷骰与后果。所需伙伴和事件链条件会自动备齐。</p></div><label>选择事件<select value={event?.id ?? ''} disabled={locked} onChange={e => setEventId(e.target.value)}>{events.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button data-testid="qa-load-event" disabled={locked || !event} onClick={() => event && void onCommand({type: 'QA_CHECKPOINT', checkpointId: event.id})}>验收这张事件卡</button>{(selected.id === 'greenhouse' || selected.id === 'finale') && <small>这里提供独立事件卡验收，自由探索地图尚未接入。</small>}</section>}
    </section>
    {state.phase==='home' && tools?.enabled && <HomeBattleTrials state={state} disabled={locked} onCommand={c=>void onCommand(c)}/>}
    <details className="qa-diagnostics"><summary>查看状态详情</summary><dl><dt>阶段 / 地图</dt><dd>{state.phase} / {state.mapId}</dd><dt>剧情节点</dt><dd>{state.storyNodeId || '无'}</dd><dt>验收节点</dt><dd>{state.qaCheckpointId || '未进入验收进度'}</dd><dt>存档版本</dt><dd>{state.revision}</dd></dl><p>{state.lastResult.message}</p></details>
  </Modal>;
}
