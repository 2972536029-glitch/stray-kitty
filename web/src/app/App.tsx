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

export default function App() {
  const game = useGame();
  const {state, catalog, send, reportMove, busy, pending, error, disabled, retry, skipDialogue, resetSession} = game;
  const [entered, setEntered] = useState(false), [paused, setPaused] = useState(false), [near, setNear] = useState(false);
  const [nearTarget, setNearTarget] = useState<{id: string; label: string} | null>(null);
  const [inspectHint, setInspectHint] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<'map' | 'shop' | 'journal' | null>(null);
  const direction = useRef<(direction: Direction, held: boolean) => void>(() => {});
  const interact = useCallback((targetId?: string) => {
    const id = targetId || nearTarget?.id || 'alley_crate';
    void send({type: 'INTERACT', interactionId: id});
  }, [send, nearTarget]);
  const frozen = paused || busy || pending || !!overlay || !entered;
  return <>
    {error && overlay !== 'shop' && <div className="error-banner" role="alert">{error}<button disabled={busy} onClick={() => void retry()}>重试上次操作</button></div>}
    {!state || !catalog ? <main className="loading-card"><span className="brand-mark">ฅ</span><h1>{busy ? '正在寻找熟悉的气味……' : '旅程暂时停在这里'}</h1><p>{busy ? '正在打开小巷和你的旅程记录。' : '请确认本地服务已启动，然后重试。'}</p>{!busy && <button onClick={() => void retry()}>重新连接</button>}</main>
      : <>
        {!entered && <StartScreen hasProgress={state.revision > 0} disabled={disabled} onStart={() => setEntered(true)} onShop={() => setOverlay('shop')} onReset={resetSession}/>}
        {/* Keep an active battle mounted and paused behind the title, so returning does not restart its attempt. */}
        {(entered || state.phase === 'battle') && <div hidden={!entered}>
          <GameScreen state={state} catalog={catalog} busy={busy} pending={pending} disabled={disabled || paused || !!overlay} paused={paused} near={near} nearTarget={nearTarget} inspectHint={inspectHint} journalOpen={overlay === 'journal'} onJournal={() => setOverlay(overlay === 'journal' ? null : 'journal')} onSkip={skipDialogue} onReset={resetSession} onCommand={command => void send(command)} onDirection={(d, held) => direction.current(d, held)} onPause={() => setPaused(!paused)} onMap={() => setOverlay('map')} onShop={() => setOverlay('shop')} onTitle={() => {setEntered(false);setPaused(false);}}>
            {state.phase === 'battle'
              ? <BattleHost state={state} catalog={catalog} paused={frozen} onResult={result => void send({type: 'COMPLETE_BATTLE', ...result})}/>
              : <Viewport state={state} storyScene={currentStory(catalog, state)?.scene} paused={frozen} onNear={(isNear, id, label) => {setNear(isNear);setNearTarget(isNear && id ? {id, label: label ?? '交互 · E'} : null);}} onInteract={interact} onResult={result => void send({type: 'COMPLETE_BATTLE', ...result})} onDirectionReady={fn => {direction.current = fn;}} onInspectHint={setInspectHint} onMove={distance => void reportMove(distance)}/>}
          </GameScreen>
        </div>}
      </>}
    {state && catalog && overlay === 'map' && <WorldMap state={state} catalog={catalog} disabled={disabled} onClose={() => setOverlay(null)} onNavigate={command => {setOverlay(null);void send(command);}}/>}
    {state && catalog && overlay === 'shop' && <ShopPanel state={state} catalog={catalog} disabled={disabled} error={error} onRetry={() => void retry()} onClose={() => setOverlay(null)} onBuy={productId => void send({type: 'BUY_FURNITURE', productId})}/>}
  </>;
}
