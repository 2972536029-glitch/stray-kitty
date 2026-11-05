import './style.css';
import * as alleyEngine from '../../web/src/modules/battle/chapter/engine';
import * as marketEngine from '../../web/src/modules/battle/market/engine';
import * as greenhouseEngine from '../../web/src/modules/battle/greenhouse/engine';
import * as tunnelEngine from '../../web/src/modules/battle/tunnel/engine';
import * as finaleEngine from '../../web/src/modules/battle/finale/engine';
import * as alleyPainter from '../../web/src/modules/battle/chapter/painter';
import * as marketPainter from '../../web/src/modules/battle/market/painter';
import * as greenhousePainter from '../../web/src/modules/battle/greenhouse/painter';
import * as tunnelPainter from '../../web/src/modules/battle/tunnel/painter';
import * as finalePainter from '../../web/src/modules/battle/finale/painter';
import * as alleyConfig from '../../web/src/modules/battle/chapter/config';
import * as marketConfig from '../../web/src/modules/battle/market/config';
import * as greenhouseConfig from '../../web/src/modules/battle/greenhouse/config';
import * as tunnelConfig from '../../web/src/modules/battle/tunnel/config';
import * as finaleConfig from '../../web/src/modules/battle/finale/config';
import {paintIllustratedRoom} from '../../web/src/modules/battle/illustrated-room';
import {createBattleGeometry,footprintDistance} from '../../web/src/modules/battle/shared/geometry';

