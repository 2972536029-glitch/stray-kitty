import {paintCarryAnchor} from '../carry-painter';
import {paintSceneEdge, paintSceneProp, paintSceneTile, SCENE_INK} from '../scene-art';
import {paintTunnelObstacleScenery, TUNNEL_JOINED_OBSTACLE_CELLS} from '../scene-industrial-obstacles';
import {paintDetailedTunnelFixture} from '../scene-detailed-exteriors';
import {drawCat} from '../l00/painter';
import {drawChapterCat} from '../chapter/painter';
import {CELLS, MAP} from './config';
import {getAttackCells, getSkillCells, isDarkened, isEnemyVisible} from './engine';
import type {TunnelCatId, TunnelState, Position} from './types';

export const CELL=80;
export const BOARD_WIDTH=MAP.columns*CELL;
export const BOARD_HEIGHT=MAP.rows*CELL;
export const cellName=({x,y}:Position)=>`${'ABCDE'[y]}${x+1}`;
/** The bounding rectangle is not the map: absent cells never accept pointers. */
export const mapCell=(x:number,y:number)=>Number.isInteger(x)&&Number.isInteger(y)&&CELLS.some(cell=>cell.x===x&&cell.y===y);
export const obstacleCell=(x:number,y:number)=>MAP.obstacles.some(cell=>cell.x===x&&cell.y===y);
const joinedObstacles=new Set(TUNNEL_JOINED_OBSTACLE_CELLS.map(({x,y})=>`${x},${y}`));
export const OBSTACLE_NAMES:Readonly<Record<string,string>>={
  A3:'旧管堆',A7:'塌方碎石',A8:'封闭栅栏',B2:'封闭暗管',C8:'废弃机箱',
  D1:'塌方砖墙',D2:'绊线已排除',E7:'三号泄洪阀',E8:'铁栅后待救',
};
const rect=(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
const blocks=(ctx:CanvasRenderingContext2D,color:string,points:number[][])=>{for(const [x,y,w,h] of points)rect(ctx,x,y,w,h,color);};

function drawTunnelCat(ctx:CanvasRenderingContext2D,id:TunnelCatId,x:number,y:number,size:number,attacking:boolean){
  if(id==='caster'||id==='guard'||id==='tuanzi'||id==='diandian'){drawChapterCat(ctx,id,x,y,size,false,attacking);return;}
  const black=id==='momo',fur=black?'#525760':'#b48c69',light=black?'#737b80':'#e4c89d',patch=black?'#363d43':'#745b48';
  ctx.save();ctx.translate(x+(attacking?1:0),y);ctx.scale(size/32,size/32);
  blocks(ctx,'#263b352d',[[6,28,22,2],[10,30,13,1]]);
  blocks(ctx,fur,[[7,7,18,13],[7,4,5,8],[20,4,5,8],[6,10,21,8],[9,19,16,9],[7,26,8,3],[21,26,6,3],[25,22,5,4]]);
  blocks(ctx,light,[[11,14,12,6],[12,21,10,5],[9,26,4,2],[23,26,4,2]]);
  blocks(ctx,patch,[[8,7,3,7],[15,7,3,4],[22,7,3,7],[10,20,3,5],[22,20,3,4]]);
  blocks(ctx,black?'#d3c68a':'#385149',[[10,13,3,2],[21,13,3,2]]);rect(ctx,16,17,2,1,'#c48f80');
  if(!black){blocks(ctx,'#765a40',[[4,18,8,10],[5,28,6,2]]);blocks(ctx,'#c5a774',[[5,19,6,8],[7,20,2,6]]);blocks(ctx,'#a57358',[[12,20,12,2],[17,22,3,4]]);}
  else{blocks(ctx,'#8caa89',[[10,20,15,2],[17,22,3,3]]);blocks(ctx,'#e1d4a2',[[24,18,5,3],[23,21,7,6],[25,27,3,2]]);rect(ctx,25,22,3,4,'#fbf0be');}
  ctx.restore();
}

function drawPipe(ctx:CanvasRenderingContext2D,closed:boolean){
  if(paintDetailedTunnelFixture(ctx,'pipe')){
    if(closed)for(const x of [32,39,46]){
      rect(ctx,x+1,40,2,17,'#263b3c');rect(ctx,x,40,2,16,'#a1b0a6');
      rect(ctx,x,41,1,10,'#d0cfb1');rect(ctx,x,53,2,2,'#8b7155');
    }
    return;
  }
  paintSceneProp(ctx,'tunnel','pipe',0,0,CELL);
  if(closed)for(const x of [26,36,46,56])rect(ctx,x,34,3,17,'#bfc3b4');
  else{
    // The broken section is the existing A1 bypass, not another blocked pipe.
    blocks(ctx,'#272c25',[[31,26,11,29],[38,32,7,17]]);
    blocks(ctx,'#c5c8b8',[[29,26,3,10],[39,47,4,8]]);
    blocks(ctx,SCENE_INK.gold,[[31,39,10,3],[31,36,3,9]]);
  }
}

function rescuedCat(ctx:CanvasRenderingContext2D,x:number,y:number,fur:string,small=false){
  const size=small?.65:1;ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  blocks(ctx,fur,[[0,3,15,13],[1,0,4,6],[10,0,4,6],[2,16,12,8]]);
  blocks(ctx,'#f6ead1',[[4,11,8,4],[5,18,7,5]]);blocks(ctx,'#40534a',[[3,8,2,2],[10,8,2,2]]);
  ctx.restore();
}

function drawObstacle(ctx:CanvasRenderingContext2D,p:Position){
  const key=cellName(p);ctx.save();ctx.translate(p.x*CELL,p.y*CELL);
  if(key==='A3'||key==='B2')drawPipe(ctx,true);
  else if(key==='C8'){
    if(paintDetailedTunnelFixture(ctx,'cabinet')){ctx.restore();return;}
    blocks(ctx,'#152a2d77',[[13,59,55,7],[20,65,41,3]]);
    blocks(ctx,'#3e514e',[[18,23,44,36],[58,24,7,35],[15,58,50,5]]);
    blocks(ctx,'#818d80',[[18,25,40,31],[21,20,35,5]]);
    blocks(ctx,'#b6c0ac',[[21,18,35,4],[19,25,37,2],[20,28,2,26]]);
    blocks(ctx,'#5d6f63',[[56,22,6,33],[23,55,34,3],[17,59,46,2]]);
    blocks(ctx,'#d3d5bc',[[23,19,25,1],[20,25,4,1],[20,56,6,1]]);
    blocks(ctx,'#384d49',[[23,36,15,17],[41,35,14,19],[24,28,29,4]]);
    blocks(ctx,'#9da994',[[24,37,13,2],[24,39,2,12],[43,36,10,1]]);
    blocks(ctx,'#202f31',[[42,38,12,3],[42,44,12,3],[42,50,12,3],[27,42,6,6]]);
    blocks(ctx,'#708274',[[43,41,10,1],[43,47,10,1],[43,53,10,1],[60,30,2,17]]);
    blocks(ctx,'#c4c6ae',[[21,29,2,2],[54,29,2,2],[21,52,2,2],[54,52,2,2]]);
    blocks(ctx,'#8a7359',[[31,24,6,2],[55,46,3,5],[18,52,3,4],[40,57,5,2]]);
    blocks(ctx,'#263d3b',[[18,63,7,2],[25,64,10,2],[34,61,2,4]]);
    rect(ctx,25,44,5,2,SCENE_INK.gold);
  }else if(key==='D2'){
    // The continuous footing owns the posts; retain the clipped wire, tool and cleared check.
    ctx.strokeStyle='#c4a17a';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(23,42);ctx.lineTo(36,47);ctx.moveTo(45,48);ctx.lineTo(58,41);ctx.stroke();ctx.setLineDash([]);
    blocks(ctx,'#c4c4b5',[[32,26,17,13],[37,21,8,6],[38,39,5,9]]);ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(28,54);ctx.lineTo(36,60);ctx.lineTo(53,44);ctx.stroke();
  }else if(key==='E7'){
    if(!paintDetailedTunnelFixture(ctx,'valve'))paintSceneProp(ctx,'tunnel','valve',0,0,CELL);
  }else if(key==='E8'){
    blocks(ctx,'#15292c88',[[8,60,65,7],[14,67,54,2],[12,21,55,39]]);
    blocks(ctx,'#3b4e48',[[12,22,54,3],[12,25,3,33],[63,25,3,33]]);
    rescuedCat(ctx,15,25,'#be9872');rescuedCat(ctx,42,25,'#b4ada0');rescuedCat(ctx,28,49,'#c4a88b',true);rescuedCat(ctx,45,50,'#a5ada0',true);
    if(paintDetailedTunnelFixture(ctx,'cage')){ctx.restore();return;}
    blocks(ctx,'#7c7869',[[9,17,62,4],[9,60,62,3],[9,17,3,46],[68,17,3,46]]);
    blocks(ctx,'#b1b7a3',[[10,15,59,2],[9,19,1,40],[10,60,58,1]]);
    blocks(ctx,'#455b51',[[69,21,2,39],[12,62,57,2],[12,21,55,1]]);
    for(const x of [22,38,54]){rect(ctx,x+2,21,2,40,'#344940');rect(ctx,x,18,2,43,'#c4c6b7');rect(ctx,x,24,1,24,'#e1dfc7');}
    blocks(ctx,'#d0ccb0',[[10,18,2,2],[68,18,2,2],[10,60,2,2],[68,60,2,2]]);
    blocks(ctx,'#978266',[[29,18,5,2],[59,61,6,2],[69,45,2,5]]);
  }
  ctx.restore();
}

/** A sluice-armoured shadow with a visible breaker lamp; footprint remains exactly 2 × 2. */
function drawBoss(ctx:CanvasRenderingContext2D,state:TunnelState){
  const boss=state.boss;if(boss.phase==='defeated')return;
  const windup=boss.phase==='windup',basic=state.effects.find(effect=>effect.kind==='boss-attack');
  const lunge=basic?Math.sin(Math.PI*(1-Math.min(1,basic.remaining/.4)))*3:0;
  ctx.save();ctx.translate(boss.x*CELL+10-lunge,boss.y*CELL+6);ctx.scale(1.7,1.7);
  blocks(ctx,'#263b3533',[[6,77,70,6],[14,82,54,3]]);
  blocks(ctx,'#2e475b',[[20,15,42,16],[15,30,52,36],[10,66,23,13],[49,66,23,13],[10,33,8,30],[65,33,8,30]]);
  blocks(ctx,'#739bac',[[19,29,8,36],[56,30,8,35],[24,17,34,5]]);
  // Visor, inset plates and stepped boots add form inside the existing blue armour.
  blocks(ctx,'#213b50',[[23,24,36,6],[28,35,28,5],[29,49,25,11],[12,74,17,3],[52,74,17,3]]);
  blocks(ctx,'#4f7488',[[22,17,4,7],[54,18,5,6],[20,36,3,22],[59,36,3,20],[13,67,16,4],[53,67,15,4]]);
  blocks(ctx,'#9ebcc4',[[24,18,2,3],[55,19,2,3],[21,37,1,8],[60,37,1,8],[15,68,9,1],[55,68,9,1]]);
  blocks(ctx,'#c5d9dc',[[15,9,52,7],[11,20,6,52],[67,20,6,52],[15,70,52,5]]);
  blocks(ctx,'#8caab8',[[18,14,46,1],[15,23,1,43],[71,23,1,43],[18,74,46,1]]);
  blocks(ctx,'#e0e9df',[[19,10,10,1],[49,10,12,1],[12,23,1,8],[68,23,1,8]]);
  for(const [x,y] of [[13,26],[69,26],[13,64],[69,64]]){
    rect(ctx,x,y,2,2,'#3a5c70');rect(ctx,x,y,1,1,'#d8e3d8');
  }
  blocks(ctx,'#f3d68a',[[27,31,9,4],[47,31,9,4]]);
  blocks(ctx,'#2e475b',[[38,37,7,2]]);
  blocks(ctx,'#f5e3a4',[[28,31,2,1],[53,31,2,1]]);
  blocks(ctx,SCENE_INK.gold,[[27,43,29,4],[27,62,29,3]]);
  ctx.strokeStyle='#dfbf7f';ctx.lineWidth=3;ctx.beginPath();ctx.arc(42,55,12,0,Math.PI*2);ctx.moveTo(30,55);ctx.lineTo(54,55);ctx.moveTo(42,43);ctx.lineTo(42,67);ctx.stroke();
  blocks(ctx,'#927f5b',[[40,53,4,4],[28,45,7,1],[47,64,7,1]]);
  blocks(ctx,'#eddaa0',[[40,53,3,1],[41,54,1,1],[29,43,8,1],[48,62,6,1]]);
  blocks(ctx,'#678492',[[3,32,10,10],[70,32,10,10],[0,43,7,22],[76,43,7,22]]);
  blocks(ctx,'#94adb6',[[4,34,7,2],[71,34,7,2],[1,46,3,2],[77,46,3,2]]);
  blocks(ctx,'#3d5a6d',[[5,39,6,2],[72,39,6,2],[1,54,4,1],[1,61,4,2],[77,54,4,1],[77,61,4,2]]);
  rect(ctx,32,0,20,10,'#6f7d65');rect(ctx,35,2,14,6,windup&&Math.sin(state.elapsed*9)>0?'#dba86e':windup?'#f0d8a0':'#b5c99c');
  blocks(ctx,'#445c59',[[33,8,18,1],[50,2,1,5]]);rect(ctx,33,1,1,3,'#a1b39a');
  if(windup){
    ctx.strokeStyle='#caa56e';ctx.lineWidth=2;
    for(const [x,y,dx,dy] of [[20,0,-5,-4],[62,0,5,-4],[14,10,-8,0],[68,10,8,0]]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();}
  }
  ctx.restore();
}

function drawEffects(ctx:CanvasRenderingContext2D,state:TunnelState){
  const dark=isDarkened(state);
  for(const effect of state.effects){
    // Do not reveal a concealed target with projectile endpoints or hit flashes.
    if(dark&&(effect.kind==='attack'||effect.kind==='defeat'||effect.kind==='skill'&&!effect.cells)&&!isEnemyVisible(state,effect.to))continue;
    ctx.save();ctx.globalAlpha=Math.min(1,effect.remaining*3);
    if(effect.kind==='attack'||effect.kind==='boss-attack'){
      const from=effect.kind==='boss-attack'?{x:state.boss.x+.5,y:state.boss.y+.5}:effect.from;
      ctx.strokeStyle=effect.kind==='attack'?SCENE_INK.gold:'#879471';ctx.lineWidth=effect.kind==='attack'?2:4;ctx.beginPath();ctx.moveTo((from.x+.5)*CELL,(from.y+.5)*CELL);ctx.quadraticCurveTo((from.x+effect.to.x+1)*CELL/2,(from.y+effect.to.y)*CELL/2-12,(effect.to.x+.5)*CELL,(effect.to.y+.5)*CELL);ctx.stroke();
    }else if(effect.kind==='blackout'){
      ctx.strokeStyle='#d2ac72';ctx.lineWidth=2;for(const p of CELLS)ctx.strokeRect(p.x*CELL+6,p.y*CELL+6,CELL-12,CELL-12);
    }else for(const p of effect.cells??[effect.to]){
      const x=p.x*CELL,y=p.y*CELL;ctx.strokeStyle=effect.kind==='night-vision'?'#b9dcc2':effect.kind==='heal'?'#8cb987':effect.kind==='shield'?'#79b0ac':SCENE_INK.gold;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(x+40,y+40,25,0,Math.PI*2);ctx.stroke();
      if(effect.kind==='heal'){rect(ctx,x+38,y+24,4,15,'#8cb987');rect(ctx,x+33,y+29,14,4,'#8cb987');}
    }
    ctx.restore();
  }
}

export function paintTunnel(ctx:CanvasRenderingContext2D,state:TunnelState,selected:TunnelCatId|null,moveTarget:Position|null){
  const dark=isDarkened(state),night=state.nightVisionRemaining>0,windup=state.boss.phase==='windup';
  ctx.clearRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);ctx.imageSmoothingEnabled=false;ctx.save();
  // All terrain, effects and sprites are clipped to the 37 actual cells, including during blackout.
  ctx.beginPath();for(const p of CELLS)ctx.rect(p.x*CELL,p.y*CELL,CELL,CELL);ctx.clip();
  for(const p of CELLS){
    const goal=p.x===MAP.goal.x&&p.y===MAP.goal.y,obstacle=obstacleCell(p.x,p.y);
    paintSceneTile(ctx,'tunnel',p.x,p.y,CELL,{goal,obstacle,spawn:MAP.spawns.some(cell=>cell.x===p.x&&cell.y===p.y),boss:MAP.bossCells.some(cell=>cell.x===p.x&&cell.y===p.y)});
    if(!joinedObstacles.has(`${p.x},${p.y}`))paintSceneEdge(ctx,'tunnel',p.x,p.y,CELL,mapCell);
  }
  paintTunnelObstacleScenery(ctx);
  for(const p of MAP.obstacles)drawObstacle(ctx,p);
  ctx.save();drawPipe(ctx,false);ctx.restore();
  for(const p of MAP.spawns){
    const x=p.x*CELL,y=p.y*CELL;ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=2;ctx.strokeRect(x+5,y+5,CELL-10,CELL-10);
    if(p.y===0){
      ctx.fillStyle='#8b9283';ctx.beginPath();ctx.ellipse(x+42,y+35,22,17,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#242e29';ctx.beginPath();ctx.ellipse(x+42,y+35,16,12,0,0,Math.PI*2);ctx.fill();
      blocks(ctx,'#d3c39a',[[x+20,y+32,13,4],[x+20,y+28,4,12]]);
    }else blocks(ctx,SCENE_INK.danger,[[x+45,y+24,4,23],[x+41,y+28,4,15],[x+37,y+32,4,7]]);
  }
  for(const p of MAP.bossCells)rect(ctx,p.x*CELL+3,p.y*CELL+3,CELL-6,CELL-6,'#e0b26c17');
  paintCarryAnchor(ctx,state.carry,CELL,mapCell);
  if(dark){ctx.fillStyle='#071421d4';for(const p of CELLS)ctx.fillRect(p.x*CELL+2,p.y*CELL+2,CELL-4,CELL-4);}
  else if(night){ctx.fillStyle='#9cdaca26';for(const p of CELLS)ctx.fillRect(p.x*CELL+3,p.y*CELL+3,CELL-6,CELL-6);}
  // Static known landmarks and warning remain readable; no hidden minion data is painted.
  ctx.strokeStyle=dark?SCENE_INK.label:SCENE_INK.gold;ctx.lineWidth=2;ctx.strokeRect(state.boss.x*CELL+4,state.boss.y*CELL+4,2*CELL-8,2*CELL-8);
  if(windup){ctx.strokeStyle=`rgba(255,153,121,${.55+.2*Math.sin(state.elapsed*8)})`;ctx.lineWidth=2;for(const p of CELLS)ctx.strokeRect(p.x*CELL+6,p.y*CELL+6,CELL-12,CELL-12);}
  const chosen=state.cats.find(cat=>cat.id===selected&&cat.status==='active');
  if(chosen&&!state.aim){ctx.fillStyle=dark?'#8ee2cb30':'#8ee2cb28';ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;for(const p of getAttackCells(chosen)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);}}
  if(state.aim){ctx.fillStyle='#7ccbd12d';for(const p of CELLS)if(!obstacleCell(p.x,p.y))ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);const cat=state.cats.find(value=>value.id===state.aim?.catId);if(cat&&state.aim.target){ctx.fillStyle='#f4ce8366';ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;for(const p of getSkillCells(cat,state.aim.target)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+5,p.y*CELL+5,CELL-10,CELL-10);}}}
  if(moveTarget&&mapCell(moveTarget.x,moveTarget.y)){ctx.strokeStyle=dark?'#e6f5d7':SCENE_INK.selected;ctx.lineWidth=2;ctx.strokeRect(moveTarget.x*CELL+5,moveTarget.y*CELL+5,CELL-10,CELL-10);}
  if(state.boss.phase==='defeated'){ctx.fillStyle=SCENE_INK.label;ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('监守已退去',(MAP.boss.x+1)*CELL,(MAP.boss.y+1)*CELL);}
  drawBoss(ctx,state);
  for(const enemy of state.enemies.filter(enemy=>isEnemyVisible(state,enemy))){
    ctx.save();ctx.translate((enemy.x+.5)*CELL-19,(enemy.y+.5)*CELL-24+Math.sin(state.elapsed*6+enemy.x)*2);
    blocks(ctx,SCENE_INK.enemy,[[7,2,25,6],[4,8,31,31],[0,20,39,18],[4,38,8,9],[26,38,8,9]]);blocks(ctx,SCENE_INK.enemyLight,[[8,8,23,4],[4,12,5,20]]);blocks(ctx,'#e8dbb0',[[10,19,6,3],[24,19,6,3]]);
    if(enemy.kind==='runner')rect(ctx,2,31,34,4,'#a98a69');if(enemy.kind==='heavy')blocks(ctx,'#898a73',[[1,23,8,16],[31,23,8,16]]);
    if(enemy.slowRemaining>0){ctx.strokeStyle='#6c9ea8';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(19,47,22,5,0,0,Math.PI*2);ctx.stroke();}
    rect(ctx,1,-6,36,4,'#203946');rect(ctx,1,-6,36*enemy.hp/enemy.maxHp,4,'#c1ae83');ctx.restore();
  }
  drawEffects(ctx,state);
  // Cats, HP and energy are drawn last, never under the blackout or full-board pulse.
  const gx=MAP.goal.x*CELL,gy=MAP.goal.y*CELL;
  if(dark){ctx.fillStyle='#e5e8cb24';ctx.beginPath();ctx.ellipse(gx+40,gy+40,33,33,0,0,Math.PI*2);ctx.fill();}
  drawCat(ctx,'hero',gx+9,gy+5,62);
  for(const cat of state.cats){
    if(cat.status!=='active')continue;const x=cat.x*CELL,y=cat.y*CELL;
    if(dark){ctx.fillStyle='#dfe7c926';ctx.beginPath();ctx.ellipse(x+40,y+42,33,30,0,0,Math.PI*2);ctx.fill();}
    if(cat.id===selected){ctx.strokeStyle=dark?'#c8ffe7':SCENE_INK.selected;ctx.lineWidth=2;ctx.strokeRect(x+4,y+4,CELL-8,CELL-8);}
    drawTunnelCat(ctx,cat.id,x+9,y+7,62,cat.cooldown>.5);
    if(cat.shield>0){ctx.strokeStyle='#a1dce0';ctx.fillStyle='#83bdc018';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+40,y+42,31,29,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    if(cat.attackBuffRemaining>0){ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+64,y+25);ctx.lineTo(x+68,y+17);ctx.lineTo(x+72,y+25);ctx.stroke();}

  }
  ctx.restore();
}
