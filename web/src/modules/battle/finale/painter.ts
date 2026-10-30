import {paintCarryAnchor} from '../carry-painter';
import {paintSceneEdge, paintSceneProp, paintSceneTile, SCENE_INK} from '../scene-art';
import {drawCat} from '../l00/painter';
import {drawChapterCat} from '../chapter/painter';
import {CELLS, MAP} from './config';
import {getAttackCells, getSkillCells} from './engine';
import type {FinaleCatId, FinaleState, Position} from './types';

export const CELL=80;
export const BOARD_WIDTH=MAP.columns*CELL;
export const BOARD_HEIGHT=MAP.rows*CELL;
export const cellName=({x,y}:Position)=>`${String.fromCharCode(65+y)}${x+1}`;
export const mapCell=(x:number,y:number)=>Number.isInteger(x)&&Number.isInteger(y)&&CELLS.some(cell=>cell.x===x&&cell.y===y);
export const obstacleCell=(x:number,y:number)=>MAP.obstacles.some(cell=>cell.x===x&&cell.y===y);
export const OBSTACLE_NAMES:Readonly<Record<string,string>>={A4:'废钢架',A5:'断梁',B2:'旧箱垛',B3:'排除绊线',B11:'北侧隔间',B12:'受困伙伴',C1:'旧墙',C7:'断裂立柱',D1:'仓库侧墙',E1:'旧墙',E7:'废钢架',F2:'旧箱垛',F3:'排除绊线',F11:'南侧隔间',F12:'受困伙伴',G4:'断梁',G5:'废钢架'};
const rect=(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
const blocks=(ctx:CanvasRenderingContext2D,color:string,points:number[][])=>{for(const [x,y,w,h] of points)rect(ctx,x,y,w,h,color);};
const text=(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,color:string=SCENE_INK.label,size=9)=>{ctx.fillStyle=color;ctx.font=`${size}px sans-serif`;ctx.textAlign='center';ctx.fillText(value,x,y);};

function smallCat(ctx:CanvasRenderingContext2D,x:number,y:number,fur:string,patch:string,size=1){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  blocks(ctx,fur,[[4,5,22,16],[4,1,6,7],[20,1,6,7],[7,21,18,8],[4,27,8,3],[20,27,8,3],[26,21,4,7]]);
  blocks(ctx,patch,[[6,5,5,10],[21,5,4,10],[10,23,5,5]]);blocks(ctx,'#f4ead7',[[11,15,11,5],[14,22,8,6]]);blocks(ctx,'#3f5548',[[9,12,3,2],[21,12,3,2]]);rect(ctx,16,16,2,2,'#bc8c79');ctx.restore();
}
function drawFinaleCat(ctx:CanvasRenderingContext2D,id:FinaleCatId,x:number,y:number,size:number,attacking:boolean){
  if(id==='caster'||id==='guard'||id==='tuanzi'||id==='diandian'){drawChapterCat(ctx,id,x,y,size,false,attacking);return;}
  const black=id==='momo';ctx.save();ctx.translate(x+(attacking?1:0),y);ctx.scale(size/32,size/32);smallCat(ctx,0,0,black?'#525760':'#b48c69',black?'#343c43':'#745b48');
  blocks(ctx,black?'#92ad8b':'#765a40',[[6,21,19,2],[17,23,3,4]]);
  if(black){blocks(ctx,'#e2cf90',[[24,18,5,3],[23,21,7,6]]);rect(ctx,25,22,3,4,'#fff4c5');}else{blocks(ctx,'#765a40',[[2,18,8,10],[3,28,6,2]]);blocks(ctx,'#c5a774',[[3,19,6,8],[5,20,2,6]]);}ctx.restore();
}
function drawObstacle(ctx:CanvasRenderingContext2D,p:Position,state:FinaleState){
  const key=cellName(p);ctx.save();ctx.translate(p.x*CELL,p.y*CELL);
  if(key.endsWith('12')){
    if(state.phase!=='won'){smallCat(ctx,15,25,'#be9872','#896b51',.9);smallCat(ctx,42,30,'#ccc9ba','#8e9d8b',.8);}
    blocks(ctx,'#7e7569',[[8,18,64,4],[8,60,64,4],[8,18,4,46],[68,18,4,46]]);if(state.phase!=='won')for(const x of [22,39,55])rect(ctx,x,22,3,38,'#c6c4b9');else text(ctx,'已撤离',40,48,SCENE_INK.selected,11);
  }else if(key==='B11'||key==='F11'){
    blocks(ctx,'#6e665d',[[12,18,55,42],[16,12,47,6]]);blocks(ctx,'#ada696',[[16,21,47,7],[16,31,8,25],[55,31,8,25]]);rect(ctx,30,35,18,20,'#35312d');rect(ctx,36,39,4,5,SCENE_INK.gold);
  }else if(key==='B3'||key==='F3'){
    paintSceneProp(ctx,'finale','cable',0,0,CELL);
    // The clipped wire and check mark keep the already-cleared trap explicit.
    blocks(ctx,'#a08869',[[10,24,10,34],[60,24,10,34]]);rect(ctx,36,39,8,12,'#3d3832');
    ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(28,32);ctx.lineTo(36,40);ctx.lineTo(52,24);ctx.stroke();
  }else if(key==='B2'||key==='F2'){
    paintSceneProp(ctx,'finale','warehouse-crates',0,0,CELL,p.y);
  }else if(p.x===0){for(let row=0;row<4;row++)for(let col=0;col<3;col++)rect(ctx,9+col*20+(row%2)*5,18+row*10,18,8,row%2?'#777065':'#a49c8e');}
  else paintSceneProp(ctx,'finale','storage-rack',0,0,CELL,p.x+p.y);
  ctx.restore();
}
/** One nine-cell silhouette and one health pool, with a changed crown in phase two. */
function drawBoss(ctx:CanvasRenderingContext2D,state:FinaleState){
  const boss=state.boss;if(boss.phase==='defeated'){text(ctx,'长夜已破',(boss.x+1.5)*CELL,(boss.y+1.5)*CELL,SCENE_INK.gold,18);return;}
  const raging=boss.tierPhase===2,windup=boss.phase==='windup';ctx.save();ctx.translate(boss.x*CELL+12,boss.y*CELL+8);ctx.scale(2.7,2.7);
  blocks(ctx,'#263b3533',[[6,74,68,6],[15,80,50,3]]);blocks(ctx,SCENE_INK.enemy,[[24,15,33,21],[17,30,48,34],[10,60,61,15],[5,41,14,30],[64,41,13,30],[18,74,19,7],[48,74,19,7]]);
  blocks(ctx,SCENE_INK.enemyLight,[[20,36,9,28],[54,36,9,28],[27,17,28,6],[8,43,7,19],[68,43,6,19]]);blocks(ctx,'#1a2e3e',[[30,39,22,33],[22,66,8,8],[53,66,8,8]]);
  blocks(ctx,raging?'#d0a06d':'#b9ac7b',[[22,8,37,8],[20,0,6,12],[37,2,6,12],[55,0,6,12],[16,31,11,5],[55,31,11,5],[31,57,20,4]]);blocks(ctx,windup?'#ffdc92':'#e8d7a3',[[29,27,8,4],[47,27,8,4]]);blocks(ctx,'#a7b398',[[35,45,13,7],[39,39,5,19]]);
  if(raging){blocks(ctx,'#e6be78',[[26,9,7,3],[48,10,8,3],[32,38,3,11],[35,47,3,12],[46,56,3,13]]);ctx.strokeStyle='#d4ab6c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(7,28);ctx.lineTo(1,21);ctx.moveTo(73,28);ctx.lineTo(79,21);ctx.stroke();}
  if(state.nightVisionRemaining>0){ctx.strokeStyle='#e7d392';ctx.lineWidth=1;ctx.strokeRect(18,16,46,58);}ctx.restore();
}
function drawLights(ctx:CanvasRenderingContext2D,state:FinaleState){
  const point=MAP.lightWaypoints[state.lightStage],x=(point.x+.5)*CELL,y=(point.y+.5)*CELL;
  if(state.lightStage>0){ctx.save();ctx.fillStyle='#edcf7838';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo((MAP.boss.x+3)*CELL,(MAP.boss.y+.1)*CELL);ctx.lineTo((MAP.boss.x+3)*CELL,(MAP.boss.y+2.9)*CELL);ctx.closePath();ctx.fill();ctx.strokeStyle='#d8bc78';ctx.lineWidth=3;ctx.setLineDash([6,8]);ctx.beginPath();ctx.moveTo((MAP.goal.x+1)*CELL,y);ctx.lineTo(x,y);ctx.stroke();ctx.restore();}
  ctx.save();ctx.globalAlpha=.85;blocks(ctx,'#8d9a7a',[[x-13,y+13,26,12],[x-18,y+24,8,5],[x+10,y+24,8,5]]);blocks(ctx,'#d5bd77',[[x-6,y+1,16,14],[x+10,y+3,5,10]]);rect(ctx,x-2,y+4,12,8,'#fff1b8');ctx.restore();
}
function drawEffects(ctx:CanvasRenderingContext2D,state:FinaleState){
  for(const effect of state.effects){ctx.save();ctx.globalAlpha=Math.min(1,effect.remaining*3);
    if(['attack','boss-attack','elite-attack','ally-attack'].includes(effect.kind)){const from=effect.kind==='boss-attack'?{x:state.boss.x+1,y:state.boss.y+1}:effect.from;ctx.strokeStyle=effect.kind==='boss-attack'||effect.kind==='elite-attack'?'#8b756f':'#c3a95f';ctx.lineWidth=effect.kind==='boss-attack'?4:2;ctx.beginPath();ctx.moveTo((from.x+.5)*CELL,(from.y+.5)*CELL);ctx.lineTo((effect.to.x+.5)*CELL,(effect.to.y+.5)*CELL);ctx.stroke();}
    else for(const p of effect.cells??[effect.to]){const x=p.x*CELL,y=p.y*CELL;ctx.strokeStyle=effect.kind==='heal'?'#8cb987':effect.kind==='shield'?'#79b0ac':effect.kind==='boss-skill'?'#bb7d62':'#cfb267';ctx.lineWidth=effect.kind==='boss-skill'?4:2;ctx.beginPath();ctx.arc(x+40,y+40,effect.kind==='arrival'?31:25,0,Math.PI*2);ctx.stroke();if(effect.kind==='heal'){rect(ctx,x+38,y+24,4,15,'#8cb987');rect(ctx,x+33,y+29,14,4,'#8cb987');}}ctx.restore();
  }
}
export function paintFinale(ctx:CanvasRenderingContext2D,state:FinaleState,selected:FinaleCatId|null,moveTarget:Position|null){
  ctx.clearRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);ctx.imageSmoothingEnabled=false;ctx.save();
  // Terrain and effects stop at the actual cells, leaving the irregular perimeter transparent.
  ctx.beginPath();for(const p of CELLS)ctx.rect(p.x*CELL,p.y*CELL,CELL,CELL);ctx.clip();
  for(const p of CELLS){
    const goal=p.x===MAP.goal.x&&p.y===MAP.goal.y,obstacle=obstacleCell(p.x,p.y);
    paintSceneTile(ctx,'finale',p.x,p.y,CELL,{goal,obstacle,spawn:MAP.spawns.some(cell=>cell.x===p.x&&cell.y===p.y),boss:MAP.bossCells.some(cell=>cell.x===p.x&&cell.y===p.y)});
    paintSceneEdge(ctx,'finale',p.x,p.y,CELL,mapCell);
    if(obstacle)drawObstacle(ctx,p,state);
  }
  for(const p of MAP.spawns){const x=p.x*CELL,y=p.y*CELL;ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=2;ctx.strokeRect(x+6,y+6,CELL-12,CELL-12);blocks(ctx,SCENE_INK.danger,[[x+46,y+23,5,26],[x+41,y+27,5,18],[x+36,y+31,5,10]]);}
  for(const p of MAP.bossCells)rect(ctx,p.x*CELL+3,p.y*CELL+3,CELL-6,CELL-6,'#d6a05d17');drawLights(ctx,state);paintCarryAnchor(ctx,state.carry,CELL,mapCell);
  for(const ally of state.allies){const x=ally.x*CELL,y=ally.y*CELL;rect(ctx,x+8,y+18,64,46,'#264f5b88');ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(x+8,y+18,64,46);ctx.setLineDash([]);if(ally.status==='waiting'){text(ctx,`第${ally.arriveWave}波`,x+40,y+44,SCENE_INK.label,11);}else if(ally.status==='retired')text(ctx,'已退场',x+40,y+48,'#a8b9bc',11);}
  const chosen=state.cats.find(cat=>cat.id===selected&&cat.status==='active');
  if(chosen&&!state.aim){ctx.fillStyle='#8ee2cb28';ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;for(const p of getAttackCells(chosen)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);}}
  if(state.aim){ctx.fillStyle='#7ccbd12d';for(const p of CELLS)if(!obstacleCell(p.x,p.y))ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);const cat=state.cats.find(value=>value.id===state.aim?.catId);if(cat&&state.aim.target){ctx.fillStyle='#f4ce8366';ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;for(const p of getSkillCells(cat,state.aim.target)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+5,p.y*CELL+5,CELL-10,CELL-10);}}}
  if(moveTarget&&mapCell(moveTarget.x,moveTarget.y)){ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;ctx.strokeRect(moveTarget.x*CELL+5,moveTarget.y*CELL+5,CELL-10,CELL-10);}
  if(state.boss.phase==='windup')for(const p of state.boss.targetCells){const x=p.x*CELL,y=p.y*CELL;rect(ctx,x+5,y+5,CELL-10,CELL-10,`rgba(255,153,121,${.2+.07*Math.sin(state.elapsed*9)})`);ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=3;ctx.strokeRect(x+6,y+6,CELL-12,CELL-12);text(ctx,'!',x+68,y+20,SCENE_INK.danger,16);}
  ctx.strokeStyle=state.nightVisionRemaining>0?SCENE_INK.gold:'#bf9c72';ctx.lineWidth=2;ctx.strokeRect(state.boss.x*CELL+4,state.boss.y*CELL+4,3*CELL-8,3*CELL-8);drawBoss(ctx,state);
  for(const elite of state.elites){const x=elite.x*CELL,y=elite.y*CELL;if(elite.status==='defeated'){text(ctx,'护卫已击败',x+40,y+46,SCENE_INK.selected);continue;}const armored=elite.id==='armor-guard';blocks(ctx,SCENE_INK.enemy,[[x+24,y+23,33,36],[x+18,y+46,14,17],[x+50,y+46,14,17],[x+24,y+15,8,13],[x+50,y+15,8,13]]);blocks(ctx,SCENE_INK.enemyLight,[[x+26,y+23,28,3],[x+24,y+27,4,19]]);blocks(ctx,'#e1c790',[[x+31,y+33,5,3],[x+47,y+33,5,3]]);if(armored){blocks(ctx,'#9caa8f',[[x+10,y+32,21,28],[x+13,y+60,15,5]]);rect(ctx,x+18,y+36,5,21,'#d0c5a1');}else{blocks(ctx,'#ac9271',[[x+58,y+19,4,41],[x+61,y+19,14,20]]);rect(ctx,x+64,y+23,7,3,'#e5d2a6');}rect(ctx,x+13,y+66,54,4,'#d4d8c6');rect(ctx,x+13,y+66,54*elite.hp/elite.maxHp,4,'#a18d77');text(ctx,elite.name,x+40,y+12,SCENE_INK.label,10);}
  for(const enemy of state.enemies){ctx.save();ctx.translate((enemy.x+.5)*CELL-19,(enemy.y+.5)*CELL-24+Math.sin(state.elapsed*6+enemy.x)*2);blocks(ctx,SCENE_INK.enemy,[[7,2,25,6],[4,8,31,31],[0,20,39,18],[4,38,8,9],[26,38,8,9]]);blocks(ctx,SCENE_INK.enemyLight,[[8,8,23,4],[4,12,5,20]]);blocks(ctx,'#e8dbb0',[[10,19,6,3],[24,19,6,3]]);if(enemy.kind==='runner')rect(ctx,2,31,34,4,'#a98a69');if(enemy.kind==='heavy')blocks(ctx,'#898a73',[[1,23,8,16],[31,23,8,16]]);if(enemy.slowRemaining>0){ctx.strokeStyle='#6c9ea8';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(19,47,22,5,0,0,Math.PI*2);ctx.stroke();}rect(ctx,1,-6,36,4,'#203946');rect(ctx,1,-6,36*enemy.hp/enemy.maxHp,4,'#c1ae83');ctx.restore();}
  drawEffects(ctx,state);const gx=MAP.goal.x*CELL,gy=MAP.goal.y*CELL;drawCat(ctx,'hero',gx+9,gy+5,62);
  for(const ally of state.allies){if(ally.status!=='active')continue;const x=ally.x*CELL,y=ally.y*CELL;smallCat(ctx,x+12,y+17,ally.color,ally.id==='taotao'?'#9c7358':ally.id==='controller'?'#7d969c':'#b6a9bf',1.7);if(ally.id==='taotao')blocks(ctx,'#c5ad72',[[x+56,y+38,15,8],[x+62,y+33,5,18]]);if(ally.shield>0){ctx.strokeStyle='#a1dce0';ctx.lineWidth=2;ctx.strokeRect(x+8,y+17,64,47);}}
  for(const cat of state.cats){if(cat.status!=='active')continue;const x=cat.x*CELL,y=cat.y*CELL;if(cat.id===selected){ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;ctx.strokeRect(x+4,y+4,CELL-8,CELL-8);}drawFinaleCat(ctx,cat.id,x+9,y+7,62,cat.cooldown>.5);if(cat.shield>0){ctx.strokeStyle='#a1dce0';ctx.fillStyle='#83bdc018';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+40,y+42,31,29,0,0,Math.PI*2);ctx.fill();ctx.stroke();}if(cat.attackBuffRemaining>0){ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+64,y+25);ctx.lineTo(x+68,y+17);ctx.lineTo(x+72,y+25);ctx.stroke();}}
  ctx.restore();
}
