import {useEffect, useRef, useSyncExternalStore} from 'react';
import PixelCat from './PixelCat';

const portraitQuery = '(any-pointer: coarse) and (orientation: portrait) and (max-width: 600px)';
function subscribe(query: string, listener: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const subscribePortrait = (listener: () => void) => subscribe(portraitQuery, listener);
const subscribeTouch = (listener: () => void) => subscribe('(any-pointer: coarse)', listener);
export function usePortraitPhone() {
  return useSyncExternalStore(subscribePortrait, () => window.matchMedia(portraitQuery).matches);
}
export function useTouchDevice() {
  return useSyncExternalStore(subscribeTouch, () => window.matchMedia('(any-pointer: coarse)').matches);
}

/** Native modal also covers any open shop/dialog while the phone is upright. */
export default function MobileViewport({portrait}: {portrait: boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!portrait) return;
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, [portrait]);
  if (!portrait) return null;
  return <dialog ref={ref} className="rotate-device" aria-label="请横屏游玩" onCancel={event => event.preventDefault()}>
    <PixelCat breed="miaomiao" size={100}/>
    <div className="rotate-device-icon" aria-hidden="true">↻ <span>▯</span></div>
    <h1>把手机横过来，一起出发</h1>
    <p>横屏能看见更完整的小巷，<br/>也能腾出双手，陪小猫走得更远。</p>
    <small>转动手机即可继续 · 旅程会在这里等你</small>
  </dialog>;
}
