import {CELLS as TUNNEL_CELLS, MAP as TUNNEL_MAP} from './tunnel/config';
import {CELLS as FINALE_CELLS, MAP as FINALE_MAP} from './finale/config';

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
};

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
  ctx.save();ctx.translate(480,0);
  blocks(ctx,'#162c3370',[[3,63,173,10],[9,73,166,3]]);
  blocks(ctx,'#253e45',[[-2,-14,175,78],[1,60,175,10]]);
  blocks(ctx,'#576f70',[[3,-9,163,69],[2,61,171,5]]);
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
  ctx.restore();
}

/** Broken masonry and the disabled wire station share a low, continuous footing. */
function tunnelWireFooting(ctx:Context){
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
  }
  blocks(ctx,'#a7af95',[[-21,150,94,6],[59,154,8,250],[-19,399,91,6]]);
  blocks(ctx,'#d0c8a6',[[-18,150,88,2],[60,157,2,238],[-17,400,83,1]]);
  for(const y of [179,238,307,375]){r(ctx,'#4f6658',-18,y,78,3);r(ctx,'#9ca588',-15,y+3,71,1);}
  blocks(ctx,'#4c6250',[[5,365,4,15],[9,377,12,3],[45,396,9,4],[48,327,3,14],[51,339,7,2]]);
  blocks(ctx,'#b5ad90',[[-9,408,12,3],[28,405,16,3],[61,406,9,2]]);
}

function cargoWireDeck(ctx:Context,y:number){
  ctx.save();ctx.translate(80,y);
  blocks(ctx,'#1a2f3570',[[-16,61,172,12],[-10,73,163,4]]);
  blocks(ctx,'#49594f',[[-18,48,174,22],[-14,69,169,5]]);
  blocks(ctx,'#89937a',[[-18,47,174,6],[-15,55,168,2]]);
  blocks(ctx,'#c2b897',[[-15,47,168,2],[-14,70,163,1]]);
  for(let x=-10;x<149;x+=24){r(ctx,'#53624f',x,57,2,12);r(ctx,'#a9a887',x+4,63,13,1);}
  // Unequal crates form one cargo stack; the second bay is the cleared-wire station.
  for(const [x,top,w,h] of [[-11,16,49,35],[32,29,37,22],[3,2,34,19]]){
    r(ctx,'#4b493b',x,top,w,h);r(ctx,'#967c57',x+2,top+4,w-7,h-7);r(ctx,'#bea67a',x+2,top,w-5,4);
    r(ctx,'#665943',x+w-5,top+4,5,h-4);r(ctx,'#d3bd8d',x+3,top+1,w-10,1);
    for(let stripe=10;stripe<w-6;stripe+=10){r(ctx,'#655640',x+stripe,top+7,1,h-11);r(ctx,'#b29b6b',x+stripe+1,top+7,1,h-12);}
    r(ctx,'#c1a879',x+3,top+h-5,w-10,2);bolt(ctx,x+3,top+6);bolt(ctx,x+w-10,top+h-6);
  }
  for(const x of [90,140]){r(ctx,'#75664f',x,24,10,34);r(ctx,'#bca57c',x,22,9,4);r(ctx,'#d1bf92',x+1,26,2,27);bolt(ctx,x+3,30);}
  ctx.restore();
}

function holdingRoom(ctx:Context,y:number){
  ctx.save();ctx.translate(800,y);
  blocks(ctx,'#152a3277',[[6,60,171,11],[12,71,159,4]]);
  blocks(ctx,'#414d49',[[8,14,168,49],[10,61,166,7]]);
  blocks(ctx,'#827e6a',[[8,16,163,44],[12,8,162,8],[10,60,165,4]]);
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
  ctx.restore();
}

/** Connected warehouse fabric only. Rescue bars/cats, wire marks and allies are overlays. */
export function paintFinaleObstacleScenery(ctx:Context){
  ctx.save();clipScenery(ctx,FINALE_CELLS,finaleJoined,FINALE_MAP.columns,FINALE_MAP.rows);
  warehouseBeam(ctx,0,false);warehouseBeam(ctx,480,true);warehouseSideWall(ctx);
  cargoWireDeck(ctx,80);cargoWireDeck(ctx,400);holdingRoom(ctx,80);holdingRoom(ctx,400);
  ctx.restore();
}
