import {getIllustratedRoomBounds} from './scene-room-layout';

const roomUrl=new URL('./assets/finale-room-scene-v1.png',import.meta.url).href;

let roomImage:HTMLImageElement|undefined;
const listeners=new Set<()=>void>();
function readyImage(){
  if(!roomImage&&typeof Image!=='undefined'){
    roomImage=new Image();
    roomImage.onload=()=>{for(const notify of listeners)notify();listeners.clear();};
    roomImage.onerror=()=>listeners.clear();
    roomImage.src=roomUrl;
  }
  return roomImage?.complete&&roomImage.naturalWidth>0?roomImage:undefined;
}
export function hasIllustratedRoom(){return !!readyImage();}
export function whenIllustratedRoomReady(paint:()=>void){
  if(readyImage())return()=>{};
  listeners.add(paint);return()=>{listeners.delete(paint);};
}

/** One authored room supplies ground, walls, grouped props and their shadows.
 * The live board only adds tactical seams and actors on its empty floor. */
export function paintIllustratedRoom(ctx:CanvasRenderingContext2D,width:number,height:number,board:{x:number;y:number;width:number;height:number}){
  const source=readyImage();if(!source)return false;
  // The central safe floor is x20–80%, y17–76%. Keep the whole live board
  // comfortably inside it, even in a short viewport or a zoomed/scrolling view.
  const {x,y,width:w,height:h}=getIllustratedRoomBounds(width,board);
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#142128';ctx.fillRect(0,0,width,height);
  ctx.drawImage(source,x,y,w,h);
  ctx.restore();return true;
}
