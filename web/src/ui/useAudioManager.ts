import {useCallback, useEffect, useRef} from 'react';
import {
  BGM_SOURCES,
  computeEffectiveVolume,
  type AmbientMode,
  type BgmMode,
} from '../core/audio';
import {setSfxOutput} from '../core/sound';
import {registerUiSoundPlayer, type UiSoundId} from './soundEffects';

export type {BgmMode, AmbientMode};

const BGM_MAX_GAIN = 0.72;
const FADE_TICK_MS = 30;
const FADE_IN_MS = 650;
const FADE_FAST_MS = 260;
const FADE_OUT_MS = 550;

interface TrackFadeState {
  el: HTMLAudioElement;
  level: number;
  target: number;
  durationMs: number;
}

/**
 * 全局音频系统：分场景 MP3 循环 BGM（交叉淡入淡出）+ 低通环境音（雨声/集市）+ UI 音效。
 * 支持全局静音、独立音乐/音效滑条，以及切页后台自动暂停。
 */
export function useAudioManager({
  bgm,
  ambient,
  musicVolume,
  sfxVolume,
  muted,
}: {
  bgm: BgmMode;
  ambient: AmbientMode;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}) {
  const ctx = useRef<AudioContext | null>(null);
  const musicGain = useRef<GainNode | null>(null);
  const sfxGain = useRef<GainNode | null>(null);
  const ambientRef = useRef<{kind: Exclude<AmbientMode, null>; src: AudioBufferSourceNode; gain: GainNode} | null>(null);
  const elementsRef = useRef<Partial<Record<BgmMode, HTMLAudioElement>>>({});
  const trackStatesRef = useRef<Map<BgmMode, TrackFadeState>>(new Map());
  const activeModeRef = useRef<BgmMode | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const unlockedRef = useRef(false);

  const wanted = useRef({bgm, ambient, musicVolume, sfxVolume, muted});
  wanted.current = {bgm, ambient, musicVolume, sfxVolume, muted};

  const stopFadeTimer = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  const getBgmElement = useCallback((mode: BgmMode): HTMLAudioElement | null => {
    if (typeof Audio === 'undefined') return null;
    let el = elementsRef.current[mode];
    if (!el) {
      el = new Audio(BGM_SOURCES[mode]);
      el.loop = true;
      el.preload = 'auto';
      el.volume = 0;
      elementsRef.current[mode] = el;
    }
    return el;
  }, []);

  const effectiveMusicGain = useCallback((assumeUnmuted = false): number => {
    const {musicVolume: vol, muted: isMuted} = wanted.current;
    const pageHidden = typeof document !== 'undefined' && document.hidden;
    if ((!assumeUnmuted && isMuted) || pageHidden || vol <= 0) return 0;
    return computeEffectiveVolume(vol, false, BGM_MAX_GAIN);
  }, []);

  const applyBgmVolumes = useCallback((assumeUnmuted = false) => {
    const master = effectiveMusicGain(assumeUnmuted);
    for (const entry of trackStatesRef.current.values()) {
      entry.el.volume = Math.min(1, Math.max(0, master * entry.level));
      if (master <= 0 && !entry.el.paused) {
        entry.el.pause();
      }
    }
  }, [effectiveMusicGain]);

  const ensureFadeLoop = useCallback(() => {
    if (fadeTimerRef.current !== null) return;
    fadeTimerRef.current = window.setInterval(() => {
      const master = effectiveMusicGain();
      let stillAnimating = false;
      for (const [mode, entry] of trackStatesRef.current.entries()) {
        const step = FADE_TICK_MS / Math.max(80, entry.durationMs);
        if (entry.level < entry.target) {
          entry.level = Math.min(entry.target, entry.level + step);
        } else if (entry.level > entry.target) {
          entry.level = Math.max(entry.target, entry.level - step);
        }
        entry.el.volume = Math.min(1, Math.max(0, master * entry.level));
        if (entry.target === 0 && entry.level <= 0.001) {
          entry.el.volume = 0;
          entry.el.pause();
          trackStatesRef.current.delete(mode);
        } else if (Math.abs(entry.level - entry.target) > 0.001) {
          stillAnimating = true;
        }
      }
      if (!stillAnimating) stopFadeTimer();
    }, FADE_TICK_MS);
  }, [effectiveMusicGain, stopFadeTimer]);

  const syncBgmPlayback = useCallback((mode: BgmMode, {assumeUnmuted = false, fast = false} = {}) => {
    const master = effectiveMusicGain(assumeUnmuted);
    activeModeRef.current = mode;

    if (!unlockedRef.current || master <= 0) {
      for (const [existingMode, entry] of trackStatesRef.current.entries()) {
        entry.el.volume = 0;
        if (!entry.el.paused) entry.el.pause();
        if (existingMode !== mode) {
          trackStatesRef.current.delete(existingMode);
        } else {
          entry.level = 0;
          entry.target = 1;
          entry.durationMs = FADE_FAST_MS;
        }
      }
      stopFadeTimer();
      return;
    }

    const existing = trackStatesRef.current.get(mode);
    if (existing) {
      existing.target = 1;
      existing.durationMs = fast ? FADE_FAST_MS : FADE_IN_MS;
      existing.el.volume = Math.min(1, Math.max(0, master * existing.level));
      if (existing.el.paused) {
        void existing.el.play().catch(() => {/* autoplay blocked prior to gesture */});
      }
    } else {
      const el = getBgmElement(mode);
      if (!el) return;
      const startLevel = 0.05;
      el.volume = Math.min(1, Math.max(0, master * startLevel));
      trackStatesRef.current.set(mode, {
        el,
        level: startLevel,
        target: 1,
        durationMs: fast ? FADE_FAST_MS : FADE_IN_MS,
      });
      void el.play().catch(() => {/* autoplay blocked prior to gesture */});
    }

    for (const [otherMode, otherEntry] of trackStatesRef.current.entries()) {
      if (otherMode !== mode) {
        otherEntry.target = 0;
        otherEntry.durationMs = fast ? FADE_FAST_MS : FADE_OUT_MS;
      }
    }

    ensureFadeLoop();
  }, [effectiveMusicGain, ensureFadeLoop, getBgmElement, stopFadeTimer]);

  // ---- 环境音：低通白噪声循环（雨声/集市人声），换场景交叉淡出淡入。 ----
  const stopAmbient = useCallback(() => {
    const cur = ambientRef.current;
    const audio = ctx.current;
    if (!cur || !audio) return;
    ambientRef.current = null;
    const t = audio.currentTime;
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
    cur.gain.gain.linearRampToValueAtTime(0, t + 0.5);
    try {cur.src.stop(t + 0.55);} catch {/* already stopped */}
  }, []);

  const startAmbient = useCallback((kind: Exclude<AmbientMode, null>) => {
    const audio = ctx.current;
    const {muted: isMuted, musicVolume: vol} = wanted.current;
    const pageHidden = typeof document !== 'undefined' && document.hidden;
    if (!audio || !musicGain.current || audio.state !== 'running' || isMuted || vol <= 0 || pageHidden) return;
    if (ambientRef.current?.kind === kind) return;
    stopAmbient();
    const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    src.buffer = buffer;
    src.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = kind === 'market' ? 480 : 950;
    gain.gain.setValueAtTime(0, audio.currentTime);
    gain.gain.linearRampToValueAtTime(kind === 'market' ? 0.4 : 0.34, audio.currentTime + 1.1);
    src.connect(filter).connect(gain).connect(musicGain.current);
    src.start();
    ambientRef.current = {kind, src, gain};
  }, [stopAmbient]);

  const applyVolumes = useCallback((assumeUnmuted = false) => {
    const {musicVolume: mVol, sfxVolume: sVol, muted: isMuted} = wanted.current;
    const effectiveMuted = assumeUnmuted ? false : isMuted;
    const pageHidden = typeof document !== 'undefined' && document.hidden;
    setSfxOutput(sVol, effectiveMuted);
    applyBgmVolumes(assumeUnmuted);

    const audio = ctx.current;
    if (!audio || !musicGain.current || !sfxGain.current) return;
    const t = audio.currentTime;
    const nextMusicGain = effectiveMuted || pageHidden ? 0 : (mVol / 100) * 0.5;
    const nextSfxGain = effectiveMuted ? 0 : (sVol / 100) * 0.9;
    musicGain.current.gain.setTargetAtTime(nextMusicGain, t, 0.06);
    sfxGain.current.gain.setTargetAtTime(nextSfxGain, t, 0.06);
  }, [applyBgmVolumes]);

  const ensureAudioContext = useCallback(() => {
    if (typeof AudioContext === 'undefined') return null;
    if (!ctx.current) {
      const audio = new AudioContext();
      const music = audio.createGain();
      const sfx = audio.createGain();
      music.gain.value = 0;
      sfx.gain.value = 0;
      music.connect(audio.destination);
      sfx.connect(audio.destination);
      ctx.current = audio;
      musicGain.current = music;
      sfxGain.current = sfx;
    }
    return ctx.current;
  }, []);

  /** 用户交互时创建并解锁音频引擎；unmute 时传 assumeUnmuted=true 立即同步起播。 */
  const unlock = useCallback((assumeUnmuted = false) => {
    unlockedRef.current = true;
    const audio = ensureAudioContext();
    const startAmbientIfReady = () => {
      const {ambient: nextAmbient, muted: isMuted, musicVolume: mVol} = wanted.current;
      const canPlayAmbient = Boolean(nextAmbient && (assumeUnmuted || !isMuted) && mVol > 0 && !document.hidden);
      if (canPlayAmbient && ctx.current?.state === 'running' && nextAmbient) {
        startAmbient(nextAmbient);
      }
    };

    if (audio && audio.state === 'suspended') {
      void audio.resume().then(() => {
        applyVolumes(assumeUnmuted);
        startAmbientIfReady();
      }).catch(() => {/* ignore resume errors before gesture */});
    }

    applyVolumes(assumeUnmuted);
    syncBgmPlayback(wanted.current.bgm, {assumeUnmuted, fast: true});
    startAmbientIfReady();
  }, [applyVolumes, ensureAudioContext, startAmbient, syncBgmPlayback]);

  // ---- 短促 UI 合成音效：走 sfxGain 总线，受音效音量与全局静音控制。 ----
  const blip = useCallback((freq: number, duration: number, start = 0, type: OscillatorType = 'square', gainMul = 1) => {
    const audio = ctx.current;
    if (!audio || !sfxGain.current) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = audio.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.045 * gainMul, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);
    osc.connect(gain).connect(sfxGain.current);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }, []);

  const play = useCallback((id: UiSoundId) => {
    if (wanted.current.muted || wanted.current.sfxVolume <= 0) return;
    const audio = ctx.current;
    if (!audio || audio.state !== 'running' || !sfxGain.current) return;
    if (id === 'click') blip(620, 0.06);
    else if (id === 'send') {blip(760, 0.05);blip(1140, 0.07, 0.06);}
    else if (id === 'open') {blip(500, 0.06);blip(680, 0.08, 0.07);}
    else if (id === 'close') {blip(560, 0.05);blip(400, 0.07, 0.05);}
    else if (id === 'pickup') {blip(660, 0.09, 0, 'triangle');blip(880, 0.1, 0.07, 'triangle');blip(1320, 0.14, 0.13, 'triangle', 0.8);}
    else if (id === 'step') {blip(980, 0.045, 0, 'square', 0.75);blip(1480, 0.05, 0.04, 'square', 0.6);}
    else if (id === 'error') {blip(190, 0.22, 0, 'sawtooth', 0.85);blip(140, 0.28, 0.1, 'sawtooth', 0.65);}
    else if (id === 'chime') {blip(660, 0.1, 0, 'triangle');blip(880, 0.12, 0.09, 'triangle');blip(1108, 0.14, 0.18, 'triangle', 0.85);blip(1320, 0.2, 0.27, 'triangle', 0.7);}
    else if (id === 'meow') {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(720, audio.currentTime);
      osc.frequency.exponentialRampToValueAtTime(460, audio.currentTime + 0.18);
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(0.06, audio.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, audio.currentTime + 0.2);
      osc.connect(gain).connect(sfxGain.current);
      osc.start();
      osc.stop(audio.currentTime + 0.22);
    }
  }, [blip]);

  // 首次指针或键盘激活解锁；点按静音开关时由按钮自身的 onClick 负责切换状态，避免抢先起播一瞬间的声音。
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-mute-control]')) {
        const audio = ensureAudioContext();
        if (audio && audio.state === 'suspended') void audio.resume().catch(() => {});
        unlockedRef.current = true;
        return;
      }
      unlock(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-mute-control]') && (event.key === 'Enter' || event.key === ' ')) {
        const audio = ensureAudioContext();
        if (audio && audio.state === 'suspended') void audio.resume().catch(() => {});
        unlockedRef.current = true;
        return;
      }
      unlock(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [ensureAudioContext, unlock]);

  // 切后台暂停播放，回前台按需恢复。
  useEffect(() => {
    const onVisibility = () => {
      applyVolumes();
      if (document.hidden) {
        stopAmbient();
        syncBgmPlayback(wanted.current.bgm);
      } else if (unlockedRef.current && !wanted.current.muted && wanted.current.musicVolume > 0) {
        syncBgmPlayback(wanted.current.bgm, {fast: true});
        if (wanted.current.ambient) {
          if (ctx.current?.state === 'suspended') {
            void ctx.current.resume().then(() => {
              if (wanted.current.ambient) startAmbient(wanted.current.ambient);
            }).catch(() => {});
          } else {
            startAmbient(wanted.current.ambient);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [applyVolumes, startAmbient, stopAmbient, syncBgmPlayback]);

  // 注册全局 UI 音效播放器。
  useEffect(() => {
    registerUiSoundPlayer(play);
    return () => registerUiSoundPlayer(null);
  }, [play]);

  const hasMusicOutput = !muted && musicVolume > 0;

  // 音量滑条或全局静音变化 → 实时更新所有音频总线增益。
  useEffect(() => {
    applyVolumes();
  }, [applyVolumes, musicVolume, muted, sfxVolume]);

  // 开关静音、恢复音乐音量或切换场景 BGM → 按对应曲线平滑过渡。
  useEffect(() => {
    syncBgmPlayback(bgm, {fast: !hasMusicOutput});
  }, [bgm, hasMusicOutput, syncBgmPlayback]);

  // 环境音随场景、静音与音乐音量开关。
  useEffect(() => {
    if (!ambient || muted || musicVolume <= 0 || document.hidden) {
      stopAmbient();
      return;
    }
    if (unlockedRef.current && ambientRef.current?.kind !== ambient) {
      startAmbient(ambient);
    }
  }, [ambient, musicVolume, muted, startAmbient, stopAmbient]);

  // 卸载时清理所有音频资源。
  useEffect(() => () => {
    stopFadeTimer();
    stopAmbient();
    for (const el of Object.values(elementsRef.current)) {
      if (el) {
        el.pause();
        el.src = '';
      }
    }
    trackStatesRef.current.clear();
  }, [stopAmbient, stopFadeTimer]);

  return {unlock};
}
