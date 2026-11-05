/** Cosmetic feedback for already-resolved hits. The simulation owns all timing,
 * damage and targeting; this module only reads the effect's original snapshots. */
import {getBossAttackMotion} from './bossAttackMotion';
import {getGreenhouseArmPose,getGreenhouseWhipCurve} from './greenhouseArmPose';

type Point = {x: number; y: number};
export type AttackTheme = 'alley' | 'market' | 'greenhouse' | 'tunnel' | 'finale';
export interface BasicAttackEffect {
  kind: string; from: Point; to: Point; remaining: number;
}
export interface BasicAttackOptions {
  cellSize: number;
  boss?: Point & {id?: string; width?: number; height?: number; phase: string};
  theme: AttackTheme;
}
export type CatAttackStyle = 'caster' | 'guard' | 'tuanzi' | 'diandian' | 'bruiser' | 'controller' | 'momo' | 'taotao';
export type AttackStyle = CatAttackStyle | `boss-${AttackTheme}` | 'enemy' | 'neutral';
const CAT_STYLES: readonly string[] = ['caster', 'guard', 'tuanzi', 'diandian', 'bruiser', 'controller', 'momo', 'taotao'];
const INK = '#182b37';
const PALETTES: Record<CatAttackStyle, [string, string]> = {
  caster: ['#bca0ed', '#fff0ff'], guard: ['#80cbd3', '#effaf0'],
  tuanzi: ['#f3a35b', '#fff0b1'], diandian: ['#eac185', '#fff5d2'],
  bruiser: ['#c89362', '#ffe0a0'], controller: ['#8ad4de', '#edffff'],
  momo: ['#7aa8d9', '#d4f5ed'], taotao: ['#efbd70', '#fff5c4'],
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const snap = (n: number) => Math.round(n / 2) * 2;
function actorId(point: Point): string | undefined {
  return 'id' in point && typeof point.id === 'string' ? point.id : undefined;
}

/** Resolve centers from immutable hit snapshots, never today's cat positions.
 * Legacy coordinate-only hits keep their neutral style. A cleared boss tile is
 * an ordinary tile, including when another actor subsequently stands on it. */
export function resolveBasicAttack(effect: BasicAttackEffect, options: BasicAttackOptions) {
  const {boss, cellSize, theme} = options;
  const sourceId = actorId(effect.from);
  const style: AttackStyle = effect.kind === 'boss-attack' ? `boss-${theme}`
    : sourceId && CAT_STYLES.includes(sourceId) ? sourceId as CatAttackStyle
    : sourceId || effect.kind === 'elite-attack' ? 'enemy' : 'neutral';
  const center = (point: Point, isBoss = false): Point => {
    const id = actorId(point);
    // Explicit snapshots retain their original actor after a killing blow. Only
    // old coordinate-only effects need the live-boss fallback; new occupants of
    // the cleared tile always retain their own identity and tile center.
    const hitsBoss = boss && (isBoss || (id ? id === boss.id
      : boss.phase !== 'defeated' && point.x === boss.x && point.y === boss.y));
    return hitsBoss
      ? {x: (boss.x + (boss.width ?? 1) / 2) * cellSize, y: (boss.y + (boss.height ?? 1) / 2) * cellSize}
      : {x: (point.x + .5) * cellSize, y: (point.y + .5) * cellSize};
  };
  return {style, from: center(effect.from, effect.kind === 'boss-attack'), to: center(effect.to), progress: clamp(1 - effect.remaining / .4)};
}

function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color; ctx.fillRect(snap(x), snap(y), Math.max(2, snap(w)), Math.max(2, snap(h)));
}
function polygon(ctx: CanvasRenderingContext2D, points: readonly Point[], color: string, outline = false) {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(snap(p.x), snap(p.y)) : ctx.moveTo(snap(p.x), snap(p.y)));
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  if (outline) {ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();}
}
function line(ctx: CanvasRenderingContext2D, points: readonly Point[], color: string, width: number, outline = true) {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(snap(p.x), snap(p.y)) : ctx.moveTo(snap(p.x), snap(p.y)));
  if (outline) {ctx.strokeStyle = INK; ctx.lineWidth = width + 4; ctx.stroke();}
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, core: string) {
  polygon(ctx, [{x, y: y-size}, {x: x+3, y: y-3}, {x: x+size, y}, {x: x+3, y: y+3},
    {x, y: y+size}, {x: x-3, y: y+3}, {x: x-size, y}, {x: x-3, y: y-3}], color, true);
  block(ctx, x-2, y-2, 4, 4, core);
}
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, width = 2) {
  const points = Array.from({length: 9}, (_, i) => ({x: x+Math.cos(i*Math.PI/4)*radius, y: y+Math.sin(i*Math.PI/4)*radius}));
  line(ctx, points, color, width, false);
}
function sparks(ctx: CanvasRenderingContext2D, x: number, y: number, p: number, color: string, count = 5, size = 3) {
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count + .45, radius = 9 + p * 22;
    block(ctx, x+Math.cos(angle)*radius-size/2, y+Math.sin(angle)*radius-size/2, size, size, color);
  }
}

