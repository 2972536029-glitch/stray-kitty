import {paintCarryAnchor} from '../carry-painter';
import {paintSceneEdge, paintSceneProp, paintSceneTile, SCENE_INK} from '../scene-art';
import {drawCat} from '../l00/painter';
import {drawChapterCat} from '../chapter/painter';
import {CELLS, MAP, ROUTES} from './config';
import {getAttackCells, getSkillCells} from './engine';
import type {GreenhouseCatId, GreenhouseState, Position} from './types';

export const CELL=80;
export const BOARD_WIDTH=MAP.columns*CELL;
export const BOARD_HEIGHT=MAP.rows*CELL;
export const cellName=({x,y}:Position)=>`${'ABCDEF'[y]}${x+1}`;
/** The bounding rectangle is not the map: absent cells never accept pointers. */
export const mapCell=(x:number,y:number)=>Number.isInteger(x)&&Number.isInteger(y)&&CELLS.some(cell=>cell.x===x&&cell.y===y);
export const obstacleCell=(x:number,y:number)=>MAP.obstacles.some(cell=>cell.x===x&&cell.y===y);
const rect=(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
const blocks=(ctx:CanvasRenderingContext2D,color:string,points:number[][])=>{for(const [x,y,w,h] of points)rect(ctx,x,y,w,h,color);};

function drawGreenhouseCat(ctx:CanvasRenderingContext2D,id:GreenhouseCatId,x:number,y:number,size:number,attacking:boolean){
  if(id==='caster'||id==='guard'||id==='tuanzi'){drawChapterCat(ctx,id,x,y,size,false,attacking);return;}
  const fighter=id==='bruiser',black=id==='momo';
  const fur=black?'#525760':fighter?'#b48c69':'#c7d3d2',light=black?'#737b80':fighter?'#e4c89d':'#f2f0df',patch=black?'#363d43':fighter?'#745b48':'#8dabad';
  ctx.save();ctx.translate(x+(attacking?1:0),y);ctx.scale(size/32,size/32);
  blocks(ctx,'#263b352d',[[6,28,22,2],[10,30,13,1]]);
  blocks(ctx,fur,[[7,7,18,13],[7,4,5,8],[20,4,5,8],[6,10,21,8],[9,19,16,9],[7,26,8,3],[21,26,6,3],[25,22,5,4]]);
  blocks(ctx,light,[[11,14,12,6],[12,21,10,5],[9,26,4,2],[23,26,4,2]]);
  blocks(ctx,patch,[[8,7,3,7],[15,7,3,4],[22,7,3,7],[10,20,3,5],[22,20,3,4]]);
  blocks(ctx,black?'#d3c68a':'#385149',[[10,13,3,2],[21,13,3,2]]);rect(ctx,16,17,2,1,'#c48f80');
  if(fighter){blocks(ctx,'#765a40',[[4,18,8,10],[5,28,6,2]]);blocks(ctx,'#c5a774',[[5,19,6,8],[7,20,2,6]]);blocks(ctx,'#a57358',[[12,20,12,2],[17,22,3,4]]);}
  else if(black){blocks(ctx,'#8caa89',[[10,20,15,2],[17,22,3,3]]);blocks(ctx,'#e1d4a2',[[24,18,5,3],[23,21,7,6],[25,27,3,2]]);rect(ctx,25,22,3,4,'#fbf0be');}
  else {blocks(ctx,'#77989c',[[10,20,15,2],[15,22,5,3]]);blocks(ctx,'#d9bb68',[[17,22,3,4],[25,20,4,6]]);rect(ctx,26,26,2,1,'#657f83');}
  ctx.restore();
}

function drawObstacle(ctx:CanvasRenderingContext2D,p:Position,index:number){
  const x=p.x*CELL,y=p.y*CELL;
  if(index===2){
    ctx.save();ctx.translate(x,y+22);ctx.scale(1,.65);
    paintSceneProp(ctx,'greenhouse','trellis',0,0,CELL,index);ctx.restore();
    blocks(ctx,'#b5bba0',[[x+15,y+40,15,4],[x+28,y+44,15,4],[x+41,y+48,15,4],[x+54,y+52,10,4]]);
  }else paintSceneProp(ctx,'greenhouse',index===1?'broken-pot':'trellis',x,y,CELL,index);
  // These are the same three blocked cells; the seedlings remain scenery only.
  if(index===0)paintSceneProp(ctx,'greenhouse','planter',x+9,y+20,CELL*.55,index);
  ctx.save();rect(ctx,x+7,y+63,66,12,'#142630c9');
  ctx.fillStyle=SCENE_INK.label;ctx.textAlign='center';ctx.font='9px sans-serif';ctx.fillText(['旧花架','破花盆','倒塌育苗架'][index],x+40,y+72);ctx.restore();
}

/** One large vine-armoured body spans exactly four tiles, with a seed-opening tell. */
function drawBoss(ctx:CanvasRenderingContext2D,state:GreenhouseState){
  const boss=state.boss;if(boss.phase==='defeated')return;
  const windup=boss.phase==='windup',basic=state.effects.find(effect=>effect.kind==='boss-attack');
  const lunge=basic?Math.sin(Math.PI*(1-Math.min(1,basic.remaining/.4)))*4:0;
  ctx.save();ctx.translate(boss.x*CELL+12-lunge,boss.y*CELL+10);ctx.scale(1.7,1.7);
  blocks(ctx,'#263b3533',[[8,73,64,8],[17,80,45,3]]);
  blocks(ctx,'#586457',[[20,14,40,15],[15,29,50,39],[10,64,20,13],[49,64,20,13]]);
  blocks(ctx,'#78856b',[[19,27,10,35],[56,30,9,33],[25,16,30,6]]);
  blocks(ctx,'#dbcda1',[[26,31,9,4],[46,31,9,4]]);
  // Plant armour and a crown of leaves make this a different creature from prior bosses.
  blocks(ctx,'#70865d',[[17,9,7,10],[29,3,7,15],[43,4,7,14],[57,9,7,11],[21,44,41,7],[27,55,31,6]]);
  blocks(ctx,'#a5aa74',[[19,7,3,7],[31,1,3,10],[45,2,3,10],[59,7,3,7],[26,45,6,3],[47,56,7,3]]);
  ctx.strokeStyle='#4b7051';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(18,30);ctx.bezierCurveTo(42,37,26,53,57,65);ctx.moveTo(62,31);ctx.bezierCurveTo(40,42,54,53,22,66);ctx.stroke();
  if(windup){
    blocks(ctx,'#607558',[[3,20,13,10],[64,20,13,10],[1,10,6,13],[72,10,6,13]]);
    for(const x of [7,73]){ctx.fillStyle='#ad956a';ctx.beginPath();ctx.ellipse(x,8,7,10,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e0c28b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,16);ctx.stroke();}
    ctx.fillStyle='#ddd49b';for(let i=0;i<4;i++)ctx.fillRect(20+i*12,4-Math.sin(state.elapsed*5+i)*6,3,3);
  }else{
    ctx.strokeStyle='#5a7653';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(17,42);ctx.quadraticCurveTo(-4-lunge*3,42,5-lunge*2,69);ctx.moveTo(63,42);ctx.quadraticCurveTo(83,49,71,71);ctx.stroke();
    blocks(ctx,'#b0a277',[[0,54,7,3],[8,64,7,3],[72,55,7,3]]);
  }
  ctx.restore();
}

function drawThorns(ctx:CanvasRenderingContext2D,p:Position,warning:boolean,time:number){
  const x=p.x*CELL,y=p.y*CELL;
  ctx.fillStyle=warning?`rgba(255,153,121,${.16+.06*Math.sin(time*8)})`:'#293f36b8';ctx.fillRect(x+4,y+4,CELL-8,CELL-8);
  ctx.strokeStyle=warning?SCENE_INK.danger:'#acbc87';ctx.lineWidth=warning?2:3;
  if(warning){ctx.setLineDash([4,4]);ctx.strokeRect(x+8,y+8,CELL-16,CELL-16);ctx.setLineDash([]);ctx.beginPath();ctx.ellipse(x+40,y+43,11,15,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x+40,y+28);ctx.lineTo(x+40,y+55);ctx.stroke();}
  else {
    blocks(ctx,SCENE_INK.danger,[[x+5,y+5,13,2],[x+5,y+5,2,13],[x+62,y+5,13,2],[x+73,y+5,2,13],[x+5,y+73,13,2],[x+5,y+62,2,13],[x+62,y+73,13,2],[x+73,y+62,2,13]]);
    for(const offset of [17,40,62]){ctx.beginPath();ctx.moveTo(x+offset-8,y+65);ctx.bezierCurveTo(x+offset+12,y+48,x+offset-10,y+36,x+offset+3,y+17);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+offset,y+50);ctx.lineTo(x+offset-8,y+42);ctx.moveTo(x+offset+1,y+32);ctx.lineTo(x+offset+10,y+25);ctx.stroke();}
    ctx.fillStyle='#d1b978';for(const [dx,dy] of [[19,40],[43,56],[63,22]]){ctx.beginPath();ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx+7,y+dy-8);ctx.lineTo(x+dx+5,y+dy+3);ctx.closePath();ctx.fill();}
  }
}

