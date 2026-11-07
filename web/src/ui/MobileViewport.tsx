import {useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';

const stageKey='phoneCanvas';
// A separate same-origin viewport lets browser hit testing, native dialogs,
// Canvas coordinates and CSS viewport units rotate together without patching them.
export const mobileStage=window.parent!==window&&new URLSearchParams(window.location.search).get(stageKey)==='1';
const mobileAgent=(navigator as Navigator&{userAgentData?:{mobile?:boolean}}).userAgentData?.mobile===true||/Android.*Mobile|iPhone|iPod|Windows Phone|HarmonyOS.*Phone/i.test(navigator.userAgent);
const touchSupported=()=>navigator.maxTouchPoints>0||window.matchMedia('(any-pointer: coarse)').matches;
// Pointer/hover describe input devices, not whether this is a phone. OEM
// browsers and desktop-UA mode may report them differently. Only our own
// virtual viewport is excluded; embedding the game must not disable rotation.
export const phonePresentation=!mobileStage&&(new URLSearchParams(window.location.search).get('display')==='phone'||mobileAgent||touchSupported()&&Math.min(window.screen.width,window.screen.height,window.innerWidth,window.innerHeight)<=600);
if(mobileStage){
  document.documentElement.dataset.mobileStage='true';
  window.addEventListener('pointerup',()=>window.parent.postMessage({type:'kitty-enter-portrait'},window.location.origin),{once:true,capture:true});
}
function subscribeTouch(listener:()=>void){const media=window.matchMedia('(any-pointer: coarse)');media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener);}
export function useTouchDevice(){return useSyncExternalStore(subscribeTouch,()=>mobileStage||mobileAgent||touchSupported());}
export function navigateCheckout(url:string){
  // Payment providers must open as a full page, outside the rotated viewport.
  if(mobileStage)window.top!.location.href=url;
  else window.location.assign(url);
}

const width=1920,height=1080;
export default function MobileViewport(){
  const frame=useRef<HTMLIFrameElement>(null),host=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null);
  const [src]=useState(()=>{const url=new URL(window.location.href);url.searchParams.set(stageKey,'1');return url.href;});
  useLayoutEffect(()=>{
    const root=document.documentElement;root.dataset.phonePresentation='true';
    let previous='';
    const fit=()=>{
      const box=host.current!.getBoundingClientRect(),view=window.visualViewport;
      const visibleLeft=Math.max(box.left,view?.offsetLeft??0),visibleTop=Math.max(box.top,view?.offsetTop??0);
      const visibleRight=Math.min(box.right,(view?.offsetLeft??0)+(view?.width??innerWidth)),visibleBottom=Math.min(box.bottom,(view?.offsetTop??0)+(view?.height??innerHeight));
      const visibleWidth=Math.max(1,visibleRight-visibleLeft),visibleHeight=Math.max(1,visibleBottom-visibleTop);
      const portrait=visibleHeight>=visibleWidth;
      // The game always has the same portrait presentation. Counter the system
      // rotation when orientation locking is unavailable, never shrink it into
      // a second narrow portrait panel inside a landscape page.
      const scale=Math.max(visibleWidth,visibleHeight)/width;
      const stageHeight=width*Math.min(visibleWidth,visibleHeight)/Math.max(visibleWidth,visibleHeight);
      const angle=portrait?90:screen.orientation?.angle===270?180:0;
      const left=visibleLeft-box.left+visibleWidth/2,top=visibleTop-box.top+visibleHeight/2;
      const key=[left,top,scale,angle,stageHeight].join(':');
      if(key!==previous){frame.current?.contentWindow?.dispatchEvent(new Event('blur'));previous=key;}
      const el=stage.current!;el.style.left=left+'px';el.style.top=top+'px';el.style.height=stageHeight+'px';el.style.transform=`translate(-50%,-50%) rotate(${angle}deg) scale(${scale})`;
      frame.current!.dataset.angle=String(angle);frame.current!.dataset.scale=String(scale);
    };
    let lockAttempted=false;
    const lockPortrait=async(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||event.data?.type!=='kitty-enter-portrait'||lockAttempted)return;
      lockAttempted=true;
      const orientation=screen.orientation as ScreenOrientation&{lock?:(value:string)=>Promise<void>};
      if(!orientation?.lock)return;
      try{
        if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});
        await orientation.lock('portrait-primary');
      }catch{/* Keep the same portrait presentation when the browser denies lock. */}
    };
    window.addEventListener('message',lockPortrait);
    const observer=new ResizeObserver(fit);observer.observe(host.current!);fit();
    window.addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);window.visualViewport?.addEventListener('scroll',fit);
    return()=>{window.removeEventListener('message',lockPortrait);observer.disconnect();window.removeEventListener('resize',fit);window.visualViewport?.removeEventListener('resize',fit);window.visualViewport?.removeEventListener('scroll',fit);delete root.dataset.phonePresentation;};
  },[]);
  return <main ref={host} className="phone-presentation" aria-label="小猫回家记，固定竖向横画面">
    <div ref={stage} className="phone-game-stage"><iframe ref={frame} title="小猫回家记游戏" className="phone-game-frame" src={src} width={width} height={height} allow="autoplay; fullscreen"/></div>
  </main>;
}
