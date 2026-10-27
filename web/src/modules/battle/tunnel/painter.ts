import {paintCarryAnchor} from '../carry-painter';
import {drawCat} from '../l00/painter';
import {drawChapterCat} from '../chapter/painter';
import {CELLS, MAP, ROUTES} from './config';
import {getAttackCells, getSkillCells, isDarkened, isEnemyVisible} from './engine';
import type {TunnelCatId, TunnelState, Position} from './types';

export const CELL=80;
export const BOARD_WIDTH=MAP.columns*CELL;
export const BOARD_HEIGHT=MAP.rows*CELL;
export const cellName=({x,y}:Position)=>`${'ABCDE'[y]}${x+1}`;
/** The bounding rectangle is not the map: absent cells never accept pointers. */
export const mapCell=(x:number,y:number)=>Number.isInteger(x)&&Number.isInteger(y)&&CELLS.some(cell=>cell.x===x&&cell.y===y);
export const obstacleCell=(x:number,y:number)=>MAP.obstacles.some(cell=>cell.x===x&&cell.y===y);
export const OBSTACLE_NAMES:Readonly<Record<string,string>>={
  A3:'旧管堆',A7:'塌方碎石',A8:'封闭栅栏',B2:'封闭暗管',C8:'废弃机箱',
  D1:'塌方砖墙',D2:'绊线已识破',E7:'三号泄洪阀',E8:'铁栅后待救',
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
  blocks(ctx,'#8d9b8e',[[13,26,54,27],[9,23,8,33],[63,23,8,33]]);
  blocks(ctx,'#bcc6b0',[[17,28,46,6],[10,25,5,28],[64,25,5,28]]);
  blocks(ctx,'#5f7366',[[20,37,40,11],[12,18,7,6],[61,18,7,6]]);
  if(closed)for(const x of [26,36,46,56])rect(ctx,x,34,3,17,'#bac5ab');
  else{rect(ctx,33,26,7,28,'#f2efdf');rect(ctx,37,34,6,13,'#7c8c74');}
}

function rescuedCat(ctx:CanvasRenderingContext2D,x:number,y:number,fur:string,small=false){
  const size=small?.65:1;ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  blocks(ctx,fur,[[0,3,15,13],[1,0,4,6],[10,0,4,6],[2,16,12,8]]);
  blocks(ctx,'#f6ead1',[[4,11,8,4],[5,18,7,5]]);blocks(ctx,'#40534a',[[3,8,2,2],[10,8,2,2]]);
  ctx.restore();
}

function drawObstacle(ctx:CanvasRenderingContext2D,p:Position){
  const key=cellName(p);ctx.save();ctx.translate(p.x*CELL,p.y*CELL);
  if(key==='A3'||key==='B2'){drawPipe(ctx,true);if(key==='A3'){rect(ctx,27,17,36,6,'#a6b096');rect(ctx,33,12,8,11,'#bcc5ac');}}
  else if(key==='A7'||key==='D1'){
    blocks(ctx,'#9b9e8b',[[13,42,19,18],[33,28,22,28],[53,44,13,15],[20,20,12,18]]);
    blocks(ctx,'#c8c8ad',[[15,42,15,5],[35,29,17,6],[22,20,8,5],[52,45,12,5]]);
    blocks(ctx,'#747f70',[[27,55,8,5],[44,51,8,7],[16,60,47,3]]);
  }else if(key==='A8'){
    blocks(ctx,'#7d8d7a',[[15,17,5,43],[60,17,5,43],[15,19,50,4],[15,55,50,4]]);
    for(const x of [26,35,44,53])rect(ctx,x,22,3,34,'#a1b094');
    blocks(ctx,'#b5a17a',[[35,37,10,11],[38,32,5,6]]);
  }else if(key==='C8'){
    blocks(ctx,'#929f86',[[18,23,44,34],[15,57,50,5]]);blocks(ctx,'#bfc8ac',[[21,26,38,7],[22,38,16,14]]);
    blocks(ctx,'#657b68',[[42,38,14,3],[42,44,14,3],[42,50,14,3],[26,42,6,6]]);rect(ctx,25,44,5,2,'#e1c485');
  }else if(key==='D2'){
    blocks(ctx,'#a28b6b',[[15,29,11,29],[54,31,11,27]]);ctx.strokeStyle='#987659';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(23,42);ctx.lineTo(36,47);ctx.moveTo(45,48);ctx.lineTo(58,41);ctx.stroke();ctx.setLineDash([]);
    blocks(ctx,'#c4b59a',[[32,26,17,13],[37,21,8,6],[38,39,5,9]]);ctx.strokeStyle='#7b9671';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(28,54);ctx.lineTo(36,60);ctx.lineTo(53,44);ctx.stroke();
  }else if(key==='E7'){
    blocks(ctx,'#879783',[[30,15,22,48],[17,43,48,14]]);blocks(ctx,'#b8c3a6',[[33,17,7,40],[18,45,45,4]]);
    ctx.strokeStyle='#b79c65';ctx.lineWidth=4;ctx.beginPath();ctx.arc(42,32,15,0,Math.PI*2);ctx.moveTo(27,32);ctx.lineTo(57,32);ctx.moveTo(42,17);ctx.lineTo(42,47);ctx.stroke();
    rect(ctx,12,13,14,15,'#e8d9ad');ctx.fillStyle='#6f755a';ctx.textAlign='center';ctx.font='bold 11px sans-serif';ctx.fillText('3',19,25);
  }else if(key==='E8'){
    rescuedCat(ctx,15,25,'#be9872');rescuedCat(ctx,42,25,'#b4ada0');rescuedCat(ctx,28,49,'#c4a88b',true);rescuedCat(ctx,45,50,'#a5ada0',true);
    blocks(ctx,'#85947e',[[9,17,62,4],[9,60,62,3],[9,17,3,46],[68,17,3,46]]);
    for(const x of [22,38,54])rect(ctx,x,18,2,43,'#a7b698');
  }
  ctx.fillStyle='#69785f';ctx.textAlign='center';ctx.font='9px sans-serif';ctx.fillText(OBSTACLE_NAMES[key],40,73);ctx.restore();
}

