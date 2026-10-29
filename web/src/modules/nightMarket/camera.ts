import {cameraFrameFor, displayedCanvasRect, type CameraFrame} from '../../adapters/canvas/camera';
export type {CameraFrame} from '../../adapters/canvas/camera';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function measureMarketCameraFrame(canvas:HTMLCanvasElement,logicalWidth:number,logicalHeight:number):CameraFrame {
  const bounds=canvas.getBoundingClientRect();
  const fit=getComputedStyle(canvas).objectFit==='contain'?'contain':'cover';
  const viewport=displayedCanvasRect(bounds.width,bounds.height,logicalWidth,logicalHeight,fit);
  const app=canvas.closest('.app-shell');
  const overlays=['.topbar','.world-toolbar','.dev-bar','.world-footer']
    .map(selector=>app?.querySelector<HTMLElement>(selector))
    .filter((element):element is HTMLElement=>!!element)
    .map(element=>element.getBoundingClientRect());
  const canvasScale=fit==='cover'
    ? Math.max(bounds.width/logicalWidth,bounds.height/logicalHeight)
    : Math.min(bounds.width/logicalWidth,bounds.height/logicalHeight);
  const offsetY=(bounds.height-logicalHeight*canvasScale)/2;
  const toLogicalY=(y:number)=>(y-bounds.top-offsetY)/canvasScale;
  const overlapsHorizontally=(rect:DOMRect)=>rect.right>bounds.left&&rect.left<bounds.right;
  const top=overlays.filter(rect=>overlapsHorizontally(rect)&&rect.top<bounds.top+viewport.height*canvasScale*.55)
    .reduce((value,rect)=>Math.max(value,toLogicalY(rect.bottom)),viewport.y);
  const bottom=overlays.filter(rect=>overlapsHorizontally(rect)&&rect.bottom>bounds.bottom-viewport.height*canvasScale*.45)
    .reduce((value,rect)=>Math.min(value,toLogicalY(rect.top)),viewport.y+viewport.height);
  const margin=12/canvasScale;
  const safeTop=clamp(top+margin,viewport.y,viewport.y+viewport.height);
  const safeBottom=clamp(bottom-margin,safeTop,viewport.y+viewport.height);
  const safe={x:viewport.x+margin,y:safeTop,width:Math.max(0,viewport.width-2*margin),height:Math.max(0,safeBottom-safeTop)};
  return cameraFrameFor(viewport,safe);
}
