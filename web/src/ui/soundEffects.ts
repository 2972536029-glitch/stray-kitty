// 全局 UI 音效：useAudioManager 在挂载时注册播放器，任何组件都能直接调 playSound(soundId)。
// 这样各组件不必各自持有 AudioContext，也不用把音量/开关一层层传下去。
export type UiSoundId = 'click' | 'send' | 'open' | 'close' | 'meow' | 'pickup';

let player: ((id: UiSoundId) => void) | null = null;

export function registerUiSoundPlayer(fn: ((id: UiSoundId) => void) | null) {
  player = fn;
}

/** 播放一条 UI 音效；尚未注册（音频未解锁）时静默跳过。 */
export function playSound(id: UiSoundId) {
  player?.(id);
}
