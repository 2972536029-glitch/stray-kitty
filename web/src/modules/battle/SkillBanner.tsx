import {useCallback, useEffect, useRef, useState} from 'react';
import type {CSSProperties} from 'react';
import './skill-banner.css';

// Skill name → banner artwork. Each per-skill art piece carries the cat's name,
// skill name and tagline baked into the image, so a matched banner renders the
// artwork alone; an unmatched skill name keeps the CSS placeholder with live text.
const BANNER_ART: Readonly<Record<string, {webp: string; png: string}>> = {
  '星绒绽放': {webp: new URL('./assets/banner-caster-star.lossless.webp', import.meta.url).href, png: new URL('./assets/banner-caster-star.png', import.meta.url).href},
  '罐盖护盾': {webp: new URL('./assets/banner-guard-shield.lossless.webp', import.meta.url).href, png: new URL('./assets/banner-guard-shield.png', import.meta.url).href},
  '橘影连爪': {webp: new URL('./assets/banner-tuanzi-claw.lossless.webp', import.meta.url).href, png: new URL('./assets/banner-tuanzi-claw.png', import.meta.url).href},
  '安心呼噜': {webp: new URL('./assets/banner-diandian-heal.lossless.webp', import.meta.url).href, png: new URL('./assets/banner-diandian-heal.png', import.meta.url).href},
  '栗盾奋击': {webp: new URL('./assets/banner-bruiser-fury.lossless.webp', import.meta.url).href, png: new URL('./assets/banner-bruiser-fury.png', import.meta.url).href},
  '银铃缓行': {webp: new URL('./assets/banner-controller-slow.lossless.webp', import.meta.url).href, png: new URL('./assets/banner-controller-slow.png', import.meta.url).href},
  '夜视护行': {webp: new URL('./assets/banner-momo-night.lossless.webp', import.meta.url).href, png: new URL('./assets/banner-momo-night.png', import.meta.url).href},
  '巡光护行': {webp: new URL('./assets/banner-momo-cleanse.lossless.webp', import.meta.url).href, png: new URL('./assets/banner-momo-cleanse.png', import.meta.url).href},
};

const DURATION = 2200;

export interface SkillCastBanner {
  catId: string;
  name: string;
  id: number;
}

const CAT_LABELS: Readonly<Record<string, string>> = {
  miaomiao: '喵喵',
  caster: '绒绒',
  guard: '斑斑',
  tuanzi: '团子',
  diandian: '点点',
  bruiser: '栗栗',
  controller: '铃铃',
  momo: '墨墨',
};

// Accent colors mirror SkillFeedback's per-cat variant palettes so a cast reads
// as one coherent presentation moment: banner and board fx share the tone.
const CAT_ACCENTS: Readonly<Record<string, {color: string; accent: string}>> = {
  miaomiao: {color: '#e394ff', accent: '#fff4ad'},
  caster: {color: '#e394ff', accent: '#fff4ad'},
  guard: {color: '#5bf7ff', accent: '#d7ffff'},
  tuanzi: {color: '#ffae50', accent: '#fff5a1'},
  diandian: {color: '#7dffc7', accent: '#ffd5ed'},
  bruiser: {color: '#ffce59', accent: '#fff6b5'},
  controller: {color: '#85c5ff', accent: '#e4edff'},
  momo: {color: '#6effdf', accent: '#ddd0ff'},
};

/** Receipts are emitted only after the engine confirms a cast; the 800ms here is
 * presentation time and runs on real time, not battle-clock time. A new emit
 * replaces the current banner and restarts its slide via the id key. */
export function useSkillBanner() {
  const [banner, setBanner] = useState<SkillCastBanner | null>(null);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopTimer = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);
  const clear = useCallback(() => {stopTimer(); setBanner(null);}, [stopTimer]);
  const emit = useCallback((catId: string, name: string) => {
    const id = ++sequence.current;
    setBanner({catId, name, id});
    stopTimer();
    timer.current = setTimeout(() => {
      timer.current = undefined;
      // Guard by id so a re-emit during teardown races cannot clear a newer banner.
      setBanner(previous => previous && previous.id === id ? null : previous);
    }, DURATION);
  }, [stopTimer]);
  useEffect(() => stopTimer, [stopTimer]);
  return {banner, emit, clear};
}

/** Purely visual overlay. It neither receives input nor reveals enemy positions. */
export function SkillBanner({banner}: {banner: SkillCastBanner | null}) {
  if (!banner) return null;
  const art = BANNER_ART[banner.name];
  if (art) {
    // The artwork already contains the cat name and skill name, so the image is
    // the whole banner; no live text is layered on top of it.
    return <div className="battle-skill-banner is-art" key={banner.id} data-testid="battle-skill-banner" aria-hidden="true">
      <img className="skill-banner-art" src={art.webp} alt=""
        onError={event => {
          const img = event.currentTarget;
          if (img.getAttribute('src') !== art.png) img.src = art.png;
        }}/>
    </div>;
  }
  const accent = CAT_ACCENTS[banner.catId] ?? {color: '#c8cbd8', accent: '#eef0f6'};
  const label = CAT_LABELS[banner.catId] ?? banner.catId;
  return <div className="battle-skill-banner" key={banner.id} data-testid="battle-skill-banner" aria-hidden="true"
    style={{'--banner-color': accent.color, '--banner-accent': accent.accent} as CSSProperties}>
    <div className="skill-banner-text">
      <strong>{label}</strong>
      <span>「{banner.name}」</span>
    </div>
  </div>;
}
