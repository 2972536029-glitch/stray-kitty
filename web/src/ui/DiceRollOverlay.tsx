import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import type {EventResolution, EventTier} from '../contracts';
import {eventTiers} from '../modules/events/presentation';
import {playSound} from './soundEffects';
import {trackDiceRollDuration} from '../observability/actions';
import './dice-overlay.css';

// 仪式节奏：亮相(.36s) + 起手(.52s) + 至少完整翻滚一轮(1.6s)后才揭晓；
// 落定与四档天气特效约需 1.9s 演完。服务端更快返回也按这个下限走，保住
// “翻滚 1.5–2 秒”的手感；更慢则翻滚续命等待。
const MIN_TOSS_MS = 2300;
const REVEAL_HOLD_MS = 1900;

// 星露谷式调色盘：大成功用彩虹六色，失败用灰蓝雨。
const RAINBOW = ['#e4573d', '#f2a03d', '#f2d84e', '#7bc86c', '#5aa9e6', '#9d6bd1'];
const RAIN_COLORS = ['#7f96b8', '#5e7396', '#93aac9'];
// 四档天气各自的 Emoji 粒子表（crit 满屏爆炸 / success 顶飘 / partial 骑云 / fail 砸落）。
const EMOJI_TIERS: Record<EventTier, string[]> = {
  crit: ['🌈', '⭐', '🎉', '💖', '💰'],
  success: ['☀️', '✨', '🌸', '🌤️'],
  partial: ['🍂', '🍁', '🍃', '💨', '☁️', '🌫️'],
  fail: ['😭', '⛈️', '💧', '⚡', '💥'],
};
const rnd = (min: number, max: number) => min + Math.random() * (max - min);
type Particle = {className?: string} & CSSProperties & Record<`--${string}`, string>;

// —— 仪式专用 3D 骰（纯视觉，本地实现；事件卡内的小骰继续用共享的 Dice.tsx）：
//    preserve-3d 立方体，六个面各自雕点数。 ——
const DOTS: Record<number, number[]> = {1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]};
// 落定时把目标面转到正对镜头的附加转角（720/1080 整周翻滚之外再补的角度）。
const FACE_TURNS: Record<number, {fx: string; fy: string}> = {
  1: {fx: '0deg', fy: '0deg'},
  2: {fx: '-90deg', fy: '0deg'},
  3: {fx: '0deg', fy: '-90deg'},
  4: {fx: '0deg', fy: '90deg'},
  5: {fx: '90deg', fy: '0deg'},
  6: {fx: '0deg', fy: '180deg'},
};
// 翻滚姿态交给 CSS（.toss/.reveal 作用于祖先类），这里只负责把结算点数写成朝向变量。
function Dice3D({value = 1}: {value?: number}) {
  const turn = FACE_TURNS[value] ?? FACE_TURNS[1];
  return <div className="die3d" role="img" aria-label={`骰子 ${value} 点`}>
    <span className="die3d-shadow" aria-hidden="true"/>
    <div className="die3d-squash">
      <div className="die3d-cube" style={{'--fx': turn.fx, '--fy': turn.fy} as CSSProperties}>
        {[1, 2, 3, 4, 5, 6].map(v => <div key={v} className={`die3d-face f${v}`} aria-hidden="true">
          {Array.from({length: 9}, (_, i) => <i key={i} className={(DOTS[v] ?? DOTS[1]).includes(i) ? 'on' : ''}/>)}
        </div>)}
      </div>
    </div>
  </div>;
}

// 阴云（partial）围绕骰子的像素云锚点：风大云疾，六朵错落漂移（深秋萧瑟）。
const CLOUD_SPOTS = [
  {left: '9%', top: '16%', '--cd': '6.5s', '--cw': '1'},
  {left: '84%', top: '24%', '--cd': '5.2s', '--cw': '.8'},
  {left: '12%', top: '52%', '--cd': '7.4s', '--cw': '.9'},
  {left: '80%', top: '60%', '--cd': '6s', '--cw': '.7'},
  {left: '30%', top: '80%', '--cd': '8.2s', '--cw': '.85'},
  {left: '62%', top: '10%', '--cd': '5.8s', '--cw': '.75'},
];

