import {CELLS as TUNNEL_CELLS, MAP as TUNNEL_MAP} from './tunnel/config';
import {CELLS as FINALE_CELLS, MAP as FINALE_MAP} from './finale/config';
import {paintDetailedTunnelFixture,paintRefinedMaterial} from './scene-detailed-exteriors';

type Cell = Readonly<{x:number;y:number}>;
type Context = CanvasRenderingContext2D;
type Block = readonly [number,number,number,number];
const CELL=80;

/** Only these cells replace their old individual buildings. State markers stay in each painter. */
export const TUNNEL_JOINED_OBSTACLE_CELLS:readonly Cell[]=Object.freeze([
  {x:6,y:0},{x:7,y:0},{x:0,y:3},{x:1,y:3},
]);
export const FINALE_JOINED_OBSTACLE_CELLS:readonly Cell[]=Object.freeze([
  {x:3,y:0},{x:4,y:0},{x:1,y:1},{x:2,y:1},{x:10,y:1},{x:11,y:1},
  {x:0,y:2},{x:0,y:3},{x:0,y:4},
  {x:1,y:5},{x:2,y:5},{x:10,y:5},{x:11,y:5},{x:3,y:6},{x:4,y:6},
]);
const key=({x,y}:Cell)=>`${x},${y}`;
const tunnelJoined=new Set(TUNNEL_JOINED_OBSTACLE_CELLS.map(key));
const finaleJoined=new Set(FINALE_JOINED_OBSTACLE_CELLS.map(key));
const r=(ctx:Context,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
const blocks=(ctx:Context,color:string,items:readonly Block[])=>{for(const [x,y,w,h] of items)r(ctx,color,x,y,w,h);};
const bolt=(ctx:Context,x:number,y:number)=>{
  r(ctx,'#263e42',x,y,4,4);r(ctx,'#d0cdb1',x,y,3,1);r(ctx,'#82928b',x+1,y+1,2,2);
  r(ctx,'#b4c0ad',x+1,y+1,1.5,.5);r(ctx,'#31484b',x+1.5,y+1.5,.5,1.5);
  r(ctx,'#c5c9b759',x+.5,y+3,2,.5);
};

/** Restrained machining marks stay on existing plates, never on the open floor. */
function metalDetail(ctx:Context,x:number,y:number,w:number,h:number,seed=0){
  if(w<6||h<4)return;
  r(ctx,'#d1d9bf32',x+1,y+.5,w-3,.5);r(ctx,'#162e3655',x+w-1.5,y+1,.5,h-2);
  r(ctx,'#142d344a',x+1,y+h-1,w-3,.5);
  for(let i=0;i<3;i++){
    const sx=x+2+(seed*7+i*13)%(w-5),sy=y+2+(seed*3+i*7)%(h-3);
    const length=Math.min(3+(seed+i)%5,x+w-1-sx);
    r(ctx,i===1?'#b6c6b02d':'#203d4435',sx,sy,length,.5);
    if(i===1)r(ctx,'#c8c8a61f',sx+.5,sy+.5,Math.max(.5,length-1),.5);
  }
}

function smallRivet(ctx:Context,x:number,y:number){
  r(ctx,'#21383d88',x,y,2.5,2.5);r(ctx,'#b1b8a3b0',x+.5,y,1.5,.5);
  r(ctx,'#83978b',x+.5,y+.5,1.5,1);r(ctx,'#40554e',x+1,y+1,.5,1);
}

function woodDetail(ctx:Context,x:number,y:number,w:number,h:number,seed=0){
  if(w<8||h<6)return;
  for(let line=0;line<3;line++){
    const yy=y+2+(h-4)*line/3,offset=(seed+line*3)%5;
    r(ctx,'#3b40324a',x+2+offset,yy,Math.max(2,w-6-offset),.5);
    r(ctx,'#dfc8922a',x+3+offset,yy+.5,Math.max(2,(w-8-offset)*.55),.5);
  }
  if(w>20&&h>10){
    const kx=x+w*.61,ky=y+h*.62;
    blocks(ctx,'#574c3759',[[kx,ky,4,.5],[kx-.5,ky+.5,1,1],[kx+3,ky+.5,1,1],[kx,ky+1.5,4,.5]]);
    r(ctx,'#c0a16b45',kx+1,ky+.5,2,.5);
  }
}

/** Board and backdrop call the same 80px artwork through complementary clips.
 * This additional mask excludes every actual cell not owned by the joined group,
 * so an eave or contact shadow can extend into a missing corner but never a route. */
function clipScenery(ctx:Context,cells:readonly Cell[],joined:ReadonlySet<string>,columns:number,rows:number){
  ctx.beginPath();ctx.rect(-24,-24,columns*CELL+48,rows*CELL+48);
  for(const cell of cells)if(!joined.has(key(cell)))ctx.rect(cell.x*CELL,cell.y*CELL,CELL,CELL);
  ctx.clip('evenodd');
}

/** A continuous service wall: the old rubble bay and locked grate share one frame. */
function tunnelMachineWall(ctx:Context){
  if(paintDetailedTunnelFixture(ctx,'service-wall'))return;
  ctx.save();ctx.translate(480,0);
  blocks(ctx,'#162c3370',[[3,63,173,10],[9,73,166,3]]);
  blocks(ctx,'#253e45',[[-2,-14,175,78],[1,60,175,10]]);
  blocks(ctx,'#576f70',[[3,-9,163,69],[2,61,171,5]]);
  paintRefinedMaterial(ctx,'metal',3,-9,163,69,.3);
  blocks(ctx,'#8a9f95',[[2,-17,170,8],[4,-6,4,63],[163,-6,5,64],[5,57,160,4]]);
  blocks(ctx,'#c0c7ae',[[5,-16,161,2],[5,-5,155,2],[6,61,156,1]]);
  blocks(ctx,'#384d51',[[12,9,60,42],[84,7,73,47],[76,-4,6,62]]);
  blocks(ctx,'#738983',[[15,12,54,4],[15,46,54,3],[13,14,3,32],[68,15,3,31]]);
  for(let y=21;y<43;y+=7){r(ctx,'#1b3037',19,y,44,3);r(ctx,'#8fa095',19,y+3,44,1);}
  // The damaged left bay still contains a few angular stones, not a fresh machine.
  blocks(ctx,'#4d5d58',[[9,49,21,15],[30,42,21,21],[52,51,18,13]]);
  blocks(ctx,'#9ca493',[[9,47,20,4],[30,40,20,5],[52,49,17,4]]);
  blocks(ctx,'#c2c7ad',[[12,47,11,1],[32,40,13,2],[55,49,8,1]]);
  for(let x=89;x<153;x+=12){r(ctx,'#182d33',x+3,8,3,45);r(ctx,'#b2baaa',x,7,3,46);r(ctx,'#e1ddbd',x,10,1,26);}
  blocks(ctx,'#829386',[[84,10,71,4],[84,46,71,4]]);
  blocks(ctx,'#4d5144',[[111,27,15,17],[116,22,6,6]]);
  blocks(ctx,'#d5bd79',[[112,28,12,14],[115,23,6,6]]);r(ctx,'#665c43',117,33,3,5);
  for(const x of [9,76,157]){bolt(ctx,x,-12);bolt(ctx,x,61);}
  blocks(ctx,'#98765a',[[22,-8,15,2],[77,40,5,12],[150,55,12,3]]);
  blocks(ctx,'#b2ab8d',[[26,-7,6,1],[151,56,5,1],[51,3,11,1]]);
  metalDetail(ctx,5,-14,158,6,3);metalDetail(ctx,7,-3,151,8,7);metalDetail(ctx,5,62,160,4,2);
  metalDetail(ctx,77,-2,4,38);metalDetail(ctx,164,1,4,53);
  for(const x of [14,67,85,151])for(const y of [8,47])smallRivet(ctx,x,y);
  for(let y=21;y<43;y+=7){
    r(ctx,'#7b918551',20,y+1,40,.5);r(ctx,'#071f292e',22,y+2.5,38,.5);
    r(ctx,'#a7b3a236',22,y+3,12,.5);
  }
  for(let x=89;x<153;x+=12){
    r(ctx,'#d9ddc245',x+.5,15,.5,20);r(ctx,'#526c632f',x+1,31,1,8);
    r(ctx,'#c3bca644',x,47,3,.5);smallRivet(ctx,x+.5,11);
  }
  blocks(ctx,'#2c443a50',[[17,54,8,.5],[38,48,10,.5],[59,57,7,.5],[24,52,.5,6],[45,46,1,9]]);
  blocks(ctx,'#c4c5a93d',[[14,51,3,1],[38,44,5,.5],[60,54,2,.5],[52,59,4,.5]]);
  // A small service label and two dull indicators, contained in the upper fascia.
  blocks(ctx,'#273f435c',[[25,-1,22,4],[119,-1,16,4]]);
  blocks(ctx,'#c0c4aa61',[[27,0,6,.5],[27,1.5,13,.5],[43,0,2,2]]);
  r(ctx,'#b7ba8b85',121,0,2,1.5);r(ctx,'#ccaa6f70',128,0,2,1.5);
  metalDetail(ctx,112,28,12,14,9);r(ctx,'#f0da9f77',114,29,7,.5);
  ctx.restore();
}

/** Broken masonry and the disabled wire station share a low, continuous footing. */
function tunnelWireFooting(ctx:Context){
  if(paintDetailedTunnelFixture(ctx,'wire-footing'))return;
  ctx.save();ctx.translate(0,240);
  blocks(ctx,'#152b3270',[[-19,67,177,14],[-11,81,163,4]]);
  blocks(ctx,'#3b514e',[[-18,55,176,23],[-14,77,168,5]]);
  blocks(ctx,'#798477',[[-18,53,176,7],[-15,61,169,11]]);
  blocks(ctx,'#b4b8a0',[[-16,53,170,2],[-14,61,163,1]]);
  for(let x=-10;x<151;x+=27){r(ctx,'#42564d',x,62,2,10);r(ctx,'#9da68d',x+3,68,16,1);}
  blocks(ctx,'#4c5b51',[[-12,27,32,28],[20,20,28,34],[48,36,24,20]]);
  blocks(ctx,'#8f917b',[[-12,25,30,23],[20,18,26,29],[48,34,21,15]]);
  blocks(ctx,'#c0baa0',[[-10,23,27,5],[22,16,22,5],[49,32,18,4]]);
  blocks(ctx,'#606658',[[-9,35,25,2],[23,32,20,2],[33,21,2,11],[2,37,2,10],[55,38,2,10]]);
  blocks(ctx,'#c2b99d',[[-8,24,16,1],[24,17,14,1],[51,33,10,1]]);
  for(const x of [95,134]){
    r(ctx,'#776e5b',x,29,11,29);r(ctx,'#bdb497',x,27,9,3);r(ctx,'#c9c2a6',x+1,31,2,22);
    r(ctx,'#4c5b50',x+8,30,3,28);bolt(ctx,x+3,35);bolt(ctx,x+3,51);
  }
  blocks(ctx,'#9c9174',[[4,76,13,3],[48,73,8,3],[124,77,17,2]]);
  for(let x=-10,index=0;x<151;x+=27,index++){
    metalDetail(ctx,x+3,63,20,8,index+4);
    r(ctx,'#c0bd9b25',x+5,66,5,.5);r(ctx,'#263e3735',x+13,69,4,.5);
  }
  blocks(ctx,'#424f424a',[[-6,29,13,.5],[8,39,6,.5],[25,25,9,.5],[40,38,3,1],[51,40,9,.5]]);
  blocks(ctx,'#d7ceb13d',[[-8,28,5,.5],[9,42,3,.5],[26,23,7,.5],[40,30,2,.5],[53,37,3,.5]]);
  blocks(ctx,'#3c4d4250',[[7,28,.5,5],[7,32,4,.5],[11,32,.5,3],[37,39,.5,6],[34,45,3,.5]]);
  for(const x of [95,134])woodDetail(ctx,x+3,31,5,20,x);
  r(ctx,'#c9c4a340',-13,55,166,.5);r(ctx,'#233e3650',-11,76,162,.5);
  ctx.restore();
}

/** Static tunnel architecture only; rescue cats and the cleared-wire overlay remain in painter.ts. */
export function paintTunnelObstacleScenery(ctx:Context){
  ctx.save();clipScenery(ctx,TUNNEL_CELLS,tunnelJoined,TUNNEL_MAP.columns,TUNNEL_MAP.rows);
  tunnelMachineWall(ctx);tunnelWireFooting(ctx);ctx.restore();
}

function warehouseBeam(ctx:Context,y:number,lower:boolean){
  ctx.save();ctx.translate(240,y);
  const top=lower?15:-18,bottom=lower?94:67;
  blocks(ctx,'#192e3370',[[-16,bottom-4,176,11],[-11,bottom+7,165,3]]);
  blocks(ctx,'#414e4d',[[-18,top,176,bottom-top],[0,top+6,154,bottom-top-4]]);
  paintRefinedMaterial(ctx,'metal',-18,top,176,bottom-top,.3);
  blocks(ctx,'#849185',[[-20,top,178,9],[-16,bottom-7,174,8],[-16,top+9,7,bottom-top-17],[148,top+9,8,bottom-top-17]]);
  blocks(ctx,'#b9bea4',[[-18,top,173,2],[-14,bottom-7,167,2],[-15,top+11,2,bottom-top-23]]);
  blocks(ctx,'#263c40',[[-7,top+14,72,bottom-top-28],[72,top+14,73,bottom-top-28]]);
  for(const x of [2,43,83,124]){
    r(ctx,'#687d76',x,top+17,12,bottom-top-34);r(ctx,'#a8b29a',x,top+17,3,bottom-top-36);
    bolt(ctx,x+3,top+18);bolt(ctx,x+3,bottom-24);
  }
  blocks(ctx,'#69624f',[[17,bottom-23,42,13],[81,bottom-28,45,18]]);
  blocks(ctx,'#a59772',[[16,bottom-25,43,4],[80,bottom-30,46,4]]);
  blocks(ctx,'#c7bc95',[[21,bottom-25,28,1],[85,bottom-30,26,1]]);
  for(const x of [-13,65,147]){bolt(ctx,x,top+2);bolt(ctx,x,bottom-6);}
  blocks(ctx,'#9a7d58',[[33,top+6,22,2],[145,bottom-28,5,13],[-10,bottom-10,15,2]]);
  metalDetail(ctx,-15,top+3,163,5,lower?8:3);metalDetail(ctx,-12,bottom-5,155,4,6);
  for(const x of [2,43,83,124]){
    metalDetail(ctx,x+3,top+23,7,bottom-top-46,x);
    r(ctx,'#253e3d66',x+4,top+29,4,.5);r(ctx,'#c5cab02a',x+4,top+30,4,.5);
    smallRivet(ctx,x+4,top+37);
  }
  for(const x of [-10,28,68,108,147])smallRivet(ctx,x,top+5);
  woodDetail(ctx,20,bottom-20,34,8,4);woodDetail(ctx,84,bottom-24,36,12,7);
  blocks(ctx,'#bbc1a32a',[[22,top+10,7,.5],[91,top+11,12,.5],[143,bottom-12,5,.5]]);
  blocks(ctx,'#304b4540',[[40,top+4,7,.5],[53,top+6,3,.5],[147,bottom-25,.5,8]]);
  ctx.restore();
}

function warehouseSideWall(ctx:Context){
  // One long wall with staggered joints, rather than three repeated square props.
  blocks(ctx,'#192e3470',[[-20,157,95,251],[-15,408,86,5]]);
  blocks(ctx,'#414e48',[[-20,152,91,252],[65,158,8,242]]);
  for(let row=0;row<21;row++)for(let col=0;col<4;col++){
    const x=-20+col*23+(row%2)*10,y=156+row*11;
    const width=Math.min(21,66-x);if(width<=0)continue;
    r(ctx,row%3===0?'#95917c':'#7c8271',x,y,width,9);
    r(ctx,'#bdb69a',x+1,y,Math.max(1,width-2),2);r(ctx,'#556356',x+1,y+8,Math.max(1,width-2),1);
    if((row+col)%4===0)r(ctx,'#a5aa8d',x+4,y+5,Math.min(9,width-4),1);
    // A few clustered mineral grains and chipped joints, with quiet stone between them.
    if((row*3+col)%4===1){
      r(ctx,'#d1c6a425',x+3,y+3,Math.min(4,width-4),.5);
      r(ctx,'#4a5c4c3d',x+Math.max(2,width-5),y+5,2,.5);
      r(ctx,'#b9b99b24',x+2,y+6,1,.5);
    }
    r(ctx,'#263e3a32',x+width-.5,y+2,.5,6);
    if((row+col)%7===0){r(ctx,'#4e604b45',x+4,y+.5,2,1);r(ctx,'#a8ae8a2b',x+4,y+1.5,2,.5);}
  }
  blocks(ctx,'#a7af95',[[-21,150,94,6],[59,154,8,250],[-19,399,91,6]]);
  blocks(ctx,'#d0c8a6',[[-18,150,88,2],[60,157,2,238],[-17,400,83,1]]);
  for(const y of [179,238,307,375]){r(ctx,'#4f6658',-18,y,78,3);r(ctx,'#9ca588',-15,y+3,71,1);}
  blocks(ctx,'#4c6250',[[5,365,4,15],[9,377,12,3],[45,396,9,4],[48,327,3,14],[51,339,7,2]]);
  blocks(ctx,'#b5ad90',[[-9,408,12,3],[28,405,16,3],[61,406,9,2]]);
  for(let y=166;y<390;y+=37){
    metalDetail(ctx,61,y,5,29,y);smallRivet(ctx,62,y+9);
    r(ctx,'#ced0b529',-16,y+14,7,.5);r(ctx,'#2d4b3e35',31,y+21,9,.5);
  }
  blocks(ctx,'#233f373b',[[12,214,.5,14],[12,227,5,.5],[17,227,.5,5],[40,343,.5,17],[36,359,4,.5]]);
  blocks(ctx,'#a8ae8b24',[[13,215,.5,11],[41,344,.5,14],[19,383,9,.5],[47,391,4,.5]]);
}

function cargoWireDeck(ctx:Context,y:number){
  ctx.save();ctx.translate(80,y);
  blocks(ctx,'#1a2f3570',[[-16,61,172,12],[-10,73,163,4]]);
  blocks(ctx,'#49594f',[[-18,48,174,22],[-14,69,169,5]]);
  paintRefinedMaterial(ctx,'metal',-18,48,174,22,.23);
  blocks(ctx,'#89937a',[[-18,47,174,6],[-15,55,168,2]]);
  blocks(ctx,'#c2b897',[[-15,47,168,2],[-14,70,163,1]]);
  for(let x=-10;x<149;x+=24){r(ctx,'#53624f',x,57,2,12);r(ctx,'#a9a887',x+4,63,13,1);}
  // Unequal crates form one cargo stack; the second bay is the cleared-wire station.
  for(const [x,top,w,h] of [[-11,16,49,35],[32,29,37,22],[3,2,34,19]]){
    r(ctx,'#4b493b',x,top,w,h);r(ctx,'#967c57',x+2,top+4,w-7,h-7);
    paintRefinedMaterial(ctx,'wood',x+2,top+4,w-7,h-7,.32);
    r(ctx,'#bea67a',x+2,top,w-5,4);
    r(ctx,'#665943',x+w-5,top+4,5,h-4);r(ctx,'#d3bd8d',x+3,top+1,w-10,1);
    for(let stripe=10;stripe<w-6;stripe+=10){r(ctx,'#655640',x+stripe,top+7,1,h-11);r(ctx,'#b29b6b',x+stripe+1,top+7,1,h-12);}
    r(ctx,'#c1a879',x+3,top+h-5,w-10,2);bolt(ctx,x+3,top+6);bolt(ctx,x+w-10,top+h-6);
    woodDetail(ctx,x+5,top+7,w-15,Math.max(6,h-13),x+11);
    r(ctx,'#393c3066',x+w-4,top+7,.5,h-12);r(ctx,'#dcc49538',x+3,top+3,w-9,.5);
    if(w>40){r(ctx,'#c5ba974d',x+19,top+9,12,7);r(ctx,'#625f464f',x+21,top+11,7,.5);r(ctx,'#625f464f',x+21,top+13,5,.5);}
  }
  for(const x of [90,140]){r(ctx,'#75664f',x,24,10,34);r(ctx,'#bca57c',x,22,9,4);r(ctx,'#d1bf92',x+1,26,2,27);bolt(ctx,x+3,30);}
  for(let x=-10;x<149;x+=24)metalDetail(ctx,x+3,58,18,10,x+10);
  for(const x of [90,140])woodDetail(ctx,x+3,36,5,15,x);
  r(ctx,'#d9d0a32c',-13,49,165,.5);r(ctx,'#213b3444',-10,69,160,.5);
  ctx.restore();
}

function holdingRoom(ctx:Context,y:number){
  ctx.save();ctx.translate(800,y);
  blocks(ctx,'#152a3277',[[6,60,171,11],[12,71,159,4]]);
  blocks(ctx,'#414d49',[[8,14,168,49],[10,61,166,7]]);
  blocks(ctx,'#827e6a',[[8,16,163,44],[12,8,162,8],[10,60,165,4]]);
  paintRefinedMaterial(ctx,'wood',8,16,163,44,.27);
  blocks(ctx,'#b6b098',[[12,7,162,4],[10,16,162,3],[11,60,162,2]]);
  blocks(ctx,'#dad0af',[[15,7,155,1],[14,17,151,1]]);
  blocks(ctx,'#5c6557',[[166,18,9,44],[16,54,151,5],[74,18,8,42]]);
  blocks(ctx,'#b0ac94',[[16,26,8,31],[57,26,8,31],[87,22,5,39],[151,22,5,39]]);
  blocks(ctx,'#d0c5a4',[[16,27,2,27],[57,27,2,27],[88,24,1,35],[152,24,1,35]]);
  blocks(ctx,'#252f30',[[26,28,29,27],[92,22,59,38]]);
  blocks(ctx,'#433e32',[[30,32,20,22]]);
  blocks(ctx,'#8c7c5c',[[30,32,18,2],[31,35,2,17],[34,51,14,2]]);
  r(ctx,'#cfb778',36,39,4,5);
  for(const x of [17,68,85,160]){bolt(ctx,x,11);bolt(ctx,x,61);}
  blocks(ctx,'#a0805b',[[20,18,11,2],[142,62,14,2],[169,39,4,12]]);
  metalDetail(ctx,13,11,155,5,1);metalDetail(ctx,13,62,155,4,8);
  for(const x of [17,58,75,88,152,168]){
    metalDetail(ctx,x,26,x===75?6:4,28,x);smallRivet(ctx,x+.5,23);
  }
  woodDetail(ctx,34,35,13,15,4);
  blocks(ctx,'#b4bba13b',[[18,21,11,.5],[58,45,2,.5],[77,52,3,.5],[155,28,8,.5],[162,56,4,.5]]);
  blocks(ctx,'#2a433e50',[[24,20,17,.5],[159,57,7,.5],[76,35,.5,13],[151,51,1,5]]);
  // Warm glass is inset into the door header; no bloom reaches cats or their bars.
  blocks(ctx,'#384d4266',[[30,21,22,5],[111,12,14,4]]);
  blocks(ctx,'#b69e6a70',[[32,22,18,3],[113,13,10,2]]);
  blocks(ctx,'#e7cc8e67',[[33,22,6,.5],[42,22,6,.5],[114,13,6,.5]]);
  r(ctx,'#4c574667',40,22,.5,3);r(ctx,'#bdc0a534',35,35,1,10);
  ctx.restore();
}

/** Connected warehouse fabric only. Rescue bars/cats, wire marks and allies are overlays. */
export function paintFinaleObstacleScenery(ctx:Context){
  ctx.save();clipScenery(ctx,FINALE_CELLS,finaleJoined,FINALE_MAP.columns,FINALE_MAP.rows);
  warehouseBeam(ctx,0,false);warehouseBeam(ctx,480,true);warehouseSideWall(ctx);
  cargoWireDeck(ctx,80);cargoWireDeck(ctx,400);holdingRoom(ctx,80);holdingRoom(ctx,400);
  ctx.restore();
}
