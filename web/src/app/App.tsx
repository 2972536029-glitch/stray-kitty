import {useCallback, useEffect, useRef, useState} from 'react';
import {useGame} from './useGame';
import {Viewport} from '../examples/demo/Viewport';
import type {DemoScene} from '../examples/demo/scene';
import type {CatBreed} from '../adapters/canvas/pixelCat';
import {BattleHost} from '../modules/battle/BattleHost';
import {currentStory} from '../core/story';
import StartScreen from '../ui/StartScreen';
import GameScreen from '../ui/GameScreen';
import WorldMap from '../ui/WorldMap';
import ShopPanel from '../ui/ShopPanel';
import ParcelDialog from '../modules/lottery/ParcelDialog';
import RechargeDialog from '../ui/RechargeDialog';
import WarehousePanel, {type ConfirmedLoadout} from '../ui/WarehousePanel';
import SettingsPanel from '../ui/SettingsPanel';
import PrologueSequence from '../ui/PrologueSequence';
import {useAudioManager, type BgmMode} from '../ui/useAudioManager';
import {playSound} from '../ui/soundEffects';
import AuthDialog from '../ui/AuthDialog';
import {rainyAlleyObject} from '../modules/rainyAlley/assets';
import AcceptancePanel from '../ui/AcceptancePanel';
import Modal from '../ui/Modal';
import type {GameCommand} from '../contracts';

