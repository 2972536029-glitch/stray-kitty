import {rainyAlleySource,rainyAlleyRegistration as reg,rainyAlleyObjectEligible,type RainyFixedObject} from '../../../web/src/modules/rainyAlley/assets';
import {rainyAlleyFieldClosed,rainyAlleyFieldOpen,rainyAlleySqueezeFieldClosed,rainyAlleySqueezeFieldOpen,SQUEEZE_BOUNDS,SQUEEZE_CENTER_X,SQUEEZE_OPENING_WIDTH,squeezeExitTarget,crateClimbTarget} from '../../../web/src/modules/rainyAlley/runtimeGeometry';
import {sweepMove} from '../../../web/src/modules/rainyAlley/collision';
import {IntegratedRainyAlley} from '../../../web/src/modules/rainyAlley/IntegratedRainyAlley';
import {drawPixelCat} from '../../../web/src/adapters/canvas/pixelCat';
import {eventPropAtlas,paintEventProp,cellSize} from './propAtlas';
import {paintSqueezePassage} from './squeezePainter';

type Point={x:number;y:number};
type ExistingPainter={position:Point;now:number;drawDogFriend(c:CanvasRenderingContext2D,flags:readonly string[]):void;drawMarkers(c:CanvasRenderingContext2D,flags:readonly string[]):void};
const old=new IntegratedRainyAlley() as unknown as ExistingPainter;
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const checked=(id:string)=>get<HTMLInputElement>(id).checked;
const canvas=get<HTMLCanvasElement>('map'),c=canvas.getContext('2d')!;
const background=new Image();background.src=rainyAlleySource.backgroundUrl;
const objects=rainyAlleySource.objects.fixed;
const dogId='alley_dog_friend_point';
const propScale=1.4;
const keys=new Set<string>();
let cat:Point={x:160,y:374},size={width:1,height:1},pan:Point={x:0,y:0},zoom=1,candidate=true,artOnly=false;
let selected=objects.find(o=>o.id==='alley_puddle_reflection')!,previous=performance.now(),feedbackUntil=0,ready=false;
let drag:{x:number;y:number;pan:Point}|null=null,climb:{from:Point;to:Point;elapsed:number}|null=null;
let squeezeTarget:Point|null=null;
const flags=()=>checked('rescued')?['alley_rescued']:[];
const field=()=>checked('rescued')?rainyAlleyFieldOpen:rainyAlleyFieldClosed;
const squeezeField=()=>checked('rescued')?rainyAlleySqueezeFieldOpen:rainyAlleySqueezeFieldClosed;
function squeezeDirection():-1|0|1 {
  if(Math.abs(cat.x-SQUEEZE_CENTER_X)>10)return 0;
  if(cat.y>=SQUEEZE_BOUNDS.top-18&&cat.y<=SQUEEZE_BOUNDS.top)return 1;
  if(cat.y>=SQUEEZE_BOUNDS.bottom&&cat.y<=SQUEEZE_BOUNDS.bottom+18)return -1;
  return 0;
}
function startSqueeze(){
  const direction=squeezeDirection();if(!direction||squeezeTarget||climb)return false;
  const exit=squeezeExitTarget(field(),squeezeField(),direction);if(!exit)return false;
  squeezeTarget=exit;keys.clear();return true;
}
const toArt=(p:Point)=>({x:reg.tx+p.x*reg.sx,y:reg.ty+p.y*reg.sy});
const fitScale=()=>Math.min(size.width/reg.artWidth,size.height/reg.artHeight);
function fit(){zoom=fitScale();pan={x:(size.width-reg.artWidth*zoom)/2,y:(size.height-reg.artHeight*zoom)/2};}
function center(point:Point){zoom=Math.max(fitScale()*3.5,.9);const p=toArt(point);pan={x:size.width/2-p.x*zoom,y:size.height/2-p.y*zoom};}
function nearestStand(o:RainyFixedObject){
  const f=field();let best=f.nearestTraversable({x:o.x,y:o.y+28},70)??{x:o.x,y:o.y};
  let score=Infinity;
  for(let y=o.y-35;y<=o.y+35;y+=2)for(let x=o.x-35;x<=o.x+35;x+=2){
    if(!f.isTraversable(x,y)||Math.hypot(x-o.x,y-o.y)>36)continue;
    const s=Math.hypot(x-o.x,y-(o.y+30));if(s<score){best={x,y};score=s;}
  }return best;
}
function focus(id:string){
  if(id==='squeeze'){
    const entry=field().nearestTraversable({x:SQUEEZE_CENTER_X,y:SQUEEZE_BOUNDS.top-8},32);
    if(entry)cat=entry;climb=null;squeezeTarget=null;keys.clear();center({x:SQUEEZE_CENTER_X,y:318});canvas.focus();return;
  }
  const o=objects.find(o=>o.id===id);if(!o)return;if(o.requiresFlag)get<HTMLInputElement>('rescued').checked=true;selected=o;cat=nearestStand(o);climb=null;squeezeTarget=null;keys.clear();center(o);get('feedback').style.display='none';canvas.focus();
}
function nearby(){return objects.filter(o=>rainyAlleyObjectEligible(o,flags())).map(o=>({o,d:Math.hypot(cat.x-o.x,cat.y-o.y)})).filter(v=>v.d<=(v.o.id===dogId?50:37)).sort((a,b)=>a.d-b.d)[0]?.o;}
function setMode(value:boolean){candidate=value;get('candidate').classList.toggle('selected',value);get('baseline').classList.toggle('selected',!value);get('badge').textContent=value?'新物件 · 靠近浮现名称 · 主线常显':'原有标记 · 对照';}
get('candidate').onclick=()=>setMode(true);get('baseline').onclick=()=>setMode(false);get('fit').onclick=fit;
function backAway(){
  const angle=Math.atan2(cat.y-selected.y,cat.x-selected.x);
  for(let i=0;i<24;i++){
    const a=angle+i*Math.PI/12,p=field().nearestTraversable({x:selected.x+Math.cos(a)*120,y:selected.y+Math.sin(a)*120},15);
    if(p&&Math.hypot(p.x-selected.x,p.y-selected.y)>105){cat=p;keys.clear();climb=null;squeezeTarget=null;center({x:(cat.x+selected.x)/2,y:(cat.y+selected.y)/2});break;}
  }
}
get('backAway').onclick=()=>{backAway();canvas.focus();};
get<HTMLInputElement>('rescued').onchange=()=>{squeezeTarget=null;const p=field().nearestTraversable(cat,50);if(p)cat=p;};
for(const o of objects){
  const button=document.createElement('button');button.textContent=o.label;button.onclick=()=>focus(o.id);get('locations').append(button);
  const item=document.createElement('div');item.className='sample';const thumb=document.createElement('canvas');thumb.width=thumb.height=48;
  const tc=thumb.getContext('2d')!;tc.scale(1.2,1.2);
  if(o.id===dogId){tc.translate(20-o.x,29-o.y);old.drawDogFriend(tc,[]);}
  else paintEventProp(tc,o.id,20,32);
  const label=document.createElement('span');label.textContent=o.id===dogId?'老黄 · 新配色':o.label.replace('点点 · ','');item.append(thumb,label);get('gallery').append(item);
}
function showFeedback(o:RainyFixedObject|undefined){const box=get('feedback');box.textContent=o?`${o.label} · E 提示预览（不结算事件）`:'靠近一个物件后再按 E';box.style.display='block';feedbackUntil=performance.now()+2500;}
const squeezeButton=document.createElement('button');squeezeButton.textContent='Q 窄缝通道';squeezeButton.onclick=()=>focus('squeeze');get('locations').append(squeezeButton);
window.addEventListener('keydown',e=>{
  if((e.target as HTMLElement).matches('input,select,textarea'))return;const k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e','c','q','tab'].includes(k))e.preventDefault();
  if(k==='tab'){artOnly=true;return;}if(k==='e'&&!e.repeat){showFeedback(nearby());return;}
  if(k==='q'&&!e.repeat&&startSqueeze())return;
  if(squeezeTarget)return;
  if(k==='c'&&!e.repeat&&!climb){const target=crateClimbTarget(cat,field(),checked('rescued'));if(target)climb={from:{...cat},to:target.to,elapsed:0};return;}
  keys.add(k);
});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key==='Tab')artOnly=false;});
window.addEventListener('blur',()=>{keys.clear();artOnly=false;drag=null;});
canvas.oncontextmenu=e=>e.preventDefault();
canvas.onpointerdown=e=>{canvas.focus();if(e.button===2||e.button===1){drag={x:e.clientX,y:e.clientY,pan:{...pan}};canvas.setPointerCapture(e.pointerId);}};
canvas.onpointermove=e=>{if(drag)pan={x:drag.pan.x+e.clientX-drag.x,y:drag.pan.y+e.clientY-drag.y};};canvas.onpointerup=()=>drag=null;canvas.onpointercancel=()=>drag=null;
canvas.addEventListener('wheel',e=>{e.preventDefault();const b=canvas.getBoundingClientRect(),p={x:e.clientX-b.left,y:e.clientY-b.top},q={x:(p.x-pan.x)/zoom,y:(p.y-pan.y)/zoom};zoom=Math.max(fitScale(),Math.min(5,zoom*Math.exp(-e.deltaY*.001)));pan={x:p.x-q.x*zoom,y:p.y-q.y*zoom};},{passive:false});
function resize(){const box=canvas.getBoundingClientRect(),d=devicePixelRatio||1;size={width:box.width,height:box.height};canvas.width=Math.round(size.width*d);canvas.height=Math.round(size.height*d);center(selected);}
new ResizeObserver(resize).observe(canvas);
function drawCat(){c.save();c.translate(cat.x,cat.y);if(squeezeTarget)c.scale(.7,1.04);c.scale(.62,.62);c.translate(-26,-32);c.scale(.85,.85);drawPixelCat(c,'miaomiao');c.restore();}
function drawSqueezeMarker(){
  if(squeezeTarget)return;
  const top={x:SQUEEZE_CENTER_X,y:SQUEEZE_BOUNDS.top-12},bottom={x:SQUEEZE_CENTER_X,y:SQUEEZE_BOUNDS.bottom+12};
  const point=Math.hypot(cat.x-top.x,cat.y-top.y)<Math.hypot(cat.x-bottom.x,cat.y-bottom.y)?top:bottom;
  if(Math.hypot(cat.x-point.x,cat.y-point.y)>72)return;
  c.save();c.globalAlpha=squeezeDirection()?1:.72;c.translate(SQUEEZE_BOUNDS.right+10,point.y);
  c.fillStyle='#9adbd4';c.strokeStyle='#28494b';c.lineWidth=1.6;c.beginPath();c.arc(0,0,7,0,Math.PI*2);c.fill();c.stroke();
  c.fillStyle='#183638';c.font='700 10px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText('Q',0,.5);c.restore();
}
function prop(o:RainyFixedObject){
  if(o.requiresFlag&&!flags().includes(o.requiresFlag))return;
  c.save();c.translate(o.x,o.y);c.scale(propScale,propScale);c.translate(-o.x,-o.y);
  if(o.id===dogId){old.drawDogFriend(c,flags());c.restore();return;}
  c.save();
  const done=!rainyAlleyObjectEligible(o,flags());c.globalAlpha=done?.48:1;
  // A rescued kitten leaves an empty box, rather than a second visible kitten.
  if(o.id==='alley_crate'&&done){const atlas=eventPropAtlas();c.imageSmoothingEnabled=false;c.drawImage(atlas,3*cellSize,19,cellSize,21,o.x-20,o.y-13,cellSize,21);}
  else paintEventProp(c,o.id,o.x,o.y);
  c.restore();
  if(o.id==='alley_crate'&&!done){c.save();c.strokeStyle='rgba(225,197,123,.48)';c.lineWidth=1;c.beginPath();c.ellipse(o.x,o.y+3,19,5,0,0,Math.PI*2);c.stroke();c.restore();}
  c.restore();
}
const labelSprites=new Map<string,HTMLCanvasElement>();
const labelOpacity=new Map<string,number>();
const objectiveId=()=>checked('rescued')?'alley_poster':'alley_crate';
const markerEmoji:Record<string,string>={alley_puddle_reflection:'💧',alley_empty_fish_can:'🥫',alley_fish_dry:'🐟',alley_crate:'📦',alley_poster:'📄',alley_scratch_marks:'🐾',alley_blanket_stack:'🧺',alley_dog_friend_point:'🐕'};
function label(o:RainyFixedObject,active:boolean,now:number,alpha:number){
  const objective=o.id===objectiveId();
  const key=`${o.id}:${active}:${objective}`;
  let sprite=labelSprites.get(key);
  if(!sprite){
    const text=`${markerEmoji[o.id]} ${o.label}${active?' · E':''}`;
    sprite=document.createElement('canvas');const s=sprite.getContext('2d')!;
    s.font='700 12.5px system-ui, sans-serif';
    sprite.width=Math.ceil(s.measureText(text).width+22)*2;sprite.height=46;
    s.scale(2,2);s.font='700 12.5px system-ui, sans-serif';
    const w=sprite.width/2;
    s.fillStyle=objective?'rgba(24,38,30,.92)':'rgba(13,26,30,.8)';
    s.beginPath();s.roundRect(1,2,w-2,19,6);s.fill();
    s.strokeStyle=objective?'rgba(255,222,130,.95)':o.kind==='inspection'?'rgba(190,232,206,.5)':o.kind==='story'?'rgba(238,168,209,.5)':'rgba(255,209,102,.5)';
    s.lineWidth=1.4;s.stroke();s.fillStyle='#f7f2df';s.textAlign='center';s.textBaseline='middle';s.fillText(text,w/2,12);
    labelSprites.set(key,sprite);
  }
  const bob=Math.sin(now/520+o.x*.021)*2.6,width=sprite.width/2,height=sprite.height/2;
  c.save();c.globalAlpha=alpha*(rainyAlleyObjectEligible(o,flags())?1:.42);
  c.drawImage(sprite,o.x-width/2,o.y-32*propScale-height-6+bob,width,height);c.restore();
}
function draw(now:number,dt:number){
  const d=devicePixelRatio||1;c.setTransform(d,0,0,d,0,0);c.fillStyle='#09171e';c.fillRect(0,0,size.width,size.height);c.translate(pan.x,pan.y);c.scale(zoom,zoom);
  c.imageSmoothingEnabled=true;if(background.complete&&background.naturalWidth)c.drawImage(background,0,0);
  c.translate(reg.tx,reg.ty);c.scale(reg.sx,reg.sy);old.position=cat;old.now=now;
  if(artOnly){drawCat();return;}
  paintSqueezePassage(c,background,SQUEEZE_BOUNDS,SQUEEZE_OPENING_WIDTH);
  drawSqueezeMarker();
  if(!candidate){const dog=objects.find(o=>o.id===dogId);if(dog)prop(dog);old.drawMarkers(c,flags());drawCat();}
  else {
    const order=[...objects.map(o=>({y:o.y,draw:()=>prop(o)})),{y:cat.y,draw:drawCat}].sort((a,b)=>a.y-b.y);
    for(const item of order)item.draw();
    const near=nearby();
    for(const o of objects){
      const eligible=!o.requiresFlag||flags().includes(o.requiresFlag);
      const distance=Math.hypot(cat.x-o.x,cat.y-o.y);
      // Names arrive before E is available. Icons and their anchors do not move.
      const target=!eligible?0:checked('names')||o.id===objectiveId()?1:Math.max(0,Math.min(1,(95-distance)/30));
      const previous=labelOpacity.get(o.id)??0;
      const alpha=previous+(target-previous)*(1-Math.exp(-dt*10));
      labelOpacity.set(o.id,alpha);
      if(alpha>.005&&eligible)label(o,o===near,now,alpha);
    }
  }
}
function frame(now:number){const dt=Math.min((now-previous)/1000,.05);previous=now;
  if(climb){climb.elapsed+=dt;const t=Math.min(1,climb.elapsed/.55),s=t*t*(3-2*t);cat={x:climb.from.x+(climb.to.x-climb.from.x)*s,y:climb.from.y+(climb.to.y-climb.from.y)*s};if(t===1)climb=null;}
  else if(squeezeTarget){
    const dx=squeezeTarget.x-cat.x,dy=squeezeTarget.y-cat.y,distance=Math.hypot(dx,dy);
    if(distance<=1){cat={...squeezeTarget};squeezeTarget=null;}
    else {const amount=Math.min(distance,58*dt);cat=sweepMove(squeezeField(),cat,{x:dx/distance*amount,y:dy/distance*amount},2).position;}
  }
  else {const x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),y=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup')),n=Math.hypot(x,y);if(n)cat=sweepMove(field(),cat,{x:x/n*96*dt,y:y/n*96*dt}).position;}
  draw(now,dt);if(feedbackUntil&&now>feedbackUntil){get('feedback').style.display='none';feedbackUntil=0;}
  get('status').textContent=`${selected.label}\n${nearby()?'靠近可交互物 · E 查看提示':checked('names')?'全部浮动名称对照':'靠近浮现，离开淡出 · 主线目标常显'}\n新图像下载：0 · 新 API 请求：0`;
  const movement=get('movementHint');movement.textContent=squeezeTarget?'正在挤过窄缝…':squeezeDirection()?'松开移动键，再轻按 Q 挤过狭缝':crateClimbTarget(cat,field(),checked('rescued'))?'C · 翻过木箱':'';movement.hidden=!movement.textContent;
  canvas.dataset.ready=String(ready);requestAnimationFrame(frame);
}
background.onload=()=>{ready=true;focus(new URLSearchParams(location.search).get('focus')??'alley_puddle_reflection');};
if(background.complete&&background.naturalWidth){ready=true;focus(new URLSearchParams(location.search).get('focus')??'alley_puddle_reflection');}
Object.assign(window,{eventIconReview:{focus,setMode,getState:()=>({candidate,cat:{...cat},ready,nearby:nearby()?.id,squeezing:!!squeezeTarget,squeezeDirection:squeezeDirection(),propScale,atlasBytes:eventPropAtlas().width*eventPropAtlas().height*4,objective:objectiveId(),labelOpacity:Object.fromEntries(labelOpacity)}),objects}});
requestAnimationFrame(frame);
