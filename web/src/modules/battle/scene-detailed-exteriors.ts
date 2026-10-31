/** Original transparent scenery atlas. Crops are alpha-tight, not tile footprints.
 * At placement time the renderer preserves the silhouette and fits inside the
 * authored exterior box, so the new art cannot enlarge the collision footprint. */
import {createSceneryRaster,sceneryRaster,SCENERY_CELL_SIZE} from './scene-raster';
export type DetailedExteriorKind='narrow-home'|'wide-home'|'planted-bed'|'glass-frame';
const crops:Record<DetailedExteriorKind,readonly [number,number,number,number]>={
  'narrow-home':[210,30,378,533],
  'wide-home':[740,118,714,446],
  'planted-bed':[76,686,758,262],
  'glass-frame':[1008,683,452,272],
};
type Asset='exteriors'|'obstacles'|'workstations'|'materials'|'accents'|'structures'|'market-banks';
const urls:Record<Asset,string>={
  exteriors:new URL('./assets/scene-detailed-residences-garden-v1.png',import.meta.url).href,
  obstacles:new URL('./assets/scene-detailed-obstacles-v1.png',import.meta.url).href,
  workstations:new URL('./assets/scene-detailed-workstations-v1.png',import.meta.url).href,
  materials:new URL('./assets/scene-refined-materials-v1.png',import.meta.url).href,
  accents:new URL('./assets/scene-small-accents-v1.png',import.meta.url).href,
  structures:new URL('./assets/scene-perimeter-foreground-v1.png',import.meta.url).href,
  'market-banks':new URL('./assets/scene-market-banks-v1.png',import.meta.url).href,
};
const atlases=new Map<Asset,HTMLImageElement>(),listeners=new Map<Asset,Set<()=>void>>();
function source(asset:Asset='exteriors'){
  let atlas=atlases.get(asset);
  if(!atlas&&typeof Image!=='undefined'){
    atlas=new Image();atlases.set(asset,atlas);
    atlas.onload=()=>{for(const ready of listeners.get(asset)??[])ready();listeners.delete(asset);};
    atlas.onerror=()=>listeners.delete(asset);
    atlas.src=urls[asset];
  }
  return atlas?.complete&&atlas.naturalWidth>0?atlas:undefined;
}
export function whenDetailedExteriorsReady(paint:()=>void){
  for(const asset of Object.keys(urls) as Asset[]){
    if(source(asset))continue;
    const pending=listeners.get(asset)??new Set<()=>void>();pending.add(paint);listeners.set(asset,pending);
  }
  return()=>{for(const pending of listeners.values())pending.delete(paint);};
}
/** Draw at the bottom of the exterior box, with no stretched or cropped house. */
export function paintDetailedExterior(ctx:CanvasRenderingContext2D,kind:DetailedExteriorKind,width:number,height:number){
  const image=source();if(!image)return false;
  const [sx,sy,sw,sh]=crops[kind],scale=Math.min((width-6)/sw,(height-5)/sh);
  if(scale<=0)return false;
  const dw=sw*scale,dh=sh*scale;
  const sprite=sceneryRaster(image,[sx,sy,sw,sh],dw,dh);if(!sprite)return false;
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite,(width-dw)/2,height-dh-2,dw,dh);
  ctx.restore();return true;
}

/** The playable northeast notch is excluded explicitly, even during asset loading.
 * Three contiguous source panels align the L's turn with the logical cell corner. */
let coldFrameRaster:HTMLCanvasElement|undefined;
export function paintDetailedJoinedObstacle(ctx:CanvasRenderingContext2D,kind:'refuse'|'cold-frame'){
  const image=source('obstacles');if(!image)return false;
  const sprite=kind==='refuse'?sceneryRaster(image,[158,28,296,968],70,229):
    (coldFrameRaster??=createSceneryRaster(160,160,ink=>{
      // Rasterize the complete L once so its three panels meet on one pixel grid.
      ink.drawImage(image,662,140,316,450,3,3,77,77);
      ink.drawImage(image,662,590,316,342,3,80,77,77);
      ink.drawImage(image,978,590,464,342,80,80,77,77);
    }));
  if(!sprite)return false;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.beginPath();
  if(kind==='refuse'){
    ctx.rect(320,0,120,240);ctx.clip();
    ctx.drawImage(sprite,323,6,70,229);
  }else{
    ctx.rect(160,160,80,160);ctx.rect(240,240,80,80);ctx.clip();
    ctx.drawImage(sprite,160,160,160,160);
  }
  ctx.restore();return true;
}

/** A narrow cold-bed wing uses the long arm's intact glazing and stone foot.
 * Its cut side is closed with an iron stile, so there is no floating crop edge. */
