import {useCallback, useRef, useState} from 'react';
import {useGame} from './useGame';
import {Viewport} from '../examples/demo/Viewport';
import {BattleHost} from '../modules/battle/BattleHost';
import type {Direction} from '../adapters/platform/input';
import {currentStory} from '../core/story';
import StartScreen from '../ui/StartScreen';
import GameScreen from '../ui/GameScreen';
import WorldMap from '../ui/WorldMap';
import ShopPanel from '../ui/ShopPanel';
import RechargeDialog from '../ui/RechargeDialog';
import AuthDialog from '../ui/AuthDialog';
import {rainyAlleyObject} from '../modules/rainyAlley/assets';

export default function App() {
  const game = useGame();
  const {state, catalog, send, reportMove, busy, pending, error, disabled, retry, skipDialogue, resetSession, sessionUnavailable, startNewJourney, refresh, port} = game;
  const [entered, setEntered] = useState(false), [paused, setPaused] = useState(false), [near, setNear] = useState(false);
  const [nearTarget, setNearTarget] = useState<{id: string; label: string} | null>(null);
  const [inspectHint, setInspectHint] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<'map' | 'shop' | 'journal' | 'recharge' | 'auth' | null>(null);
  const direction = useRef<(direction: Direction, held: boolean) => void>(() => {});
  const rainyPosition = useRef<{x: number; y: number} | undefined>(undefined);
  const tunnelPosition = useRef<{x: number; y: number} | undefined>(undefined);
  const interact = useCallback((targetId?: string) => {
    const id = targetId || nearTarget?.id;
    if (!id) return;
    if (id === 'tunnel_exit_boss') {
      void send({type: 'START_BATTLE', stageId: 'tunnel_boss', ...(tunnelPosition.current ? {returnPosition:tunnelPosition.current} : {})});
      return;
    }
    const object = rainyAlleyObject(id);
    if (object?.kind === 'inspection') {
      setInspectHint(object.text ?? null);
      return;
    }
    void send({type: 'INTERACT', interactionId: id, ...(id==='market_crow_stall'||id==='market_momo_trace'?{layer:'L0',position:rainyPosition.current}:id==='market_pigeon_perch'?{layer:'L1',position:rainyPosition.current}:{})});
  }, [send, nearTarget]);
  const checkRandomZone = useCallback((zoneId: string, layer?:string,position?:{x:number;y:number}) => busy || pending
    ? Promise.resolve(false)
    : send({type: 'CHECK_RANDOM_ZONE', zoneId, ...(layer?{layer}:{}), ...(position?{position}:{})}), [busy, pending, send]);
  const frozen = paused || busy || pending || !!overlay || !entered;
  const randomEligible = !!state && !!catalog?.events.some(event => event.triggers.includes('random') && event.maps?.includes('alley') && (event.requiresFlags ?? []).every(flag => state.flags.includes(flag)) && (event.repeatable || !state.drawnEvents?.includes(`alley:${event.id}`)));
  return <>
    {error && overlay !== 'shop' && <div className="error-banner" role="alert">{error}<button disabled={busy} onClick={() => void retry()}>重试上次操作</button>{sessionUnavailable && state && <button disabled={busy} onClick={() => void startNewJourney()}>开始新旅程（保留旧会话记录）</button>}</div>}
    {!state || !catalog ? <main className="loading-card"><span className="brand-mark">ฅ</span><h1>{busy ? '正在寻找熟悉的气味……' : '旅程暂时停在这里'}</h1><p>{busy ? '正在打开小巷和你的旅程记录。' : '请确认本地服务已启动，然后重试。'}</p>{!busy && <><button onClick={() => void retry()}>重新连接</button>{sessionUnavailable && <button onClick={() => void startNewJourney()}>开始新旅程（保留旧会话记录）</button>}</>}</main>
      : <>
        {!entered && <StartScreen hasProgress={state.revision > 0} disabled={disabled} onStart={() => setEntered(true)} onShop={() => setOverlay('shop')} onReset={resetSession} onAuth={() => setOverlay('auth')}/>}
        {/* Keep an active battle mounted and paused behind the title, so returning does not restart its attempt. */}
        {(entered || state.phase === 'battle') && <div hidden={!entered}>
          <GameScreen state={state} catalog={catalog} busy={busy} pending={pending} disabled={disabled || paused || !!overlay} paused={paused} near={near} nearTarget={nearTarget} inspectHint={inspectHint} journalOpen={overlay === 'journal'} onJournal={() => setOverlay(overlay === 'journal' ? null : 'journal')} onSkip={skipDialogue} onReset={resetSession} onCommand={command => void send(command.type === 'START_BATTLE' && command.stageId === 'alley_rescue' && rainyPosition.current ? {...command, returnPosition: rainyPosition.current} : command)} onInteract={interact} onDirection={(d, held) => direction.current(d, held)} onPause={() => setPaused(!paused)} onMap={() => setOverlay('map')} onShop={() => setOverlay('shop')} onRecharge={() => setOverlay('recharge')} onTitle={() => {setEntered(false);setPaused(false);}}>
            {state.phase === 'battle'
              ? <BattleHost state={state} catalog={catalog} paused={frozen} onResult={result => void send({type: 'COMPLETE_BATTLE', ...result})}/>
              : <Viewport state={state} storyScene={currentStory(catalog, state)?.scene} paused={frozen} onNear={(isNear, id, label) => {setNear(isNear);setNearTarget(isNear && id ? {id, label: label ?? '交互 · E'} : null);}} onInteract={interact} onResult={result => void send({type: 'COMPLETE_BATTLE', ...result})} onDirectionReady={fn => {direction.current = fn;}} onInspectHint={setInspectHint} onMove={distance => void reportMove(distance)} onRandomZone={checkRandomZone} onMarketBattle={(floor,position)=>void send({type:'START_BATTLE',stageId:'market_boss',layer:floor,returnPosition:position})} onMarketExit={(floor,position)=>void send({type:'EXIT_MARKET',layer:floor,position})} onWorldPosition={point => {rainyPosition.current = point;if(state.mapId==='tunnel')tunnelPosition.current=point;}} randomEligible={randomEligible}/>}
          </GameScreen>
        </div>}
      </>}
    {state && catalog && overlay === 'map' && <WorldMap state={state} catalog={catalog} disabled={disabled} onClose={() => setOverlay(null)} onNavigate={command => {setOverlay(null);void send(command);}}/>}
    {state && catalog && overlay === 'shop' && <ShopPanel state={state} catalog={catalog} disabled={disabled} error={error} onRetry={() => void retry()} onClose={() => setOverlay(null)} onBuy={productId => void send({type: 'BUY_FURNITURE', productId})} onRecharge={() => setOverlay('recharge')}/>}
    {state && catalog && overlay === 'recharge' && (catalog.rechargePacks?.length ?? 0) > 0 && <RechargeDialog playerId={port.playerId()} packs={catalog.rechargePacks!} tuna={state.currencies.tuna ?? 0} api={port} onCharged={refresh} onClose={() => setOverlay(null)}/>}
    {state && overlay === 'auth' && <AuthDialog mode={state.revision > 0 ? 'register' : 'login'} hasProgress={state.revision > 0} api={port} onLoggedIn={async () => {await refresh();setEntered(false);}} onClose={() => setOverlay(null)}/>}
  </>;
}