/** A sluice-armoured shadow with a visible breaker lamp; footprint remains exactly 2 × 2. */
function drawBoss(ctx:CanvasRenderingContext2D,state:TunnelState){
  const boss=state.boss;if(boss.phase==='defeated')return;
  const windup=boss.phase==='windup',basic=state.effects.find(effect=>effect.kind==='boss-attack');
  const lunge=basic?Math.sin(Math.PI*(1-Math.min(1,basic.remaining/.4)))*3:0;
  ctx.save();ctx.translate(boss.x*CELL+10-lunge,boss.y*CELL+6);ctx.scale(1.7,1.7);
  blocks(ctx,'#263b3533',[[6,77,70,6],[14,82,54,3]]);
  blocks(ctx,'#586458',[[20,15,42,16],[15,30,52,36],[10,66,23,13],[49,66,23,13],[10,33,8,30],[65,33,8,30]]);
  blocks(ctx,'#82907a',[[19,29,8,36],[56,30,8,35],[24,17,34,5]]);
  blocks(ctx,'#b7b69a',[[15,9,52,7],[11,20,6,52],[67,20,6,52],[15,70,52,5]]);
  blocks(ctx,'#e8d8a5',[[27,31,9,4],[47,31,9,4]]);
  blocks(ctx,'#b4a177',[[27,43,29,4],[27,62,29,3]]);
  ctx.strokeStyle='#9daa8c';ctx.lineWidth=3;ctx.beginPath();ctx.arc(42,55,12,0,Math.PI*2);ctx.moveTo(30,55);ctx.lineTo(54,55);ctx.moveTo(42,43);ctx.lineTo(42,67);ctx.stroke();
  blocks(ctx,'#657460',[[3,32,10,10],[70,32,10,10],[0,43,7,22],[76,43,7,22]]);
  rect(ctx,32,0,20,10,'#6f7d65');rect(ctx,35,2,14,6,windup&&Math.sin(state.elapsed*9)>0?'#dba86e':windup?'#f0d8a0':'#b5c99c');
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
      ctx.strokeStyle=effect.kind==='attack'?'#bd9a54':'#879471';ctx.lineWidth=effect.kind==='attack'?2:4;ctx.beginPath();ctx.moveTo((from.x+.5)*CELL,(from.y+.5)*CELL);ctx.quadraticCurveTo((from.x+effect.to.x+1)*CELL/2,(from.y+effect.to.y)*CELL/2-12,(effect.to.x+.5)*CELL,(effect.to.y+.5)*CELL);ctx.stroke();
    }else if(effect.kind==='blackout'){
      ctx.strokeStyle='#d2ac72';ctx.lineWidth=2;for(const p of CELLS)ctx.strokeRect(p.x*CELL+6,p.y*CELL+6,CELL-12,CELL-12);
    }else for(const p of effect.cells??[effect.to]){
      const x=p.x*CELL,y=p.y*CELL;ctx.strokeStyle=effect.kind==='night-vision'?'#b9dcc2':effect.kind==='heal'?'#8cb987':effect.kind==='shield'?'#79b0ac':'#bca05e';ctx.lineWidth=2;
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
    const x=p.x*CELL,y=p.y*CELL,goal=p.x===MAP.goal.x&&p.y===MAP.goal.y,obstacle=obstacleCell(p.x,p.y);
    rect(ctx,x,y,CELL,CELL,'#f7f5e9');rect(ctx,x+3,y+3,CELL-6,CELL-6,goal?'#e1e8cf':obstacle?'#e4e8da':p.y===1?'#e3e9d8':'#eff0e2');
    ctx.strokeStyle=goal?'#8da46c':'#c7d2ba';ctx.lineWidth=goal?2:1;ctx.strokeRect(x+3.5,y+3.5,CELL-7,CELL-7);
    if(obstacle)drawObstacle(ctx,p);
    if(p.x===0&&p.y===0){ctx.save();ctx.translate(0,0);drawPipe(ctx,false);ctx.fillStyle='#718063';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('破管 · 可绕行',40,70);ctx.restore();}
  }
  ctx.save();ctx.strokeStyle='#aebd9c';ctx.lineWidth=1.2;ctx.setLineDash([4,7]);for(const path of Object.values(ROUTES)){ctx.beginPath();path.forEach((p,i)=>{if(i===0)ctx.moveTo((p.x+.5)*CELL,(p.y+.5)*CELL);else ctx.lineTo((p.x+.5)*CELL,(p.y+.5)*CELL);});ctx.stroke();}ctx.restore();
  for(const p of MAP.spawns){
    const x=p.x*CELL,y=p.y*CELL;ctx.strokeStyle='#ad7963';ctx.lineWidth=2;ctx.strokeRect(x+5,y+5,CELL-10,CELL-10);
    if(p.y===0){
      ctx.fillStyle='#7e8c76';ctx.beginPath();ctx.ellipse(x+42,y+35,22,17,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#46574b';ctx.beginPath();ctx.ellipse(x+42,y+35,16,12,0,0,Math.PI*2);ctx.fill();
      blocks(ctx,'#d3c39a',[[x+20,y+32,13,4],[x+20,y+28,4,12]]);
    }else blocks(ctx,'#ad7963',[[x+45,y+24,4,23],[x+41,y+28,4,15],[x+37,y+32,4,7]]);
    ctx.textAlign='center';ctx.font='9px sans-serif';ctx.fillStyle='#9d745d';ctx.fillText(p.y===0?'暗管口 ←':'出怪口 ←',x+40,y+62);
  }
  for(const p of MAP.bossCells)rect(ctx,p.x*CELL+3,p.y*CELL+3,CELL-6,CELL-6,'#a9b29430');
  paintCarryAnchor(ctx,state.carry,CELL,mapCell);
  if(dark){ctx.fillStyle='#33423aca';for(const p of CELLS)ctx.fillRect(p.x*CELL+2,p.y*CELL+2,CELL-4,CELL-4);}
  else if(night){ctx.fillStyle='#b4d4c226';for(const p of CELLS)ctx.fillRect(p.x*CELL+3,p.y*CELL+3,CELL-6,CELL-6);}
  // Static known landmarks and warning remain readable; no hidden minion data is painted.
  ctx.strokeStyle=dark?'#a8b28e':'#a1ad88';ctx.lineWidth=2;ctx.strokeRect(state.boss.x*CELL+4,state.boss.y*CELL+4,2*CELL-8,2*CELL-8);
  if(windup){ctx.strokeStyle=`rgba(186,146,77,${.55+.2*Math.sin(state.elapsed*8)})`;ctx.lineWidth=2;for(const p of CELLS)ctx.strokeRect(p.x*CELL+6,p.y*CELL+6,CELL-12,CELL-12);}
  const chosen=state.cats.find(cat=>cat.id===selected&&cat.status==='active');
  if(chosen&&!state.aim){ctx.fillStyle=dark?'#b7cda22f':'#788f6c32';ctx.strokeStyle=dark?'#c3d4a5':'#7b916d';ctx.lineWidth=2;for(const p of getAttackCells(chosen)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);}}
  if(state.aim){ctx.fillStyle='#8fc5c044';for(const p of CELLS)if(!obstacleCell(p.x,p.y))ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);const cat=state.cats.find(value=>value.id===state.aim?.catId);if(cat&&state.aim.target){ctx.fillStyle='#f0d16c80';ctx.strokeStyle='#ba8f32';ctx.lineWidth=2;for(const p of getSkillCells(cat,state.aim.target)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+5,p.y*CELL+5,CELL-10,CELL-10);}}}
  if(moveTarget&&mapCell(moveTarget.x,moveTarget.y)){ctx.strokeStyle=dark?'#d6dfbb':'#8fa579';ctx.lineWidth=2;ctx.strokeRect(moveTarget.x*CELL+5,moveTarget.y*CELL+5,CELL-10,CELL-10);}
  if(state.boss.phase==='defeated'){ctx.fillStyle=dark?'#d3ddbc':'#89957e';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('监守已退去',(MAP.boss.x+1)*CELL,(MAP.boss.y+1)*CELL);}
  drawBoss(ctx,state);
  for(const enemy of state.enemies.filter(enemy=>isEnemyVisible(state,enemy))){
    ctx.save();ctx.translate((enemy.x+.5)*CELL-19,(enemy.y+.5)*CELL-24+Math.sin(state.elapsed*6+enemy.x)*2);
    blocks(ctx,'#4d5659',[[7,2,25,6],[4,8,31,31],[0,20,39,18],[4,38,8,9],[26,38,8,9]]);blocks(ctx,'#7c7e79',[[8,8,23,4],[4,12,5,20]]);blocks(ctx,'#e8dbb0',[[10,19,6,3],[24,19,6,3]]);
    if(enemy.kind==='runner')rect(ctx,2,31,34,4,'#a98a69');if(enemy.kind==='heavy')blocks(ctx,'#898a73',[[1,23,8,16],[31,23,8,16]]);
    if(enemy.slowRemaining>0){ctx.strokeStyle='#6c9ea8';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(19,47,22,5,0,0,Math.PI*2);ctx.stroke();}
    rect(ctx,1,-6,36,4,'#d6daca');rect(ctx,1,-6,36*enemy.hp/enemy.maxHp,4,'#9b9c79');ctx.restore();
  }
  drawEffects(ctx,state);
  // Cats, HP and energy are drawn last, never under the blackout or full-board pulse.
  const gx=MAP.goal.x*CELL,gy=MAP.goal.y*CELL;
  if(dark){ctx.fillStyle='#e5e8cb24';ctx.beginPath();ctx.ellipse(gx+40,gy+40,33,33,0,0,Math.PI*2);ctx.fill();}
  drawCat(ctx,'hero',gx+9,gy+5,62);ctx.fillStyle=dark?'#f3ecc9':'#758052';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('喵喵 · 守护 C2',gx+40,gy+73);
  for(const cat of state.cats){
    if(cat.status!=='active')continue;const x=cat.x*CELL,y=cat.y*CELL;
    if(dark){ctx.fillStyle='#dfe7c926';ctx.beginPath();ctx.ellipse(x+40,y+42,33,30,0,0,Math.PI*2);ctx.fill();}
    if(cat.id===selected){ctx.strokeStyle=dark?'#cedfae':'#7d986b';ctx.lineWidth=2;ctx.strokeRect(x+4,y+4,CELL-8,CELL-8);}
    drawTunnelCat(ctx,cat.id,x+9,y+7,62,cat.cooldown>.5);
    if(cat.shield>0){ctx.strokeStyle='#77aeb9';ctx.fillStyle='#83bdc018';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+40,y+42,31,29,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    if(cat.attackBuffRemaining>0){ctx.strokeStyle='#bf8b58';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+64,y+25);ctx.lineTo(x+68,y+17);ctx.lineTo(x+72,y+25);ctx.stroke();}
    rect(ctx,x+10,y+65,60,5,'#d7ddc9');rect(ctx,x+10,y+65,60*cat.hp/cat.maxHp,5,'#82a078');rect(ctx,x+10,y+72,60,3,'#d7ddc9');rect(ctx,x+10,y+72,60*cat.energy/100,3,cat.energy>=100?'#d6b46a':'#bac3a0');
  }
  for(const p of CELLS){ctx.fillStyle=dark?'#c6d0b7':'#89957e';ctx.font='8px sans-serif';ctx.textAlign='start';ctx.fillText(cellName(p),p.x*CELL+5,p.y*CELL+CELL-4);}
  ctx.restore();
}
