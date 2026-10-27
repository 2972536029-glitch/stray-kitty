import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {KeyboardEvent, PointerEvent} from 'react';
import type {BattleDifficulty, ChapterAction, ChapterCat, ChapterCatId, ChapterState, Position} from './types';
import {CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, RULES, SKILLS, WAVES} from './config';
import {advanceChapter, createChapterBattle, dispatchChapter, getAttackCells, getBossCells, getChapterAdvice, getChapterSpeed, getDeployError, getSkillCells, isDeployableCell} from './engine';
import {BOARD_HEIGHT, BOARD_WIDTH, cellName, mapCell, obstacleCell, paintChapter} from './painter';
import {drawCat} from '../l00/painter';
import {getChapterAnswer} from './advisor';
import {CAT_PRESENTATION} from './presentation';
import {CarryPanel} from '../CarryPanel';
import {BattleSceneBackdrop} from '../BattleSceneBackdrop';
import {useBattleBoardFit} from '../useBattleBoardFit';
import '../carry.css';
import '../l00/battle.css';
import './chapter.css';

export interface ChapterBattleResult {
  outcome: 'won' | 'lost'; report: {leaks:number;bossDefeated:boolean};
}
export interface ChapterBattleViewportProps {
  attemptId: string; difficulty: BattleDifficulty; carry?: unknown; paused: boolean;
  onResult: (result:ChapterBattleResult)=>void;
}
interface DragGesture {catId:ChapterCatId;pointerId:number;startX:number;startY:number;moved:boolean}
const ICONS:Record<ChapterCatId,string>={caster:'✧',guard:'◈',tuanzi:'✦',diandian:'♡'};

