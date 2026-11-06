import {TunnelMap} from '../../../web/src/modules/chapter4/TunnelMap';
import {TunnelWalkableMask} from '../../../web/src/modules/chapter4/TunnelWalkableMask';
import {tunnelConnections,type TunnelLayer} from '../../../web/src/modules/chapter4/navigation';
import {type TunnelSurface} from '../../../web/src/modules/chapter4/surfaces';
import mapData from '../../../level_design/chapter4/data/chapter4.map.json';
import lighting from '../../../level_design/chapter4/data/chapter4.lighting.json';
import {TunnelEventMarkers,tunnelEventObjective,nearbyLockedTunnelEvent,tunnelMovementChoices,type TunnelMarkerState} from '../../../web/src/modules/chapter4/eventMarkers';
import {drawBaselineMarkers,drawBaselineLabel} from './baselineMarkers';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import GlassLabels from '../../../web/src/ui/GlassLabels';
import {cell,propIds,tunnelPropAtlas} from '../../../web/src/modules/chapter4/eventProps';

type Point={x:number;y:number};
// An isolated preview adapter: the shared production renderer and real
// movement, masks, lighting and portal selection run beneath the candidate art.
type ReviewRuntime={position:Point;floor:TunnelLayer;surface:TunnelSurface;cameraPosition:Point;masks:Record<TunnelLayer,TunnelWalkableMask>|null;raisedMasks:Record<string,TunnelWalkableMask>;movement:unknown;bossRequested:boolean;connections:()=>ReturnType<typeof tunnelConnections>;drawMarkers:(ctx:CanvasRenderingContext2D,flags:readonly string[],drawn:readonly string[])=>void;drawLighting:(ctx:CanvasRenderingContext2D)=>void;drawLabel:(ctx:CanvasRenderingContext2D,label:string,point:Point,movement:boolean)=>void};
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T,checked=(id:string)=>get<HTMLInputElement>(id).checked;
const canvas=get<HTMLCanvasElement>('map'),ctx=canvas.getContext('2d')!,map=new TunnelMap(),view=map as unknown as ReviewRuntime;
const originalMarkers=drawBaselineMarkers.bind(view as unknown as ThisParameterType<typeof drawBaselineMarkers>),events=mapData.events.filter(e=>propIds.includes(e.id as typeof propIds[number]));
const originalLighting=view.drawLighting.bind(map);
const originalLabel=drawBaselineLabel.bind(view);
const keys=new Set<string>(),markers=new TunnelEventMarkers(),opacity=new Map<string,number>();
const completedPreviewEvents=new Set<string>();
let candidate=true,artOnly=false,zoom=1.65,size={width:1,height:1},selected=events[0],now=performance.now(),dt=1/60,previous=now,feedbackUntil=0,initialized=false;
const progress=()=>get<HTMLSelectElement>('progress').value;
const flags=()=>[...(['trap','valve','cleared'].includes(progress())?['tunnel_false_kitten_trap_found']:[]),...(['valve','cleared'].includes(progress())?['valve_three_investigated']:[]),...(progress()==='cleared'?['tunnel_explored','tunnel_boss_cleared']:[])];
const drawn=()=>[...completedPreviewEvents,...(['valve','cleared'].includes(progress())?['node:valve_three_event']:[]),...(checked('optionalDone')?['node:tunnel_momo_marks','node:tunnel_lamp_map','node:tunnel_light_switch']:[])];
const objective=()=>tunnelEventObjective(flags());
function markerState():TunnelMarkerState{return {floor:map.layer,surface:view.surface,position:view.position,flags:flags(),drawnEvents:drawn(),nearTarget:map.nearTarget,connections:view.connections()};}
function nearbyLockedEvent(){return nearbyLockedTunnelEvent(markerState());}
function movementChoices(){return tunnelMovementChoices(markerState());}
function notify(text:string){get('feedback').textContent=text;get('feedback').style.display='block';feedbackUntil=performance.now()+3000;}
function candidateMarkers(c:CanvasRenderingContext2D){markers.draw(c,markerState());}
view.drawMarkers=(c,f,d)=>candidate&&!artOnly?candidateMarkers(c):originalMarkers(c,f,d);
view.drawLabel=(c,label,point,movement)=>{if(movement&&candidate&&!artOnly&&(map.nearTarget||nearbyLockedEvent()))return;originalLabel(c,label,point,movement);};
// The review can zoom out past production's 1066x640 camera. Cover the full
// artwork in that review mode so the original camera rectangle has no seam.
// Keep the exact production gradients, lamp locations and blend modes.
view.drawLighting=c=>{
  if(zoom>=1){originalLighting(c);return;}
  const floor=map.layer,p=view.position,darkness=c.createRadialGradient(p.x,p.y,26,p.x,p.y,lighting.playerRadius[floor]);
  darkness.addColorStop(0,'rgba(3,5,12,0)');darkness.addColorStop(.55,`rgba(3,5,12,${lighting.baseOpacity[floor]*.38})`);darkness.addColorStop(1,`rgba(3,5,12,${lighting.baseOpacity[floor]})`);
  c.save();c.globalCompositeOperation='source-over';c.fillStyle=darkness;c.fillRect(0,0,mapData.world.width,mapData.world.height);
  for(const lamp of lighting.lamps[floor]){const glow=c.createRadialGradient(lamp.x,lamp.y,10,lamp.x,lamp.y,lamp.radius);glow.addColorStop(0,'rgba(255,190,90,.24)');glow.addColorStop(.5,'rgba(255,175,75,.1)');glow.addColorStop(1,'rgba(255,155,45,0)');c.globalCompositeOperation='screen';c.fillStyle=glow;c.beginPath();c.arc(lamp.x,lamp.y,lamp.radius,0,Math.PI*2);c.fill();}
  c.restore();
};
function updateMap(ms=0){map.update(ms,0,0,flags(),async()=>false,id=>notify(id==='tunnel_exit_boss'?'已到达战斗入口 · 此页只预览，不启动战斗':`${events.find(e=>e.id===id)?.label??id} · 此页只预览，不结算事件`),drawn());}
function interactPreview(){
  const target=map.nearTarget;
  if(!target){notify(nearbyLockedEvent()?'先调查假猫叫诱饵与绊线，再调查第三泄洪阀':(map.hint??'靠近固定物件后按 E'));return;}
  const event=events.find(e=>e.id===target.id);
  if(target.id==='tunnel_false_kitten_trap')get<HTMLSelectElement>('progress').value='trap';
  else if(target.id==='tunnel_valve_three')get<HTMLSelectElement>('progress').value='valve';
  else if(event?.eventId)completedPreviewEvents.add(`node:${event.eventId}`);
  updateMap();
  notify(target.id==='tunnel_false_kitten_trap'?'仅预览：已模拟完成诱饵调查，第三泄洪阀与 F 已解锁。正式游戏需完成事件卡结算。':`${event?.label??target.label} · 仅预览：已模拟完成；正式游戏需完成事件卡结算。`);
}
// Exercise the production glass labels in the review too; the baseline stays isolated.
const labelRoot=document.createElement('div');document.body.append(labelRoot);
createRoot(labelRoot).render(createElement(GlassLabels,{
  getLabels:()=>{
    if(!initialized||!candidate||artOnly)return [];
    const bounds=canvas.getBoundingClientRect(),base=Math.min(size.width/1066,size.height/640);
    const left=bounds.left+(size.width-1066*base)/2,top=bounds.top+(size.height-640*base)/2;
    const labels=map.explorationLabels(1066,640,flags(),drawn());
    opacity.clear();for(const label of labels)opacity.set(label.id,label.alpha);
    return labels.map(label=>({...label,x:left+label.x*base*zoom,y:top+label.y*base*zoom,alpha:checked('names')?1:label.alpha}));
  },
  onAction:key=>{if(key==='e')interactPreview();else if(key==='c'||key==='f'||key===' ')map.traverse(key,flags());}
}));
function focusPoint(floor:TunnelLayer,point:Point,surface:TunnelSurface='ground'){
  if(!map.isReady)return;view.floor=floor;view.surface=surface;view.movement=null;view.bossRequested=false;keys.clear();
  const mask=surface==='ground'?view.masks![floor]:view.raisedMasks[surface];let best:Point|null=null,score=Infinity;
  for(let y=point.y-64;y<=point.y+64;y+=2)for(let x=point.x-64;x<=point.x+64;x+=2){const d=Math.hypot(x-point.x,y-point.y);if(d<=64&&d<score&&mask.isWalkable({x,y})){best={x,y};score=d;}}
  view.position=best??{...point};updateMap();zoom=1.65;canvas.focus();
}
function focus(id:string){
  const event=events.find(e=>e.id===id||e.id.replace('tunnel_','')===id);
  if(event){selected=event;const mask=view.masks?.[event.layer as TunnelLayer];if(!mask)return;let best:Point|undefined,score=Infinity;
    for(let y=event.y-48;y<=event.y+48;y+=2)for(let x=event.x-48;x<=event.x+48;x+=2){if(Math.hypot(x-event.x,y-event.y)>50||!mask.isWalkable({x,y}))continue;const d=Math.hypot(x-event.x,y-(event.y+34));if(d<score){best={x,y};score=d;}}
    focusPoint(event.layer as TunnelLayer,best??event);return;
  }
  const portal=mapData.portals.find(p=>p.id===id);if(portal)focusPoint(portal.a.layer as TunnelLayer,portal.a);
  else if(id==='valve-spillway'){const p=mapData.portals.find(p=>p.id==='south-spillway-jump')!;focusPoint(p.b.layer as TunnelLayer,p.b);}
  else if(id==='lower')focusPoint('Lm1',{x:520,y:470});
}
function backAway(){const mask=view.masks?.[map.layer];if(!mask)return;for(let i=0;i<24;i++){const angle=i*Math.PI/12,p={x:selected.x+Math.cos(angle)*200,y:selected.y+Math.sin(angle)*200};if(mask.isWalkable(p)){focusPoint(map.layer,p);return;}}}
function setMode(value:boolean){candidate=value;get('candidate').classList.toggle('selected',value);get('baseline').classList.toggle('selected',!value);get('badge').textContent=value?'新图标 · 主线目标常显':'原有标记 · 对照';canvas.focus();}
get('candidate').onclick=()=>setMode(true);get('baseline').onclick=()=>setMode(false);get('backAway').onclick=backAway;get('fit').onclick=()=>{zoom=.85;canvas.focus();};
get('progress').onchange=()=>{updateMap();canvas.focus();};get('optionalDone').onchange=()=>{updateMap();canvas.focus();};
for(const event of events){
  const b=document.createElement('button');b.textContent=event.label;b.onclick=()=>focus(event.id);get('locations').append(b);
  const sample=document.createElement('div');sample.className='sample';const thumb=document.createElement('canvas');thumb.width=thumb.height=58;const s=thumb.getContext('2d')!;s.imageSmoothingEnabled=false;s.drawImage(tunnelPropAtlas(),propIds.indexOf(event.id as typeof propIds[number])*cell,0,cell,cell,2,2,54,54);const label=document.createElement('span');label.textContent=event.id==='tunnel_false_kitten_trap'?'诱饵与绊线':event.id==='tunnel_momo_marks'?'旧爪印':event.id==='tunnel_lamp_map'?'灯与地图':event.id==='tunnel_light_switch'?'应急灯闸':event.id==='tunnel_valve_three'?'泄洪阀':'战斗入口';sample.append(thumb,label);get('gallery').append(sample);
}
for(const [id,label] of [['e1','F · 西侧上下层'],['tank-climb','C · 圆罐石脊'],['ridge-climb','C · 阀门北侧石脊'],['west-ridge-east-descent','C · 西侧石沿出口'],['valve-spillway','Space · 阀门旁水沟'],['upper-gap-jump','Space · 北侧水沟'],['lm1-waterfall-jump','Space · 下层水道'],['lower','L−1 · 下层试走']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>focus(id);get('locations').append(b);}
window.addEventListener('keydown',e=>{
  if((e.target as HTMLElement).matches('input,select,textarea'))return;const k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e','c','f',' ','tab'].includes(k))e.preventDefault();
  if(k==='tab'){artOnly=true;return;}if(e.repeat&&['e','c','f',' '].includes(k))return;
  if(k==='c'||k==='f'||k===' '){map.traverse(k,flags());return;}
  if(k==='e'){interactPreview();return;}keys.add(k);
});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());map.keyUp(e.key.toLowerCase());if(e.key==='Tab')artOnly=false;});window.addEventListener('blur',()=>{keys.clear();artOnly=false;});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.65,Math.min(3,zoom*Math.exp(-e.deltaY*.001)));},{passive:false});
function resize(){const b=canvas.getBoundingClientRect(),d=devicePixelRatio||1;size={width:b.width,height:b.height};canvas.width=Math.round(b.width*d);canvas.height=Math.round(b.height*d);}
new ResizeObserver(resize).observe(canvas);
function frame(time:number){
  dt=Math.min(.05,Math.max(0,(time-previous)/1000));previous=time;now=time;
  const dx=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a')),dy=Number(keys.has('arrowdown')||keys.has('s'))-Number(keys.has('arrowup')||keys.has('w'));
  map.update(dt*1000,dx,dy,flags(),async()=>false,id=>notify(id==='tunnel_exit_boss'?'到达战斗区域 · 此页不启动战斗':`${events.find(e=>e.id===id)?.label??id} · 交互位置正确，正式游戏会进入原事件`),drawn());
  const d=devicePixelRatio||1,base=Math.min(size.width/1066,size.height/640),x=(size.width-1066*base)/2,y=(size.height-640*base)/2;
  ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#09171e';ctx.fillRect(0,0,size.width,size.height);ctx.save();ctx.beginPath();ctx.rect(x,y,1066*base,640*base);ctx.clip();ctx.translate(x,y);ctx.scale(base*zoom,base*zoom);
  view.cameraPosition={x:Math.max(0,Math.min(1672-1066/zoom,view.position.x-533/zoom)),y:Math.max(0,Math.min(941-640/zoom,view.position.y-320/zoom))};
  map.draw(ctx,1066,640,flags(),drawn());ctx.restore();
  const hint=map.hint;get('movementHint').textContent=hint??'';get('movementHint').hidden=candidate&&!artOnly||!hint;
  get('status').textContent=`${map.layer==='Lm1'?'L−1':map.layer} · ${view.surface}\n位置 (${Math.round(view.position.x)}, ${Math.round(view.position.y)})\n当前目标：${events.find(e=>e.id===objective())?.label??'本次救援已完成'}\n${map.nearTarget?'附近：'+map.nearTarget.label:'靠近物件后按 E'}\nC / F / Space 沿用正式连接与阻挡`;
  if(feedbackUntil&&time>feedbackUntil){get('feedback').style.display='none';feedbackUntil=0;}
  canvas.dataset.ready=String(initialized&&map.isReady);requestAnimationFrame(frame);
}
await map.ready();initialized=true;const params=new URLSearchParams(location.search),step=params.get('progress');if(step&&['arrival','trap','valve','cleared'].includes(step))get<HTMLSelectElement>('progress').value=step;focus(params.get('focus')??'false_kitten_trap');
Object.assign(window,{tunnelIconReview:{focus,focusPoint,setMode,getState:()=>({floor:map.layer,surface:view.surface,cat:map.positionNow(),active:map.nearTarget?.id,activeCrossings:view.connections().filter(c=>c.distance<=c.portal.reach).map(c=>c.portal.id),transition:!!view.movement,objective:objective(),labelOpacity:Object.fromEntries(opacity),movementLabel:movementChoices().labeled?.connection.portal.id,eventFocus:movementChoices().eventFocus,candidate,atlasBytes:tunnelPropAtlas().width*tunnelPropAtlas().height*4,ready:initialized&&map.isReady}),events,portals:mapData.portals}});
requestAnimationFrame(frame);
