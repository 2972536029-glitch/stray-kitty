import {drawCat} from '../l00/painter';
import type {ChapterState, ChapterCat, ChapterCatId as CatId, Position} from './types';
import {getAttackCells, getBossCells, getSkillCells} from './engine';
import {MAP} from './config';

export const CELL = 80;
export const BOARD_WIDTH = 960;
export const BOARD_HEIGHT = 400;
export const cellName = ({x,y}:Position) => `${'ABCDE'[y]}${x+1}`;
export function mapCell(x:number,y:number) { return x>=0&&x<12&&y>=0&&y<5&&(y>=3||(x>=4&&x<=5)); }
export function obstacleCell(x:number,y:number) { return x===5&&y<3&&y>=0; }

function rect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function pixelBlocks(ctx:CanvasRenderingContext2D,color:string,blocks:number[][]){for(const b of blocks)rect(ctx,b[0],b[1],b[2],b[3],color);}

/** New reinforcements are original pixel primitives, alongside the two established L00 cats. */
export function drawChapterCat(ctx:CanvasRenderingContext2D,id:CatId,x:number,y:number,size:number,sleep=false,attacking=false){
  if(id==='caster'||id==='guard'){drawCat(ctx,id,x,y,size,sleep?'sleep':attacking?'attack':'idle',.5);return;}
  const colors:Record<Exclude<CatId,'caster'|'guard'>,string[]>={
    tabby:['#a08a69','#d8c4a0','#635d4d','#9dbb8a'],hammer:['#bb8765','#f0d5aa','#65584b','#d1a55d'],
    frost:['#849da7','#c4d5d7','#536e7e','#a5e2dc'],singer:['#d9c7a8','#f4e8cc','#63594d','#d8a1a0'],
  };
  const [fur,light,patch,accent]=colors[id];
  ctx.save();ctx.translate(x,y);ctx.scale(size/32,size/32);ctx.imageSmoothingEnabled=false;
  pixelBlocks(ctx,'#14282044',[[6,28,22,2],[9,30,15,1]]);
  if(sleep){
    pixelBlocks(ctx,fur,[[7,18,17,10],[4,21,24,6],[6,16,4,6],[20,17,5,6]]);
    pixelBlocks(ctx,light,[[7,24,17,4],[5,23,6,3]]);pixelBlocks(ctx,patch,[[7,19,4,3],[19,20,6,4],[8,23,4,1]]);
    ctx.fillStyle='#d9e7cf';ctx.font='5px monospace';ctx.fillText('z',24,13);ctx.restore();return;
  }
  if(attacking)ctx.translate(1,-1);
  pixelBlocks(ctx,fur,[[8,8,17,12],[7,11,20,7],[8,5,5,7],[20,5,5,7],[10,19,14,9],[7,25,8,4],[21,25,7,4],[25,22,4,4]]);
  pixelBlocks(ctx,light,[[12,14,11,6],[13,21,9,5],[9,26,4,2],[23,26,4,2]]);
  pixelBlocks(ctx,patch,id==='tabby'?[[9,8,3,6],[15,8,3,3],[21,8,3,6],[11,20,3,4],[21,21,3,3]]:id==='hammer'?[[9,8,6,6],[21,8,4,7],[20,20,4,6]]:id==='singer'?[[9,10,16,6],[10,6,3,4],[21,6,3,4],[9,25,4,3],[23,25,3,3]]:[[10,7,3,4],[22,9,3,9],[22,22,2,4]]);
  pixelBlocks(ctx,'#354f44',[[11,13,3,2],[21,13,3,2]]);pixelBlocks(ctx,'#fff3c9',[[11,13,1,1],[21,13,1,1]]);rect(ctx,17,17,2,1,'#c28c82');
  pixelBlocks(ctx,accent,[[10,20,15,2],[12,22,3,4]]);
  if(id==='tabby'){pixelBlocks(ctx,'#c3c9ab',[[24,18,2,11],[23,17,4,3]]);}
  if(id==='hammer'){pixelBlocks(ctx,'#796049',[[24,16,2,12],[21,26,5,2]]);pixelBlocks(ctx,'#ba9a69',[[20,13,10,6],[21,12,8,8]]);rect(ctx,22,13,2,6,'#e2c58e');}
  if(id==='frost'){pixelBlocks(ctx,'#b5dcd5',[[25,17,2,11],[22,18,8,2],[23,16,6,5]]);rect(ctx,25,19,2,3,'#f5f0c6');}
  if(id==='singer'){pixelBlocks(ctx,'#d49b9f',[[23,18,6,7],[24,17,4,2]]);pixelBlocks(ctx,'#fae7be',[[25,19,2,5],[28,13,1,5],[26,17,3,2]]);}
  ctx.restore();
}

