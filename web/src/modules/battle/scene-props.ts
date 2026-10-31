/** Small, deterministic pixel props. Callers own placement, clipping and game state. */
export interface ScenePropPalette {
  metal:string;
  metalLight:string;
  timber:string;
  timberLight:string;
  water:string;
  moss:string;
}

type Context=CanvasRenderingContext2D;
type Shape=readonly [number,number,number,number];
const INK='#23343b';
const DEEP='#172a33';
const WOOD_DARK='#534639';
const r=(ctx:Context,color:string,x:number,y:number,w:number,h:number)=>{
  ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
};
const blocks=(ctx:Context,color:string,shapes:readonly Shape[])=>{
  for(const [x,y,w,h] of shapes)r(ctx,color,x,y,w,h);
};
/** Cut corners keep silhouettes stepped, including at very small board scales. */
function cutPanel(ctx:Context,color:string,x:number,y:number,w:number,h:number,cut=2){
  r(ctx,color,x+cut,y,w-cut*2,h);
  r(ctx,color,x,y+cut,w,h-cut*2);
}
function bolt(ctx:Context,x:number,y:number,light='#c7cebb'){
  r(ctx,DEEP,x,y,3,3);r(ctx,light,x,y,2,.75);r(ctx,'#7e8d87',x+1,y+1,1,1);r(ctx,'#dce0c66b',x+.5,y+.5,.5,.5);r(ctx,'#26383c80',x+1,y+1.5,1,.5);
}
function shadow(ctx:Context,x=10,y=63,w=60){
  ctx.save();ctx.translate(x+w/2,y+1.5);ctx.scale(w/2,4.5);
  const shade=ctx.createRadialGradient(0,0,.1,0,0,1);
  shade.addColorStop(0,'#14283480');shade.addColorStop(.45,'#14283452');shade.addColorStop(.8,'#1428341f');shade.addColorStop(1,'#14283400');
  ctx.fillStyle=shade;ctx.fillRect(-1,-1,2,2);ctx.restore();
}
function woodGrain(ctx:Context,x:number,y:number,w:number,h:number,tint:string,variant=0){
  for(let row=0;row<3;row++){
    const gy=y+3+row*Math.max(3,Math.floor((h-5)/3));
    const offset=(variant+row*3)%5;
    r(ctx,WOOD_DARK+'75',x+2+offset,gy,Math.max(3,w-8-offset),1);
    r(ctx,tint+'70',x+3+offset,gy+1,Math.max(2,Math.floor(w/3)),.5);
    r(ctx,WOOD_DARK+'3d',x+4+offset,gy-.75,Math.max(2,w*.27),.5);
  }
  if(w>19&&h>14){
    const kx=x+Math.floor(w*.6),ky=y+Math.floor(h*.56);
    blocks(ctx,WOOD_DARK+'aa',[[kx,ky,4,1],[kx-1,ky+1,2,2],[kx+3,ky+1,2,2],[kx,ky+3,4,1]]);
    r(ctx,tint+'99',kx+1,ky+1,2,.5);r(ctx,tint+'45',kx-1,ky+4,6,.5);
  }
}
function crate(ctx:Context,p:ScenePropPalette,x:number,y:number,w:number,h:number,variant=0){
  cutPanel(ctx,DEEP,x,y,w,h);
  r(ctx,p.timber,x+2,y+5,w-7,h-7);
  r(ctx,p.timberLight,x+4,y+1,w-9,4);
  r(ctx,'#ad875b',x+2,y+4,w-7,2);
  r(ctx,WOOD_DARK,x+w-5,y+5,4,h-8);
  r(ctx,p.timberLight+'70',x+w-4,y+7,1,h-12);
  for(let k=8;k<w-8;k+=8){r(ctx,WOOD_DARK+'bb',x+k,y+7,1,h-10);r(ctx,p.timberLight+'75',x+k+1,y+7,1,h-10);}
  woodGrain(ctx,x+3,y+6,w-9,h-9,p.timberLight,variant);
  blocks(ctx,p.timberLight,[[x+2,y+6,3,h-9],[x+w-9,y+6,3,h-9],[x+3,y+h-5,w-10,3]]);
  // One diagonal brace is built from square steps, not a smoothed stroke.
  const steps=Math.min(Math.floor((w-13)/3),Math.floor((h-10)/3));
  for(let k=0;k<steps;k++){
    const xx=variant%2?x+w-12-k*3:x+6+k*3;
    r(ctx,WOOD_DARK,xx,y+7+k*3,5,4);r(ctx,p.timberLight,xx,y+7+k*3,4,2);
  }
  for(const [xx,yy] of [[x+2,y+7],[x+w-9,y+7],[x+2,y+h-5],[x+w-9,y+h-5]])bolt(ctx,xx,yy,'#d4c393');
}
function lantern(ctx:Context,x:number,y:number,red=false){
  blocks(ctx,'#efba5720',[[x-3,y+4,20,22],[x,y+1,14,28]]);
  blocks(ctx,DEEP,[[x+5,y,4,4],[x+2,y+4,10,2],[x,y+6,14,15],[x+2,y+21,10,3]]);
  r(ctx,red?'#a64c3e':'#b8843f',x+2,y+6,10,15);
  r(ctx,red?'#e29357':'#edc16d',x+3,y+7,7,12);
  r(ctx,'#ffe5a3',x+5,y+8,3,10);
  blocks(ctx,'#583f32',[[x+2,y+6,1,15],[x+10,y+6,2,15],[x+2,y+12,10,1]]);
  blocks(ctx,'#d8b373',[[x+2,y+4,8,1],[x+3,y+21,7,1]]);
  r(ctx,'#9d7653',x+6,y+24,2,3);
}
/** Tapered blades stay in the old leaf boxes; veins follow their growth direction. */
function leafBlade(ctx:Context,x:number,y:number,w:number,h:number,mid:string,light:string,upright=false){
  const points=upright?[[.48,0],[.85,.25],[1,.65],[.56,1],[.12,.78],[0,.3]]:[[0,.55],[.24,.12],[.67,0],[1,.38],[.8,.76],[.35,1]];
  ctx.save();ctx.beginPath();ctx.moveTo(x+points[0][0]*w,y+points[0][1]*h);
  for(const [px,py]of points.slice(1))ctx.lineTo(x+px*w,y+py*h);
  ctx.closePath();ctx.fillStyle='#294a3e';ctx.fill();ctx.clip();
  r(ctx,mid,x+.5,y+.5,w-1,h-1);
  if(upright){
    r(ctx,light+'70',x+w*.3,y+h*.18,w*.24,h*.58);
    for(let step=0;step<5;step++){
      const yy=y+h*.16+step*h*.15,xx=x+w*.48-step*.15;
      r(ctx,'#b8c99466',xx,yy,.5,Math.max(.75,h*.14));
      if(step%2===0){r(ctx,'#243f344d',xx-1.5,yy+1,1.5,.5);r(ctx,light+'70',xx+.5,yy,1.5,.5);}
    }
  }else{
    r(ctx,light+'66',x+w*.17,y+h*.23,w*.52,h*.21);
    for(let step=0;step<5;step++){
      const xx=x+w*.1+step*w*.15,yy=y+h*.6-step*h*.065;
      r(ctx,'#bfd5a673',xx,yy,Math.max(.75,w*.16),.5);
      if(step===1||step===3){r(ctx,'#243f3452',xx+1,yy+1,.5,h*.17);r(ctx,light+'66',xx+.5,yy-h*.2,.5,h*.2);}
    }
  }
  ctx.restore();
}
function leafCluster(ctx:Context,x:number,y:number,variant=0){
  const mid=variant%2?'#5d815d':'#548464',light=variant%2?'#91ab70':'#8bb481';
  // The five authored leaves keep exactly the former cluster's envelope.
  leafBlade(ctx,x-11,y-2,10,6,mid,light);
  leafBlade(ctx,x+2,y-9,11,8,mid,light);
  leafBlade(ctx,x-4,y-14,6,12,mid,light,true);
  leafBlade(ctx,x-11,y+7,10,6,mid,light);
  leafBlade(ctx,x+2,y+3,12,7,mid,light);
  blocks(ctx,'#829961',[[x,y-3,1.5,16],[x-3,y+1,4,1],[x+1,y-3,4,1],[x+1,y+7,5,.75]]);
  blocks(ctx,'#c1cc985c',[[x,y-2,.5,13],[x-2,y+1,2,.5],[x+2,y-3,2,.5]]);
}