export default function App() {
  const warehouseReview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('warehouseQA');
  const game = useGame();
  const {state, catalog, send, reportMove, busy, pending, error, disabled, retry, skipDialogue, resetSession, sessionUnavailable, startNewJourney, refresh, port} = game;
  const [entered, setEntered] = useState(warehouseReview), [paused, setPaused] = useState(false), [near, setNear] = useState(false);
  const [nearTarget, setNearTarget] = useState<{id: string; label: string} | null>(null);
  const [inspectHint, setInspectHint] = useState<string | null>(null);
  const [inspection, setInspection] = useState<{label: string; text: string} | null>(null);
  const [overlay, setOverlay] = useState<'map' | 'parcels' | 'shop' | 'journal' | 'recharge' | 'warehouse' | 'settings' | 'auth' | 'qa' | null>(null);
  const [parcelPool, setParcelPool] = useState<string>();
  const rechargeReturn = useRef<'parcels' | null>(null);
  const openRecharge = (fromParcels = false) => {rechargeReturn.current = fromParcels ? 'parcels' : null;setOverlay('recharge');};
  const [qaVisit, setQAVisit] = useState(0);
  useEffect(() => {setInspection(null);}, [state?.phase, state?.mapId, qaVisit]);
  const loadQATools = useCallback(() => port.qaTools(), [port]);
  const [musicVolume, setMusicVolume] = useState(() => Number(localStorage.getItem('stray-kitty.audio.music') ?? 40));
  const [sfxVolume, setSfxVolume] = useState(() => Number(localStorage.getItem('stray-kitty.audio.sfx') ?? 65));
  const [loadout, setLoadout] = useState<ConfirmedLoadout | null>(null);
  // 序章开场引导只在每个存档的第一次进入时播放。
  // 自动化环境（Playwright 等 navigator.webdriver=true）直接跳过：
  // 全屏点按推进的遮罩会拦住 e2e 对「继续故事」等按钮的点击，队友测试并不感知这段动画。
  const [introDone, setIntroDone] = useState(() => {try {
    if (new URLSearchParams(location.search).has('prologue')) return false; // 烟测专用：强制播放序章动画
    return navigator.webdriver === true || localStorage.getItem('stray-kitty.prologue.intro') === 'done';
  } catch {return true;}});
  // 画布场景实例：对话气泡向它查询说话者头顶的位置。
  const sceneRef = useRef<DemoScene | null>(null);
  const getSpeakerAnchor = useCallback((breed: CatBreed) => sceneRef.current?.speakerAnchor(breed) ?? null, []);
  // 沉浸式顶栏：默认折叠释放视野，点小木签展开；记忆玩家偏好。
  // 首次进场（无偏好记录）先展开展示 2 秒再自动收起，让玩家知道顶栏存在。
  // 自动化环境（navigator.webdriver）默认展开——e2e 需要直接点击顶栏里的旅程记录/商店/返回标题等按钮。
  const firstVisitRef = useRef(false);
  const [topExpanded, setTopExpanded] = useState(() => {try {
    if (navigator.webdriver === true) return true;
    if (localStorage.getItem('stray-kitty.hud.topbar') === null) {firstVisitRef.current = true; return true;}
    return localStorage.getItem('stray-kitty.hud.topbar') === 'expanded';
  } catch {return false;}});
  const topExpandedRef = useRef(topExpanded);
  topExpandedRef.current = topExpanded;
  const toggleTopbar = useCallback((expanded: boolean) => {
    firstVisitRef.current = false; // 玩家手动操作即取消首次自动演示
    setTopExpanded(expanded);
    try {localStorage.setItem('stray-kitty.hud.topbar', expanded ? 'expanded' : 'collapsed');} catch {/* 隐私模式下跳过记忆 */}
  }, []);
  // 首次进场：展开停留 2 秒后平滑收起，并落下偏好记录（此后按玩家偏好走）。
  useEffect(() => {
    if (!firstVisitRef.current) return;
    const timer = window.setTimeout(() => {
      firstVisitRef.current = false;
      setTopExpanded(false);
      try {localStorage.setItem('stray-kitty.hud.topbar', 'collapsed');} catch {/* 隐私模式下跳过记忆 */}
    }, 2200);
    return () => {window.clearTimeout(timer);};
  }, []);
  // 顶栏展开态同步给画布场景（雨巷小地图让位）；Viewport 重建时经 onSceneReady 再补一次。
  useEffect(() => {sceneRef.current?.setTopbarExpanded(topExpanded);}, [topExpanded, entered]);
  // 沉浸式音频：主页/探索/家园/守护各一段循环 BGM；小巷落雨、集市人声作为环境音叠加。
  const audioBgm: BgmMode = !entered || !state ? 'title'
    : state.phase === 'battle' || state.phase === 'preparation' ? 'battle'
    : state.phase === 'home' ? 'home' : 'explore';
  const audioAmbient = entered && state?.phase === 'explore' ? (state.mapId === 'alley' ? 'rain' : state.mapId === 'market' ? 'market' : null) : null;
  useAudioManager({bgm: audioBgm, ambient: audioAmbient, musicVolume, sfxVolume});
  // 错误横幅出现即播低沉音;首次走进花房播上行琶音(每个存档一次)。
  useEffect(() => {if (error) playSound('error');}, [error]);
  const homeChimed = useRef(false);
  useEffect(() => {
    if (state?.phase === 'home' && !homeChimed.current) {
      try {if (localStorage.getItem('stray-kitty.audio.homeChimed') !== 'done') {playSound('chime');localStorage.setItem('stray-kitty.audio.homeChimed', 'done');}}
      catch {/* 隐私模式下跳过记忆 */}
      homeChimed.current = true;
    }
  }, [state?.phase]);
  const rainyPosition = useRef<{x: number; y: number} | undefined>(undefined);
  const tunnelPosition = useRef<{x: number; y: number} | undefined>(undefined);
  const warehousePosition = useRef<{floor:'L0'|'L1';point:{x:number;y:number}} | undefined>(undefined);
  const warehouseClimb = useRef<()=>void>(()=>{});
  const warehouseQAStarted = useRef(false);
  const interact = useCallback((targetId?: string) => {
    const id = targetId || nearTarget?.id;
    if (!id) return;
    if(id==='warehouse_climb'){warehouseClimb.current();return;}
    if(state?.mapId==='warehouse'){void send({type:'INTERACT',interactionId:id,layer:warehousePosition.current?.floor,position:warehousePosition.current?.point});return;}
    if (id === 'tunnel_exit_boss') {
      void send({type: 'START_BATTLE', stageId: 'tunnel_boss', ...(tunnelPosition.current ? {returnPosition:tunnelPosition.current} : {})});
      return;
    }
    const object = rainyAlleyObject(id);
    if (state?.mapId === 'alley' && object?.kind === 'inspection' && object.text) {
      setInspection({label: object.label, text: object.text});
      return;
    }
    void send({type: 'INTERACT', interactionId: id, ...(id==='market_crow_stall'||id==='market_momo_trace'?{layer:'L0',position:rainyPosition.current}:id==='market_pigeon_perch'?{layer:'L1',position:rainyPosition.current}:{})});
  }, [send, nearTarget, state?.mapId]);
  const checkRandomZone = useCallback((zoneId: string, layer?:string,position?:{x:number;y:number}) => busy || pending
    ? Promise.resolve(false)
    : send({type: 'CHECK_RANDOM_ZONE', zoneId, ...(layer?{layer}:{}), ...(position?{position}:{})}), [busy, pending, send]);
  const runQACommand = useCallback(async (command: GameCommand) => {
    const success = await send(command);
    if (success) {
      setOverlay(null);setPaused(false);
      if (command.type === 'QA_CHECKPOINT' || command.type === 'QA_RESTORE') {
        setQAVisit(value => value + 1);setNear(false);setNearTarget(null);setInspectHint(null);
        rainyPosition.current=undefined;tunnelPosition.current=undefined;
      }
    }
    return success;
  }, [send]);
  useEffect(()=>{
    if(!warehouseReview||!state||!catalog||busy||pending||warehouseQAStarted.current)return;
    warehouseQAStarted.current=true;
    if(state.qaCheckpointId?.startsWith('finale.')||state.mapId==='warehouse')return;
    void runQACommand({type:'QA_CHECKPOINT',checkpointId:'finale.explore'});
  },[warehouseReview,state,catalog,busy,pending,runQACommand]);
  const frozen = paused || busy || pending || !!overlay || !!inspection || !entered;
  const randomEligible = !!state && !!catalog?.events.some(event => event.triggers.includes('random') && event.maps?.includes('alley') && (event.requiresFlags ?? []).every(flag => state.flags.includes(flag)) && (event.repeatable || !state.drawnEvents?.includes(`alley:${event.id}`)));
  return <>
    {error && overlay !== 'shop' && overlay !== 'parcels' && overlay !== 'qa' && <div className="error-banner" role="alert">{error}<button disabled={busy} onClick={() => void retry()}>重试上次操作</button>{sessionUnavailable && state && <button disabled={busy} onClick={() => void startNewJourney()}>开始新旅程（保留旧会话记录）</button>}</div>}
    {!state || !catalog ? <main className="loading-card"><span className="brand-mark">ฅ</span><h1>{busy ? '正在寻找熟悉的气味……' : '旅程暂时停在这里'}</h1><p>{busy ? '正在打开小巷和你的旅程记录。' : '请确认本地服务已启动，然后重试。'}</p>{!busy && <><button onClick={() => void retry()}>重新连接</button>{sessionUnavailable && <button onClick={() => void startNewJourney()}>开始新旅程（保留旧会话记录）</button>}</>}</main>
      : <>
        {!entered && <StartScreen hasProgress={state.revision > 0} disabled={disabled} onStart={() => setEntered(true)} onShop={() => setOverlay('shop')} onReset={resetSession} onAuth={() => setOverlay('auth')}/>}
        {/* Keep an active battle mounted and paused behind the title, so returning does not restart its attempt. */}
        {(entered || state.phase === 'battle') && <div hidden={!entered}>
          <GameScreen state={state} catalog={catalog} busy={busy} pending={pending} disabled={disabled || paused || !!overlay || !!inspection} paused={paused} near={near} nearTarget={nearTarget} inspectHint={inspectHint} journalOpen={overlay === 'journal'} topExpanded={topExpanded} onToggleTopbar={toggleTopbar} onJournal={() => setOverlay(overlay === 'journal' ? null : 'journal')} onSkip={skipDialogue} qaOpen={overlay === 'qa'} onQA={() => setOverlay('qa')} onCommand={command => void send(command.type === 'START_BATTLE' && command.stageId === 'alley_rescue' && rainyPosition.current ? {...command, returnPosition: rainyPosition.current} : command)} onInteract={interact} onPause={() => setPaused(!paused)} onMap={() => setOverlay('map')} onShop={() => setOverlay('shop')} onParcels={() => setOverlay('parcels')} onRecharge={() => openRecharge()} onSettings={() => setOverlay('settings')} onWarehouse={() => setOverlay('warehouse')} onTitle={() => {setEntered(false);setPaused(false);}} speakerAnchor={getSpeakerAnchor}>
            {state.phase === 'battle'
              ? <BattleHost key={qaVisit} state={state} catalog={catalog} paused={frozen} onResult={result => void send({type: 'COMPLETE_BATTLE', ...result})}/>
              : <Viewport key={`${state.qaCheckpointId ?? 'journey'}:${qaVisit}`} state={state} storyNode={currentStory(catalog, state)} paused={frozen} onSceneReady={scene => {sceneRef.current = scene;scene?.setTopbarExpanded(topExpandedRef.current);}} onNear={(isNear, id, label) => {setNear(isNear);setNearTarget(isNear && id ? {id, label: label ?? '交互 · E'} : null);}} onInteract={interact} onResult={result => void send({type: 'COMPLETE_BATTLE', ...result})} onInspectHint={setInspectHint} onMove={distance => void reportMove(distance)} onRandomZone={checkRandomZone} onMarketBattle={(floor,position)=>void send({type:'START_BATTLE',stageId:'market_boss',layer:floor,returnPosition:position})} onMarketExit={(floor,position)=>void send({type:'EXIT_MARKET',layer:floor,position})} onWorldPosition={point => {rainyPosition.current = point;if(state.mapId==='tunnel')tunnelPosition.current=point;}} onWarehousePosition={(floor,point)=>{warehousePosition.current={floor,point};}} onWarehouseClimbReady={fn=>{warehouseClimb.current=fn;}} randomEligible={randomEligible}/>}
          </GameScreen>
        </div>}
      </>}
    {/* 序章开场引导只在每个存档的第一次进入时播放,且仅对话相位挂载——教学战中刷新页面不能让动画盖住战斗 UI。 */}
    {entered && state?.chapterId === 'prologue' && state.phase === 'dialogue' && !introDone && <PrologueSequence onComplete={() => {setIntroDone(true);try {localStorage.setItem('stray-kitty.prologue.intro', 'done');} catch {/* 隐私模式下跳过记忆，不影响本次游玩 */}}}/>}
    {inspection && state?.phase === 'explore' && state.mapId === 'alley' && <Modal title={inspection.label} className="inspection-dialog" onClose={() => setInspection(null)}>
      <header><span className="eyebrow">小巷见闻</span><h2>{inspection.label}</h2></header>
      <p>{inspection.text}</p>
      <button onClick={() => setInspection(null)}>继续探索 →</button>
    </Modal>}
    {state && catalog && overlay === 'qa' && <AcceptancePanel state={state} catalog={catalog} busy={busy} pending={pending} error={error} loadTools={loadQATools} onCommand={runQACommand} onSkip={async () => {const success = await skipDialogue();if(success){setOverlay(null);setPaused(false);}return success;}} onRetry={() => void retry()} onClose={() => setOverlay(null)}/>}
    {state && catalog && overlay === 'map' && <WorldMap state={state} catalog={catalog} disabled={disabled} onClose={() => setOverlay(null)} onNavigate={command => {setOverlay(null);void send(command);}}/>}
    {state && catalog && overlay === 'shop' && <ShopPanel state={state} catalog={catalog} disabled={disabled} error={error} onRetry={() => void retry()} onClose={() => setOverlay(null)} onBuy={productId => void send({type: 'BUY_FURNITURE', productId})} onParcels={() => setOverlay('parcels')} onRecharge={() => openRecharge()}/>}
    {state && catalog && overlay === 'parcels' && <ParcelDialog state={state} catalog={catalog} disabled={disabled} retryDisabled={busy} error={error} onRefresh={refresh} initialPool={parcelPool} onPool={setParcelPool} onCommand={send} onRetry={() => void retry()} onClose={() => setOverlay(null)} onRecharge={() => openRecharge(true)} onPlace={(furnitureId,slotId) => send({type:'PLACE_FURNITURE',furnitureId,slotId})}/>}
    {state && catalog && overlay === 'recharge' && (catalog.rechargePacks?.length ?? 0) > 0 && <RechargeDialog playerId={port.playerId()} packs={catalog.rechargePacks!} tuna={state.currencies.tuna ?? 0} api={port} onCharged={refresh} onClose={() => {setOverlay(rechargeReturn.current);rechargeReturn.current=null;}}/>}
    {state && overlay === 'warehouse' && <WarehousePanel chapterId={state.chapterId} onClose={() => setOverlay(null)} onConfirm={value => {console.log('[家园仓库] 确认携带清单', value);setLoadout(value);setOverlay(null);}}/>}
    {overlay === 'settings' && <SettingsPanel musicVolume={musicVolume} sfxVolume={sfxVolume} onMusicVolume={value => {setMusicVolume(value);localStorage.setItem('stray-kitty.audio.music', String(value));}} onSfxVolume={value => {setSfxVolume(value);localStorage.setItem('stray-kitty.audio.sfx', String(value));}} onClose={() => setOverlay(null)}/>}
    {loadout && <div className="visually-hidden" aria-live="polite">已确认暖心罐罐 {loadout.inventoryItems.warmCan} 份，蹦蹦冻干 {loadout.inventoryItems.freezeDry} 份；尚未锁定或扣除库存。</div>}
    {state && overlay === 'auth' && <AuthDialog mode={state.revision > 0 ? 'register' : 'login'} hasProgress={state.revision > 0} api={port} onLoggedIn={async () => {await refresh();setEntered(false);}} onClose={() => setOverlay(null)}/>}
  </>;
}
