import map from '../../../level_design/chapter4/data/chapter4.map.json';
import extraPortals from './preview-portals.json';
import l0Url from '../../../level_design/chapter4/art/chapter4_L0_approved.png?url';
import lm1Url from '../../../level_design/chapter4/art/chapter4_Lminus1_tunnel_v11.png?url';
import {drawPixelCat} from '../../../web/src/adapters/canvas/pixelCat';
import {TunnelWalkableMask,type TunnelPoint as Point} from '../../../web/src/modules/chapter4/TunnelWalkableMask';
import {tunnelConnections,tunnelPortalDisplay} from '../../../web/src/modules/chapter4/navigation';
import {tunnelClimbSurface,tunnelSurfaceConnections,type TunnelSurface} from '../../../web/src/modules/chapter4/surfaces';

type Surface='L0'|'Lm1'|Exclude<TunnelSurface,'ground'>;
type Dataset={width:number;height:number;step:number;cols:number;rows:number;surfaces:Record<Surface,{raw:string;effective:string;radius:number;depth:number;cornerReach:number}>;audit?:Array<{id:string;end:string;surface:Surface;point:Point|null;distance:number|null}>};
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T,checked=(id:string)=>get<HTMLInputElement>(id).checked;
const canvas=get<HTMLCanvasElement>('map'),ctx=canvas.getContext('2d')!;
const [original,candidate]=await Promise.all(['current.json','candidate.json'].map(async name=>(await fetch('./'+name)).json())) as [Dataset,Dataset];
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const datasets={current:original,candidate};
const ids=Object.keys(original.surfaces) as Surface[];
const fields=Object.fromEntries(Object.entries(datasets).map(([mode,data])=>[mode,Object.fromEntries(ids.map(id=>{const s=data.surfaces[id];return[id,new TunnelWalkableMask(data.width,data.height,decode(s.raw),s.radius,s.cornerReach)];}))])) as Record<'current'|'candidate',Record<Surface,TunnelWalkableMask>>;
const images={L0:new Image(),Lm1:new Image()};images.L0.src=l0Url;images.Lm1.src=lm1Url;
const notes:Array<Point&{surface:Surface;note:string}>=[],keys=new Set<string>();
let surface:Surface='L0',cat:Point={x:845,y:135},probe:Point|null=null,zoom=1,pan:Point={x:0,y:0},size={width:1,height:1},follow=false,artOnly=false,drag:{start:Point;pan:Point}|null=null;
let movement:{from:Point;to:Point;elapsed:number;duration:number}|null=null,lastTime=performance.now(),lastInfo=0,message='仅在独立预览中移动。正式地图、事件和存档不变。';
const mode=()=>get<HTMLSelectElement>('mode').value==='current'?'current':'candidate';
const floor=()=>surface==='Lm1'?'Lm1':'L0';
const flags=()=>checked('trap')?['tunnel_false_kitten_trap_found']:[];
const mask=(s=surface)=>fields[mode()][s];
const valid=(s:Surface,p:Point)=>fields[mode()][s].isWalkable(p);
function nearest(s:Surface,p:Point,max=48){if(valid(s,p))return{...p};let best:Point|null=null,d=Infinity;for(let y=Math.max(0,Math.floor(p.y-max));y<=Math.min(940,p.y+max);y++)for(let x=Math.max(0,Math.floor(p.x-max));x<=Math.min(1671,p.x+max);x++){const n=(x-p.x)**2+(y-p.y)**2;if(n<d&&n<=max*max&&valid(s,{x,y})){best={x,y};d=n;}}return best;}
function climbSurface(id:string){return id==='west-ridge-east-descent'?'west-ridge':tunnelClimbSurface(id);}
function connections(){
  const result=tunnelSurfaceConnections(floor(),surface==='L0'||surface==='Lm1'?'ground':surface,tunnelConnections(floor(),cat));
  if(mode()==='candidate')for(const extra of extraPortals.portals){
    if(result.some(c=>c.portal.id===extra.id))continue;
    const portal=extra as (typeof map.portals)[number];
    const from=surface==='west-ridge'?portal.b:surface==='L0'?portal.a:null;
    if(from){const to=from===portal.a?portal.b:portal.a;result.push({portal,from,to,distance:Math.hypot(cat.x-from.x,cat.y-from.y)});}
  }
  return result.sort((a,b)=>a.distance-b.distance);
}
let feedbackTimer:ReturnType<typeof setTimeout>|undefined;
function notify(text:string){message=text;const element=get('feedback');element.textContent=text;element.hidden=false;clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>element.hidden=true,5000);}
function traverse(key:'c'|'f'|' '){
  if(movement)return false;
  if(key==='f'&&!checked('trap')){notify('F 已锁定：打开左侧「F 楼层连接」开关即可继续走图；正式游戏仍需先调查假猫叫。');return false;}
  const authored=key===' '?'space':key,c=connections().find(c=>c.portal.key.toLowerCase()===authored&&c.distance<=c.portal.reach);
  if(!c){notify(key==='f'?'靠近标有 F 的木梯后再按 F；在石脊上请先按 C 回到地面。':key==='c'?'靠近石脊端点的 C 标记后再按 C。':'靠近水沟两岸的 Space 标记后再按空格。');return false;}
  const next=(c.to===c.portal.b?climbSurface(c.portal.id):undefined)??c.to.layer as Surface;
  const landing=nearest(next,c.to);if(!landing){message='该连接附近没有候选合法站位，请标记复查。';return false;}
  const crossFloor=c.from.layer!==c.to.layer;
  movement={from:crossFloor?landing:{...cat},to:landing,elapsed:0,duration:key===' '?520:key==='c'?640:420};
  surface=next;get<HTMLSelectElement>('surface').value=surface;keys.clear();buildViews();
  if(crossFloor){cat={...landing};center(cat,3);}
  message=`${c.portal.id} · 预览落点吸附 ${Math.hypot(landing.x-c.to.x,landing.y-c.to.y).toFixed(1)}px；正式锚点不变。`;
  notify(key==='f'?`正在${next==='Lm1'?'下至 L−1':'返回 L0'}。`:key==='c'?`C · ${next==='L0'?'返回下方道路':'攀上石脊'}`:'Space · 跳过水沟');
  return true;
}
function imageCanvas(values:Uint8Array,color:number[]){const c=document.createElement('canvas');c.width=original.cols;c.height=original.rows;const k=c.getContext('2d')!,im=k.createImageData(c.width,c.height);for(let i=0;i<values.length;i++)if(values[i])im.data.set([...color,255],i*4);k.putImageData(im,0,0);return c;}
function sampleRaw(data:Dataset,s:Surface){const raw=decode(data.surfaces[s].raw),out=new Uint8Array(data.cols*data.rows);for(let y=0;y<data.rows;y++)for(let x=0;x<data.cols;x++){const px=x*2+1,py=y*2+1;out[y*data.cols+x]=Number(py<data.height&&raw[py*data.width+px]>=128);}return out;}
function boundary(a:Uint8Array){const p=new Path2D(),w=original.cols,h=original.rows;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(a[y*w+x]){if(!y||!a[(y-1)*w+x]){p.moveTo(x*2,y*2);p.lineTo(x*2+2,y*2);}if(y===h-1||!a[(y+1)*w+x]){p.moveTo(x*2,y*2+2);p.lineTo(x*2+2,y*2+2);}if(!x||!a[y*w+x-1]){p.moveTo(x*2,y*2);p.lineTo(x*2,y*2+2);}if(x===w-1||!a[y*w+x+1]){p.moveTo(x*2+2,y*2);p.lineTo(x*2+2,y*2+2);}}return p;}
const ridgeViews=ids.filter(s=>!['L0','Lm1'].includes(s)).map(s=>imageCanvas(sampleRaw(original,s),[171,125,255]));
let view:HTMLCanvasElement,added:HTMLCanvasElement,removed:HTMLCanvasElement,padding:HTMLCanvasElement,rawBoundary:Path2D,effectiveBoundary:Path2D;
function buildViews(){const old=decode(original.surfaces[surface].effective),next=decode(candidate.surfaces[surface].effective),raw=sampleRaw(datasets[mode()],surface),effective=mode()==='current'?old:next,plus=new Uint8Array(old.length),minus=new Uint8Array(old.length),pad=new Uint8Array(old.length);for(let i=0;i<old.length;i++){plus[i]=Number(next[i]&&!old[i]);minus[i]=Number(old[i]&&!next[i]);pad[i]=Number(raw[i]&&!effective[i]);}view=imageCanvas(effective,[44,225,201]);added=imageCanvas(plus,[38,243,151]);removed=imageCanvas(minus,[255,75,112]);padding=imageCanvas(pad,[255,191,74]);rawBoundary=boundary(raw);effectiveBoundary=boundary(effective);get('summary').textContent=`${surface} · ${mode()==='current'?'当前':'候选'}规则试走\n地面脚底 10×3px；石脊脚底 4×3px\n候选 ${(next.reduce((n,v)=>n+v,0)*4).toLocaleString()} / 当前 ${(old.reduce((n,v)=>n+v,0)*4).toLocaleString()} px²`;get('viewBadge').textContent=`${surface} · ${mode()==='current'?'当前地图':'人工描边候选'} · 不写入游戏`;}
const fitScale=()=>Math.min((size.width-40)/1672,(size.height-40)/941);
function fit(){zoom=fitScale();pan={x:(size.width-1672*zoom)/2,y:(size.height-941*zoom)/2};follow=false;updateFollow();}
function center(p:Point,multiple=3){zoom=Math.max(fitScale()*multiple,.65);pan={x:size.width/2-p.x*zoom,y:size.height/2-p.y*zoom};}
function relocate(s:Surface,p:Point){surface=s;get<HTMLSelectElement>('surface').value=s;movement=null;keys.clear();const q=nearest(s,p,60);if(q){cat=q;message=`预览站位 ${cat.x.toFixed(0)}, ${cat.y.toFixed(0)}；锚点吸附 ${Math.hypot(cat.x-p.x,cat.y-p.y).toFixed(1)}px。`;}else message='该处没有合法站位，请标记复查。';probe=p;buildViews();center(p);canvas.focus();return !!q;}
const extraLocations=[['石沿末端 / C','west-ridge',730,744],['下层桥口','Lm1',1140,480],['F 木梯','L0',320,422]] as const;
const locations=[['入口','L0',845,135],['假猫叫 / 西侧路','L0',402,239],['中央木桥','L0',900,385],['圆罐下方 / C','L0',545,570],['圆罐石脊','tank-ridge',548,444],['西侧石沿','west-ridge',430,700],['第三阀门','L0',867,743],['南侧石脊','south-ridge',940,626],['东侧出口','L0',1520,759],['下层入口','Lm1',160,195],['下层西侧水沟','Lm1',330,430],['下层中央通道','Lm1',720,570],['下层东侧木桥','Lm1',1080,485]] as const;
for(const [name,s,x,y] of [...locations,...extraLocations]){const b=document.createElement('button');b.textContent=name;b.onclick=()=>relocate(s,{x,y});get('locations').append(b);}
for(const a of candidate.audit??[]){const b=document.createElement('button');b.textContent=`${a.id} ${a.end} · ${a.point?a.distance?.toFixed(1)+'px':'无合法站位'}`;b.classList.toggle('warn',!a.point||(a.distance??0)>8);b.onclick=()=>{if(a.point)relocate(a.surface,a.point);};get('audit').append(b);}
get<HTMLSelectElement>('surface').onchange=()=>{const s=get<HTMLSelectElement>('surface').value as Surface;const location=locations.find(x=>x[1]===s)!;relocate(s,{x:location[2],y:location[3]});};
get<HTMLSelectElement>('mode').onchange=()=>relocate(surface,cat);get('fit').onclick=fit;
function updateFollow(){get('follow').textContent=`跟随猫咪：${follow?'开':'关'}`;get('follow').classList.toggle('active',follow);}
get('follow').onclick=()=>{follow=!follow;updateFollow();canvas.focus();};get<HTMLInputElement>('opacity').oninput=()=>get('opacityValue').textContent=get<HTMLInputElement>('opacity').value+'%';
document.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(input=>input.addEventListener('change',()=>canvas.focus()));
get('artOnly').onpointerdown=e=>{e.preventDefault();artOnly=true;(e.target as HTMLElement).setPointerCapture(e.pointerId);};get('artOnly').onpointerup=()=>artOnly=false;get('artOnly').onpointercancel=()=>artOnly=false;
const screen=(e:MouseEvent)=>{const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};},world=(p:Point)=>({x:(p.x-pan.x)/zoom,y:(p.y-pan.y)/zoom});
canvas.oncontextmenu=e=>e.preventDefault();canvas.addEventListener('wheel',e=>{e.preventDefault();const p=screen(e),q=world(p);zoom=Math.max(fitScale()*.6,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));pan={x:p.x-q.x*zoom,y:p.y-q.y*zoom};},{passive:false});
canvas.onpointerdown=e=>{canvas.focus();const p=screen(e);if(e.button===1||e.button===2){drag={start:p,pan:{...pan}};canvas.setPointerCapture(e.pointerId);follow=false;updateFollow();return;}probe=world(p);if(e.altKey){const note=prompt('标记需要调整的路缘 / 障碍','待核对');if(note)notes.push({...probe,surface,note});}else if(e.shiftKey&&valid(surface,probe)){movement=null;cat={...probe};}};
canvas.onpointermove=e=>{const p=screen(e);if(drag)pan={x:drag.pan.x+p.x-drag.start.x,y:drag.pan.y+p.y-drag.start.y};else probe=world(p);};canvas.onpointerup=()=>drag=null;canvas.onpointercancel=()=>drag=null;
window.addEventListener('keydown',e=>{if((e.target as HTMLElement)?.matches('input,textarea,select'))return;const k=e.key.toLowerCase();if(k==='tab'){e.preventDefault();artOnly=true;return;}if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','c','f',' ','e'].includes(k))e.preventDefault();if(!e.repeat&&(k==='c'||k==='f'||k===' ')){traverse(k);return;}if(k==='e'&&!e.repeat){const event=map.events.filter(p=>p.layer===floor()&&['story_mandatory','fixed_optional','battle_exit'].includes(p.type)).map(p=>({p,d:Math.hypot(p.x-cat.x,p.y-cat.y)})).sort((a,b)=>a.d-b.d)[0];message=event&&event.d<=56?`${event.p.label} · 只核对可接近性，不结算事件或战斗。`:'附近没有固定事件。';}keys.add(k);});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key==='Tab')artOnly=false;});window.addEventListener('blur',()=>{keys.clear();drag=null;artOnly=false;});
function download(name:string,b:Blob){const a=document.createElement('a'),url=URL.createObjectURL(b);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
get('exportImage').onclick=()=>canvas.toBlob(b=>{if(b)download(`chapter4-${surface}.png`,b);});get('exportNotes').onclick=()=>download('chapter4-trace-notes.json',new Blob([JSON.stringify({previewOnly:true,notes},null,2)],{type:'application/json'}));
function label(text:string,p:Point,color='#fff0c4'){ctx.font=`${11/zoom}px "Microsoft YaHei",system-ui`;ctx.textBaseline='middle';const w=ctx.measureText(text).width+10/zoom;ctx.fillStyle='#101c26e6';ctx.fillRect(p.x+9/zoom,p.y-23/zoom,w,18/zoom);ctx.fillStyle=color;ctx.fillText(text,p.x+14/zoom,p.y-14/zoom);}
function render(){const d=devicePixelRatio||1;ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#071019';ctx.fillRect(0,0,size.width,size.height);ctx.translate(pan.x,pan.y);ctx.scale(zoom,zoom);const image=images[floor()];ctx.imageSmoothingEnabled=true;if(image.complete&&image.naturalWidth)ctx.drawImage(image,0,0,1672,941);
  if(!artOnly){ctx.save();ctx.globalAlpha=Number(get<HTMLInputElement>('opacity').value)/100;ctx.imageSmoothingEnabled=false;if(checked('showMask')){if(get<HTMLSelectElement>('mode').value==='difference'){ctx.drawImage(removed,0,0,original.cols*2,original.rows*2);ctx.drawImage(added,0,0,original.cols*2,original.rows*2);}else ctx.drawImage(view,0,0,original.cols*2,original.rows*2);}if(checked('raw'))ctx.drawImage(padding,0,0,original.cols*2,original.rows*2);if(checked('ridges')&&surface==='L0')for(const r of ridgeViews)ctx.drawImage(r,0,0,original.cols*2,original.rows*2);ctx.restore();ctx.lineWidth=1/zoom;if(checked('showMask')){ctx.strokeStyle='#60e7ca';ctx.stroke(effectiveBoundary);}if(checked('raw')){ctx.strokeStyle='#ffc977';ctx.stroke(rawBoundary);}
    if(checked('anchors')){if(surface==='L0'||surface==='Lm1')for(const event of map.events.filter(e=>e.layer===floor()&&['story_mandatory','fixed_optional','battle_exit'].includes(e.type))){ctx.beginPath();ctx.arc(event.x,event.y,5/zoom,0,Math.PI*2);ctx.fillStyle='#f0cd79';ctx.fill();label(event.label,event);}for(const c of connections()){const display=tunnelPortalDisplay(c,flags());if(!display.visible)continue;ctx.save();ctx.globalAlpha=display.alpha;ctx.beginPath();ctx.arc(c.from.x,c.from.y,6/zoom,0,Math.PI*2);ctx.fillStyle=display.locked?'#a6a497':'#73e1dd';ctx.fill();label(display.label,c.from,'#b4f6f5');ctx.restore();}}
    for(const [i,n] of notes.entries())if(n.surface===surface){ctx.beginPath();ctx.arc(n.x,n.y,7/zoom,0,Math.PI*2);ctx.strokeStyle='#ffd370';ctx.stroke();label(String(i+1),n);}
    if(probe){ctx.strokeStyle=valid(surface,probe)?'#9bffde':'#ff7a91';ctx.beginPath();ctx.moveTo(probe.x-5/zoom,probe.y);ctx.lineTo(probe.x+5/zoom,probe.y);ctx.moveTo(probe.x,probe.y-5/zoom);ctx.lineTo(probe.x,probe.y+5/zoom);ctx.stroke();}}
  const lift=movement&&movement.duration>500?Math.sin(movement.elapsed/movement.duration*Math.PI)*18:0;ctx.save();ctx.translate(cat.x-16,cat.y-30-lift);ctx.scale(.5,.5);drawPixelCat(ctx,'miaomiao');ctx.restore();if(checked('footprint')&&!artOnly){ctx.beginPath();ctx.ellipse(cat.x,cat.y,datasets[mode()].surfaces[surface].radius,3,0,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=1/zoom;ctx.stroke();}}
function frame(now:number){const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;if(movement){movement.elapsed=Math.min(movement.duration,movement.elapsed+dt*1000);const t=movement.elapsed/movement.duration,e=t*t*(3-2*t);cat={x:movement.from.x+(movement.to.x-movement.from.x)*e,y:movement.from.y+(movement.to.y-movement.from.y)*e};if(t===1)movement=null;}else{const dx=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a')),dy=Number(keys.has('arrowdown')||keys.has('s'))-Number(keys.has('arrowup')||keys.has('w')),n=Math.hypot(dx,dy);if(n)cat=mask().move(cat,{x:dx/n*142*dt,y:dy/n*142*dt}).position;}if(follow)pan={x:size.width/2-cat.x*zoom,y:size.height/2-cat.y*zoom};render();if(now-lastInfo>120){lastInfo=now;if(probe)get('probe').textContent=`PNG ${probe.x.toFixed(1)}, ${probe.y.toFixed(1)}\n当前 ${fields.current[surface].isWalkable(probe)?'可走':'阻挡'} · 候选 ${fields.candidate[surface].isWalkable(probe)?'可走':'阻挡'}`;get('status').textContent=`测试猫 ${surface} · ${cat.x.toFixed(1)}, ${cat.y.toFixed(1)}\n${message}`;canvas.dataset.surface=surface;canvas.dataset.previewOnly='true';}requestAnimationFrame(frame);}
let initialized=false;new ResizeObserver(()=>{const b=canvas.getBoundingClientRect(),d=devicePixelRatio||1;size={width:b.width,height:b.height};canvas.width=Math.round(b.width*d);canvas.height=Math.round(b.height*d);fit();if(!initialized){initialized=true;const focus=new URLSearchParams(location.search).get('focus');if(focus==='west')relocate('L0',{x:402,y:239});else if(focus==='bridges')relocate('L0',{x:900,y:385});else if(focus==='lower')relocate('Lm1',{x:720,y:570});else if(focus==='ledge')relocate('tank-ridge',{x:548,y:444});else if(focus==='west-end')relocate('west-ridge',{x:730,y:744});else if(focus==='lower-bridge')relocate('Lm1',{x:1140,y:480});else if(focus==='stairs')relocate('L0',{x:320,y:422});}}).observe(canvas);
buildViews();Object.assign(window,{tunnelTraceReview:{getCat:()=>({...cat,surface}),valid,nearest,relocate,traverse,fields,original,candidate,mode,move:(p:Point,d:Point)=>mask().move(p,d),moving:()=>!!movement}});requestAnimationFrame(frame);
