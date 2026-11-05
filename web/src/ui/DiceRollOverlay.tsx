import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import type {EventResolution} from '../contracts';
import {Dice} from './DiceEvent';
import {eventTiers} from '../modules/events/presentation';
import {playSound} from './soundEffects';
import {trackDiceRollDuration} from '../observability/actions';
import './dice-overlay.css';

// 仪式节奏：亮相(.36s) + 起手(.52s) + 至少完整翻滚一轮(1.6s)后才揭晓。
// 服务端更快返回也按这个下限走，保住“翻滚 1.5–2 秒”的手感；更慢则翻滚续命等待。
const MIN_TOSS_MS = 2300;
const REVEAL_HOLD_MS = 1900;

// 星露谷式调色盘：好结果用暖纸底上的红/金/青，坏结果用灰蓝雨 + 暗紫阴影。
const CONFETTI_COLORS = ['#e4573d', '#f2c14e', '#62d6c8', '#fff3d6'];
const RAIN_COLORS = ['#7f96b8', '#5e7396', '#93aac9'];
const rnd = (min: number, max: number) => min + Math.random() * (max - min);
type Particle = {className?: string} & CSSProperties & Record<`--${string}`, string>;

/**
 * 全屏掷骰判定仪式。开启后接管画面：遮罩模糊 → 双骰亮相 → 翻滚等待服务端结算 →
 * 按四档（大成功/成功=好，有代价/失败=坏）揭晓骰点并撒专属像素特效。
 * 结算（或被上层中止）由 GameScreen 控制：resolution 未到=继续翻滚，onClose=收起。
 */
