import type {BattleSceneId} from './scene-art';
import {paintRefinedMaterial} from './scene-detailed-exteriors';

export interface ForegroundSceneryBounds {x:number;y:number;width:number;height:number}
type Context=CanvasRenderingContext2D;
interface ForegroundPlan {x:number;y:number;width:number;height:number;paint:(ctx:Context)=>void}
const r=(ctx:Context,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
function blocks(ctx:Context,color:string,items:readonly number[][]){for(const [x,y,w,h] of items)r(ctx,color,x,y,w,h);}
function softContact(ctx:Context,x:number,y:number,w:number,h:number){
  ctx.save();ctx.translate(x+w/2,y+h/2);ctx.scale(w/2,h/2);
  const shade=ctx.createRadialGradient(0,0,.08,0,0,1);
  shade.addColorStop(0,'#10282f48');shade.addColorStop(.48,'#10282f2b');shade.addColorStop(.8,'#10282f10');shade.addColorStop(1,'#10282f00');
  ctx.fillStyle=shade;ctx.fillRect(-1,-1,2,2);ctx.restore();
}
function fineGrain(ctx:Context,x:number,y:number,w:number,h:number){
  r(ctx,'#d0b98b3b',x+1,y+h*.25,w*.46,.5);r(ctx,'#292e263b',x+w*.15,y+h*.4,w*.62,.5);
  r(ctx,'#c5ac7547',x+w*.35,y+h*.65,w*.6,.5);r(ctx,'#3b3c2d4d',x+w*.65,y+h*.8,w*.24,.5);
  const kx=x+w*.38,ky=y+h*.57;
  r(ctx,'#34382c59',kx,ky,Math.min(4,w*.18),.75);r(ctx,'#d0b98336',kx-1,ky+1,Math.min(6,w*.25),.5);
}
function wheel(ctx:Context,x:number,y:number){
  blocks(ctx,'#20363a',[[x+2,y,10,3],[x,y+3,14,8],[x+2,y+11,10,3]]);
  blocks(ctx,'#536968',[[x+3,y+3,8,8],[x+5,y+1,4,1]]);
  r(ctx,'#9a9f83',x+6,y+5,2,4);
  // Fine tyre edge, spokes and an oily hub sit inside the original 14px rim.
  blocks(ctx,'#9eada56b',[[x+3,y+1,6,.5],[x+1,y+4,.5,4],[x+3,y+12,4,.5]]);
  blocks(ctx,'#172e3770',[[x+11,y+4,.5,5],[x+8,y+11,2,.5],[x+3,y+8,3,.5],[x+8,y+4,.5,3]]);
  blocks(ctx,'#a9afa270',[[x+4,y+4,1,.5],[x+8,y+9,1,.5],[x+6,y+5,1,1]]);
  r(ctx,'#263b3e',x+6.5,y+7,1,1);r(ctx,'#9c81595c',x+10,y+8,1,.5);
}
function crate(ctx:Context,x:number,y:number,w:number,h:number){
  r(ctx,'#303f36',x,y,w,h);r(ctx,'#776245',x+2,y+2,w-4,h-4);
  paintRefinedMaterial(ctx,'wood',x+2,y+2,w-4,h-4,.4);
  r(ctx,'#a08d63',x+2,y+2,w-4,3);r(ctx,'#4e4d37',x+w-7,y+5,5,h-7);
  for(let yy=y+9;yy<y+h-3;yy+=7){r(ctx,'#404531',x+3,yy,w-11,1);r(ctx,'#b7a07350',x+4,yy-2,w-14,1);}
  for(const xx of [x+4,x+w-12]){r(ctx,'#94805a',xx,y+5,4,h-8);r(ctx,'#c1b28560',xx,y+5,1,h-9);}
  blocks(ctx,'#394338',[[x+5,y+6,2,2],[x+w-11,y+6,2,2],[x+5,y+h-6,2,2],[x+w-11,y+h-6,2,2]]);
  fineGrain(ctx,x+10,y+6,w-24,h-10);
  blocks(ctx,'#c1b08a99',[[x+5,y+6,1,.5],[x+w-11,y+6,1,.5],[x+5,y+h-6,1,.5],[x+w-11,y+h-6,1,.5]]);
  r(ctx,'#ddc99b4d',x+3,y+3,w-7,.5);r(ctx,'#393f3270',x+w-5,y+8,.5,h-11);
}

function prologueCorner(ctx:Context){
  softContact(ctx,8,35,125,12);softContact(ctx,16,39,110,8);
  // One broken low wall with a folded work cloth, not another row of crates.
  blocks(ctx,'#2a4247',[[8,15,61,27],[8,9,25,8],[65,29,61,13]]);
  blocks(ctx,'#536b69',[[10,17,56,22],[10,11,20,6],[67,31,56,9]]);
  blocks(ctx,'#89988a',[[10,16,54,2],[10,10,20,2],[67,30,55,2]]);
  blocks(ctx,'#354e4d',[[34,18,1,19],[12,28,51,1],[76,33,1,6],[101,33,1,6]]);
  blocks(ctx,'#6a7e73',[[70,20,35,14],[74,17,27,5],[86,33,15,6]]);
  blocks(ctx,'#a3aa8970',[[75,18,25,2],[73,22,3,10],[91,34,7,2]]);
  blocks(ctx,'#3b514a',[[80,25,20,2],[94,22,2,10],[19,36,14,3]]);
  blocks(ctx,'#657951',[[22,34,3,7],[18,33,4,3],[25,30,4,5]]);
  // Weathered mortar, tiny aggregate and stitched cloth keep their own surfaces.
  blocks(ctx,'#b9c0a65c',[[12,18,8,.5],[40,18,13,.5],[15,30,9,.5],[48,31,4,1],[79,33,12,.5],[108,34,5,.5]]);
  blocks(ctx,'#314b4859',[[25,22,7,.5],[44,24,3,1],[56,35,5,.5],[88,36,8,.5],[116,35,3,1]]);
  blocks(ctx,'#a5af8059',[[20,34,1,.5],[23,37,.5,2],[26,32,1,.5]]);
  for(let x=76;x<100;x+=5)r(ctx,'#c1c7a35c',x,19,1.5,.5);
  blocks(ctx,'#3e5a5066',[[77,23,12,.5],[82,28,9,.5],[95,31,.5,5]]);
  blocks(ctx,'#c4ccb060',[[74,23,.5,6],[88,34,7,.5],[80,24,9,.5]]);
}

function alleyCart(ctx:Context){
  softContact(ctx,9,41,133,12);softContact(ctx,159,38,62,9);
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
  blocks(ctx,'#cfceb06b',[[25,27,89,.5],[135,27,17,.5],[166,17,47,.5],[204,8,9,.5]]);
  blocks(ctx,'#172f3a70',[[30,31,34,.5],[93,31,19,.5],[154,23,.5,4]]);
  blocks(ctx,'#9f7d526b',[[47,29,4,1],[51,30,2,.5],[115,29,3,.5],[125,35,.5,2]]);
  blocks(ctx,'#d2b7823b',[[48,29,2,.5],[116,28.5,1,.5]]);
  blocks(ctx,'#9aa79a45',[[171,22,11,.5],[191,24,8,.5],[175,34,6,.5],[204,36,4,.5]]);
  blocks(ctx,'#304d4d5c',[[179,23,3,1],[205,22,5,.5],[190,37,4,.5]]);
}

function marketHandcart(ctx:Context){
  softContact(ctx,6,42,73,11);softContact(ctx,17,44,53,9);
  wheel(ctx,13,39);wheel(ctx,58,39);
  // A short delivery trolley, with its upright handle on only the left side.
  blocks(ctx,'#384a43',[[9,5,5,35],[9,4,26,5],[31,7,4,29],[10,37,64,8]]);
  blocks(ctx,'#9b9f7b',[[11,6,22,1],[11,8,1,26],[13,38,58,2]]);
  crate(ctx,24,14,45,26);
  blocks(ctx,'#908566',[[45,8,24,11],[49,5,17,7],[55,17,16,9]]);
  blocks(ctx,'#b4a67e',[[50,6,13,2],[48,10,3,7],[59,19,7,1]]);
  blocks(ctx,'#68674c',[[49,8,16,2],[64,11,3,7],[27,32,40,3]]);
  blocks(ctx,'#c4c7a76b',[[11,7,20,.5],[11,10,.5,14],[14,39,53,.5]]);
  blocks(ctx,'#97764a6b',[[10,19,2,3],[11,23,1,2],[32,28,1,4],[61,40,4,.5]]);
  blocks(ctx,'#d8bf8842',[[10,19,1,.5],[33,28,.5,2]]);
  for(let x=51;x<65;x+=4)r(ctx,'#d5c49c73',x,7,1,.5);
  blocks(ctx,'#c2b9915c',[[49,12,.5,3],[57,20,5,.5],[61,22,6,.5]]);
  blocks(ctx,'#4f58413b',[[54,13,6,.5],[66,20,.5,4]]);
}

function gardenCart(ctx:Context){
  softContact(ctx,6,40,72,12);softContact(ctx,16,44,53,8);
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
  blocks(ctx,'#b2bb8e6b',[[12,18,52,.5],[15,23,.5,4],[23,32,28,.5],[54,5,7,.5]]);
  blocks(ctx,'#263c2f66',[[22,25,11,.5],[43,27,8,.5],[59,23,4,.5],[21,36,.5,5]]);
  blocks(ctx,'#927d515c',[[18,22,4,1],[25,23,2,.5],[55,28,3,.5],[60,31,2,.5]]);
  blocks(ctx,'#b59d674d',[[23,13,3,.5],[39,14,2,1],[50,16,4,.5],[59,16,2,.5]]);
  blocks(ctx,'#cfcea86b',[[54,7,.5,4],[61,6,.5,2],[58,9,2,.5]]);
  blocks(ctx,'#574d3659',[[58,9,.5,2],[63,14,.5,2],[68,19,.5,2],[72,23,.5,2]]);
  r(ctx,'#b2bb8059',30,3,.5,4);r(ctx,'#a2b36c59',36,3,3,.5);
}

function tunnelPipe(ctx:Context){
  softContact(ctx,9,40,202,13);softContact(ctx,20,43,179,10);
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
  // Fine reflected lines follow the pipe, while corrosion stays in a few patches.
  blocks(ctx,'#bfd0bb45',[[17,26,113,.5],[143,14,.5,20],[162,12,30,.5],[180,20.5,29,.5]]);
  blocks(ctx,'#172f3c4d',[[18,35,112,.5],[150,19,.5,17],[164,21,27,.5]]);
  blocks(ctx,'#a29e7866',[[65,27,7,.5],[70,29,3,1],[77,31,4,.5],[83,30,2,.5]]);
  blocks(ctx,'#454e3e59',[[68,28,2,.5],[75,30,1,1],[79,33,2,.5]]);
  blocks(ctx,'#9eaa9a45',[[46,30,13,.5],[88,32,11,.5],[117,30,8,.5],[145,27,.5,7]]);
  for(const x of [29,104]){
    r(ctx,'#c8cbb18c',x+3,23,1,.5);r(ctx,'#263f4380',x+4,24,1,.5);
    r(ctx,'#c3c5a775',x+3,40,1,.5);r(ctx,'#a28b5e59',x+6,32,.5,3);
  }
  blocks(ctx,'#a7b09b5c',[[184,25,21,.5],[186,28,16,.5],[186,36,17,.5]]);
}

function warehouseBeam(ctx:Context){
  softContact(ctx,8,35,103,17);softContact(ctx,125,38,91,14);
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
  for(const [x,y,w,h]of [[10,8,17,7],[28,15,18,7],[48,23,19,7],[69,31,20,7]])fineGrain(ctx,x,y,w,h);
  fineGrain(ctx,140,34,53,8);fineGrain(ctx,141,25,51,5);
  blocks(ctx,'#c7b08773',[[135,25,1,.5],[197,25,1,.5],[135,40,1,.5],[197,40,1,.5]]);
  blocks(ctx,'#2d3e3459',[[136,26,1,.5],[198,26,1,.5],[137,41,1,.5],[199,41,1,.5]]);
  blocks(ctx,'#b5b99f59',[[156,11,28,.5],[153,15,.5,5],[177,16,8,.5]]);
  blocks(ctx,'#88765459',[[163,20,3,.5],[187,17,2,1],[189,18,1,.5]]);
  blocks(ctx,'#d2bc8b66',[[102,36,4,.5],[104,41,5,.5],[95,45,5,.5]]);
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
