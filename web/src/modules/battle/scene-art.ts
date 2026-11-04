import {paintDetailedSceneProp} from './scene-props';
import {hasIllustratedRoom,whenIllustratedRoomReady} from './illustrated-room';
import {paintTunnelShallowWater} from './scene-tunnel-water';
import {queueImage} from '../../core/image-loading';

/** Battle-owned, deterministic pixel scenery. Geometry and simulation remain in chapter configs. */
export type BattleSceneId = 'prologue' | 'alley' | 'market' | 'greenhouse' | 'tunnel' | 'finale';
export type ScenePropKind = 'bin' | 'crate' | 'sacks' | 'food-stall' | 'toy-stall' | 'notice-stall'
  | 'planter' | 'broken-pot' | 'trellis' | 'drain' | 'pipe' | 'valve' | 'barrier'
  | 'warehouse-crates' | 'storage-rack' | 'cable';
export interface SceneTileFlags {goal?: boolean; obstacle?: boolean; spawn?: boolean; boss?: boolean}

export const SCENE_INK = Object.freeze({label:'#d4e5df', route:'#a4c0c2', selected:'#8ee2cb', danger:'#ff9979', gold:'#f4ce83', enemy:'#273b49', enemyLight:'#92a9b3'});
interface ScenePalette {
  stone: readonly string[]; mortar: string; edge: string; rim: string; water: string;
  moss: string; metal: string; metalLight: string; timber: string; timberLight: string; seed: number;
}
const palettes: Record<BattleSceneId, ScenePalette> = {
  prologue: {stone:['#607b89','#68818b','#5c7481','#6d858c'],mortar:'#344d60',edge:'#172e43',rim:'#a1b3ac',water:'#376478',moss:'#627b5c',metal:'#375369',metalLight:'#809a9b',timber:'#8d6b4d',timberLight:'#d1a465',seed:11},
  alley: {stone:['#536e80','#5c7685','#657e89','#567080'],mortar:'#2d465b',edge:'#142c43',rim:'#93acae',water:'#305b76',moss:'#526e57',metal:'#304e64',metalLight:'#85a3a7',timber:'#846342',timberLight:'#c79c60',seed:29},
  market: {stone:['#867b65','#8f826c','#7b7464','#94846c'],mortar:'#514d43',edge:'#363d3c',rim:'#c5b898',water:'#456f7d',moss:'#617756',metal:'#56675e',metalLight:'#afb3a0',timber:'#8c613f',timberLight:'#ddb575',seed:43},
  greenhouse: {stone:['#8a9079','#939980','#808b76','#9c9d83'],mortar:'#555d4c',edge:'#374e40',rim:'#c4c7a1',water:'#698c81',moss:'#58784e',metal:'#617e6c',metalLight:'#adbea1',timber:'#927252',timberLight:'#ccb284',seed:67},
  tunnel: {stone:['#506a77','#5d7480','#4b6472','#667a82'],mortar:'#293e50',edge:'#142a3b',rim:'#8da8a9',water:'#295771',moss:'#3f685d',metal:'#426576',metalLight:'#8eb3b8',timber:'#77674e',timberLight:'#b59b69',seed:83},
  finale: {stone:['#77736b','#807a6f','#6e6b63','#858074'],mortar:'#484740',edge:'#303635',rim:'#b6b09a',water:'#3e5c70',moss:'#5c7059',metal:'#626b65',metalLight:'#b1b5a3',timber:'#806448',timberLight:'#c6a26c',seed:101},
};
/** Art-only extents anchor the light to the map, including the floor beyond its cells. */
const groundLightExtents:Record<BattleSceneId,readonly [number,number]>={
  prologue:[7,3],alley:[10,5],market:[8,5],greenhouse:[9,6],tunnel:[8,5],finale:[12,7],
};
const block=(ctx:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
const blocks=(ctx:CanvasRenderingContext2D,color:string,shapes:readonly (readonly number[])[])=>{for(const [x,y,w,h] of shapes)block(ctx,color,x,y,w,h);};
const noise=(x:number,y:number,seed:number)=>((Math.imul(x+17,73856093)^Math.imul(y+23,19349663)^Math.imul(seed,83492791))>>>0);
const atlasPanels:Record<BattleSceneId,number>={prologue:0,alley:1,market:2,greenhouse:3,tunnel:4,finale:5};
let floorAtlas:HTMLImageElement|undefined;
const groundTileCache=new Map<string,HTMLCanvasElement>();
const atlasListeners=new Set<()=>void>();
function sceneAtlas(){
  if(!floorAtlas&&typeof Image!=='undefined'){
    floorAtlas=new Image();
    floorAtlas.onload=()=>{groundTileCache.clear();for(const listener of atlasListeners)listener();atlasListeners.clear();};
    floorAtlas.onerror=()=>atlasListeners.clear();
    void queueImage(floorAtlas,new URL('./assets/floor-material-atlas.png',import.meta.url).href);
  }
  return floorAtlas?.complete&&floorAtlas.naturalWidth>0?floorAtlas:undefined;
}
/** L00 can wait on a teaching step: repaint on asset load without advancing its simulation. */
export function whenSceneArtReady(paint:()=>void){
  const stopRoom=whenIllustratedRoomReady(paint);
  if(floorAtlas?.complete&&floorAtlas.naturalWidth>0)return stopRoom;
  atlasListeners.add(paint);return()=>{atlasListeners.delete(paint);stopRoom();};
}

/** Pixel light pools use nested flat shapes rather than blurring the tactical board. */
function lightPool(ctx:CanvasRenderingContext2D,x:number,y:number,strength=1){
  ctx.save();ctx.globalAlpha=.07*strength;
  blocks(ctx,'#ffce79',[[x-28,y-18,56,36],[x-20,y-26,40,52]]);
  ctx.globalAlpha=.12*strength;blocks(ctx,'#ffdb93',[[x-19,y-13,38,26],[x-12,y-20,24,40]]);
  ctx.restore();
}

/** A few authored clusters describe the material; seeded variation avoids per-frame shimmer. */
function paintMaterialAccents(ctx:CanvasRenderingContext2D,scene:BattleSceneId,p:ScenePalette,x:number,y:number,n:number){
  const worn=8+n%15;
  // Broken grout and small bevels read as worked stone, rather than uniform UI squares.
  blocks(ctx,p.edge+'38',[[worn,5,8,1],[worn+6,6,3,1],[64,56+n%8,1,5]]);
  blocks(ctx,p.rim+'4d',[[worn+1,4,6,1],[65,55+n%8,1,4]]);
  if(scene==='prologue'||scene==='alley'){
    if(n%3===0){
      const px=8+n%9,py=56+n%7;
      blocks(ctx,p.edge+'66',[[px,py,31,3],[px+5,py-3,23,3],[px+4,py+3,23,2]]);
      blocks(ctx,p.water+'a0',[[px+2,py,27,2],[px+7,py-2,18,2],[px+8,py+2,15,2]]);
      blocks(ctx,'#bdd6cf70',[[px+5,py,9,1],[px+18,py+2,5,1]]);
      if(scene==='prologue')blocks(ctx,'#a8c7cb55',[[px+10,py-4,5,1],[px+8,py-3,2,1],[px+15,py-3,2,1]]);
    }
    if(n%4===0){
      blocks(ctx,'#2b444744',[[4,14,3,10],[7,17,3,4],[66,66,7,3]]);
      blocks(ctx,p.moss+'70',[[5,17,2,4],[8,19,2,2],[67,65,4,2]]);
    }
    // A warm window reflection is local and sparse, preserving the cool alley palette.
    if(scene==='prologue'&&(x+y)%5===0)blocks(ctx,'#d6bb7d24',[[49,9,11,2],[46,12,18,1],[51,15,8,1]]);
  }else if(scene==='market'){
    if(n%3===0){
      blocks(ctx,'#d1bb8c38',[[9,64,17,1],[12,67,9,1],[59,12,9,1]]);
      blocks(ctx,'#64574550',[[11,62,11,1],[61,14,6,1]]);
    }
    if(n%5===0){
      blocks(ctx,'#856748',[[65,62,4,3],[66,61,2,1]]);
      blocks(ctx,'#c5ad77',[[65,62,3,1],[66,63,1,1]]);
    }
    if(n%4===1)blocks(ctx,'#b18b5b28',[[7,8,22,3],[11,11,16,2]]);
  }else if(scene==='greenhouse'){
    blocks(ctx,p.edge+'40',[[4,58,2,13],[6,67,12,2],[66,8,7,2]]);
    blocks(ctx,p.moss+'a0',[[5,61,3,6],[7,66,7,2],[13,68,5,2],[66,9,5,2],[69,11,3,3]]);
    blocks(ctx,'#a4b28090',[[6,61,2,2],[9,66,3,1],[69,10,2,1]]);
    if(n%3===0){
      // Glass fragments stay at the perimeter; never resemble a target or an extra tile.
      blocks(ctx,'#bdd3c650',[[57,61,8,1],[61,58,1,4],[62,63,6,1]]);
      blocks(ctx,'#e1ead275',[[59,60,3,1],[65,63,2,1]]);
    }
    if((x+y)%4===0){
      blocks(ctx,'#e4dfb31c',[[7,14,64,8],[11,22,55,5]]);
      blocks(ctx,'#314d4423',[[55,5,2,68],[5,35,68,2]]);
    }
    if(n%5===1)blocks(ctx,'#b19169a0',[[12,14,4,2],[15,16,3,1]]);
  }else if(scene==='tunnel'){
    if(n%3===0){
      blocks(ctx,'#173d4d70',[[8,64,28,3],[12,61,21,3],[14,67,18,2]]);
      blocks(ctx,p.water+'a0',[[10,64,23,2],[15,62,14,2]]);
      blocks(ctx,'#91b4b366',[[13,64,10,1],[27,66,4,1]]);
    }
    if(n%4===0){
      blocks(ctx,'#abb7a353',[[61,8,1,8],[64,10,1,5],[59,18,7,1]]);
      blocks(ctx,'#69836a70',[[6,47,2,13],[7,59,5,2]]);
    }
    if(n%5===0)blocks(ctx,'#b08b665c',[[67,39,3,2],[66,42,2,3],[68,47,1,2]]);
  }else{
    // Warehouse expansion seams have fasteners and rubbed edges, not wet moss.
    if(x%3===0){
      block(ctx,'#303a3c70',7,4,3,72);block(ctx,'#b1aa8b66',7,5,1,68);
      for(const yy of [15,62]){block(ctx,'#263337b0',7,yy,3,3);block(ctx,'#c2b999a0',7,yy,2,1);}
    }
    if(n%3===1){
      blocks(ctx,'#303b3b55',[[52,56,2,5],[54,60,7,1],[59,61,1,5],[60,65,7,1]]);
      blocks(ctx,'#b2ab8a40',[[55,59,6,1],[61,64,5,1]]);
    }
    if(n%4===0)blocks(ctx,'#d0b98b35',[[12,66,17,1],[15,68,9,1],[59,12,9,1]]);
  }
}

/** Sample the same broad ellipse in world coordinates on both canvas layers.
 * The ellipse has no knowledge of CELLS, so no lighting edge follows the map mask. */
function paintGroundLight(ctx:CanvasRenderingContext2D,scene:BattleSceneId,x:number,y:number){
  const p=palettes[scene],[columns,rows]=groundLightExtents[scene];
  const radiusX=columns*80*.8,radiusY=rows*80*.95,stretchY=radiusY/radiusX;
  const centerX=(columns/2-x)*80,centerY=(rows/2-y)*80/stretchY;
  ctx.save();ctx.scale(1,stretchY);
  const light=ctx.createRadialGradient(centerX,centerY,0,centerX,centerY,radiusX);
  light.addColorStop(0,p.rim+'12');
  light.addColorStop(.3,p.rim+'09');
  light.addColorStop(.58,p.edge+'00');
  light.addColorStop(.82,p.edge+'25');
  light.addColorStop(1,p.edge+'64');
  ctx.fillStyle=light;ctx.fillRect(0,0,80,80/stretchY);
  ctx.restore();
}

/** One continuous material surface shared by tactical cells and the environment. */
function paintGround(ctx:CanvasRenderingContext2D,scene:BattleSceneId,x:number,y:number,accents=true){
  const p=palettes[scene],n=noise(x,y,p.seed),atlas=sceneAtlas();
  block(ctx,p.mortar,0,0,80,80);
  if(atlas){
    const panel=atlasPanels[scene],pw=atlas.naturalWidth/3,ph=atlas.naturalHeight/2;
    const wrap=(value:number)=>((value%4)+4)%4;
    const sx=(panel%3)*pw+wrap(x)*pw/4,sy=Math.floor(panel/3)*ph+wrap(y)*ph/4;
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(atlas,sx,sy,pw/4,ph/4,0,0,80,80);
    block(ctx,p.stone[n%4]+'40',0,0,80,80);
  }else{
    ctx.save();ctx.beginPath();ctx.rect(0,0,80,80);ctx.clip();
    const rowHeight=scene==='finale'?38:scene==='greenhouse'?25:18;
    const brickWidth=scene==='finale'?76:scene==='greenhouse'||scene==='market'?38:27;
    for(let row=0;row<5;row++)for(let col=-1;col<4;col++){
      const bx=col*brickWidth+(row%2?brickWidth/2:0),by=row*rowHeight;
      const index=noise(x*5+col,y*5+row,p.seed)%4;
      block(ctx,p.stone[index],bx+1,by+1,brickWidth-1,rowHeight-1);
      block(ctx,p.rim+'45',bx+2,by+1,brickWidth-3,1);
      block(ctx,p.edge+'4d',bx+2,by+rowHeight-1,brickWidth-2,1);
    }
    ctx.restore();
  }
  if(accents)paintMaterialAccents(ctx,scene,p,x,y,n);
  if(scene==='tunnel'&&accents)paintTunnelShallowWater(ctx,x,y);
  paintGroundLight(ctx,scene,x,y);
}

/** The terrain grid follows the board origin and its actual CSS cell scale, even when scrolled. */
export function paintSceneGround(ctx:CanvasRenderingContext2D,scene:BattleSceneId,originX:number,originY:number,cellWidth:number,cellHeight:number,width:number,height:number){
  if(cellWidth<=0||cellHeight<=0)return;
  const x0=Math.floor(-originX/cellWidth),x1=Math.ceil((width-originX)/cellWidth);
  const y0=Math.floor(-originY/cellHeight),y1=Math.ceil((height-originY)/cellHeight);
  const cacheLimit=Math.max(384,(x1-x0)*(y1-y0));
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    // Match the tactical canvas's two-stage nearest-neighbour sampling: first
    // rasterize to its native 80/100px cell, then scale to the CSS cell bounds.
    const key=scene+':'+x+':'+y;
    let tile=groundTileCache.get(key);
    if(!tile&&typeof document!=='undefined'){
      tile=document.createElement('canvas');tile.width=tile.height=scene==='prologue'?100:80;
      const groundCtx=tile.getContext('2d');
      if(groundCtx){groundCtx.scale(tile.width/80,tile.height/80);paintGround(groundCtx,scene,x,y);groundTileCache.set(key,tile);}
    }
    if(tile){
      // Keep this frame's working set even when small cells exceed 384 samples.
      groundTileCache.delete(key);groundTileCache.set(key,tile);
      ctx.imageSmoothingEnabled=false;ctx.drawImage(tile,originX+x*cellWidth,originY+y*cellHeight,cellWidth,cellHeight);
    }
    else {ctx.save();ctx.translate(originX+x*cellWidth,originY+y*cellHeight);ctx.scale(cellWidth/80,cellHeight/80);paintGround(ctx,scene,x,y);ctx.restore();}
  }
  while(groundTileCache.size>cacheLimit)groundTileCache.delete(groundTileCache.keys().next().value!);
}

