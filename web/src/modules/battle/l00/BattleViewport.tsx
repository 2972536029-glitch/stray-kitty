import {useEffect, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent} from 'react';
import type {BattleContext, BattleResult} from './types';
import type {Advice, CatId, CombatAction, CombatCatState, CombatPhase, CombatState, Position} from './state';
import {PrologueBattle} from './runtime';
import {getBattleSpeed, getDeployedCatCount} from './engine';
import {getAdvice} from './advisor';
import {COMMANDER_POSITION, CONFIG, DIFFICULTY_CONFIG, SKILLS, isSpawnCell} from './config';
import {getAttackCells, getSkillCells, isSkillTargetAllowed} from './ranges';
import {drawCat, paintBattle} from './painter';
import type {AnimationBook, CatKind, CatPose} from './painter';
import './battle.css';

interface Props {
  context:BattleContext;paused:boolean;onResult:(result:BattleResult)=>void;onStart?:()=>void;
  /** Prepare the host attempt before starting. A false result leaves the battle ready. */
  onBeforeStart?:()=>Promise<boolean>;
  /** Opt in to terminal completion; the default host contract remains explicit completion. */
  autoComplete?:boolean;
}
interface Drag {catId:CatId;pointerId:number;startX:number;startY:number;x:number;y:number}
interface Message {id:number;question?:string;advice:Advice}
const phaseNames:Record<CombatPhase,string>={ready:'序章 · 守住回家的路',hero_danger:'迷路的金吉拉',caster_rescue:'布偶赶来救援',teach_position:'让绒绒站在侧面',teach_move:'调整前排站位',teach_energy:'认识自动蓄能',skill_charge:'观察伙伴积攒能量',teach_guard_skill:'试试斑斑的罐盖护盾',teach_caster_skill:'为星绒绽放选择落点',battle:'一起守住防线',won:'伙伴们守住了小巷',failed:'本次守线结束'};
const guides:Partial<Record<CombatPhase,{step:number;title:string;text:string}>>={
  teach_position:{step:1,title:'把远程伙伴移到侧面',text:'我是军师阿策。把仍在场的绒绒移到高亮 A4 格：可以拖动，也可以点绒绒后点格子。伙伴体力归零就会本场退场，不能重新上阵。'},
  teach_move:{step:2,title:'把盾猫移到前排',text:'将斑斑拖到高亮 B5 格，也可以先点斑斑再点 B5。它能挡住两只黑影，让绒绒在旁边支援。战斗中把一只猫移到另一只猫的格子，还能交换站位。'},
  teach_energy:{step:3,title:'能量随战斗时间自动增长',text:`在场伙伴每秒自动积攒 ${CONFIG.ENERGY_PER_SECOND} 点能量，20 秒蓄满 100 点后保留，技能由你手动释放。攻击不额外加能量，暂停时停止蓄能。现在先从 0 观察；B6 木偶不会反击，也不计战绩。`},
  skill_charge:{step:3,title:'看，能量正在一点点变满',text:'即使没有攻击目标，在场伙伴也会自动蓄能。点猫查看时战斗临时以 ×0.5 继续，关闭菜单恢复所选速度。可以使用棋盘上方的速度与暂停按钮；两只猫蓄满后会停下等待你练习技能。'},
  teach_guard_skill:{step:4,title:'先点斑斑，再试试护盾图标',text:'点击斑斑，再点它身旁的护盾图标。消耗 100 能量，获得 60 点护盾，持续 8 秒。蓝色盾条先承伤，不会恢复绿色体力。技能释放后重新自动蓄能。'},
  teach_caster_skill:{step:5,title:'选择落点，左键释放星绒',text:'点击绒绒，再点身旁的星绒图标。浅青色表示可选中心，黄色十字是作用范围。让十字覆盖 B6 木偶后左键释放；右键或 Esc 取消，触摸可拖动后松手释放。正式战斗瞄准时以 ×1 继续，本步教学暂停等待操作。'},
};
const cellName=(position:Position)=>`${'ABC'[position.y]}${position.x+1}`;
const contains=(cells:Position[],x:number,y:number)=>cells.some(cell=>cell.x===x&&cell.y===y);
function CatPortrait({kind,pose='idle',size=64}:{kind:CatKind;pose?:CatPose;size?:number}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=ref.current?.getContext('2d');if(ctx){ctx.clearRect(0,0,96,96);drawCat(ctx,kind,0,0,96,pose);}},[kind,pose]);
  return <canvas className="btl-portrait" width={96} height={96} ref={ref} style={{width:size,height:size}} role="img" aria-label={`${kind==='hero'?'金吉拉':kind==='caster'?'布偶':kind==='guard'?'奶牛盾猫':'三花军师'}${pose==='sleep'?'，蜷缩':''}`}/>;
}
function CatHealth({cat}:{cat:CombatCatState}){
  const capacity=cat.maxHp+Math.max(0,cat.shield),healthWidth=Math.max(0,cat.hp/capacity)*100;
  return <span className="btl-health" aria-label={`体力 ${Math.ceil(cat.hp)} / ${cat.maxHp}${cat.shield>0?`，额外护盾 ${Math.ceil(cat.shield)}，剩余 ${Math.ceil(cat.shieldRemaining)} 秒`:''}`}><i style={{width:`${healthWidth}%`}}/>{cat.shield>0&&<b style={{left:`${cat.maxHp/capacity*100}%`,width:`${cat.shield/capacity*100}%`}}/>}</span>;
}
function CatEnergy({cat,compact=false}:{cat:CombatCatState;compact?:boolean}){
  const ready=cat.energy>=CONFIG.MAX_ENERGY;
  return <span className={`btl-energy${compact?' btl-energy-compact':''}${ready?' btl-energy-ready':''}`} role="meter" aria-label={`${cat.name}能量`} aria-valuemin={0} aria-valuemax={CONFIG.MAX_ENERGY} aria-valuenow={cat.energy} data-testid={`battle-energy-${cat.id}${compact?'-compact':''}`}><i style={{width:`${Math.min(100,cat.energy/CONFIG.MAX_ENERGY*100)}%`}}/>{!compact&&<span>{ready?'能量已满':`能量 ${Math.floor(cat.energy)} / ${CONFIG.MAX_ENERGY}`}</span>}</span>;
}

