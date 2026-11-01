import {marketArt,marketItems,marketPortals,marketRoadSigns,marketPortalDisplay,marketInteractionTarget,marketEAction,marketTransitionAt,marketExitAt,isMarketTraversable,sweepMarketMove,type MarketFloor} from '../../../web/src/modules/nightMarket/map';
import {MarketTransitionController} from '../../../web/src/modules/nightMarket/transitions';
import {paintMarketCargo} from '../../../web/src/modules/nightMarket/cargoPainter';
import {drawPixelCat} from '../../../web/src/adapters/canvas/pixelCat';
import {icons,cell,marketEventAtlas} from '../../../web/src/modules/nightMarket/eventProps';
import {MarketEventMarkers} from '../../../web/src/modules/nightMarket/eventLabels';

type Point={x:number;y:number};type Item=typeof marketItems[number];
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const checked=(id:string)=>get<HTMLInputElement>(id).checked;
const canvas=get<HTMLCanvasElement>('map'),ctx=canvas.getContext('2d')!,keys=new Set<string>();
const events=marketItems.filter(item=>icons.includes(item.id as typeof icons[number]));
const images=new Map<MarketFloor,HTMLImageElement>(),transition=new MarketTransitionController();
let floor:MarketFloor='L0',cat:Point={x:910,y:287},selected=events.find(o=>o.id==='crow')!,candidate=true,artOnly=false;
let size={width:1,height:1},pan:Point={x:0,y:0},zoom=1,height=0,previous=performance.now(),feedbackUntil=0;
let drag:{x:number;y:number;pan:Point}|null=null;
let cameraTarget:Point={...selected};
const walkingReviews=[
  {id:'junction-left',label:'路口向左试走',floor:'L0',x:860,y:654},
  {id:'planter-right',label:'花坛尖端上方向右试走',floor:'L0',x:740,y:598},
  {id:'roof-up',label:'屋顶右侧接缝向上试走',floor:'L1',x:716,y:270},
  {id:'roof-north-down',label:'最北屋顶向下试走',floor:'L1',x:718,y:143},
  {id:'cargo-road',label:'南侧木箱旁向下试走',floor:'L0',x:865,y:717},
  {id:'roof-upper-down',label:'北侧屋顶向下试走',floor:'L1',x:640,y:262},
  {id:'roof-lower-down',label:'返回街面屋顶向下试走',floor:'L1',x:622,y:334},
] as const;
const markers=new MarketEventMarkers();
const progress=()=>get<HTMLSelectElement>('progress').value;
const cleared=()=>progress()==='cleared';
const flags=()=>[...(['crow','clues','cleared'].includes(progress())?['market_crow_clue_completed']:[]),...(['clues','cleared'].includes(progress())?['market_pigeon_clue_completed']:[]),...(cleared()?['market_cleared']:[])];
const drawn=()=>checked('momoDone')?['node:momo_trail_event']:[];
function objective(){return cleared()?'exit':progress()==='clues'?'boss':progress()==='crow'?'pigeon':'crow';}
function image(f:MarketFloor){let im=images.get(f);if(!im){im=new Image();im.src=marketArt[f];images.set(f,im);}return im;}
const fitScale=()=>Math.min((size.width-30)/1672,(size.height-30)/941);
function fit(){zoom=fitScale();pan={x:(size.width-1672*zoom)/2,y:(size.height-941*zoom)/2};}
function center(p:Point){cameraTarget={...p};zoom=Math.max(fitScale()*3.6,1);pan={x:size.width/2-p.x*zoom,y:size.height/2-p.y*zoom};}
function changeFloor(f:MarketFloor){floor=f;get<HTMLSelectElement>('floor').value=f;image(f);}
function stand(o:Point,f:MarketFloor,offset=44,expectedId?:string){
  let best:Point|null=null,score=Infinity;
  for(let y=o.y-64;y<=o.y+64;y+=2)for(let x=o.x-64;x<=o.x+64;x+=2){if(Math.hypot(x-o.x,y-o.y)>68||!isMarketTraversable(f,x,y,cleared()))continue;if(expectedId&&marketInteractionTarget(f,x,y,flags(),drawn())?.id!==expectedId)continue;const s=Math.hypot(x-o.x,y-(o.y+offset));if(s<score){score=s;best={x,y};}}
  return best;
}
function focus(id:string){
  const review=walkingReviews.find(p=>p.id===id);if(review){focusPoint(review.floor,review);return;}
  const item=events.find(o=>o.id===id);if(!item)return;
  const expected:Record<string,string>={crow:'market_crow_stall',pigeon:'market_pigeon_perch',momo:'market_momo_trace'};
  selected=item;changeFloor(item.layer);transition.cancel();height=0;keys.clear();
  if(item.id==='exit'&&!cleared()){
    const approach=marketPortals.find(p=>p.id==='exitClimb')!.a;
    cat=stand(approach,item.layer,0)??{x:approach.x,y:approach.y};center({x:item.x,y:(item.y+approach.y)/2});
  }else {cat=stand(item,item.layer,44,done(item)?undefined:expected[item.id])??stand(item,item.layer)??{x:item.x,y:item.y};center(item);}
  canvas.focus();
}
function focusPoint(f:MarketFloor,p:Point){changeFloor(f);transition.cancel();height=0;keys.clear();cat=stand(p,f,0)??{...p};center(p);canvas.focus();}
function backAway(){
  const a=Math.atan2(cat.y-selected.y,cat.x-selected.x);
  for(let i=0;i<24;i++){const angle=a+i*Math.PI/12,p={x:selected.x+Math.cos(angle)*200,y:selected.y+Math.sin(angle)*200};if(isMarketTraversable(floor,p.x,p.y,cleared())){cat=p;transition.cancel();keys.clear();center({x:(cat.x+selected.x)/2,y:(cat.y+selected.y)/2});break;}}
}
function done(item:Item){return item.id==='crow'?flags().includes('market_crow_clue_completed'):item.id==='pigeon'?flags().includes('market_pigeon_clue_completed'):item.id==='momo'?checked('momoDone'):item.id==='boss'?cleared():false;}
function locked(item:Item){return item.id==='boss'&&!['clues','cleared'].includes(progress())||item.id==='exit'&&!cleared();}
function title(item:Item){return item.id==='exit'?(cleared()?'北街出口 · 第三章花房':'北街出口 · 战后开启'):item.label;}
function near(){return marketInteractionTarget(floor,cat.x,cat.y,flags(),drawn());}
function active(item:Item){const target=near();return item.id==='crow'?target?.id==='market_crow_stall':item.id==='pigeon'?target?.id==='market_pigeon_perch':item.id==='momo'?target?.id==='market_momo_trace':item.id==='boss'?marketEAction(floor,cat.x,cat.y,flags(),drawn())?.type==='battle':false;}
function setMode(value:boolean){candidate=value;get('candidate').classList.toggle('selected',value);get('baseline').classList.toggle('selected',!value);get('badge').textContent=value?'新图标 · 主线目标常显':'原有标记 · 对照';}
get('candidate').onclick=()=>setMode(true);get('baseline').onclick=()=>setMode(false);get('backAway').onclick=()=>{backAway();canvas.focus();};get('fit').onclick=fit;
get<HTMLSelectElement>('progress').onchange=()=>{const p=stand(cat,floor,0);if(p)cat=p;};
get<HTMLSelectElement>('floor').onchange=()=>{
  const f=get<HTMLSelectElement>('floor').value as MarketFloor;
  const p=f==='L0'?{x:910,y:287}:f==='L1'?{x:1310,y:445}:{x:975,y:429};focusPoint(f,p);
};
for(const item of events){
  const button=document.createElement('button');button.textContent=`${item.label} · ${item.layer==='Lm1'?'L−1':item.layer}`;button.onclick=()=>focus(item.id);get('locations').append(button);
  const sample=document.createElement('div');sample.className='sample';const thumb=document.createElement('canvas');thumb.width=thumb.height=58;const c=thumb.getContext('2d')!;c.imageSmoothingEnabled=false;
  const i=icons.indexOf(item.id as typeof icons[number]);c.drawImage(marketEventAtlas(),i*cell,0,cell,cell,2,2,54,54);
  const name=document.createElement('span');name.textContent=item.id==='crow'?'老黑羽':item.id==='pigeon'?'咕咕大盗':item.id==='momo'?'墨墨踪迹':item.id==='boss'?'保卫战':'花房出口';sample.append(thumb,name);get('gallery').append(sample);
}
for(const [text,f,x,y] of [['南侧货箱 C','L0',865,717],['西北屋顶 C','L1',700,257],['西侧暗道 F','L0',632,674],['地下暗道','Lm1',975,429]] as const){const b=document.createElement('button');b.textContent=text;b.onclick=()=>focusPoint(f,{x,y});get('locations').append(b);}
for(const review of walkingReviews){const b=document.createElement('button');b.textContent=review.label;b.onclick=()=>focus(review.id);get('locations').append(b);}
function notify(text:string){get('feedback').textContent=text;get('feedback').style.display='block';feedbackUntil=performance.now()+2800;}
function interact(){const action=marketEAction(floor,cat.x,cat.y,flags(),drawn());if(action?.type==='interact')notify(`${events.find(o=>active(o))?.label??'事件'} · 仅预览交互提示，不结算事件`);else if(action?.type==='battle')notify('集市保卫战 · 两条线索门槛已满足（仅预览）');else if(action?.type==='hint')notify(action.text);else notify('靠近事件物件后按 E');}
function traverse(key:'c'|'f'){
  if(transition.active)return;
  const request=marketTransitionAt(floor,key,cat.x,cat.y,flags(),cleared());
  if(request){transition.begin(request,cat);keys.clear();}else notify(`附近没有可用的 ${key.toUpperCase()} 连接`);
}
window.addEventListener('keydown',e=>{
  if((e.target as HTMLElement).matches('input,textarea,select'))return;const k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e','c','f','tab'].includes(k))e.preventDefault();
  if(k==='tab'){artOnly=true;return;}if(transition.active)return;
  if(!e.repeat&&k==='e'){interact();return;}if(!e.repeat&&(k==='c'||k==='f')){traverse(k);return;}keys.add(k);
});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key==='Tab')artOnly=false;});window.addEventListener('blur',()=>{keys.clear();drag=null;artOnly=false;});
canvas.oncontextmenu=e=>e.preventDefault();canvas.onpointerdown=e=>{canvas.focus();if(e.button===1||e.button===2){drag={x:e.clientX,y:e.clientY,pan:{...pan}};canvas.setPointerCapture(e.pointerId);}};
canvas.onpointermove=e=>{if(drag)pan={x:drag.pan.x+e.clientX-drag.x,y:drag.pan.y+e.clientY-drag.y};};canvas.onpointerup=()=>drag=null;canvas.onpointercancel=()=>drag=null;
canvas.addEventListener('wheel',e=>{e.preventDefault();const b=canvas.getBoundingClientRect(),p={x:e.clientX-b.left,y:e.clientY-b.top},q={x:(p.x-pan.x)/zoom,y:(p.y-pan.y)/zoom};zoom=Math.max(fitScale(),Math.min(5,zoom*Math.exp(-e.deltaY*.001)));pan={x:p.x-q.x*zoom,y:p.y-q.y*zoom};},{passive:false});
function resize(){const b=canvas.getBoundingClientRect(),d=devicePixelRatio||1;size={width:b.width,height:b.height};canvas.width=Math.round(size.width*d);canvas.height=Math.round(size.height*d);center(cameraTarget);}
new ResizeObserver(resize).observe(canvas);
const tag=(text:string,x:number,y:number,alpha=1,objective=false,small=false)=>markers.labels.draw(ctx,text,x,y,alpha,objective,small);