export function paintSceneTile(ctx:CanvasRenderingContext2D,scene:BattleSceneId,x:number,y:number,size:number,flags:SceneTileFlags={}){
  const p=palettes[scene];
  ctx.save();ctx.translate(x*size,y*size);ctx.scale(size/80,size/80);
  const illustrated=scene==='finale'&&hasIllustratedRoom();
  if(!illustrated)paintGround(ctx,scene,x,y,!flags.goal&&!flags.obstacle&&!flags.spawn);
  // The usable paving is a little quieter and lighter than the service floor.
  // Its material remains shared; broad bevels and real masonry outside mark its extent.
  block(ctx,illustrated?'#b1b7a720':p.stone[(x+y)%4]+'22',0,0,80,80);
  if(illustrated){
    block(ctx,'#15232ec0',0,78,80,2);block(ctx,'#15232ea0',78,0,2,78);
    block(ctx,'#c2d1d08c',0,0,78,1.5);block(ctx,'#c2d1d070',0,1.5,1.5,76.5);
  }else{
    block(ctx,p.edge+'c0',0,78,80,2);block(ctx,p.edge+'a8',78,0,2,78);
    block(ctx,p.rim+'c0',0,0,78,1.5);block(ctx,p.rim+'98',0,1.5,1.5,76.5);
  }
  if(flags.obstacle){
    // Ambient contact stays under the prop's feet; the rest is ordinary floor.
    blocks(ctx,p.edge+'0c',[[8,58,64,10],[14,68,52,5]]);
    blocks(ctx,p.edge+'12',[[14,60,52,8],[21,68,38,3]]);
    block(ctx,p.edge+'18',21,62,38,5);
  }
  if(flags.goal){
    lightPool(ctx,40,40,2);
    block(ctx,'#bca06c66',6,6,68,68);
    blocks(ctx,'#263e3a80',[[9,9,62,2],[9,11,2,58]]);
    blocks(ctx,'#dfc99370',[[13,67,54,1],[67,13,1,54]]);
    ctx.strokeStyle='#f2cf8d';ctx.lineWidth=2;ctx.strokeRect(6,6,68,68);
    blocks(ctx,'#ffe2a4',[[5,5,12,3],[5,5,3,12],[63,5,12,3],[72,5,3,12],[5,72,12,3],[5,63,3,12],[63,72,12,3],[72,63,3,12]]);
  }
  if(flags.spawn){
    // Recessed entrance lining stays inside the existing red frame and under its arrow.
    block(ctx,'#141f30bc',7,7,66,66);
    blocks(ctx,p.edge,[[9,9,62,4],[9,13,4,55],[13,68,56,3]]);
    blocks(ctx,p.mortar,[[13,13,5,48],[62,13,6,48],[18,13,44,4]]);
    blocks(ctx,p.rim+'80',[[13,13,4,1],[18,13,20,1],[42,13,20,1],[62,14,1,9],[13,29,4,1],[13,45,4,1],[63,29,5,1],[63,45,5,1]]);
    blocks(ctx,'#ad756064',[[19,18,2,35],[60,18,2,35],[19,64,43,2]]);
    blocks(ctx,'#101c2b66',[[24,20,32,5],[22,25,36,28]]);
  }
  ctx.restore();
}

