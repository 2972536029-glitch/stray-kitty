/** Environment art sits between the 32px cats and the 80-unit tactical tiles.
 * Average tiny source details once; enlarge the resulting pixel clusters without
 * smoothing. This changes material density, never layout, actors or UI text. */
export const SCENERY_TEXELS_PER_CELL=56;
export const SCENERY_CELL_SIZE=80;
type Crop=readonly [number,number,number,number];
const rasters=new WeakMap<CanvasImageSource,Map<string,HTMLCanvasElement>>();

export function createSceneryRaster(width:number,height:number,paint:(ctx:CanvasRenderingContext2D)=>void){
  if(typeof document==='undefined'||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return undefined;
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*SCENERY_TEXELS_PER_CELL/SCENERY_CELL_SIZE));
  canvas.height=Math.max(1,Math.round(height*SCENERY_TEXELS_PER_CELL/SCENERY_CELL_SIZE));
  const ink=canvas.getContext('2d');if(!ink)return undefined;
  ink.imageSmoothingEnabled=true;ink.imageSmoothingQuality='high';
  ink.scale(canvas.width/width,canvas.height/height);paint(ink);
  return canvas;
}

/** Cache by source crop AND world size, not the responsive CSS size. */
export function sceneryRaster(image:CanvasImageSource,crop:Crop,width:number,height:number,sampling:'average'|'pixel'='average'){
  const key=[...crop,Math.round(width*SCENERY_TEXELS_PER_CELL/SCENERY_CELL_SIZE),Math.round(height*SCENERY_TEXELS_PER_CELL/SCENERY_CELL_SIZE),sampling].join(':');
  let cache=rasters.get(image);const ready=cache?.get(key);if(ready)return ready;
  const raster=createSceneryRaster(width,height,ink=>{
    // Authored pixel clusters retain their palette; dense painted sources still
    // average tiny texture once through the default path.
    ink.imageSmoothingEnabled=sampling==='average';
    ink.drawImage(image,...crop,0,0,width,height);
  });
  if(!raster)return undefined;
  if(!cache){cache=new Map();rasters.set(image,cache);}
  cache.set(key,raster);
  // Resizing can introduce a few new aspect ratios; never retain an unbounded set.
  if(cache.size>192)cache.delete(cache.keys().next().value!);
  return raster;
}