function pot(ctx:Context,x:number,y:number,w=22,h=19){
  cutPanel(ctx,'#4b3936',x,y,w,7,2);
  blocks(ctx,'#4b3936',[[x+1,y+6,w-2,4],[x+2,y+10,w-4,h-13],[x+4,y+h-3,w-8,3]]);
  blocks(ctx,'#b47853',[[x+2,y+6,w-4,4],[x+3,y+10,w-6,h-13]]);
  blocks(ctx,'#8a5546',[[x+w-6,y+6,4,4],[x+w-7,y+10,4,h-13]]);
  blocks(ctx,'#cc9568',[[x+3,y+6,3,4],[x+4,y+10,2,h-14]]);
  r(ctx,'#e2b581',x+3,y+1,w-6,2);
  r(ctx,'#bc835b',x+1,y+3,w-2,3);
  r(ctx,'#3b3731',x+4,y+3,w-8,2);
  r(ctx,'#71543c',x+6,y+3,w-12,1);
  r(ctx,'#694939',x+4,y+h-3,w-8,2);
  blocks(ctx,'#e1af7970',[[x+4,y+8,2,2],[x+6,y+h-6,4,1]]);
  const glaze=ctx.createLinearGradient(x+2,y,x+w-2,y);
  glaze.addColorStop(0,'#e7b68a08');glaze.addColorStop(.22,'#f6d4a12b');glaze.addColorStop(.62,'#c1865900');glaze.addColorStop(1,'#352f392d');
  ctx.fillStyle=glaze;ctx.fillRect(x+2,y+6,w-4,4);ctx.fillRect(x+3,y+10,w-6,h-13);
  blocks(ctx,'#f1cba666',[[x+4,y+1,w-9,.5],[x+4,y+7,.5,2],[x+5,y+11,.5,Math.max(1,h-16)]]);
  blocks(ctx,'#5c443757',[[x+w-8,y+8,1,.5],[x+w-9,y+9,.5,2],[x+7,y+h-5,4,.5]]);
  blocks(ctx,'#b2946573',[[x+7,y+3,2,.5],[x+w-10,y+3.5,1,.5]]);r(ctx,'#e6d5af5c',x+w-8,y+1,2,.5);
}
function sack(ctx:Context,x:number,y:number,w:number,h:number,variant=0){
  blocks(ctx,WOOD_DARK,[[x+5,y,w-10,4],[x+7,y+4,w-14,5],[x+3,y+9,w-6,5],[x,y+14,w,h-18],[x+3,y+h-4,w-6,4]]);
  blocks(ctx,variant?'#9b906a':'#a18b61',[[x+8,y+2,w-16,6],[x+5,y+9,w-10,7],[x+2,y+15,w-4,h-20],[x+5,y+h-5,w-10,3]]);
  blocks(ctx,'#d4bf8b',[[x+7,y+10,3,8],[x+4,y+18,3,h-24],[x+7,y+h-6,w-14,2],[x+8,y+2,3,3]]);
  blocks(ctx,'#706849',[[x+w-7,y+14,3,h-20],[x+7,y+7,w-14,2],[x+9,y+5,2,5]]);
  r(ctx,'#c9a777',x+7,y+7,w-14,1);
  for(let sy=y+17;sy<y+h-7;sy+=4){r(ctx,'#e2ce9c70',x+Math.floor(w*.6),sy,1.5,.5);r(ctx,'#6c5d3b52',x+w-7,sy,.5,1.5);}
  blocks(ctx,'#796d4d80',[[x+8,y+19,4,1],[x+10,y+22,3,1],[x+7,y+h-10,5,1]]);
}
function canopy(ctx:Context,p:ScenePropPalette,kind:string,index:number){
  const food=kind==='food-stall',toy=kind==='toy-stall';
  const roof=food?'#a65b4b':toy?'#467d81':'#667950';
  const bright=food?'#d98b67':toy?'#88b6ad':'#b1b47c';
  // Back wall, posts and a shallow roof give the counter a visible interior.
  cutPanel(ctx,DEEP,7,10,66,58,3);
  r(ctx,'#34433e',12,25,55,24);r(ctx,'#192d31',17,29,44,18);
  blocks(ctx,p.timber,[[11,19,5,47],[64,19,5,47],[14,48,51,15]]);
  blocks(ctx,p.timberLight,[[11,22,2,42],[64,22,2,42],[16,48,49,3]]);
  r(ctx,'#66503a',16,53,47,9);woodGrain(ctx,17,52,45,10,p.timberLight,index);
  for(const x of [25,41,57]){r(ctx,WOOD_DARK,x,53,1,9);r(ctx,p.timberLight+'60',x+1,53,1,9);}
  blocks(ctx,INK,[[12,5,56,4],[8,9,64,6],[5,15,70,13]]);
  r(ctx,roof,13,7,54,5);r(ctx,bright,15,7,50,2);
  r(ctx,roof,9,11,62,6);r(ctx,bright+'b0',11,11,58,2);
  for(let k=0;k<7;k++){
    const x=6+k*10,cream=k%2===1;
    r(ctx,cream?'#e5d3a8':roof,x,17,9,8);
    r(ctx,cream?'#f8e6bc':bright,x,17,8,2);
    r(ctx,cream?'#ac9c7a':'#624d44',x+1,24,7,3);
    r(ctx,DEEP,x+2,27,5,1);
  }
  r(ctx,WOOD_DARK,13,44,55,5);r(ctx,p.timberLight,13,44,55,2);r(ctx,'#edca8c',15,44,49,1);
  if(food){
    // A shallow bowl, fish and a basket of bread, distinct at tile scale.
    blocks(ctx,'#798f89',[[20,38,19,3],[23,41,13,3]]);r(ctx,'#d8debe',21,37,17,2);
    blocks(ctx,'#adbec0',[[24,34,10,3],[22,35,3,3],[34,33,3,5]]);r(ctx,'#edf0d3',25,34,7,1);r(ctx,DEEP,26,35,1,1);
    r(ctx,'#674c35',44,37,17,7);r(ctx,'#bd9660',45,38,15,5);r(ctx,'#ddba7c',46,40,13,1);
    blocks(ctx,'#c58c4f',[[45,34,7,4],[52,33,7,5]]);blocks(ctx,'#f0cf88',[[46,34,5,1],[53,33,4,1]]);
  }else if(toy){
    cutPanel(ctx,'#947363',21,32,10,12,2);r(ctx,'#c79c85',23,32,6,10);r(ctx,'#efd1a2',24,34,4,2);r(ctx,'#624d45',23,38,2,2);
    blocks(ctx,'#70989e',[[36,36,14,5],[39,33,9,4],[48,32,4,10]]);blocks(ctx,'#bbd3c2',[[39,34,7,1],[37,37,10,1]]);
    cutPanel(ctx,'#d4b479',53,36,7,7,2);r(ctx,'#f3d797',54,37,3,2);r(ctx,'#936b53',57,39,2,3);
  }else{
    blocks(ctx,'#846d50',[[21,30,17,13],[43,29,15,15]]);
    blocks(ctx,'#e2cda3',[[22,30,14,11],[44,29,12,13]]);
    blocks(ctx,'#f7e4ba',[[23,30,11,1],[45,29,9,1]]);
    blocks(ctx,'#73857b',[[25,33,8,1],[25,36,6,1],[47,32,6,1],[47,35,5,1],[47,38,7,1]]);
    blocks(ctx,'#b78a5b',[[22,30,2,2],[54,29,2,2]]);
  }
  bolt(ctx,11,47);bolt(ctx,65,47);
  lantern(ctx,index%2?60:6,35,true);
}
function bin(ctx:Context,p:ScenePropPalette){
  cutPanel(ctx,DEEP,17,21,37,43,3);
  r(ctx,p.metal,20,24,29,35);r(ctx,p.metalLight,20,25,4,31);
  r(ctx,'#294650',47,25,5,34);r(ctx,p.metalLight+'70',25,25,20,2);
  for(let k=0;k<3;k++){
    const x=29+k*6;r(ctx,'#28434a',x,29,2,25);r(ctx,p.metalLight+'75',x+2,30,1,23);
  }
  cutPanel(ctx,INK,13,17,45,8);r(ctx,p.metalLight,16,18,38,2);r(ctx,p.metal,16,20,39,3);
  blocks(ctx,INK,[[21,13,29,4],[29,9,13,4]]);r(ctx,p.metalLight,23,14,24,2);r(ctx,'#99adaa',31,10,8,1);
  cutPanel(ctx,'#c5ab73',30,34,10,12,1);r(ctx,'#e0c38a',31,35,7,2);blocks(ctx,'#68775f',[[33,38,4,2],[32,41,6,1]]);
  blocks(ctx,'#9a7a54',[[43,54,4,2],[44,56,3,2],[23,58,7,1]]);
  blocks(ctx,'#657468',[[56,49,12,12],[58,46,8,4],[60,43,4,4]]);r(ctx,'#a8b195',58,50,3,8);r(ctx,'#334b44',64,51,3,9);
  blocks(ctx,'#d0c6a0',[[53,61,5,2],[58,64,7,1]]);bolt(ctx,19,59);bolt(ctx,48,59);
  blocks(ctx,p.metalLight+'6b',[[17,18,35,.5],[21,27,.5,23],[25,25,17,.5]]);
  blocks(ctx,'#b3a17359',[[43,54,2,.5],[24,58,4,.5],[48,48,.5,3]]);
}
function trellis(ctx:Context,p:ScenePropPalette){
  cutPanel(ctx,DEEP,10,7,60,59,2);r(ctx,'#2c4647',15,12,50,48);
  blocks(ctx,'#779d9660',[[18,15,13,15],[34,15,13,15],[50,15,12,15],[18,33,13,20],[35,34,12,20],[50,34,12,20]]);
  blocks(ctx,'#b8d3bc65',[[19,16,2,10],[21,16,7,2],[35,16,2,10],[51,35,2,12],[53,35,6,2]]);
  for(const x of [13,31,48,65]){r(ctx,p.metal,x,10,3,51);r(ctx,p.metalLight,x,10,1,49);}
  for(const y of [10,30,57]){r(ctx,p.metal,13,y,55,3);r(ctx,p.metalLight,13,y,54,1);}
  // A missing glass corner is a stepped dark gap, with a restrained exposed edge.
  blocks(ctx,'#233c40',[[51,15,11,3],[55,18,7,4],[59,22,3,4]]);
  blocks(ctx,'#cfdfcba0',[[51,17,4,1],[55,21,4,1],[59,25,3,1]]);
  for(const [x,y] of [[13,10],[65,10],[13,57],[65,57]])bolt(ctx,x,y);
  blocks(ctx,'#476f50',[[24,19,2,30],[24,32,13,2],[36,32,2,15],[49,43,2,17]]);
  blocks(ctx,'#cedcc773',[[19.5,16,8,.5],[35.5,16,8,.5],[51.5,35,8,.5],[59,24.5,3,.5]]);
  blocks(ctx,'#a4855259',[[32,42,1,3],[33,45,.5,2],[65,25,.5,3],[55,58,4,.5]]);
  blocks(ctx,p.metalLight+'59',[[14,14,.5,39],[32,13,.5,13],[49,35,.5,18]]);
  leafCluster(ctx,25,25,1);leafCluster(ctx,52,45,0);pot(ctx,18,50,20,17);
}
function planter(ctx:Context){
  pot(ctx,11,43,25,21);pot(ctx,44,46,23,19);
  leafCluster(ctx,24,35);leafCluster(ctx,56,38,1);
  blocks(ctx,'#b88b68',[[19,20,3,4],[23,17,4,3],[27,20,3,4],[23,24,4,3]]);
  blocks(ctx,'#edc799',[[20,20,2,3],[23,18,3,2],[27,20,2,3],[23,24,3,2]]);r(ctx,'#f9df9d',23,21,4,3);
  blocks(ctx,'#cfbb88',[[55,23,3,3],[59,26,3,3]]);r(ctx,'#f3d5a3',56,23,2,1);
  blocks(ctx,'#ffe8bd80',[[20,20,1,.5],[24,18,1,.5],[27,21,.5,1],[24,24,1,.5],[24,21,1,1]]);
  blocks(ctx,'#93664b75',[[22,22,.5,1],[26,21,.5,2],[59,27,1,.5]]);
}
function brokenPot(ctx:Context){
  pot(ctx,12,42,23,20);leafCluster(ctx,24,34,1);
  cutPanel(ctx,'#513b34',39,44,28,18,3);
  blocks(ctx,'#b27b52',[[41,46,22,4],[39,50,7,9],[59,49,6,11],[45,58,15,4]]);
  blocks(ctx,'#e0ae77',[[42,46,19,2],[40,51,2,6],[46,58,12,1]]);
  blocks(ctx,'#4b4436',[[47,49,10,7],[44,54,16,4]]);blocks(ctx,'#786348',[[46,54,4,2],[54,51,3,2],[49,57,3,1]]);
  blocks(ctx,'#9a6749',[[50,38,8,5],[63,60,8,4],[36,63,6,3]]);blocks(ctx,'#d6a571',[[51,38,6,2],[64,60,5,1],[37,63,3,1]]);
  blocks(ctx,'#7c9761',[[57,43,2,8],[55,40,4,3],[59,42,4,2]]);
  blocks(ctx,'#b7d1be75',[[40,30,10,1],[49,27,2,4]]);
  blocks(ctx,'#efd0a182',[[42,46,16,.5],[40.5,52,.5,4],[47,58,9,.5],[51,38,5,.5],[64,60,4,.5]]);
  blocks(ctx,'#5d3e335c',[[42,51,.5,4],[61,52,.5,5],[52,40,3,.5],[66,62,2,.5]]);
  blocks(ctx,'#ac95675c',[[48,51,2,.5],[53,55,1,.5],[46,56,2,.5]]);
}
function drain(ctx:Context,p:ScenePropPalette){
  cutPanel(ctx,DEEP,10,20,60,43,3);cutPanel(ctx,p.metal,13,22,54,37,2);
  r(ctx,p.metalLight,16,23,48,2);r(ctx,'#263f47',17,28,46,26);
  for(let k=0;k<6;k++){
    const x=20+k*7;r(ctx,'#192f3b',x+2,29,4,24);r(ctx,p.metalLight,x,28,3,24);r(ctx,p.metal,x+2,29,2,24);
  }
  r(ctx,'#8c9e91',17,54,46,3);r(ctx,DEEP,17,57,46,2);
  for(const [x,y] of [[14,24],[63,24],[14,54],[63,54]])bolt(ctx,x,y);
  blocks(ctx,'#9f8055',[[15,47,3,5],[18,51,5,2],[59,25,4,2]]);
  blocks(ctx,p.water,[[16,63,47,3],[22,66,35,3],[29,69,21,2]]);
  blocks(ctx,'#a4c9c275',[[22,64,18,1],[43,67,9,1],[31,70,10,1]]);
  blocks(ctx,p.moss,[[12,57,6,3],[13,60,10,2],[60,59,6,3]]);
  blocks(ctx,'#cfdbc06b',[[18,23,43,.5],[22,29,.5,19],[43,29,.5,19],[57,29,.5,19]]);
  blocks(ctx,'#b69b675c',[[16,48,.5,3],[19,51,3,.5],[59,25,2,.5]]);
}
function pipe(ctx:Context,p:ScenePropPalette,valve:boolean){
  cutPanel(ctx,DEEP,5,29,70,29,3);r(ctx,p.metal,7,32,66,22);
  blocks(ctx,p.metalLight,[[9,33,62,4],[11,37,58,2]]);r(ctx,'#31505d',8,49,64,6);r(ctx,DEEP,11,54,58,2);
  for(const x of [14,59]){
    cutPanel(ctx,INK,x,23,9,38,2);r(ctx,p.metal,x+1,25,7,33);r(ctx,p.metalLight,x+1,25,2,30);
    r(ctx,'#b4c3ae',x+2,25,4,2);bolt(ctx,x+3,29,'#d8c28a');bolt(ctx,x+3,52,'#d8c28a');
  }
  blocks(ctx,'#9c7b50',[[26,48,6,2],[28,50,3,2],[52,39,4,2]]);
  blocks(ctx,p.metalLight+'66',[[10,33,59,.5],[24,37,18,.5],[48,37,8,.5]]);
  blocks(ctx,'#c0a77559',[[26,48,3,.5],[29,50,1,.5],[52,39,2,.5]]);
  blocks(ctx,'#27465359',[[26,44,11,.5],[45,46,7,.5]]);
  if(valve){
    r(ctx,DEEP,36,19,9,20);r(ctx,p.metalLight,37,20,6,17);r(ctx,p.metal,41,21,3,15);
    blocks(ctx,'#533b32',[[27,7,26,4],[22,11,5,5],[18,16,5,15],[22,31,5,5],[27,36,26,4],[53,31,5,5],[58,16,5,15],[53,11,5,5]]);
    blocks(ctx,'#b57950',[[28,8,24,4],[23,12,5,5],[20,17,4,13],[24,30,4,5],[28,34,24,4],[52,30,4,5],[56,17,4,13],[52,12,4,5]]);
    blocks(ctx,'#e7b775',[[29,8,21,2],[24,12,3,2],[20,18,2,10],[29,34,18,1],[52,13,2,3]]);
    blocks(ctx,'#bc8c5d',[[38,12,5,23],[24,21,31,5]]);blocks(ctx,'#efca88',[[38,13,2,20],[25,21,29,2]]);
    cutPanel(ctx,WOOD_DARK,36,20,9,9,2);r(ctx,'#edc586',38,22,5,4);r(ctx,'#8e6949',40,24,3,2);
  }else{
    blocks(ctx,'#263f49',[[33,32,6,23],[38,36,7,13]]);blocks(ctx,'#b1c4b3',[[32,33,2,10],[38,47,2,6]]);
    blocks(ctx,'#a28355',[[42,43,4,3],[43,47,2,3]]);
    blocks(ctx,p.water,[[35,58,3,5],[34,64,9,2],[39,68,19,2],[35,71,27,2]]);
    blocks(ctx,'#a4c7c275',[[36,59,1,2],[40,68,7,1],[38,71,13,1]]);
  }
}
function rack(ctx:Context,p:ScenePropPalette){
  cutPanel(ctx,DEEP,8,8,64,59,2);r(ctx,'#2e4246',13,12,54,48);
  blocks(ctx,'#52625c',[[16,15,48,18],[16,39,48,18]]);
  crate(ctx,p,18,16,23,18,0);crate(ctx,p,42,39,21,19,1);
  cutPanel(ctx,'#897e60',46,20,15,12,2);r(ctx,'#b6aa7c',47,21,12,3);r(ctx,'#cbb98b',48,24,2,6);
  cutPanel(ctx,'#8a7860',19,43,17,14,2);r(ctx,'#c4ad81',21,44,13,3);r(ctx,'#675b4b',29,47,2,9);
  for(const y of [11,35,60]){r(ctx,DEEP,11,y,58,5);r(ctx,p.metalLight,12,y,56,2);r(ctx,p.metal,12,y+2,56,2);}
  for(const x of [11,65]){r(ctx,DEEP,x,9,5,57);r(ctx,p.metal,x+1,10,4,54);r(ctx,p.metalLight,x+1,10,1,53);for(const y of [13,37,61])bolt(ctx,x+1,y);}
  blocks(ctx,p.metalLight,[[9,65,10,3],[62,65,10,3]]);
}
function cable(ctx:Context,p:ScenePropPalette){
  // A stepped spool shows curved flanges and coiled cable without soft ellipses.
  blocks(ctx,DEEP,[[15,23,9,40],[12,29,15,28],[57,23,9,40],[54,29,15,28],[23,28,34,30]]);
  blocks(ctx,p.timber,[[17,24,5,38],[14,30,11,26],[59,24,5,38],[56,30,11,26]]);
  blocks(ctx,p.timberLight,[[17,24,2,35],[14,31,2,21],[59,24,2,35],[56,31,2,21],[17,25,5,2],[59,25,5,2]]);
  r(ctx,'#364b54',24,29,31,28);
  for(let k=0;k<6;k++){
    const x=25+k*5;r(ctx,'#203642',x,30,4,26);r(ctx,'#879c9c',x,30,2,23);r(ctx,'#abc0b3',x,31,1,5);
  }
  blocks(ctx,'#1b303a',[[49,56,14,3],[60,58,4,9],[51,66,12,3],[48,64,4,3]]);
  blocks(ctx,'#738d92',[[50,56,11,1],[61,59,1,6],[52,66,9,1]]);
  for(const x of [17,59]){bolt(ctx,x,32,'#d1ba85');bolt(ctx,x,53,'#d1ba85');}
}
function barrier(ctx:Context,p:ScenePropPalette){
  for(const x of [12,63]){
    cutPanel(ctx,DEEP,x-2,17,9,48,2);r(ctx,p.metal,x,19,5,43);r(ctx,p.metalLight,x,19,2,41);
    r(ctx,p.metalLight,x-4,63,14,3);r(ctx,DEEP,x-3,66,13,2);
  }
  cutPanel(ctx,INK,11,25,59,19,2);r(ctx,'#c3a569',14,27,53,13);r(ctx,'#ead09a',15,27,50,2);
  for(let k=0;k<6;k++){
    const x=17+k*8;blocks(ctx,'#485150',[[x,29,4,3],[x-1,32,4,3],[x-2,35,4,4]]);
  }
  r(ctx,'#806a47',15,40,50,2);bolt(ctx,14,30);bolt(ctx,64,30);
  blocks(ctx,'#e5c38b70',[[27,39,7,1],[51,29,5,1]]);
}

