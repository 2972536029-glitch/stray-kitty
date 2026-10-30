import {paintCarryAnchor} from '../carry-painter';
import {drawCat} from '../l00/painter';
import type {ChapterState, ChapterCat, ChapterCatId as CatId, Position} from './types';
import {getAttackCells, getBossCells, getSkillCells} from './engine';
import {CELLS, MAP} from './config';
import {paintSceneEdge, paintSceneProp, paintSceneTile, SCENE_INK} from '../scene-art';

export const CELL = 80;
export const BOARD_WIDTH = MAP.columns * CELL;
export const BOARD_HEIGHT = MAP.rows * CELL;
export const cellName = ({x,y}:Position) => `${'ABCDE'[y]}${x+1}`;
export function mapCell(x:number,y:number) { return CELLS.some(cell=>cell.x===x&&cell.y===y); }
export function obstacleCell(x:number,y:number) { return MAP.obstacles.some(cell=>cell.x===x&&cell.y===y); }

function rect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function pixelBlocks(ctx:CanvasRenderingContext2D,color:string,blocks:number[][]){for(const b of blocks)rect(ctx,b[0],b[1],b[2],b[3],color);}

/** Tuanzi keeps the orange coat; Diandian reuses the former Siamese support sprite. */
export function drawChapterCat(ctx:CanvasRenderingContext2D,id:CatId,x:number,y:number,size:number,retired=false,attacking=false){
  ctx.save();if(retired)ctx.globalAlpha=.4;
  if(id==='caster'||id==='guard'){drawCat(ctx,id,x,y,size,attacking?'attack':'idle',.5);ctx.restore();return;}
  const colors:Record<'tuanzi'|'diandian',string[]>={
    tuanzi:['#d39251','#f4d59b','#a66e3e','#b77c4b'],diandian:['#d9c7a8','#f4e8cc','#63594d','#d8a1a0'],
  };
  const [fur,light,patch,accent]=colors[id];
  ctx.translate(x,y);ctx.scale(size/32,size/32);ctx.imageSmoothingEnabled=false;
  pixelBlocks(ctx,'#14282044',[[6,28,22,2],[9,30,15,1]]);
  if(attacking)ctx.translate(1,-1);
  pixelBlocks(ctx,fur,[[8,8,17,12],[7,11,20,7],[8,5,5,7],[20,5,5,7],[10,19,14,9],[7,25,8,4],[21,25,7,4],[25,22,4,4]]);
  pixelBlocks(ctx,light,[[12,14,11,6],[13,21,9,5],[9,26,4,2],[23,26,4,2]]);
  pixelBlocks(ctx,patch,id==='tuanzi'?[[9,8,3,6],[15,8,3,3],[21,8,3,6],[11,20,3,4],[21,21,3,3]]:[[9,10,16,6],[10,6,3,4],[21,6,3,4],[9,25,4,3],[23,25,3,3]]);
  pixelBlocks(ctx,'#354f44',[[11,13,3,2],[21,13,3,2]]);pixelBlocks(ctx,'#fff3c9',[[11,13,1,1],[21,13,1,1]]);rect(ctx,17,17,2,1,'#c28c82');
  pixelBlocks(ctx,accent,[[10,20,15,2],[12,22,3,4]]);
  if(id==='tuanzi'){pixelBlocks(ctx,light,[[24,19,6,4],[28,18,2,2],[28,22,2,2]]);}
  else {pixelBlocks(ctx,'#d49b9f',[[23,18,6,7],[24,17,4,2]]);pixelBlocks(ctx,'#fae7be',[[25,19,2,5],[28,13,1,5],[26,17,3,2]]);}
  ctx.restore();
}

function drawRubbish(ctx:CanvasRenderingContext2D,x:number,y:number,index:number){
  paintSceneProp(ctx,'alley',(['bin','crate','sacks'] as const)[index],x,y,CELL,index);
  ctx.save();ctx.fillStyle=SCENE_INK.label;ctx.font='9px "Microsoft YaHei",sans-serif';ctx.textAlign='center';
  ctx.fillText(['垃圾桶','破纸箱','杂物袋'][index],x+40,y+67);
  ctx.restore();
}

