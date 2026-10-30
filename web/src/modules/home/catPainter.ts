import {breeds,drawPixelCat} from '../../adapters/canvas/pixelCat';
import type {LifeCat} from './life';

/** Every shared action uses the project's original cat, including its markings. */
export function paintResident(ctx:CanvasRenderingContext2D,cat:LifeCat,time:number,stage:number,held=false){
  ctx.save();ctx.globalAlpha=1;
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
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(Math.round(x),Math.round(y));ctx.rotate(angle);ctx.scale(cat.facing*sx,sy*(1+Math.sin(t*.5)*.014));ctx.translate(-32,-58);drawPixelCat(ctx,cat.breed,sleeping?'worried':stage===1?'worried':'idle');ctx.restore();
  const paw=(px:number,py:number,w:number,h:number)=>{ctx.fillStyle=breeds[cat.breed].fur;ctx.fillRect(Math.round(px),Math.round(py),w,h);};
  if(pose==='knead'){paw(x-13,y-10+Math.max(0,Math.sin(t*3))*4,7,8);paw(x+6,y-10+Math.max(0,-Math.sin(t*3))*4,7,8);}
  if(['scratch','bat_chime','investigate','paw_table'].includes(pose??'')||kind==='groom'||kind==='play'){const lift=Math.max(0,Math.sin(t*3))*12;paw(x+cat.facing*18-3,y-31-lift,6,15);}
  if(pose==='bat_ball'||kind==='play'){const bx=x+cat.facing*(35+Math.sin(t*2)*9),by=y-4;ctx.fillStyle='#c38d64';ctx.fillRect(bx-5,by-8,10,9);ctx.fillStyle='#f4d59a';ctx.fillRect(bx-1,by-7,2,7);}
  if(sleeping){ctx.fillStyle='#f6e4b3';ctx.font='bold 14px monospace';const rise=(time*.012+cat.seed)%28;ctx.fillText('z',x+20,y-37-rise);}
  ctx.restore();
}
