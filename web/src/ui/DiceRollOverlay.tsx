import {useEffect, useRef, useState} from 'react';
import type {EventResolution} from '../contracts';
import Dice from './Dice';
import {eventTiers} from '../modules/events/presentation';
import {playSound} from './soundEffects';
import {trackDiceRollDuration} from '../observability/actions';

const MIN_TOSS_MS = 1500;
const REVEAL_HOLD_MS = 1500;

export default function DiceRollOverlay({resolution, startedAt, title, onClose}: {resolution?:EventResolution;startedAt:number;title:string;onClose:() => void}) {
  const [reveal,setReveal] = useState(false);
  const onCloseRef = useRef(onClose);onCloseRef.current = onClose;
  const root = useRef<HTMLDivElement>(null);
  const sounded = useRef(false);
  const tierLabel = eventTiers.find(t => t.id === resolution?.tier)?.label ?? '';
  const good = resolution?.tier === 'crit' || resolution?.tier === 'success';
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    root.current?.focus({preventScroll:true});
    return () => {if (prior?.isConnected) prior.focus({preventScroll:true});};
  }, []);
  useEffect(() => {
    if (!resolution) return;
    const timer = window.setTimeout(() => setReveal(true),Math.max(0,MIN_TOSS_MS-(performance.now()-startedAt)));
    return () => window.clearTimeout(timer);
  }, [resolution,startedAt]);
  useEffect(() => {
    if (!reveal) return;
    if (!sounded.current) {sounded.current = true;trackDiceRollDuration(performance.now()-startedAt);playSound(good ? 'chime' : 'meow');}
    const timer = window.setTimeout(() => onCloseRef.current(),REVEAL_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [reveal,good,startedAt]);
  return <div ref={root} tabIndex={-1} className={`dice-ceremony ${reveal ? `reveal ${good ? 'good' : 'subdued'}` : 'toss'}`} role="alertdialog" aria-modal="true" aria-label={reveal ? `判定结果 ${tierLabel}` : '骰子判定进行中'} onClick={() => {if (reveal) onCloseRef.current();}} onKeyDown={e => {
    if (e.key === 'Tab') {e.preventDefault();return;}
    if (['Escape','Enter',' '].includes(e.key)) {e.preventDefault();e.stopPropagation();if (reveal && !e.repeat) onCloseRef.current();}
  }}>
    <section className="event-card encounter-sheet ceremony-sheet">
      <header className="encounter-heading"><span>这一刻的运气</span><h2>{title}</h2></header>
      <div className="ceremony-tray">
        <div className="ceremony-pair"><div className="ceremony-die"><Dice value={resolution?.dice[0]} rolling={!reveal}/></div><div className="ceremony-die"><Dice value={resolution?.dice[1]} rolling={!reveal}/></div></div>
        <div className="ceremony-result" aria-live="polite">{reveal && resolution ? <><strong>{resolution.dice[0]+resolution.dice[1]}</strong><span>{tierLabel}</span></> : <span>骰子正落在小巷里…</span>}</div>
      </div>
      <span className="ceremony-hint">{reveal ? '点击继续' : ' '}</span>
    </section>
  </div>;
}
