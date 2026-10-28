import {useCallback, useEffect, useRef} from 'react';
import {registerUiSoundPlayer, type UiSoundId} from './soundEffects';

export type BgmMode = 'title' | 'explore' | 'home' | 'battle';
type AmbientMode = 'rain' | 'market' | null;

/**
 * 全局音频系统：分场景 BGM（Web Audio 合成的温柔芯片音乐循环）+ 环境音（雨声/集市）+ UI 音效。
 * 三条总线：musicGain（BGM 与环境音，随“背景音乐音量”滑条）与 sfxGain（音效，随“音效音量”滑条）。
 * 所有起音/收音都走短斜坡（linearRamp/setTargetAtTime），切场景用交叉淡入淡出，保证没有突兀爆音。
 * AudioContext 由首次指针交互解锁；解锁前的场景请求会先记在待办上，解锁后立即拉起。
 */
export function useAudioManager({bgm, ambient, musicVolume, sfxVolume}: {bgm: BgmMode; ambient: AmbientMode; musicVolume: number; sfxVolume: number}) {
  const ctx = useRef<AudioContext | null>(null);
  const musicGain = useRef<GainNode | null>(null);
  const sfxGain = useRef<GainNode | null>(null);
  const ambientRef = useRef<{src: AudioBufferSourceNode; gain: GainNode} | null>(null);
  const bgmRef = useRef<{mode: BgmMode; timer: number; nodes: Set<AudioScheduledSourceNode>; bus: GainNode} | null>(null);
  // 最新期望值：AudioContext 解锁后按它们拉起 BGM/环境音。
  const wanted = useRef({bgm, ambient});
  wanted.current = {bgm, ambient};

  const applyVolumes = useCallback(() => {
    const audio = ctx.current;
    if (!audio || !musicGain.current || !sfxGain.current) return;
    const t = audio.currentTime;
    musicGain.current.gain.setTargetAtTime(musicVolume / 100 * .5, t, .09);
    sfxGain.current.gain.setTargetAtTime(sfxVolume / 100 * .9, t, .09);
  }, [musicVolume, sfxVolume]);

  // ---- BGM：每场景一段 8 拍循环（[拍, MIDI 音高, 时值, 波形]），方波低电平、三角波铺底，柔和不刺耳。 ----
  const PATTERNS: Record<BgmMode, {tempo: number; notes: [number, number, number, OscillatorType][]}> = {
    title:   {tempo: 66, notes: [[0, 48, 2, 'triangle'], [0, 60, 1, 'triangle'], [1, 64, 1, 'triangle'], [2, 67, 1, 'triangle'], [3, 69, 1.5, 'triangle'], [4, 48, 2, 'triangle'], [4, 64, 1, 'triangle'], [5, 67, 1, 'triangle'], [6, 72, 2, 'triangle'], [7, 69, 1.5, 'triangle']]},
    explore: {tempo: 78, notes: [[0, 45, 2, 'triangle'], [0, 57, 1, 'square'], [1, 60, 1, 'square'], [2, 64, 1, 'square'], [3, 57, 1.5, 'square'], [4, 43, 2, 'triangle'], [4, 59, 1, 'square'], [5, 62, 1, 'square'], [6, 67, 1, 'square'], [7, 64, 2, 'square']]},
    home:    {tempo: 60, notes: [[0, 41, 2, 'triangle'], [0, 53, 1, 'triangle'], [1, 57, 1, 'triangle'], [2, 60, 1, 'triangle'], [3, 65, 1.5, 'triangle'], [4, 41, 2, 'triangle'], [4, 57, 1, 'triangle'], [5, 60, 1, 'triangle'], [6, 65, 1, 'triangle'], [7, 69, 2, 'triangle']]},
    battle:  {tempo: 100, notes: [[0, 38, 1, 'square'], [1, 38, 1, 'square'], [2, 45, 1, 'triangle'], [3, 38, 1, 'square'], [4, 36, 1, 'square'], [5, 36, 1, 'square'], [6, 43, 1, 'triangle'], [7, 46, 1.5, 'triangle']]}
  };
  const midiHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

  const stopBgm = useCallback(() => {
    const cur = bgmRef.current;
    const audio = ctx.current;
    if (!cur || !audio) return;
    bgmRef.current = null;
    window.clearInterval(cur.timer);
    // 交叉淡出：0.9 秒滑到静音后再停节点，避免“啪”的截断声。
    const t = audio.currentTime;
    cur.bus.gain.cancelScheduledValues(t);
    cur.bus.gain.setValueAtTime(cur.bus.gain.value, t);
    cur.bus.gain.linearRampToValueAtTime(0, t + .9);
    for (const node of cur.nodes) {try {node.stop(t + .95);} catch {/* already stopped */}}
    window.setTimeout(() => cur.bus.disconnect(), 1100);
  }, []);

  const startBgm = useCallback((mode: BgmMode) => {
    const audio = ctx.current;
    if (!audio || !musicGain.current || audio.state !== 'running') return;
    stopBgm();
    const pattern = PATTERNS[mode];
    const beat = 60 / pattern.tempo;
    const barLen = beat * 8;
    const bus = audio.createGain();
    bus.gain.setValueAtTime(0, audio.currentTime);
    bus.gain.linearRampToValueAtTime(1, audio.currentTime + 1.6);   // 新场景淡入
    bus.connect(musicGain.current);
    const nodes = new Set<AudioScheduledSourceNode>();
    const scheduleBar = (barStart: number) => {
      for (const [beats, midi, dur, type] of pattern.notes) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = type;
        osc.frequency.value = midiHz(midi);
        const t = barStart + beats * beat;
        const len = Math.max(.14, dur * beat * .92);
        gain.gain.setValueAtTime(0, t);                              // 起音 30ms 斜坡，无咔哒声
        gain.gain.linearRampToValueAtTime(type === 'square' ? .05 : .09, t + .03);
        gain.gain.setTargetAtTime(0, t + len * .7, .09);             // 指数收音尾巴
        osc.connect(gain).connect(bus);
        osc.start(t);
        osc.stop(t + len + .4);
        nodes.add(osc);
        osc.onended = () => nodes.delete(osc);
      }
    };
    let nextBar = audio.currentTime + .12;
    scheduleBar(nextBar);
    nextBar += barLen;
    const timer = window.setInterval(() => {
      if (ctx.current?.state !== 'running') return;
      while (nextBar < ctx.current.currentTime + 1.2) {scheduleBar(nextBar); nextBar += barLen;}
    }, 250);
    bgmRef.current = {mode, timer, nodes, bus};
  }, [PATTERNS, stopBgm]);

  // ---- 环境音：低通白噪声循环（雨声/集市人声），换场景交叉淡出淡入。 ----
  const stopAmbient = useCallback(() => {
    const cur = ambientRef.current;
    const audio = ctx.current;
    if (!cur || !audio) return;
    ambientRef.current = null;
    const t = audio.currentTime;
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
    cur.gain.gain.linearRampToValueAtTime(0, t + .7);
    try {cur.src.stop(t + .75);} catch {/* already stopped */}
  }, []);

  const startAmbient = useCallback((kind: Exclude<AmbientMode, null>) => {
    const audio = ctx.current;
    if (!audio || !musicGain.current || audio.state !== 'running') return;
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
    filter.frequency.value = kind === 'market' ? 480 : 950;          // 集市是远处闷响的人声嗡嗡，雨声稍亮
    gain.gain.setValueAtTime(0, audio.currentTime);
    gain.gain.linearRampToValueAtTime(kind === 'market' ? .4 : .34, audio.currentTime + 1.2);
    src.connect(filter).connect(gain).connect(musicGain.current);
    src.start();
    ambientRef.current = {src, gain};
  }, [stopAmbient]);

  /** 首次指针交互时创建并解锁 AudioContext，随后把等待中的 BGM/环境音拉起来。 */
  const unlock = useCallback(() => {
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
    if (ctx.current.state === 'suspended') void ctx.current.resume();
    applyVolumes();
    if (ctx.current.state === 'running') {
      startBgm(wanted.current.bgm);
      if (wanted.current.ambient) startAmbient(wanted.current.ambient);
    }
  }, [applyVolumes, startAmbient, startBgm]);

  // ---- 音效：短促合成音，走 sfxGain 总线（音量由滑条统一控制）。 ----
  const blip = useCallback((freq: number, duration: number, start = 0, type: OscillatorType = 'square', gainMul = 1) => {
    const audio = ctx.current;
    if (!audio || !sfxGain.current) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = audio.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(.045 * gainMul, t0 + .008);    // 8ms 起音防爆音
    gain.gain.exponentialRampToValueAtTime(.0008, t0 + duration);
    osc.connect(gain).connect(sfxGain.current);
    osc.start(t0);
    osc.stop(t0 + duration + .02);
  }, []);

  const play = useCallback((id: UiSoundId) => {
    if (sfxVolume <= 0) return;
    const audio = ctx.current;
    if (!audio || audio.state !== 'running' || !sfxGain.current) return;
    if (id === 'click') blip(620, .06);
    else if (id === 'send') {blip(760, .05);blip(1140, .07, .06);}
    else if (id === 'open') {blip(500, .06);blip(680, .08, .07);}
    else if (id === 'close') {blip(560, .05);blip(400, .07, .05);}
    else if (id === 'pickup') {blip(660, .09, 0, 'triangle');blip(880, .1, .07, 'triangle');blip(1320, .14, .13, 'triangle', .8);}
    else if (id === 'meow') {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(720, audio.currentTime);
      osc.frequency.exponentialRampToValueAtTime(460, audio.currentTime + .18);
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(.06, audio.currentTime + .02);
      gain.gain.exponentialRampToValueAtTime(.0008, audio.currentTime + .2);
      osc.connect(gain).connect(sfxGain.current);
      osc.start();
      osc.stop(audio.currentTime + .22);
    }
  }, [blip, sfxVolume]);

  // 全局按钮轻响：任何未禁用按钮按下即响（data-sound 标记的按钮自己发声，避免叠加）。
  useEffect(() => {
    const handler = (event: PointerEvent) => {
      unlock();
      const target = event.target as Element | null;
      if (target?.closest('button:not(:disabled)') && !target.closest('[data-sound]')) play('click');
    };
    window.addEventListener('pointerdown', handler, true);
    return () => window.removeEventListener('pointerdown', handler, true);
  }, [play, unlock]);

  // 全局 playSound(soundId) 注册：任何组件一行代码即可发声。
  useEffect(() => {
    registerUiSoundPlayer(play);
    return () => registerUiSoundPlayer(null);
  }, [play]);

  // 音量滑条 → 总线增益平滑跟随（setTargetAtTime 无拉链噪声）。
  useEffect(() => {applyVolumes();}, [applyVolumes]);

  // 场景切换：BGM 交叉淡入淡出；环境音同理。
  useEffect(() => {
    if (bgmRef.current?.mode !== bgm) startBgm(bgm);
  }, [bgm, startBgm]);
  useEffect(() => {
    const cur = ambientRef.current;
    if (!ambient) {stopAmbient();return;}
    if (!cur) startAmbient(ambient);
  }, [ambient, startAmbient, stopAmbient]);

  // 卸载时安静收尾。
  useEffect(() => () => {stopBgm();stopAmbient();}, [stopAmbient, stopBgm]);
}