export default function DiceRollOverlay({resolution, startedAt, onClose}: {resolution?: EventResolution; startedAt: number; onClose: () => void}) {
  const [phase, setPhase] = useState<'toss' | 'reveal'>('toss');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const tier = resolution?.tier;
  const good = tier === 'crit' || tier === 'success';

  // 结算到达后也不立刻揭晓：补满最低翻滚时长再翻面。
  useEffect(() => {
    if (!resolution) return;
    const wait = Math.max(0, MIN_TOSS_MS - (performance.now() - startedAt));
    const timer = setTimeout(() => setPhase('reveal'), wait);
    return () => clearTimeout(timer);
  }, [resolution, startedAt]);

  // 揭晓只响一声：好结果叮咚、坏结果委屈的喵。模块二埋点:揭晓即记录掷骰动画时长
  // (开始→揭晓,含等结算的翻滚续命时间),复用响声的一次性守卫,每次掷骰只记一次。
  const soundedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'reveal' || soundedRef.current) return;
    soundedRef.current = true;
    trackDiceRollDuration(performance.now() - startedAt);
    playSound(good ? 'chime' : 'meow');
  }, [phase, good]);

  // 揭晓特效播完自动收场；期间点击/按键可立即跳过。
  useEffect(() => {
    if (phase !== 'reveal') return;
    const timer = setTimeout(() => onCloseRef.current(), REVEAL_HOLD_MS);
    const skip = (event: globalThis.KeyboardEvent) => {
      if (['Escape', 'Enter', ' '].includes(event.key)) onCloseRef.current();
    };
    window.addEventListener('keydown', skip);
    return () => {clearTimeout(timer);window.removeEventListener('keydown', skip);};
  }, [phase]);

  // —— 好结果粒子：三波彩纸烟花（炸开→受重力下坠）+ 骰周一圈金色亮晶。 ——
  const confetti = useMemo<Particle[]>(() => phase !== 'reveal' || !good ? [] : Array.from({length: 42}, (_, i) => {
    const angle = rnd(0, Math.PI * 2), dist = rnd(13, 30);
    return {
      left: '50%', top: '50%', className: 'fx-confetti',
      '--tx': `${(Math.cos(angle) * dist).toFixed(1)}vmin`, '--ty': `${(Math.sin(angle) * dist * 0.8).toFixed(1)}vmin`,
      '--fall': `${rnd(22, 46).toFixed(1)}vmin`, '--rot': `${Math.round(rnd(-540, 540))}deg`,
      '--s': `${Math.round(rnd(8, 16))}px`, '--c': CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      '--d': `${rnd(1.3, 1.9).toFixed(2)}s`, '--w': `${(i % 3) * 0.15}s`,
    };
  }), [phase, good]);
  const glints = useMemo<Particle[]>(() => phase !== 'reveal' || !good ? [] : Array.from({length: 8}, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + rnd(-0.2, 0.2), radius = rnd(15, 20);
    return {
      left: `calc(50% + ${(Math.cos(angle) * radius).toFixed(1)}vmin)`, top: `calc(50% + ${(Math.sin(angle) * radius * 0.8).toFixed(1)}vmin)`,
      className: 'fx-glint', '--s': `${Math.round(rnd(6, 10))}px`, '--w': `${rnd(0, 0.5).toFixed(2)}s`,
    };
  }), [phase, good]);

  // —— 坏结果粒子：贴脸像素雨 + 大颗眼泪 + 坠落中裂开的灰暗像素心（带碎屑）。 ——
  const rain = useMemo<Particle[]>(() => phase !== 'reveal' || good ? [] : Array.from({length: 22}, (_, i) => ({
    left: `${rnd(6, 94).toFixed(1)}%`, top: `${rnd(0, 12).toFixed(1)}%`, className: 'fx-rain',
    '--s': `${Math.round(rnd(5, 7))}px`, '--h': `${Math.round(rnd(14, 24))}px`, '--c': RAIN_COLORS[i % RAIN_COLORS.length],
    '--d': `${rnd(0.9, 1.5).toFixed(2)}s`, '--w': `${rnd(0, 0.9).toFixed(2)}s`,
  })), [phase, good]);
  const tears = useMemo<Particle[]>(() => phase !== 'reveal' || good ? [] : Array.from({length: 7}, () => ({
    left: `${rnd(32, 68).toFixed(1)}%`, top: `${rnd(18, 34).toFixed(1)}%`, className: 'fx-tear',
    '--s': `${Math.round(rnd(8, 12))}px`, '--d': `${rnd(1.4, 2).toFixed(2)}s`, '--w': `${rnd(0.1, 0.6).toFixed(2)}s`,
  })), [phase, good]);
  const hearts = useMemo<Particle[]>(() => phase !== 'reveal' || good ? [] : Array.from({length: 5}, () => {
    const d = rnd(1.6, 2.3);
    return {left: `${rnd(15, 80).toFixed(1)}%`, top: '0%', className: 'fx-heart',
      '--d': `${d.toFixed(2)}s`, '--w': `${rnd(0, 0.5).toFixed(2)}s`, '--tilt': `${Math.round(rnd(-25, 25))}`,
      '--split': `${(d * 0.55).toFixed(2)}s`};
  }), [phase, good]);
  const shards = useMemo<Particle[]>(() => phase !== 'reveal' || good ? [] : Array.from({length: 12}, () => ({
    left: `${rnd(20, 80).toFixed(1)}%`, top: `${rnd(28, 48).toFixed(1)}%`, className: 'fx-shard',
    '--s': `${Math.round(rnd(5, 9))}px`, '--tx': `${rnd(-6, 6).toFixed(1)}vmin`,
    '--d': `${rnd(1.2, 1.8).toFixed(2)}s`, '--w': `${rnd(0.3, 0.9).toFixed(2)}s`,
  })), [phase, good]);

  const dice = resolution?.dice;
  const tierLabel = eventTiers.find(t => t.id === tier)?.label ?? '';
  const auraAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const reveal = phase === 'reveal';
  return <div className={`dice-ceremony ${reveal ? `reveal ${good ? 'good' : 'bad'}` : 'toss'}`} role="alertdialog" aria-label={reveal ? `判定结果 ${tierLabel}` : '骰子判定进行中'} onClick={() => {if (reveal) onCloseRef.current();}}>
    <div className="ceremony-stage">
      {reveal && !good && <div className="ceremony-aura" aria-hidden="true">{auraAngles.map(a => <span key={a} style={{'--a': `${a}deg`, '--r': `${rnd(24, 30).toFixed(1)}vmin`} as Particle}/>)}</div>}
      <div className="ceremony-pair">
        {reveal && dice && <div className={`ceremony-banner tier-${tier}`} role="status"><b>{dice[0] + dice[1]}</b><span>{tierLabel}</span></div>}
        <div className="ceremony-die"><Dice value={dice?.[0]} rolling={!reveal}/></div>
        <div className="ceremony-die"><Dice value={dice?.[1]} rolling={!reveal}/></div>
      </div>
      {reveal && <div className="ceremony-fx" aria-hidden="true">
        {good
          ? [...confetti, ...glints].map((p, i) => <span key={i} className={p.className as string} style={p}/>)
          : [...rain, ...tears, ...hearts, ...shards].map((p, i) => p.className === 'fx-heart'
            ? <span key={i} className={p.className as string} style={p}><i className="l"/><i className="r"/></span>
            : <span key={i} className={p.className as string} style={p}/>)}
      </div>}
    </div>
    <p className="ceremony-hint">{reveal ? '点击任意处继续' : '命运滚动中…'}</p>
  </div>;
}
