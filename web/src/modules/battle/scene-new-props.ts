import {queueBattleImage} from '../../core/image-loading';
import atlasUrl from './assets/scene-new-props-atlas.png';
import losslessAtlasUrl from './assets/scene-new-props-atlas.lossless.webp';
import type {BattleSceneId} from './scene-art';
import type {SceneryRect} from './scene-composition';
import {sceneryRaster} from './scene-raster';

type NewProp='bicycle'|'hydrant'|'tea-cart'|'bundles'|'wheelbarrow'|'water-barrel'|'maintenance'|'pallet-jack';
const crops:Record<NewProp,readonly [number,number,number,number]>={
  bicycle:[91,180,339,227],hydrant:[544,138,292,267],'tea-cart':[948,112,325,295],bundles:[1390,124,300,282],
  wheelbarrow:[95,584,314,208],'water-barrel':[541,527,312,264],maintenance:[978,519,284,281],'pallet-jack':[1395,535,310,257],
};
interface PropPlan {kind:NewProp;across:number;depth:number;width:number}
interface NewPropPlacement extends SceneryRect {kind:NewProp;worldWidth:number}
const plans:Record<BattleSceneId,readonly PropPlan[]>={
  prologue:[{kind:'bicycle',across:.12,depth:.72,width:165},{kind:'hydrant',across:.86,depth:.83,width:96}],
  alley:[{kind:'bicycle',across:.19,depth:.26,width:190},{kind:'hydrant',across:.68,depth:.28,width:112},{kind:'tea-cart',across:.12,depth:.68,width:165}],
  market:[{kind:'tea-cart',across:.85,depth:.38,width:186},{kind:'bundles',across:.8,depth:.76,width:144}],
  greenhouse:[{kind:'wheelbarrow',across:.2,depth:.73,width:175},{kind:'water-barrel',across:.83,depth:.25,width:140}],
  tunnel:[{kind:'maintenance',across:.16,depth:.34,width:161}],
  finale:[{kind:'pallet-jack',across:.84,depth:.66,width:192},{kind:'maintenance',across:.19,depth:.8,width:121}],
};
let atlas:HTMLImageElement|undefined;
const listeners=new Set<()=>void>();
function image(){
  if(!atlas&&typeof Image!=='undefined'){
    atlas=new Image();atlas.fetchPriority='high';atlas.onload=()=>{for(const ready of listeners)ready();listeners.clear();};
    atlas.onerror=()=>listeners.clear();void queueBattleImage(atlas,losslessAtlasUrl,atlasUrl);
  }
  return atlas?.complete&&atlas.naturalWidth>0?atlas:undefined;
}
export function whenNewScenePropsReady(paint:()=>void){
  if(atlas?.complete&&atlas.naturalWidth>0)return()=>{};
  listeners.add(paint);return()=>{listeners.delete(paint);};
}

/** These objects add new silhouettes, not repeated copies of the existing obstacle sprites. */
export function planNewSceneProps(scene:BattleSceneId,width:number,height:number,cellSize:number,occupied:readonly SceneryRect[]):NewPropPlacement[]{
  if(width<840||height<430)return [];
  const result:NewPropPlacement[]=[],top=128,bottom=height-136;
  for(const plan of plans[scene]){
    let placed=false;
    for(const scale of [1,.86]){
      if(placed)break;
      const w=Math.round(plan.width*Math.max(.3,Math.min(1.2,cellSize/100))*scale);
      const crop=crops[plan.kind],h=Math.round(w*crop[3]/crop[2]);
      for(const [dx,dy] of [[0,0],[30,-24],[-36,26],[52,38],[-55,-35]]){
        const candidate={kind:plan.kind,worldWidth:plan.width*.8*scale,x:Math.round(width*plan.across-w/2+dx),y:Math.round(top+(bottom-top)*plan.depth-h/2+dy),width:w,height:h};
        if(candidate.x<24||candidate.x+w>width-24||candidate.y<110||candidate.y+h>height-110)continue;
        if([...occupied,...result].some(r=>candidate.x<r.x+r.width+12&&candidate.x+w+12>r.x&&candidate.y<r.y+r.height+12&&candidate.y+h+12>r.y))continue;
        result.push(candidate);placed=true;break;
      }
    }
  }
  return result;
}

export function paintNewSceneProp(ctx:CanvasRenderingContext2D,prop:NewPropPlacement){
  const source=image();if(!source)return;
  const crop=crops[prop.kind];
  // Plans were authored at a 100px cell. Keep this native size stable on zoom.
  const sprite=sceneryRaster(source,crop,prop.worldWidth,prop.worldWidth*crop[3]/crop[2]);
  if(!sprite)return;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha*=.92;
  ctx.drawImage(sprite,prop.x,prop.y,prop.width,prop.height);ctx.restore();
}