function portals(){
  let hint='';
  for(const portal of marketPortals)for(const point of [portal.a,portal.b]){
    const display=marketPortalDisplay(portal,point,floor,cat.x,cat.y,flags());if(!display?.visible)continue;
    ctx.save();ctx.globalAlpha=display.alpha;ctx.fillStyle=display.active?'#73e1dd':'#91bab8';ctx.strokeStyle='#102b38';ctx.lineWidth=2;ctx.beginPath();ctx.arc(point.x,point.y,9,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#10232b';ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(portal.key.toUpperCase(),point.x,point.y+.5);ctx.restore();
    if(display.active){tag(display.label,point.x+70,point.y-25,1,false,true);hint=display.label;}
  }
  const box=get('movementHint');box.textContent=transition.active?'正在沿原连接通行…':hint;box.hidden=!box.textContent;
}
function roads(){
  const nearest=marketRoadSigns.filter(s=>s.floor===floor).map(sign=>({sign,distance:Math.hypot(cat.x-sign.x,cat.y-sign.y)})).sort((a,b)=>a.distance-b.distance)[0]?.sign;
  for(const sign of marketRoadSigns.filter(s=>s.floor===floor)){
    ctx.save();ctx.translate(sign.x,sign.y);ctx.fillStyle='rgba(12,18,22,.35)';ctx.fillRect(-12,9,24,4);ctx.fillStyle='#533728';ctx.fillRect(-3,1,6,14);ctx.fillRect(-5,13,10,3);ctx.fillStyle='#302b2a';ctx.fillRect(-15,-15,30,17);ctx.fillStyle='#9a633e';ctx.fillRect(-13,-13,26,13);ctx.fillStyle='#d8a85d';ctx.fillRect(-12,-12,24,2);ctx.fillRect(-12,-2,24,1);ctx.fillStyle='#f5e3b2';ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(sign.directions.includes('↑')||sign.directions.includes('↗')?'↑':sign.directions.includes('↓')?'↓':'→',0,-6);ctx.restore();
    const d=Math.hypot(cat.x-sign.x,cat.y-sign.y),alpha=Math.max(0,Math.min(1,(sign.revealRadius-d)/40));
    if(alpha>0&&nearest===sign)tag(`${sign.area} · ${sign.directions}`,sign.x-80,sign.y+25,alpha*.8,false,true);
  }
}
function draw(now:number){
  const d=devicePixelRatio||1;ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#09171e';ctx.fillRect(0,0,size.width,size.height);ctx.translate(pan.x,pan.y);ctx.scale(zoom,zoom);ctx.imageSmoothingEnabled=true;
  const im=image(floor);if(im.complete&&im.naturalWidth)ctx.drawImage(im,0,0,1672,941);
  if(!artOnly){
    if(floor==='L0')paintMarketCargo(ctx);
    roads();
    if(candidate){markers.draw(ctx,floor,cat,flags(),drawn(),now,checked('names'));}else for(const item of events.filter(o=>o.layer===floor)){
      ctx.save();ctx.globalAlpha=done(item)?.62:1;ctx.fillStyle=locked(item)?'#a6a497':item.id==='boss'?'#ef906a':'#f0cd79';ctx.strokeStyle='#172630';ctx.lineWidth=2;ctx.beginPath();ctx.arc(item.x,item.y,11,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.font='700 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#172630';ctx.fillText(item.id==='boss'?'!':item.id==='exit'?'↑':'E',item.x,item.y+.5);tag(title(item),item.x+70,item.y-25,1);ctx.restore();
    }
    portals();
  }else get('movementHint').hidden=true;
  ctx.fillStyle='rgba(10,16,22,.38)';ctx.beginPath();ctx.ellipse(cat.x,cat.y+3,9,3,0,0,Math.PI*2);ctx.fill();ctx.save();ctx.translate(cat.x-16,cat.y-30-height);ctx.scale(.5,.5);drawPixelCat(ctx,'miaomiao');ctx.restore();
}
function frame(now:number){const dt=Math.min(.05,(now-previous)/1000);previous=now;
  if(transition.active){const t=transition.advance(dt*1000);if(t){cat={x:t.x,y:t.y};height=t.height;if(t.floor!==floor)changeFloor(t.floor);if(t.done){height=0;if(t.exit)notify('已越过出口木箱 · 正式游戏会衔接第三章');}center(cat);}}
  else {const x=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a')),y=Number(keys.has('arrowdown')||keys.has('s'))-Number(keys.has('arrowup')||keys.has('w')),n=Math.hypot(x,y);if(n)cat=sweepMarketMove(floor,cat,{x:x/n*150*dt,y:y/n*150*dt},cleared()).position;}
  draw(now);if(feedbackUntil&&now>feedbackUntil){get('feedback').style.display='none';feedbackUntil=0;}
  const goal=events.find(o=>o.id===objective())!;
  get('status').textContent=`当前目标：${title(goal)} · ${goal.layer}\n${floor} · (${Math.round(cat.x)}, ${Math.round(cat.y)})\n图标持续可见，靠近显示名称\nC / F 保留原有门槛与动画`;
  canvas.dataset.ready=String(!!image(floor).naturalWidth);requestAnimationFrame(frame);
}
focus(new URLSearchParams(location.search).get('focus')??'crow');
Object.assign(window,{marketIconReview:{focus,focusPoint,setMode,getState:()=>({floor,cat:{...cat},candidate,objective:objective(),active:near()?.id,transition:transition.active,ready:!!image(floor).naturalWidth,atlasBytes:marketEventAtlas().width*marketEventAtlas().height*4,labelOpacity:markers.labelOpacity,exit:marketExitAt(floor,cat.x,cat.y,flags())}),events,portals:marketPortals}});
requestAnimationFrame(frame);