export function paintDetailedGardenWall(ctx:CanvasRenderingContext2D,width:number,height:number){
  const image=source('obstacles');if(!image)return false;
  const sprite=sceneryRaster(image,[672,140,306,792],width-16,height-23);if(!sprite)return false;
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite,8,10,width-16,height-23);
  ctx.fillStyle='#344f48';ctx.fillRect(width-10,14,2,height-28);
  ctx.fillStyle='#99afa17a';ctx.fillRect(width-10,15,.5,height-30);
  for(let y=27;y<height-19;y+=31){ctx.fillStyle='#263f39';ctx.fillRect(width-10,y,2,2);ctx.fillStyle='#afafa17a';ctx.fillRect(width-9.5,y,.5,.5);}
  ctx.restore();return true;
}

type Workstation='garden-bench'|'potting-corner'|'alley-supplies'|'market-goods'|'pump-station'|'warehouse-workbench';
const workstations:Record<Workstation,readonly [number,number,number,number]>={
  'garden-bench':[20,60,515,470],
  'potting-corner':[552,84,480,444],
  'alley-supplies':[1058,150,474,384],
  'market-goods':[20,570,517,374],
  'pump-station':[540,562,508,378],
  'warehouse-workbench':[1054,554,472,386],
};
export function paintDetailedWorkstation(ctx:CanvasRenderingContext2D,kind:Workstation,width:number,height:number){
  const image=source('workstations');if(!image)return false;
  const [sx,sy,sw,sh]=workstations[kind],scale=Math.min(width/sw,height/sh),dw=sw*scale,dh=sh*scale;
  const sprite=sceneryRaster(image,[sx,sy,sw,sh],dw,dh);if(!sprite)return false;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(sprite,(width-dw)/2,height-dh,dw,dh);ctx.restore();return true;
}

type Accent='bin'|'crate'|'sacks'|'drain'|'planter'|'broken-pot'|'pipe'|'barrier'|'notice-stall';
// The small legacy accents keep their original 80-unit placement boxes. Only
// their material rendering changes; these are never used for tactical obstacles.
const accentBoxes:Record<Accent,readonly [number,number,number,number]>={
  bin:[12,8,58,59],crate:[10,10,64,58],sacks:[8,18,63,48],
  drain:[10,20,60,51],planter:[10,17,59,48],'broken-pot':[11,20,61,47],
  pipe:[5,22,70,51],barrier:[8,16,68,52],'notice-stall':[4,4,72,66],
};
const accentCrops:Record<Accent,readonly [number,number,number,number]>={
  bin:[77,79,295,355],crate:[452,90,353,357],sacks:[852,113,370,329],
  drain:[46,619,365,171],planter:[441,496,359,316],'broken-pot':[873,533,343,283],
  pipe:[52,943,353,187],barrier:[447,921,358,217],'notice-stall':[858,842,358,333],
};
export function paintDetailedAccent(ctx:CanvasRenderingContext2D,kind:string){
  if(!Object.prototype.hasOwnProperty.call(accentBoxes,kind))return false;
  const image=source('accents');if(!image)return false;
  const key=kind as Accent,[x,y,w,h]=accentBoxes[key],crop=accentCrops[key];
  const scale=Math.min(w/crop[2],h/crop[3]),dw=crop[2]*scale,dh=crop[3]*scale;
  const sprite=sceneryRaster(image,crop,dw,dh);if(!sprite)return false;
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite,x+(w-dw)/2,y+h-dh,dw,dh);ctx.restore();return true;
}

export type DetailedStructureKind='loading-dock'|'vent'|'market-counter'|'market-counter-cloth'
  |'prologue-corner'|'alley-cart'|'market-handcart'|'garden-cart'|'tunnel-pipe'|'warehouse-beam';
const structureCrops:Record<DetailedStructureKind,readonly [number,number,number,number]>={
  'loading-dock':[21,118,506,157],vent:[563,150,445,121],
  'market-counter':[23,358,497,255],'market-counter-cloth':[581,383,415,228],
  'prologue-corner':[32,707,477,178],'alley-cart':[524,709,476,178],
  'market-handcart':[85,938,357,249],'garden-cart':[588,956,403,229],
  'tunnel-pipe':[27,1279,483,164],'warehouse-beam':[542,1284,458,166],
};
/** Complete perimeter and foreground groups retain the original reserved box. */
export function paintDetailedStructure(ctx:CanvasRenderingContext2D,kind:DetailedStructureKind,width:number,height:number,mirror=false){
  const image=source('structures');if(!image||width<=4||height<=4)return false;
  const crop=structureCrops[kind],scale=Math.min((width-4)/crop[2],(height-4)/crop[3]);
  const dw=crop[2]*scale,dh=crop[3]*scale,sprite=sceneryRaster(image,crop,dw,dh);if(!sprite)return false;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
  if(mirror){ctx.translate(width,0);ctx.scale(-1,1);}
  ctx.drawImage(sprite,(width-dw)/2,height-dh-2,dw,dh);ctx.restore();return true;
}

