import {useCallback, useEffect, useRef, useState} from 'react';
import MobileViewport, {usePortraitPhone} from '../ui/MobileViewport';
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
import FurnitureBackpack from '../modules/home/FurnitureBackpack';
import HomeHub,{type HomeHubTab} from '../modules/home/HomeHub';
import HomePanel from '../ui/HomePanel';
import JourneyRecord from '../ui/JourneyRecord';
import HomeRepairOverlay from '../modules/home/HomeRepairOverlay';
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
import HomeAdvisor from '../modules/advisor/HomeAdvisor';
import {homeAdvisorBlock, type HomeAdvisorActivity} from '../modules/advisor/home-presentation';
import {preloadChapterArtwork, preloadClassicChapterArtwork} from '../modules/map/artwork';
import {trackContinueAdventure, trackChapter1Enter, trackHomePanelOpen} from '../observability/actions';

export default function App() {
  const portraitPhone = usePortraitPhone();
  const warehouseReview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('warehouseQA');
  const game = useGame();
  const {state, catalog, send, reportMove, busy, pending, error, disabled, retry, skipDialogue, resetSession, sessionUnavailable, startNewJourney, refresh, port} = game;
  const storyScene = state && catalog ? currentStory(catalog, state)?.scene : undefined;
  const artworkMap = state?.phase === 'home' || (state?.phase === 'dialogue' && storyScene === 'home') ? 'greenhouse' : state?.mapId;
  // Chapters 1/2/4 use their original early warming, even during the prologue.
  // A warehouse save/review keeps Chapter 5's isolated image-loading policy.
  useEffect(() => {
    if (artworkMap && state?.chapterId !== 'prologue' && state?.phase !== 'battle' && state?.phase !== 'preparation') preloadChapterArtwork(artworkMap);
    if (state && !warehouseReview) preloadClassicChapterArtwork(state.mapId);
  }, [artworkMap, state?.mapId, state?.chapterId, state?.phase, warehouseReview]);
  const [entered, setEntered] = useState(warehouseReview), [paused, setPaused] = useState(false), [near, setNear] = useState(false);
  const [nearTarget, setNearTarget] = useState<{id: string; label: string} | null>(null);
  const [inspectHint, setInspectHint] = useState<string | null>(null);
  const [checkingRandomZone, setCheckingRandomZone] = useState(false);
  const [togglingWarehouseLight, setTogglingWarehouseLight] = useState(false);
  const [inspection, setInspection] = useState<{label: string; text: string} | null>(null);
  const [overlay, setOverlay] = useState<'home' | 'advisor' | 'decorate' | 'map' | 'parcels' | 'shop' | 'journal' | 'recharge' | 'warehouse' | 'settings' | 'auth' | 'qa' | null>(null);
  const [homeRepairActivity,setHomeRepairActivity]=useState({renovating:false,repairCardOpen:false});
  const [homeTutorialOpen,setHomeTutorialOpen]=useState(false);
  const setHomeAdvisorOpen=useCallback<React.Dispatch<React.SetStateAction<boolean>>>(value=>setOverlay(current=>{
    const next=typeof value==='function'?value(current==='advisor'):value;
    return next?'advisor':current==='advisor'?null:current;
  }),[]);
  useEffect(()=>{if(!entered||state?.phase!=='home')setOverlay(current=>current==='advisor'?null:current);},[entered,state?.phase]);
  const [homeTab,setHomeTab]=useState<HomeHubTab>('overview');
  const openHome=(tab:HomeHubTab='overview')=>{setHomeTab(tab);setOverlay('home');};
  const homeNavigate=async(command:GameCommand)=>{if(await send(command))setOverlay(null);};
  const [decorateFurniture,setDecorateFurniture]=useState<string>();
  const openDecorate=(id?:string)=>{setDecorateFurniture(id);setOverlay('decorate');};
  const [parcelPool, setParcelPool] = useState<string>();
  const rechargeReturn = useRef<'parcels' | null>(null);
  const openRecharge = (fromParcels = false) => {if(state?.phase==='home'){openHome('recharge');return;}rechargeReturn.current = fromParcels ? 'parcels' : null;setOverlay('recharge');};
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
  const [homeScene,setHomeScene]=useState<DemoScene|null>(null);
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
  // 模块二业务埋点:进入第一章(章节 alley)即转化漏斗终点,每次会话一次;
  // 老玩家点「继续冒险」直接落回小巷(无序章)时也补记,保证漏斗两步成对出现。
  const chapter1Tracked = useRef(false);
  useEffect(() => {
    if (chapter1Tracked.current || !entered || state?.chapterId !== 'alley') return;
    chapter1Tracked.current = true;
    trackChapter1Enter();
  }, [entered, state?.chapterId]);
  // 模块二业务埋点:进入花房(家园相位)开始计时,本次花房时段内首次打开「布置」面板即上报
  // 进入花房→打开面板的耗时;离开花房重置,同时段后续打开不重复计。
  const homeSince = useRef<number | null>(null);
  const homePanelTracked = useRef(false);
  useEffect(() => {
    if (!entered || state?.phase !== 'home') {homeSince.current = null;return;}
    if (homeSince.current === null) homeSince.current = performance.now();
    homePanelTracked.current = false;
  }, [entered, state?.phase]);
  useEffect(() => {
    if (homeSince.current === null || homePanelTracked.current) return;
    if (overlay === 'decorate') {
      trackHomePanelOpen(performance.now() - homeSince.current);
      homePanelTracked.current = true;
    }
  }, [overlay]);
  const rainyPosition = useRef<{x: number; y: number} | undefined>(undefined);
  const tunnelPosition = useRef<{x: number; y: number} | undefined>(undefined);
  const warehousePosition = useRef<{floor:'L0'|'L1';point:{x:number;y:number}} | undefined>(undefined);
  const warehouseClimb = useRef<()=>void>(()=>{});
  const warehouseQAStarted = useRef(false);
  const interact = useCallback((targetId?: string) => {
    if (checkingRandomZone) return;
    const id = targetId || nearTarget?.id;
    if (!id) return;
    if(id==='warehouse_climb'){warehouseClimb.current();return;}
    if(state?.mapId==='warehouse'){
      if(busy||pending||togglingWarehouseLight)return;
      const light=['entry_lamp','central_spotlight','secondary_lamp'].includes(id);
      const preview=light?sceneRef.current:null;
      if(light){preview?.previewWarehouseLight(id);setTogglingWarehouseLight(true);}
      void send({type:'INTERACT',interactionId:id,layer:warehousePosition.current?.floor,position:warehousePosition.current?.point})
        .then(success=>{if(!success)preview?.cancelWarehouseLightPreview();})
        .finally(()=>{if(light)setTogglingWarehouseLight(false);});return;
    }
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
  }, [send, nearTarget, state?.mapId, checkingRandomZone, busy, pending, togglingWarehouseLight]);
  const checkRandomZone = useCallback(async (zoneId: string, layer?:string,position?:{x:number;y:number}) => {
    if (busy || pending || checkingRandomZone) return false;
    setCheckingRandomZone(true);
    try {return await send({type: 'CHECK_RANDOM_ZONE', zoneId, ...(layer?{layer}:{}), ...(position?{position}:{})});}
    finally {setCheckingRandomZone(false);}
  }, [busy, pending, checkingRandomZone, send]);
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
  // A zone check can return no encounter: keep exploration moving without a pause flash.
  // A real event, explicit pause, modal or failed request still uses the normal freeze.
  const backgroundZoneCheck = checkingRandomZone && state?.phase === 'explore' && !error;
  // Lamp toggles keep walking responsive while the server confirms the light
  // and any gate change. Commands remain serialized; other interactions pause.
  const backgroundWarehouseLight=togglingWarehouseLight&&state?.mapId==='warehouse'&&state.phase==='explore';
  const homeAdvisorActivity:HomeAdvisorActivity={entered,externalPaused:paused||portraitPhone,overlayOpen:!!overlay&&overlay!=='advisor',
    busy,pending,renovating:!homeScene||homeRepairActivity.renovating||!!homeScene.homeRenovating,
    repairCardOpen:homeRepairActivity.repairCardOpen,tutorialOpen:homeTutorialOpen,pageHidden:document.hidden};
  const homeAdvisorBlocked=state?homeAdvisorBlock(state,homeAdvisorActivity):'outside-home';
  const frozen = paused || portraitPhone || ((busy || pending) && !backgroundZoneCheck && !backgroundWarehouseLight) || !!overlay || !!inspection || !entered;
  const randomEligible = !!state && !!catalog?.events.some(event => event.triggers.includes('random') && event.maps?.includes('alley') && (event.requiresFlags ?? []).every(flag => state.flags.includes(flag)) && (event.repeatable || !state.drawnEvents?.includes(`alley:${event.id}`)));
  return <>
    {error && overlay !== 'shop' && overlay !== 'parcels' && overlay !== 'qa' && overlay !== 'decorate' && overlay !== 'home' && <div className="error-banner" role="alert">{error}<button disabled={busy} onClick={() => void retry()}>重试上次操作</button>{sessionUnavailable && state && <button disabled={busy} onClick={() => void startNewJourney()}>开始新旅程（保留旧会话记录）</button>}</div>}
    {!state || !catalog ? <main className="loading-card"><span className="brand-mark">ฅ</span><h1>{busy ? '正在寻找熟悉的气味……' : '旅程暂时停在这里'}</h1><p>{busy ? '正在打开小巷和你的旅程记录。' : '请确认本地服务已启动，然后重试。'}</p>{!busy && <><button onClick={() => void retry()}>重新连接</button>{sessionUnavailable && <button onClick={() => void startNewJourney()}>开始新旅程（保留旧会话记录）</button>}</>}</main>
      : <>
        {!entered && <StartScreen hasProgress={state.revision > 0} disabled={disabled} onStart={() => {trackContinueAdventure();setEntered(true);}} onShop={() => setOverlay('shop')} onReset={resetSession} onAuth={() => setOverlay('auth')}/>}
        {/* Keep an active battle mounted and paused behind the title, so returning does not restart its attempt. */}
        {(entered || state.phase === 'battle') && <div hidden={!entered}>
          <GameScreen onHomeAdvisor={()=>{if(!homeAdvisorBlocked&&!homeScene?.homeRenovating)setHomeAdvisorOpen(true);}} homeAdvisorDisabled={!!homeAdvisorBlocked} onHomeTutorialChange={setHomeTutorialOpen} onHomeManual={()=>openHome()} homeEditing={overlay==='decorate'} state={state} catalog={catalog} busy={busy} pending={pending} disabled={disabled || paused || !!overlay || !!inspection} paused={paused} near={near} nearTarget={nearTarget} inspectHint={inspectHint} journalOpen={overlay === 'journal'} topExpanded={topExpanded} onToggleTopbar={toggleTopbar} onJournal={() => setOverlay(overlay === 'journal' ? null : 'journal')} onSkip={skipDialogue} qaOpen={overlay === 'qa'} onQA={() => setOverlay('qa')} onCommand={command => void send(command.type === 'START_BATTLE' && command.stageId === 'alley_rescue' && rainyPosition.current ? {...command, returnPosition: rainyPosition.current} : command)} onInteract={interact} onPause={() => setPaused(!paused)} onMap={() => state.phase==='home'?openHome('depart'):setOverlay('map')} onShop={() => state.phase==='home'?openHome('shop'):setOverlay('shop')} onParcels={() => state.phase==='home'?openHome('parcels'):setOverlay('parcels')} onRecharge={() => openRecharge()} onSettings={() => setOverlay('settings')} onWarehouse={()=>openHome('warehouse')} onDecorate={()=>openDecorate()} onTitle={() => {setEntered(false);setPaused(false);}} speakerAnchor={getSpeakerAnchor}>
            {state.phase === 'battle'
              ? <BattleHost key={qaVisit} state={state} catalog={catalog} paused={frozen} onResult={result => send({type: 'COMPLETE_BATTLE', ...result})} settlement={{busy,pending,error,retry}}/>
              : <Viewport onHomeAdvisor={()=>{if(!homeAdvisorBlocked&&!homeScene?.homeRenovating)setHomeAdvisorOpen(true);}} key={`${state.qaCheckpointId ?? 'journey'}:${qaVisit}`} state={state} storyNode={currentStory(catalog, state)} paused={frozen} onSceneReady={scene => {sceneRef.current = scene;setHomeScene(scene);scene?.setTopbarExpanded(topExpandedRef.current);}} onNear={(isNear, id, label) => {setNear(isNear);setNearTarget(isNear && id ? {id, label: label ?? '交互 · E'} : null);}} onInteract={interact} onResult={result => void send({type: 'COMPLETE_BATTLE', ...result})} onInspectHint={setInspectHint} onMove={distance => void reportMove(distance)} onRandomZone={checkRandomZone} onMarketBattle={(floor,position)=>void send({type:'START_BATTLE',stageId:'market_boss',layer:floor,returnPosition:position})} onMarketExit={(floor,position)=>void send({type:'EXIT_MARKET',layer:floor,position})} onWorldPosition={point => {rainyPosition.current = point;if(state.mapId==='tunnel')tunnelPosition.current=point;}} onWarehousePosition={(floor,point)=>{warehousePosition.current={floor,point};}} onWarehouseClimbReady={fn=>{warehouseClimb.current=fn;}} randomEligible={randomEligible}/>}
          </GameScreen>
        </div>}
      </>}
    {/* 序章开场引导只在每个存档的第一次进入时播放,且仅对话相位挂载——教学战中刷新页面不能让动画盖住战斗 UI。 */}
    {entered && state?.chapterId === 'prologue' && state.phase === 'dialogue' && !introDone && <PrologueSequence onComplete={() => {setIntroDone(true);try {localStorage.setItem('stray-kitty.prologue.intro', 'done');} catch {/* 隐私模式下跳过记忆，不影响本次游玩 */}}}/>}
    {entered && state?.phase==='home' && state.chapterId!=='prologue' && catalog && homeScene && !overlay && !paused && <HomeRepairOverlay scene={homeScene} state={state} catalog={catalog} busy={busy} pending={pending} error={error} onRepair={send} onRetry={()=>void retry()} onActivityChange={setHomeRepairActivity}/>}
    {entered && state?.phase==='home' && catalog && <HomeAdvisor state={state} catalog={catalog} open={overlay==='advisor'} blocked={!!homeAdvisorBlocked} resetKey={qaVisit} onOpenChange={setHomeAdvisorOpen}/>}
    {inspection && state?.phase === 'explore' && state.mapId === 'alley' && <Modal title={inspection.label} className="inspection-dialog" onClose={() => setInspection(null)}>
      <header><span className="eyebrow">小巷见闻</span><h2>{inspection.label}</h2></header>
      <p>{inspection.text}</p>
      <button onClick={() => setInspection(null)}>继续探索 →</button>
    </Modal>}
    {state && catalog && overlay === 'qa' && <AcceptancePanel state={state} catalog={catalog} busy={busy} pending={pending} error={error} loadTools={loadQATools} onCommand={runQACommand} onSkip={async () => {const success = await skipDialogue();if(success){setOverlay(null);setPaused(false);}return success;}} onRetry={() => void retry()} onClose={() => setOverlay(null)}/>}
    {state && catalog && overlay==='home' && <HomeHub state={state} catalog={catalog} tab={homeTab} locked={busy||pending} busy={busy} error={error} onDecorate={()=>openDecorate()} onClose={()=>setOverlay(null)} onRetry={()=>void retry()} journal={<JourneyRecord state={state} busy={busy} pending={pending} disabled={disabled} onReplay={c=>void homeNavigate(c)}/> }>
      {homeTab==='parcels' && <ParcelDialog state={state} catalog={catalog} disabled={disabled} retryDisabled={busy} error={error} initialPool={parcelPool} onPool={setParcelPool} onCommand={send} onRetry={()=>void retry()} onClose={()=>setOverlay(null)} onRecharge={()=>setHomeTab('recharge')} onPlace={async(id)=>{openDecorate(id);return true;}}/>}
      {homeTab==='shop' && <ShopPanel state={state} catalog={catalog} disabled={disabled} error={error} onRetry={()=>void retry()} onClose={()=>setOverlay(null)} onCommand={send} onRefresh={refresh} onParcels={()=>setHomeTab('parcels')} onRecharge={()=>setHomeTab('recharge')}/>}
      {homeTab==='depart' && <><HomePanel state={state} disabled={disabled} onCommand={c=>void homeNavigate(c)}/><WorldMap state={state} catalog={catalog} disabled={disabled} onClose={()=>setOverlay(null)} onNavigate={c=>void homeNavigate(c)}/></>}
      {homeTab==='warehouse' && <WarehousePanel chapterId={state.chapterId} onClose={()=>setOverlay(null)} onConfirm={value=>{setLoadout(value);setOverlay(null);}}/>}
      {homeTab==='recharge' && (catalog.rechargePacks?.length??0)>0 && <RechargeDialog playerId={port.playerId()} packs={catalog.rechargePacks!} tuna={state.currencies.tuna??0} api={port} onCharged={refresh} onClose={()=>setHomeTab('parcels')}/>}
    </HomeHub>}
    {state && catalog && homeScene && overlay === 'decorate' && <FurnitureBackpack scene={homeScene} state={state} catalog={catalog} busy={busy} pending={pending} error={error} initialFurniture={decorateFurniture} onSave={send} onRetry={()=>void retry()} onClose={()=>setOverlay(null)}/>}
    {state && catalog && overlay === 'map' && <WorldMap state={state} catalog={catalog} disabled={disabled} onClose={() => setOverlay(null)} onNavigate={command => {setOverlay(null);void send(command);}}/>}
    {state && catalog && overlay === 'shop' && <ShopPanel state={state} catalog={catalog} disabled={disabled} error={error} onRetry={() => void retry()} onClose={() => setOverlay(null)} onCommand={send} onRefresh={refresh} onParcels={() => setOverlay('parcels')} onRecharge={() => openRecharge()}/>}
    {state && catalog && overlay === 'parcels' && <ParcelDialog state={state} catalog={catalog} disabled={disabled} retryDisabled={busy} error={error} initialPool={parcelPool} onPool={setParcelPool} onCommand={send} onRetry={() => void retry()} onClose={() => setOverlay(null)} onRecharge={() => openRecharge(true)} onPlace={async(furnitureId)=>{openDecorate(furnitureId);return true;}}/>}
    {state && catalog && overlay === 'recharge' && (catalog.rechargePacks?.length ?? 0) > 0 && <RechargeDialog playerId={port.playerId()} packs={catalog.rechargePacks!} tuna={state.currencies.tuna ?? 0} api={port} onCharged={refresh} onClose={() => {setOverlay(rechargeReturn.current);rechargeReturn.current=null;}}/>}
    {state && overlay === 'warehouse' && <WarehousePanel chapterId={state.chapterId} onClose={() => setOverlay(null)} onConfirm={value => {console.log('[家园仓库] 确认携带清单', value);setLoadout(value);setOverlay(null);}}/>}
    {overlay === 'settings' && <SettingsPanel musicVolume={musicVolume} sfxVolume={sfxVolume} onMusicVolume={value => {setMusicVolume(value);localStorage.setItem('stray-kitty.audio.music', String(value));}} onSfxVolume={value => {setSfxVolume(value);localStorage.setItem('stray-kitty.audio.sfx', String(value));}} onClose={() => setOverlay(null)} onPause={entered&&state?.phase==='home'?()=>{setOverlay(null);setPaused(true);}:undefined}/>}
    {loadout && <div className="visually-hidden" aria-live="polite">已确认暖心罐罐 {loadout.inventoryItems.warmCan} 份，蹦蹦冻干 {loadout.inventoryItems.freezeDry} 份；尚未锁定或扣除库存。</div>}
    {state && overlay === 'auth' && <AuthDialog mode={state.revision > 0 ? 'register' : 'login'} hasProgress={state.revision > 0} api={port} onLoggedIn={async () => {await refresh();setEntered(false);}} onClose={() => setOverlay(null)}/>}
    <MobileViewport portrait={portraitPhone}/>
  </>;
}
