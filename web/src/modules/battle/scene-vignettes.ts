import {paintSceneProp,type BattleSceneId} from './scene-art';
import {paintDetailedWorkstation} from './scene-detailed-exteriors';

export type SceneVignetteKind='garden-bench'|'potting-corner'|'alley-supplies'|'market-goods'|'tunnel-tools'|'warehouse-workbench';
export const SCENE_VIGNETTE_ASPECT=1.7;

type Context=CanvasRenderingContext2D;
type Shape=readonly [number,number,number,number];
interface Materials {wood:string;woodLight:string;metal:string;metalLight:string;leaf:string;leafLight:string}
const materials:Record<BattleSceneId,Materials>={
  prologue:{wood:'#75604a',woodLight:'#a58c65',metal:'#47616a',metalLight:'#839997',leaf:'#506c54',leafLight:'#82946a'},
  alley:{wood:'#756049',woodLight:'#aa916b',metal:'#44616d',metalLight:'#839e9e',leaf:'#536c55',leafLight:'#849970'},
  market:{wood:'#836448',woodLight:'#b59b72',metal:'#63716a',metalLight:'#a0ad9a',leaf:'#66784f',leafLight:'#9ba46c'},
  greenhouse:{wood:'#826c50',woodLight:'#b4a17b',metal:'#617c6a',metalLight:'#a0b399',leaf:'#51734f',leafLight:'#90aa76'},
  tunnel:{wood:'#71634f',woodLight:'#a29573',metal:'#4c6b76',metalLight:'#91aaac',leaf:'#4e7060',leafLight:'#839b7a'},
  finale:{wood:'#79634d',woodLight:'#ad9571',metal:'#626f68',metalLight:'#9eaca1',leaf:'#5e7256',leafLight:'#8e9f77'},
};
const EDGE='#2c3d3c';
const WOOD_SHADE='#514737';
const r=(ctx:Context,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
const blocks=(ctx:Context,color:string,shapes:readonly Shape[])=>{for(const [x,y,w,h] of shapes)r(ctx,color,x,y,w,h);};
function contact(ctx:Context,x:number,y:number,w:number){
  ctx.save();ctx.translate(x+w/2,y+1.5);ctx.scale(w/2,3.5);
  const shade=ctx.createRadialGradient(0,0,.1,0,0,1);
  shade.addColorStop(0,'#233a3b66');shade.addColorStop(.5,'#233a3b38');shade.addColorStop(1,'#233a3b00');
  ctx.fillStyle=shade;ctx.fillRect(-1,-1,2,2);ctx.restore();
}
function rivet(ctx:Context,x:number,y:number){r(ctx,EDGE,x,y,2,2);r(ctx,'#b3b6a0',x,y,1,.75);r(ctx,'#e1dcc14d',x+.5,y+.5,.5,.5);}
function bench(ctx:Context,p:Materials,x:number,y:number,w:number,h=32,metal=false){
  const body=metal?p.metal:p.wood,light=metal?p.metalLight:p.woodLight;
  contact(ctx,x-2,y+h,w+4);
  // Open space under the top leaves a readable table silhouette, not a solid block.
  blocks(ctx,EDGE,[[x+5,y+6,6,h-5],[x+w-11,y+6,6,h-5],[x+7,y+h-10,w-14,4]]);
  blocks(ctx,body,[[x+6,y+7,3,h-7],[x+w-10,y+7,3,h-7],[x+9,y+h-10,w-18,3]]);
  blocks(ctx,light,[[x+6,y+8,1,h-9],[x+w-10,y+8,1,h-9],[x+10,y+h-10,w-20,1]]);
  r(ctx,EDGE,x,y,w,8);r(ctx,body,x+1,y+1,w-2,5);r(ctx,light,x+2,y+1,w-4,2);
  r(ctx,WOOD_SHADE,x+2,y+6,w-4,2);
  if(!metal){
    for(let k=0;k<3&&10+k*23+13<w-2;k++){
      r(ctx,'#69594370',x+10+k*23,y+4,13,.75);r(ctx,p.woodLight+'66',x+12+k*23,y+3,9,.5);
    }
    r(ctx,'#d6c49a4d',x+4,y+1.5,w*.35,.5);r(ctx,WOOD_SHADE+'66',x+w*.55,y+4,w*.3,.5);
    r(ctx,'#4f463566',x+w*.4,y+3,3,.5);r(ctx,p.woodLight+'70',x+w*.4-1,y+4,5,.5);
    r(ctx,'#8b77504d',x+7,y+12,.5,Math.max(2,h-19));
  }else{
    blocks(ctx,p.metalLight+'7a',[[x+3,y+1.5,w*.7,.5],[x+6.5,y+10,.5,h-15]]);
    blocks(ctx,'#ad956352',[[x+w*.67,y+4,3,.5],[x+w*.67+3,y+5,1,.5]]);
  }
  for(const xx of [x+6,x+w-10])rivet(ctx,xx,y+4);
}
function pallet(ctx:Context,p:Materials,x:number,y:number,w:number){
  contact(ctx,x-2,y+10,w+4);r(ctx,EDGE,x,y,w,10);
  for(const dx of [2,Math.floor(w/2)-2,w-7])r(ctx,p.wood,x+dx,y+4,5,6);
  for(let sy=0;sy<6;sy+=3){r(ctx,p.wood,x+1,y+sy,w-2,2);r(ctx,p.woodLight,x+2,y+sy,w-4,1);}
  for(const xx of [x+4,x+w-6])rivet(ctx,xx,y+1);
}
function herbLeaf(ctx:Context,p:Materials,x:number,y:number,w:number,h:number,reverse=false){
  ctx.save();ctx.beginPath();
  ctx.moveTo(x,y+h*.62);ctx.lineTo(x+w*.25,y+.25);ctx.lineTo(x+w*.7,y);
  ctx.lineTo(x+w,y+h*.4);ctx.lineTo(x+w*.75,y+h*.86);ctx.lineTo(x+w*.24,y+h);ctx.closePath();
  ctx.fillStyle=p.leaf;ctx.fill();ctx.clip();
  r(ctx,p.leafLight+'8c',x+w*.2,y+.25,w*.5,.5);
  const slope=reverse?-.2:.2;
  for(let step=0;step<3;step++){
    const xx=x+w*.13+step*w*.24,yy=y+h*.55+(step-1)*slope;
    r(ctx,'#c5d09b70',xx,yy,w*.26,.5);
    if(step===1)r(ctx,'#294b3659',xx+.5,yy+.5,.5,Math.max(.5,h*.2));
  }
  ctx.restore();
}
function herb(ctx:Context,p:Materials,x:number,y:number,tall=false){
  const rise=tall?15:10;
  r(ctx,'#87946a',x,y-rise,1.5,rise);r(ctx,'#c6cca168',x,y-rise+1,.5,rise-2);
  herbLeaf(ctx,p,x-6,y-rise+2,5,3,true);
  herbLeaf(ctx,p,x-4,y-rise,4,2);
  herbLeaf(ctx,p,x+2,y-rise+5,6,3);
  herbLeaf(ctx,p,x+4,y-rise+3,3,2);
  herbLeaf(ctx,p,x-5,y-4,5,3,true);
}

function trough(ctx:Context,p:Materials,x:number,y:number,w:number,variant=0){
  r(ctx,EDGE,x,y,w,13);r(ctx,p.wood,x+2,y+3,w-4,9);r(ctx,p.woodLight,x+1,y+1,w-2,2);
  r(ctx,'#514a38',x+4,y+3,w-8,3);r(ctx,'#b4a078',x+2,y+6,2,5);r(ctx,WOOD_SHADE,x+w-5,y+6,3,6);
  const positions=variant%2?[8,Math.floor(w*.52),w-9]:[10,Math.floor(w*.56),w-8];
  positions.forEach((dx,i)=>herb(ctx,p,x+dx,y+4,(i+variant)%2===0));
  for(const dx of [3,w-5])rivet(ctx,x+dx,y+8);
  r(ctx,p.woodLight+'70',x+5,y+7,w*.4,.5);r(ctx,WOOD_SHADE+'70',x+w*.45,y+9,w*.35,.5);
  blocks(ctx,'#b99d6a59',[[x+8,y+3,2,.5],[x+w*.58,y+4,1,.5],[x+w-11,y+3.5,1.5,.5]]);
}
function wateringCan(ctx:Context,p:Materials,x:number,y:number){
  // Stepped handle and raised spout remain recognisable without a bright accent.
  blocks(ctx,EDGE,[[x+3,y+5,15,13],[x+2,y+2,10,3],[x,y+4,3,9],[x+15,y+8,5,4],[x+19,y+5,4,4],[x+21,y+3,5,3]]);
  blocks(ctx,p.metal,[[x+5,y+6,11,10],[x+3,y+3,7,1],[x+1,y+5,1,6],[x+17,y+9,3,2],[x+20,y+6,3,2]]);
  blocks(ctx,p.metalLight,[[x+5,y+6,8,2],[x+5,y+8,2,6],[x+22,y+3,3,1]]);r(ctx,'#465f59',x+13,y+9,3,7);
  blocks(ctx,'#d0d6b47a',[[x+5,y+6,7,.5],[x+5.5,y+9,.5,4],[x+22,y+3,2,.5]]);
  blocks(ctx,'#9f96624d',[[x+9,y+14,2,.5],[x+12,y+15,1,.5]]);r(ctx,'#294a4259',x+8,y+12,3,.5);
}
function smallPot(ctx:Context,x:number,y:number,w=13,withSoil=true){
  blocks(ctx,'#5e4a3b',[[x,y,w,4],[x+1,y+4,w-2,7],[x+3,y+11,w-6,2]]);
  blocks(ctx,'#a67e58',[[x+1,y+1,w-2,3],[x+2,y+4,w-4,6]]);r(ctx,'#c8a479',x+2,y+1,w-4,1);
  r(ctx,'#c2996e',x+2,y+5,2,4);r(ctx,'#806048',x+w-4,y+5,2,5);
  if(withSoil){r(ctx,'#504b38',x+3,y+2,w-6,2);r(ctx,'#baa07759',x+4,y+2,1,.5);r(ctx,'#91806466',x+w-5,y+3,1,.5);}
  const glaze=ctx.createLinearGradient(x+2,y,x+w-2,y);
  glaze.addColorStop(0,'#edc89b1a');glaze.addColorStop(.3,'#f5d4a42b');glaze.addColorStop(1,'#41332e21');
  ctx.fillStyle=glaze;ctx.fillRect(x+2,y+4,w-4,6);
  r(ctx,'#f0c99a80',x+2,y+1,w-4,.5);r(ctx,'#dec29a59',x+3,y+5,.5,3);r(ctx,'#6d51413b',x+w-5,y+7,.5,2);
}
function toolRack(ctx:Context,p:Materials,x:number,y:number,w:number,h:number){
  blocks(ctx,EDGE,[[x,y,5,h],[x+w-5,y,5,h],[x,y+3,w,5],[x,y+h-7,w,5]]);
  blocks(ctx,p.wood,[[x+1,y+1,3,h-2],[x+w-4,y+1,3,h-2],[x+3,y+4,w-6,3],[x+3,y+h-6,w-6,3]]);
  blocks(ctx,p.woodLight,[[x+1,y+1,1,h-3],[x+w-4,y+1,1,h-3],[x+3,y+4,w-6,1]]);
  for(const dx of [12,Math.floor(w*.5),w-13]){
    r(ctx,'#84978b',x+dx,y+6,2,4);r(ctx,'#b9bba0',x+dx,y+6,1,1);
  }
  // Trowel, fork and spare brush: no textual or tactical symbols.
  blocks(ctx,p.woodLight,[[x+12,y+11,2,12],[x+Math.floor(w*.5),y+11,2,14],[x+w-13,y+11,2,16]]);
  blocks(ctx,p.metal,[[x+10,y+23,6,7],[x+11,y+30,4,3],[x+Math.floor(w*.5)-2,y+24,6,3],[x+Math.floor(w*.5)-2,y+27,1,6],[x+Math.floor(w*.5),y+27,1,7],[x+Math.floor(w*.5)+3,y+27,1,6]]);
  blocks(ctx,p.metalLight,[[x+10,y+23,2,6],[x+Math.floor(w*.5)-2,y+24,6,1]]);
  r(ctx,'#9c9270',x+w-17,y+27,10,7);r(ctx,'#c0af80',x+w-16,y+27,8,2);r(ctx,'#6c6a50',x+w-13,y+29,1,5);
  for(const dx of [1,w-4])rivet(ctx,x+dx,y+5);
  blocks(ctx,p.woodLight+'59',[[x+1.5,y+9,.5,h-14],[x+w-3.5,y+10,.5,h-16],[x+6,y+4.5,w*.4,.5]]);
  blocks(ctx,'#3d4d3d5c',[[x+12.5,y+13,.5,8],[x+Math.floor(w*.5)+.5,y+13,.5,10]]);
  blocks(ctx,'#d4d2b66b',[[x+10.5,y+24,.5,4],[x+Math.floor(w*.5)-1,y+24,4,.5],[x+w-15,y+28,5,.5]]);
}
function toolBucket(ctx:Context,p:Materials,x:number,y:number){
  blocks(ctx,EDGE,[[x+1,y+5,16,12],[x+3,y+17,12,2]]);r(ctx,p.metal,x+3,y+7,12,10);
  r(ctx,p.metalLight,x+2,y+5,14,2);r(ctx,p.metalLight,x+4,y+8,2,7);r(ctx,'#425b56',x+13,y+8,2,9);
  blocks(ctx,p.woodLight,[[x+6,y-4,2,13],[x+11,y-1,2,10]]);r(ctx,p.metalLight,x+4,y-6,6,3);r(ctx,'#6b806c',x+10,y-3,4,3);
}
function foldedCloth(ctx:Context,x:number,y:number,w:number,color:string){
  r(ctx,EDGE,x,y+2,w,7);r(ctx,color,x+1,y+1,w-3,6);r(ctx,'#afb9a080',x+2,y+1,w-5,1);
  r(ctx,'#314b4f65',x+5,y+3,2,4);r(ctx,'#314b4f65',x+w-7,y+2,1,5);
  for(let xx=x+3;xx<x+w-4;xx+=4)r(ctx,'#d1d1b26b',xx,y+2,1,.5);
  r(ctx,'#c0c8b04d',x+8,y+3,w-17,.5);r(ctx,'#213e453d',x+8,y+5,w-15,.5);
}
function produceTray(ctx:Context,p:Materials,x:number,y:number,w:number,green=false){
  r(ctx,EDGE,x,y+3,w,9);r(ctx,p.wood,x+1,y+5,w-2,6);r(ctx,p.woodLight,x+1,y+4,w-2,2);
  const color=green?'#879665':'#b58b5c',light=green?'#b0b78a':'#d1ae79';
  for(const dx of [4,12,w-8]){
    r(ctx,color,x+dx,y,6,5);r(ctx,light,x+dx+1,y,3,.5);r(ctx,'#66744f',x+dx+2,y-2,1,2);
    r(ctx,'#e3d0a15c',x+dx+1,y+1,.5,1);r(ctx,'#4354383d',x+dx+4,y+2,1,2);
  }
  r(ctx,WOOD_SHADE,x+4,y+9,w-8,1);
}

/** A few fixed traces collect around each work area's feet, inside its 170 × 100 box. */
function groundTraces(ctx:Context,kind:SceneVignetteKind){
  switch(kind){
    case 'garden-bench':
      blocks(ctx,'#294b3c36',[[8,88,15,2],[14,90,17,2],[27,89,7,2]]);
      blocks(ctx,'#77875b32',[[12,88,6,1],[25,91,4,1]]);
      blocks(ctx,'#594c3b42',[[52,91,10,2],[58,93,7,1],[69,90,3,2]]);
      blocks(ctx,'#87936538',[[112,92,3,2],[115,91,2,1],[128,88,3,1]]);
      break;
    case 'potting-corner':
      blocks(ctx,'#57483742',[[100,91,14,2],[108,93,9,2],[119,92,4,1],[98,94,3,1]]);
      blocks(ctx,'#9c876032',[[104,91,3,1],[115,94,2,1],[124,91,2,1]]);
      blocks(ctx,'#627c4b38',[[22,92,4,2],[26,91,2,1],[34,94,3,1]]);
      break;
    case 'alley-supplies':
      blocks(ctx,'#315b6530',[[26,88,15,2],[31,90,21,2],[45,89,12,1]]);
      blocks(ctx,'#92aba326',[[34,90,9,1],[48,89,4,1]]);
      blocks(ctx,'#95886a2b',[[75,93,4,1],[81,95,2,1],[146,89,3,2]]);
      break;
    case 'market-goods':
      blocks(ctx,'#72624632',[[76,92,15,1],[82,94,6,1]]);
      blocks(ctx,'#b29a6930',[[100,93,3,1],[106,95,2,1],[115,91,2,2]]);
      blocks(ctx,'#6c805437',[[151,93,3,1],[154,92,2,1]]);
      break;
    case 'tunnel-tools':
      blocks(ctx,'#254c5d38',[[26,88,27,3],[35,91,40,2],[46,93,19,2]]);
      blocks(ctx,'#83aaa42b',[[39,91,15,1],[64,92,7,1]]);
      blocks(ctx,'#71867629',[[78,89,3,1],[84,93,2,1]]);
      break;
    case 'warehouse-workbench':
      blocks(ctx,'#252f3030',[[77,90,22,1],[87,92,16,1],[130,89,18,1]]);
      blocks(ctx,'#afa38723',[[79,91,12,1],[132,90,7,1]]);
      blocks(ctx,'#a48b6235',[[20,95,8,1],[29,93,3,2],[37,96,5,1]]);
      break;
  }
}

function gardenBench(ctx:Context,scene:BattleSceneId,p:Materials,index:number){
  paintSceneProp(ctx,scene,'trellis',4,4,68,index);
  bench(ctx,p,51,52,104,33);
  // The shelf is planted, with a lower crate and watering can beside its legs.
  paintSceneProp(ctx,scene,'planter',64,12,50,index);
  trough(ctx,p,117,45,32,index);
  paintSceneProp(ctx,scene,'sacks',83,57,38,index);
  trough(ctx,p,10,75,45,index+1);
  wateringCan(ctx,p,140,69);
  r(ctx,'#a59976',58,57,7,2);r(ctx,'#6f7b61',61,55,3,2);
}
function pottingCorner(ctx:Context,scene:BattleSceneId,p:Materials,index:number){
  toolRack(ctx,p,15,11,62,46);
  bench(ctx,p,12,55,92,31);
  smallPot(ctx,20,44,15);smallPot(ctx,38,44,13,false);
  r(ctx,'#62523c',58,48,26,6);r(ctx,'#86714d',60,47,21,3);r(ctx,p.woodLight,76,46,14,2);
  r(ctx,p.metal,87,45,6,4);r(ctx,p.metalLight,87,45,5,1);
  paintSceneProp(ctx,scene,'sacks',42,53,43,index);
  bench(ctx,p,108,72,54,17);
  paintSceneProp(ctx,scene,'planter',103,22,63,index+1);
  paintSceneProp(ctx,scene,'broken-pot',107,57,36,index);
  toolBucket(ctx,p,82,70);
  wateringCan(ctx,p,137,76);
}
function alleySupplies(ctx:Context,scene:BattleSceneId,p:Materials,index:number){
  // A broom and folded cover connect the bins to a single stored delivery pile.
  blocks(ctx,WOOD_SHADE,[[61,20,3,51],[57,67,12,15]]);r(ctx,p.woodLight,61,21,1,49);
  r(ctx,'#9c9371',58,69,10,11);r(ctx,'#b8ab82',59,69,8,2);r(ctx,'#746e53',62,72,1,8);
  paintSceneProp(ctx,scene,'bin',3,14,76,index);
  pallet(ctx,p,76,75,85);
  paintSceneProp(ctx,scene,'warehouse-crates',70,18,68,index);
  paintSceneProp(ctx,scene,'sacks',123,40,44,index+1);
  foldedCloth(ctx,91,31,28,'#657f79');
  smallPot(ctx,8,76,12);herb(ctx,p,14,78,false);
}
function marketGoods(ctx:Context,scene:BattleSceneId,p:Materials,index:number){
  pallet(ctx,p,12,78,87);pallet(ctx,p,109,81,46);
  paintSceneProp(ctx,scene,'warehouse-crates',5,17,75,index);
  bench(ctx,p,74,48,79,29);
  produceTray(ctx,p,81,38,30);produceTray(ctx,p,116,38,30,true);
  foldedCloth(ctx,27,34,25,'#8c7970');
  paintSceneProp(ctx,scene,'sacks',110,47,48,index+1);
  // Low baskets sit under the counter; their muted rims avoid reading as UI.
  for(const x of [79,93]){smallPot(ctx,x,70,12,false);r(ctx,'#827657',x+2,75,8,1);}
  r(ctx,p.woodLight,61,51,3,22);r(ctx,WOOD_SHADE,61,70,9,3);
}
function tunnelTools(ctx:Context,p:Materials){
  contact(ctx,15,88,137);
  // Hand-portable storage only, including the loading fallback.
  blocks(ctx,EDGE,[[83,16,37,59],[14,52,73,37],[91,62,64,27]]);
  blocks(ctx,p.wood,[[85,18,33,55]]);
  blocks(ctx,p.woodLight,[[87,19,2,52],[115,21,1,49]]);
  blocks(ctx,p.metal,[[17,55,67,31],[94,65,58,20]]);
  blocks(ctx,p.metalLight,[[17,55,67,3],[18,58,2,25],[94,65,58,2]]);
  blocks(ctx,EDGE,[[32,45,34,11],[97,68,51,11]]);
  blocks(ctx,p.metal,[[35,47,28,3],[35,49,3,5],[60,49,3,5]]);
  blocks(ctx,'#d0bd8c',[[46,65,8,11],[48,68,4,5]]);
  for(const [inset,y] of [[0,69],[4,72],[8,75]]){
    r(ctx,'#737c78',101+inset,y,41-inset*2,1);
    r(ctx,'#323d40',102+inset,y+1,39-inset*2,1);
  }
  blocks(ctx,p.metalLight,[[94,27,3,25],[91,27,9,4],[92,24,2,6],[98,24,2,6],[108,37,2,17]]);
  blocks(ctx,'#8c6d4b',[[106,25,6,13]]);
  foldedCloth(ctx,18,55,27,'#7c8a75');
}
function warehouseWorkbench(ctx:Context,scene:BattleSceneId,p:Materials,index:number){
  toolRack(ctx,p,91,9,62,43);
  paintSceneProp(ctx,scene,'storage-rack',3,10,76,index);
  bench(ctx,p,75,54,86,31,true);
  paintSceneProp(ctx,scene,'cable',94,56,40,index);
  foldedCloth(ctx,128,48,23,'#7b8b7b');
  r(ctx,EDGE,87,44,23,11);r(ctx,p.metal,89,46,19,8);r(ctx,p.metalLight,89,46,16,2);
  blocks(ctx,'#929d88',[[94,41,10,3],[94,43,2,3],[102,43,2,3]]);
  r(ctx,p.woodLight,113,48,10,2);r(ctx,p.metalLight,121,46,5,5);
  pallet(ctx,p,13,83,54);paintSceneProp(ctx,scene,'warehouse-crates',13,41,51,index+1);
}

/** Static background grouping, in a 170 × 100 local box; placement belongs to the backdrop. */
export function paintSceneVignette(ctx:Context,scene:BattleSceneId,kind:SceneVignetteKind,x:number,y:number,width:number,index=0){
  if(!Number.isFinite(width)||width<=0)return;
  const p=materials[scene];
  ctx.save();ctx.translate(x,y);ctx.scale(width/170,width/170);ctx.imageSmoothingEnabled=false;
  if(paintDetailedWorkstation(ctx,kind,170,100)){ctx.restore();return;}
  // Reused props share the map's materials, with a quieter contrast for background scenery.
  ctx.globalAlpha*=.87;
  groundTraces(ctx,kind);
  switch(kind){
    case 'garden-bench':gardenBench(ctx,scene,p,index);break;
    case 'potting-corner':pottingCorner(ctx,scene,p,index);break;
    case 'alley-supplies':alleySupplies(ctx,scene,p,index);break;
    case 'market-goods':marketGoods(ctx,scene,p,index);break;
    case 'tunnel-tools':tunnelTools(ctx,p);break;
    case 'warehouse-workbench':warehouseWorkbench(ctx,scene,p,index);break;
  }
  ctx.restore();
}
