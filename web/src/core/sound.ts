import {computeEffectiveVolume, readAudioPrefs} from './audio';

// Global SFX player. OGG sources live in public/assets/sfx (Kenney CC0 packs;
// see docs/AUDIO-CREDITS.md). One cached Audio element per URL: repeated triggers
// restart it from zero — overwrite semantics, matching the skill banner.
const cache = new Map<string, HTMLAudioElement>();
// Exclusive voice groups: a new cue in a group pauses the group's previous
// audio first, so e.g. petting sounds never overlap each other.
const groupOwners = new Map<string, HTMLAudioElement>();
const baseVolumes = new WeakMap<HTMLAudioElement, number>();

const initialPrefs = readAudioPrefs();
let sfxVolumePercent = initialPrefs.sfxVolume;
let sfxMuted = initialPrefs.muted;

/** Sync file-based SFX output with Settings sliders and global mute state. */
export function setSfxOutput(volumePercent: number, muted: boolean): void {
  sfxVolumePercent = volumePercent;
  sfxMuted = muted;
  for (const audio of cache.values()) {
    const base = baseVolumes.get(audio) ?? 0.6;
    audio.volume = computeEffectiveVolume(sfxVolumePercent, sfxMuted, base);
    if (sfxMuted && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
  }
}

export function playSfx(url: string, volume = 0.6, rate = 1, group?: string): void {
  // Node test runners have no Audio; stay silent there instead of crashing.
  if (typeof Audio === 'undefined') return;
  if (group) groupOwners.get(group)?.pause();
  const scaledVolume = computeEffectiveVolume(sfxVolumePercent, sfxMuted, volume);
  if (scaledVolume <= 0) return;
  let audio = cache.get(url);
  if (!audio) {
    audio = new Audio(url);
    audio.preload = 'auto';
    cache.set(url, audio);
  }
  baseVolumes.set(audio, volume);
  audio.currentTime = 0;
  audio.playbackRate = rate;
  // Rate is a pitch shift by contract (升降调); browsers default to preserving
  // pitch when slowing down, which flattens every shifted cue to original pitch.
  audio.preservesPitch = false;
  audio.volume = scaledVolume;
  if (group) groupOwners.set(group, audio);
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
    const button = target instanceof Element ? target.closest('button') : null;
    if (button && !button.disabled && !button.closest('[data-mute-control]')) {
      playSfx('/assets/sfx/ui-click.ogg', 0.3);
    }
  };
  document.addEventListener('pointerdown', handler, true);
  return () => document.removeEventListener('pointerdown', handler, true);
}