function drawBoss(ctx:CanvasRenderingContext2D,state:ChapterState){
  const boss=state.boss;
  if(boss.phase==='defeated')return;
  const x=(boss.x+boss.width/2)*CELL;
  const windup=boss.phase==='windup';
  const basicAttack=boss.phase==='idle'?state.effects.find(fx=>fx.kind==='boss-attack'):undefined;
  const swing=basicAttack?Math.sin(Math.PI*(1-Math.max(0,Math.min(1,basicAttack.remaining/.4)))):0;
  const direction=basicAttack&&basicAttack.to.x>boss.x+boss.width/2?1:-1;
  const bounce=windup?Math.sin(state.elapsed*18)*1.5:Math.sin(state.elapsed*2)*1.2;
  const scale=1.6;
  ctx.save();ctx.translate(x-36*scale+(windup?4:direction*6*swing),boss.y*CELL+20+bounce-3*swing);ctx.scale(scale,scale);
  pixelBlocks(ctx,'#10242177',[[2,77,73,7],[11,83,52,3]]);
  pixelBlocks(ctx,SCENE_INK.enemy,[[15,17,47,54],[10,33,58,37],[8,66,19,13],[46,66,18,13],[20,5,35,15],[15,12,46,16]]);
  pixelBlocks(ctx,SCENE_INK.enemyLight,[[17,18,8,34],[22,7,29,5],[53,25,9,39]]);
  pixelBlocks(ctx,SCENE_INK.gold,[[25,29,10,5],[44,29,10,5]]);
  pixelBlocks(ctx,'#917b5c',[[17,47,46,8],[23,55,7,11],[48,55,7,11]]);
  if(windup){
    // A raised road barrier and leaning torso are the tell; no charge meter exists.
    pixelBlocks(ctx,'#5f6f63',[[5,3,11,35],[61,3,10,35]]);
    pixelBlocks(ctx,'#263c36',[[0,-4,76,8],[3,4,70,16]]);
    pixelBlocks(ctx,'#a98c58',[[3,-2,70,6],[5,7,66,8]]);
    pixelBlocks(ctx,'#e6c67c',[[9,-1,9,5],[31,-1,9,5],[53,-1,9,5]]);
    ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=3;for(const a of [-1,1]){ctx.beginPath();ctx.moveTo(38+a*44,-4);ctx.lineTo(38+a*48,-11);ctx.stroke();}
  }else{
    // The actual basic-hit effect drives a short horizontal swing, separate from the overhead slam.
    ctx.save();ctx.translate(direction*8*swing,-5*swing);ctx.rotate(direction*.16*swing);
    pixelBlocks(ctx,'#263c36',[[-8,43,49,13],[-5,56,43,9]]);pixelBlocks(ctx,'#b09460',[[-5,46,44,7],[-2,56,37,5]]);
    ctx.restore();
    if(boss.phase==='recovery'){ctx.strokeStyle='#edc078';ctx.lineWidth=3;ctx.beginPath();ctx.arc(30,78,38,Math.PI,Math.PI*2);ctx.stroke();}
  }
  ctx.restore();
}