function catHit(ctx: CanvasRenderingContext2D, style: CatAttackStyle, length: number, p: number) {
  const [color, light] = PALETTES[style];
  // Nearby attacks stay compact; even a zero-distance hit has a visible endpoint.
  const travel = Math.min(1, p / .42), start = Math.min(24, length * .25);
  const head = start + (length-start) * travel;
  const pulse = Math.sin(Math.PI * clamp(p / .75));
  if (style === 'tuanzi') {
    for (let i = -1; i <= 1; i++) {
      const offset = i * 11, sweep = (1-p) * 7;
      line(ctx, [{x: length-16+sweep, y: offset-13}, {x: length+5, y: offset-6}, {x: length+10-sweep, y: offset+9}], color, 4);
      line(ctx, [{x: length-13+sweep, y: offset-12}, {x: length+4, y: offset-5}], light, 2, false);
    }
    sparks(ctx, length, 0, p, light, 3);
  } else if (style === 'guard') {
    const x = Math.max(start, length-14*(1-pulse));
    polygon(ctx, [{x: x-10,y:-15},{x:x+4,y:-15},{x:x+12,y:-8},{x:x+12,y:8},{x:x+4,y:15},{x:x-10,y:15}], color, true);
    line(ctx, [{x:x-4,y:-10},{x:x+5,y:-6},{x:x+5,y:6},{x:x-4,y:10}], light, 3, false);
    line(ctx, [{x:x-17,y:-9},{x:x-23,y:-9}], color, 3, false);
    line(ctx, [{x:x-17,y:9},{x:x-25,y:9}], color, 3, false);
    sparks(ctx, length+6, 0, p, light, 4, 4);
  } else if (style === 'bruiser') {
    const x = length-9*(1-pulse);
    polygon(ctx, [{x:x-18,y:-11},{x:x-6,y:-16},{x:x+10,y:-9},{x:x+12,y:7},{x:x-1,y:15},{x:x-17,y:9}], color, true);
    block(ctx, x-9,-9,12,5,light); block(ctx,x-11,3,17,4,'#805b46');
    line(ctx,[{x:x+18,y:-16},{x:x+24,y:-7},{x:x+24,y:7},{x:x+18,y:16}],light,3);
    sparks(ctx,length,0,p,color,5,5);
  } else {
    // Short, discrete tails replace the full source-to-target laser. They are
    // feedback for an existing hit, not a new projectile in the game state.
    for (let i=1; i<=3; i++) {
      const tx=head-i*10; if(tx<start)continue;
      block(ctx,tx,-2+(i%2?2:-2),7-i,4,color);
    }
    if (style === 'caster') {
      star(ctx,head,0,12,color,light);
      if(head-start>26)star(ctx,head-25,-7,5,color,light);
    } else if (style === 'diandian') {
      polygon(ctx,[{x:head-9,y:-4},{x:head-4,y:-9},{x:head+6,y:-7},{x:head+10,y:0},{x:head+5,y:8},{x:head-5,y:8},{x:head-10,y:2}],color,true);
      block(ctx,head-4,-4,8,4,light);
      ring(ctx,head-14,0,5,color);
    } else if (style === 'controller') {
      polygon(ctx,[{x:head-7,y:-9},{x:head+3,y:-9},{x:head+8,y:-3},{x:head+8,y:5},{x:head-8,y:5}],color,true);
      block(ctx,head-2,6,4,4,light);
      for(let i=0;i<2;i++)line(ctx,[{x:head+11+i*8,y:-10-i*3},{x:head+15+i*8,y:0},{x:head+11+i*8,y:10+i*3}],light,2,false);
    } else if (style === 'momo') {
      polygon(ctx,[{x:head-12,y:0},{x:head-2,y:-8},{x:head+13,y:0},{x:head-2,y:8}],color,true);
      line(ctx,[{x:head-6,y:0},{x:head+7,y:0}],light,3,false);
      line(ctx,[{x:head-18,y:-7},{x:head-8,y:-7}],color,2,false);
      line(ctx,[{x:head-18,y:7},{x:head-8,y:7}],color,2,false);
    } else {
      star(ctx,head,0,14,color,light);
      line(ctx,[{x:head-22,y:0},{x:head-10,y:0}],light,4,false);
    }
    // A small endpoint glint marks the already-applied hit immediately. It never
    // marks another cell or implies that these ordinary attacks heal/slow/AOE.
    if(p<.2)star(ctx,length,0,6,light,color);
    if(p>=.42){
      const impact=(p-.42)/.58;
      if(style==='controller')ring(ctx,length,0,10+impact*13,color);
      else if(style==='momo')line(ctx,[{x:length-8,y:-10},{x:length+2,y:-16},{x:length+12,y:-7}],light,3,false);
      else star(ctx,length,0,Math.max(5,13-impact*7),light,color);
      sparks(ctx,length,0,impact,color,style==='diandian'?4:5);
    }
  }
}

