import type {HomeObject} from './objects';
import type {LifeCat} from './life';
import {homeObjectDepth} from './spatial';
import {paintHomeObject,paintHomeFurnitureFront} from './painter';
import {paintResident} from './catPainter';
import type {HomeArtwork} from './assets';

export function homeResidentLayers(objects:readonly HomeObject[],cats:readonly LifeCat[]) {
  return [
    ...objects.filter(o=>!o.front).map(object=>({depth:homeObjectDepth(object),object,cat:undefined as LifeCat|undefined})),
    ...cats.map(cat=>{
      const host=objects.find(o=>(o.slot??o.layoutKey)===cat.slot);
      return {depth:host?Math.max(cat.y,homeObjectDepth(host)+.1):cat.y,object:undefined as HomeObject|undefined,cat};
    }),
  ].sort((a,b)=>a.depth-b.depth);
}

/** Actual floor depth is shared with the renovation snapshot. Rugs are under
 * all feet, seated cats follow their host, and only its low lip covers paws. */
export function paintHomeResidents(ctx:CanvasRenderingContext2D,objects:readonly HomeObject[],cats:readonly LifeCat[],art:HomeArtwork|undefined,time:number,stage:number){
  for(const layer of homeResidentLayers(objects,cats)){
    if(layer.object)paintHomeObject(ctx,layer.object,art,time);
    else if(layer.cat){
      paintResident(ctx,layer.cat,time,stage);
      const host=objects.find(o=>(o.slot??o.layoutKey)===layer.cat!.slot);
      if(host&&!layer.cat.furnitureArrival)paintHomeFurnitureFront(ctx,host,art);
    }
  }
}
