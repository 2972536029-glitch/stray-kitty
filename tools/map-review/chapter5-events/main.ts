import {drawBaselineMarkers} from './baselineMarkers';
import {WarehouseWalkMap} from '../../../web/src/modules/chapter5/WarehouseWalkMap';
import {TunnelWalkableMask} from '../../../web/src/modules/chapter4/TunnelWalkableMask';
import geometry from '../../../level_design/chapter5/source/v07/warehouse_geometry_v07.json' with {type:'json'};
import {WarehouseMarkerPreview,fixedPoints,names,optionalInvestigationHint,type Point,type Floor,type MarkerState} from './markers';
import {cell,propKeys,warehousePropAtlas} from './propAtlas';
import {baselineBlockers,replacementIds,type ReviewObstacle} from './obstacles';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import GlassLabels from '../../../web/src/ui/GlassLabels';

// Isolated adapter: only the preview's marker drawing and local state change.
// Production geometry, render order, lighting, movement and target selection run unchanged.
type ReviewRuntime={position:Point;floor:Floor;mask:TunnelWalkableMask|null;l1Mask:TunnelWalkableMask|null;climbing:unknown;snapCamera:boolean;records:ReviewObstacle[];drawMarkers:(ctx:CanvasRenderingContext2D)=>void};
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const checked=(id:string)=>get<HTMLInputElement>(id).checked;
const canvas=get<HTMLCanvasElement>('map'),ctx=canvas.getContext('2d')!,map=new WarehouseWalkMap(),view=map as unknown as ReviewRuntime;
const baseline=drawBaselineMarkers.bind(view as unknown as ThisParameterType<typeof drawBaselineMarkers>),markers=new WarehouseMarkerPreview(),keys=new Set<string>();
const opacity=new Map<string,number>();
const lampIds=['entry_lamp','central_spotlight','secondary_lamp'];
const flags=new Set<string>(),completed=new Set<string>();
let originalObstacles:ReviewObstacle[]=[],candidateObstacles:ReviewObstacle[]=[];
let candidate=true,originalWhileHeld=false,zoom=1,overview=false,selected=fixedPoints[0],now=performance.now(),previous=now,feedbackUntil=0,initialized=false,size={width:1,height:1};

