import {useLayoutEffect} from 'react';

// Keep the desktop HUD in the same proportions as a 1920 x 1080 window.
// Panels retain a larger minimum scale so their content remains readable.
export function useDesktopUiScale() {
  useLayoutEffect(()=>{
    const root=document.documentElement,desktop=window.matchMedia('(hover: hover) and (pointer: fine)');
    const update=()=>{
      if(!desktop.matches){delete root.dataset.desktopUi;return;}
      const scale=Math.max(.5,Math.min(1,window.innerWidth/1920,window.innerHeight/1080));
      root.dataset.desktopUi='true';
      root.style.setProperty('--desktop-ui-scale',String(scale));
      root.style.setProperty('--desktop-panel-scale',String(Math.max(.75,scale)));
      root.style.setProperty('--desktop-window-scale',String(Math.max(8/9,scale)));
    };
    update();window.addEventListener('resize',update);desktop.addEventListener('change',update);
    return()=>{window.removeEventListener('resize',update);desktop.removeEventListener('change',update);delete root.dataset.desktopUi;root.style.removeProperty('--desktop-ui-scale');root.style.removeProperty('--desktop-panel-scale');root.style.removeProperty('--desktop-window-scale');};
  },[]);
}
