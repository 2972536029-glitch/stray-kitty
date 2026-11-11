// Global SFX player. OGG sources live in public/assets/sfx (Kenney CC0 packs;
// see docs/AUDIO-CREDITS.md). One cached Audio element per URL: repeated triggers
// restart it from zero — overwrite semantics, matching the skill banner.
const cache = new Map<string, HTMLAudioElement>();

export function playSfx(url: string, volume = 0.6, rate = 1): void {
  // Node test runners have no Audio; stay silent there instead of crashing.
  if (typeof Audio === 'undefined') return;
  let audio = cache.get(url);
  if (!audio) {
    audio = new Audio(url);
    audio.preload = 'auto';
    cache.set(url, audio);
  }
  audio.currentTime = 0;
  audio.playbackRate = rate;
  audio.volume = volume;
  void audio.play().catch(() => {/* autoplay guard: triggers are user gestures */});
}

export interface SfxCue {
  url: string;
  /** Playback speed: >1 raises pitch, <1 lowers it. */
  rate?: number;
}

/** Play cues one after another (e.g. the triple-claw skill). Overlapping casts
 * keep their own timers; short cues make the overlap a feature, not a bug. */
export function playSfxSequence(cues: readonly SfxCue[], gapMs = 110, volume = 0.6): void {
  cues.forEach((cue, index) => {
    if (index === 0) playSfx(cue.url, volume, cue.rate);
    else setTimeout(() => playSfx(cue.url, volume, cue.rate), index * gapMs);
  });
}

/** One delegated listener covers every button in the app. Install once at app
 * mount; pointerdown keeps the click cue immediate. Volume stays low so the
 * cue supports rather than fights the interaction sounds above it. */
export function installClickSfx(): () => void {
  const handler = (event: PointerEvent) => {
    const target = event.target;
    if (target instanceof Element && target.closest('button') && !target.closest('button')!.disabled) {
      playSfx('/assets/sfx/ui-click.ogg', 0.3);
    }
  };
  document.addEventListener('pointerdown', handler, true);
  return () => document.removeEventListener('pointerdown', handler, true);
}
