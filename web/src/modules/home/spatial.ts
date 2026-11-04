import {HOME_FRAMES} from './assets';
import type {HomeObject} from './objects';
import type {HomePoint} from './layout';

export function groundCover(object:HomeObject) {
  return ['clover_rug','starmap_carpet'].includes(object.furnitureId??'') || ['s1.rag','s4.rug'].includes(object.sprite);
}
/** Clearance includes the cat's visible body, not just a single foot pixel.
 * Folding blankets are beds with volume; only flat carpets are passable. */
export function furnitureBlocksCat(object:HomeObject,point:HomePoint) {
  if(object.wall || groundCover(object))return false;
  const frame=HOME_FRAMES[object.sprite],height=object.width*frame.height/frame.width;
  return Math.abs(point.x-object.x)<object.width*.48+29 &&
    point.y>object.y-height+10 && point.y<object.y+59;
}
export function homeObjectDepth(object:HomeObject) {
  if(object.wall)return object.front?10000:-10000;
  return groundCover(object)?-9000:object.y;
}