/** A short tapered quadratic ribbon, confined to the actual hit. Dense samples
 * keep the silhouette curved at pixel scale instead of making an elbowed rod. */
function swipe(ctx: CanvasRenderingContext2D, x: number, y: number, span: number, rise: number, width: number, color: string, light: string) {
  const edgeA: Point[] = [], edgeB: Point[] = [], core: Point[] = [];
  for(let i=0;i<=24;i++){
    const t=i/24,u=1-t;
    const px=x-span*.5*u*u+span*.5*t*t;
    const py=y+rise*(u*u-1.8*u*t-.25*t*t);
    const dx=span,dy=rise*(-3.8+3.3*t),norm=Math.hypot(dx,dy);
    const radius=width*Math.sin(Math.PI*t)/2;
    edgeA.push({x:px-dy/norm*radius,y:py+dx/norm*radius});
    edgeB.push({x:px+dy/norm*radius,y:py-dx/norm*radius});
    if(i>3&&i<21)core.push({x:px,y:py});
  }
  polygon(ctx,[...edgeA,...edgeB.reverse()],color,true);
  line(ctx,core,light,2,false);
}

/** Soft, tapered energy trail. Its densely sampled curve has no rigid elbows
 * or dark weapon outline; the travelling front supplies the attack's reach. */
function energyTrail(ctx: CanvasRenderingContext2D, start: number, end: number, bend: number, offset: number, width: number, color: string, light: string) {
  if(end-start<2)return;
  const upper:Point[]=[],lower:Point[]=[],core:Point[]=[];
  for(let i=0;i<=28;i++){
    const t=i/28,x=start+(end-start)*t,y=Math.sin(Math.PI*t)*bend+offset*t;
    const thickness=Math.sin(Math.PI*t)*(width/2);
    upper.push({x,y:y-thickness});lower.push({x,y:y+thickness});
    core.push({x,y});
  }
  ctx.save();ctx.globalAlpha*=.46;
  polygon(ctx,[...upper,...lower.reverse()],color);
  ctx.restore();
  ctx.save();ctx.globalAlpha*=.72;
  line(ctx,core,light,2,false);
  ctx.restore();
}

/** Cosmetic propagation reaches the original hit snapshot at the same moment
 * the arm extends. This never creates a projectile or delays combat damage. */