/** Draw one existing obstacle in local 80 × 80 coordinates; no text or hit areas. */
export function paintDetailedSceneProp(ctx:Context,palette:ScenePropPalette,kind:string,index=0){
  ctx.save();ctx.imageSmoothingEnabled=false;
  shadow(ctx);
  if(kind==='food-stall'||kind==='toy-stall'||kind==='notice-stall')canopy(ctx,palette,kind,index);
  else if(kind==='bin')bin(ctx,palette);
  else if(kind==='crate'){
    crate(ctx,palette,12,30,40,34,index);crate(ctx,palette,38,13,29,26,index+1);lantern(ctx,59,37);
  }else if(kind==='warehouse-crates'){
    crate(ctx,palette,7,35,34,30,index);crate(ctx,palette,39,32,34,33,index+1);crate(ctx,palette,24,9,32,28,index+2);
    r(ctx,'#d9c797',31,18,12,8);r(ctx,'#eedab0',32,18,9,1);blocks(ctx,'#738278',[[33,21,7,1],[33,23,5,1]]);
  }else if(kind==='sacks'){
    sack(ctx,9,24,31,40);sack(ctx,38,18,32,47,1);r(ctx,palette.moss,8,64,20,2);
  }else if(kind==='planter')planter(ctx);
  else if(kind==='broken-pot')brokenPot(ctx);
  else if(kind==='trellis')trellis(ctx,palette);
  else if(kind==='drain')drain(ctx,palette);
  else if(kind==='pipe'||kind==='valve')pipe(ctx,palette,kind==='valve');
  else if(kind==='storage-rack')rack(ctx,palette);
  else if(kind==='cable')cable(ctx,palette);
  else barrier(ctx,palette);
  ctx.restore();
}