export function paintChapter(ctx:CanvasRenderingContext2D,state:ChapterState,selected:CatId|null,moveTarget:Position|null){
  ctx.clearRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);ctx.imageSmoothingEnabled=false;
  // Pixel scenery remains inside the existing combat footprint.
  // Clip every combat drawing to real cells so the convex map's empty area stays transparent.
  ctx.save();ctx.beginPath();
  for(let y=0;y<MAP.rows;y++)for(let x=0;x<MAP.columns;x++)if(mapCell(x,y))ctx.rect(x*CELL,y*CELL,CELL,CELL);
  ctx.clip();
  for(let y=0;y<MAP.rows;y++)for(let x=0;x<MAP.columns;x++){
    if(!mapCell(x,y))continue;
    const bx=x*CELL,by=y*CELL,goal=x===MAP.goal.x&&y===MAP.goal.y,spawn=MAP.spawns.some(p=>p.x===x&&p.y===y),obstacle=obstacleCell(x,y);
    paintSceneTile(ctx,'alley',x,y,CELL,{goal,spawn,obstacle});
    paintSceneEdge(ctx,'alley',x,y,CELL,mapCell);
    ctx.fillStyle=SCENE_INK.label;ctx.font='9px "Microsoft YaHei",sans-serif';ctx.fillText(cellName({x,y}),bx+7,by+CELL-7);
    if(obstacle)drawRubbish(ctx,bx,by,y);
    if(spawn){
      rect(ctx,bx+5,by+5,CELL-10,CELL-10,'#b77d6730');ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=2;ctx.strokeRect(bx+5,by+5,CELL-10,CELL-10);
      if(y===0){pixelBlocks(ctx,SCENE_INK.danger,[[bx+29,by+30,23,4],[bx+33,by+34,15,4],[bx+37,by+38,7,4]]);}
      else pixelBlocks(ctx,SCENE_INK.danger,[[bx+50,by+29,4,23],[bx+46,by+33,4,15],[bx+42,by+37,4,7]]);
      ctx.fillStyle=SCENE_INK.danger;ctx.font='8px sans-serif';ctx.textAlign='center';ctx.fillText('出怪口',bx+40,by+60);ctx.textAlign='start';
    }
  }
  // One footprint spans four logical cells; one boss sprite and one HP pool occupy it.
  ctx.save();ctx.fillStyle='#b77d6730';ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;
  for(const cell of getBossCells(state.boss))ctx.fillRect(cell.x*CELL+3,cell.y*CELL+3,CELL-6,CELL-6);
  ctx.strokeRect(state.boss.x*CELL+4,state.boss.y*CELL+4,state.boss.width*CELL-8,state.boss.height*CELL-8);
  if(state.boss.phase==='defeated'){
    ctx.fillStyle=SCENE_INK.label;ctx.font='bold 12px sans-serif';ctx.textAlign='center';
    ctx.fillText('首领已退去',(state.boss.x+state.boss.width/2)*CELL,(state.boss.y+state.boss.height/2)*CELL);ctx.textAlign='start';
  }
  ctx.restore();
  // As in L00, these dashed lines show logical enemy routes only.
  ctx.save();ctx.strokeStyle=SCENE_INK.route;ctx.lineWidth=1.4;ctx.setLineDash([5,7]);
  for(const row of [3,4]){ctx.beginPath();ctx.moveTo(BOARD_WIDTH-35,(row+.5)*CELL);ctx.lineTo(40,(row+.5)*CELL);if(row===4)ctx.lineTo(40,280);ctx.stroke();}
  ctx.beginPath();ctx.moveTo((MAP.spawns[2].x+.5)*CELL,25);ctx.lineTo((MAP.spawns[2].x+.5)*CELL,3.5*CELL);ctx.lineTo(40,3.5*CELL);ctx.stroke();ctx.restore();
  drawCat(ctx,'hero',10,3*CELL+13,58);ctx.fillStyle=SCENE_INK.gold;ctx.font='9px sans-serif';ctx.fillText('守护点',24,3*CELL+74);
  paintCarryAnchor(ctx,state.carry,CELL,mapCell);
  const cat=state.cats.find(c=>c.id===selected&&c.status==='active');
  if(cat&&!state.aim){ctx.fillStyle='#8ee2cb30';ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;for(const p of getAttackCells(cat)){if(mapCell(p.x,p.y)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+4.5,p.y*CELL+4.5,CELL-9,CELL-9);}}}
  if(state.aim){
    const aimingCat=state.cats.find(c=>c.id===state.aim?.catId);
    ctx.fillStyle='#8ee2cb38';for(let y=0;y<MAP.rows;y++)for(let x=0;x<MAP.columns;x++)if(mapCell(x,y)&&!obstacleCell(x,y))ctx.fillRect(x*CELL+4,y*CELL+4,CELL-8,CELL-8);
    if(aimingCat&&state.aim.target){ctx.fillStyle='#f4ce8355';ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;for(const p of getSkillCells(aimingCat,state.aim.target)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+5,p.y*CELL+5,CELL-10,CELL-10);}}
  }
  if(moveTarget&&mapCell(moveTarget.x,moveTarget.y)){ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;ctx.strokeRect(moveTarget.x*CELL+5,moveTarget.y*CELL+5,CELL-10,CELL-10);}
  if(state.boss.phase==='windup'){
    for(const p of state.boss.targetCells){
      const x=p.x*CELL,y=p.y*CELL;ctx.fillStyle='#ff99794a';ctx.fillRect(x+3,y+3,CELL-6,CELL-6);ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(x+12,y+58);ctx.lineTo(x+29,y+39);ctx.lineTo(x+40,y+48);ctx.lineTo(x+63,y+20);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+28,y+38);ctx.lineTo(x+22,y+21);ctx.moveTo(x+43,y+44);ctx.lineTo(x+62,y+52);ctx.stroke();
    }
  }
  // Minions can traverse the boss's footprint and remain visible in front of its body.
  drawBoss(ctx,state);
  for(const enemy of state.enemies){
    const x=(enemy.x+.5)*CELL,y=(enemy.y+.5)*CELL;ctx.save();ctx.translate(x-19,y-24+Math.sin(state.elapsed*6+enemy.x)*2);
    const heavy=enemy.kind==='heavy';pixelBlocks(ctx,SCENE_INK.enemy,[[7,2,25,6],[4,8,31,31],[0,20,39,18],[4,38,8,9],[26,38,8,9]]);
    pixelBlocks(ctx,SCENE_INK.enemyLight,[[8,8,23,4],[4,12,5,20]]);pixelBlocks(ctx,SCENE_INK.gold,[[10,19,6,3],[24,19,6,3]]);
    if(enemy.kind==='runner')rect(ctx,2,31,34,4,'#a98a69');if(heavy)pixelBlocks(ctx,'#898a73',[[1,23,8,16],[31,23,8,16]]);
    rect(ctx,1,-6,36,4,'#243741');rect(ctx,1,-6,36*enemy.hp/enemy.maxHp,4,'#efc58a');ctx.restore();
  }
  for(const c of state.cats){
    if(c.status!=='active')continue;
    const x=c.x*CELL,y=c.y*CELL;
    if(c.id===selected){ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;ctx.strokeRect(x+4,y+4,CELL-8,CELL-8);}
    drawChapterCat(ctx,c.id,x+9,y+9,62,false,c.cooldown>.5);
    if(c.shield>0){ctx.strokeStyle='#8dd7e4';ctx.fillStyle='#8dd7e424';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+40,y+43,31,29,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    rect(ctx,x+10,y+65,60,5,'#243741');rect(ctx,x+10,y+65,60*c.hp/c.maxHp,5,'#9ccc94');
    rect(ctx,x+10,y+72,60,3,'#243741');rect(ctx,x+10,y+72,60*c.energy/100,3,c.energy>=100?SCENE_INK.gold:'#a2d3d5');
  }
  for(const fx of state.effects){
    ctx.save();ctx.globalAlpha=Math.min(1,fx.remaining*3);
    if(fx.kind==='boss-attack'){
      // A directional impact links the stationary boss to the one cat it actually hit.
      const tx=(fx.to.x+.5)*CELL,ty=(fx.to.y+.5)*CELL;
      const bx=(state.boss.x+state.boss.width/2)*CELL,by=(state.boss.y+state.boss.height/2)*CELL;
      const dx=tx-bx,dy=ty-by,distance=Math.max(1,Math.hypot(dx,dy)),nx=dx/distance,ny=dy/distance;
      const sx=bx+nx*CELL*.65,sy=by+ny*CELL*.4;
      const progress=1-Math.max(0,Math.min(1,fx.remaining/.4));
      ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=4;ctx.beginPath();
      ctx.moveTo(sx,sy);ctx.quadraticCurveTo((sx+tx)/2-ny*14,(sy+ty)/2+nx*14,tx-nx*10,ty-ny*10);ctx.stroke();
      ctx.fillStyle=SCENE_INK.gold;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-nx*16-ny*7,ty-ny*16+nx*7);ctx.lineTo(tx-nx*16+ny*7,ty-ny*16-nx*7);ctx.closePath();ctx.fill();
      const flash=10+progress*10;ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=2;ctx.beginPath();
      ctx.moveTo(tx-flash,ty-flash);ctx.lineTo(tx+flash,ty+flash);ctx.moveTo(tx+flash,ty-flash);ctx.lineTo(tx-flash,ty+flash);ctx.stroke();
    }else if(fx.kind==='attack'){
      const center=(p:Position)=>p.x===state.boss.x&&p.y===state.boss.y?{x:state.boss.x+state.boss.width/2-.5,y:state.boss.y+state.boss.height/2-.5}:p;
      const from=center(fx.from),to=center(fx.to);
      ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo((from.x+.5)*CELL,(from.y+.5)*CELL);ctx.lineTo((to.x+.5)*CELL,(to.y+.5)*CELL);ctx.stroke();
    }else if(fx.kind==='heal'||fx.kind==='shield'){
      const x=(fx.to.x+.5)*CELL,y=(fx.to.y+.4)*CELL;ctx.fillStyle=fx.kind==='heal'?'#a9e0a8':'#a0e3ed';ctx.fillRect(x-13,y-2,26,4);ctx.fillRect(x-2,y-13,4,26);
    }else{
      for(const p of fx.cells??[fx.to]){ctx.strokeStyle=fx.kind==='slam'?SCENE_INK.danger:SCENE_INK.gold;ctx.lineWidth=3;ctx.beginPath();ctx.arc((p.x+.5)*CELL,(p.y+.5)*CELL,25+8*Math.sin(fx.remaining*10),0,Math.PI*2);ctx.stroke();}
    }
    ctx.restore();
  }
  // The boss HP belongs to the HUD; the board carries its body-language warning only.
  ctx.restore();
}

export function portrait(ctx:CanvasRenderingContext2D,cat:Pick<ChapterCat,'id'|'status'>){ctx.clearRect(0,0,64,64);drawChapterCat(ctx,cat.id,0,0,64,cat.status==='retired');}
