import {HOME_FRAMES,type HomeArtwork} from './assets';
import type {HomeObject} from './objects';

const masks=new WeakMap<HomeArtwork,Map<string,Uint8ClampedArray>>();
/** Transparent margins and holes in furniture must not act like a button. */
export function homeObjectOpaqueAt(object:HomeObject,x:number,y:number,art?:HomeArtwork){
  if(!art)return false;
  const f=HOME_FRAMES[object.sprite],h=object.width*f.height/f.width;
  const px=Math.floor((x-object.x+object.width/2)/object.width*f.width),py=Math.floor((y-object.y+h)/h*f.height);
  if(px<0||px>=f.width||py<0||py>=f.height)return false;
  let cache=masks.get(art);if(!cache){cache=new Map();masks.set(art,cache);}
  let data=cache.get(object.sprite);
  if(!data){const c=document.createElement('canvas');c.width=f.width;c.height=f.height;const ctx=c.getContext('2d')!;ctx.drawImage(art[f.sheet],f.x,f.y,f.width,f.height,0,0,f.width,f.height);data=ctx.getImageData(0,0,f.width,f.height).data;cache.set(object.sprite,data);}
  return data[(py*f.width+px)*4+3]>80;
}
