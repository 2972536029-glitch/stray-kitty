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
const block=(ctx:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
const blocks=(ctx:CanvasRenderingContext2D,color:string,shapes:readonly (readonly number[])[])=>{for(const [x,y,w,h] of shapes)block(ctx,color,x,y,w,h);};
const noise=(x:number,y:number,seed:number)=>((Math.imul(x+17,73856093)^Math.imul(y+23,19349663)^Math.imul(seed,83492791))>>>0);
const atlasPanels:Record<BattleSceneId,number>={prologue:0,alley:1,market:2,greenhouse:3,tunnel:4,finale:5};
let floorAtlas:HTMLImageElement|undefined;
const atlasListeners=new Set<()=>void>();
function sceneAtlas(){
  if(!floorAtlas&&typeof Image!=='undefined'){
    floorAtlas=new Image();
    floorAtlas.onload=()=>{for(const listener of atlasListeners)listener();atlasListeners.clear();};
    floorAtlas.onerror=()=>atlasListeners.clear();
    floorAtlas.src=new URL('./assets/floor-material-atlas.png',import.meta.url).href;
  }
  return floorAtlas?.complete&&floorAtlas.naturalWidth>0?floorAtlas:undefined;
}
/** L00 can wait on a teaching step: repaint on asset load without advancing its simulation. */
export function whenSceneArtReady(paint:()=>void){
  if(sceneAtlas())return()=>{};
  atlasListeners.add(paint);return()=>{atlasListeners.delete(paint);};
}

/** Pixel light pools use nested flat shapes rather than blurring the tactical board. */
function lightPool(ctx:CanvasRenderingContext2D,x:number,y:number,strength=1){
  ctx.save();ctx.globalAlpha=.07*strength;
  blocks(ctx,'#ffce79',[[x-28,y-18,56,36],[x-20,y-26,40,52]]);
  ctx.globalAlpha=.12*strength;blocks(ctx,'#ffdb93',[[x-19,y-13,38,26],[x-12,y-20,24,40]]);
  ctx.restore();
}

export function paintSceneTile(ctx:CanvasRenderingContext2D,scene:BattleSceneId,x:number,y:number,size:number,flags:SceneTileFlags={}){
  const p=palettes[scene],n=noise(x,y,p.seed),atlas=sceneAtlas();
  ctx.save();ctx.translate(x*size,y*size);ctx.scale(size/80,size/80);
  block(ctx,p.mortar,0,0,80,80);
  // Staggered masonry is clipped locally so it cannot invent an extra tile.
  if(!atlas){
  ctx.save();ctx.beginPath();ctx.rect(2,2,76,76);ctx.clip();
  const rowHeight=scene==='finale'?38:scene==='greenhouse'?25:scene==='tunnel'?18:18;
  const brickWidth=scene==='finale'?76:scene==='greenhouse'?38:scene==='market'?38:27;
  for(let row=0;row<5;row++)for(let col=-1;col<4;col++){
    const bx=col*brickWidth+(row%2?brickWidth/2:0),by=row*rowHeight;
    const index=noise(x*5+col,y*5+row,p.seed)%4;
    block(ctx,p.stone[index],bx+2,by+2,brickWidth-2,rowHeight-2);
    block(ctx,p.rim+'45',bx+3,by+2,brickWidth-4,1);
    block(ctx,p.edge+'4d',bx+3,by+rowHeight-2,brickWidth-3,1);
    if(index===0)block(ctx,p.rim+'2b',bx+8,by+7,5,2);
  }
  ctx.restore();
  }
  if(atlas){
    const panel=atlasPanels[scene],pw=atlas.naturalWidth/3,ph=atlas.naturalHeight/2;
    const sx=(panel%3)*pw+(x%4)*pw/4,sy=Math.floor(panel/3)*ph+(y%4)*ph/4;
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(atlas,sx,sy,pw/4,ph/4,2,2,76,76);
    // Quiet the ground under units and keep the same tactical contrast in every chapter.
    block(ctx,p.stone[n%4]+'40',2,2,76,76);
  }
  // Shared pixel technique, chapter-specific materials. Rain is a story fact only in the alley.
  if(!atlas&&!flags.goal&&!flags.obstacle){
    if(n%3===0&&(scene==='prologue'||scene==='alley')){
      const px=10+(n%3)*8,py=48+(n%2)*7;
      blocks(ctx,p.water,[[px,py,30,4],[px+5,py-3,22,3],[px+3,py+4,24,3]]);
      blocks(ctx,'#9ac5d366',[[px+4,py,12,1],[px+19,py+4,5,1]]);
    }
    if(scene==='greenhouse'||(scene==='tunnel'&&n%5===0)){
      blocks(ctx,p.moss,[[5,64,9,3],[7,60,3,4],[12,66,7,2],[67,10,6,2],[70,7,2,4]]);
      block(ctx,'#a6b88955',9,61,2,2);
    }
    if(scene==='finale'&&n%3===0){
      block(ctx,'#c9ad704d',6,7,24,2);block(ctx,'#c9ad704d',6,7,2,12);
      blocks(ctx,p.edge+'66',[[51,52,14,2],[61,48,2,5],[65,54,7,2]]);
    }
    if(scene==='market'&&n%4===0){
      blocks(ctx,'#c3ad7970',[[54,59,5,3],[56,57,2,2],[14,24,2,2]]);
      block(ctx,'#4c514a',55,59,2,1);
    }
    if(scene==='greenhouse'){
      // Broken skylight: quiet, fixed patches of diffuse light, without inventing a time of day.
      blocks(ctx,'#e2dfaf18',[[5,12,70,16],[11,28,60,9]]);
      if((x+y)%3===0)blocks(ctx,'#435a4435',[[53,3,3,73],[2,32,75,3]]);
      if(n%4===0)blocks(ctx,'#b5967270',[[58,58,9,3],[64,62,5,3]]);
    }
    if(scene==='tunnel'&&n%4===0){
      blocks(ctx,p.water,[[7,62,29,3],[10,65,20,2]]);block(ctx,'#91b6b358',12,62,13,1);
    }
    if(scene==='finale'){
      blocks(ctx,'#c6baa524',[[11,15,2,2],[56,20,3,2],[21,62,3,1],[63,67,2,2]]);
      if(x%3===0){block(ctx,'#3c403c75',7,4,3,72);blocks(ctx,'#b3ab8855',[[7,17,2,3],[7,62,2,3]]);}
    }
  }
  block(ctx,p.edge+'b0',0,77,80,3);block(ctx,p.edge+'80',77,0,3,77);
  block(ctx,p.rim+'80',2,2,75,1);block(ctx,p.rim+'42',2,3,1,74);
  if(flags.obstacle){
    block(ctx,p.edge+'80',4,5,72,70);
    blocks(ctx,'#d8ad6766',[[6,7,9,2],[6,7,2,9],[65,7,9,2],[72,7,2,9]]);
  }
  if(flags.goal){
    lightPool(ctx,40,40,2);
    block(ctx,'#bca06c66',6,6,68,68);
    ctx.strokeStyle='#f2cf8d';ctx.lineWidth=2;ctx.strokeRect(6,6,68,68);
    blocks(ctx,'#ffe2a4',[[5,5,12,3],[5,5,3,12],[63,5,12,3],[72,5,3,12],[5,72,12,3],[5,63,3,12],[63,72,12,3],[72,63,3,12]]);
  }
  if(flags.spawn){
    block(ctx,'#181e38aa',7,7,66,66);
    blocks(ctx,'#a7766955',[[10,10,60,3],[10,66,60,3]]);
  }
  ctx.restore();
}

/** Raised perimeter sits inside existing cells; holes retain alpha=0 in the main canvas. */
export function paintSceneEdge(ctx:CanvasRenderingContext2D,scene:BattleSceneId,x:number,y:number,size:number,exists:(x:number,y:number)=>boolean){
  const p=palettes[scene];ctx.save();ctx.translate(x*size,y*size);ctx.scale(size/80,size/80);
  if(!exists(x,y-1)){block(ctx,p.edge,0,0,80,5);block(ctx,p.rim,2,5,76,2);for(let k=0;k<4;k++)block(ctx,p.rim+'66',k*20+4,1,12,1);}
  if(!exists(x-1,y)){block(ctx,p.edge,0,0,5,80);block(ctx,p.rim+'a0',5,5,2,70);}
  if(!exists(x+1,y)){block(ctx,p.edge,75,0,5,80);block(ctx,p.mortar,72,5,3,72);for(let k=0;k<4;k++)block(ctx,p.rim+'66',76,k*20+4,2,12);}
  if(!exists(x,y+1)){block(ctx,p.mortar,0,72,80,3);block(ctx,p.edge,0,75,80,5);for(let k=0;k<4;k++)block(ctx,p.rim+'66',k*20+3,76,13,2);}
  ctx.restore();
}

function lantern(ctx:CanvasRenderingContext2D,x:number,y:number,red=false){
  lightPool(ctx,x+5,y+12,1.6);
  blocks(ctx,'#253548',[[x+3,y-4,4,6],[x-1,y+1,12,3],[x-1,y+20,12,3],[x-2,y+5,2,14],[x+10,y+5,2,14]]);
  block(ctx,red?'#c55a43':'#e6ae58',x,y+4,10,16);
  block(ctx,red?'#ffad68':'#ffe7a4',x+3,y+6,4,12);
  block(ctx,'#fff3c4',x+4,y+7,2,7);
  block(ctx,'#a67a48',x+4,y+23,2,5);
}
function crate(ctx:CanvasRenderingContext2D,p:ScenePalette,x:number,y:number,w=31,h=28){
  block(ctx,'#202e3b',x-2,y-2,w+4,h+4);
  block(ctx,p.timber,x,y,w,h);block(ctx,p.timberLight,x,y,w,4);
  for(let k=8;k<w-3;k+=8){block(ctx,'#3e3b354f',x+k,y+5,1,h-7);block(ctx,p.timberLight+'55',x+k+2,y+5,1,h-7);}
  block(ctx,'#4d4438',x,y+h-4,w,4);block(ctx,p.timberLight,x+2,y+5,3,h-10);block(ctx,p.timberLight,x+w-5,y+5,3,h-10);
  for(let k=0;k<Math.min(w-10,h-8);k+=3)block(ctx,p.timberLight,x+6+k,y+5+k,4,4);
  blocks(ctx,'#2c3640',[[x+3,y+1,2,2],[x+w-5,y+1,2,2],[x+3,y+h-3,2,2],[x+w-5,y+h-3,2,2]]);
}
function leaves(ctx:CanvasRenderingContext2D,x:number,y:number,tint=0){
  blocks(ctx,tint?'#365b4e':'#356252',[[x-11,y,12,6],[x+3,y-7,12,6],[x-4,y-13,8,10],[x-13,y+8,12,5],[x+2,y+4,14,6]]);
  blocks(ctx,tint?'#76966c':'#7da57b',[[x-10,y,7,2],[x+4,y-7,8,2],[x-3,y-13,3,6],[x+4,y+4,7,2]]);
  block(ctx,'#b0bd8555',x+1,y,2,10);
}
function pot(ctx:CanvasRenderingContext2D,x:number,y:number,small=false){
  const w=small?14:22,h=small?12:18;
  block(ctx,'#40363a',x-2,y-2,w+4,h+3);block(ctx,'#c78e62',x,y,w,4);
  block(ctx,'#a96f53',x+2,y+4,w-4,h-4);block(ctx,'#e5ad77',x+3,y+4,3,h-6);
  block(ctx,'#6c4c46',x+w-5,y+4,3,h-4);block(ctx,'#443c3b',x+3,y-1,w-6,3);
}
function stall(ctx:CanvasRenderingContext2D,p:ScenePalette,kind:ScenePropKind,index:number){
  const food=kind==='food-stall',toy=kind==='toy-stall';
  const roof=food?'#9e514a':toy?'#3d787e':'#586953',roofLight=food?'#d17a57':toy?'#71a8a0':'#a7a575';
  block(ctx,'#203345',8,17,64,45);
  blocks(ctx,p.timber,[[11,12,4,51],[65,12,4,51],[14,44,51,18]]);
  block(ctx,p.timberLight,13,43,54,4);for(let k=0;k<6;k++)block(ctx,'#5b473c',17+k*8,49,2,11);
  block(ctx,'#263846',8,12,64,6);block(ctx,roof,11,6,58,10);block(ctx,roofLight,14,6,52,3);
  for(let k=0;k<7;k++){const xx=8+k*9;block(ctx,k%2?'#d4c49a':roof,xx,17,9,9);block(ctx,k%2?'#f1dca9':roofLight,xx,17,9,3);block(ctx,k%2?'#9e977e':'#493e3d',xx,26,8,3);}
  block(ctx,p.timberLight,16,32,3,10);block(ctx,p.timberLight,61,31,3,11);
  if(food){
    blocks(ctx,'#bac5b1',[[23,36,14,5],[20,34,5,9],[38,38,12,4],[49,36,4,8]]);block(ctx,'#273f4f',33,37,2,2);
    block(ctx,'#ce9556',52,37,9,5);block(ctx,'#e8c888',54,35,5,3);
  }else if(toy){
    blocks(ctx,'#b88777',[[23,34,9,9],[25,32,5,13]]);blocks(ctx,'#dbc092',[[25,35,6,2],[27,33,2,9]]);
    blocks(ctx,'#9bbab5',[[40,35,15,7],[53,32,5,12],[40,33,4,3]]);
  }else{
    block(ctx,'#c8b286',21,32,17,11);block(ctx,'#f2ddb0',23,31,13,10);block(ctx,'#557176',25,34,8,1);block(ctx,'#557176',25,37,6,1);
    block(ctx,'#f0d9ab',43,30,13,13);blocks(ctx,'#6a7769',[[45,33,8,1],[45,36,7,1],[45,39,5,1]]);
  }
  lantern(ctx,index%2?61:6,30,true);
}

/** Detailed obstacles fit their existing reserved cells and carry no gameplay behavior. */
export function paintSceneProp(ctx:CanvasRenderingContext2D,scene:BattleSceneId,kind:ScenePropKind,x:number,y:number,size:number,index=0){
  const p=palettes[scene];ctx.save();ctx.translate(x,y);ctx.scale(size/80,size/80);ctx.imageSmoothingEnabled=false;
  blocks(ctx,'#102b3c88',[[10,58,60,7],[17,65,46,3]]);
  if(kind.endsWith('stall'))stall(ctx,p,kind,index);
  else if(kind==='crate'){
    crate(ctx,p,14,29,39,32);crate(ctx,p,38,15,25,23);lantern(ctx,60,34);
  }else if(kind==='warehouse-crates'){
    crate(ctx,p,9,34,31,28);crate(ctx,p,40,30,30,32);crate(ctx,p,24,10,31,26);
    block(ctx,'#ded2a4',29,17,13,8);blocks(ctx,'#657b80',[[31,19,8,1],[31,22,5,1]]);
  }else if(kind==='bin'){
    blocks(ctx,'#263a4a',[[17,19,35,43],[13,17,43,6],[20,12,29,5],[28,8,14,4]]);
    block(ctx,p.metal,20,23,29,35);block(ctx,p.metalLight,19,23,5,33);
    for(let k=0;k<3;k++)block(ctx,'#283f4a',29+k*7,26,2,27);
    block(ctx,'#abc0b1',18,18,33,3);block(ctx,'#c7a46a',29,32,10,12);block(ctx,'#747966',31,35,6,2);
    blocks(ctx,'#87937f',[[53,47,12,12],[55,44,8,4]]);block(ctx,'#b0b595',55,46,3,8);
  }else if(kind==='sacks'){
    blocks(ctx,'#9a865f',[[11,41,29,19],[15,31,20,13],[20,23,10,9],[37,38,30,23],[42,26,21,14],[47,20,9,7]]);
    blocks(ctx,'#d0ba85',[[16,36,6,18],[44,31,6,24],[15,56,20,3],[43,57,19,3]]);
    blocks(ctx,'#5c6454',[[19,30,13,3],[46,25,12,3],[34,47,3,12]]);block(ctx,p.moss,8,60,18,3);
  }else if(kind==='planter'){
    pot(ctx,12,40);leaves(ctx,23,33);pot(ctx,43,44);leaves(ctx,54,36,1);
    blocks(ctx,'#d7b287',[[18,21,4,4],[21,18,4,4],[24,21,4,4],[21,24,4,4]]);block(ctx,'#f9df9d',21,21,3,3);
  }else if(kind==='broken-pot'){
    pot(ctx,13,39);leaves(ctx,24,32);blocks(ctx,'#b6825a',[[41,46,22,11],[38,53,10,6],[51,40,8,7],[62,55,8,5]]);
    blocks(ctx,'#e0b07b',[[43,46,16,3],[53,40,4,3],[63,55,5,2]]);blocks(ctx,'#3d4d43',[[45,51,12,5],[50,47,5,3]]);
    blocks(ctx,'#a4c3b655',[[43,30,13,2],[54,26,3,7]]);
  }else if(kind==='trellis'){
    block(ctx,'#273e42',11,8,58,55);block(ctx,p.metal,15,11,50,48);block(ctx,'#294749',19,15,42,40);
    for(let k=0;k<4;k++){block(ctx,p.metalLight,19+k*13,12,2,46);block(ctx,p.metalLight,16,17+k*12,48,2);}
    blocks(ctx,'#aed1c349',[[22,20,8,6],[35,33,10,7],[49,21,8,7]]);
    leaves(ctx,23,20,1);leaves(ctx,54,42);pot(ctx,19,50,true);
  }else if(kind==='drain'){
    blocks(ctx,p.metal,[[13,23,54,35],[18,18,44,5],[18,58,44,4]]);block(ctx,'#142e40',18,27,44,25);
    for(let k=0;k<6;k++)block(ctx,p.metalLight,21+k*7,28,3,23);
    block(ctx,'#c3b68a',17,22,46,2);blocks(ctx,p.water,[[17,62,42,3],[25,67,22,2]]);
  }else if(kind==='pipe'||kind==='valve'){
    blocks(ctx,'#21394a',[[6,29,68,28],[14,21,8,40],[58,21,8,40]]);
    block(ctx,p.metal,9,33,62,20);block(ctx,p.metalLight,11,34,59,5);block(ctx,'#284856',10,49,61,5);
    blocks(ctx,p.metalLight,[[15,24,5,33],[59,24,5,33]]);blocks(ctx,'#e0c98c',[[16,27,2,3],[16,51,2,3],[60,27,2,3],[60,51,2,3]]);
    if(kind==='valve'){
      block(ctx,p.metalLight,37,18,7,18);
      blocks(ctx,'#b87751',[[27,10,27,5],[22,15,5,17],[27,32,27,5],[54,15,5,17]]);
      blocks(ctx,'#f0bc6e',[[28,10,23,2],[23,16,2,13],[38,14,5,19],[27,21,27,4]]);
    }else{
      blocks(ctx,'#223b48',[[33,32,7,23],[37,37,9,10]]);block(ctx,'#b99f6a',41,43,4,3);
      blocks(ctx,p.water,[[34,61,9,2],[40,65,16,2],[36,69,23,2]]);
    }
  }else if(kind==='storage-rack'){
    blocks(ctx,'#213347',[[9,9,62,56],[12,64,5,4],[63,64,5,4]]);
    block(ctx,p.metal,12,12,56,49);
    for(const sy of [13,36,60]){block(ctx,p.metalLight,12,sy,56,3);block(ctx,'#24394a',14,sy+3,52,2);}
    blocks(ctx,p.metalLight,[[12,12,4,51],[64,12,4,51]]);crate(ctx,p,19,17,20,17);crate(ctx,p,42,39,18,19);
    blocks(ctx,'#a19676',[[45,22,13,10],[21,45,15,13]]);blocks(ctx,'#d2c295',[[46,21,11,3],[22,44,13,3]]);
  }else if(kind==='cable'){
    blocks(ctx,p.timberLight,[[14,27,8,33],[58,27,8,33],[20,30,40,6],[20,54,40,5]]);
    block(ctx,'#223443',23,24,33,35);block(ctx,'#4d6470',26,25,27,31);
    for(let k=0;k<5;k++){block(ctx,'#8b9e9d',28+k*5,27,2,27);block(ctx,'#273c4a',30+k*5,29,2,23);}
    blocks(ctx,'#253b4a',[[48,59,15,3],[60,61,3,7],[51,67,10,3]]);
  }else{
    blocks(ctx,p.metal,[[12,17,5,45],[63,17,5,45],[12,23,56,19]]);
    block(ctx,'#d2ac64',16,26,48,11);for(let k=0;k<6;k++)block(ctx,'#3c4549',18+k*8,26,4,11);
    blocks(ctx,p.metalLight,[[12,17,3,44],[63,17,3,44],[9,61,12,3],[59,61,12,3]]);
  }
  ctx.restore();
}
