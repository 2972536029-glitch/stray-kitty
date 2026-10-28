import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {KeyboardEvent, PointerEvent} from 'react';
import type {BattleDifficulty, TunnelAction, TunnelCat, TunnelCatId, TunnelState, Position} from './types';
import {CELLS, DIFFICULTIES, ENEMY_DEFINITIONS, MAP, RULES, SKILLS, WAVES, ROUTES} from './config';
import {advanceTunnel, createTunnelBattle, dispatchTunnel, getAttackCells, getBossCells, getTunnelAdvice, getTunnelSpeed, getDeployError, getSkillCells, isDarkened, isDeployableCell, isEnemyVisible} from './engine';
import {BOARD_HEIGHT, BOARD_WIDTH, cellName, mapCell, obstacleCell, OBSTACLE_NAMES, paintTunnel} from './painter';
import {drawCat} from '../l00/painter';
import {getTunnelAnswer} from './advisor';
import {CAT_PRESENTATION} from './presentation';
import {CarryPanel} from '../CarryPanel';
import {BattleSceneBackdrop} from '../BattleSceneBackdrop';
import {useBattleBoardFit} from '../useBattleBoardFit';
import {useModelAdvisor} from '../useModelAdvisor';
import {AdvisorChatMessages} from '../AdvisorChatMessages';
import '../carry.css';
import '../l00/battle.css';
import './tunnel.css';

export interface TunnelBattleResult {
  outcome: 'won' | 'lost'; report: {leaks:number;bossDefeated:boolean};
}
export interface TunnelBattleViewportProps {
  attemptId: string; difficulty: BattleDifficulty; carry?: unknown; paused: boolean;
  onResult: (result:TunnelBattleResult)=>void;
}
interface DragGesture {catId:TunnelCatId;pointerId:number;startX:number;startY:number;moved:boolean}
const ICONS:Record<TunnelCatId,string>={caster:'✧',guard:'◈',tuanzi:'✦',momo:'☼',bruiser:'◆',diandian:'✚'};