function projectedStrike(ctx:CanvasRenderingContext2D,theme:AttackTheme,length:number,start:number,p:number){
  const travel=clamp((p-.18)/.24);
  if(travel<=0)return;
  const ease=1-(1-travel)*(1-travel),head=start+(length-start)*ease;
  // After reaching the cat, the trail dissolves from its source toward the hit.
  const dissolve=clamp((p-.48)/.42),tail=start+(head-start)*dissolve;
  const span=Math.max(0,head-tail);
  ctx.save();ctx.globalAlpha*=Math.min(1,travel*4)*(1-dissolve*.65);
  if(theme==='alley'){
    // The barrier throws a broad crescent of dusty air, with small trailing chips.
    energyTrail(ctx,tail,head,-9,0,14,'#cda16a','#e9c58a');
    for(const [lag,opacity] of [[0,1],[18,.48]]){
      if(head-lag<tail)continue;
      ctx.save();ctx.globalAlpha*=opacity;
      const radius=14+ease*10;
      const arc=Array.from({length:25},(_,i)=>{const angle=-1.18+i/24*2.36;return{x:head-lag-9+Math.cos(angle)*9,y:Math.sin(angle)*radius};});
      line(ctx,arc,'#e0b277',6,false);line(ctx,arc,'#fff0bc',2,false);
      ctx.restore();
    }
    for(let i=1;i<=4;i++){
      const x=head-i*span/5;
      block(ctx,x,-Math.sin(i*1.9+p*8)*7,4,3,i%2?'#d3b17c':'#ead3a2');
    }
  }else if(theme==='market'){
    // A curling lantern flame remains visibly connected to the hand's direction.
    const curl=-Math.min(19,span*.13);
    energyTrail(ctx,tail,head,curl,0,16,'#c796ad','#f3cf8d');
    for(let i=3;i>=1;i--){
      const t=Math.max(0,1-i*.15),x=tail+span*t,y=Math.sin(Math.PI*t)*curl;
      ctx.save();ctx.globalAlpha*=.65;
      star(ctx,x,y,Math.max(3,8-i),'#e2b679','#fff1c9');ctx.restore();
    }
    polygon(ctx,[{x:head-18,y:0},{x:head-10,y:-7},{x:head+3,y:-10},{x:head+12,y:0},{x:head+3,y:9},{x:head-9,y:7}], '#efbe72');
    star(ctx,head+1,0,8,'#fff0b8','#fff8dc');
  }else if(theme==='tunnel'){
    // Several separated pressure fronts, not an extended solid mechanical arm.
    energyTrail(ctx,tail,head,7,-4,12,'#6cabbc','#acdce2');
    energyTrail(ctx,tail,head,-7,4,10,'#6cabbc','#acdce2');
    for(let i=0;i<3;i++){
      const x=head-i*20;if(x<tail)continue;
      const radius=12+ease*10-i*3;
      const arc=Array.from({length:25},(_,j)=>{const angle=-1.32+j/24*2.64;return{x:x-7+Math.cos(angle)*7,y:Math.sin(angle)*radius};});
      ctx.save();ctx.globalAlpha*=1-i*.22;line(ctx,arc,'#9cd3dd',4-i,false);ctx.restore();
    }
    block(ctx,head-3,-3,6,6,'#e4f4e9');
  }else if(theme==='finale'){
    // Three flowing claw winds fan from the moving hand and converge on the hit.
    // Their width, translucency and travelling tips read as energy, not rods.
    for(let i=-1;i<=1;i++){
      const offset=i*10;
      energyTrail(ctx,tail,head,-13+i*7,offset,10,'#a08ab8','#e0c59a');
      swipe(ctx,head-3,offset,24,13,7,'#b69dcb','#f5db9c');
    }
    for(let i=1;i<=4;i++){
      const x=tail+span*i/5,y=Math.sin(Math.PI*i/5)*-13;
      block(ctx,x,y+(i%2?11:-11),3,3,'#c3aad9');
    }
  }
  ctx.restore();
}

