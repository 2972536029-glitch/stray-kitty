import type {CatId, CombatState} from './state';
import {COMMANDER_POSITION, SPAWN_POINTS, isSpawnCell} from './config';
import {getAttackCells, getSkillCells, getSkillTargetCells} from './ranges';
import {paintSceneEdge, paintSceneTile, SCENE_INK} from '../scene-art';
import {battleReducedMotion, drawDamagePop, drawHitBurst, drawShatter} from '../battleFx';

export type CatKind = CatId | 'advisor';
export type CatPose = 'idle' | 'attack' | 'hurt' | 'sleep';
type Palette = {fur: string; light: string; shade: string; patch: string; eye: string; accent: string};
const palettes: Record<CatKind, Palette> = {
  hero: {fur:'#e8d29c',light:'#fff4d8',shade:'#bc9e67',patch:'#c9ab72',eye:'#6e9665',accent:'#b97a63'},
  caster: {fur:'#e8e3d9',light:'#fffdf0',shade:'#c4bbb0',patch:'#8c7c72',eye:'#7197a0',accent:'#77989a'},
  guard: {fur:'#f5f0df',light:'#fffbed',shade:'#c9c7b7',patch:'#424c49',eye:'#648678',accent:'#759080'},
  advisor: {fur:'#eae4cf',light:'#fff8e5',shade:'#c3baa4',patch:'#c49165',eye:'#6c856b',accent:'#718263'},
};
function pixel(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function blocks(ctx:CanvasRenderingContext2D,color:string,rects:number[][]){for(const [x,y,w,h] of rects)pixel(ctx,x,y,w,h,color);}

/** All sprites are battle-local canvas primitives; no map or story assets are replaced. */
export function drawCat(ctx:CanvasRenderingContext2D,kind:CatKind,x:number,y:number,size:number,pose:CatPose='idle',motion=0){
  const p=palettes[kind];ctx.save();ctx.translate(x,y);ctx.scale(size/32,size/32);ctx.imageSmoothingEnabled=false;
  if(pose==='attack')ctx.translate(Math.sin(motion*Math.PI)*2,-Math.sin(motion*Math.PI));
  if(pose==='hurt')ctx.translate(Math.sin(motion*Math.PI*5),0);
  blocks(ctx,'#314b3520',[[7,28,21,2],[10,30,14,1]]);
  if(pose==='sleep'){
    blocks(ctx,p.fur,[[12,19,13,9],[16,17,7,2],[23,20,4,7],[6,18,11,9],[4,21,3,5],[7,16,4,4],[14,17,3,3]]);
    blocks(ctx,p.shade,[[23,21,3,6],[18,26,7,2],[10,26,7,2]]);
    blocks(ctx,p.light,[[5,23,7,4],[9,25,7,2]]);
    blocks(ctx,p.patch,kind==='caster'?[[5,20,9,4],[6,19,6,2]]:[[7,19,4,3],[19,19,6,5]]);
    blocks(ctx,p.shade,[[11,27,15,2],[25,24,3,3],[26,21,2,3]]);
    blocks(ctx,p.fur,[[12,26,13,2],[24,23,3,3],[25,21,2,2]]);
    blocks(ctx,kind==='caster'?p.light:'#4b5148',[[8,22,4,1],[11,23,1,1]]);
    pixel(ctx,5,24,1,1,'#c49386');
    ctx.fillStyle='#85967b';ctx.font='5px monospace';ctx.fillText('z',23,14);ctx.restore();return;
  }
  blocks(ctx,p.fur,[[9,19,15,9],[7,22,4,5],[22,22,4,5],[8,8,17,13],[9,6,5,5],[20,6,4,5],[7,11,2,7],[25,11,2,7]]);
  blocks(ctx,'#5a594c',[[10,5,3,3],[21,5,2,3]]);
  blocks(ctx,p.light,[[11,15,11,5],[8,26,6,3],[21,26,6,3]]);
  blocks(ctx,p.shade,[[23,12,2,7],[21,19,3,2],[22,22,2,5]]);
  if(kind==='hero'||kind==='caster')blocks(ctx,p.fur,[[6,14,2,4],[5,16,2,2],[26,14,2,5],[27,17,2,2],[8,20,2,3],[24,20,2,3]]);
  if(kind==='hero'){
    blocks(ctx,p.patch,[[8,9,2,4],[23,9,2,5],[24,18,2,2]]);
    blocks(ctx,p.light,[[11,20,11,4],[13,24,8,3]]);
    blocks(ctx,p.accent,[[22,8,3,3],[27,8,3,3],[25,9,2,2]]);
  }else if(kind==='caster'){
    blocks(ctx,p.patch,[[9,8,5,8],[20,8,5,8],[12,11,10,6]]);
    blocks(ctx,p.fur,[[16,9,2,5],[15,14,4,3]]);blocks(ctx,p.light,[[11,16,11,4],[12,20,9,4]]);
  }else{
    blocks(ctx,p.patch,[[8,9,6,6],[18,21,6,6]]);pixel(ctx,20,8,5,5,kind==='advisor'?'#4b5148':p.patch);
  }
  pixel(ctx,10,20,13,2,p.accent);pixel(ctx,12,22,3,4,p.accent);
  if(pose==='hurt')blocks(ctx,'#4b5148',[[11,14,3,1],[20,14,3,1],[12,13,1,1],[21,13,1,1]]);
  else{blocks(ctx,p.eye,[[11,13,3,3],[20,13,3,3]]);blocks(ctx,'#3f493f',[[12,14,1,2],[21,14,1,2]]);blocks(ctx,'#fffdf5',[[11,13,1,1],[20,13,1,1]]);}
  pixel(ctx,16,17,2,1,'#c49386');pixel(ctx,17,18,1,1,'#55584b');
  if(kind==='caster'){
    blocks(ctx,'#776a52',[[25,17,1,10],[24,25,2,2]]);
    blocks(ctx,'#d6b46a',[[23,14,5,5],[25,12,1,9],[21,16,9,1]]);pixel(ctx,24,15,3,3,'#fff2bb');
  }else if(kind==='guard'){
    blocks(ctx,'#778379',[[22,19,7,1],[21,20,9,7],[23,27,5,2]]);
    blocks(ctx,'#e0d9c2',[[23,20,5,1],[22,21,7,5],[24,26,3,2]]);pixel(ctx,24,22,3,3,'#78957b');
  }else if(kind==='advisor'){
    blocks(ctx,'#b4a379',[[13,22,15,7],[12,23,1,5]]);pixel(ctx,14,23,13,5,'#fff0cb');
    blocks(ctx,'#79916e',[[15,24,3,1],[17,24,1,3],[18,26,6,1],[23,25,1,1]]);pixel(ctx,24,24,1,1,'#b97a63');
  }
  if(pose==='attack'&&kind==='guard')blocks(ctx,'#e8d5a2',[[29,17,1,7],[30,18,1,5],[28,16,1,1]]);
  ctx.restore();
}

export interface CatAnimation {attacks:number;damage:number;attackAt:number;hurtAt:number}
export type AnimationBook = Map<CatId,CatAnimation>;
export function paintBattle(ctx:CanvasRenderingContext2D,state:CombatState,selected:CatId|null,animations:AnimationBook){
  ctx.clearRect(0,0,700,300);ctx.imageSmoothingEnabled=false;
  const boardCell=(x:number,y:number)=>x>=0&&x<7&&y>=0&&y<3;
  for(let y=0;y<3;y++)for(let x=0;x<7;x++){
    const goal=x===COMMANDER_POSITION.x&&y===COMMANDER_POSITION.y;
    paintSceneTile(ctx,'prologue',x,y,100,{goal,spawn:isSpawnCell(x,y)});
    paintSceneEdge(ctx,'prologue',x,y,100,boardCell);
    if(!goal){ctx.fillStyle=SCENE_INK.label;ctx.font='11px "Microsoft YaHei", sans-serif';ctx.fillText(`${'ABC'[y]}${x+1}`,x*100+9,y*100+91);}
  }
  // B7 is the only reserved spawn entry in this prologue.
  for(const entry of SPAWN_POINTS){
    const x=entry.x*100,y=entry.y*100;
    ctx.save();ctx.strokeStyle=SCENE_INK.danger;ctx.lineWidth=entry.y===1?3:2;
    ctx.setLineDash(entry.y===1?[]:[5,4]);ctx.strokeRect(x+5.5,y+5.5,89,89);ctx.setLineDash([]);
    ctx.fillStyle=SCENE_INK.danger;
    blocks(ctx,ctx.fillStyle as string,[[x+76,y+39,4,22],[x+72,y+43,4,14],[x+68,y+47,4,6]]);ctx.restore();
  }
  // Logical lanes only: upper/lower routes turn at A1/C1, never at column 2.
  // Scene art shares these logical tiles; lane turns and targeting remain unchanged.
  ctx.save();ctx.strokeStyle=SCENE_INK.route;ctx.lineWidth=1.4;ctx.setLineDash([5,7]);
  for(const row of [0,1,2]){
    const y=(row+.5)*100;ctx.beginPath();ctx.moveTo(690,y);ctx.lineTo(50,y);
    if(row!==1)ctx.lineTo(50,150);ctx.stroke();
  }
  ctx.setLineDash([]);
  for(const row of [0,1,2])for(let column=1;column<7;column++){
    const x=column*100+25,y=(row+.5)*100;
    ctx.beginPath();ctx.moveTo(x+8,y-6);ctx.lineTo(x,y);ctx.lineTo(x+8,y+6);ctx.stroke();
  }
  // Down from A1, up from C1, both into the fixed B1 protection cell.
  ctx.beginPath();ctx.moveTo(44,77);ctx.lineTo(50,85);ctx.lineTo(56,77);ctx.stroke();
  ctx.beginPath();ctx.moveTo(44,223);ctx.lineTo(50,215);ctx.lineTo(56,223);ctx.stroke();ctx.restore();
  const selectedCat=state.cats.find(c=>c.id===selected&&c.status==='active'&&c.combatant);
  if(selectedCat&&!state.skillAim){
    ctx.save();ctx.fillStyle='#8ee2cb30';ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=2;
    for(const cell of getAttackCells(selectedCat)){ctx.fillRect(cell.x*100+5,cell.y*100+5,90,90);ctx.strokeRect(cell.x*100+5.5,cell.y*100+5.5,89,89);}
    ctx.restore();
  }
  const aimCat=state.skillAim?state.cats.find(cat=>cat.id===state.skillAim?.catId):undefined;
  if(aimCat){
    const centers=getSkillTargetCells(aimCat);
    ctx.save();ctx.fillStyle='#8ee2cb38';
    for(const cell of centers)ctx.fillRect(cell.x*100+4,cell.y*100+4,92,92);
    if(centers.length){
      const minX=Math.min(...centers.map(cell=>cell.x)),maxX=Math.max(...centers.map(cell=>cell.x));
      const minY=Math.min(...centers.map(cell=>cell.y)),maxY=Math.max(...centers.map(cell=>cell.y));
      ctx.strokeStyle=SCENE_INK.selected;ctx.lineWidth=3;ctx.setLineDash([8,5]);
      ctx.strokeRect(minX*100+4,minY*100+4,(maxX-minX+1)*100-8,(maxY-minY+1)*100-8);ctx.setLineDash([]);
    }
    ctx.fillStyle='#f4ce8355';ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=2;
    for(const cell of getSkillCells(aimCat,state.skillAim?.target)){ctx.fillRect(cell.x*100+5,cell.y*100+5,90,90);ctx.strokeRect(cell.x*100+5.5,cell.y*100+5.5,89,89);}
    ctx.restore();
  }
  for(const enemy of state.enemies){
    const ex=(enemy.x+.5)*100,ey=(enemy.y+.5)*100;ctx.save();ctx.translate(ex-25,ey-30+Math.sin(state.time*7)*2);
    blocks(ctx,SCENE_INK.enemy,[[10,2,30,7],[5,9,40,36],[0,21,50,19],[6,44,8,10],[20,44,9,8],[35,44,8,10]]);
    blocks(ctx,SCENE_INK.enemyLight,[[10,8,30,4],[5,12,6,19]]);blocks(ctx,SCENE_INK.gold,[[13,21,8,4],[30,21,8,4]]);
    if(enemy.type==='runner')blocks(ctx,'#a98a69',[[4,35,42,4],[8,40,9,4]]);
    ctx.fillStyle='#243741';ctx.fillRect(4,-8,43,4);ctx.fillStyle='#efc58a';ctx.fillRect(4,-8,43*enemy.hp/enemy.maxHp,4);ctx.restore();
  }
  for(const cat of state.cats){
    if(cat.status!=='active'||cat.x<0)continue;
    let animation=animations.get(cat.id);
    if(!animation){animation={attacks:cat.attacks,damage:cat.damageTaken,attackAt:-10,hurtAt:-10};animations.set(cat.id,animation);}
    if(animation.attacks!==cat.attacks){animation.attacks=cat.attacks;animation.attackAt=state.time;}
    if(animation.damage!==cat.damageTaken){animation.damage=cat.damageTaken;animation.hurtAt=state.time;}
    const attacking=state.time-animation.attackAt<.4;const hurting=state.time-animation.hurtAt<.25;
    const x=(cat.x+.5)*100,y=(cat.y+.5)*100;
    const size=cat.id==='hero'?64:76;
    drawCat(ctx,cat.id,x-size/2,y-30,size,attacking?'attack':hurting?'hurt':'idle',attacking?(state.time-animation.attackAt)/.4:(state.time-animation.hurtAt)/.25);
    if(cat.shield>0){ctx.save();ctx.strokeStyle='#8dd7e4';ctx.fillStyle='#8dd7e424';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+8,38,36,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
  }
  for(const shot of state.projectiles){
    const t=1-shot.ttl/shot.maxTtl,x=(shot.x+(shot.tx-shot.x)*t+.5)*100,y=(shot.y+(shot.ty-shot.y)*t+.5)*100;
    blocks(ctx,SCENE_INK.gold,[[x-7,y-2,14,4],[x-2,y-7,4,14]]);pixel(ctx,x-2,y-2,4,4,'#fff6c6');
  }
  for(const effect of state.effects){
    const progress=1-effect.ttl/effect.maxTtl;
    if(effect.kind==='skill-area'){
      const x=(effect.x+.5)*100,y=(effect.y+.5)*100;
      ctx.save();ctx.globalAlpha=1-progress;ctx.fillStyle='#f3dc974f';ctx.fillRect(effect.x*100+5,effect.y*100+5,90,90);
      ctx.strokeStyle=SCENE_INK.gold;ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,12+progress*30,0,Math.PI*2);ctx.stroke();
      blocks(ctx,SCENE_INK.gold,[[x-14,y-3,28,6],[x-3,y-14,6,28]]);ctx.restore();continue;
    }
    // 命中黑影：红色像素伤害数字弹跳上飘 + 白色像素爆裂闪光（表现层增强，读数本身仍来自引擎 effect）。
    if(effect.kind==='damage'&&!battleReducedMotion()){
      const x=(effect.x+.5)*100,y=(effect.y+.5)*100;
      if(effect.text)drawDamagePop(ctx,x,y,effect.text,progress);
      drawHitBurst(ctx,x,y,progress*.9);
      continue;
    }
    // 黑影被击败：碎裂成黑色像素块消散（配合引擎的“黑影退去”事件）。
    if(effect.kind==='defeat'&&!battleReducedMotion()){
      drawShatter(ctx,(effect.x+.5)*100,(effect.y+.5)*100,progress);
      continue;
    }
    if(!effect.text)continue;
    ctx.save();ctx.fillStyle=effect.kind==='heal'?'#a9e0a8':effect.kind.includes('shield')?'#a0e3ed':SCENE_INK.danger;ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillText(effect.text,(effect.x+.5)*100,(effect.y+.35)*100-(1-effect.ttl/effect.maxTtl)*12);ctx.restore();
  }
}
