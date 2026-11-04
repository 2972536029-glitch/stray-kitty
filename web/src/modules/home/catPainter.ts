import {breeds,drawPixelCat} from '../../adapters/canvas/pixelCat';
import type {LifeCat} from './life';
import {currentCatMood} from './dialogue';
import {drawCat} from '../battle/l00/painter';
import type {HomeCatBreed} from './layout';

function drawResidentBody(ctx:CanvasRenderingContext2D,breed:HomeCatBreed,mood:'brave'|'worried'|'idle'){
  if(breed==='advisor')drawCat(ctx,'advisor',0,0,64,mood==='brave'?'hurt':'idle');
  else drawPixelCat(ctx,breed,mood);
}

/** Every shared action uses the project's original cat, including its markings. */
export function residentTransform(cat:LifeCat,time:number,held=false){
  const t=time*.004+cat.seed,pose=cat.pose,kind=cat.social?.kind;
  const sleeping=pose==='hammock_sleep'||kind==='nap';
  const jump=-(cat.scriptedHeight??0)+(cat.startledUntil>time?-Math.sin((cat.startledUntil-time)/650*Math.PI)*6:0);
  let x=cat.x,y=cat.y+jump,sx=1,sy=1,angle=0;
  if(cat.action==='walk')y-=Math.abs(Math.sin(t*3))*3;
  if(sleeping){sy=.6;sx=1.06;angle=Math.sin(t*.3)*.025;}
  else if(pose==='belly'){angle=Math.PI/2+Math.sin(t)*.05;sx=.8;sy=.9;y-=19;}
  else if(pose==='knead'){sy=.78;y+=Math.sin(t*2);}
  else if(pose==='castle_peek'){sx=.7;sy=.7;y+=3;}
  else if(pose==='bowl_eat'){sy=.8;angle=cat.facing*(.12+Math.sin(t*1.6)*.06);y+=Math.sin(t*2)*2;}
  else if(pose==='scratch'){angle=cat.facing*-.12;y-=Math.max(0,Math.sin(t*3))*3;}
  else if(pose==='groom_self'||kind==='groom'){angle=cat.facing*Math.sin(t*1.3)*.13;sy=.9;}
  else if(pose==='stretch'){sx=1.12;sy=.78;y+=Math.sin(t)*2;}
  else if(pose==='sniff'||pose==='investigate'){angle=cat.facing*Math.sin(t)*.08;x+=Math.sin(t)*3;}
  else if(pose==='watch'){y-=2+Math.sin(t)*2;}
  if(kind==='nose')x+=cat.facing*Math.max(0,Math.sin(t))*3;
  if(kind==='rub'){angle=cat.facing*Math.sin(t)*.12;x+=cat.facing*2;}
  if(kind==='play')y-=Math.max(0,Math.sin(t*2))*8;
  if(held){angle=Math.sin(t*2)*.06;sy=1.05;}
  if((cat.petReactionUntil??0)>time&&!held){const mood=currentCatMood(cat,time);if(mood==='happy')angle+=Math.sin(t)*.035;else if(mood==='irritated')angle+=Math.sin(t*3)*.055;}
  return {x:Math.round(x),y:Math.round(y),angle,sx:cat.facing*sx,sy:sy*(1+Math.sin(t*.5)*.014)};
}
/** Inverse of the exact body transform, including sleeping, rolling and jumps. */
export function residentLocalPoint(cat:LifeCat,time:number,x:number,y:number){
  const f=residentTransform(cat,time),dx=x-f.x,dy=y-f.y,c=Math.cos(f.angle),s=Math.sin(f.angle);
  return {x:(dx*c+dy*s)/f.sx+32,y:(-dx*s+dy*c)/f.sy+58};
}
export function residentWorldPoint(cat:LifeCat,time:number,x=32,y=32){
  const f=residentTransform(cat,time),dx=(x-32)*f.sx,dy=(y-58)*f.sy,c=Math.cos(f.angle),s=Math.sin(f.angle);
  return {x:f.x+dx*c-dy*s,y:f.y+dx*s+dy*c};
}
const masks=new Map<string,Uint8ClampedArray>();
export function residentContains(cat:LifeCat,time:number,x:number,y:number,opaque?:(x:number,y:number)=>boolean){
  const p=residentLocalPoint(cat,time,x,y),px=Math.floor(p.x),py=Math.floor(p.y);
  if(px<0||px>=64||py<0||py>=64)return false;
  if(opaque)return opaque(px,py);
  let mask=masks.get(cat.breed);
  if(!mask){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d')!;drawResidentBody(ctx,cat.breed,'idle');mask=ctx.getImageData(0,0,64,64).data;masks.set(cat.breed,mask);}
  return mask[(py*64+px)*4+3]>80;
}
export function paintResident(ctx:CanvasRenderingContext2D,cat:LifeCat,time:number,stage:number,held=false){
  ctx.save();ctx.globalAlpha=1;
  const t=time*.004+cat.seed,pose=cat.pose,kind=cat.social?.kind,sleeping=pose==='hammock_sleep'||kind==='nap';
  const f=residentTransform(cat,time,held),x=f.x,y=f.y,mood=currentCatMood(cat,time),reacting=(cat.petReactionUntil??0)>time&&!held;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(x,y);ctx.rotate(f.angle);ctx.scale(f.sx,f.sy);ctx.translate(-32,-58);drawResidentBody(ctx,cat.breed,reacting&&mood==='irritated'?'brave':sleeping||reacting&&mood==='happy'?'worried':stage===1&&cat.breed!=='advisor'?'worried':'idle');ctx.restore();
  const paw=(px:number,py:number,w:number,h:number)=>{ctx.fillStyle=cat.breed==='advisor'?'#eae4cf':breeds[cat.breed].fur;ctx.fillRect(Math.round(px),Math.round(py),w,h);};
  if(pose==='knead'){paw(x-13,y-10+Math.max(0,Math.sin(t*3))*4,7,8);paw(x+6,y-10+Math.max(0,-Math.sin(t*3))*4,7,8);}
  if(['scratch','bat_chime','investigate','paw_table'].includes(pose??'')||kind==='groom'||kind==='play'){const lift=Math.max(0,Math.sin(t*3))*12;paw(x+cat.facing*18-3,y-31-lift,6,15);}
  if(pose==='bat_ball'||kind==='play'){const bx=x+cat.facing*(35+Math.sin(t*2)*9),by=y-4;ctx.fillStyle='#c38d64';ctx.fillRect(bx-5,by-8,10,9);ctx.fillStyle='#f4d59a';ctx.fillRect(bx-1,by-7,2,7);}
  if(sleeping){ctx.fillStyle='#f6e4b3';ctx.font='bold 14px monospace';const rise=(time*.012+cat.seed)%28;ctx.fillText('z',x+20,y-37-rise);}
  if(reacting&&mood==='irritated'){ctx.fillStyle='#d79469';for(const [dx,dy,w,h]of [[22,-61,3,8],[16,-56,8,3],[29,-61,3,8],[29,-56,8,3]])ctx.fillRect(x+dx,y+dy,w,h);}
  ctx.restore();
}