function RoleBadge({id}:{id:TunnelCatId}){
  return <span className="tunnel-role-badge" data-role={CAT_PRESENTATION[id].label}>{CAT_PRESENTATION[id].label}</span>;
}
function AdvisorPortrait(){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const context=ref.current?.getContext('2d');if(context)drawCat(context,'advisor',0,0,96);},[]);
  return <canvas ref={ref} width={96} height={96} className="btl-portrait" aria-hidden="true"/>;
}
function Health({cat}:{cat:TunnelCat}){
  return <div className="tunnel-cat-meters">
    <span className="tunnel-cat-hp" role="meter" aria-label={`${cat.name}体力`} aria-valuemin={0} aria-valuemax={cat.maxHp} aria-valuenow={Math.ceil(cat.hp)}><i style={{width:`${100*cat.hp/cat.maxHp}%`}}/></span>
    <span className={`tunnel-cat-energy${cat.energy>=100?' is-full':''}`} role="meter" aria-label={`${cat.name}能量`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={cat.energy}><i style={{width:`${cat.energy}%`}}/></span>
  </div>;
}

/** A single local simulation owns the attempt. Host state updates do not recreate its board. */
export function TunnelBattleViewport({attemptId,difficulty,carry,paused,onResult}:TunnelBattleViewportProps){
  const [game,setGame]=useState(()=>createTunnelBattle({difficulty,carry}));
  const gameRef=useRef(game);
  const [selected,setSelected]=useState<TunnelCatId|null>(null);
  const [moving,setMoving]=useState<TunnelCatId|null>(null);
  const [hover,setHover]=useState<Position|null>(null);
  const [chatOpen,setChatOpen]=useState(false);
  const [retreatOpen,setRetreatOpen]=useState(false);
  const [dragging,setDragging]=useState<TunnelCatId|null>(null);
  const [hidden,setHidden]=useState(document.hidden);
  const [notice,setNotice]=useState('');
  const [submitted,setSubmitted]=useState(false);
  const [overview,setOverview]=useState(()=>window.innerWidth>=700);
  const [menuPosition,setMenuPosition]=useState({left:0,top:0});
  const [tooltipPosition,setTooltipPosition]=useState({left:0,top:0});
  const [skillTooltipOpen,setSkillTooltipOpen]=useState(false);
  const [question,setQuestion]=useState('');
  const advisorChat=useModelAdvisor({
    attemptId,stageId:'tunnel_boss',open:chatOpen,
    blocked:paused||hidden||submitted||retreatOpen||game.phase==='won'||game.phase==='lost',
    getSnapshot:()=>gameRef.current,localAnswer:getTunnelAnswer,
  });
  const canvasRef=useRef<HTMLCanvasElement>(null),boardRef=useRef<HTMLDivElement>(null),scrollRef=useRef<HTMLDivElement>(null);
  const fittedWidth=useBattleBoardFit(scrollRef,MAP.columns,MAP.rows);
  const battlefieldRef=useRef<HTMLDivElement>(null),menuRef=useRef<HTMLDivElement>(null);
  const tooltipRef=useRef<HTMLDivElement>(null);
  const chatLogRef=useRef<HTMLDivElement>(null);
  const previousSelectedStatus=useRef<{id:TunnelCatId;status:TunnelCat['status']}|null>(null);
  const attemptRef=useRef(attemptId),gesture=useRef<DragGesture|null>(null),suppressClick=useRef(false);
  const aimPointer=useRef<number|null>(null);
  const emitted=useRef(false),callbackRef=useRef(onResult);callbackRef.current=onResult;
  const hostPauseRef=useRef(paused);hostPauseRef.current=paused;
  const selectedRef=useRef(selected);selectedRef.current=selected;
  const hoverRef=useRef(hover);hoverRef.current=hover;
  const uiPauseRef=useRef(false);uiPauseRef.current=chatOpen||retreatOpen||!!dragging;

  function publish(next:TunnelState){gameRef.current=next;setGame(next);return next;}
  function act(action:TunnelAction){
    const next=publish(dispatchTunnel(gameRef.current,action));
    if(next.lastAction&&!next.lastAction.ok)setNotice(next.lastAction.message);
    else if(action.type!=='AIM_SKILL'&&action.type!=='SET_UI_PAUSE')setNotice('');
    return next;
  }
  function closeInspection(){act({type:'CLOSE_INSPECTION'});setSelected(null);setMoving(null);}
  function cancelAim(){act({type:'CANCEL_SKILL'});setHover(null);}
  function inspect(id:TunnelCatId){
    if(paused||hidden||chatOpen)return;
    setMoving(null);setSelected(id);setSkillTooltipOpen(false);
    if(gameRef.current.cats.find(cat=>cat.id===id)?.status==='retired')act({type:'CLOSE_INSPECTION'});
    else act({type:'INSPECT',catId:id});
  }
  function chooseSkill(id:TunnelCatId){
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
    setQuestion('');
    publish(createTunnelBattle({difficulty,carry}));
  },[attemptId,difficulty,carry]);

  useEffect(()=>{
    if(paused){setSelected(null);setMoving(null);setHover(null);setDragging(null);gesture.current=null;}
    publish(dispatchTunnel(gameRef.current,{type:'SET_EXTERNAL_PAUSE',paused:paused||document.hidden}));
  },[paused]);
  useEffect(()=>{publish(dispatchTunnel(gameRef.current,{type:'SET_UI_PAUSE',paused:chatOpen||retreatOpen||!!dragging}));},[chatOpen,retreatOpen,dragging]);

  useEffect(()=>{
    let stopped=false,handle=0,last=performance.now(),lastRender=0;
    const visibility=()=>{
      last=performance.now();setHidden(document.hidden);
      publish(dispatchTunnel(gameRef.current,{type:'SET_EXTERNAL_PAUSE',paused:hostPauseRef.current||document.hidden}));
    };
    document.addEventListener('visibilitychange',visibility);
    const frame=(time:number)=>{
      if(stopped)return;
      const dt=Math.max(0,Math.min(1,(time-last)/1000));last=time;
      let current=gameRef.current;
      const frozen=hostPauseRef.current||document.hidden;
      if(current.externallyPaused!==frozen)current=dispatchTunnel(current,{type:'SET_EXTERNAL_PAUSE',paused:frozen});
      if(current.uiPaused!==uiPauseRef.current)current=dispatchTunnel(current,{type:'SET_UI_PAUSE',paused:uiPauseRef.current});
      current=advanceTunnel(current,dt);gameRef.current=current;
      const context=canvasRef.current?.getContext('2d');if(context)paintTunnel(context,current,selectedRef.current,hoverRef.current);
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
  useEffect(()=>{if(chatOpen&&chatLogRef.current)chatLogRef.current.scrollTop=chatLogRef.current.scrollHeight;},[advisorChat.messages,advisorChat.loading,advisorChat.notice,chatOpen]);

  function suppressSyntheticClick(){suppressClick.current=true;}

  function pointAt(clientX:number,clientY:number):Position|null{
    const bounds=boardRef.current?.getBoundingClientRect();if(!bounds)return null;
    if(clientX<bounds.left||clientX>=bounds.right||clientY<bounds.top||clientY>=bounds.bottom)return null;
    const p={x:Math.floor((clientX-bounds.left)/bounds.width*MAP.columns),y:Math.floor((clientY-bounds.top)/bounds.height*MAP.rows)};
    return mapCell(p.x,p.y)?p:null;
  }
  function pointerDown(event:PointerEvent<HTMLElement>,catId:TunnelCatId){
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
    if(advisorChat.ask(text))setQuestion('');
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
    const start=aim.target??{...MAP.boss};let p={...start};
    for(let i=0;i<MAP.columns;i++){p={x:p.x+delta.x,y:p.y+delta.y};if(p.x<0||p.y<0||p.x>=MAP.columns||p.y>=MAP.rows)break;if(mapCell(p.x,p.y)&&!obstacleCell(p.x,p.y)){act({type:'AIM_SKILL',...p});setHover(p);boardRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${p.x},${p.y}"]`)?.focus();break;}}
  }
  const ended=game.phase==='won'||game.phase==='lost';
  const chosen=game.cats.find(cat=>cat.id===selected);
  const speed=getTunnelSpeed(game);
  const advice=getTunnelAdvice(game);
  const darkened=isDarkened(game);
  const visibleEnemies=game.enemies.filter(enemy=>isEnemyVisible(game,enemy));
  const bossWindup=game.boss.phase==='windup';
  const bossBasicAttacking=game.boss.phase==='idle'&&game.effects.some(effect=>effect.kind==='boss-attack');
  const remaining=Math.max(0,game.totalEnemies-game.defeated-game.leaks);
  const movingId=moving??dragging;
  const moveProblem=movingId&&hover?getDeployError({...game,enemies:visibleEnemies},movingId,hover):null;
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

  return <section className="battle-l00 battle-tunnel battle-immersive" data-scene="tunnel" data-testid="tunnel-battle" data-phase={game.phase} data-attempt-id={attemptId} data-elapsed={game.elapsed.toFixed(2)} data-effective-speed={speed} data-darkened={darkened} data-darkness-remaining={game.darknessRemaining.toFixed(2)} data-night-vision-remaining={game.nightVisionRemaining.toFixed(2)} onKeyDown={keyDown} onPointerDownCapture={()=>{suppressClick.current=false;}} onPointerDown={event=>{if(inspected&&!(event.target as HTMLElement).closest('.tunnel-cell,.btl-cat-menu,.btl-skill-tooltip,.btl-playback'))closeInspection();}}>
    <BattleSceneBackdrop scene="tunnel" boardRef={boardRef} columns={MAP.columns} rows={MAP.rows} cells={CELLS} darkened={darkened}/>
    <div className="btl-head"><div><span className="btl-eyebrow">CHAPTER 04 · CAT DEFENSE</span><strong>第四章 · 地下通道</strong></div><div className="btl-progress"><span>黑影已离场 {game.defeated+game.leaks} / {game.totalEnemies}</span><span data-testid="tunnel-leaks" aria-label={`已漏过 ${game.leaks} 只黑影，最多 ${game.maxLeaks} 次`}>防线 {'●'.repeat(Math.max(0,game.maxLeaks-game.leaks))}{'○'.repeat(Math.min(game.maxLeaks,game.leaks))}</span></div></div>
    <div className="btl-wave-status"><strong data-testid="tunnel-wave">第 {game.wave} / {game.totalWaves} 波 · 剩余 {remaining} 只黑影</strong><span>A2、B8、D8 来敌 · 守住 C2</span></div>
    <details className="battle-hud-details"><summary>战况说明</summary>
      <div className="btl-subhead"><span>{CELLS.length} 格不规则通道 · 缺口不可通行</span><span>已上阵 {game.cats.filter(cat=>cat.status==='active').length} / {RULES.maxCats}</span><span>零血退场 · 墨墨夜视与全队护盾</span></div>
      <div className="btl-difficulty-strip" data-testid="tunnel-difficulty"><strong>{DIFFICULTIES[difficulty].label} · 敌人体力 {Math.round(DIFFICULTIES[difficulty].hpMultiplier*100)}%</strong><span>守完全部波次并击退首领；3 次突破则失败。所有猫退场也会失败。</span></div>
      {game.phase==='ready'&&<p className="tunnel-ready" data-testid="tunnel-ready">推荐阵型已就位，可拖动小猫调整。点猫查看技能，点击开始守护。</p>}
      <p>断灯期间只隐藏远处普通黑影；伙伴与喵喵始终可见、可操作。墨墨在场且满能时可用夜视恢复全场敌情，并为队伍提供护盾；未使用夜视也会自然恢复。</p>
      <p className="battle-advisor-summary">{advice}</p>
    </details>
    <div className={`tunnel-boss-panel battle-hud-boss${bossWindup?' is-warning':''}`} data-testid="tunnel-boss" data-boss-phase={game.boss.phase} data-boss-attacks={game.boss.attacks} data-boss-basic-attacking={bossBasicAttacking} data-boss-pulses={game.boss.slams}>
      <strong>{game.boss.phase==='defeated'?'首领已击退':game.boss.name}</strong><div className="tunnel-boss-health" role="meter" aria-label="首领体力" aria-valuemin={0} aria-valuemax={game.boss.maxHp} aria-valuenow={Math.ceil(game.boss.hp)} data-testid="tunnel-boss-health"><i style={{width:`${100*game.boss.hp/game.boss.maxHp}%`}}/><span>{Math.ceil(game.boss.hp)} / {game.boss.maxHp}</span></div>
      <small>{bossWindup?`断灯脉冲预警！${Math.max(0,RULES.bossPulseWindup-game.boss.phaseTime).toFixed(1)} 秒后全场受击，可提前开盾。`:game.boss.phase==='defeated'?'首领已击退，继续处理全部波次。':bossBasicAttacking?'普通攻击 · 闸臂拍击':'固定占据 C6、C7、D6、D7 · 留意断灯脉冲'}</small>
    </div>
    <p className={`tunnel-vision-status battle-hud-mechanic${darkened?' is-dark':game.nightVisionRemaining>0?' is-night-vision':''}`} data-testid="tunnel-vision-status"><strong>{darkened?'通道断灯':game.nightVisionRemaining>0?'墨墨 · 夜视生效':'通道视野正常'}</strong><span>{darkened?`远处黑影暂不可见 · ${game.darknessRemaining.toFixed(1)} 秒后自然恢复`:game.nightVisionRemaining>0?`全场敌情可见 · 夜视剩余 ${game.nightVisionRemaining.toFixed(1)} 秒`:'墨墨可用夜视恢复全场敌情'}</span></p>
    <CarryPanel compact carry={game.carry} phase={game.phase} wave={game.wave} waves={WAVES} entrances={Object.fromEntries(Object.entries(ROUTES).map(([route,path])=>[route,path[0]]))} enemies={ENEMY_DEFINITIONS} disabled={paused||hidden||game.paused||game.uiPaused||game.externallyPaused} onUse={()=>act({type:'USE_CARRY'})}/>
    <div className="btl-tactics battle-advisor"><button title={advice} type="button" data-testid="tunnel-advisor" aria-label="与军师阿策交谈" disabled={paused||hidden||ended||!!game.aim} onClick={()=>{closeInspection();setChatOpen(value=>!value);}}><AdvisorPortrait/><strong>阿策</strong><span>聊聊战况</span></button></div>
    {game.cats.some(cat=>cat.status==='retired')&&<p className="btl-retirement-note" role="status" data-testid="tunnel-retired">{game.cats.filter(cat=>cat.status==='retired').map(cat=>cat.name).join('、')}已退场，本场无法复活。</p>}
    <div className="btl-arena btl-arena-wide">
      <div className="btl-board-column">
        <div className="btl-playback" role="group" aria-label="战斗速度与开始暂停"><button type="button" className={game.baseSpeed===.5?'btl-speed-selected':''} disabled={ended||paused||hidden} aria-pressed={game.baseSpeed===.5} data-testid="tunnel-speed-half" onClick={()=>act({type:'SET_SPEED',speed:.5})}>×0.5</button><button type="button" className={game.baseSpeed!==.5?'btl-speed-selected':''} disabled={ended||paused||hidden} aria-pressed={game.baseSpeed!==.5} data-testid="tunnel-speed-toggle" aria-label={`常速或倍速，当前基础 ×${game.baseSpeed}`} onClick={()=>act({type:'SET_SPEED',speed:game.baseSpeed===1?2:1})}>{game.baseSpeed===.5?'×1 / ×2':`×${game.baseSpeed}`}</button><button type="button" className="btl-play-toggle" data-testid="tunnel-play-toggle" disabled={paused||hidden||ended||chatOpen||retreatOpen} onClick={startOrToggle}>{game.phase==='ready'?'开始守护':game.paused?'继续战斗':'暂停战斗'}</button><span data-testid="tunnel-effective-speed">{speed===0?'当前暂停':game.aim?'技能瞄准 ×1':inspected?'查看猫咪 · 临时 ×0.5':`当前 ×${speed}`} · {game.elapsed.toFixed(0)} 秒</span></div>
        <div className="tunnel-map-tools"><button type="button" className="btl-quiet" aria-pressed={overview} onClick={()=>setOverview(value=>!value)}>{overview?'放大战场':'查看全图'}</button><button type="button" className="btl-quiet" onClick={()=>showMapArea('goal')}>← 守护点</button><button type="button" className="btl-quiet" onClick={()=>showMapArea('branch')}>通道右侧 →</button><button type="button" className="btl-quiet" onClick={()=>showMapArea('boss')}>首领 →</button></div>
        <div className="tunnel-battlefield" ref={battlefieldRef}>
          <div ref={scrollRef} className="tunnel-board-scroll" role="region" aria-label="地下通道战场，窄屏可横向滚动"><div ref={boardRef} tabIndex={-1} className={`tunnel-board${darkened?' is-darkened':game.nightVisionRemaining>0?' has-night-vision':''}${overview?' is-overview':''}${moving?' is-moving':''}${game.aim?' is-aiming':''}`} data-testid="tunnel-board" data-overview={overview} style={{width:overview?fittedWidth:Math.max(MAP.columns*80,(fittedWidth??0)*1.25)}} onClick={event=>{if(event.target===event.currentTarget){if(suppressClick.current)suppressClick.current=false;else closeInspection();}}} onPointerDown={event=>{if(gameRef.current.aim&&event.pointerType!=='mouse'&&event.button===0){aimPointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);previewTouch(event);}}} onPointerMove={previewTouch} onPointerUp={event=>finishTouchAim(event)} onPointerCancel={event=>finishTouchAim(event,true)} onLostPointerCapture={()=>{aimPointer.current=null;}} onContextMenu={event=>{event.preventDefault();if(gameRef.current.aim)cancelAim();else closeInspection();}} onPointerLeave={()=>{if(!gesture.current){setHover(null);if(gameRef.current.aim)act({type:'AIM_SKILL',x:-1,y:-1});}}}>
            <canvas ref={canvasRef} width={BOARD_WIDTH} height={BOARD_HEIGHT} aria-label="五行八列外框内三十七格地下通道，九格障碍与四格断灯监守；E1至E3缺口透明，喵喵在C2，黑暗中所有猫始终可见"/>

            <div className="tunnel-cells">{CELLS.map(position=>{
              const cat=game.cats.find(c=>c.status==='active'&&c.x===position.x&&c.y===position.y);
              const blocked=obstacleCell(position.x,position.y),name=cellName(position);

              const telegraph=bossWindup;

              const enemyCount=visibleEnemies.filter(enemy=>Math.round(enemy.x)===position.x&&Math.round(enemy.y)===position.y).length;
              const bossCell=bossFootprint.some(cell=>cell.x===position.x&&cell.y===position.y),spawnCell=MAP.spawns.some(cell=>cell.x===position.x&&cell.y===position.y);
              const attack=attackCells.some(cell=>cell.x===position.x&&cell.y===position.y),effect=skillCells.some(cell=>cell.x===position.x&&cell.y===position.y);
              return <button type="button" key={name} className={`tunnel-cell${blocked?' is-obstacle':''}`} style={{gridColumn:position.x+1,gridRow:position.y+1}} data-cell={`${position.x},${position.y}`} data-testid={`tunnel-cell-${name}`} data-boss-danger={telegraph} data-danger={telegraph} data-enemies={enemyCount} data-deployable={isDeployableCell(position)} data-boss-footprint={bossCell} data-spawn={spawnCell} data-attack-range={attack} data-skill-range={effect} aria-label={`${name}${blocked?`，${OBSTACLE_NAMES[name]}，不可通行`:cat?`，${cat.name}，${CAT_PRESENTATION[cat.id].label}，体力 ${Math.ceil(cat.hp)} / ${cat.maxHp}，能量 ${Math.floor(cat.energy)} / 100`:position.x===MAP.goal.x&&position.y===MAP.goal.y?'，喵喵，守护目标，全程不参与战斗':spawnCell?'，出怪口':bossCell?'，四格首领占格':'，地格'}${enemyCount?`，${enemyCount} 个普通黑影`:''}${telegraph?'，全场断灯脉冲预警':''}${attack?'，普通攻击可达':''}${effect?'，技能覆盖':''}`} disabled={paused||hidden||ended} onClick={()=>cellClick(position)} onPointerEnter={()=>{setHover(position);if(gameRef.current.aim)act({type:'AIM_SKILL',...position});}} onFocus={()=>{if(gameRef.current.aim){setHover(position);act({type:'AIM_SKILL',...position});}}} onPointerDown={event=>{if(cat)pointerDown(event,cat.id);}} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel}>{cat&&<span className="tunnel-unit-state" data-testid={`tunnel-cat-${cat.id}`} data-status={cat.status} data-x={cat.x} data-y={cat.y} data-energy={cat.energy} data-attack-buff={cat.attackBuffRemaining.toFixed(2)} data-hp={Math.ceil(cat.hp)}><span className="btl-unit-name"><span className="tunnel-unit-name">{cat.name}</span><RoleBadge id={cat.id}/><small className="tunnel-unit-energy">{Math.floor(cat.energy)}</small></span></span>}</button>;
            })}</div>
          </div></div>
          {inspected&&<><div ref={menuRef} className="btl-cat-menu" role="group" aria-label={`${inspected.name}，${CAT_PRESENTATION[inspected.id].label}的技能菜单`} data-testid="tunnel-cat-menu" data-cat-id={inspected.id} style={menuPosition} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onContextMenu={event=>{event.preventDefault();closeInspection();}}><div className="btl-cat-menu-heading"><strong className="tunnel-menu-cat-name">{inspected.name}<RoleBadge id={inspected.id}/></strong><button type="button" className="btl-cat-menu-close" data-testid="tunnel-close-cat-menu" aria-label="关闭猫咪菜单" onClick={closeInspection}>×</button></div><button type="button" className={`btl-skill-orb${canCast?' btl-skill-orb-ready':''}`} data-testid={`tunnel-skill-${inspected.id}`} aria-label={`${SKILLS[inspected.id].name}，能量 ${inspected.energy} / 100${canCast?'，点击释放':'，当前不可释放，可查看说明'}`} aria-disabled={!canCast} aria-describedby={`tunnel-skill-description-${inspected.id}`} onMouseEnter={()=>setSkillTooltipOpen(true)} onMouseLeave={event=>{if(document.activeElement!==event.currentTarget)setSkillTooltipOpen(false);}} onFocus={()=>setSkillTooltipOpen(true)} onBlur={()=>setSkillTooltipOpen(false)} onClick={()=>{if(canCast)chooseSkill(inspected.id);else setSkillTooltipOpen(true);}}><span aria-hidden="true">{ICONS[inspected.id]}</span></button><div className="btl-cat-menu-footer"><span>{Math.floor(inspected.energy)} / 100</span><button type="button" className="btl-cat-move" data-testid="tunnel-move" onClick={()=>{setMoving(inspected.id);act({type:'CLOSE_INSPECTION'});}}>移动</button></div></div><div ref={tooltipRef} className={`btl-skill-tooltip${skillTooltipOpen?' btl-tooltip-visible':''}`} role="tooltip" id={`tunnel-skill-description-${inspected.id}`} data-testid="tunnel-skill-tooltip" style={tooltipPosition} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}><small>{inspected.name} · {CAT_PRESENTATION[inspected.id].label} · {inspected.role} · {speed===0?'当前暂停':'查看时 ×0.5'}</small><p className="tunnel-positioning" data-testid="tunnel-cat-positioning">{CAT_PRESENTATION[inspected.id].positioning}</p><strong>{SKILLS[inspected.id].name}</strong><p>{SKILLS[inspected.id].description}{SKILLS[inspected.id].targeting==='area'?' 全地图选点，黄色十字为本次作用范围；左键或 Enter 释放，右键 / Esc 取消。':''}</p><Health cat={inspected}/>{inspected.attackBuffRemaining>0&&<span className="tunnel-attack-buff">普攻强化剩余 {inspected.attackBuffRemaining.toFixed(1)} 秒</span>}<span className="btl-tooltip-status">消耗 100 能量 · {game.phase==='ready'?'战斗开始后积攒能量':game.paused?'暂停期间不可释放':canCast?'已就绪，点击圆形图标释放':`尚需 ${Math.ceil(100-inspected.energy)} 能量，每模拟秒自动 +${RULES.energyPerSecond}`}</span>{inspected.shield>0&&<span className="btl-shield-detail">额外护盾 {Math.ceil(inspected.shield)} · 剩余 {inspected.shieldRemaining.toFixed(1)} 秒</span>}</div></>}
        </div>
        <div className="btl-range-legend" aria-label="范围图例"><span><i/>灰绿 · 普攻可达</span><span><i className="btl-legend-aim"/>浅青 · 可选技能中心</span><span><i className="btl-legend-effect"/>黄色 · 技能作用范围</span></div>
        <p className="btl-board-caption" aria-live="polite">{paused?'主流程已暂停战斗。':hidden?'页面隐藏，战斗暂停。':moveProblem??(dragging?`正在移动${game.cats.find(cat=>cat.id===dragging)?.name}，松开到合法地格。`:game.aim?`${SKILLS[game.aim.catId].name}：移动预览，左键或 Enter 释放，右键 / Esc 取消。`:moving?`${game.cats.find(cat=>cat.id===moving)?.name}：点击目标地格，可与另一只在场猫交换。`:inspected?`查看${inspected.name} · 临时 ×0.5（暂停优先）· 悬停技能图标看说明 · 点击空白、× 或 Esc 关闭`:'点击战场小猫查看技能 · 可直接拖动猫咪换位')}{game.aim&&<button type="button" className="btl-quiet btl-inline-cancel" data-testid="tunnel-cancel-skill" onClick={cancelAim}>取消</button>}</p>
      </div>
    </div>
    <div className="btl-controls"><p role="status" className={notice?'tunnel-notice':''}>{notice||game.logs.at(-1)?.text||'伙伴们准备好了。'}<small>{ended?submitted?'正在交回主流程结算…':'守护结束':'每模拟秒 +5 能量 · 满 100 手动施法 · 体力归零退场'}</small></p>{game.phase==='battle'&&<button type="button" className="btl-quiet tunnel-retreat" disabled={paused||hidden} data-testid="tunnel-retreat" onClick={()=>{cancelAim();closeInspection();setChatOpen(false);setRetreatOpen(true);}}>撤离本场</button>}</div>
    {chatOpen&&<section className="btl-chat" aria-label="军师阿策聊天"><div className="btl-panel-heading"><span><strong>阿策的战术小纸条</strong><small>当前战况 · 模型建议 / 本地兜底</small></span><button type="button" className="btl-quiet" onClick={()=>setChatOpen(false)}>收起聊天</button></div><div ref={chatLogRef} className="btl-chat-log" aria-live="polite" aria-busy={advisorChat.loading}><article><strong>眼前战况</strong><p>{advice}</p></article><AdvisorChatMessages {...advisorChat}/></div><div className="btl-suggestions">{['现在怎么摆阵？','断灯脉冲怎么应对？','墨墨夜视能持续多久？','六只猫有什么能力？'].map(text=><button type="button" key={text} disabled={paused||hidden||advisorChat.loading} onClick={()=>ask(text)}>{text}</button>)}</div><form onSubmit={event=>{event.preventDefault();ask(question);}}><label className="btl-sr-only" htmlFor="tunnel-question">询问军师</label><input id="tunnel-question" value={question} disabled={paused||hidden||advisorChat.loading} onChange={event=>setQuestion(event.target.value)} maxLength={500} placeholder="问问管道、夜视、治疗或猫咪能力……"/><button type="submit" disabled={paused||hidden||advisorChat.loading||!question.trim()}>{advisorChat.loading?'思考中…':'询问'}</button></form></section>}
    {retreatOpen&&<div className="tunnel-modal"><section className="tunnel-dialog" role="dialog" aria-modal="true" aria-labelledby="tunnel-retreat-title"><h3 id="tunnel-retreat-title">让伙伴撤离本场？</h3><p>本场按失败结束；之后沿主流程回到准备阶段，重新挑战时六位伙伴恢复出战状态。</p><div><button type="button" autoFocus onClick={()=>setRetreatOpen(false)}>继续守护</button><button type="button" disabled={paused} data-testid="tunnel-confirm-retreat" onClick={()=>{setRetreatOpen(false);act({type:'SET_UI_PAUSE',paused:false});act({type:'RETREAT'});}}>确认撤离</button></div></section></div>}
  </section>;
}