export function BattleViewport({context,paused,onResult,onStart,onBeforeStart,autoComplete=false}:Props){
  const [runtime]=useState(()=>new PrologueBattle({mode:'tutorial'}));
  const [game,setGame]=useState<CombatState|null>(null);
  const [selected,setSelected]=useState<CatId|null>(null);
  const [moveSelection,setMoveSelection]=useState<CatId|null>(null);
  const [skillTooltipOpen,setSkillTooltipOpen]=useState(false);
  const [drag,setDrag]=useState<Drag|null>(null);
  const [aimOutside,setAimOutside]=useState(false);
  const [chatOpen,setChatOpen]=useState(false);
  const [messages,setMessages]=useState<Message[]>([]);
  const [question,setQuestion]=useState('');
  const [submitted,setSubmitted]=useState(false);
  const [starting,setStarting]=useState(false);
  const [startError,setStartError]=useState('');
  const startingRef=useRef(false);
  const attemptRef=useRef(context.attempt.id);attemptRef.current=context.attempt.id;
  const inspectedCat=game?.inspectedCatId??null;
  const boardRef=useRef<HTMLDivElement>(null),canvasRef=useRef<HTMLCanvasElement>(null);
  const callbackRef=useRef(onResult);callbackRef.current=onResult;
  const pausedRef=useRef(paused);pausedRef.current=paused;
  const holdRef=useRef(false);holdRef.current=chatOpen||!!drag;
  const inspectedRef=useRef<CatId|null>(null);inspectedRef.current=inspectedCat;
  const dragRef=useRef<Drag|null>(null),aimPointerRef=useRef<number|null>(null);
  const suppressClick=useRef(false),suppressBoardClick=useRef(false);
  const animationRef=useRef<AnimationBook>(new Map());
  const messageId=useRef(0);
  const guideRef=useRef<HTMLDivElement>(null),chatLogRef=useRef<HTMLDivElement>(null);

  function clearPointers(){
    const pointerId=aimPointerRef.current;aimPointerRef.current=null;
    if(pointerId!==null&&boardRef.current?.hasPointerCapture(pointerId))boardRef.current.releasePointerCapture(pointerId);
    dragRef.current=null;setDrag(null);setAimOutside(false);
  }
  function closeInspection(){
    if(runtime.getSnapshot()?.inspectedCatId)runtime.dispatch({type:'CLOSE_INSPECTION'});
    inspectedRef.current=null;setSkillTooltipOpen(false);
  }
  useEffect(()=>{
    const unsubscribe=runtime.subscribe(setGame);
    runtime.start(context,result=>{setSubmitted(true);callbackRef.current(result);});
    runtime.pause(pausedRef.current||document.hidden);
    setSelected(null);setMoveSelection(null);closeInspection();clearPointers();setChatOpen(false);setMessages([]);setSubmitted(false);setStarting(false);setStartError('');startingRef.current=false;animationRef.current.clear();
    let frame=0,last=performance.now();
    const loop=(now:number)=>{const dt=Math.min((now-last)/1000,.1);last=now;if(!document.hidden&&!pausedRef.current&&!holdRef.current)runtime.tick(dt);frame=requestAnimationFrame(loop);};
    const visibility=()=>{last=performance.now();if(document.hidden){if(runtime.getSnapshot()?.skillAim)runtime.dispatch({type:'CANCEL_SKILL'});closeInspection();clearPointers();setMoveSelection(null);}runtime.pause(pausedRef.current||document.hidden);};
    document.addEventListener('visibilitychange',visibility);frame=requestAnimationFrame(loop);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility);unsubscribe();runtime.stop();};
    // A fresh server attempt starts a new battle; unrelated app renders must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[runtime,context.attempt.id]);
  useEffect(()=>{if(paused){if(runtime.getSnapshot()?.skillAim)runtime.dispatch({type:'CANCEL_SKILL'});closeInspection();clearPointers();setMoveSelection(null);}runtime.pause(paused||document.hidden);},[runtime,paused,context.attempt.id]);
  useEffect(()=>{if(autoComplete&&!paused&&!submitted&&(game?.phase==='won'||game?.phase==='failed'))runtime.complete();},[autoComplete,paused,submitted,game?.phase,game?.externallyPaused,runtime]);
  useEffect(()=>{if(game&&canvasRef.current){const ctx=canvasRef.current.getContext('2d');if(ctx)paintBattle(ctx,game,selected,animationRef.current);}},[game,selected]);
  useEffect(()=>{if(game?.advisor.visible&&messages.length===0)setMessages([{id:++messageId.current,advice:{title:'阿策 · 军师喵',text:'我会陪你观察战场。先完成站位和技能教学，之后可以问我怎么摆阵、怎样蓄能、伙伴退场后怎么办。'}}]);},[game?.advisor.visible,messages.length]);
  useEffect(()=>{if(game&&guides[game.phase])guideRef.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[game?.phase]);
  useEffect(()=>{const log=chatLogRef.current;if(log)log.scrollTop=log.scrollHeight;},[messages.length,chatOpen]);
  useEffect(()=>{
    const cancel=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;if(runtime.getSnapshot()?.skillAim){event.preventDefault();runtime.dispatch({type:'CANCEL_SKILL'});clearPointers();}else if(inspectedRef.current){event.preventDefault();closeInspection();}else setMoveSelection(null);};
    const cancelWithMouse=(event:MouseEvent)=>{if(!runtime.getSnapshot()?.skillAim)return;event.preventDefault();runtime.dispatch({type:'CANCEL_SKILL'});clearPointers();};
    document.addEventListener('keydown',cancel);document.addEventListener('contextmenu',cancelWithMouse);
    return()=>{document.removeEventListener('keydown',cancel);document.removeEventListener('contextmenu',cancelWithMouse);};
  },[runtime]);
  useEffect(()=>{if(!game?.skillAim){clearPointers();}},[game?.skillAim?.catId]);
  useEffect(()=>{closeInspection();setMoveSelection(null);},[game?.phase]);
  const inspectedStatus=game?.cats.find(cat=>cat.id===inspectedCat)?.status;
  useEffect(()=>{if(inspectedCat&&inspectedStatus!=='active')closeInspection();},[inspectedCat,inspectedStatus]);
  useEffect(()=>{setSkillTooltipOpen(false);},[inspectedCat]);
  if(!game)return <div className="battle-l00 btl-loading">正在整理战斗地格……</div>;

  const blocked=paused||game.externallyPaused||submitted||starting;
  const guide=guides[game.phase];
  const difficulty=DIFFICULTY_CONFIG[game.difficulty];
  const difficultyText=`${difficulty.label} · 黑影体力 ${Math.round(difficulty.enemyHpMultiplier*100)}%`;
  const active=game.cats.filter(cat=>cat.status==='active'&&cat.x>=0);
  const battleCats=game.cats.filter(cat=>cat.combatant);
  const deployedCount=getDeployedCatCount(game);
  const isBattle=game.phase==='battle',aim=game.skillAim;
  const runningPhase=['hero_danger','caster_rescue','skill_charge','battle'].includes(game.phase);
  const terminal=game.phase==='won'||game.phase==='failed';
  const effectiveSpeed=blocked||chatOpen||drag?0:getBattleSpeed(game);
  const baseSpeedText=`基础 ×${game.playbackSpeed}`;
  const speedStatus=blocked?`${submitted?'本次战斗结束':'外部暂停'} · ${baseSpeedText}`:game.phase==='ready'?`尚未开始 · ${baseSpeedText}`:terminal?`本次战斗结束 · ${baseSpeedText}`:!runningPhase?`教学等待操作，战斗暂停 · ${baseSpeedText}`:game.paused?`手动暂停 · ${baseSpeedText}`:chatOpen?`与军师交流中，战斗暂停 · ${baseSpeedText}`:drag?`移动猫咪中，战斗暂停 · ${baseSpeedText}`:`当前 ×${effectiveSpeed}${aim?' · 技能瞄准':inspectedCat?' · 查看伙伴':''} · ${baseSpeedText}`;
  const aimCat=aim?game.cats.find(cat=>cat.id===aim.catId):undefined;
  const selectedCat=game.cats.find(cat=>cat.id===selected&&cat.status==='active'&&cat.combatant);
  const inspected=game.cats.find(cat=>cat.id===inspectedCat&&cat.status==='active'&&cat.combatant);
  const inspectedSkill=inspected&&inspected.id!=='hero'?SKILLS[inspected.id]:null;
  const attackCells=selectedCat?getAttackCells(selectedCat):[];
  const skillCells=aimCat?getSkillCells(aimCat,aim?.target):[];
  const movementPhase=isBattle||game.phase==='teach_move'||game.phase==='teach_position';
  const skillsIntroduced=['teach_energy','skill_charge','teach_guard_skill','teach_caster_skill','battle','won','failed'].includes(game.phase);
  const dispatch=(action:CombatAction)=>{if(!blocked)runtime.dispatch(action);};
  const skillTeaching=(cat:CombatCatState)=>game.phase==='teach_guard_skill'&&cat.id==='guard'||game.phase==='teach_caster_skill'&&cat.id==='caster';
  const canCast=(cat:CombatCatState)=>cat.id!=='hero'&&!blocked&&!game.paused&&!chatOpen&&!aim&&cat.status==='active'&&cat.energy>=SKILLS[cat.id].cost&&(isBattle||skillTeaching(cat));
  const canMove=(cat:CombatCatState)=>!blocked&&!chatOpen&&!aim&&cat.combatant&&cat.status==='active'&&(isBattle||game.phase==='teach_position'&&cat.id==='caster'||game.phase==='teach_move'&&cat.id==='guard');
  const canInspect=(cat:CombatCatState)=>!blocked&&!terminal&&!chatOpen&&!aim&&cat.combatant&&cat.status==='active';
  const selectable=(cat:CombatCatState)=>canMove(cat)||canInspect(cat);
  function catClick(cat:CombatCatState){
    if(suppressClick.current){suppressClick.current=false;return;}
    if(!selectable(cat))return;
    if(moveSelection&&cat.status==='active'&&cat.combatant){place(moveSelection,cat.x,cat.y);return;}
    setSelected(cat.id);setMoveSelection(null);
    if(skillsIntroduced&&canInspect(cat)){
      dispatch({type:'INSPECT_CAT',catId:cat.id});inspectedRef.current=runtime.getSnapshot()?.inspectedCatId??null;setSkillTooltipOpen(false);
    }else setMoveSelection(cat.id);
  }
  function place(catId:CatId,x:number,y:number){
    if(aim)return;
    const current=runtime.getSnapshot(),cat=current?.cats.find(item=>item.id===catId);if(!cat)return;
    dispatch({type:'MOVE_CAT',catId,x,y});
    if(runtime.getSnapshot()?.lastAction?.ok){setSelected(catId);setMoveSelection(null);}
  }
  function cellClick(x:number,y:number,pointerClick:boolean){
    if(suppressBoardClick.current&&pointerClick){suppressBoardClick.current=false;return;}
    if(blocked||chatOpen)return;
    // Pointer gestures release in finishAim; the following click must not cast twice.
    if(runtime.getSnapshot()?.skillAim){if(!pointerClick)castAt({x,y});return;}
    if(inspectedRef.current){closeInspection();return;}
    const catId=game!.phase==='teach_position'?'caster':game!.phase==='teach_move'?'guard':moveSelection;
    if(catId)place(catId,x,y);
  }
  function pointerDown(event:ReactPointerEvent<HTMLButtonElement>,cat:CombatCatState){
    event.stopPropagation();
    if(!canMove(cat)||event.button!==0)return;
    closeInspection();
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);suppressClick.current=false;suppressBoardClick.current=false;setSelected(cat.id);
    const next={catId:cat.id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY};
    dragRef.current=next;holdRef.current=true;setDrag(next);
  }
  function pointerMove(event:ReactPointerEvent<HTMLButtonElement>){
    const current=dragRef.current;if(!current||current.pointerId!==event.pointerId)return;
    if(Math.hypot(event.clientX-current.startX,event.clientY-current.startY)>7)setMoveSelection(null);
    const next={...current,x:event.clientX,y:event.clientY};dragRef.current=next;setDrag(next);
  }
  function boardPosition(clientX:number,clientY:number):Position|null{
    const rect=boardRef.current?.getBoundingClientRect();
    if(!rect||clientX<rect.left||clientX>=rect.right||clientY<rect.top||clientY>=rect.bottom)return null;
    return{x:Math.floor((clientX-rect.left)/rect.width*CONFIG.COLUMNS),y:Math.floor((clientY-rect.top)/rect.height*CONFIG.ROWS)};
  }
  function finishDrag(event:ReactPointerEvent<HTMLButtonElement>,cancel=false){
    const current=dragRef.current;if(!current||current.pointerId!==event.pointerId)return;
    const moved=Math.hypot(event.clientX-current.startX,event.clientY-current.startY)>7;
    const position=boardPosition(event.clientX,event.clientY);
    if(!cancel&&moved&&!blocked&&position)place(current.catId,position.x,position.y);
    suppressClick.current=moved&&!cancel;dragRef.current=null;holdRef.current=chatOpen;setDrag(null);
    window.setTimeout(()=>{suppressClick.current=false;},0);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function previewAt(position:Position|null){
    const current=runtime.getSnapshot(),currentAim=current?.skillAim;
    if(!currentAim||blocked)return false;
    const cat=current.cats.find(item=>item.id===currentAim.catId);
    const valid=!!position&&!!cat&&isSkillTargetAllowed(cat,position);
    setAimOutside(!valid);
    if(valid&&position){
      if(currentAim.target?.x!==position.x||currentAim.target.y!==position.y)dispatch({type:'AIM_SKILL',...position});
    }else if(currentAim.target)dispatch({type:'CLEAR_SKILL_TARGET'});
    return valid;
  }
  function castAt(position:Position|null){
    if(!previewAt(position)||!position)return;
    const currentAim=runtime.getSnapshot()?.skillAim;
    if(currentAim)dispatch({type:'CAST_SKILL',catId:currentAim.catId,...position});
  }
  function aimDown(event:ReactPointerEvent<HTMLDivElement>){
    if(!runtime.getSnapshot()?.skillAim||blocked||event.button!==0)return;
    event.preventDefault();suppressBoardClick.current=false;aimPointerRef.current=event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);previewAt(boardPosition(event.clientX,event.clientY));
  }
  function aimMove(event:ReactPointerEvent<HTMLDivElement>){
    if(!runtime.getSnapshot()?.skillAim||blocked)return;
    if(event.pointerType==='touch'&&aimPointerRef.current!==event.pointerId)return;
    previewAt(boardPosition(event.clientX,event.clientY));
  }
  function finishAim(event:ReactPointerEvent<HTMLDivElement>,cancel=false){
    if(aimPointerRef.current!==event.pointerId||(!cancel&&event.button!==0))return;
    event.preventDefault();
    const position=!cancel&&!blocked?boardPosition(event.clientX,event.clientY):null;
    suppressBoardClick.current=true;aimPointerRef.current=null;
    window.setTimeout(()=>{suppressBoardClick.current=false;},0);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(position)castAt(position);else previewAt(null);
  }
  function cellKey(event:ReactKeyboardEvent<HTMLButtonElement>,x:number,y:number){
    const directions:Record<string,Position>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};
    const direction=directions[event.key];if(!direction)return;
    event.preventDefault();let next={x:x+direction.x,y:y+direction.y};
    while(next.x>=0&&next.x<CONFIG.COLUMNS&&next.y>=0&&next.y<CONFIG.ROWS){
      const button=boardRef.current?.querySelector<HTMLButtonElement>(`[data-testid="battle-cell-${cellName(next)}"]`);
      if(button&&!button.disabled){button.focus();break;}next={x:next.x+direction.x,y:next.y+direction.y};
    }
  }
  function chooseSkill(cat:CombatCatState){
    if(!canCast(cat)||cat.id==='hero'){setSkillTooltipOpen(true);return;}
    setSelected(cat.id);setAimOutside(false);suppressBoardClick.current=false;
    if(SKILLS[cat.id].targeting==='area')dispatch({type:'SELECT_SKILL',catId:cat.id});
    else dispatch({type:'CAST_SKILL',catId:cat.id});
    if(runtime.getSnapshot()?.lastAction?.ok)closeInspection();
  }
  async function startOrPause(){
    if(blocked||startingRef.current)return;
    if(game!.phase==='ready'){
      const attemptId=context.attempt.id;
      startingRef.current=true;setStarting(true);setStartError('');
      try{
        const allowed=onBeforeStart?await onBeforeStart():true;
        if(!allowed||attemptRef.current!==attemptId||runtime.getSnapshot()?.phase!=='ready')return;
        runtime.pause(pausedRef.current||document.hidden);
        runtime.dispatch({type:'START'});
        if(runtime.getSnapshot()?.phase==='hero_danger')onStart?.();
      }catch{setStartError('开战准备未完成，请稍后重试。');}
      finally{startingRef.current=false;setStarting(false);}
    }else dispatch({type:'PAUSE'});
  }
  function ask(text:string){if(blocked||aim||!text.trim())return;const current=runtime.getSnapshot();if(!current)return;setMessages(old=>[...old,{id:++messageId.current,question:text.trim().slice(0,500),advice:getAdvice(current,text)}]);setQuestion('');}
  const moveHandlers=(cat:CombatCatState)=>({onPointerDown:(event:ReactPointerEvent<HTMLButtonElement>)=>pointerDown(event,cat),onPointerMove:pointerMove,onPointerUp:(event:ReactPointerEvent<HTMLButtonElement>)=>finishDrag(event),onPointerCancel:(event:ReactPointerEvent<HTMLButtonElement>)=>finishDrag(event,true),onLostPointerCapture:()=>{if(dragRef.current?.catId===cat.id){dragRef.current=null;holdRef.current=chatOpen;setDrag(null);}}});
  const proactive=guide?.text??(game.phase==='won'?'守住了！点击完成战斗，查看本次结果。':`现在是${difficulty.label}实战。斑斑挡 2 只，绒绒在旁边支援；能量满后记得挑时机用技能。`);
  const teamPanel=<aside className="btl-team" aria-label="出战伙伴状态"><small>出战伙伴</small><div className="btl-team-list">{battleCats.length?battleCats.map(cat=><div key={cat.id} className={`btl-team-cat${cat.status==='retired'?' btl-retired':''}`} data-testid={`battle-member-${cat.id}`}><CatPortrait kind={cat.id} size={46}/><strong>{cat.name}</strong><CatHealth cat={cat}/><span>{Math.ceil(cat.hp)} / {cat.maxHp}</span><em>{cat.status==='retired'?'本场已退场':'在场'}</em></div>):<p>伙伴正在赶来</p>}</div><p>血量归零后本场退场</p></aside>;
  return <section className={`battle-l00${guide?' btl-teaching':''}`} aria-label="序章塔防战斗" data-phase={game.phase} data-inspecting={inspectedCat??undefined} data-effective-speed={effectiveSpeed} data-playback-speed={game.playbackSpeed} data-battle-time={game.time.toFixed(3)} onPointerDown={event=>{if(inspectedRef.current&&!(event.target as HTMLElement).closest('.btl-unit,.btl-cat-menu,.btl-playback'))closeInspection();}}>
    {startError&&<p role="alert">{startError}</p>}
    <div className="btl-head"><div><span className="btl-eyebrow">PROLOGUE · CAT DEFENSE</span><strong>{phaseNames[game.phase]}</strong></div><div className="btl-progress"><span data-testid="battle-enemy-progress" aria-label={`全程共 ${game.totalEnemies} 只黑影，已有 ${game.defeated+game.escaped} 只离场，包含开场救援，不含练习木偶`}>黑影已离场 {game.defeated+game.escaped} / {game.totalEnemies}<small>含开场救援 · 木偶不计</small></span><span aria-label={`已漏过 ${game.leaks} 只黑影，最多 ${game.maxLeaks} 次`}>防线 {'●'.repeat(Math.max(0,game.maxLeaks-game.leaks))}{'○'.repeat(Math.min(game.maxLeaks,game.leaks))}</span></div></div>
    <div className="btl-wave-status"><strong data-testid="battle-wave-progress">{game.wave>0?`第 ${game.wave} / ${game.totalWaves} 波`:`救援与教学 · 实战共 ${game.totalWaves} 波`}</strong><span data-testid="battle-wave-status">{isBattle&&game.nextWaveIn!==null?`下一波 ${Math.max(0,Math.ceil(game.nextWaveIn))} 秒后${effectiveSpeed===0?'（已暂停）':''}`:game.phase==='won'?'所有波次已完成':game.phase==='failed'?'本次守线结束':game.wave===0?'完成五步教学后开始守线':'黑影从 B7 进入'}</span></div>
    <div className="btl-subhead"><span>3 行 × 7 列 · 19 格可部署</span><span data-testid="battle-deployed-count">已上阵 {deployedCount}/{CONFIG.MAX_DEPLOYED_CATS} · 主角和军师不占位</span><span>猫咪朝右 → · 右侧来敌</span></div>
    <div className="btl-difficulty-strip" role="status" aria-label="本次战斗难度"><strong>{difficulty.label} · 新手教学</strong><span>{game.phase==='battle'?`教学已完成 · ${difficultyText} · 3 次突破或全员退场则失败`:game.phase==='won'?'本次守线完成':game.phase==='ready'?`救援与教学固定，教学后进入${difficulty.label}实战`:'固定教学阶段 · 练习木偶不计入黑影战绩'}</span></div>
    {guide&&<div className="btl-tutorial" ref={guideRef} role="status"><CatPortrait kind="advisor" size={58}/><div><small>军师阿策 · 新手引导 {guide.step} / 5 · {speedStatus}</small><strong>{guide.title}</strong><p>{guide.text}</p>{game.phase==='teach_energy'&&<button className="btl-practice-button btl-focus" data-testid="battle-begin-skill-practice" disabled={blocked} onClick={()=>{closeInspection();dispatch({type:'BEGIN_SKILL_PRACTICE'});}}>开始蓄能练习</button>}</div></div>}
    <div className="btl-arena">
      <div className="btl-command" aria-label="伙伴状态与军师区域">{teamPanel}{game.advisor.visible?<div className="btl-advisor"><button className="btl-advisor-cat" disabled={blocked||!!guide||!!aim||!!inspectedCat} onClick={()=>setChatOpen(true)} aria-label="与军师阿策交谈"><CatPortrait kind="advisor"/><strong>阿策 · 军师喵</strong></button><button className="btl-small-bubble" disabled={blocked||!!guide||!!aim||!!inspectedCat} onClick={()=>setChatOpen(true)} aria-label="打开军师建议">{proactive}<small>{guide?'正在带你完成教学':'点我聊聊 →'}</small></button></div>:<p className="btl-advisor-await">军师伙伴<br/>还在赶来</p>}</div>
      <div className="btl-board-column">
        <div className="btl-playback" role="group" aria-label="战斗速度与开始暂停" onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
          <button className={game.playbackSpeed===.5?'btl-speed-selected':''} data-testid="battle-speed-half" aria-label="选择半速 ×0.5" aria-pressed={game.playbackSpeed===.5} disabled={blocked||terminal} onClick={()=>dispatch({type:'SET_SPEED',speed:.5})}>×0.5</button>
          <button className={game.playbackSpeed!==.5?'btl-speed-selected':''} data-testid="battle-speed-toggle" aria-label={`常速或倍速，当前基础 ×${game.playbackSpeed}，点击选择 ×${game.playbackSpeed===1?2:1}`} aria-pressed={game.playbackSpeed!==.5} disabled={blocked||terminal} onClick={()=>dispatch({type:'SET_SPEED',speed:game.playbackSpeed===1?2:1})}>{game.playbackSpeed===.5?'×1 / ×2':`×${game.playbackSpeed}`}</button>
          <button className="btl-play-toggle" data-testid="battle-play-toggle" aria-label={game.phase==='ready'?'开始序章战斗':game.paused?'开始，继续战斗':'暂停战斗'} disabled={blocked||terminal||chatOpen||game.phase!=='ready'&&!runningPhase} onClick={startOrPause}>{game.phase==='ready'||game.paused||!runningPhase?'开始':'暂停'}</button>
          <span data-testid="battle-speed-status" role="status">{speedStatus}</span>
        </div>
        <div className={`btl-board${aim?' btl-board-aiming':''}`} ref={boardRef} data-testid="battle-board" onPointerDown={aimDown} onPointerMove={aimMove} onPointerLeave={()=>previewAt(null)} onPointerUp={event=>finishAim(event)} onPointerCancel={event=>finishAim(event,true)} onLostPointerCapture={()=>{if(aimPointerRef.current!==null){aimPointerRef.current=null;previewAt(null);}}}>
          <canvas width={700} height={300} ref={canvasRef} aria-hidden="true"/>
          <div className="btl-cells" role="group" aria-label={aim?'技能瞄准，全地图 21 格均可选择中心，鼠标移动预览最多 5 格十字，左键释放，右键或 Esc 取消；方向键预览，回车释放':'3 行 7 列战斗地格，B1 为固定保护终点，B7 为唯一出怪口，禁止部署，19 格可部署'}>{Array.from({length:21},(_,i)=>{
            const x=i%7,y=Math.floor(i/7),name=cellName({x,y}),goal=x===COMMANDER_POSITION.x&&y===COMMANDER_POSITION.y,spawn=isSpawnCell(x,y);
            const highlighted=game.phase==='teach_position'&&x===3&&y===0||game.phase==='teach_move'&&x===4&&y===1;
            const targetAllowed=!!aimCat&&isSkillTargetAllowed(aimCat,{x,y});
            const allowed=aim?targetAllowed:!goal&&!spawn&&movementPhase&&!chatOpen&&(!guide||highlighted);
            const effect=contains(skillCells,x,y),attack=contains(attackCells,x,y),target=aim?.target?.x===x&&aim.target.y===y;
            return <button key={name} className={`btl-cell${goal?' btl-goal':''}${spawn?' btl-spawn':''}${highlighted?' btl-focus':''}${aim&&targetAllowed?' btl-aim-allowed':''}${effect?' btl-skill-effect':''}${target?' btl-aim-center':''}`}
              aria-label={`地格 ${name}${aim?`${targetAllowed?'，可选技能中心':'，超出可选范围'}${effect?'，技能覆盖':''}${target?'，当前落点':''}`:goal?'，保护终点，禁止部署':spawn?'，本关出怪口，禁止部署':attack?'，普通攻击可达':''}`} aria-pressed={aim?target:undefined}
              data-testid={`battle-cell-${name}`} data-attack-range={attack||undefined} data-skill-range={effect||undefined} disabled={blocked||!allowed}
              onClick={event=>cellClick(x,y,event.detail!==0)} onKeyDown={event=>cellKey(event,x,y)} onFocus={()=>{if(runtime.getSnapshot()?.skillAim)previewAt({x,y});}}>
              <span className="btl-sr-only">{name}</span>{goal&&!aim&&<span className="btl-goal-marker">保护 B1</span>}{spawn&&!aim&&<span className="btl-spawn-marker btl-spawn-current"><b aria-hidden="true">‹</b>本关入口</span>}{highlighted&&<span className="btl-cell-marker">放在这里</span>}{target&&<span className="btl-aim-crosshair" aria-hidden="true">＋</span>}
            </button>;
          })}</div>
          {inspected&&<button className="btl-inspect-dismiss" aria-label="关闭猫咪菜单并返回战场" data-testid="battle-dismiss-cat-menu" onClick={closeInspection}/>}
          {active.map(cat=><button key={cat.id} className={`btl-unit${cat.id==='hero'?' btl-hero-unit':''}${selected===cat.id?' btl-selected':''}${game.phase==='teach_move'&&cat.id==='guard'||skillTeaching(cat)&&inspectedCat!==cat.id&&!aim?' btl-focus':''}`} style={{left:`${cat.x/7*100}%`,top:`${cat.y/3*100}%`}} aria-label={`${cat.name}，${cat.breed}，体力 ${Math.ceil(cat.hp)} / ${cat.maxHp}，${cellName(cat)}，${cat.combatant?`阻挡 ${cat.blockedCount} / ${cat.maxBlocks}，能量 ${Math.floor(cat.energy)} / 100${cat.shield>0?`，护盾 ${Math.ceil(cat.shield)}`:''}`:'固定指挥，不攻击，不可移动'}`} data-testid={`battle-cat-${cat.id}`} disabled={!selectable(cat)} onClick={()=>catClick(cat)} {...moveHandlers(cat)}><span className="btl-unit-name">{cat.name}{cat.combatant&&<small>挡 {cat.blockedCount}/{cat.maxBlocks}</small>}</span><CatHealth cat={cat}/>{cat.combatant&&<CatEnergy cat={cat} compact/>}{cat.shield>0&&<span className="btl-unit-shield">盾 {Math.ceil(cat.shield)}</span>}</button>)}
          {game.enemies.filter(enemy=>enemy.training).map(enemy=><span key={enemy.id} className="btl-training-label" style={{left:`${(enemy.x+.5)/7*100}%`,top:`${enemy.y/3*100}%`}}>练习木偶<small>不反击</small></span>)}
          {inspected&&inspectedSkill&&<>
            <div className="btl-cat-menu" role="group" aria-label={`${inspected.name}的技能菜单，查看时临时半速，教学和手动暂停优先`} data-testid="battle-cat-menu" style={{left:inspected.x<3?`calc(${(inspected.x+1)/7*100}% + 3px)`:`calc(${inspected.x/7*100}% - 95px)`,top:`clamp(6px, calc(${(inspected.y+.5)/3*100}% - 46px), calc(100% - 98px))`}} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
              <div className="btl-cat-menu-heading"><strong>{inspected.name}</strong><button className="btl-cat-menu-close" data-testid="battle-close-cat-menu" aria-label="关闭猫咪菜单" onClick={closeInspection}>×</button></div>
              <button className={`btl-skill-orb${canCast(inspected)?' btl-skill-orb-ready':''}${skillTeaching(inspected)&&canCast(inspected)?' btl-focus':''}`} data-testid={`battle-skill-${inspected.id}`} aria-label={`${inspectedSkill.name}，能量 ${Math.floor(inspected.energy)} / ${inspectedSkill.cost}${canCast(inspected)?'，点击释放':'，当前不可释放，可查看说明'}`} aria-disabled={!canCast(inspected)} aria-describedby={`battle-skill-description-${inspected.id}`} onMouseEnter={()=>setSkillTooltipOpen(true)} onMouseLeave={event=>{if(document.activeElement!==event.currentTarget)setSkillTooltipOpen(false);}} onFocus={()=>setSkillTooltipOpen(true)} onBlur={()=>setSkillTooltipOpen(false)} onClick={()=>chooseSkill(inspected)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges">{inspected.id==='guard'?<><path d="M5 3h14v11h-2v3h-3v3h-4v-3H7v-3H5z"/><path className="btl-skill-icon-cut" d="M8 6h8v7h-2v3h-4v-3H8z"/></>:<><path d="M10 2h4v6h3v3h5v3h-5v3h-3v5h-4v-5H7v-3H2v-3h5V8h3z"/><path className="btl-skill-icon-cut" d="M10 10h4v4h-4z"/></>}</svg>
              </button>
              <div className="btl-cat-menu-footer"><span>{Math.floor(inspected.energy)} / {inspectedSkill.cost}</span>{isBattle&&<button className="btl-cat-move" data-testid="battle-move-selected" disabled={!canMove(inspected)} onClick={()=>{setMoveSelection(inspected.id);setSelected(inspected.id);closeInspection();}} aria-label={`移动${inspected.name}，随后选择地格`}>移动</button>}</div>
            </div>
            <div className={`btl-skill-tooltip${skillTooltipOpen?' btl-tooltip-visible':''}`} role="tooltip" id={`battle-skill-description-${inspected.id}`} data-testid="battle-skill-tooltip" style={{left:`clamp(6px, ${inspected.x/7*100}%, calc(100% - 234px))`}} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
              <small>{inspected.name} · {inspected.role} · {effectiveSpeed===0?'当前暂停':'查看时 ×0.5'}</small><strong>{inspectedSkill.name}</strong>
              <p>{inspectedSkill.targeting==='self'?`自身获得 ${inspectedSkill.shield} 点额外护盾，持续 ${inspectedSkill.duration} 秒。护盾先承伤，不恢复体力。`:`全地图任选中心，黄色十字最多作用 5 格，每个目标 ${inspectedSkill.damage} 伤害。鼠标移动预览，左键释放，右键取消；触摸可拖动后松手释放。`}</p>
              <CatEnergy cat={inspected}/><span className="btl-tooltip-status">消耗 {inspectedSkill.cost} 能量 · {blocked||game.paused?'暂停期间不可释放':canCast(inspected)?'已就绪，点击圆形图标释放':inspected.energy<inspectedSkill.cost?`尚未蓄满，每秒自动 +${CONFIG.ENERGY_PER_SECOND}`:'按新手引导依次练习'}</span>
              {inspected.shield>0&&<span className="btl-shield-detail" data-testid={`battle-shield-${inspected.id}`}>额外护盾 {Math.ceil(inspected.shield)} · 剩余 {inspected.shieldRemaining.toFixed(1)} 秒</span>}
            </div>
          </>}
          {game.phase==='ready'&&<div className="btl-board-intro"><CatPortrait kind="hero" size={60}/><div><h2>陪喵喵守住这段路</h2><p>观察伙伴救援，学习站位、自动蓄能与技能。<br/>本次难度：{difficulty.label} · 血量归零后本场退场</p><button disabled={blocked} onClick={startOrPause}>开始序章战斗</button></div></div>}
        </div>
        <div className="btl-range-legend" aria-label="范围图例"><span><i/>灰绿 · 普攻可达，单体攻击</span><span><i className="btl-legend-aim"/>浅青 · 可释放中心区域</span><span><i className="btl-legend-effect"/>黄色 · 技能作用范围</span></div>
        <p className="btl-board-caption" data-testid={aim?'battle-skill-aim':undefined}>{aim?<><span>{aimOutside?'已移出地图，预览已清空 · ':''}全地图任选中心 · 黄色十字最多作用 5 格 · 左键释放 · 右键 / Esc 取消</span><button className="btl-quiet btl-inline-cancel" data-testid="battle-cancel-skill" disabled={blocked} onClick={()=>{dispatch({type:'CANCEL_SKILL'});clearPointers();}}>取消</button></>:moveSelection?`正在移动${game.cats.find(cat=>cat.id===moveSelection)?.name}：选择可部署地格 · Esc 取消`:inspected?`查看${inspected.name}中 · 临时 ×0.5（暂停优先）· 点击空白、× 或 Esc 关闭`:selectedCat?`${selectedCat.name}普攻：${selectedCat.id==='guard'?'自身＋前方1格＋两侧各1格（朝右）':'宽 3 格、向前含自身列共 4 列的矩形'}`:'点击猫咪以 ×0.5 查看技能 · 也可直接拖动猫咪换位'}<br/>{aim?`${effectiveSpeed===0?'当前暂停；恢复运行后瞄准为 ×1':'瞄准以 ×1 继续战斗'} · 移动鼠标或触摸拖动预览 · 方向键预览 / Enter 释放`:'本关从 B7 来敌 · B7 是唯一出怪口，禁止部署'}</p>
      </div>
    </div>
    <div className="btl-controls"><p role="status">{blocked?'战斗已暂停。':game.lastAction?.type==='INSPECT_CAT'&&!inspectedCat?speedStatus:game.lastAction?.reason??'先观察喵喵的遭遇，伙伴很快就会赶来。'}{!blocked&&(game.paused||chatOpen||aim||inspectedCat)&&<small>{speedStatus}</small>}</p></div>
    {chatOpen&&<section className="btl-chat" aria-label="军师阿策聊天"><div className="btl-panel-heading"><span><strong>阿策的战术小纸条</strong><small>本地规则顾问 · 只参考眼前战况</small></span><button className="btl-quiet" disabled={blocked} onClick={()=>setChatOpen(false)}>收起聊天</button></div><div className="btl-chat-log" aria-live="polite" ref={chatLogRef}>{messages.map(message=>{
      const advice=message.advice;
      return <div key={message.id}>{message.question&&<p className="btl-question">{message.question}</p>}<article><strong>{advice.title}</strong><p>{advice.text}</p></article></div>;
    })}</div><div className="btl-suggestions">{['现在怎么摆阵？','伙伴退场怎么办？','怎样蓄能？','猫咪有什么能力？'].map(text=><button key={text} disabled={blocked} onClick={()=>ask(text)}>{text}</button>)}</div><form onSubmit={event=>{event.preventDefault();ask(question);}}><label className="btl-sr-only" htmlFor="battle-question">询问军师</label><input id="battle-question" value={question} disabled={blocked} onChange={event=>setQuestion(event.target.value)} maxLength={500} placeholder="问问阵型、退场、蓄能或猫咪能力……"/><button disabled={blocked||!question.trim()}>询问</button></form></section>}
    {(game.phase==='won'||game.phase==='failed')&&<div className="btl-milestone"><CatPortrait kind="hero" size={70}/><div><h2>{game.phase==='won'?'大家一起守住了！':'伙伴们已经撤离'}</h2><p>{game.phase==='won'?'站位、移动、自动蓄能与技能释放都学会了。本次战斗已经完成。':'防线被突破或伙伴全部退场。本场已经结束，结算后可重新挑战。'}</p><button disabled={blocked} onClick={()=>runtime.complete()}>{submitted?'战斗结果已提交':'完成战斗'}</button></div></div>}
    {drag&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>7&&<div className="btl-drag-ghost" style={{left:drag.x,top:drag.y}}><CatPortrait kind={drag.catId} size={70}/></div>}
  </section>;
}

export default BattleViewport;