function RoleBadge({id}:{id:ChapterCatId}){
  return <span className="chapter-role-badge" data-role={CAT_PRESENTATION[id].label}>{CAT_PRESENTATION[id].label}</span>;
}
function AdvisorPortrait(){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const context=ref.current?.getContext('2d');if(context)drawCat(context,'advisor',0,0,96);},[]);
  return <canvas ref={ref} width={96} height={96} className="btl-portrait" aria-hidden="true"/>;
}
function Health({cat}:{cat:ChapterCat}){
  return <div className="chapter-cat-meters">
    <span className="chapter-cat-hp" role="meter" aria-label={`${cat.name}体力`} aria-valuemin={0} aria-valuemax={cat.maxHp} aria-valuenow={Math.ceil(cat.hp)}><i style={{width:`${100*cat.hp/cat.maxHp}%`}}/></span>
    <span className={`chapter-cat-energy${cat.energy>=100?' is-full':''}`} role="meter" aria-label={`${cat.name}能量`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={cat.energy}><i style={{width:`${cat.energy}%`}}/></span>
  </div>;
}

/** A single local simulation owns the attempt. Host state updates do not recreate its board. */
export function ChapterBattleViewport({attemptId,difficulty,carry,paused,onResult}:ChapterBattleViewportProps){
  const [game,setGame]=useState(()=>createChapterBattle({difficulty,carry}));
  const gameRef=useRef(game);
  const [selected,setSelected]=useState<ChapterCatId|null>(null);
  const [moving,setMoving]=useState<ChapterCatId|null>(null);
  const [hover,setHover]=useState<Position|null>(null);
  const [chatOpen,setChatOpen]=useState(false);
  const [retreatOpen,setRetreatOpen]=useState(false);
  const [dragging,setDragging]=useState<ChapterCatId|null>(null);
  const [hidden,setHidden]=useState(document.hidden);
  const [notice,setNotice]=useState('');
  const [submitted,setSubmitted]=useState(false);
  const [overview,setOverview]=useState(()=>window.innerWidth>=700);
  const [menuPosition,setMenuPosition]=useState({left:0,top:0});
  const [tooltipPosition,setTooltipPosition]=useState({left:0,top:0});
  const [skillTooltipOpen,setSkillTooltipOpen]=useState(false);
  const [question,setQuestion]=useState('');
  const [messages,setMessages]=useState<Array<{question:string;answer:ReturnType<typeof getChapterAnswer>}>>([]);
  const canvasRef=useRef<HTMLCanvasElement>(null),boardRef=useRef<HTMLDivElement>(null),scrollRef=useRef<HTMLDivElement>(null);
  const fittedWidth=useBattleBoardFit(scrollRef,MAP.columns,MAP.rows);
  const battlefieldRef=useRef<HTMLDivElement>(null),menuRef=useRef<HTMLDivElement>(null);
  const tooltipRef=useRef<HTMLDivElement>(null);
  const chatLogRef=useRef<HTMLDivElement>(null);
  const previousSelectedStatus=useRef<{id:ChapterCatId;status:ChapterCat['status']}|null>(null);
  const attemptRef=useRef(attemptId),gesture=useRef<DragGesture|null>(null),suppressClick=useRef(false);
  const aimPointer=useRef<number|null>(null);
  const emitted=useRef(false),callbackRef=useRef(onResult);callbackRef.current=onResult;
  const hostPauseRef=useRef(paused);hostPauseRef.current=paused;
  const selectedRef=useRef(selected);selectedRef.current=selected;
  const hoverRef=useRef(hover);hoverRef.current=hover;
  const uiPauseRef=useRef(false);uiPauseRef.current=chatOpen||retreatOpen||!!dragging;

  function publish(next:ChapterState){gameRef.current=next;setGame(next);return next;}
  function act(action:ChapterAction){
    const next=publish(dispatchChapter(gameRef.current,action));
    if(next.lastAction&&!next.lastAction.ok)setNotice(next.lastAction.message);
    else if(action.type!=='AIM_SKILL'&&action.type!=='SET_UI_PAUSE')setNotice('');
    return next;
  }
  function closeInspection(){act({type:'CLOSE_INSPECTION'});setSelected(null);setMoving(null);}
  function cancelAim(){act({type:'CANCEL_SKILL'});setHover(null);}
  function inspect(id:ChapterCatId){
    if(paused||hidden||chatOpen)return;
    setMoving(null);setSelected(id);setSkillTooltipOpen(false);
    if(gameRef.current.cats.find(cat=>cat.id===id)?.status==='retired')act({type:'CLOSE_INSPECTION'});
    else act({type:'INSPECT',catId:id});
  }
  function chooseSkill(id:ChapterCatId){
    if(paused||hidden||chatOpen)return;
    setMoving(null);setSelected(id);
    const next=act({type:'SELECT_SKILL',catId:id});
    if(!next.aim&&next.lastAction?.ok){setSelected(null);act({type:'CLOSE_INSPECTION'});}
    else if(next.aim)requestAnimationFrame(()=>boardRef.current?.focus({preventScroll:true}));
  }
  function confirmAim(position:Position){
    const aim=gameRef.current.aim;if(!aim)return;
    const next=act({type:'CAST_SKILL',catId:aim.catId,target:position});
    if(next.lastAction?.ok){setSelected(null);setHover(null);}
  }
  function showMapArea(area:'goal'|'branch'|'boss'){
    setOverview(false);
    requestAnimationFrame(()=>{
      const node=scrollRef.current;if(!node)return;
      const left=area==='boss'?node.scrollWidth:area==='branch'?node.scrollWidth*(MAP.spawns[2].x+.5)/MAP.columns-node.clientWidth/2:0;
      node.scrollTo({left:Math.max(0,left),behavior:'smooth'});
    });
  }
  function startOrToggle(){
    if(gameRef.current.phase==='ready'){
      act({type:'START'});
    }else act({type:'PAUSE'});
  }

  useEffect(()=>{
    if(attemptRef.current===attemptId)return;
    attemptRef.current=attemptId;emitted.current=false;setSubmitted(false);
    setSelected(null);setMoving(null);setHover(null);setChatOpen(false);setDragging(null);setNotice('');
    setQuestion('');setMessages([]);
    publish(createChapterBattle({difficulty,carry}));
  },[attemptId,difficulty,carry]);

  useEffect(()=>{
    if(paused){setSelected(null);setMoving(null);setHover(null);setDragging(null);gesture.current=null;}
    publish(dispatchChapter(gameRef.current,{type:'SET_EXTERNAL_PAUSE',paused:paused||document.hidden}));
  },[paused]);
  useEffect(()=>{publish(dispatchChapter(gameRef.current,{type:'SET_UI_PAUSE',paused:chatOpen||retreatOpen||!!dragging}));},[chatOpen,retreatOpen,dragging]);

  useEffect(()=>{
    let stopped=false,handle=0,last=performance.now(),lastRender=0;
    const visibility=()=>{
      last=performance.now();setHidden(document.hidden);
      publish(dispatchChapter(gameRef.current,{type:'SET_EXTERNAL_PAUSE',paused:hostPauseRef.current||document.hidden}));
    };
    document.addEventListener('visibilitychange',visibility);
    const frame=(time:number)=>{
      if(stopped)return;
      const dt=Math.max(0,Math.min(1,(time-last)/1000));last=time;
      let current=gameRef.current;
      const frozen=hostPauseRef.current||document.hidden;
      if(current.externallyPaused!==frozen)current=dispatchChapter(current,{type:'SET_EXTERNAL_PAUSE',paused:frozen});
      if(current.uiPaused!==uiPauseRef.current)current=dispatchChapter(current,{type:'SET_UI_PAUSE',paused:uiPauseRef.current});
      current=advanceChapter(current,dt);gameRef.current=current;
      const context=canvasRef.current?.getContext('2d');if(context)paintChapter(context,current,selectedRef.current,hoverRef.current);
      if(time-lastRender>=50){setGame(current);lastRender=time;}
      handle=requestAnimationFrame(frame);
    };
    handle=requestAnimationFrame(frame);
    return()=>{stopped=true;cancelAnimationFrame(handle);document.removeEventListener('visibilitychange',visibility);};
  },[]);

  useEffect(()=>{
    if((game.phase==='won'||game.phase==='lost')&&!paused&&!game.externallyPaused&&!emitted.current){
      emitted.current=true;setSubmitted(true);
      callbackRef.current({outcome:game.phase,report:{leaks:game.leaks,bossDefeated:game.boss.phase==='defeated'}});
    }
  },[game.phase,game.leaks,game.boss.phase,game.externallyPaused,paused]);
  useEffect(()=>{
    const cat=game.cats.find(candidate=>candidate.id===selected),previous=previousSelectedStatus.current;
    if(cat&&previous?.id===cat.id&&previous.status==='active'&&cat.status==='retired')setMoving(null);
    previousSelectedStatus.current=cat?{id:cat.id,status:cat.status}:null;
  },[game.cats,selected]);
  useEffect(()=>{if(chatOpen&&chatLogRef.current)chatLogRef.current.scrollTop=chatLogRef.current.scrollHeight;},[messages,chatOpen]);

  function suppressSyntheticClick(){suppressClick.current=true;}

  function pointAt(clientX:number,clientY:number):Position|null{
    const bounds=boardRef.current?.getBoundingClientRect();if(!bounds)return null;
    if(clientX<bounds.left||clientX>=bounds.right||clientY<bounds.top||clientY>=bounds.bottom)return null;
    const p={x:Math.floor((clientX-bounds.left)/bounds.width*MAP.columns),y:Math.floor((clientY-bounds.top)/bounds.height*MAP.rows)};
    return mapCell(p.x,p.y)?p:null;
  }
  function pointerDown(event:PointerEvent<HTMLElement>,catId:ChapterCatId){
    if(event.button!==0||paused||hidden||chatOpen||gameRef.current.aim)return;
    gesture.current={catId,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event:PointerEvent<HTMLElement>){
    const g=gesture.current;if(!g||g.pointerId!==event.pointerId)return;
    if(!g.moved&&Math.hypot(event.clientX-g.startX,event.clientY-g.startY)>7){g.moved=true;setDragging(g.catId);setSelected(g.catId);act({type:'SET_UI_PAUSE',paused:true});}
    if(g.moved){setHover(pointAt(event.clientX,event.clientY));event.preventDefault();}
  }
  function pointerUp(event:PointerEvent<HTMLElement>){
    const g=gesture.current;
    if(!g||g.pointerId!==event.pointerId){
      if(event.pointerType==='touch'&&!gameRef.current.aim){
        const p=pointAt(event.clientX,event.clientY);if(p)cellClick(p);
        suppressSyntheticClick();
      }
      return;
    }
    gesture.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(null);act({type:'SET_UI_PAUSE',paused:chatOpen});
    if(g.moved){
      suppressSyntheticClick();const p=pointAt(event.clientX,event.clientY);
      if(p){const next=act({type:'MOVE_CAT',catId:g.catId,...p});if(next.lastAction?.ok){setMoving(null);setSelected(null);act({type:'CLOSE_INSPECTION'});}}
      setHover(null);
    }else if(event.pointerType==='touch'){
      const p=pointAt(event.clientX,event.clientY);if(p)cellClick(p);
      suppressSyntheticClick();
    }
  }
  function pointerCancel(){gesture.current=null;setDragging(null);setHover(null);act({type:'SET_UI_PAUSE',paused:chatOpen});}
  function cellClick(position:Position){
    if(suppressClick.current){suppressClick.current=false;return;}
    if(paused||hidden||chatOpen)return;
    if(gameRef.current.aim){confirmAim(position);return;}
    if(moving){
      const next=act({type:'MOVE_CAT',catId:moving,...position});
      if(next.lastAction?.ok)closeInspection();return;
    }
    const cat=gameRef.current.cats.find(c=>c.status==='active'&&c.x===position.x&&c.y===position.y);
    if(cat)inspect(cat.id);else closeInspection();
  }
  function ask(text:string){
    const value=text.trim().slice(0,200);if(!value||paused||hidden)return;
    setMessages(previous=>[...previous,{question:value,answer:getChapterAnswer(gameRef.current,value)}]);setQuestion('');
  }
  function previewTouch(event:PointerEvent<HTMLDivElement>){
    if(aimPointer.current!==event.pointerId||!gameRef.current.aim)return;
    const point=pointAt(event.clientX,event.clientY);setHover(point);act({type:'AIM_SKILL',x:point?.x??-1,y:point?.y??-1});
  }
  function finishTouchAim(event:PointerEvent<HTMLDivElement>,cancelled=false){
    if(aimPointer.current!==event.pointerId)return;
    aimPointer.current=null;if(!cancelled)suppressSyntheticClick();
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    const point=pointAt(event.clientX,event.clientY);if(!cancelled&&point&&gameRef.current.aim)confirmAim(point);else if(gameRef.current.aim){setHover(null);act({type:'AIM_SKILL',x:-1,y:-1});}
  }
  function keyDown(event:KeyboardEvent<HTMLDivElement>){
    if(event.key==='Enter'||event.key===' ')suppressClick.current=false;
    if(event.key==='Escape'){
      event.preventDefault();if(chatOpen)setChatOpen(false);else if(retreatOpen)setRetreatOpen(false);else if(gameRef.current.aim)cancelAim();else closeInspection();return;
    }
    const aim=gameRef.current.aim;if(!aim)return;
    if(event.key==='Enter'&&aim.target){event.preventDefault();confirmAim(aim.target);return;}
    const delta=({ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}} as Record<string,Position>)[event.key];
    if(!delta)return;event.preventDefault();
    const start=aim.target??{x:7,y:3};let p={...start};
    for(let i=0;i<MAP.columns;i++){p={x:p.x+delta.x,y:p.y+delta.y};if(p.x<0||p.y<0||p.x>=MAP.columns||p.y>=MAP.rows)break;if(mapCell(p.x,p.y)&&!obstacleCell(p.x,p.y)){act({type:'AIM_SKILL',...p});setHover(p);boardRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${p.x},${p.y}"]`)?.focus();break;}}
  }
  const ended=game.phase==='won'||game.phase==='lost';
  const chosen=game.cats.find(cat=>cat.id===selected);
  const speed=getChapterSpeed(game);
  const advice=getChapterAdvice(game);
  const bossWindup=game.boss.phase==='windup';
  const bossBasicAttacking=game.boss.phase==='idle'&&game.effects.some(effect=>effect.kind==='boss-attack');
  const remaining=Math.max(0,game.totalEnemies-game.defeated-game.leaks);
  const movingId=moving??dragging;
  const moveProblem=movingId&&hover?getDeployError(game,movingId,hover):null;
  const bossFootprint=getBossCells(game.boss);
  const inspected=chosen?.status==='active'&&game.inspectedCatId===chosen.id&&!game.aim&&!moving&&!dragging&&!chatOpen&&!retreatOpen&&!paused&&!hidden&&!ended?chosen:null;
  const aimCat=game.aim?game.cats.find(cat=>cat.id===game.aim?.catId):null;
  const attackCells=chosen?.status==='active'&&!game.aim?getAttackCells(chosen):[];
  const skillCells=aimCat&&game.aim?.target?getSkillCells(aimCat,game.aim.target):[];
  const canCast=!!inspected&&game.phase==='battle'&&!game.paused&&inspected.energy>=100;

  // Place the menu beside the visible cat, outside the scroll clipping boundary.
  // On a small overview it may sit above the map, but never below the roster.
  useLayoutEffect(()=>{
    if(!inspected)return;
    const update=()=>{
      const field=battlefieldRef.current,board=boardRef.current,scroll=scrollRef.current,menu=menuRef.current;
      if(!field||!board||!scroll||!menu)return;
      const box=field.getBoundingClientRect(),map=board.getBoundingClientRect(),view=scroll.getBoundingClientRect();
      const width=menu.offsetWidth,height=menu.offsetHeight;
      let visibleTop=8,visibleBottom=window.innerHeight-8;
      for(let ancestor=field.parentElement;ancestor;ancestor=ancestor.parentElement){
        if(/auto|scroll|hidden|clip/.test(getComputedStyle(ancestor).overflowY)){
          const clipped=ancestor.getBoundingClientRect();visibleTop=Math.max(visibleTop,clipped.top+6);visibleBottom=Math.min(visibleBottom,clipped.bottom-6);
        }
      }
      const cellWidth=map.width/MAP.columns,cellHeight=map.height/MAP.rows;
      const catLeft=map.left+inspected.x*cellWidth,catTop=map.top+inspected.y*cellHeight;
      const minLeft=Math.max(view.left+5,6),maxLeft=Math.max(minLeft,Math.min(view.right-5,window.innerWidth-6)-width);
      const right=catLeft+cellWidth+8,left=catLeft-width-8;
      const preferred=right<=maxLeft?right:left>=minLeft?left:catLeft+cellWidth/2-width/2;
      const placedLeft=Math.min(maxLeft,Math.max(minLeft,preferred));
      const overlapsCat=placedLeft<catLeft+cellWidth&&placedLeft+width>catLeft;
      const preferredTop=overlapsCat?catTop-height-8:catTop+cellHeight/2-height/2;
      const maxTop=Math.min(view.bottom-5,visibleBottom)-height;
      const placedTop=Math.max(visibleTop,Math.min(maxTop,preferredTop));
      setMenuPosition(previous=>Math.abs(previous.left-(placedLeft-box.left))<.5&&Math.abs(previous.top-(placedTop-box.top))<.5?previous:{left:placedLeft-box.left,top:placedTop-box.top});
      const tooltip=tooltipRef.current;
      if(tooltip){
        const tipLeft=Math.max(minLeft,Math.min(placedLeft,Math.min(view.right-5,window.innerWidth-6)-tooltip.offsetWidth));
        const below=view.bottom+12;
        const preferredTipTop=below+tooltip.offsetHeight<=visibleBottom?below:view.top-tooltip.offsetHeight-10;
        const tipTop=Math.max(visibleTop,Math.min(visibleBottom-tooltip.offsetHeight,preferredTipTop));
        setTooltipPosition(previous=>Math.abs(previous.left-(tipLeft-box.left))<.5&&Math.abs(previous.top-(tipTop-box.top))<.5?previous:{left:tipLeft-box.left,top:tipTop-box.top});
      }
    };
    update();
    const observer=new ResizeObserver(update);if(menuRef.current)observer.observe(menuRef.current);if(scrollRef.current)observer.observe(scrollRef.current);if(tooltipRef.current)observer.observe(tooltipRef.current);
    window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[inspected?.id,inspected?.x,inspected?.y,overview,skillTooltipOpen]);

  return <section className="battle-l00 battle-chapter battle-immersive" data-scene="alley" data-testid="chapter-battle" data-phase={game.phase} data-attempt-id={attemptId} data-elapsed={game.elapsed.toFixed(2)} data-effective-speed={speed} onKeyDown={keyDown} onPointerDownCapture={()=>{suppressClick.current=false;}} onPointerDown={event=>{if(inspected&&!(event.target as HTMLElement).closest('.chapter-cell,.btl-cat-menu,.btl-skill-tooltip,.btl-playback'))closeInspection();}}>
    <BattleSceneBackdrop scene="alley" boardRef={boardRef} columns={MAP.columns} rows={MAP.rows} cells={CELLS}/>
    <div className="btl-head"><div><span className="btl-eyebrow">CHAPTER 01 · CAT DEFENSE</span><strong>第一章 · 长巷尽头的黑影</strong></div><div className="btl-progress"><span>黑影已离场 {game.defeated+game.leaks} / {game.totalEnemies}</span><span data-testid="chapter-leaks" aria-label={`已漏过 ${game.leaks} 只黑影，最多 ${game.maxLeaks} 次`}>防线 {'●'.repeat(Math.max(0,game.maxLeaks-game.leaks))}{'○'.repeat(Math.min(game.maxLeaks,game.leaks))}</span></div></div>
    <div className="btl-wave-status"><strong data-testid="chapter-wave">第 {game.wave} / {game.totalWaves} 波 · 剩余 {remaining} 只黑影</strong><span>A4、D10、E10 三处来敌 · 首领必须击退</span></div>
    <details className="battle-hud-details"><summary>战况说明</summary>
      <div className="btl-subhead"><span>凸形小巷 · 垃圾占格不可部署</span><span>已上阵 {game.cats.filter(cat=>cat.status==='active').length} / {RULES.maxCats}</span><span>体力归零退场 · 点点治疗在场伙伴</span></div>
      <div className="btl-difficulty-strip" data-testid="chapter-difficulty"><strong>{DIFFICULTIES[difficulty].label} · 敌人体力 {Math.round(DIFFICULTIES[difficulty].hpMultiplier*100)}%</strong><span>守完全部波次并击退首领；3 次突破则失败。所有猫退场也会失败。</span></div>
      {game.phase==='ready'&&<p className="chapter-ready" data-testid="chapter-ready">推荐阵型已就位，可拖动小猫调整。点猫查看技能，点击开始守护。</p>}
      <div className="btl-range-legend" aria-label="范围图例"><span><i/>灰绿 · 普攻可达</span><span><i className="btl-legend-aim"/>浅青 · 可选技能中心</span><span><i className="btl-legend-effect"/>黄色 · 技能作用范围</span></div>
      <p className="btl-board-help">点击战场小猫查看技能，可直接拖动猫咪换位。满能后点击技能图标施放；需要选点时，左键或 Enter 确认，右键或 Esc 取消。</p>
    </details>
    <div className={`chapter-boss-panel battle-hud-boss${bossWindup?' is-warning':''}`} data-testid="chapter-boss" data-boss-phase={game.boss.phase} data-boss-attacks={game.boss.attacks} data-boss-basic-attacking={bossBasicAttacking}><strong>{game.boss.phase==='defeated'?'首领已击退':game.boss.name}</strong><div className="chapter-boss-health" role="meter" aria-label="首领体力" aria-valuemin={0} aria-valuemax={game.boss.maxHp} aria-valuenow={Math.ceil(game.boss.hp)} data-testid="chapter-boss-health"><i style={{width:`${100*game.boss.hp/game.boss.maxHp}%`}}/><span>{Math.ceil(game.boss.hp)} / {game.boss.maxHp}</span></div><small>{bossWindup?'举起路障了！移开裂纹范围内的猫咪。':game.boss.phase==='recovery'?'重砸落地，正在收势。':game.boss.phase==='defeated'?'首领已击退，继续处理全部波次。':bossBasicAttacking?'普通攻击 · 挥动路障':'固定占据 D8–E9 四格 · 普攻 / 路障重砸'}</small></div>
    <CarryPanel compact carry={game.carry} phase={game.phase} wave={game.wave} waves={WAVES} entrances={{'0':MAP.spawns[2],'3':MAP.spawns[0],'4':MAP.spawns[1]}} enemies={ENEMY_DEFINITIONS} disabled={paused||hidden||game.paused||game.uiPaused||game.externallyPaused} onUse={()=>act({type:'USE_CARRY'})}/>
    <div className="btl-tactics battle-advisor"><button type="button" data-testid="chapter-advisor" aria-label="与军师阿策交谈" title={advice} aria-expanded={chatOpen} disabled={paused||hidden||ended||!!game.aim} onClick={()=>{closeInspection();setChatOpen(value=>!value);}}><AdvisorPortrait/><strong>阿策</strong><span>聊聊战况</span></button></div>
    {game.cats.some(cat=>cat.status==='retired')&&<p className="btl-retirement-note" role="status" data-testid="chapter-retired">{game.cats.filter(cat=>cat.status==='retired').map(cat=>cat.name).join('、')}已退场，本场无法复活。</p>}
    <div className="btl-arena btl-arena-wide">
      <div className="btl-board-column">
        <div className="btl-playback" role="group" aria-label="战斗速度与开始暂停"><button type="button" className={game.baseSpeed===.5?'btl-speed-selected':''} disabled={ended||paused||hidden} aria-pressed={game.baseSpeed===.5} data-testid="chapter-speed-half" onClick={()=>act({type:'SET_SPEED',speed:.5})}>×0.5</button><button type="button" className={game.baseSpeed!==.5?'btl-speed-selected':''} disabled={ended||paused||hidden} aria-pressed={game.baseSpeed!==.5} data-testid="chapter-speed-toggle" aria-label={`常速或倍速，当前基础 ×${game.baseSpeed}`} onClick={()=>act({type:'SET_SPEED',speed:game.baseSpeed===1?2:1})}>{game.baseSpeed===.5?'×1 / ×2':`×${game.baseSpeed}`}</button><button type="button" className="btl-play-toggle" data-testid="chapter-start" disabled={paused||hidden||ended||chatOpen||retreatOpen} onClick={startOrToggle}>{game.phase==='ready'?'开始守护':game.paused?'继续战斗':'暂停战斗'}</button><span data-testid="chapter-effective-speed">{speed===0?'当前暂停':game.aim?'技能瞄准 ×1':inspected?'查看猫咪 · 临时 ×0.5':`当前 ×${speed}`} · {game.elapsed.toFixed(0)} 秒</span></div>
        <div className="chapter-map-tools"><button type="button" className="btl-quiet" aria-pressed={overview} onClick={()=>setOverview(value=>!value)}>{overview?'放大战场':'查看全图'}</button><button type="button" className="btl-quiet" onClick={()=>showMapArea('goal')}>← 守护点</button><button type="button" className="btl-quiet" onClick={()=>showMapArea('branch')}>支巷 ↓</button><button type="button" className="btl-quiet" onClick={()=>showMapArea('boss')}>首领 →</button></div>
        <div className="chapter-battlefield" ref={battlefieldRef}>
          <div ref={scrollRef} className="chapter-board-scroll" role="region" aria-label="小巷战场，窄屏可横向滚动"><div ref={boardRef} tabIndex={-1} className={`chapter-board${overview?' is-overview':''}${moving?' is-moving':''}${game.aim?' is-aiming':''}`} style={{width:overview?fittedWidth:Math.max(MAP.columns*80,(fittedWidth??0)*1.25)}} data-testid="chapter-board" onClick={event=>{if(event.target===event.currentTarget){if(suppressClick.current)suppressClick.current=false;else closeInspection();}}} onPointerDown={event=>{if(gameRef.current.aim&&event.pointerType!=='mouse'&&event.button===0){aimPointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);previewTouch(event);}}} onPointerMove={previewTouch} onPointerUp={event=>finishTouchAim(event)} onPointerCancel={event=>finishTouchAim(event,true)} onLostPointerCapture={()=>{aimPointer.current=null;}} onContextMenu={event=>{event.preventDefault();if(gameRef.current.aim)cancelAim();else closeInspection();}} onPointerLeave={()=>{if(!gesture.current){setHover(null);if(gameRef.current.aim)act({type:'AIM_SKILL',x:-1,y:-1});}}}>
            <canvas ref={canvasRef} width={BOARD_WIDTH} height={BOARD_HEIGHT} aria-label="凸形小巷、三格垃圾障碍、三个出怪口与占据四格的固定首领"/>

            <div className="chapter-cells">{CELLS.map(position=>{
              const cat=game.cats.find(c=>c.status==='active'&&c.x===position.x&&c.y===position.y);
              const blocked=obstacleCell(position.x,position.y),name=cellName(position);
              const danger=bossWindup&&game.boss.targetCells.some(cell=>cell.x===position.x&&cell.y===position.y);
              const enemyCount=game.enemies.filter(enemy=>Math.round(enemy.x)===position.x&&Math.round(enemy.y)===position.y).length;
              const bossCell=bossFootprint.some(cell=>cell.x===position.x&&cell.y===position.y),spawnCell=MAP.spawns.some(cell=>cell.x===position.x&&cell.y===position.y);
              const attack=attackCells.some(cell=>cell.x===position.x&&cell.y===position.y),effect=skillCells.some(cell=>cell.x===position.x&&cell.y===position.y);
              return <button type="button" key={name} className={`chapter-cell${blocked?' is-obstacle':''}`} style={{gridColumn:position.x+1,gridRow:position.y+1}} data-cell={`${position.x},${position.y}`} data-testid={`chapter-cell-${name}`} data-boss-danger={danger} data-danger={danger} data-enemies={enemyCount} data-deployable={isDeployableCell(position)} data-boss-footprint={bossCell} data-spawn={spawnCell} data-attack-range={attack} data-skill-range={effect} aria-label={`${name}${blocked?'，垃圾障碍':cat?`，${cat.name}，${CAT_PRESENTATION[cat.id].label}，体力 ${Math.ceil(cat.hp)} / ${cat.maxHp}，能量 ${cat.energy} / 100`:position.x===0&&position.y===3?'，守护点':spawnCell?'，出怪口':bossCell?'，固定首领占格，四格共享体力':'，地格'}${enemyCount?`，${enemyCount} 个普通黑影`:''}${danger?'，重砸落点':''}${attack?'，普通攻击可达':''}${effect?'，技能覆盖':''}`} disabled={paused||hidden||ended} onClick={()=>cellClick(position)} onPointerEnter={()=>{setHover(position);if(gameRef.current.aim)act({type:'AIM_SKILL',...position});}} onFocus={()=>{if(gameRef.current.aim){setHover(position);act({type:'AIM_SKILL',...position});}}} onPointerDown={event=>{if(cat)pointerDown(event,cat.id);}} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel}>{cat&&<span className="chapter-unit-state" data-testid={`chapter-cat-${cat.id}`} data-status={cat.status} data-x={cat.x} data-y={cat.y} data-energy={cat.energy} data-hp={Math.ceil(cat.hp)}><span className="btl-unit-name"><span className="chapter-unit-name">{cat.name}</span><RoleBadge id={cat.id}/><small className="chapter-unit-energy">{Math.floor(cat.energy)}</small></span></span>}</button>;
            })}</div>
          </div></div>
          {inspected&&<><div ref={menuRef} className="btl-cat-menu" role="group" aria-label={`${inspected.name}，${CAT_PRESENTATION[inspected.id].label}的技能菜单`} data-testid="chapter-cat-menu" data-cat-id={inspected.id} style={menuPosition} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onContextMenu={event=>{event.preventDefault();closeInspection();}}><div className="btl-cat-menu-heading"><strong className="chapter-menu-cat-name">{inspected.name}<RoleBadge id={inspected.id}/></strong><button type="button" className="btl-cat-menu-close" data-testid="chapter-close-cat-menu" aria-label="关闭猫咪菜单" onClick={closeInspection}>×</button></div><button type="button" className={`btl-skill-orb${canCast?' btl-skill-orb-ready':''}`} data-testid={`chapter-skill-${inspected.id}`} aria-label={`${SKILLS[inspected.id].name}，能量 ${inspected.energy} / 100${canCast?'，点击释放':'，当前不可释放，可查看说明'}`} aria-disabled={!canCast} aria-describedby={`chapter-skill-description-${inspected.id}`} onMouseEnter={()=>setSkillTooltipOpen(true)} onMouseLeave={event=>{if(document.activeElement!==event.currentTarget)setSkillTooltipOpen(false);}} onFocus={()=>setSkillTooltipOpen(true)} onBlur={()=>setSkillTooltipOpen(false)} onClick={()=>{if(canCast)chooseSkill(inspected.id);else setSkillTooltipOpen(true);}}><span aria-hidden="true">{ICONS[inspected.id]}</span></button><div className="btl-cat-menu-footer"><span>{Math.floor(inspected.energy)} / 100</span><button type="button" className="btl-cat-move" data-testid="chapter-move" onClick={()=>{setMoving(inspected.id);act({type:'CLOSE_INSPECTION'});}}>移动</button></div></div><div ref={tooltipRef} className={`btl-skill-tooltip${skillTooltipOpen?' btl-tooltip-visible':''}`} role="tooltip" id={`chapter-skill-description-${inspected.id}`} data-testid="chapter-skill-tooltip" style={tooltipPosition} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}><small>{inspected.name} · {CAT_PRESENTATION[inspected.id].label} · {inspected.role} · {speed===0?'当前暂停':'查看时 ×0.5'}</small><p className="chapter-positioning" data-testid="chapter-cat-positioning">{CAT_PRESENTATION[inspected.id].positioning}</p><strong>{SKILLS[inspected.id].name}</strong><p>{SKILLS[inspected.id].description}{SKILLS[inspected.id].targeting==='area'?' 全地图选点，黄色十字为本次作用范围；左键或 Enter 释放，右键 / Esc 取消。':''}</p><Health cat={inspected}/><span className="btl-tooltip-status">消耗 100 能量 · {game.phase==='ready'?'战斗开始后积攒能量':game.paused?'暂停期间不可释放':canCast?'已就绪，点击圆形图标释放':`尚需 ${Math.ceil(100-inspected.energy)} 能量，每模拟秒自动 +${RULES.energyPerSecond}`}</span>{inspected.shield>0&&<span className="btl-shield-detail">额外护盾 {Math.ceil(inspected.shield)} · 剩余 {inspected.shieldRemaining.toFixed(1)} 秒</span>}</div></>}
        </div>
        {(paused||hidden||!!moveProblem||!!dragging||!!game.aim||!!moving||!!inspected)&&<p className="btl-board-caption" aria-live="polite">{paused?'主流程已暂停战斗。':hidden?'页面隐藏，战斗暂停。':moveProblem??(dragging?`正在移动${game.cats.find(cat=>cat.id===dragging)?.name}，松开到合法地格。`:game.aim?`${SKILLS[game.aim.catId].name}：移动预览，左键或 Enter 释放，右键 / Esc 取消。`:moving?`${game.cats.find(cat=>cat.id===moving)?.name}：点击目标地格，可与另一只在场猫交换。`:inspected?`查看${inspected.name} · 临时 ×0.5（暂停优先）· 悬停技能图标看说明 · 点击空白、× 或 Esc 关闭`:'点击战场小猫查看技能 · 可直接拖动猫咪换位')}{game.aim&&<button type="button" className="btl-quiet btl-inline-cancel" data-testid="chapter-cancel-skill" onClick={cancelAim}>取消</button>}</p>}
      </div>
    </div>
    <div className="btl-controls"><p role="status" className={notice?'chapter-notice':''}>{notice||game.logs.at(-1)?.text||'伙伴们准备好了。'}<small>{ended?submitted?'正在交回主流程结算…':'守护结束':'每模拟秒 +5 能量 · 满 100 手动施法 · 体力归零退场'}</small></p>{game.phase==='battle'&&<button type="button" className="btl-quiet chapter-retreat" disabled={paused||hidden} data-testid="chapter-retreat" onClick={()=>{cancelAim();closeInspection();setChatOpen(false);setRetreatOpen(true);}}>撤离本场</button>}</div>
    {chatOpen&&<section className="btl-chat" aria-label="军师阿策聊天"><div className="btl-panel-heading"><span><strong>阿策的战术小纸条</strong><small>本地规则顾问 · 只参考眼前战况</small></span><button type="button" className="btl-quiet" onClick={()=>setChatOpen(false)}>收起聊天</button></div><div ref={chatLogRef} className="btl-chat-log" aria-live="polite"><article><strong>眼前战况</strong><p>{advice}</p></article>{messages.map((message,index)=><div key={index}><p className="btl-question">{message.question}</p><article><strong>{message.answer.title}</strong><p>{message.answer.text}</p></article></div>)}</div><div className="btl-suggestions">{['现在怎么摆阵？','谁需要治疗？','怎样蓄能？','猫咪有什么能力？'].map(text=><button type="button" key={text} disabled={paused||hidden} onClick={()=>ask(text)}>{text}</button>)}</div><form onSubmit={event=>{event.preventDefault();ask(question);}}><label className="btl-sr-only" htmlFor="chapter-question">询问军师</label><input id="chapter-question" value={question} disabled={paused||hidden} onChange={event=>setQuestion(event.target.value)} maxLength={200} placeholder="问问阵型、治疗、蓄能或猫咪能力……"/><button type="submit" disabled={paused||hidden||!question.trim()}>询问</button></form></section>}
    {retreatOpen&&<div className="chapter-modal"><section className="chapter-dialog" role="dialog" aria-modal="true" aria-labelledby="chapter-retreat-title"><h3 id="chapter-retreat-title">让伙伴撤离本场？</h3><p>本场按失败结束；之后沿主流程回到准备阶段，重新挑战时四位伙伴恢复出战状态。</p><div><button type="button" autoFocus onClick={()=>setRetreatOpen(false)}>继续守护</button><button type="button" disabled={paused} data-testid="chapter-confirm-retreat" onClick={()=>{setRetreatOpen(false);act({type:'SET_UI_PAUSE',paused:false});act({type:'RETREAT'});}}>确认撤离</button></div></section></div>}
  </section>;
}
