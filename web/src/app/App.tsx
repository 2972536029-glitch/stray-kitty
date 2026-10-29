import {useCallback, useEffect, useRef, useState} from 'react';
import {useGame} from './useGame';
import {Viewport} from '../examples/demo/Viewport';
import type {DemoScene} from '../examples/demo/scene';
import type {CatBreed} from '../adapters/canvas/pixelCat';
import {BattleHost} from '../modules/battle/BattleHost';
import type {Direction} from '../adapters/platform/input';
import {currentStory} from '../core/story';
import StartScreen from '../ui/StartScreen';
import GameScreen from '../ui/GameScreen';
import WorldMap from '../ui/WorldMap';
import ShopPanel from '../ui/ShopPanel';
import RechargeDialog from '../ui/RechargeDialog';
import WarehousePanel, {type ConfirmedLoadout} from '../ui/WarehousePanel';
import SettingsPanel from '../ui/SettingsPanel';
import PrologueSequence from '../ui/PrologueSequence';
import {useAudioManager, type BgmMode} from '../ui/useAudioManager';
import {playSound} from '../ui/soundEffects';
import {rainyAlleyObject} from '../modules/rainyAlley/assets';

export default function App() {
  const game = useGame();
  const {state, catalog, send, reportMove, busy, pending, error, disabled, retry, skipDialogue, resetSession, refresh, port} = game;
  const [entered, setEntered] = useState(false), [paused, setPaused] = useState(false), [near, setNear] = useState(false);
  const [nearTarget, setNearTarget] = useState<{id: string; label: string} | null>(null);
  const [inspectHint, setInspectHint] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<'map' | 'shop' | 'journal' | 'recharge' | 'warehouse' | 'settings' | null>(null);
  const [musicVolume, setMusicVolume] = useState(() => Number(localStorage.getItem('stray-kitty.audio.music') ?? 40));
  const [sfxVolume, setSfxVolume] = useState(() => Number(localStorage.getItem('stray-kitty.audio.sfx') ?? 65));
  const [loadout, setLoadout] = useState<ConfirmedLoadout | null>(null);
  // 序章开场引导只在每个存档的第一次进入时播放。
  const [introDone, setIntroDone] = useState(() => {try {return localStorage.getItem('stray-kitty.prologue.intro') === 'done';} catch {return true;}});
  // 画布场景实例：对话气泡向它查询说话者头顶的位置。
  const sceneRef = useRef<DemoScene | null>(null);
  const getSpeakerAnchor = useCallback((breed: CatBreed) => sceneRef.current?.speakerAnchor(breed) ?? null, []);
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
  const direction = useRef<(direction: Direction, held: boolean) => void>(() => {});
  const rainyPosition = useRef<{x: number; y: number} | undefined>(undefined);
  const interact = useCallback((targetId?: string) => {
    const id = targetId || nearTarget?.id;
    if (!id) return;
    const object = rainyAlleyObject(id);
    if (object?.kind === 'inspection') {
      setInspectHint(object.text ?? null);
      return;
    }
    void send({type: 'INTERACT', interactionId: id});
  }, [send, nearTarget]);
  const checkRandomZone = useCallback((zoneId: string) => busy || pending
    ? Promise.resolve(false)
    : send({type: 'CHECK_RANDOM_ZONE', zoneId}), [busy, pending, send]);
  const frozen = paused || busy || pending || !!overlay || !entered;
  const randomEligible = !!state && !!catalog?.events.some(event => event.triggers.includes('random') && event.maps?.includes('alley') && (event.requiresFlags ?? []).every(flag => state.flags.includes(flag)) && (event.repeatable || !state.drawnEvents?.includes(`alley:${event.id}`)));
  return <>
    {error && overlay !== 'shop' && <div className="error-banner" role="alert">{error}<button disabled={busy} onClick={() => void retry()}>重试上次操作</button></div>}
    {!state || !catalog ? <main className="loading-card"><span className="brand-mark">ฅ</span><h1>{busy ? '正在寻找熟悉的气味……' : '旅程暂时停在这里'}</h1><p>{busy ? '正在打开小巷和你的旅程记录。' : '请确认本地服务已启动，然后重试。'}</p>{!busy && <button onClick={() => void retry()}>重新连接</button>}</main>
      : <>
        {!entered && <StartScreen hasProgress={state.revision > 0} disabled={disabled} onStart={() => setEntered(true)} onShop={() => setOverlay('shop')} onReset={resetSession}/>}
        {/* Keep an active battle mounted and paused behind the title, so returning does not restart its attempt. */}
        {(entered || state.phase === 'battle') && <div hidden={!entered}>
          <GameScreen state={state} catalog={catalog} busy={busy} pending={pending} disabled={disabled || paused || !!overlay} paused={paused} near={near} nearTarget={nearTarget} inspectHint={inspectHint} journalOpen={overlay === 'journal'} onJournal={() => setOverlay(overlay === 'journal' ? null : 'journal')} onSkip={skipDialogue} onReset={resetSession} onCommand={command => void send(command.type === 'START_BATTLE' && command.stageId === 'alley_rescue' && rainyPosition.current ? {...command, returnPosition: rainyPosition.current} : command)} onInteract={interact} onDirection={(d, held) => direction.current(d, held)} onPause={() => setPaused(!paused)} onMap={() => setOverlay('map')} onShop={() => setOverlay('shop')} onRecharge={() => setOverlay('recharge')} onSettings={() => setOverlay('settings')} onWarehouse={() => setOverlay('warehouse')} onTitle={() => {setEntered(false);setPaused(false);}} speakerAnchor={getSpeakerAnchor}>
            {state.phase === 'battle'
              ? <BattleHost state={state} catalog={catalog} paused={frozen} onResult={result => void send({type: 'COMPLETE_BATTLE', ...result})}/>
              : <Viewport state={state} storyScene={currentStory(catalog, state)?.scene} paused={frozen} onSceneReady={scene => {sceneRef.current = scene;}} onNear={(isNear, id, label) => {setNear(isNear);setNearTarget(isNear && id ? {id, label: label ?? '交互 · E'} : null);}} onInteract={interact} onResult={result => void send({type: 'COMPLETE_BATTLE', ...result})} onDirectionReady={fn => {direction.current = fn;}} onInspectHint={setInspectHint} onMove={distance => void reportMove(distance)} onRandomZone={checkRandomZone} onWorldPosition={point => {rainyPosition.current = point;}} randomEligible={randomEligible}/>}
          </GameScreen>
        </div>}
      </>}
    {entered && state?.chapterId === 'prologue' && !introDone && <PrologueSequence onComplete={() => {setIntroDone(true);try {localStorage.setItem('stray-kitty.prologue.intro', 'done');} catch {/* 隐私模式下跳过记忆，不影响本次游玩 */}}}/>}
    {state && catalog && overlay === 'map' && <WorldMap state={state} catalog={catalog} disabled={disabled} onClose={() => setOverlay(null)} onNavigate={command => {setOverlay(null);void send(command);}}/>}
    {state && catalog && overlay === 'shop' && <ShopPanel state={state} catalog={catalog} disabled={disabled} error={error} onRetry={() => void retry()} onClose={() => setOverlay(null)} onBuy={productId => void send({type: 'BUY_FURNITURE', productId})} onRecharge={() => setOverlay('recharge')}/>}
    {state && catalog && overlay === 'recharge' && (catalog.rechargePacks?.length ?? 0) > 0 && <RechargeDialog playerId={port.playerId()} packs={catalog.rechargePacks!} tuna={state.currencies.tuna ?? 0} api={port} onCharged={refresh} onClose={() => setOverlay(null)}/>}
    {state && overlay === 'warehouse' && <WarehousePanel chapterId={state.chapterId} onClose={() => setOverlay(null)} onConfirm={value => {console.log('[家园仓库] 确认携带清单', value);setLoadout(value);setOverlay(null);}}/>}
    {overlay === 'settings' && <SettingsPanel musicVolume={musicVolume} sfxVolume={sfxVolume} onMusicVolume={value => {setMusicVolume(value);localStorage.setItem('stray-kitty.audio.music', String(value));}} onSfxVolume={value => {setSfxVolume(value);localStorage.setItem('stray-kitty.audio.sfx', String(value));}} onClose={() => setOverlay(null)}/>}
    {loadout && <div className="visually-hidden" aria-live="polite">已确认暖心罐罐 {loadout.inventoryItems.warmCan} 份，蹦蹦冻干 {loadout.inventoryItems.freezeDry} 份；尚未锁定或扣除库存。</div>}
  </>;
}
