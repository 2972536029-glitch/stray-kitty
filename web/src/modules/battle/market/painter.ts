import {paintCarryAnchor} from '../carry-painter';
import {drawCat} from '../l00/painter';
import {drawChapterCat} from '../chapter/painter';
import {CELLS, MAP, ROUTES} from './config';
import {getAttackCells, getSkillCells} from './engine';
import type {MarketCatId, MarketState, Position} from './types';
import {paintSceneEdge, paintSceneProp, paintSceneTile, SCENE_INK} from '../scene-art';

export const CELL=80;
export const BOARD_WIDTH=MAP.columns*CELL;
export const BOARD_HEIGHT=MAP.rows*CELL;
export const cellName=({x,y}:Position)=>`${'ABCDE'[y]}${x+1}`;
export const mapCell=(x:number,y:number)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<MAP.columns&&y>=0&&y<MAP.rows;
export const obstacleCell=(x:number,y:number)=>MAP.obstacles.some(cell=>cell.x===x&&cell.y===y);
const rect=(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
const blocks=(ctx:CanvasRenderingContext2D,color:string,points:number[][])=>{for(const [x,y,w,h] of points)rect(ctx,x,y,w,h,color);};

function drawMarketCat(ctx:CanvasRenderingContext2D,id:MarketCatId,x:number,y:number,size:number,attacking:boolean){
  if(id!=='bruiser'&&id!=='controller'){drawChapterCat(ctx,id,x,y,size,false,attacking);return;}
  const fighter=id==='bruiser',fur=fighter?'#b48c69':'#c7d3d2',light=fighter?'#e4c89d':'#f2f0df',patch=fighter?'#745b48':'#8dabad';
  ctx.save();ctx.translate(x+(attacking?1:0),y);ctx.scale(size/32,size/32);
  blocks(ctx,'#263b352d',[[6,28,22,2],[10,30,13,1]]);
  blocks(ctx,fur,[[7,7,18,13],[7,4,5,8],[20,4,5,8],[6,10,21,8],[9,19,16,9],[7,26,8,3],[21,26,6,3],[25,22,5,4]]);
  blocks(ctx,light,[[11,14,12,6],[12,21,10,5],[9,26,4,2],[23,26,4,2]]);
  blocks(ctx,patch,[[8,7,3,7],[15,7,3,4],[22,7,3,7],[10,20,3,5],[22,20,3,4]]);
  blocks(ctx,'#385149',[[10,13,3,2],[21,13,3,2]]);rect(ctx,16,17,2,1,'#c48f80');
  if(fighter){
    blocks(ctx,'#765a40',[[4,18,8,10],[5,28,6,2]]);blocks(ctx,'#c5a774',[[5,19,6,8],[7,20,2,6]]);
    blocks(ctx,'#a57358',[[12,20,12,2],[17,22,3,4]]);
  }else{
    blocks(ctx,'#77989c',[[10,20,15,2],[15,22,5,3]]);blocks(ctx,'#d9bb68',[[17,22,3,4],[25,20,4,6]]);
    rect(ctx,26,26,2,1,'#657f83');
  }
  ctx.restore();
}

/** Fourteen fixed obstacle cells become pixel stalls, kept inside their tiles. */
function drawStall(ctx:CanvasRenderingContext2D,x:number,y:number,index:number){
  const kind=index%3;
  paintSceneProp(ctx,'market',(['food-stall','toy-stall','notice-stall'] as const)[kind],x,y,CELL,index);
  ctx.save();ctx.textAlign='center';ctx.fillStyle=SCENE_INK.label;ctx.font='9px "Microsoft YaHei",sans-serif';ctx.fillText(['食物摊','玩具摊','情报摊'][kind],x+40,y+67);
  ctx.restore();
}

/** A one-cell lantern keeper closes its lamp before sweeping sideways; no charge bar. */
function drawBoss(ctx:CanvasRenderingContext2D,state:MarketState){
  const boss=state.boss;if(boss.phase==='defeated')return;
  const windup=boss.phase==='windup',recover=boss.phase==='recovery';
  const hit=state.effects.find(effect=>effect.kind==='boss-attack');
  const jab=hit?Math.sin(Math.PI*(1-Math.min(1,hit.remaining/.4))):0;
  ctx.save();ctx.translate(boss.x*CELL,boss.y*CELL);
  blocks(ctx,'#223a343b',[[16,68,48,5],[23,73,33,2]]);
  const sway=windup?Math.sin(state.elapsed*12)*1.5:Math.sin(state.elapsed*2);
  ctx.translate(sway-jab*4,recover?4:0);
  blocks(ctx,SCENE_INK.enemy,[[24,15,29,13],[20,27,37,21],[16,48,45,17],[21,64,13,6],[44,64,13,6]]);
  blocks(ctx,SCENE_INK.enemyLight,[[26,17,25,4],[21,30,5,26],[52,35,5,23]]);
  blocks(ctx,SCENE_INK.gold,[[28,29,7,3],[44,29,7,3]]);
  blocks(ctx,'#85928a',[[26,46,27,5],[33,51,5,10]]);
  if(windup){
    // Both arms close the lantern shutters; dark rings spill along the marked row.
    blocks(ctx,SCENE_INK.enemy,[[10,31,13,7],[54,31,12,7]]);
    blocks(ctx,'#756748',[[10,15,4,47],[8,11,8,4]]);
    blocks(ctx,'#30484b',[[5,19,15,17],[7,17,11,3],[7,36,11,3]]);
    rect(ctx,11,22,3,10,'#b0a475');
    ctx.strokeStyle='#687b88';ctx.lineWidth=2;ctx.beginPath();ctx.arc(12,28,18,Math.PI*.65,Math.PI*1.9);ctx.stroke();
  }else{
    blocks(ctx,'#85714d',[[11-jab*5,24,4,40],[8-jab*5,19,10,4]]);
    blocks(ctx,'#b4a16c',[[5-jab*5,27,17,19],[8-jab*5,24,11,3]]);
    blocks(ctx,'#f0d68a',[[9-jab*5,30,9,12],[11-jab*5,28,5,16]]);
    if(recover){ctx.strokeStyle='#b8ab7a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(13,37,17,0,Math.PI);ctx.stroke();}
  }
  ctx.restore();
}

export function paintMarket(ctx:CanvasRenderingContext2D,state:MarketState,selected:MarketCatId|null,moveTarget:Position|null){
  ctx.clearRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);ctx.imageSmoothingEnabled=false;ctx.save();
  ctx.beginPath();ctx.rect(0,0,BOARD_WIDTH,BOARD_HEIGHT);ctx.clip();
  for(const position of CELLS){
    const {x,y}=position,bx=x*CELL,by=y*CELL,goal=x===MAP.goal.x&&y===MAP.goal.y,obstacle=obstacleCell(x,y);
    const spawn=MAP.spawns.some(cell=>cell.x===x&&cell.y===y);
    paintSceneTile(ctx,'market',x,y,CELL,{goal,obstacle,spawn});
    paintSceneEdge(ctx,'market',x,y,CELL,mapCell);
    ctx.fillStyle=SCENE_INK.label;ctx.textAlign='start';ctx.font='9px sans-serif';ctx.fillText(cellName(position),bx+7,by+CELL-7);
    if(obstacle)drawStall(ctx,bx,by,MAP.obstacles.findIndex(cell=>cell.x===x&&cell.y===y));
  }
  ctx.save();ctx.strokeStyle=SCENE_INK.route;ctx.lineWidth=1.1;ctx.setLineDash([4,7]);
  for(const path of Object.values(ROUTES)){ctx.beginPath();path.forEach((p,i)=>{const px=(p.x+.5)*CELL,py=(p.y+.5)*CELL;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.stroke();}ctx.restore();
  for(const {x,y} of MAP.spawns){
    const bx=x*CELL,by=y*CELL;ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=2;ctx.strokeRect(bx+5,by+5,CELL-10,CELL-10);
    const points=y===0?[[bx+29,by+26,23,4],[bx+33,by+30,15,4],[bx+37,by+34,7,4]]:y===4?[[bx+37,by+26,7,4],[bx+33,by+30,15,4],[bx+29,by+34,23,4]]:[[bx+45,by+24,4,23],[bx+41,by+28,4,15],[bx+37,by+32,4,7]];
    blocks(ctx,SCENE_INK.danger,points);ctx.textAlign='center';ctx.font='8px sans-serif';ctx.fillStyle=SCENE_INK.danger;ctx.fillText('出怪口',bx+40,by+58);
  }
  rect(ctx,MAP.boss.x*CELL+3,MAP.boss.y*CELL+3,CELL-6,CELL-6,'#66546f38');
  if(state.boss.phase==='defeated'){ctx.fillStyle=SCENE_INK.label;ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('首领已退去',(MAP.boss.x+.5)*CELL,(MAP.boss.y+.5)*CELL);}
  drawCat(ctx,'hero',8,MAP.goal.y*CELL+11,62);ctx.fillStyle=SCENE_INK.gold;ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('守护 C1',40,MAP.goal.y*CELL+73);
  paintCarryAnchor(ctx,state.carry,CELL,mapCell);
  const selectedCat=state.cats.find(cat=>cat.id===selected&&cat.status==='active');
  if(selectedCat&&!state.aim){ctx.fillStyle='#8ee2cb30';ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;for(const p of getAttackCells(selectedCat)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);}}
  if(state.aim){
    ctx.fillStyle='#8ee2cb38';for(const p of CELLS)if(!obstacleCell(p.x,p.y))ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);
    const cat=state.cats.find(value=>value.id===state.aim?.catId);
    if(cat&&state.aim.target){ctx.fillStyle='#f4ce8355';ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;for(const p of getSkillCells(cat,state.aim.target)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+5,p.y*CELL+5,CELL-10,CELL-10);}}
  }
  if(moveTarget&&mapCell(moveTarget.x,moveTarget.y)){ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;ctx.strokeRect(moveTarget.x*CELL+5,moveTarget.y*CELL+5,CELL-10,CELL-10);}
  if(state.boss.phase==='windup'){
    // Continuous dark strip and moving chevrons communicate a row sweep, not a ground slam.
    const glow=.22+.1*Math.sin(state.elapsed*9);
    for(const p of state.boss.targetCells){
      const x=p.x*CELL,y=p.y*CELL;ctx.fillStyle=`rgba(111,108,145,${glow})`;ctx.fillRect(x+3,y+3,CELL-6,CELL-6);
      ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=2;ctx.strokeRect(x+5,y+5,CELL-10,CELL-10);
      const shift=(state.elapsed*25)%24;for(const offset of [13,37,61]){ctx.beginPath();ctx.moveTo(x+offset+shift-12,y+31);ctx.lineTo(x+offset+shift-20,y+40);ctx.lineTo(x+offset+shift-12,y+49);ctx.stroke();}
    }
  }
  drawBoss(ctx,state);
  for(const enemy of state.enemies){
    ctx.save();ctx.translate((enemy.x+.5)*CELL-19,(enemy.y+.5)*CELL-24+Math.sin(state.elapsed*6+enemy.x)*2);
    blocks(ctx,SCENE_INK.enemy,[[7,2,25,6],[4,8,31,31],[0,20,39,18],[4,38,8,9],[26,38,8,9]]);blocks(ctx,SCENE_INK.enemyLight,[[8,8,23,4],[4,12,5,20]]);blocks(ctx,SCENE_INK.gold,[[10,19,6,3],[24,19,6,3]]);
    if(enemy.kind==='runner')rect(ctx,2,31,34,4,'#a98a69');if(enemy.kind==='heavy')blocks(ctx,'#898a73',[[1,23,8,16],[31,23,8,16]]);
    if(enemy.slowRemaining>0){ctx.strokeStyle='#a0d9e2';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(19,47,22,5,0,0,Math.PI*2);ctx.stroke();}
    rect(ctx,1,-6,36,4,'#243741');rect(ctx,1,-6,36*enemy.hp/enemy.maxHp,4,'#efc58a');ctx.restore();
  }
  for(const cat of state.cats){
    if(cat.status!=='active')continue;const x=cat.x*CELL,y=cat.y*CELL;
    if(cat.id===selected){ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;ctx.strokeRect(x+4,y+4,CELL-8,CELL-8);}
    drawMarketCat(ctx,cat.id,x+9,y+7,62,cat.cooldown>.5);
    if(cat.shield>0){ctx.strokeStyle='#8dd7e4';ctx.fillStyle='#8dd7e424';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+40,y+42,31,29,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    if(cat.attackBuffRemaining>0){ctx.strokeStyle='#f4ce83';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+64,y+25);ctx.lineTo(x+68,y+17);ctx.lineTo(x+72,y+25);ctx.stroke();}


    if(cat.energyBlockedRemaining>0){ctx.fillStyle='#e3bddd';ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.fillText('封能',x+40,y+61);}
  }
  for(const effect of state.effects){
    ctx.save();ctx.globalAlpha=Math.min(1,effect.remaining*3);
    if(effect.kind==='attack'||effect.kind==='boss-attack'){
      ctx.strokeStyle=effect.kind==='attack'?SCENE_INK.gold:SCENE_INK.danger;ctx.lineWidth=effect.kind==='attack'?2:4;ctx.beginPath();ctx.moveTo((effect.from.x+.5)*CELL,(effect.from.y+.5)*CELL);ctx.lineTo((effect.to.x+.5)*CELL,(effect.to.y+.5)*CELL);ctx.stroke();
    }else if(effect.kind==='heal'||effect.kind==='shield'){
      const x=(effect.to.x+.5)*CELL,y=(effect.to.y+.4)*CELL;blocks(ctx,effect.kind==='heal'?'#a9e0a8':'#a0e3ed',[[x-11,y-2,22,4],[x-2,y-11,4,22]]);
    }else for(const p of effect.cells??[effect.to]){
      const x=p.x*CELL,y=p.y*CELL;ctx.strokeStyle=effect.kind==='slam'?'#e3bddd':SCENE_INK.gold;ctx.lineWidth=3;
      if(effect.kind==='slam'){rect(ctx,x+3,y+3,CELL-6,CELL-6,'#e3bddd55');ctx.beginPath();ctx.moveTo(x+3,y+34);ctx.lineTo(x+77,y+46);ctx.moveTo(x+3,y+46);ctx.lineTo(x+77,y+34);ctx.stroke();}
      else {ctx.beginPath();ctx.arc(x+40,y+40,24,0,Math.PI*2);ctx.stroke();}
    }
    ctx.restore();
  }
  ctx.restore();
}