// This isolated viewer imports the production painters; it never opens a game
// session or calls the API. Only these in-memory visual fixtures are arranged.
type State = ReturnType<typeof alleyEngine.createChapterBattle | typeof marketEngine.createMarketBattle | typeof greenhouseEngine.createGreenhouseBattle | typeof tunnelEngine.createTunnelBattle | typeof finaleEngine.createFinaleBattle>;
type Point = {x:number;y:number};
type Actor = Point & {id:string;name:string;role?:string;range?:unknown};
const chapters = {
  alley:{label:'第一章 · 小巷',create:alleyEngine.createChapterBattle,paint:alleyPainter.paintChapter,config:alleyConfig},
  market:{label:'第二章 · 夜市',create:marketEngine.createMarketBattle,paint:marketPainter.paintMarket,config:marketConfig},
  greenhouse:{label:'第三章 · 温室',create:greenhouseEngine.createGreenhouseBattle,paint:greenhousePainter.paintGreenhouse,config:greenhouseConfig},
  tunnel:{label:'第四章 · 通道',create:tunnelEngine.createTunnelBattle,paint:tunnelPainter.paintTunnel,config:tunnelConfig},
  finale:{label:'第五章 · 仓库',create:finaleEngine.createFinaleBattle,paint:finalePainter.paintFinale,config:finaleConfig},
};
type Chapter = keyof typeof chapters;
const names:Record<string,[string,string]> = {
  caster:['绒绒','星绒弹 · 紫白星屑'],guard:['斑斑','罐盾击 · 青白碎光'],tuanzi:['团子','橘影爪 · 三道爪痕'],
  diandian:['点点','暖光弹 · 柔和碎光'],bruiser:['栗栗','重盾击 · 铜色冲击'],controller:['铃铃','银铃波 · 银青音纹'],
  momo:['墨墨','巡光弹 · 青蓝光芒'],taotao:['桃桃（援军）','聚光弹 · 琥珀闪点'],boss:['首领普攻',''],
};
const bossDescriptions:Record<Chapter,string>={alley:'路障扫击 · 橙红冲击',market:'灯杖点刺 · 提灯余焰',greenhouse:'荆枝鞭击 · 刺叶碎屑',tunnel:'装甲重击 · 青色火花',finale:'永夜挥击 · 紫黑爪弧'};
document.querySelector('#app')!.innerHTML=`<main><header><div><div class="eyebrow">STRAY KITTY / COMBAT STUDY</div><h1>每一次出手，都有自己的样子</h1><p>猫咪与首领的普通攻击 · 本地视觉小样</p></div><span class="tag">独立演示 · 不修改游戏存档</span></header><nav class="chapters" aria-label="选择章节"></nav><div class="layout"><aside class="panel"><h2>选择出手角色</h2><div class="actors" aria-label="选择攻击者"></div><div class="legend"><strong>同一套实际地图与绘制代码</strong><br>一次展示一个攻击，循环回放。<br>可暂停或拖动进度查看细节。</div></aside><section class="panel"><div class="board-header"><div><h3 id="title"></h3><p id="description"></p></div><span class="tag" id="scene"></span></div><div class="board-wrap"><canvas id="board" aria-label="战斗普攻视觉预览"></canvas></div><div class="controls"><button id="play">暂停</button><button id="replay">重新播放</button><input id="progress" type="range" min="0" max="400" value="0" aria-label="攻击动画进度"><span class="time" id="time">0 ms</span></div><div class="caption"><span>仅回放普攻反馈；演示站位不代表战斗关卡配置。</span><span>0.4 秒 / 次 · 不增加震屏</span></div></section></div></main>`;
const canvas=document.querySelector<HTMLCanvasElement>('#board')!,ctx=canvas.getContext('2d')!;
const backdrop=document.createElement('canvas'),backdropContext=backdrop.getContext('2d')!;
const slider=document.querySelector<HTMLInputElement>('#progress')!,playButton=document.querySelector<HTMLButtonElement>('#play')!;
let chapter:Chapter='alley',actorId='tuanzi',base:State,baseSnapshot='',clock=.12,playing=true,lastTime=performance.now();
let targetMode:'near'|'edge'='near';
let source:Actor,target:Actor,kind='attack',frames=0,mutated=false;
const paintedImages=new Map<string,{width:number;height:number;draws:number}>();
const nativeDrawImage=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(...args:Parameters<CanvasRenderingContext2D['drawImage']>){
  const image=args[0];
  if(image instanceof HTMLImageElement&&image.complete&&image.naturalWidth){const url=new URL(image.src).pathname,old=paintedImages.get(url);paintedImages.set(url,{width:image.naturalWidth,height:image.naturalHeight,draws:(old?.draws??0)+1});}
  return Reflect.apply(nativeDrawImage,this,args);
} as CanvasRenderingContext2D['drawImage'];
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;
const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const targetControls=document.createElement('div');targetControls.className='target-controls';
targetControls.innerHTML='<div><button data-target-mode="near">近距离</button><button data-target-mode="edge">射程边缘</button></div><span id="target-description"></span>';
document.querySelector('.board-wrap')!.before(targetControls);
function actors(){return [...base.cats,...('allies'in base?base.allies.filter(ally=>ally.damage>0):[])] as Actor[];}
function prepare(){
  base=chapters[chapter].create();
  if('allies'in base)for(const ally of base.allies)ally.status='active';
  base.phase='battle';
  base.elapsed=1;
  const all=actors(),boss=base.boss;
  if(actorId==='boss'){
    // These are existing active main cats, checked with the engine's actual
    // footprint metric. No target is moved or placed outside the real range.
    const eligible=base.cats.filter(cat=>cat.status==='active'&&footprintDistance(boss,cat)<=chapters[chapter].config.RULES.bossRange);
    const ordered=targetMode==='near'?eligible.toSorted((a,b)=>distance(a,boss)-distance(b,boss))
      :eligible.toSorted((a,b)=>footprintDistance(boss,b)-footprintDistance(boss,a));
    if(!ordered.length)throw new Error('This preview has no valid boss target');
    source={...boss};target={...ordered[0]};kind='boss-attack';
  }else{
    source={...(all.find(cat=>cat.id===actorId)??all[0])};actorId=source.id;
    const config=chapters[chapter].config;
    const mainCat=base.cats.find(cat=>cat.id===actorId);
    const candidates=(mainCat?createBattleGeometry(config.CELLS,config.MAP.obstacles).attackCells(mainCat):config.CELLS)
      .filter(p=>!config.MAP.obstacles.some(q=>same(p,q))&&!config.MAP.bossCells.some(q=>same(p,q))&&!same(p,config.MAP.goal));
    // Prefer a clear tile inside the actual attack range. When a melee cat is
    // surrounded, omit the other cat on that valid tile from this visual fixture
    // instead of inventing a distant attack. Production placement is untouched.
    const preferred={x:source.x+(source.range==='ranged'||actorId==='taotao'||actorId==='controller'?2:1),y:source.y};
    const clear=candidates.filter(p=>!all.some(q=>same(p,q)));
    const adjacent=candidates.filter(p=>!same(p,source));
    const point=(clear.length?clear:adjacent.length?adjacent:candidates).toSorted((a,b)=>distance(a,preferred)-distance(b,preferred))[0];
    if(!point)throw new Error('This preview has no valid attack target');
    target={id:'preview-shadow',name:'演示目标',...point};
    const enemy={...target,kind:'scout',hp:100,maxHp:100,route:'upper',pathIndex:0,slowRemaining:0,slowMultiplier:1,damage:9,speed:.55,interval:1.4,cooldown:0,blockedBy:null};
    base.enemies=[enemy] as State['enemies'];
    kind='allies'in base&&base.allies.some(cat=>cat.id===actorId)?'ally-attack':'attack';
  }
  baseSnapshot=JSON.stringify(base);mutated=false;
  canvas.width=chapters[chapter].config.MAP.columns*80;canvas.height=chapters[chapter].config.MAP.rows*80;
  backdrop.width=canvas.width;backdrop.height=canvas.height;
  document.querySelector('#title')!.textContent=actorId==='boss'?base.boss.name:names[actorId][0];
  document.querySelector('#description')!.textContent=actorId==='boss'?bossDescriptions[chapter]:names[actorId][1];
  document.querySelector('#scene')!.textContent=chapters[chapter].label;
  targetControls.hidden=actorId!=='boss';
  for(const button of targetControls.querySelectorAll<HTMLButtonElement>('[data-target-mode]'))button.setAttribute('aria-pressed',String(button.dataset.targetMode===targetMode));
  document.querySelector('#target-description')!.textContent=actorId==='boss'?`目标：${target.name} · 距首领 ${footprintDistance(boss,target)} 格 / 射程 ${chapters[chapter].config.RULES.bossRange} 格`:'';
  document.querySelector('.chapters')!.innerHTML=Object.entries(chapters).map(([id,item])=>`<button data-chapter="${id}" aria-pressed="${id===chapter}">${item.label}</button>`).join('');
  document.querySelector('.actors')!.innerHTML=['boss',...all.map(cat=>cat.id)].map(id=>`<button data-actor="${id}" aria-pressed="${id===actorId}">${id==='boss'?'首领普攻':names[id][0]}<small>${id==='boss'?bossDescriptions[chapter]:names[id][1]}</small></button>`).join('');
  clock=.12;draw();
}
function draw(){
  const remaining=Math.max(0,.4-clock);
  const effect={id:1,kind,from:{...source},to:{...target},remaining};
  const frame={...base,effects:remaining>0?[effect]:[],cats:base.cats
    .filter(cat=>actorId==='boss'||cat.id===actorId||!same(cat,target))
    .map(cat=>({...cat,cooldown:remaining>0&&cat.id===actorId ? .8 : 0}))};
  const painter=chapters[chapter].paint as (ctx:CanvasRenderingContext2D,state:State,selected:null,moveTarget:null)=>void;
  painter(ctx,frame as State,null,null);
  // The production finale has a separate illustrated backdrop beneath its
  // transparent tactical tiles; include that same image in this canvas viewer.
  if(chapter==='finale'){
    backdropContext.clearRect(0,0,backdrop.width,backdrop.height);
    paintIllustratedRoom(backdropContext,backdrop.width,backdrop.height,{x:0,y:0,width:canvas.width,height:canvas.height});
    ctx.save();ctx.globalCompositeOperation='destination-over';ctx.drawImage(backdrop,0,0);ctx.restore();
  }
  frames++;mutated ||= JSON.stringify(base)!==baseSnapshot;
  slider.value=String(Math.round(Math.min(.4,clock)*1000));document.querySelector('#time')!.textContent=`${slider.value} ms`;
  playButton.textContent=playing?'暂停':'播放';
}
function selectChapter(value:Chapter){if(!(value in chapters))throw new Error('Unknown chapter');chapter=value;targetMode='near';prepare();}
function selectActor(value:string){actorId=value;prepare();}
function selectTarget(value:'near'|'edge'){if(value!=='near'&&value!=='edge')throw new Error('Unknown target mode');targetMode=value;prepare();}
function freezeAt(ms:number){playing=false;clock=Math.max(0,Math.min(.4,ms/1000));draw();}
function play(){playing=true;clock=0;lastTime=performance.now();draw();}
function pause(){playing=false;draw();}
document.querySelector('.chapters')!.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-chapter]');if(button)selectChapter(button.dataset.chapter as Chapter);});
document.querySelector('.actors')!.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-actor]');if(button)selectActor(button.dataset.actor!);});
targetControls.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-target-mode]');if(button)selectTarget(button.dataset.targetMode as 'near'|'edge');});
playButton.addEventListener('click',()=>playing?pause():play());
document.querySelector('#replay')!.addEventListener('click',play);slider.addEventListener('input',()=>freezeAt(Number(slider.value)));
const diagnostics=()=>{
  const config=chapters[chapter].config,cat=base.cats.find(cat=>cat.id===actorId);
  return {chapter,actor:actorId,playing,elapsed:clock,kind,source,target,frames,mutated,targetMode,
    targetInAttackRange:cat?createBattleGeometry(config.CELLS,config.MAP.obstacles).attackCells(cat).some(cell=>same(cell,target)):null,
    targetDistance:actorId==='boss'?footprintDistance(base.boss,target):null,bossRange:config.RULES.bossRange,targetMatchesActualCat:base.cats.some(cat=>cat.id===target.id&&same(cat,target)),assets:[...paintedImages].map(([url,data])=>({url,...data})),availableActors:['boss',...actors().map(cat=>cat.id)]};
};
Object.assign(window,{attackFxPreview:{selectChapter,selectActor,selectTarget,freezeAt,play,pause,diagnostics}});
prepare();
function animate(now:number){const delta=Math.min(.1,(now-lastTime)/1000);lastTime=now;if(playing)clock=(clock+delta)%1.15;draw();requestAnimationFrame(animate);}
requestAnimationFrame(animate);
