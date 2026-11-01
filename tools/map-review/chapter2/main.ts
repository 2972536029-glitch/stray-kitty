import {paintMarketCargo} from './obstaclePainter';
import {drawPixelCat} from '../../../web/src/adapters/canvas/pixelCat';
import {marketArt,marketEntry,marketPortals,marketItems,nightMarketSpatial,isMarketTraversable,sweepMarketMove,marketMovementBlockReason,distanceToSegment,marketTransitionAt,marketExitAt,type MarketFloor} from '../../../web/src/modules/nightMarket/map';
import {MarketTransitionController} from '../../../web/src/modules/nightMarket/transitions';

type Point={x:number;y:number};type Mask={pixels:Uint8Array;canvas:HTMLCanvasElement;boundary:Path2D};
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const checked=(id:string)=>get<HTMLInputElement>(id).checked;
const canvas=get<HTMLCanvasElement>('map'),ctx=canvas.getContext('2d')!,floors:MarketFloor[]=['L0','L1','Lm1'];
const [current,trace,audit]=await Promise.all(['current.json','candidate.json','trace-audit.json'].map(async p=>(await fetch('./'+p)).json()));
const cols=current.cols as number,rows=current.rows as number,step=current.step as number;
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const originalMasks=Object.fromEntries(floors.map(f=>[f,decode(current.masks[f])])) as Record<MarketFloor,Uint8Array>;
const candidateMasks=Object.fromEntries(floors.map(f=>[f,decode(trace.floors[f].effective)])) as Record<MarketFloor,Uint8Array>;
const rawMasks=Object.fromEntries(floors.map(f=>[f,decode(trace.floors[f].raw)])) as Record<MarketFloor,Uint8Array>;
const images=Object.fromEntries(floors.map(f=>{const i=new Image();i.src=marketArt[f];return[f,i];})) as Record<MarketFloor,HTMLImageElement>;
const transition=new MarketTransitionController(),keys=new Set<string>(),notes:Array<Point&{floor:MarketFloor;note:string}>=[];
let floor:MarketFloor='L0',cat:Point={x:marketEntry.x,y:marketEntry.y},height=0,probe:Point|null=null;
let zoom=1,pan:Point={x:0,y:0},size={width:1,height:1},drag:{start:Point;pan:Point}|null=null,artOnly=false,follow=false;
let lastTime=performance.now(),lastInfo=0,message='候选描边已载入。所有行走只发生在预览中。';
const focusName=new URLSearchParams(location.search).get('focus');
const focusCenter=focusName==='island-curb'?{x:1100,y:310}:focusName==='north-curb'?{x:945,y:165}:focusName==='island-bend'?{x:850,y:535}:focusName==='stalls'?{x:1000,y:270}:focusName==='nw-roof'?{x:679,y:208}:focusName==='junction'?{x:795,y:625}:focusName==='south-curb'?{x:902,y:706}:null;
const mode=()=>get<HTMLSelectElement>('mode').value,cleared=()=>checked('cleared');
const candidate=()=>mode()!=='current';
function index(p:Point){const x=Math.floor(p.x/step),y=Math.floor(p.y/step);return x<0||y<0||x>=cols||y>=rows?-1:y*cols+x;}
function specialBlock(f:MarketFloor,p:Point){
  if(p.x<10||p.y<10||p.x>1662||p.y>931)return true;
  if(f==='L0'&&marketMovementBlockReason(f,p.x,p.y,cleared())?.startsWith('solid building'))return true;
  if(f==='L0'&&nightMarketSpatial.actionObstacles.some(o=>distanceToSegment(p.x,p.y,o.a,o.b)<o.radius+10))return true;
  const b=nightMarketSpatial.battleBarrier;return f===b.layer&&distanceToSegment(p.x,p.y,b.a,b.b)<b.radius+10+(cleared()?3:0);
}
function valid(f:MarketFloor,p:Point,useCandidate=candidate()){
  if(!useCandidate)return isMarketTraversable(f,p.x,p.y,cleared());
  const i=index(p);return i>=0&&candidateMasks[f][i]===1&&!specialBlock(f,p);
}
function nearest(f:MarketFloor,p:Point,max=48,useCandidate=candidate()){
  if(valid(f,p,useCandidate))return{...p};let best:Point|null=null,d=Infinity;
  for(let y=Math.max(1,Math.floor((p.y-max)/2)*2+1);y<=Math.min(939,p.y+max);y+=2)for(let x=Math.max(1,Math.floor((p.x-max)/2)*2+1);x<=Math.min(1670,p.x+max);x+=2){const n=Math.hypot(x-p.x,y-p.y);if(n<=max&&n<d&&valid(f,{x,y},useCandidate)){best={x,y};d=n;}}
  return best;
}
function move(p:Point,delta:Point){
  if(!candidate())return sweepMarketMove(floor,p,delta,cleared()).position;
  const n=Math.max(1,Math.ceil(Math.max(Math.abs(delta.x),Math.abs(delta.y))/2)),dx=delta.x/n,dy=delta.y/n,next={...p};
  for(let i=0;i<n;i++){
    if(valid(floor,{x:next.x+dx,y:next.y+dy})){next.x+=dx;next.y+=dy;continue;}
    const one={...next},two={...next};
    if(valid(floor,{x:one.x+dx,y:one.y}))one.x+=dx;if(valid(floor,{x:one.x,y:one.y+dy}))one.y+=dy;
    if(valid(floor,{x:two.x,y:two.y+dy}))two.y+=dy;if(valid(floor,{x:two.x+dx,y:two.y}))two.x+=dx;
    const picked=Math.hypot(one.x-next.x,one.y-next.y)>=Math.hypot(two.x-next.x,two.y-next.y)?one:two;Object.assign(next,picked);
  }return next;
}
const flags=()=>cleared()?['market_cleared']:[];
function traverse(key:'c'|'f'){
  if(transition.active)return false;
  let request=marketTransitionAt(floor,key,cat.x,cat.y,flags(),cleared());
  if(candidate()){
    const connections=marketPortals.flatMap(p=>[{p,from:p.a,to:p.b},{p,from:p.b,to:p.a}]).filter(v=>v.p.key===key&&v.from.layer===floor&&(!v.p.requiresFlag||flags().includes(v.p.requiresFlag))&&Math.hypot(v.from.x-cat.x,v.from.y-cat.y)<=44).sort((a,b)=>Math.hypot(a.from.x-cat.x,a.from.y-cat.y)-Math.hypot(b.from.x-cat.x,b.from.y-cat.y));
    request=null;
    for(const {p,from,to} of connections){const landing=nearest(to.layer,to),start=nearest(from.layer,from);if(landing&&start){request={id:p.id,animation:p.animation,durationMs:p.durationMs,arcHeight:p.arcHeight,fromFloor:from.layer,toFloor:to.layer,from:start,to:landing,exit:p.id==='exitClimb'};break;}}
  }
  if(!request){message=`附近没有可用的 ${key.toUpperCase()} 连接。`;return false;}
  const started=transition.begin(request,cat);if(started){keys.clear();message=`${request.id} · 按原连接时长与方向通行（仅预览）。`;}
  return started;
}
function imageCanvas(values:Uint8Array,color:number[]){const c=document.createElement('canvas');c.width=cols;c.height=rows;const k=c.getContext('2d')!,data=k.createImageData(cols,rows);for(let i=0;i<values.length;i++)if(values[i])data.data.set([...color,255],i*4);k.putImageData(data,0,0);return c;}
function boundary(values:Uint8Array){const p=new Path2D();for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(values[y*cols+x]){if(!y||!values[(y-1)*cols+x]){p.moveTo(x*2,y*2);p.lineTo(x*2+2,y*2);}if(y===rows-1||!values[(y+1)*cols+x]){p.moveTo(x*2,y*2+2);p.lineTo(x*2+2,y*2+2);}if(!x||!values[y*cols+x-1]){p.moveTo(x*2,y*2);p.lineTo(x*2,y*2+2);}if(x===cols-1||!values[y*cols+x+1]){p.moveTo(x*2+2,y*2);p.lineTo(x*2+2,y*2+2);}}return p;}
let rawBoundary:Path2D;
let currentView:Mask,candidateView:Mask,added:HTMLCanvasElement,removed:HTMLCanvasElement,clearance:HTMLCanvasElement;
function buildViews(){
  rawBoundary=boundary(rawMasks[floor]);
  const old=originalMasks[floor].slice(),next=candidateMasks[floor].slice(),plus=new Uint8Array(old.length),minus=new Uint8Array(old.length),padding=new Uint8Array(old.length);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*cols+x;if(specialBlock(floor,{x:x*2+1,y:y*2+1})){old[i]=0;next[i]=0;}plus[i]=Number(next[i]&&!old[i]);minus[i]=Number(old[i]&&!next[i]);padding[i]=Number(rawMasks[floor][i]&&!candidateMasks[floor][i]);}
  currentView={pixels:old,canvas:imageCanvas(old,[44,225,201]),boundary:boundary(old)};candidateView={pixels:next,canvas:imageCanvas(next,[44,225,201]),boundary:boundary(next)};
  added=imageCanvas(plus,[38,243,151]);removed=imageCanvas(minus,[255,75,112]);clearance=imageCanvas(padding,[255,191,74]);
  const sum=(v:Uint8Array)=>v.reduce((n,v)=>n+v,0)*4;
  get('summary').textContent=`${floor} · ${mode()==='current'?'当前规则':'候选规则'}试走\n候选 ${sum(next).toLocaleString()} px² / 当前 ${sum(old).toLocaleString()} px²；采样精度 2px。`;
  get('viewBadge').textContent=`${floor} · ${mode()==='current'?'当前游戏边界':mode()==='difference'?'红：收回区域 / 绿：新增区域':'PNG 人工描边候选'} · 不写入游戏`;
}
const fitScale=()=>Math.min((size.width-40)/1672,(size.height-40)/941);
function fit(){zoom=fitScale();pan={x:(size.width-1672*zoom)/2,y:(size.height-941*zoom)/2};follow=false;updateFollow();}
function center(p:Point,scale=3){zoom=Math.max(fitScale()*scale,.65);pan={x:size.width/2-p.x*zoom,y:size.height/2-p.y*zoom};}
let firstResize=true;
function resize(){const b=canvas.getBoundingClientRect(),d=devicePixelRatio||1;size={width:b.width,height:b.height};canvas.width=Math.round(b.width*d);canvas.height=Math.round(b.height*d);fit();if(firstResize&&focusCenter)center(focusCenter,5);firstResize=false;}
new ResizeObserver(resize).observe(canvas);
function relocate(p:Point,f:MarketFloor=floor){floor=f;get<HTMLSelectElement>('floor').value=f;transition.cancel();height=0;keys.clear();const q=nearest(f,p,60);if(q){cat=q;message=`预览站位调整 ${Math.hypot(q.x-p.x,q.y-p.y).toFixed(1)}px；原游戏坐标未修改。`;}else message='此处附近没有候选合法站位，请对照原图。';probe=p;buildViews();center(p);canvas.focus();}
const locations=[['南侧入口','L0',670,781],['西侧集市环路','L0',482,518],['中央环路','L0',1044,380],['墨墨 / 乌鸦','L0',930,195],['南侧货箱 C','L0',859,717],['北街 / 出口','L0',1365,166],['西北屋顶','L1',675,257],['鸽子高台','L1',1310,426],['地下弯道','Lm1',1110,515]] as const;
for(const [name,f,x,y] of locations){const b=document.createElement('button');b.textContent=name;b.onclick=()=>relocate({x,y},f);get('locations').append(b);}
for(const p of marketPortals)for(const [end,q] of [['a',p.a],['b',p.b]] as const){const a=audit.portalLandings.find((a:{id:string})=>a.id===p.id)?.[end];const b=document.createElement('button');b.textContent=`${p.id} ${end} · ${q.layer} · ${a?a.distance.toFixed(1)+'px':'无站位'}`;b.classList.toggle('warn',!a||a.distance>8);b.onclick=()=>relocate(q,q.layer);get('audit').append(b);}
get<HTMLSelectElement>('floor').onchange=()=>{const f=get<HTMLSelectElement>('floor').value as MarketFloor;const first=f==='L0'?marketEntry:marketPortals.flatMap(p=>[p.a,p.b]).find(p=>p.layer===f)!;relocate(first,f);fit();};
get<HTMLSelectElement>('mode').onchange=()=>{buildViews();const q=nearest(floor,cat);if(q)cat=q;else relocate(floor==='L0'?marketEntry:marketPortals.flatMap(p=>[p.a,p.b]).find(p=>p.layer===floor)!);};
get<HTMLInputElement>('cleared').onchange=()=>buildViews();get('fit').onclick=fit;
function updateFollow(){get('follow').textContent=`跟随猫咪：${follow?'开':'关'}`;get('follow').classList.toggle('active',follow);}
get('follow').onclick=()=>{follow=!follow;updateFollow();canvas.focus();};
get<HTMLInputElement>('opacity').oninput=()=>get('opacityValue').textContent=get<HTMLInputElement>('opacity').value+'%';
get('artOnly').onpointerdown=e=>{e.preventDefault();artOnly=true;(e.target as HTMLElement).setPointerCapture(e.pointerId);};get('artOnly').onpointerup=()=>artOnly=false;get('artOnly').onpointercancel=()=>artOnly=false;
const screen=(e:MouseEvent)=>{const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};};
const world=(p:Point)=>({x:(p.x-pan.x)/zoom,y:(p.y-pan.y)/zoom});
canvas.oncontextmenu=e=>e.preventDefault();canvas.addEventListener('wheel',e=>{e.preventDefault();const p=screen(e),q=world(p);zoom=Math.max(fitScale()*.6,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));pan={x:p.x-q.x*zoom,y:p.y-q.y*zoom};},{passive:false});
canvas.onpointerdown=e=>{canvas.focus();const p=screen(e);if(e.button===1||e.button===2){drag={start:p,pan:{...pan}};canvas.setPointerCapture(e.pointerId);follow=false;updateFollow();return;}probe=world(p);if(e.altKey){const note=prompt('标记待调整的描边位置','边缘 / 窄路待核对');if(note){notes.push({...probe,floor,note});renderNotes();}}else if(e.shiftKey&&valid(floor,probe)){transition.cancel();cat={...probe};height=0;}};
canvas.onpointermove=e=>{const p=screen(e);if(drag)pan={x:drag.pan.x+p.x-drag.start.x,y:drag.pan.y+p.y-drag.start.y};else probe=world(p);};canvas.onpointerup=()=>drag=null;canvas.onpointercancel=()=>drag=null;
function renderNotes(){get('notes').replaceChildren();notes.forEach((p,i)=>{const b=document.createElement('button');b.textContent=`${i+1}. ${p.floor} · ${p.note}`;b.onclick=()=>relocate(p,p.floor);get('notes').append(b);});}
window.addEventListener('keydown',e=>{if((e.target as HTMLElement)?.matches('input,textarea,select'))return;const k=e.key.toLowerCase();if(k==='tab'){e.preventDefault();artOnly=true;return;}if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','c','f','e'].includes(k))e.preventDefault();if(!e.repeat&&(k==='c'||k==='f')){traverse(k);return;}if(k==='e'&&!e.repeat){const p=marketItems.filter(p=>['crow','pigeon','momo','boss','exit'].includes(p.id)&&p.layer===floor).map(p=>({p,d:Math.hypot(p.x-cat.x,p.y-cat.y)})).sort((a,b)=>a.d-b.d)[0];message=p&&p.d<75?`${p.p.label} · 预览只核对可接近性，不结算事件或战斗。`:'附近没有固定事件。';}keys.add(k);});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key==='Tab')artOnly=false;});window.addEventListener('blur',()=>{keys.clear();drag=null;artOnly=false;});
function download(name:string,blob:Blob){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
get('exportImage').onclick=()=>canvas.toBlob(b=>{if(b)download(`chapter2-${floor}-${mode()}.png`,b);});get('exportNotes').onclick=()=>download('chapter2-trace-review.json',new Blob([JSON.stringify({previewOnly:true,notes,traceProfile:'trace-profile.json',audit},null,2)],{type:'application/json'}));
function label(text:string,p:Point,color='#e8f6eb'){ctx.font=`${11/zoom}px "Microsoft YaHei",system-ui`;ctx.textBaseline='middle';const w=ctx.measureText(text).width+10/zoom;ctx.fillStyle='#0d1c2ae0';ctx.fillRect(p.x+8/zoom,p.y-21/zoom,w,18/zoom);ctx.fillStyle=color;ctx.fillText(text,p.x+13/zoom,p.y-12/zoom);}
function render(){
  const d=devicePixelRatio||1;ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#071019';ctx.fillRect(0,0,size.width,size.height);ctx.translate(pan.x,pan.y);ctx.scale(zoom,zoom);ctx.imageSmoothingEnabled=true;
  const image=images[floor];if(image.complete&&image.naturalWidth)ctx.drawImage(image,0,0,1672,941);
  if(floor==='L0')paintMarketCargo(ctx);
  if(!artOnly&&['stalls','north-curb','island-curb'].includes(focusName??'')&&floor==='L0'){
    for(const solid of nightMarketSpatial.solids.filter(s=>'id' in s)){
      if(solid.type!=='poly')continue;
      ctx.beginPath();solid.pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();
      ctx.fillStyle='#ffad5920';ctx.fill();ctx.strokeStyle='#ffad59';ctx.lineWidth=1.5/zoom;ctx.stroke();
    }
  }
  if(!artOnly){
    ctx.save();ctx.globalAlpha=Number(get<HTMLInputElement>('opacity').value)/100;ctx.imageSmoothingEnabled=false;
    if(checked('showMask')){if(mode()==='difference'){ctx.drawImage(removed,0,0,cols*2,rows*2);ctx.drawImage(added,0,0,cols*2,rows*2);}else ctx.drawImage(candidate()?candidateView.canvas:currentView.canvas,0,0,cols*2,rows*2);}
    if(checked('raw'))ctx.drawImage(clearance,0,0,cols*2,rows*2);ctx.restore();
    if(checked('showMask')){ctx.strokeStyle='#60e7ca';ctx.lineWidth=1/zoom;ctx.stroke(candidate()?candidateView.boundary:currentView.boundary);}
    if(checked('raw')){ctx.strokeStyle='#ffc977';ctx.lineWidth=1/zoom;ctx.stroke(rawBoundary);}
    if(checked('routes'))for(const [,points] of nightMarketSpatial.R[floor]){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle='#a9b0ff';ctx.lineWidth=1/zoom;ctx.setLineDash([5/zoom,4/zoom]);ctx.stroke();ctx.setLineDash([]);}
    if(checked('anchors')){
      for(const item of marketItems.filter(p=>p.layer===floor&&['entry','crow','pigeon','momo','boss','exit'].includes(p.id))){ctx.beginPath();ctx.arc(item.x,item.y,5/zoom,0,Math.PI*2);ctx.fillStyle='#fff09c';ctx.fill();label(item.label,item);}
      for(const p of marketPortals)for(const q of [p.a,p.b])if(q.layer===floor){ctx.beginPath();ctx.arc(q.x,q.y,6/zoom,0,Math.PI*2);ctx.fillStyle=p.requiresFlag&&!cleared()?'#9a9b9b':'#7ee6ef';ctx.fill();label(`${p.key.toUpperCase()} · ${p.id}`,q,'#b4f6f5');}
      if(floor==='L0'){for(const o of nightMarketSpatial.actionObstacles){ctx.beginPath();ctx.moveTo(o.a[0],o.a[1]);ctx.lineTo(o.b[0],o.b[1]);ctx.lineWidth=o.radius*2;ctx.strokeStyle='#e7a16c77';ctx.stroke();}const b=nightMarketSpatial.battleBarrier;ctx.beginPath();ctx.moveTo(b.a[0],b.a[1]);ctx.lineTo(b.b[0],b.b[1]);ctx.lineWidth=b.radius*2;ctx.strokeStyle='#e7a16c77';ctx.stroke();}
    }
    for(const [i,p] of notes.entries())if(p.floor===floor){ctx.beginPath();ctx.arc(p.x,p.y,8/zoom,0,Math.PI*2);ctx.lineWidth=2/zoom;ctx.strokeStyle='#ffd370';ctx.stroke();label(String(i+1),p,'#ffd370');}
    if(probe){ctx.strokeStyle=valid(floor,probe)?'#9bffde':'#ff7a91';ctx.lineWidth=1/zoom;ctx.beginPath();ctx.moveTo(probe.x-6/zoom,probe.y);ctx.lineTo(probe.x+6/zoom,probe.y);ctx.moveTo(probe.x,probe.y-6/zoom);ctx.lineTo(probe.x,probe.y+6/zoom);ctx.stroke();}
  }
  ctx.save();ctx.translate(cat.x-16,cat.y-30-height);ctx.scale(.5,.5);drawPixelCat(ctx,'miaomiao');ctx.restore();
  if(checked('footprint')&&!artOnly){ctx.beginPath();ctx.arc(cat.x,cat.y,10,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=1/zoom;ctx.stroke();}
}
function frame(now:number){const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
  if(transition.active){const t=transition.advance(dt*1000);if(t){cat={x:t.x,y:t.y};height=t.height;if(floor!==t.floor){floor=t.floor;get<HTMLSelectElement>('floor').value=floor;buildViews();}if(t.done){height=0;message=marketExitAt(floor,cat.x,cat.y,flags())?'已到第三章出口范围；预览不切换章节。':'已抵达连接点的合法站位。';}}}
  else{const dx=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a')),dy=Number(keys.has('arrowdown')||keys.has('s'))-Number(keys.has('arrowup')||keys.has('w')),n=Math.hypot(dx,dy);if(n)cat=move(cat,{x:dx/n*180*dt,y:dy/n*180*dt});}
  if(follow)pan={x:size.width/2-cat.x*zoom,y:size.height/2-cat.y*zoom};render();
  if(now-lastInfo>120){lastInfo=now;if(probe)get('probe').textContent=`PNG / 世界 ${probe.x.toFixed(1)}, ${probe.y.toFixed(1)}\n当前：${isMarketTraversable(floor,probe.x,probe.y,cleared())?'可走':marketMovementBlockReason(floor,probe.x,probe.y,cleared())}\n候选：${valid(floor,probe,true)?'可走':'描边或保留障碍阻挡'}`;get('status').textContent=`测试猫 ${floor} · ${cat.x.toFixed(1)}, ${cat.y.toFixed(1)}\n${message}`;canvas.dataset.floor=floor;canvas.dataset.catX=String(cat.x);canvas.dataset.catY=String(cat.y);canvas.dataset.previewOnly='true';}
  requestAnimationFrame(frame);
}
buildViews();const start=nearest('L0',cat);if(start)cat=start;
if(focusName==='north-curb'||focusName==='island-bend'){get<HTMLInputElement>('raw').checked=true;get<HTMLInputElement>('anchors').checked=false;relocate(focusName==='north-curb'?{x:935,y:178}:{x:840,y:533},'L0');center(focusCenter!,5);message='黄线：铺装路缘；青线：预留猫咪碰撞半径后的可走中心。北侧街面与花坛转角已按路缘放宽，原有实物障碍与 C / F 连接保持。';}
if(focusName==='island-curb'){get<HTMLInputElement>('anchors').checked=false;relocate({x:1090,y:316},'L0');center(focusCenter!,5);message='条纹棚花坛：橙线为实物落地碰撞，青线为可走中心；已向内收回左侧碰撞，使猫咪能沿路缘通行。';}
if(focusName==='stalls'){get<HTMLInputElement>('anchors').checked=false;relocate({x:1025,y:236},'L0');center(focusCenter!,4);message='橙线：两处实物障碍的落地轮廓；青线：已留出猫咪碰撞半径的可走中心区域。此处缝隙已小幅放宽；WASD / 方向键试走，按住 Tab 对照原图。';}
if(focusName==='south-curb'){get<HTMLInputElement>('raw').checked=true;get<HTMLInputElement>('anchors').checked=false;relocate({x:865,y:717},'L0');center({x:902,y:706},5);message='本轮重描两侧路缘。黄线为铺装边缘，青色为保留 10px 碰撞余量后的猫咪中心区域。';}
if(focusName==='junction'){get<HTMLInputElement>('raw').checked=true;get<HTMLInputElement>('anchors').checked=false;relocate({x:795,y:610},'L0');center(focusCenter!,5);message='Pavement bend retraced; internal seams removed. Cat collision radius remains 10px.';}
if(focusName==='nw-roof'){get<HTMLInputElement>('raw').checked=true;relocate({x:700,y:257},'L1');center(focusCenter!,5);message='L1 northwest roof: straight-up clearance from the right side of the C landing; anchors unchanged.';}
Object.assign(window,{marketTraceReview:{getCat:()=>({...cat,floor}),valid,nearest,move:(p:Point,d:Point)=>move(p,d),portals:marketPortals,items:marketItems,audit,transition,traverse,relocate,currentMasks:originalMasks,candidateMasks,mode,cleared,getFloor:()=>floor}});
requestAnimationFrame(frame);