/** Worn ground-level boundary, with no metal rim or raised platform thickness. */
export function paintSceneEdge(ctx:CanvasRenderingContext2D,scene:BattleSceneId,x:number,y:number,size:number,exists:(x:number,y:number)=>boolean){
  if(scene==='finale'&&hasIllustratedRoom())return;
  const p=palettes[scene],n=noise(x,y,p.seed);
  ctx.save();ctx.translate(x*size,y*size);ctx.scale(size/80,size/80);
  const joint=p.edge+'85',worn=p.rim+'60';
  if(!exists(x,y-1)){block(ctx,joint,0,0,80,1);block(ctx,worn,12+n%28,1,23,1);}
  if(!exists(x-1,y)){block(ctx,joint,0,0,1,80);block(ctx,worn,1,16+n%24,1,19);}
  if(!exists(x+1,y)){block(ctx,joint,79,0,1,80);block(ctx,p.mortar+'50',78,28+n%17,1,15);}
  if(!exists(x,y+1)){block(ctx,joint,0,79,80,1);block(ctx,p.mortar+'60',23+n%19,78,21,1);}
  ctx.restore();
}

/** Detailed props share one local 80px drawing space across maps and their backdrops. */
export function paintSceneProp(ctx:CanvasRenderingContext2D,scene:BattleSceneId,kind:ScenePropKind,x:number,y:number,size:number,index=0){
  ctx.save();ctx.translate(x,y);ctx.scale(size/80,size/80);ctx.imageSmoothingEnabled=false;
  paintDetailedSceneProp(ctx,palettes[scene],kind,index);
  ctx.restore();
}
