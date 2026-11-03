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
type Asset='exteriors'|'obstacles'|'workstations'|'materials'|'accents'|'structures'|'market-banks'|'back-walls'|'tunnel-fixtures'|'warehouse-fixtures'|'warehouse-pallet-jack'|'warehouse-pipe-cradle'|'warehouse-roll-pallet'|'warehouse-storage-rack'|'tunnel-tools';
const urls:Record<Asset,string>={
  exteriors:new URL('./assets/scene-detailed-residences-garden-v1.png',import.meta.url).href,
  obstacles:new URL('./assets/scene-detailed-obstacles-v1.png',import.meta.url).href,
  workstations:new URL('./assets/scene-detailed-workstations-v1.png',import.meta.url).href,
  'tunnel-tools':new URL('./assets/scene-tunnel-tool-cache-v2.png',import.meta.url).href,
  materials:new URL('./assets/scene-refined-materials-v1.png',import.meta.url).href,
  accents:new URL('./assets/scene-small-accents-v1.png',import.meta.url).href,
  structures:new URL('./assets/scene-perimeter-foreground-v1.png',import.meta.url).href,
  'market-banks':new URL('./assets/scene-market-banks-v1.png',import.meta.url).href,
  'back-walls':new URL('./assets/scene-chapter-backwalls-v1.png',import.meta.url).href,
  'tunnel-fixtures':new URL('./assets/scene-tunnel-fixtures-v3.png',import.meta.url).href,
  'warehouse-fixtures':new URL('./assets/scene-warehouse-fixtures-v4.png',import.meta.url).href,
  'warehouse-pallet-jack':new URL('./assets/scene-warehouse-pallet-jack-v1.png',import.meta.url).href,
  'warehouse-pipe-cradle':new URL('./assets/scene-warehouse-pipe-cradle-v1.png',import.meta.url).href,
  'warehouse-roll-pallet':new URL('./assets/scene-warehouse-roll-pallet-v1.png',import.meta.url).href,
  'warehouse-storage-rack':new URL('./assets/scene-warehouse-storage-rack-v1.png',import.meta.url).href,
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

type AtlasWorkstation='garden-bench'|'potting-corner'|'alley-supplies'|'market-goods'|'warehouse-workbench';
type Workstation=AtlasWorkstation|'tunnel-tools';
const workstations:Record<AtlasWorkstation,readonly [number,number,number,number]>={
  'garden-bench':[20,60,515,470],
  'potting-corner':[552,84,480,444],
  'alley-supplies':[1058,150,474,384],
  'market-goods':[20,570,517,374],
  'warehouse-workbench':[1054,554,472,386],
};
export function paintDetailedWorkstation(ctx:CanvasRenderingContext2D,kind:Workstation,width:number,height:number){
  const image=source(kind==='tunnel-tools'?'tunnel-tools':'workstations');if(!image)return false;
  const [sx,sy,sw,sh]=kind==='tunnel-tools'?[325,181,1257,474]:workstations[kind];
  const scale=Math.min(width/sw,height/sh),dw=sw*scale,dh=sh*scale;
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

export type TunnelFixture='pipe'|'valve'|'cabinet'|'cage'|'service-wall'|'wire-footing';
const tunnelFixtures:Record<TunnelFixture,{crop:readonly [number,number,number,number];box:readonly [number,number,number,number]}>={
  pipe:{crop:[41,184,557,204],box:[5,23,70,38]},
  valve:{crop:[687,95,509,291],box:[5,7,70,56]},
  cabinet:{crop:[117,464,438,325],box:[15,18,50,47]},
  cage:{crop:[745,451,429,340],box:[9,15,62,49]},
  'service-wall':{crop:[18,848,601,338],box:[478,-17,178,94]},
  'wire-footing':{crop:[639,1005,601,181],box:[-18,256,176,66]},
};
/** These are only surfaces inside the existing tunnel fixtures. The empty cage
 * retains alpha between its bars; cats and cleared-wire states stay live. */
export function paintDetailedTunnelFixture(ctx:CanvasRenderingContext2D,kind:TunnelFixture){
  const image=source('tunnel-fixtures');if(!image)return false;
  const {crop,box:[x,y,w,h]}=tunnelFixtures[kind],scale=Math.min(w/crop[2],h/crop[3]);
  const dw=crop[2]*scale,dh=crop[3]*scale,sprite=sceneryRaster(image,crop,dw,dh,'average');
  if(!sprite)return false;
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite,x+(w-dw)/2,y+h-dh,dw,dh);ctx.restore();return true;
}

export type WarehouseFixture='beam-upper'|'beam-lower'|'cargo-upper'|'cargo-lower'|'holding-room'|'cage'|'side-wall'|'rack';
const warehouseFixtures:Record<WarehouseFixture,{crop:readonly [number,number,number,number];box:readonly [number,number,number,number]}>={
  'beam-upper':{crop:[31,70,481,244],box:[-20,-18,178,96]},
  'beam-lower':{crop:[551,97,506,219],box:[-20,15,178,89]},
  'cargo-upper':{crop:[22,370,514,305],box:[-18,2,174,75]},
  'cargo-lower':{crop:[570,408,495,267],box:[-18,2,174,75]},
  'holding-room':{crop:[45,722,632,288],box:[8,7,168,68]},
  cage:{crop:[726,736,299,273],box:[9,21,62,42]},
  'side-wall':{crop:[191,1037,194,384],box:[-21,150,94,258]},
  rack:{crop:[587,1113,326,277],box:[8,8,64,59]},
};
// Trial replacements keep the original atlas and registration available for review.
const warehouseFixtureAlternates:Partial<Record<WarehouseFixture,{asset:Asset;crop:readonly [number,number,number,number]}>>={
  'beam-lower':{asset:'warehouse-roll-pallet',crop:[25,61,1713,788]},
  'side-wall':{asset:'warehouse-storage-rack',crop:[179,34,594,1586]},
};
/** Register the architecture to its existing fixture box before sampling at the
 * shared world density. The cage is separate so winning can remove every bar. */
export function paintDetailedWarehouseFixture(ctx:CanvasRenderingContext2D,kind:WarehouseFixture){
  const alternate=warehouseFixtureAlternates[kind];
  const image=source(alternate?.asset??'warehouse-fixtures');if(!image)return false;
  // Match the greenhouse's one-time detail sampling before crisp pixel scaling.
  const {box:[x,y,w,h]}=warehouseFixtures[kind],crop=alternate?.crop??warehouseFixtures[kind].crop;
  const sprite=sceneryRaster(image,crop,w,h,'average');
  if(!sprite)return false;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(sprite,x,y,w,h);ctx.restore();return true;
}

export type WarehousePerimeterProp='pallet-jack'|'pipe-cradle';
const warehousePerimeterCrops:Record<WarehousePerimeterProp,readonly [number,number,number,number]>={
  'pallet-jack':[202,92,1672,575],
  'pipe-cradle':[74,98,2001,567],
};
/** Distinct exterior activities share the scene's raster density and keep their
 * proportions. The transparent original assets include their contact shadows. */
export function paintDetailedWarehousePerimeter(ctx:CanvasRenderingContext2D,kind:WarehousePerimeterProp,width:number,height:number){
  const image=source(kind==='pallet-jack'?'warehouse-pallet-jack':'warehouse-pipe-cradle');
  if(!image||width<=4||height<=4)return false;
  const crop=warehousePerimeterCrops[kind],scale=Math.min((width-4)/crop[2],(height-4)/crop[3]);
  const dw=crop[2]*scale,dh=crop[3]*scale,sprite=sceneryRaster(image,crop,dw,dh,'average');
  if(!sprite)return false;
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite,(width-dw)/2,height-dh-2,dw,dh);ctx.restore();return true;
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

const backWallRows:Readonly<Record<string,number>>={alley:0,market:1,greenhouse:2,tunnel:3};
/** Wall modules use a stable material raster and their own height, rather than
 * stretching one image across an arbitrary viewport. Only chapters 1–4 opt in. */
export function paintDetailedBackWall(ctx:CanvasRenderingContext2D,scene:string,width:number,height:number){
  if(!Object.prototype.hasOwnProperty.call(backWallRows,scene)||width<=0||height<=0)return false;
  const image=source('back-walls');if(!image)return false;
  const band=image.naturalHeight/4,crop=[0,backWallRows[scene]*band,image.naturalWidth,band] as const;
  const nativeHeight=160,nativeWidth=nativeHeight*crop[2]/crop[3];
  const sprite=sceneryRaster(image,crop,nativeWidth,nativeHeight);if(!sprite)return false;
  const span=height*crop[2]/crop[3],offset=span*[.13,.27,.08,.34][backWallRows[scene]];
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
  for(let x=-offset;x<width;x+=span)ctx.drawImage(sprite,x,0,span,height);
  ctx.restore();return true;
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