const marketBankCrops:readonly (readonly [number,number,number,number])[]=[
  [37,89,709,399],[788,93,716,336],[37,533,710,412],[790,582,716,329],
];
const marketBankBoxes:readonly (readonly [number,number,number,number])[]=[
  [-32,-32,272,192],[400,-32,272,112],[-32,240,272,192],[400,320,272,112],
];
const marketBankFootprints:readonly (readonly (readonly [number,number])[])[]=[
  [[-32,-32],[240,-32],[240,80],[80,80],[80,160],[-32,160]],
  [[400,-32],[672,-32],[672,80],[400,80]],
  [[-32,240],[80,240],[80,320],[240,320],[240,432],[-32,432]],
  [[400,320],[672,320],[672,432],[400,432]],
];
const marketBankRasters:(HTMLCanvasElement|undefined)[]=[];
function marketRaster(image:HTMLImageElement,index:number){
  if(marketBankRasters[index])return marketBankRasters[index];
  const [sx,sy,sw,sh]=marketBankCrops[index],[,,w,h]=marketBankBoxes[index];
  const raster=index===0||index===2?createSceneryRaster(w,h,ink=>{
    // The generated L's inside turn is registered to the real cell corner.
    // All three panels share one raster, so no independently rounded seam forms.
    const arm=184,turn=index===0?256:153,targetTurn=index===0?112:80;
    ink.drawImage(image,sx,sy,arm,turn,0,0,112,targetTurn);
    ink.drawImage(image,sx,sy+turn,arm,sh-turn,0,targetTurn,112,h-targetTurn);
    if(index===0)ink.drawImage(image,sx+arm,sy,sw-arm,turn,112,0,w-112,targetTurn);
    else ink.drawImage(image,sx+arm,sy+turn,sw-arm,sh-turn,112,targetTurn,w-112,h-targetTurn);
  }):sceneryRaster(image,[sx,sy,sw,sh],w,h);
  if(raster)marketBankRasters[index]=raster;
  return raster;
}
/** Both canvas layers use identical world coordinates and clips, including the
 * two L notches. No generated shadow or counter may cover a playable cell. */
export function hasDetailedMarketBanks(){return !!source('market-banks');}
export function paintDetailedMarketBanks(ctx:CanvasRenderingContext2D){
  const image=source('market-banks');if(!image)return false;
  const sprites=marketBankBoxes.map((_,i)=>marketRaster(image,i));
  if(sprites.some(sprite=>!sprite))return false;
  for(let i=0;i<marketBankBoxes.length;i++){
    const [x,y,w,h]=marketBankBoxes[i],points=marketBankFootprints[i];
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.beginPath();ctx.moveTo(...points[0]);
    for(const point of points.slice(1))ctx.lineTo(...point);
    ctx.closePath();ctx.clip();ctx.drawImage(sprites[i]!,x,y,w,h);ctx.restore();
  }
  return true;
}

type RefinedMaterial='teal-cloth'|'rust-cloth'|'olive-cloth'|'blue-cloth'|'metal'|'wood';
const materialPanels:Record<RefinedMaterial,number>={'teal-cloth':0,'rust-cloth':1,'olive-cloth':2,'blue-cloth':3,metal:4,wood:5};
const materialTiles=new Map<RefinedMaterial,HTMLCanvasElement>();
export function hasRefinedMaterials(){return !!source('materials');}
/** Material pixels use the same world density as the larger scenery. Seams and lights
 * are still drawn by the caller; cached tiles avoid material work each frame. */
export function paintRefinedMaterial(ctx:CanvasRenderingContext2D,kind:RefinedMaterial,x:number,y:number,w:number,h:number,alpha=.35){
  const image=source('materials');if(!image||typeof document==='undefined'||w<=0||h<=0)return;
  let tile=materialTiles.get(kind);
  if(!tile){
    const index=materialPanels[kind],sw=image.naturalWidth/3,sh=image.naturalHeight/2;
    tile=sceneryRaster(image,[(index%3)*sw+3,Math.floor(index/3)*sh+3,sw-6,sh-6],SCENERY_CELL_SIZE,SCENERY_CELL_SIZE);
    if(!tile)return;
    materialTiles.set(kind,tile);
  }
  const pattern=ctx.createPattern(tile,'repeat');if(!pattern)return;
  const pixelSize=SCENERY_CELL_SIZE/tile.width;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.scale(pixelSize,pixelSize);ctx.fillStyle=pattern;ctx.fillRect(0,0,w/pixelSize,h/pixelSize);ctx.restore();
}