/**
 * 透明掷骰层。开启后接管焦点：双骰 3D 翻滚等待服务端结算 →
 * 按四档（大成功金辉爆彩/成功阳光明媚/有代价阴云密布/失败狂风暴雨）揭晓骰点并撒专属特效。
 * 结算（或被上层中止）由 GameScreen 控制：resolution 未到=继续翻滚，onClose=收起。
 */
export default function DiceRollOverlay({resolution, startedAt, title, onClose}: {resolution?: EventResolution; startedAt: number; title: string; onClose: () => void}) {
  const [phase, setPhase] = useState<'toss' | 'reveal'>('toss');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const root = useRef<HTMLDivElement>(null);
  const tier = resolution?.tier;
  const good = tier === 'crit' || tier === 'success';

  // 接管焦点：入场聚焦仪式容器，退场还原给之前的元素。
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    root.current?.focus({preventScroll: true});
    return () => {if (prior?.isConnected) prior.focus({preventScroll: true});};
  }, []);

  // 结算到达后也不立刻揭晓：补满最低翻滚时长再翻面。
  useEffect(() => {
    if (!resolution) return;
    const wait = Math.max(0, MIN_TOSS_MS - (performance.now() - startedAt));
    const timer = window.setTimeout(() => setPhase('reveal'), wait);
    return () => window.clearTimeout(timer);
  }, [resolution, startedAt]);

  // 揭晓只打点+响一声（好结果叮咚、坏结果委屈的喵）；特效播完自动收场。
  const soundedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'reveal') return;
    if (!soundedRef.current) {
      soundedRef.current = true;
      trackDiceRollDuration(performance.now() - startedAt);
      playSound(good ? 'chime' : 'meow');
    }
    const timer = window.setTimeout(() => onCloseRef.current(), REVEAL_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [phase, good, startedAt]);

  // —— 大成功：彩虹色硬边彩带从骰心喷射（炸开→受重力下坠），六色轮换。 ——
  const ribbons = useMemo<Particle[]>(() => phase === 'reveal' && tier === 'crit' ? Array.from({length: 26}, (_, i) => {
    const angle = rnd(0, Math.PI * 2), dist = rnd(14, 32);
    return {
      left: '50%', top: '50%', className: 'fx-ribbon',
      '--tx': `${(Math.cos(angle) * dist).toFixed(1)}vmin`, '--ty': `${(Math.sin(angle) * dist * 0.8).toFixed(1)}vmin`,
      '--fall': `${rnd(22, 46).toFixed(1)}vmin`, '--rot': `${Math.round(rnd(-540, 540))}deg`,
      '--s': `${Math.round(rnd(10, 18))}px`, '--c': RAINBOW[i % RAINBOW.length],
      '--d': `${rnd(1.3, 1.9).toFixed(2)}s`, '--w': `${(i % 3) * 0.15}s`,
    };
  }) : [], [phase, tier]);

  // —— 好结果共用：骰周一圈金色亮晶错拍闪烁（大成功 8 颗、成功 6 颗）。 ——
  const glints = useMemo<Particle[]>(() => phase === 'reveal' && (tier === 'crit' || tier === 'success') ? Array.from({length: tier === 'crit' ? 8 : 6}, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + rnd(-0.2, 0.2), radius = rnd(15, 20);
    return {
      left: `calc(50% + ${(Math.cos(angle) * radius).toFixed(1)}vmin)`, top: `calc(50% + ${(Math.sin(angle) * radius * 0.8).toFixed(1)}vmin)`,
      className: 'fx-glint', '--s': `${Math.round(rnd(6, 10))}px`, '--w': `${rnd(0, 0.5).toFixed(2)}s`,
    };
  }) : [], [phase, tier]);

  // —— 失败：密集像素雨丝贴脸纵落。 ——
  const rain = useMemo<Particle[]>(() => phase === 'reveal' && tier === 'fail' ? Array.from({length: 34}, (_, i) => ({
    left: `${rnd(4, 96).toFixed(1)}%`, top: `${rnd(0, 10).toFixed(1)}%`, className: 'fx-rain',
    '--s': `${Math.round(rnd(5, 7))}px`, '--h': `${Math.round(rnd(14, 26))}px`, '--c': RAIN_COLORS[i % RAIN_COLORS.length],
    '--d': `${rnd(0.8, 1.4).toFixed(2)}s`, '--w': `${rnd(0, 0.9).toFixed(2)}s`,
  })) : [], [phase, tier]);

  // —— 四档 Emoji 粒子：crit 满屏大爆炸 / success 顶飘 / fail 砸地（partial 骑云另算）。 ——
  const emojis = useMemo<Particle[]>(() => {
    if (phase !== 'reveal' || !tier) return [];
    const set = EMOJI_TIERS[tier];
    if (tier === 'crit') {
      const parts: Particle[] = [];
      // 双圆环冲击波（先发）：两圈各 12 枚等分角度成环，外圈错开半格、反向自转。
      for (let i = 0; i < 24; i++) {
        const ring = i < 12 ? 0 : 1;
        const angle = ((i % 12) / 12) * Math.PI * 2 + (ring ? Math.PI / 12 : 0) + rnd(-0.1, 0.1);
        const radius = ring === 0 ? rnd(17.5, 19.5) : rnd(26, 29);
        parts.push({
          left: '50%', top: '50%', className: 'fx-emoji fx-emoji-ring', '--e': set[i % set.length],
          '--tx': `${(Math.cos(angle) * radius).toFixed(1)}vmin`, '--ty': `${(Math.sin(angle) * radius * 0.82).toFixed(1)}vmin`,
          '--r': `${Math.round(rnd(20, 60)) * (ring ? -1 : 1)}deg`,
          '--d': `${rnd(1.7, 2).toFixed(2)}s`, '--w': `${(ring ? rnd(0.25, 0.4) : rnd(0, 0.15)).toFixed(2)}s`,
          '--s': `${Math.round(rnd(20, 32))}px`,
        });
      }
      // 满屏大爆炸（后续波）：36 枚大号 Emoji 自骰心炸到屏幕四角，铺满整屏。
      for (let i = 0; i < 36; i++) {
        const angle = rnd(0, Math.PI * 2), dist = rnd(24, 56);
        parts.push({
          left: '50%', top: '50%', className: 'fx-emoji fx-emoji-boom', '--e': set[i % set.length],
          '--tx': `${(Math.cos(angle) * dist).toFixed(1)}vmin`, '--ty': `${(Math.sin(angle) * dist * 0.9).toFixed(1)}vmin`,
          '--r': `${Math.round(rnd(-70, 70))}deg`,
          '--d': `${rnd(1.2, 1.7).toFixed(2)}s`, '--w': `${rnd(0.08, 0.5).toFixed(2)}s`,
          '--s': `${Math.round(rnd(26, 46))}px`,
        });
      }
      return parts;
    }
    if (tier === 'partial') return []; // 有代价的 Emoji 全部由 cloudEmojis 骑云渲染
    const count = tier === 'fail' ? 15 : 14;
    return Array.from({length: count}, (_, i) => {
      const p: Particle = {
        className: `fx-emoji ${tier === 'fail' ? 'fx-emoji-slam' : 'fx-emoji-fall'}`,
        '--e': set[i % set.length], '--d': `${rnd(1.5, 2.6).toFixed(2)}s`, '--w': `${rnd(0, 0.7).toFixed(2)}s`,
        '--s': `${Math.round(rnd(16, 30))}px`,
      };
      if (tier === 'fail') {
        p.left = `${rnd(8, 92).toFixed(1)}%`; p.top = '-6%';
      } else {
        p.left = `${rnd(6, 94).toFixed(1)}%`; p.top = '-4%';
        p['--sw'] = `${rnd(-6, 6).toFixed(1)}vmin`; p['--r'] = `${Math.round(rnd(-30, 30))}deg`;
      }
      return p;
    });
  }, [phase, tier]);

  // —— 有代价：Emoji 骑在云上随风同行——渲染成云朵的子元素，坐标相对云身，
  //    云漂它也漂（零割裂），再各自打着旋从云里洒落。每朵云 3 枚，共 18 枚。 ——
  const cloudEmojis = useMemo<Particle[][]>(() => {
    if (phase !== 'reveal' || tier !== 'partial') return [];
    const set = EMOJI_TIERS.partial;
    return CLOUD_SPOTS.map((_, ci) => Array.from({length: 3}, (_, i) => ({
      left: `${rnd(-5, 4).toFixed(1)}vmin`, top: `${rnd(-5, 2).toFixed(1)}vmin`,
      className: 'fx-emoji fx-emoji-shed', '--e': set[(ci * 3 + i) % set.length],
      '--dx': `${rnd(4, 10).toFixed(1)}vmin`, '--r': `${Math.round(rnd(180, 420)) * (Math.random() < 0.5 ? -1 : 1)}deg`,
      '--d': `${rnd(2.2, 3).toFixed(2)}s`, '--w': `${rnd(0, 0.9).toFixed(2)}s`,
      '--s': `${Math.round(rnd(16, 30))}px`,
    })));
  }, [phase, tier]);

  // —— 有代价：几道灰白像素风痕贴着屏幕横掠，托住秋风的空气感。 ——
  const streaks = useMemo<Particle[]>(() => phase === 'reveal' && tier === 'partial' ? Array.from({length: 5}, () => ({
    left: '-14vw', top: `${rnd(12, 84).toFixed(1)}%`, className: 'fx-streak',
    '--s': `${Math.round(rnd(14, 30))}px`, '--dy': `${rnd(-4, 4).toFixed(1)}vmin`,
    '--d': `${rnd(0.8, 1.4).toFixed(2)}s`, '--w': `${rnd(0.1, 1.1).toFixed(2)}s`,
  })) : [], [phase, tier]);

  const dice = resolution?.dice;
  const tierLabel = eventTiers.find(t => t.id === tier)?.label ?? '';
  const auraAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const reveal = phase === 'reveal';
  return <div ref={root} tabIndex={-1} className={`dice-ceremony ${reveal ? `reveal tier-${tier ?? ''}` : 'toss'}`} role="alertdialog" aria-modal="true" aria-label={reveal ? `${title}，判定结果 ${tierLabel}` : `${title}，骰子判定进行中`} onClick={() => {if (reveal) onCloseRef.current();}} onKeyDown={e => {
    if (e.key === 'Tab') {e.preventDefault(); return;}
    if (['Escape', 'Enter', ' '].includes(e.key)) {e.preventDefault(); e.stopPropagation(); if (reveal && !e.repeat) onCloseRef.current();}
  }}>
    <div className="ceremony-stage">
      {reveal && <div className="ceremony-weather" aria-hidden="true">
        {tier === 'success' && <div className="weather-sun"><span className="sun-halo"/><span className="sun-core"/><span className="sun-rays"/></div>}
        {tier === 'partial' && <div className="weather-clouds">{CLOUD_SPOTS.map((c, i) => <span key={i} className="cloud-pixel" style={c as Particle}>
          {(cloudEmojis[i] ?? []).map((p, j) => <span key={j} className={p.className as string} style={p}/>)}
        </span>)}</div>}
        {tier === 'fail' && <div className="weather-storm"><span className="storm-cloud"/><span className="storm-bolt"/></div>}
      </div>}
      {reveal && tier === 'fail' && <div className="ceremony-aura">{auraAngles.map(a => <span key={a} style={{'--a': `${a}deg`, '--r': `${rnd(24, 30).toFixed(1)}vmin`} as Particle}/>)}</div>}
      <div className="ceremony-pair">
        <div className="ceremony-die"><Dice3D value={dice?.[0]}/></div>
        <div className="ceremony-die"><Dice3D value={dice?.[1]}/></div>
      </div>
      {reveal && <div className="ceremony-fx" aria-hidden="true">
        {[...ribbons, ...glints, ...rain, ...streaks, ...emojis].map((p, i) => <span key={i} className={p.className as string} style={p}/>)}
      </div>}
    </div>
  </div>;
}
