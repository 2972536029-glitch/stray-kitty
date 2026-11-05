import {HOME_SIZE, homeStage} from './layout';
import {HOME_FRAMES, type HomeArtwork, type HomeSprite} from './assets';
import {homeObjects, type HomeAppearance, type HomeObject} from './objects';
export {homeObjects} from './objects';
export function homeAppearanceKey(state:HomeAppearance):string {
  return JSON.stringify(state.homeLayout??{})+'|'+(state.homeDecorOwned??[]).join(',')+'|'+(state.homeRepairs??[]).join(',')+'|'+homeStage(state)+'|'+Object.entries(state.placements).sort(([a],[b])=>a.localeCompare(b)).map(([slot,id])=>slot+':'+id).join('|');
}
function filterFor(stage:number){return stage===1?'saturate(.3) brightness(.58)':stage===2?'saturate(.7) brightness(.83)':stage===4?'saturate(1.04) brightness(1.03)':'none';}
/** Distant garden colours continue around the curved roof, without a solid mat. */
export function paintHomeSurroundings(ctx:CanvasRenderingContext2D,state:HomeAppearance,width:number,height:number){
  const stage=homeStage(state),bright=stage>=3||state.homeRepairs?.includes('restore_skylight');
  ctx.save();
  const sky=ctx.createLinearGradient(0,0,0,height);
  sky.addColorStop(0,bright?'#c4ddd1':stage===2?'#8baba0':'#546f72');
  sky.addColorStop(.5,bright?'#92b29a':'#637f70');sky.addColorStop(1,'#405e4b');
  ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
  const pixel=Math.max(3,Math.round(width/280));
  for(let layer=0;layer<3;layer++){
    ctx.fillStyle=['#a8bd91','#7f9c78','#5e805f'][layer];ctx.globalAlpha=bright?.65:.35;
    for(let i=0;i<38;i++){
      const x=((i*137+layer*59)%1672)/1672*width,y=((i*53+layer*31)%200)/941*height;
      const size=(3+(i+layer)%5)*pixel;
      ctx.fillRect(Math.round(x/pixel)*pixel,Math.round(y/pixel)*pixel,size,size*.7);
      ctx.fillRect(Math.round(x/pixel)*pixel+pixel,Math.round(y/pixel)*pixel-pixel,size-2*pixel,size*.8);
    }
  }
  ctx.restore();
}
export function drawHomeSprite(ctx:CanvasRenderingContext2D,art:HomeArtwork,sprite:HomeSprite,x:number,y:number,width:number){
  const frame=HOME_FRAMES[sprite],height=width*frame.height/frame.width;
  ctx.drawImage(art[frame.sheet],frame.x,frame.y,frame.width,frame.height,Math.round(x-width/2),Math.round(y-height),width,height);
}
export const HOME_REPAIR_PANELS=[
  {id:'WIN02',x:433,y:33,width:147,height:254},
  {id:'WIN04',x:766,y:33,width:145,height:254},
  {id:'WIN06',x:1097,y:33,width:140,height:254}
] as const;
export const HOME_LEAKS=[{x:575,top:115,y:490,width:168},{x:965,top:100,y:604,width:210},{x:1250,top:135,y:476,width:140}] as const;
export function paintHomeStructure(ctx:CanvasRenderingContext2D,state:HomeAppearance,art?:HomeArtwork){
  const stage=homeStage(state);ctx.save();ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#13262e';ctx.fillRect(0,0,HOME_SIZE.width,HOME_SIZE.height);
  if(!art){ctx.fillStyle='#d4c398';ctx.font='24px sans-serif';ctx.fillText('正在打开花房……',HOME_SIZE.width/2-100,HOME_SIZE.height/2);ctx.restore();return;}
  const repairs=state.homeRepairs??[],sunlight=repairs.includes('restore_skylight');
  paintHomeSurroundings(ctx,state,HOME_SIZE.width,HOME_SIZE.height);
  // The original plate has navy outside its roof silhouette. Keep the building
  // intact while revealing the garden behind those two exterior corners.
  ctx.save();ctx.beginPath();ctx.moveTo(128,0);ctx.lineTo(88,43);ctx.lineTo(48,89);ctx.lineTo(17,133);ctx.lineTo(0,161);
  ctx.lineTo(0,HOME_SIZE.height);ctx.lineTo(HOME_SIZE.width,HOME_SIZE.height);ctx.lineTo(HOME_SIZE.width,161);
  ctx.lineTo(HOME_SIZE.width-17,133);ctx.lineTo(HOME_SIZE.width-48,89);ctx.lineTo(HOME_SIZE.width-88,43);ctx.lineTo(HOME_SIZE.width-128,0);ctx.closePath();ctx.clip();
  ctx.filter=filterFor(sunlight?Math.max(3,stage):stage);ctx.drawImage(art.base,0,0,HOME_SIZE.width,HOME_SIZE.height);ctx.restore();
  ctx.filter=filterFor(sunlight?Math.max(3,stage):stage);
  if(stage<=2&&!sunlight){
    const source=HOME_FRAMES[stage===1&&!repairs.includes('patch_windows')?'window.broken':'window.patched'];
    for(const panel of HOME_REPAIR_PANELS)ctx.drawImage(art.atlas,source.x,source.y,source.width,source.height,panel.x,panel.y,panel.width,panel.height);
  }
  ctx.filter='none';
  if(stage===1){
    for(const p of HOME_LEAKS){
      ctx.fillStyle='#354f64cc';ctx.fillRect(p.x-p.width/2,p.y-6,p.width,17);
      ctx.fillRect(p.x-p.width/2+16,p.y-12,p.width-32,27);
      ctx.fillStyle='#8cadbf55';ctx.fillRect(p.x-p.width*.3,p.y-4,p.width*.58,3);
      ctx.fillStyle='#becfd33d';ctx.fillRect(p.x-8,p.y-8,13,19);
    }
  }
  if(stage===2&&repairs.includes('reinforce_floor')){
    ctx.fillStyle='#c7a87766';for(let row=0;row<4;row++){ctx.fillRect(650+row%2*16,548+row*17,340,14);ctx.fillStyle='#a17e4844';ctx.fillRect(650,562+row*17,340,2);ctx.fillStyle='#c7a87766';}
  }
  if(stage>=3||sunlight){
    // Registered window light falls across the open floor between the living
    // corners; window mullions and leaves break it up, as in the approved art.
    ctx.fillStyle=stage===4?'#ffe8a959':'#ffe69a52';
    for(const [x,y] of [[285,371],[605,380],[970,382],[180,550],[725,550]]){
      for(let row=0;row<4;row++)for(let column=0;column<3;column++){
        const px=x+column*48+row*27,py=y+row*29;
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+41,py);ctx.lineTo(px+65,py+23);ctx.lineTo(px+24,py+23);ctx.closePath();ctx.fill();
      }
    }
  }
  if(stage===4){
    const glow=ctx.createLinearGradient(0,0,0,350);glow.addColorStop(0,'#f59c4836');glow.addColorStop(1,'#f59c4800');ctx.fillStyle=glow;ctx.fillRect(100,0,1472,350);
  }
  ctx.restore();
}
export function paintHomeObject(ctx:CanvasRenderingContext2D,object:HomeObject,art?:HomeArtwork,time=0){
  if(!art)return;ctx.save();ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
  if(object.kind!=='decor'){ctx.fillStyle='#1b2e2538';ctx.beginPath();ctx.ellipse(object.x,object.y-3,object.width*.34,6,0,0,Math.PI*2);ctx.fill();}
  const clock=object.furnitureId==='postmark_clock'||object.furnitureId==='lunar_clock';
  if(clock){
    const frame=HOME_FRAMES[object.sprite],w=object.width,h=w*frame.height/frame.width,x=object.x-w/2,y=object.y-h;
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h*.76);ctx.clip();drawHomeSprite(ctx,art,object.sprite,object.x,object.y,w);ctx.restore();
    ctx.save();ctx.translate(object.x,y+h*.76);ctx.rotate(Math.sin(time*.0022)*.055);ctx.translate(-object.x,-y-h*.76);ctx.beginPath();ctx.rect(x,y+h*.76,w,h*.25);ctx.clip();drawHomeSprite(ctx,art,object.sprite,object.x,object.y,w);ctx.restore();
  }else if(object.furnitureId==='comet_mobile'){
    const frame=HOME_FRAMES[object.sprite],top=object.y-object.width*frame.height/frame.width;
    ctx.translate(object.x,top);ctx.rotate(Math.sin(time*.0025)*.045);ctx.translate(-object.x,-top);drawHomeSprite(ctx,art,object.sprite,object.x,object.y,object.width);
  }else drawHomeSprite(ctx,art,object.sprite,object.x,object.y,object.width);
  ctx.restore();
}
export function paintHomeFurnitureFront(ctx:CanvasRenderingContext2D,object:HomeObject,art?:HomeArtwork){
  if(!art||!['castle','hammock','blanket','cushion'].includes(object.kind))return;
  // Only the low front lip can cover paws. Tall opaque crops hid the face
  // when front-facing furniture replaced the old angled drawings.
  const w=object.width;
  ctx.save();ctx.beginPath();ctx.rect(object.x-w/2,object.y-5,w,6);ctx.clip();
  drawHomeSprite(ctx,art,object.sprite,object.x,object.y,w);ctx.restore();
}
export function paintHomeFrontWall(ctx:CanvasRenderingContext2D,state:HomeAppearance,art?:HomeArtwork){
  if(!art)return;ctx.save();ctx.globalAlpha=1;ctx.filter=filterFor(state.homeRepairs?.includes('restore_skylight')?Math.max(3,homeStage(state)):homeStage(state));
  for(const [x,w] of [[0,706],[924,748]])ctx.drawImage(art.base,x,733,w,208,x,733,w,208);
  ctx.restore();
}
export function paintHomeWeather(ctx:CanvasRenderingContext2D,state:HomeAppearance,time:number){
  const stage=homeStage(state);ctx.save();ctx.globalAlpha=1;
  if(stage===1)for(const p of HOME_LEAKS){
    for(let i=0;i<(state.homeRepairs?.includes('stop_roof_leaks')?0:4);i++){
      const progress=((time*.2+i*101+p.x)%360)/360,y=p.top+progress*(p.y-p.top);
      ctx.fillStyle='#b7d8e3bb';ctx.fillRect(p.x,y,3,9);ctx.fillRect(p.x+1,y-3,1,3);
    }
    const phase=(time+p.x)%1100/1100;
    ctx.strokeStyle='#c7e2e7';ctx.globalAlpha=(1-phase)*.6;ctx.lineWidth=2;
    ctx.strokeRect(p.x-phase*30,p.y-2-phase*3,phase*60,4+phase*6);ctx.globalAlpha=1;
  }
  if(stage===4)for(let i=0;i<12;i++){
    const x=230+i*110,y=118+Math.sin(i*.8)*19,glow=.5+.5*Math.sin(time*.002+i);
    ctx.fillStyle='rgba(255,202,105,'+(.09+glow*.07)+')';ctx.fillRect(x-13,y-13,26,26);
    ctx.fillStyle='#ffe4a3';ctx.fillRect(x-2,y-2,4,5);
  }
  ctx.restore();
}
/** Shared cat-free assembly for the scene and the chapter-map preview. */
export function paintHomestead(ctx:CanvasRenderingContext2D,state:HomeAppearance,art?:HomeArtwork){
  paintHomeStructure(ctx,state,art);
  const objects=homeObjects(state);
  for(const object of objects.filter(object=>!object.front))paintHomeObject(ctx,object,art);
  paintHomeFrontWall(ctx,state,art);
  for(const object of objects.filter(object=>object.front))paintHomeObject(ctx,object,art);
}
