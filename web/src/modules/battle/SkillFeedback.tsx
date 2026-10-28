import {useCallback, useEffect, useRef, useState} from 'react';
import type {CSSProperties} from 'react';
import './skill-feedback.css';

type Point = {x: number; y: number};
export type SkillVariant = 'star' | 'shield' | 'claw' | 'heal' | 'fury' | 'slow' | 'cleanse' | 'night';
export interface SkillCastFeedback {
  catId: string;
  name: string;
  origin: Point;
  /** Actual affected cells from the successful cast, never an invented larger range. */
  cells?: readonly Point[];
  recipients?: readonly Point[];
  variant?: SkillVariant;
}
export interface SkillBurst extends SkillCastFeedback {id: number}
interface ShieldedCat extends Point {id: string; shield: number}
const DURATION = 1800;
const VARIANTS: Readonly<Record<string, SkillVariant>> = {
  caster: 'star', guard: 'shield', tuanzi: 'claw', diandian: 'heal',
  bruiser: 'fury', controller: 'slow', momo: 'night',
};
const THEMES: Record<SkillVariant, {color: string; accent: string; confirmation: string}> = {
  star: {color: '#e394ff', accent: '#fff4ad', confirmation: '星绒绽放'},
  shield: {color: '#5bf7ff', accent: '#d7ffff', confirmation: '护盾生效'},
  claw: {color: '#ffae50', accent: '#fff5a1', confirmation: '连爪出击'},
  heal: {color: '#7dffc7', accent: '#ffd5ed', confirmation: '治疗生效'},
  fury: {color: '#ffce59', accent: '#fff6b5', confirmation: '护盾 · 强化'},
  slow: {color: '#85c5ff', accent: '#e4edff', confirmation: '缓行领域'},
  cleanse: {color: '#beabff', accent: '#a4ffe5', confirmation: '清棘 · 护盾'},
  night: {color: '#6effdf', accent: '#ddd0ff', confirmation: '夜视 · 护盾'},
};

/** Receipts are emitted only after the engine confirms a cast. The clock here is
 * presentation time: double-speed combat cannot turn feedback into a missed flash. */
export function useSkillFeedback() {
  const [bursts, setBursts] = useState<SkillBurst[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const stopTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current.clear();
  }, []);
  const clear = useCallback(() => {stopTimers(); setBursts([]);}, [stopTimers]);
  const emit = useCallback((cast: SkillCastFeedback) => {
    const id = ++sequence.current;
    // Copy positions so moving a cat cannot drag an already released strike.
    const burst = {...cast, id, origin: {...cast.origin}, cells: cast.cells?.map(p => ({...p})), recipients: cast.recipients?.map(p => ({...p}))};
    setBursts(previous => [...previous.slice(-11), burst]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setBursts(previous => previous.filter(effect => effect.id !== id));
    }, DURATION);
    timers.current.add(timer);
  }, []);
  useEffect(() => stopTimers, [stopTimers]);
  return {bursts, emit, clear};
}

function ShieldGlyph({className = ''}: {className?: string}) {
  return <path className={className} d="M0 -20 L17 -13 L15 7 Q11 18 0 23 Q-11 18 -15 7 L-17 -13 Z M-8 0 L-1 7 L10 -7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>;
}
function Spark({size = 15}: {size?: number}) {
  return <path d={`M0 ${-size} L4 -4 L${size} 0 L4 4 L0 ${size} L-4 4 L${-size} 0 L-4 -4 Z`} fill="var(--skill-accent)"/>;
}
function Release({variant}: {variant: SkillVariant}) {
  return <>
    <g className="skill-fx-release">
      <circle r="33" fill="none" stroke="currentColor" strokeWidth="5"/>
      <circle r="24" fill="currentColor" fillOpacity=".12" stroke="var(--skill-accent)" strokeWidth="2" strokeDasharray="8 6"/>
      {[0, 60, 120, 180, 240, 300].map(angle => <path key={angle} transform={`rotate(${angle})`} d="M0 -43 L0 -53 M-4 -47 L0 -53 L4 -47" fill="none" stroke="var(--skill-accent)" strokeWidth="3" strokeLinecap="round"/>)}
    </g>
    <g className="skill-fx-emblem">
      {variant === 'shield' || variant === 'fury' || variant === 'cleanse' ? <ShieldGlyph/> : variant === 'night' ? <>
        <path d="M-29 0 Q0 -29 29 0 Q0 29 -29 0Z" fill="#0d2948aa" stroke="currentColor" strokeWidth="3"/>
        <path d="M0 -12 Q8 0 0 12 Q-8 0 0 -12" fill="var(--skill-accent)"/>
      </> : variant === 'heal' ? <path d="M-6 -21 H6 V-6 H21 V6 H6 V21 H-6 V6 H-21 V-6 H-6Z" fill="var(--skill-accent)"/> : variant === 'slow' ? <>
        <path d="M-16 10 Q-9 0 -11 -9 Q-11 -22 0 -22 Q11 -22 11 -9 Q9 0 16 10Z M-6 17 Q0 24 6 17" fill="none" stroke="var(--skill-accent)" strokeWidth="3"/>
      </> : variant === 'claw' ? <path d="M-17 17 L-4 -20 M-3 22 L10 -15 M11 21 L24 -9" stroke="var(--skill-accent)" strokeWidth="5" strokeLinecap="round"/> : <Spark size={27}/>}
    </g>
  </>;
}