function drawRubbish(ctx:CanvasRenderingContext2D,x:number,y:number,index:number){
  ctx.save();ctx.translate(x,y);
  if(index===0){
    pixelBlocks(ctx,'#233a35',[[15,24,49,49],[11,18,57,8],[22,13,35,5]]);
    pixelBlocks(ctx,'#637d61',[[20,29,37,38],[15,20,48,5],[26,15,27,3]]);
    pixelBlocks(ctx,'#8fa081',[[24,34,4,28],[34,34,4,28],[45,34,4,28]]);rect(ctx,57,28,5,35,'#405c47');
  }else if(index===1){
    pixelBlocks(ctx,'#65513c',[[9,31,54,40],[42,16,27,42]]);pixelBlocks(ctx,'#b49061',[[13,36,46,31],[46,22,22,32]]);
    pixelBlocks(ctx,'#d3b47d',[[12,31,49,6],[46,17,22,6],[35,37,4,27],[55,23,3,27]]);pixelBlocks(ctx,'#806441',[[17,42,12,3],[47,32,6,4],[13,60,12,5]]);
  }else{
    pixelBlocks(ctx,'#1f3435',[[13,36,33,35],[20,26,19,13],[25,21,9,9],[42,46,28,25],[51,38,10,11]]);
    pixelBlocks(ctx,'#82918a',[[19,39,23,28],[23,30,13,10],[47,49,18,20]]);pixelBlocks(ctx,'#b6beb0',[[21,43,4,19],[49,52,3,13],[27,25,5,4]]);
    pixelBlocks(ctx,'#aa916e',[[7,67,15,4],[48,71,21,4]]);
  }
  ctx.restore();
}

function drawBoss(ctx:CanvasRenderingContext2D,state:ChapterState){
  const boss=state.boss;
  if(boss.phase==='defeated')return;
  const x=(boss.x+boss.width/2)*CELL,y=(boss.y+boss.height/2)*CELL;
  const windup=boss.phase==='windup';
  const bounce=windup?Math.sin(state.elapsed*18)*1.5:Math.sin(state.elapsed*2)*1.2;
  const scale=1.8;
  ctx.save();ctx.translate(x-36*scale+(windup?4:0),y-40*scale+bounce);ctx.scale(scale,scale);
  pixelBlocks(ctx,'#10242177',[[2,77,73,7],[11,83,52,3]]);
  pixelBlocks(ctx,'#303c3d',[[15,17,47,54],[10,33,58,37],[8,66,19,13],[46,66,18,13],[20,5,35,15],[15,12,46,16]]);
  pixelBlocks(ctx,'#52605b',[[17,18,8,34],[22,7,29,5],[53,25,9,39]]);
  pixelBlocks(ctx,'#c3b18b',[[25,29,10,5],[44,29,10,5]]);
  pixelBlocks(ctx,'#917b5c',[[17,47,46,8],[23,55,7,11],[48,55,7,11]]);
  if(windup){
    // A raised road barrier and leaning torso are the tell; no charge meter exists.
    pixelBlocks(ctx,'#5f6f63',[[5,3,11,35],[61,3,10,35]]);
    pixelBlocks(ctx,'#263c36',[[0,-16,76,8],[3,-8,70,16]]);
    pixelBlocks(ctx,'#a98c58',[[3,-14,70,6],[5,-5,66,8]]);
    pixelBlocks(ctx,'#e6c67c',[[9,-13,9,5],[31,-13,9,5],[53,-13,9,5]]);
    ctx.strokeStyle='#f4c56b';ctx.lineWidth=3;for(const a of [-1,1]){ctx.beginPath();ctx.moveTo(38+a*44,-16);ctx.lineTo(38+a*51,-23);ctx.stroke();}
  }else{
    pixelBlocks(ctx,'#263c36',[[-8,43,49,13],[-5,56,43,9]]);pixelBlocks(ctx,'#b09460',[[-5,46,44,7],[-2,56,37,5]]);
    if(boss.phase==='recovery'){ctx.strokeStyle='#edc078';ctx.lineWidth=3;ctx.beginPath();ctx.arc(30,78,38,Math.PI,Math.PI*2);ctx.stroke();}
  }
  ctx.restore();
}