export function paintGreenhouse(ctx:CanvasRenderingContext2D,state:GreenhouseState,selected:GreenhouseCatId|null,moveTarget:Position|null){
  ctx.clearRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);ctx.imageSmoothingEnabled=false;ctx.save();
  // Clip every layer, including routes, sprites and effects, to the 34 real cells.
  ctx.beginPath();for(const p of CELLS)ctx.rect(p.x*CELL,p.y*CELL,CELL,CELL);ctx.clip();
  for(const p of CELLS){
    const goal=p.x===MAP.goal.x&&p.y===MAP.goal.y,obstacle=obstacleCell(p.x,p.y);
    paintSceneTile(ctx,'greenhouse',p.x,p.y,CELL,{goal,obstacle,spawn:MAP.spawns.some(cell=>cell.x===p.x&&cell.y===p.y),boss:MAP.bossCells.some(cell=>cell.x===p.x&&cell.y===p.y)});
    paintSceneEdge(ctx,'greenhouse',p.x,p.y,CELL,mapCell);
    if(obstacle)drawObstacle(ctx,p,MAP.obstacles.findIndex(cell=>cell.x===p.x&&cell.y===p.y));
  }
  ctx.save();ctx.strokeStyle=SCENE_INK.route;ctx.lineWidth=1.1;ctx.setLineDash([4,7]);for(const path of Object.values(ROUTES)){ctx.beginPath();path.forEach((p,i)=>{if(i===0)ctx.moveTo((p.x+.5)*CELL,(p.y+.5)*CELL);else ctx.lineTo((p.x+.5)*CELL,(p.y+.5)*CELL);});ctx.stroke();}ctx.restore();
  for(const p of MAP.spawns){
    const x=p.x*CELL,y=p.y*CELL;ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=2;ctx.strokeRect(x+5,y+5,CELL-10,CELL-10);
    blocks(ctx,SCENE_INK.danger,p.y===5?[[x+37,y+25,7,4],[x+33,y+29,15,4],[x+29,y+33,23,4]]:[[x+45,y+24,4,23],[x+41,y+28,4,15],[x+37,y+32,4,7]]);
    ctx.textAlign='center';ctx.font='8px sans-serif';ctx.fillStyle=SCENE_INK.danger;ctx.fillText('出怪口',x+40,y+58);
  }
  for(const p of MAP.bossCells)rect(ctx,p.x*CELL+3,p.y*CELL+3,CELL-6,CELL-6,'#e0b26c17');
  ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;ctx.strokeRect(state.boss.x*CELL+4,state.boss.y*CELL+4,2*CELL-8,2*CELL-8);
  if(state.boss.phase==='defeated'){ctx.fillStyle=SCENE_INK.label;ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('荆冠首领已退去',(MAP.boss.x+1)*CELL,(MAP.boss.y+1)*CELL);}
  drawCat(ctx,'hero',8,MAP.goal.y*CELL+11,62);ctx.fillStyle=SCENE_INK.gold;ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('守护 B1',40,MAP.goal.y*CELL+73);
  paintCarryAnchor(ctx,state.carry,CELL,mapCell);
  const chosen=state.cats.find(cat=>cat.id===selected&&cat.status==='active');
  if(chosen&&!state.aim){ctx.fillStyle='#8ee2cb28';ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;for(const p of getAttackCells(chosen)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);}}
  if(state.aim){ctx.fillStyle='#7ccbd12d';for(const p of CELLS)if(!obstacleCell(p.x,p.y))ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);const cat=state.cats.find(value=>value.id===state.aim?.catId);if(cat&&state.aim.target){ctx.fillStyle='#f4ce8366';ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;for(const p of getSkillCells(cat,state.aim.target)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+5,p.y*CELL+5,CELL-10,CELL-10);}}}
  if(moveTarget&&mapCell(moveTarget.x,moveTarget.y)){ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;ctx.strokeRect(moveTarget.x*CELL+5,moveTarget.y*CELL+5,CELL-10,CELL-10);}
  if(state.boss.phase==='windup')for(const p of state.boss.targetCells)drawThorns(ctx,p,true,state.elapsed);
  for(const hazard of state.hazards)drawThorns(ctx,hazard,false,state.elapsed);
  drawBoss(ctx,state);
  for(const enemy of state.enemies){
    ctx.save();ctx.translate((enemy.x+.5)*CELL-19,(enemy.y+.5)*CELL-24+Math.sin(state.elapsed*6+enemy.x)*2);
    blocks(ctx,SCENE_INK.enemy,[[7,2,25,6],[4,8,31,31],[0,20,39,18],[4,38,8,9],[26,38,8,9]]);blocks(ctx,SCENE_INK.enemyLight,[[8,8,23,4],[4,12,5,20]]);blocks(ctx,'#e8dbb0',[[10,19,6,3],[24,19,6,3]]);
    if(enemy.kind==='runner')rect(ctx,2,31,34,4,'#a98a69');if(enemy.kind==='heavy')blocks(ctx,'#898a73',[[1,23,8,16],[31,23,8,16]]);
    if(enemy.slowRemaining>0){ctx.strokeStyle='#6c9ea8';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(19,47,22,5,0,0,Math.PI*2);ctx.stroke();}
    rect(ctx,1,-6,36,4,'#203946');rect(ctx,1,-6,36*enemy.hp/enemy.maxHp,4,'#c1ae83');ctx.restore();
  }
  for(const cat of state.cats){
    if(cat.status!=='active')continue;const x=cat.x*CELL,y=cat.y*CELL;
    if(cat.id===selected){ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;ctx.strokeRect(x+4,y+4,CELL-8,CELL-8);}
    drawGreenhouseCat(ctx,cat.id,x+9,y+7,62,cat.cooldown>.5);
    if(cat.shield>0){ctx.strokeStyle='#a1dce0';ctx.fillStyle='#83bdc018';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+40,y+42,31,29,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    if(cat.attackBuffRemaining>0){ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+64,y+25);ctx.lineTo(x+68,y+17);ctx.lineTo(x+72,y+25);ctx.stroke();}
    rect(ctx,x+10,y+65,60,5,'#203946');rect(ctx,x+10,y+65,60*cat.hp/cat.maxHp,5,'#9bcc9b');rect(ctx,x+10,y+72,60,3,'#203946');rect(ctx,x+10,y+72,60*cat.energy/100,3,cat.energy>=100?SCENE_INK.gold:'#93c3c0');
  }
  for(const effect of state.effects){
    ctx.save();ctx.globalAlpha=Math.min(1,effect.remaining*3);
    if(effect.kind==='attack'||effect.kind==='boss-attack'){
      const from=effect.kind==='boss-attack'?{x:state.boss.x+.5,y:state.boss.y+.5}:effect.from;
      ctx.strokeStyle=effect.kind==='attack'?SCENE_INK.gold:'#668052';ctx.lineWidth=effect.kind==='attack'?2:5;ctx.beginPath();ctx.moveTo((from.x+.5)*CELL,(from.y+.5)*CELL);ctx.quadraticCurveTo((from.x+effect.to.x+1)*CELL/2,(from.y+effect.to.y)*CELL/2-12,(effect.to.x+.5)*CELL,(effect.to.y+.5)*CELL);ctx.stroke();
    }else if(effect.kind==='shield'){const x=(effect.to.x+.5)*CELL,y=(effect.to.y+.4)*CELL;ctx.strokeStyle='#96d8d3';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,27,0,Math.PI*2);ctx.stroke();}
    else for(const p of effect.cells??[effect.to]){const x=p.x*CELL,y=p.y*CELL;ctx.strokeStyle=effect.kind==='thorn'?'#9d784d':effect.kind==='seed'?'#87985e':SCENE_INK.gold;ctx.lineWidth=3;ctx.beginPath();ctx.arc(x+40,y+40,effect.kind==='thorn'?17:25,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  for(const p of CELLS){rect(ctx,p.x*CELL+4,p.y*CELL+3,21,11,'#18303dba');ctx.fillStyle=SCENE_INK.label;ctx.font='8px sans-serif';ctx.textAlign='start';ctx.fillText(cellName(p),p.x*CELL+6,p.y*CELL+12);}
  ctx.restore();
}