function CellStrike({variant, index}: {variant: SkillVariant; index: number}) {
  const delay = `${Math.min(index, 5) * 35}ms`;
  return <g className={`skill-fx-hit is-${variant}`} style={{animationDelay: delay}}>
    <rect className="skill-fx-impact-tile" x="-43" y="-43" width="86" height="86" rx="8" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2"/>
    {variant === 'claw' ? <g className="skill-fx-claws" fill="var(--skill-accent)">
      <path d="M-39 31 Q-20 -12 12 -33 Q-12 3 -25 38Z"/>
      <path d="M-13 35 Q4 -10 37 -36 Q14 5 2 41Z"/>
      <path d="M15 33 Q29 7 43 -11 Q35 20 28 40Z"/>
    </g> : variant === 'slow' ? <>
      <circle r="31" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="10 5"/>
      <path d="M-12 -16 L0 -4 L12 -16 M-12 3 L0 15 L12 3" fill="none" stroke="var(--skill-accent)" strokeWidth="5" strokeLinejoin="round"/>
    </> : <>
      <path d="M-25 -30 L-7 -9 M25 -30 L7 -9 M-29 21 L-11 7 M29 21 L11 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
      <Spark size={29}/>
      <g transform="translate(27 -28)"><Spark size={8}/></g>
      <g transform="translate(-30 24)"><Spark size={7}/></g>
    </>}
  </g>;
}

function RecipientGlow({variant}: {variant: SkillVariant}) {
  return <g className="skill-fx-recipient">
    <ellipse cy="15" rx="41" ry="22" fill="currentColor" fillOpacity=".09" stroke="currentColor" strokeWidth="4"/>
    <path className="skill-fx-rising" d="M-29 17 V-12 M29 17 V-12 M-22 -4 V-24 M22 -4 V-24" stroke="var(--skill-accent)" strokeWidth="3" strokeLinecap="round"/>
    {variant === 'heal' ? <g className="skill-fx-rising" fill="var(--skill-accent)">
      <path d="M-6 -33 H6 V-23 H16 V-11 H6 V-1 H-6 V-11 H-16 V-23 H-6Z"/>
      <path d="M-33 7 H-27 V13 H-21 V19 H-27 V25 H-33 V19 H-39 V13 H-33Z"/>
    </g> : <path d="M0 -40 L31 -27 L29 11 Q22 32 0 42 Q-22 32 -29 11 L-31 -27 Z" fill="currentColor" fillOpacity=".08" stroke="var(--skill-accent)" strokeWidth="3"/>}
  </g>;
}

/** Purely visual overlay. It neither receives input nor reveals enemy positions. */
export function SkillFeedback({columns, rows, bursts, shields}: {
  columns: number; rows: number; bursts: readonly SkillBurst[]; shields: readonly ShieldedCat[];
}) {
  return <div className="battle-skill-feedback" data-testid="battle-skill-feedback" aria-hidden="true">
    <svg className="skill-fx-canvas" viewBox={`0 0 ${columns * 100} ${rows * 100}`} preserveAspectRatio="none">
      {shields.filter(cat => cat.shield > 0).map(cat => <g className="skill-fx-shield" key={cat.id} data-testid={`skill-shield-${cat.id}`} transform={`translate(${(cat.x + .5) * 100} ${(cat.y + .5) * 100})`}>
        <ellipse className="skill-fx-shield-floor" cy="25" rx="35" ry="13"/>
        <path className="skill-fx-shield-shell" d="M-33 17 Q-43 -12 -22 -31 Q0 -44 22 -31 Q43 -12 33 17 M-28 25 Q0 43 28 25"/>
        <path className="skill-fx-shield-glint" d="M-28 -6 Q-28 -21 -16 -25 M27 3 L27 13"/>
        <g transform="translate(30 -14) scale(.45)"><ShieldGlyph/></g>
      </g>)}
      {bursts.map(burst => {
        const variant = burst.variant ?? VARIANTS[burst.catId] ?? 'star';
        const theme = THEMES[variant];
        const origin = {x: (burst.origin.x + .5) * 100, y: (burst.origin.y + .5) * 100};
        return <g className={`skill-fx-burst is-${variant}`} data-testid={`skill-release-${burst.catId}`} data-skill-variant={variant} key={burst.id} style={{color: theme.color, '--skill-accent': theme.accent} as CSSProperties}>
          {burst.recipients?.map((point, i) => <g key={`recipient-${i}`} transform={`translate(${(point.x + .5) * 100} ${(point.y + .5) * 100})`}><RecipientGlow variant={variant}/></g>)}
          {['star', 'claw', 'slow'].includes(variant) && burst.cells?.map((point, i) => <g key={`cell-${i}`} data-skill-cell={`${point.x},${point.y}`} transform={`translate(${(point.x + .5) * 100} ${(point.y + .5) * 100})`}><CellStrike variant={variant} index={i}/></g>)}
          <g transform={`translate(${origin.x} ${origin.y})`}>
            {(variant === 'night' || variant === 'cleanse' || variant === 'heal') && <g className="skill-fx-wave"><circle r="63" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={variant === 'night' ? '26 9' : undefined}/></g>}
            <Release variant={variant}/>
          </g>
        </g>;
      })}
    </svg>
    {bursts.map(burst => {
      const variant = burst.variant ?? VARIANTS[burst.catId] ?? 'star';
      const theme = THEMES[variant];
      return <div key={burst.id} className={`skill-fx-label${burst.origin.y < .5 ? ' is-below' : ''}`} data-testid={`skill-label-${burst.catId}`} style={{left: `clamp(var(--skill-label-margin), ${(burst.origin.x + .5) / columns * 100}%, calc(100% - var(--skill-label-margin)))`, top: `${(burst.origin.y + (burst.origin.y < .5 ? .78 : .08)) / rows * 100}%`, '--skill-color': theme.color} as CSSProperties}>
        <strong>{burst.name}</strong>{theme.confirmation !== burst.name && <span>{theme.confirmation}</span>}
      </div>;
    })}
  </div>;
}