export function paintChapter(ctx:CanvasRenderingContext2D,state:ChapterState,selected:CatId|null,moveTarget:Position|null){
  ctx.clearRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);ctx.imageSmoothingEnabled=false;
  const sky=ctx.createLinearGradient(0,0,0,BOARD_HEIGHT);sky.addColorStop(0,'#162c2e');sky.addColorStop(1,'#314c45');ctx.fillStyle=sky;ctx.fillRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);
  // The upper spaces are walls and rooftops, not extra playable platforms.
  for(let row=0;row<8;row++)for(let column=0;column<25;column++){
    const x=column*42+(row%2?21:0),y=row*29;
    if(x>305&&x<488)continue;rect(ctx,x+2,y+3,38,25,(row+column)%3===0?'#29433f':'#243c39');
  }
  rect(ctx,27,32,215,130,'#1c302f');rect(ctx,36,40,196,111,'#314a43');rect(ctx,46,50,176,92,'#223c38');
  for(let i=0;i<5;i++){rect(ctx,53+i*33,53,3,83,'#3f574b');rect(ctx,53+i*33,95,30,3,'#405b50');}
  rect(ctx,60,66,51,21,'#a19a5944');rect(ctx,121,103,39,24,'#cbb47422');
  rect(ctx,550,30,337,126,'#1d3432');for(let i=0;i<10;i++)rect(ctx,556+i*33,34,29,118,i%2?'#29443d':'#2e4940');
  rect(ctx,544,155,350,11,'#152f2b');rect(ctx,545,169,347,6,'#46604a');
  rect(ctx,271,0,9,225,'#597063');rect(ctx,278,0,4,220,'#213a33');rect(ctx,270,213,46,9,'#607469');
  ctx.strokeStyle='#101f20';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,10);ctx.quadraticCurveTo(470,98,960,15);ctx.stroke();
  for(const [x,y] of [[299,38],[502,53],[899,25]]){rect(ctx,x,y,8,13,'#c9ad67');rect(ctx,x-4,y+12,16,5,'#f1d898');}
  for(let y=0;y<5;y++)for(let x=0;x<12;x++){
    if(!mapCell(x,y))continue;
    const bx=x*CELL,by=y*CELL,goal=x===MAP.goal.x&&y===MAP.goal.y,spawn=MAP.spawns.some(p=>p.x===x&&p.y===y),obstacle=obstacleCell(x,y);
    rect(ctx,bx,by,CELL,CELL,'#233b35');rect(ctx,bx+2,by+2,CELL-4,CELL-4,obstacle?'#52604e':goal?'#829476':spawn?'#786251':(x+y)%2?'#63786b':'#6b7e70');
    rect(ctx,bx+3,by+3,CELL-6,3,obstacle?'#788367':'#93a28a');rect(ctx,bx+CELL-5,by+4,2,CELL-8,'#405d50');
    if(!obstacle){rect(ctx,bx+12+((x*11)%20),by+58,26,3,'#a9b7a02b');rect(ctx,bx+43,by+20+(y*7%19),20,2,'#d2ddc51d');}
    ctx.fillStyle='#dce3ca9c';ctx.font='10px "Microsoft YaHei",sans-serif';ctx.fillText(cellName({x,y}),bx+7,by+14);
    if(obstacle)drawRubbish(ctx,bx,by,y);
    if(spawn){
      ctx.strokeStyle='#dfab83';ctx.lineWidth=2;ctx.strokeRect(bx+5,by+5,CELL-10,CELL-10);
      if(y===0){pixelBlocks(ctx,'#e4b088',[[bx+29,by+30,23,5],[bx+33,by+35,15,5],[bx+37,by+40,7,5]]);}
      else pixelBlocks(ctx,'#e4b088',[[bx+50,by+29,5,23],[bx+45,by+33,5,15],[bx+40,by+37,5,7]]);
      ctx.fillStyle='#f1d4ae';ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.fillText('出怪口',bx+40,by+69);ctx.textAlign='start';
    }
  }
  // One footprint spans four logical cells; one boss sprite and one HP pool occupy it.
  ctx.save();ctx.fillStyle='#95826130';ctx.strokeStyle='#b9a072';ctx.lineWidth=2;
  for(const cell of getBossCells(state.boss))ctx.fillRect(cell.x*CELL+3,cell.y*CELL+3,CELL-6,CELL-6);
  ctx.strokeRect(state.boss.x*CELL+4,state.boss.y*CELL+4,state.boss.width*CELL-8,state.boss.height*CELL-8);
  if(state.boss.phase==='defeated'){
    ctx.fillStyle='#c9c7a3';ctx.font='bold 12px sans-serif';ctx.textAlign='center';
    ctx.fillText('首领已退去',(state.boss.x+state.boss.width/2)*CELL,(state.boss.y+state.boss.height/2)*CELL);ctx.textAlign='start';
  }
  ctx.restore();
  // A route cue stays underneath units, while the unused upper-right remains solid scenery.
  ctx.save();ctx.strokeStyle='#cbd4b83c';ctx.lineWidth=2;ctx.setLineDash([4,10]);
  for(const row of [3,4]){ctx.beginPath();ctx.moveTo(925,(row+.5)*CELL);ctx.lineTo(40,(row+.5)*CELL);if(row===4)ctx.lineTo(40,280);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(4.5*CELL,25);ctx.lineTo(4.5*CELL,3.5*CELL);ctx.lineTo(40,3.5*CELL);ctx.stroke();ctx.restore();
  drawCat(ctx,'hero',10,3*CELL+13,58);ctx.fillStyle='#f3e7b3';ctx.font='bold 10px sans-serif';ctx.fillText('守护点',21,3*CELL+74);
  const cat=state.cats.find(c=>c.id===selected&&c.status==='active');
  if(cat&&!state.aim){ctx.fillStyle='#b2d8a730';for(const p of getAttackCells(cat)){if(mapCell(p.x,p.y))ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);}}
  if(state.aim){
    const aimingCat=state.cats.find(c=>c.id===state.aim?.catId);
    ctx.fillStyle='#78c8c435';for(let y=0;y<5;y++)for(let x=0;x<12;x++)if(mapCell(x,y)&&!obstacleCell(x,y))ctx.fillRect(x*CELL+4,y*CELL+4,CELL-8,CELL-8);
    if(aimingCat&&state.aim.target){ctx.fillStyle='#e4c1638c';ctx.strokeStyle='#f8db8b';ctx.lineWidth=2;for(const p of getSkillCells(aimingCat,state.aim.target)){ctx.fillRect(p.x*CELL+4,p.y*CELL+4,CELL-8,CELL-8);ctx.strokeRect(p.x*CELL+5,p.y*CELL+5,CELL-10,CELL-10);}}
  }
  if(moveTarget&&mapCell(moveTarget.x,moveTarget.y)){ctx.strokeStyle='#fbebb6';ctx.lineWidth=3;ctx.strokeRect(moveTarget.x*CELL+5,moveTarget.y*CELL+5,CELL-10,CELL-10);}
  if(state.boss.phase==='windup'){
    for(const p of state.boss.targetCells){
      const x=p.x*CELL,y=p.y*CELL;ctx.fillStyle='#d8744055';ctx.fillRect(x+3,y+3,CELL-6,CELL-6);ctx.strokeStyle='#f5bc69';ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(x+12,y+58);ctx.lineTo(x+29,y+39);ctx.lineTo(x+40,y+48);ctx.lineTo(x+63,y+20);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+28,y+38);ctx.lineTo(x+22,y+21);ctx.moveTo(x+43,y+44);ctx.lineTo(x+62,y+52);ctx.stroke();
    }
  }
  // Minions can traverse the boss's footprint and remain visible in front of its body.
  drawBoss(ctx,state);
  for(const enemy of state.enemies){
    const x=(enemy.x+.5)*CELL,y=(enemy.y+.5)*CELL;ctx.save();ctx.translate(x-19,y-24+Math.sin(state.elapsed*6+enemy.x)*2);
    const heavy=enemy.kind==='heavy';pixelBlocks(ctx,heavy?'#3c4543':'#3a4c49',[[7,2,25,6],[4,8,31,31],[0,20,39,18],[4,38,8,9],[26,38,8,9]]);
    pixelBlocks(ctx,heavy?'#8e927b':'#75877a',[[8,8,23,4],[4,12,5,20]]);pixelBlocks(ctx,'#e7d29b',[[10,19,6,3],[24,19,6,3]]);
    if(enemy.kind==='runner')rect(ctx,2,31,34,4,'#b99169');if(heavy)pixelBlocks(ctx,'#898a73',[[1,23,8,16],[31,23,8,16]]);
    rect(ctx,1,-6,36,4,'#263c33');rect(ctx,1,-6,36*enemy.hp/enemy.maxHp,4,'#c2b986');ctx.restore();
  }
  for(const c of state.cats){
    if(c.status!=='active')continue;
    const x=c.x*CELL,y=c.y*CELL;
    if(c.id===selected){ctx.strokeStyle='#f6df9c';ctx.lineWidth=2;ctx.strokeRect(x+4,y+4,CELL-8,CELL-8);}
    drawChapterCat(ctx,c.id,x+9,y+9,62,false,c.cooldown>.5);
    if(c.shield>0){ctx.strokeStyle='#9dd5d8';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+40,y+43,31,29,0,0,Math.PI*2);ctx.stroke();}
    rect(ctx,x+10,y+65,60,5,'#273e32');rect(ctx,x+10,y+65,60*c.hp/c.maxHp,5,'#c2d29b');
    rect(ctx,x+10,y+72,60,3,'#394c38');rect(ctx,x+10,y+72,60*c.energy/100,3,c.energy>=100?'#ffdf81':'#aebdaa');
  }
  for(const fx of state.effects){
    ctx.save();ctx.globalAlpha=Math.min(1,fx.remaining*3);
    if(fx.kind==='attack'){
      const center=(p:Position)=>p.x===state.boss.x&&p.y===state.boss.y?{x:state.boss.x+state.boss.width/2-.5,y:state.boss.y+state.boss.height/2-.5}:p;
      const from=center(fx.from),to=center(fx.to);
      ctx.strokeStyle='#f1d999';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo((from.x+.5)*CELL,(from.y+.5)*CELL);ctx.lineTo((to.x+.5)*CELL,(to.y+.5)*CELL);ctx.stroke();
    }else if(fx.kind==='heal'||fx.kind==='shield'){
      const x=(fx.to.x+.5)*CELL,y=(fx.to.y+.4)*CELL;ctx.fillStyle=fx.kind==='heal'?'#c3e8ac':'#9de1e2';ctx.fillRect(x-13,y-2,26,4);ctx.fillRect(x-2,y-13,4,26);
    }else{
      for(const p of fx.cells??[fx.to]){ctx.strokeStyle=fx.kind==='slam'?'#ffd28b':'#f7e2a9';ctx.lineWidth=3;ctx.beginPath();ctx.arc((p.x+.5)*CELL,(p.y+.5)*CELL,25+8*Math.sin(fx.remaining*10),0,Math.PI*2);ctx.stroke();}
    }
    ctx.restore();
  }
  // The boss HP belongs to the HUD; the board carries its body-language warning only.
}

export function portrait(ctx:CanvasRenderingContext2D,cat:Pick<ChapterCat,'id'|'status'>){ctx.clearRect(0,0,64,64);drawChapterCat(ctx,cat.id,0,0,64,cat.status==='resting');}