function bossHit(ctx: CanvasRenderingContext2D, theme: AttackTheme, length: number, p: number, start: number) {
  // Each leader pairs its articulated arms with feedback toward the struck cat.
  const motion=getBossAttackMotion(.4*(1-p));
  if(theme!=='greenhouse'){
    projectedStrike(ctx,theme,length,start,p);
    if(p<.4)return;
    if(motion.impact<=0)return;
    ctx.globalAlpha*=motion.impact;
  }
  if (theme === 'alley') {
    swipe(ctx,length-2,-2+motion.strike*5,48,19,11,'#d69c66','#ffe2a4');
    sparks(ctx,length,0,p,'#d4ac7b',4,4);
    block(ctx,length-2,-2,4,4,'#fff1c9');
  } else if (theme === 'market') {
    star(ctx,length,0,9+motion.impact*5,'#f5ce82','#fff4d2');
    swipe(ctx,length-2,-3,30,17,5,'#bba3cc','#ffe4a7');
    for(let i=0;i<3;i++){
      const angle=i*2.1+.4,radius=13+p*16;
      block(ctx,length+Math.cos(angle)*radius,Math.sin(angle)*radius-7*p,3,5,'#e7bd75');
    }
  } else if (theme === 'greenhouse') {
    const curve=getGreenhouseWhipCurve(Math.max(0,length-start),p).map(q=>({x:q.x+start,y:q.y}));
    const span=curve.at(-1)!.x-start;
    ctx.save();ctx.globalAlpha*=1-clamp((p-.68)/.32);
    line(ctx,curve,'#527348',8); line(ctx,curve,'#b5d58b',3,false);
    const barbs=span>=90?[5,12,19]:span>=35?[12]:[];
    const barbHeight=Math.min(12,span*.12);
    for(const i of barbs){
      const q=curve[i],prev=curve[i-1],next=curve[i+1];
      const angle=Math.atan2(next.y-prev.y,next.x-prev.x),cos=Math.cos(angle),sin=Math.sin(angle);
      const point=(x:number,y:number)=>({x:q.x+x*cos-y*sin,y:q.y+x*sin+y*cos});
      polygon(ctx,[point(-5,0),point(2,-barbHeight),point(6,1)],'#c1c883',true);
    }
    ctx.restore();
    if(p>=.4){
      const hit=clamp((p-.4)/.6);
      ctx.save();ctx.globalAlpha*=1-hit;
      line(ctx,[{x:length-12,y:-12},{x:length+6,y:3},{x:length+11,y:12}],'#e1e6ab',4);
      sparks(ctx,length,0,hit,'#b6ca87',5,4);
      ctx.restore();
    }
  } else if (theme === 'tunnel') {
    // Compression rings and a few metal chips sell the weight of a short punch.
    const radius=10+motion.strike*13;
    for(let side=-1;side<=1;side+=2){
      const curve=Array.from({length:17},(_,i)=>{
        const angle=-Math.PI*.42+i/16*Math.PI*.84;
        return{x:length+side*(Math.cos(angle)*radius*.6+3),y:Math.sin(angle)*radius};
      });
      line(ctx,curve,'#afd2d7',3,false);
    }
    star(ctx,length,0,8,'#e1efe3','#779aa9');
    sparks(ctx,length,0,p,'#94b9c6',5,4);
  } else {
    for(let i=-1;i<=1;i++){
      swipe(ctx,length+i*3,-i*11+motion.strike*5,43,22,8,'#89749e','#ebce91');
    }
    sparks(ctx,length,0,p,'#c3a8d6',4,3);
  }
}

export function paintBasicAttack(ctx: CanvasRenderingContext2D, effect: BasicAttackEffect, options: BasicAttackOptions): void {
  if(effect.remaining<=0)return;
  const resolved=resolveBasicAttack(effect,options);
  const {to,style,progress}=resolved;
  const from=style==='boss-greenhouse'&&options.boss
    ? getGreenhouseArmPose(options.boss,effect.to,effect.remaining,options.cellSize).whipOrigin
    : resolved.from;
  if(![from.x,from.y,to.x,to.y,progress].every(Number.isFinite))return;
  const dx=to.x-from.x,dy=to.y-from.y,scale=options.cellSize/80;
  const distance=Math.hypot(dx,dy)/scale;
  ctx.save();
  ctx.translate(from.x,from.y);ctx.rotate(Math.atan2(dy,dx));ctx.scale(scale,scale);
  ctx.lineJoin='bevel';ctx.lineCap='butt';
  if(style.startsWith('boss-')){
    const boss=options.boss;
    // Start on the body's facing edge, so a three-cell boss doesn't fire from
    // an unrelated corner or paint a huge slab across its entire silhouette.
    const nx=Math.abs(Math.cos(Math.atan2(dy,dx))),ny=Math.abs(Math.sin(Math.atan2(dy,dx)));
    const edge=Math.min((boss?.width??1)*40/Math.max(.01,nx),(boss?.height??1)*40/Math.max(.01,ny));
    bossHit(ctx,options.theme,distance,progress,options.theme==='greenhouse'?0:Math.min(distance*.68,edge*.7));
  }else if(style==='enemy'||style==='neutral'){
    const color=style==='enemy'?'#c28a7e':'#cfbd91';
    line(ctx,[{x:Math.max(0,distance-20),y:-9},{x:distance+5,y:7}],color,3);
    line(ctx,[{x:Math.max(0,distance-12),y:-13},{x:distance+10,y:1}],color,2,false);
  }else catHit(ctx,style as CatAttackStyle,distance,progress);
  ctx.restore();
}
