import './style.css';
import {drawChapterCat} from '../../web/src/modules/battle/chapter/painter';
import {drawMarketCat} from '../../web/src/modules/battle/market/painter';
import {drawTunnelCat} from '../../web/src/modules/battle/tunnel/painter';
import {paintFinale} from '../../web/src/modules/battle/finale/painter';
import {createFinaleBattle} from '../../web/src/modules/battle/finale/engine';
import {MAP as FINALE_MAP} from '../../web/src/modules/battle/finale/config';

// Local drawing study only. These in-memory fixtures never open a game session.
const roles = [
  ['caster','绒绒','举杖 · 点出星光'], ['guard','斑斑','收盾 · 向前推盾'],
  ['tuanzi','团子','抬爪 · 挥爪'], ['diandian','点点','抬手 · 推出暖光'],
  ['bruiser','栗栗','蓄力 · 短促盾击'], ['controller','铃铃','抬腕 · 摇铃'],
  ['momo','墨墨','提灯 · 送出光芒'], ['taotao','桃桃','抬手 · 发出聚光'],
] as const;
const base = createFinaleBattle();
for (const ally of base.allies) ally.status='active';
base.cats=[];base.enemies=[];base.phase='battle';base.elapsed=1;
const original=JSON.stringify(base),source=base.allies.find(a=>a.id==='taotao')!;
const board=document.createElement('canvas');board.width=FINALE_MAP.columns*80;board.height=FINALE_MAP.rows*80;
const boardContext=board.getContext('2d')!;
let playing=true,ms=0,last=performance.now(),mutated=false;
document.querySelector('#app')!.innerHTML=`<main class="paw-study"><header><div><div class="eyebrow">STRAY KITTY / CAT ACTIONS</div><h1>一起出招的小猫咪</h1><p>身体轻轻前探，小爪子抬起、出手，再一起收回。</p></div><a href="./" class="tag">去战场看效果 →</a></header><div class="controls"><button id="play">暂停</button><button id="replay">重新播放</button><input id="progress" type="range" min="0" max="400" value="0" aria-label="动作进度"><span id="time" class="time">0 ms</span></div><section class="paw-grid">${roles.map(([id,name,description])=>`<article class="panel"><div class="paw-title"><h2>${name}</h2><span>${description}</span></div><canvas id="paw-${id}" width="240" height="216" aria-label="${name}手部动作"></canvas></article>`).join('')}</section><p class="paw-caption">身体前探配合手掌与手持物 · 可暂停，拖动进度观察完整出手</p></main>`;
const sheet=document.createElement('style');sheet.textContent='.paw-study{max-width:1190px}.paw-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:20px}.paw-title{display:flex;flex-direction:column;gap:4px}.paw-title h2{font-size:20px;color:#f0d69f;margin:0}.paw-title span{font-size:12px;color:#aebdc0}.paw-grid canvas{background:transparent}.paw-caption{font-size:12px;margin-top:18px}@media(max-width:800px){.paw-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.paw-grid .panel{padding:12px}}';document.head.append(sheet);
function draw(){
  const progress=ms>=400?undefined:ms/400,active=progress!==undefined;
  for(const [id] of roles){
    const canvas=document.querySelector<HTMLCanvasElement>('#paw-'+id)!,ctx=canvas.getContext('2d')!;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
    if(id==='taotao'){
      const frame={...base,effects:active?[{id:1,kind:'ally-attack' as const,from:{...source},to:{x:source.x+2,y:source.y},remaining:.4*(1-progress)}]:[]};
      paintFinale(boardContext,frame,null,null);
      ctx.drawImage(board,source.x*80,source.y*80,80,72,0,0,240,216);
    }else if(id==='caster'||id==='guard'||id==='tuanzi'||id==='diandian') drawChapterCat(ctx,id,24,12,192,false,active,progress);
    else if(id==='bruiser'||id==='controller')drawMarketCat(ctx,id,24,12,192,active,progress);
    else drawTunnelCat(ctx,'momo',24,12,192,active,progress);
  }
  mutated ||= JSON.stringify(base)!==original;
  document.querySelector<HTMLInputElement>('#progress')!.value=String(Math.round(Math.min(ms,400)));
  document.querySelector('#time')!.textContent=Math.round(Math.min(ms,400))+' ms';
  document.querySelector('#play')!.textContent=playing?'暂停':'播放';
}
function freezeAt(value:number){playing=false;ms=Math.max(0,Math.min(400,value));draw();}
function play(){playing=true;ms=0;last=performance.now();draw();}
function pause(){playing=false;draw();}
document.querySelector('#play')!.addEventListener('click',()=>playing?pause():play());
document.querySelector('#replay')!.addEventListener('click',play);
document.querySelector<HTMLInputElement>('#progress')!.addEventListener('input',event=>freezeAt(Number((event.target as HTMLInputElement).value)));
Object.assign(window,{catPawPreview:{freezeAt,play,pause,diagnostics:()=>({playing,ms,mutated,roles:roles.map(r=>r[0])})}});
function animate(now:number){const elapsed=Math.min(100,now-last);last=now;if(playing)ms=(ms+elapsed)%1250;draw();requestAnimationFrame(animate);}draw();requestAnimationFrame(animate);
