import type {BattleSceneId} from './scene-art';

export interface ForegroundSceneryBounds {x:number;y:number;width:number;height:number}
type Context=CanvasRenderingContext2D;
interface ForegroundPlan {x:number;y:number;width:number;height:number;paint:(ctx:Context)=>void}
const r=(ctx:Context,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
function blocks(ctx:Context,color:string,items:readonly number[][]){for(const [x,y,w,h] of items)r(ctx,color,x,y,w,h);}
function wheel(ctx:Context,x:number,y:number){
  blocks(ctx,'#20363a',[[x+2,y,10,3],[x,y+3,14,8],[x+2,y+11,10,3]]);
  blocks(ctx,'#536968',[[x+3,y+3,8,8],[x+5,y+1,4,1]]);
  r(ctx,'#9a9f83',x+6,y+5,2,4);
}
function crate(ctx:Context,x:number,y:number,w:number,h:number){
  r(ctx,'#303f36',x,y,w,h);r(ctx,'#776245',x+2,y+2,w-4,h-4);
  r(ctx,'#a08d63',x+2,y+2,w-4,3);r(ctx,'#4e4d37',x+w-7,y+5,5,h-7);
  for(let yy=y+9;yy<y+h-3;yy+=7){r(ctx,'#404531',x+3,yy,w-11,1);r(ctx,'#b7a07350',x+4,yy-2,w-14,1);}
  for(const xx of [x+4,x+w-12]){r(ctx,'#94805a',xx,y+5,4,h-8);r(ctx,'#c1b28560',xx,y+5,1,h-9);}
  blocks(ctx,'#394338',[[x+5,y+6,2,2],[x+w-11,y+6,2,2],[x+5,y+h-6,2,2],[x+w-11,y+h-6,2,2]]);
}

function prologueCorner(ctx:Context){
  blocks(ctx,'#17313b38',[[8,35,125,9],[16,44,110,3]]);
  // One broken low wall with a folded work cloth, not another row of crates.
  blocks(ctx,'#2a4247',[[8,15,61,27],[8,9,25,8],[65,29,61,13]]);
  blocks(ctx,'#536b69',[[10,17,56,22],[10,11,20,6],[67,31,56,9]]);
  blocks(ctx,'#89988a',[[10,16,54,2],[10,10,20,2],[67,30,55,2]]);
  blocks(ctx,'#354e4d',[[34,18,1,19],[12,28,51,1],[76,33,1,6],[101,33,1,6]]);
  blocks(ctx,'#6a7e73',[[70,20,35,14],[74,17,27,5],[86,33,15,6]]);
  blocks(ctx,'#a3aa8970',[[75,18,25,2],[73,22,3,10],[91,34,7,2]]);
  blocks(ctx,'#3b514a',[[80,25,20,2],[94,22,2,10],[19,36,14,3]]);
  blocks(ctx,'#657951',[[22,34,3,7],[18,33,4,3],[25,30,4,5]]);
}

function alleyCart(ctx:Context){
  blocks(ctx,'#172f393d',[[9,41,133,9],[159,38,62,9],[20,50,114,3]]);
  // A worn handcart leans against an offset masonry corner.
  wheel(ctx,28,38);wheel(ctx,106,38);
  blocks(ctx,'#253d43',[[16,31,119,10],[24,24,6,13],[126,24,6,13],[133,27,23,4],[152,20,4,10]]);
  blocks(ctx,'#748674',[[19,32,113,2],[135,27,20,1],[153,20,1,8]]);
  crate(ctx,31,8,47,26);crate(ctx,83,17,37,17);
  blocks(ctx,'#485e5e',[[23,26,102,8],[23,26,5,13],[123,26,5,13]]);
  blocks(ctx,'#9caa8a77',[[24,26,101,2],[24,30,2,7],[124,30,2,7]]);
  blocks(ctx,'#2b4246',[[164,16,53,28],[201,6,16,12]]);
  blocks(ctx,'#52686a',[[166,18,49,23],[203,8,12,10]]);
  blocks(ctx,'#8b9890',[[165,16,50,2],[203,7,12,2]]);
  blocks(ctx,'#334e50',[[168,29,46,1],[186,20,1,9],[199,31,1,9]]);
  blocks(ctx,'#49664d',[[160,35,10,4],[164,30,3,8],[176,38,13,3]]);
  r(ctx,'#8a967255',177,38,8,1);
}

function marketHandcart(ctx:Context){
  blocks(ctx,'#26362c45',[[6,42,73,8],[17,50,53,3]]);
  wheel(ctx,13,39);wheel(ctx,58,39);
  // A short delivery trolley, with its upright handle on only the left side.
  blocks(ctx,'#384a43',[[9,5,5,35],[9,4,26,5],[31,7,4,29],[10,37,64,8]]);
  blocks(ctx,'#9b9f7b',[[11,6,22,1],[11,8,1,26],[13,38,58,2]]);
  crate(ctx,24,14,45,26);
  blocks(ctx,'#908566',[[45,8,24,11],[49,5,17,7],[55,17,16,9]]);
  blocks(ctx,'#b4a67e',[[50,6,13,2],[48,10,3,7],[59,19,7,1]]);
  blocks(ctx,'#68674c',[[49,8,16,2],[64,11,3,7],[27,32,40,3]]);
}

function gardenCart(ctx:Context){
  blocks(ctx,'#293d293d',[[6,40,72,9],[16,49,53,3]]);
  // A shallow wheelbarrow and a single diagonally resting garden tool.
  wheel(ctx,30,38);
  blocks(ctx,'#314737',[[14,27,55,8],[20,34,5,10],[59,32,5,10],[4,18,13,4],[1,14,6,6],[68,24,13,4]]);
  blocks(ctx,'#8b9670',[[5,18,10,1],[16,28,51,2],[70,24,9,1]]);
  blocks(ctx,'#51654c',[[12,20,55,12],[17,31,45,5],[9,17,60,4]]);
  blocks(ctx,'#9aa279',[[11,17,57,2],[14,22,3,7],[21,32,35,1]]);
  blocks(ctx,'#4d4930',[[15,14,49,6],[21,10,29,6],[48,13,13,4]]);
  blocks(ctx,'#837350',[[22,11,15,2],[42,15,11,2],[18,16,5,1]]);
  blocks(ctx,'#395a3b',[[31,5,3,8],[24,6,8,4],[34,2,8,5],[28,1,4,6]]);
  blocks(ctx,'#879b65',[[25,6,5,1],[35,2,5,1],[29,2,1,4]]);
  blocks(ctx,'#8a7854',[[55,6,5,5],[59,10,5,5],[63,14,5,5],[67,18,5,5],[71,22,5,5]]);
  blocks(ctx,'#bbc093',[[54,4,9,3],[53,7,3,6],[61,5,3,5]]);
}

function tunnelPipe(ctx:Context){
  blocks(ctx,'#142e393d',[[9,40,202,10],[20,50,179,3]]);
  // One large service pipe bends into a low grille, with unequal supports.
  blocks(ctx,'#203c46',[[10,22,135,23],[137,8,24,36],[157,8,44,19]]);
  blocks(ctx,'#45616a',[[13,25,127,16],[141,11,16,29],[157,11,41,13]]);
  blocks(ctx,'#81928e',[[16,25,122,3],[142,12,3,24],[159,11,35,2]]);
  blocks(ctx,'#314c55',[[16,36,122,5],[151,16,5,22],[162,20,34,4]]);
  for(const x of [29,104]){
    r(ctx,'#273f48',x,20,10,27);r(ctx,'#73857e',x+2,21,5,24);
    blocks(ctx,'#a6ac8c',[[x+3,23,2,2],[x+3,40,2,2]]);
  }
  blocks(ctx,'#2e454b',[[181,21,28,25],[177,19,35,5]]);
  blocks(ctx,'#627773',[[183,25,24,18],[179,20,31,2]]);
  for(let y=28;y<42;y+=4){r(ctx,'#233d47',185,y,20,2);r(ctx,'#96a28c50',186,y-1,18,1);}
  blocks(ctx,'#617971',[[49,40,21,7],[85,39,12,8]]);
  blocks(ctx,'#304c50',[[50,44,19,3],[86,43,10,4]]);
  blocks(ctx,'#7e7860',[[66,27,14,2],[71,29,14,2],[74,32,8,2]]);
}

function warehouseBeam(ctx:Context){
  blocks(ctx,'#1c303336',[[8,35,103,13],[125,38,91,12],[28,48,179,4]]);
  // A broken beam angles across one corner; the separate pallet is lower and wider.
  blocks(ctx,'#303e3d',[[7,5,22,15],[25,12,23,15],[45,20,24,15],[66,28,25,15],[88,35,16,9]]);
  blocks(ctx,'#665d49',[[9,7,20,9],[27,14,21,9],[47,22,22,9],[68,30,23,9],[89,37,12,4]]);
  blocks(ctx,'#9d8f6b',[[10,7,18,2],[28,14,19,2],[48,22,20,2],[69,30,20,2]]);
  blocks(ctx,'#3b4640',[[15,12,11,2],[33,19,13,2],[52,27,14,2],[73,35,15,2]]);
  blocks(ctx,'#7f7457',[[101,35,7,3],[103,40,8,2],[94,44,9,3]]);
  blocks(ctx,'#334039',[[124,30,88,17],[128,22,80,9]]);
  blocks(ctx,'#766548',[[126,32,84,12],[130,24,76,6]]);
  for(const y of [25,33,40]){r(ctx,'#aa96705c',130,y,76,1);r(ctx,'#3e4737',131,y+2,74,2);}
  blocks(ctx,'#a18c60',[[134,23,5,21],[196,23,5,21]]);
  blocks(ctx,'#31453f',[[148,11,47,14],[153,8,37,4]]);
  blocks(ctx,'#68796e',[[150,13,42,10],[155,10,33,3]]);
  blocks(ctx,'#a2a78867',[[155,10,31,1],[152,14,2,7],[176,14,12,1]]);
}

// Authored anchors stay outside real cells and entrance lanes; no per-frame randomness.
const plans:Record<BattleSceneId,ForegroundPlan>={
  prologue:{x:.35,y:3.02,width:1.75,height:.6,paint:prologueCorner},
  alley:{x:.15,y:5.02,width:2.85,height:.675,paint:alleyCart},
  market:{x:-1.38,y:4.05,width:1.12,height:.675,paint:marketHandcart},
  greenhouse:{x:4.7,y:5.6,width:1.1,height:.675,paint:gardenCart},
  tunnel:{x:5.65,y:5.02,width:2.75,height:.675,paint:tunnelPipe},
  finale:{x:8.2,y:7.02,width:2.8,height:.675,paint:warehouseBeam},
};

/** The caller translates to board origin and clips out actual cells before drawing.
 * Returned CSS-pixel bounds contain every visible pixel, including contact shadows. */
export function paintForegroundScenery(ctx:Context,scene:BattleSceneId,cellWidth:number,cellHeight:number):ForegroundSceneryBounds[]{
  if(!Number.isFinite(cellWidth)||!Number.isFinite(cellHeight)||cellWidth<=0||cellHeight<=0)return [];
  const plan=plans[scene];
  ctx.save();ctx.scale(cellWidth/80,cellHeight/80);ctx.translate(plan.x*80,plan.y*80);
  ctx.imageSmoothingEnabled=false;plan.paint(ctx);ctx.restore();
  return [{x:plan.x*cellWidth,y:plan.y*cellHeight,width:plan.width*cellWidth,height:plan.height*cellHeight}];
}