function sync(){
  if(get<HTMLSelectElement>('progress').value==='victory')flags.add('finale_boss_victory');else flags.delete('finale_boss_victory');
  const drawn=[...completed,...(checked('optionalDone')?['node:warehouse_lookout','node:warehouse_light_crate']:[])];
  map.syncState({flags:[...flags],drawnEvents:drawn});
  get('lights').textContent=lampIds.every(id=>flags.has(id))?'全部关灯':'全部开灯';
}
function markerState():MarkerState{return {floor:map.layer,position:map.positionNow(),flags,drawn:new Set([...completed,...(checked('optionalDone')?['node:warehouse_lookout','node:warehouse_light_crate']:[])]),near:map.nearTarget};}
view.drawMarkers=c=>candidate&&!originalWhileHeld?markers.draw(c,markerState()):baseline(c);
function notify(text:string){get('feedback').textContent=text;get('feedback').style.display='block';feedbackUntil=performance.now()+3200;}
function focusPoint(floor:Floor,point:Point){
  if(!map.isReady)return;
  const mask=floor==='L0'?view.mask:view.l1Mask;if(!mask)return;
  let best:Point|undefined,score=Infinity;
  for(let y=point.y-80;y<=point.y+80;y+=2)for(let x=point.x-80;x<=point.x+80;x+=2){const d=Math.hypot(x-point.x,y-point.y);if(d<=80&&d<score&&mask.isWalkable({x,y})){best={x,y};score=d;}}
  view.position=best??{...point};view.floor=floor;view.climbing=null;view.snapCamera=true;keys.clear();overview=false;zoom=1;feedbackUntil=0;get('feedback').style.display='none';map.setOptions({overview:false});canvas.focus();
}
function focus(id:string){
  const aliases:Record<string,string>={entry:'entry_lamp',spotlight:'central_spotlight',east:'secondary_lamp',lookout:'warehouse_lookout',crate:'warehouse_light_crate',boss:'finale_boss',exit:'bunker_exit'};
  id=aliases[id]??id;const point=fixedPoints.find(p=>p.id===id);
  if(point){selected=point;focusPoint(point.floor as Floor,point.id==='warehouse_lookout'?{x:point.x+48,y:point.y+6}:{x:point.x,y:point.y+50});return;}
  const climb=geometry.climbs.find(p=>p.id===id||p.id+'-top'===id);if(climb)focusPoint(id.endsWith('-top')?'L1':'L0',climb);
  const obstacle=candidateObstacles.find(p=>p.solidId===id);if(obstacle){const box=obstacle.collisionRect;focusPoint('L0',{x:box.x+box.w+32,y:box.y+box.h/2});}
}
function interact(){
  const target=map.nearTarget;
  if(!target){notify(selected.id==='bunker_exit'&&!flags.has('finale_boss_victory')?'先守住仓库防线，隔间出口才会打开。':'靠近物件后按 E；靠近攀爬点后按 C。');return;}
  if(target.key==='C'){notify(target.label);return;}
  if(lampIds.includes(target.id)){
    if(flags.has(target.id))flags.delete(target.id);else flags.add(target.id);sync();notify(`${names[target.id]} · ${flags.has(target.id)?'已打开':'已关闭'}（仅预览）`);
  }else if(target.id==='finale_boss'){
    notify('已到达原战斗交互点。此页不启动战斗；可用左侧状态切换查看战后出口。');
  }else if(target.id==='bunker_exit'){
    notify('已到达原隔间出口。此页不推进结局或写入存档。');
  }else{completed.add('node:'+target.id);sync();notify(`${names[target.id]} · 已模拟调查（仅预览，不结算事件卡或骰子）。`);}
}
const labelRoot=document.createElement('div');document.body.append(labelRoot);
createRoot(labelRoot).render(createElement(GlassLabels,{
  getLabels:()=>{
    if(!initialized||!candidate||originalWhileHeld)return [];
    const bounds=canvas.getBoundingClientRect(),base=Math.min(size.width/1066,size.height/640);
    const left=bounds.left+(size.width-1066*base)/2+533*base*(1-zoom),top=bounds.top+(size.height-640*base)/2+320*base*(1-zoom);
    const labels=map.explorationLabels(1066,640);
    opacity.clear();for(const label of labels)opacity.set(label.id,label.alpha);
    return labels.map(label=>({...label,x:left+label.x*base*zoom,y:top+label.y*base*zoom,alpha:checked('names')?1:label.alpha}));
  },
  onAction:key=>{if(key==='e')interact();else if(key==='c')map.climb();}
}));
function setMode(value:boolean){candidate=value;get('candidate').classList.toggle('selected',value);get('baseline').classList.toggle('selected',!value);get('badge').textContent=value?'新图标 · 浮动名称':'原有标记 · 对照';canvas.focus();}
get('candidate').onclick=()=>setMode(true);get('baseline').onclick=()=>setMode(false);
get('progress').onchange=()=>{sync();canvas.focus();};get('optionalDone').onchange=()=>{sync();canvas.focus();};
get('lights').onclick=()=>{const on=!lampIds.every(id=>flags.has(id));for(const id of lampIds)if(on)flags.add(id);else flags.delete(id);sync();canvas.focus();};
get('collision').onchange=()=>{map.setOptions({collision:checked('collision')});canvas.focus();};
get('fit').onclick=()=>{overview=!overview;zoom=1;map.setOptions({overview});get('fit').textContent=overview?'返回跟随视角':'全图对照';canvas.focus();};
get('backAway').onclick=()=>{
  const mask=map.layer==='L0'?view.mask:view.l1Mask;if(!mask)return;
  for(let i=0;i<36;i++){const angle=i*Math.PI/18,p={x:selected.x+Math.cos(angle)*195,y:selected.y+Math.sin(angle)*195};if(mask.isWalkable(p)){focusPoint(map.layer,p);return;}}
};
for(const point of fixedPoints){const button=document.createElement('button');button.textContent=names[point.id]+(point.floor==='L1'?' · 货架上':'');button.onclick=()=>focus(point.id);get('locations').append(button);}
for(const [id,label] of [['C1','C · 西侧货架'],['C2-top','C · 中央货架回地面']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>focus(id);get('locations').append(button);}
for(const [id,label] of [['south_central_scrap','木箱 · 南侧通路'],['east_transverse_rubble','矮箱 · 东侧通路']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>focus(id);get('locations').append(button);}
for(const point of fixedPoints){
  const sample=document.createElement('div');sample.className='sample';const thumb=document.createElement('canvas');thumb.width=thumb.height=58;const c=thumb.getContext('2d')!;c.imageSmoothingEnabled=false;
  const index=propKeys.indexOf((lampIds.includes(point.id)?point.id+':on':point.id) as typeof propKeys[number]);c.drawImage(warehousePropAtlas(),index*cell,0,cell,cell,2,2,54,54);
  const label=document.createElement('span');label.textContent=names[point.id];sample.append(thumb,label);get('gallery').append(sample);
}
window.addEventListener('keydown',event=>{
  if((event.target as HTMLElement).matches('input,select,textarea'))return;const key=event.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e','c','tab'].includes(key))event.preventDefault();
  if(key==='tab'){originalWhileHeld=true;return;}if(event.repeat&&['e','c'].includes(key))return;
  if(key==='e'){interact();return;}if(key==='c'){if(!map.climb())notify('靠近货架 C 标记后再攀爬。');return;}keys.add(key);
});
window.addEventListener('keyup',event=>{keys.delete(event.key.toLowerCase());if(event.key==='Tab')originalWhileHeld=false;});window.addEventListener('blur',()=>{keys.clear();originalWhileHeld=false;});
canvas.addEventListener('wheel',event=>{event.preventDefault();if(!overview)zoom=Math.max(.75,Math.min(1.8,zoom*Math.exp(-event.deltaY*.001)));},{passive:false});
new ResizeObserver(()=>{const bounds=canvas.getBoundingClientRect(),d=devicePixelRatio||1;size={width:bounds.width,height:bounds.height};canvas.width=Math.round(bounds.width*d);canvas.height=Math.round(bounds.height*d);}).observe(canvas);
function frame(time:number){
  const dt=Math.min(50,Math.max(0,time-previous));previous=time;now=time;
  const dx=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a')),dy=Number(keys.has('arrowdown')||keys.has('s'))-Number(keys.has('arrowup')||keys.has('w'));
  map.update(dt,dx,dy);
  view.records=candidate&&!originalWhileHeld?candidateObstacles:originalObstacles;
  const d=devicePixelRatio||1,base=Math.min(size.width/1066,size.height/640),x=(size.width-1066*base)/2,y=(size.height-640*base)/2;
  ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#09171e';ctx.fillRect(0,0,size.width,size.height);ctx.save();ctx.beginPath();ctx.rect(x,y,1066*base,640*base);ctx.clip();
  ctx.translate(x+533*base,y+320*base);ctx.scale(base*zoom,base*zoom);ctx.translate(-533,-320);map.draw(ctx,1066,640,dt);ctx.restore();
  const near=map.nearTarget,p=map.positionNow();get('movementHint').textContent=near?.label??'';get('movementHint').hidden=candidate&&!originalWhileHeld||!near;
  get('optionalHint').hidden=true;
  get('status').textContent=`${map.layer==='L1'?'L1 · 货架与栈道':'L0 · 仓库地面'}\n位置 (${Math.round(p.x)}, ${Math.round(p.y)})\n${near?'附近：'+near.label:'靠近物件后按 E；货架连接按 C'}\n灯光 ${lampIds.filter(id=>flags.has(id)).length} / 3 · ${flags.has('finale_boss_victory')?'战后出口已解锁':'仓库防线尚未完成'}`;
  if(feedbackUntil&&time>feedbackUntil){get('feedback').style.display='none';feedbackUntil=0;}
  canvas.dataset.ready=String(initialized&&map.isReady);requestAnimationFrame(frame);
}
await map.ready();candidateObstacles=view.records;originalObstacles=baselineBlockers(candidateObstacles);const params=new URLSearchParams(location.search);if(params.get('progress')==='victory')get<HTMLSelectElement>('progress').value='victory';if(params.get('lights')==='on')for(const id of lampIds)flags.add(id);
sync();initialized=true;focus(params.get('focus')??'entry');
Object.assign(window,{warehouseIconReview:{focus,focusPoint,setMode,getState:()=>({floor:map.layer,cat:map.positionNow(),near:map.nearTarget,climbing:!!view.climbing,flags:[...flags],drawn:[...completed],labelOpacity:Object.fromEntries(opacity),optionalHint:optionalInvestigationHint(markerState()),candidate,ready:initialized&&map.isReady,atlasBytes:warehousePropAtlas().width*warehousePropAtlas().height*4,obstacles:candidateObstacles.filter(r=>replacementIds.includes(r.solidId)).map(r=>({id:r.solidId,collision:r.collisionRect,assets:r.components.map(c=>c.sourceSprite)})),randomEventsEnabled:false}),points:fixedPoints,climbs:geometry.climbs}});
requestAnimationFrame(frame);
