import {useLayoutEffect} from 'react';

// Scale from the 1920 x 1080 desktop design, with 20% reading room on
// smaller windows. The top menu has its own 40% reading room.
export function useDesktopUiScale() {
  useLayoutEffect(()=>{
    const root=document.documentElement,desktop=window.matchMedia('(hover: hover) and (pointer: fine)');
    const update=()=>{
      if(!desktop.matches){delete root.dataset.desktopUi;return;}
      const ratio=Math.min(window.innerWidth/1920,window.innerHeight/1080);
      const scale=Math.max(.5,Math.min(1,ratio*1.2));
      root.dataset.desktopUi='true';
      root.style.setProperty('--desktop-ui-scale',String(scale));
      root.style.setProperty('--desktop-menu-scale',String(Math.max(.5,Math.min(1,ratio*1.4))));
      root.style.setProperty('--desktop-panel-scale',String(scale));
      root.style.setProperty('--desktop-window-scale',String(scale));
    };
    update();window.addEventListener('resize',update);desktop.addEventListener('change',update);
    return()=>{window.removeEventListener('resize',update);desktop.removeEventListener('change',update);delete root.dataset.desktopUi;root.style.removeProperty('--desktop-ui-scale');root.style.removeProperty('--desktop-menu-scale');root.style.removeProperty('--desktop-panel-scale');root.style.removeProperty('--desktop-window-scale');};
  },[]);
}
