import {useEffect,useRef,useState} from 'react';
import type {Catalog,GameCommand,GameState} from '../../contracts';
import type {DemoScene} from '../../examples/demo/scene';
import {currentHomeRenovation,repairBalance,repairRequirements,REPAIR_COST_LABELS} from './repairs';
import {playSound} from '../../ui/soundEffects';
import './repairs.css';

interface Props {scene:DemoScene;state:GameState;catalog:Catalog;busy:boolean;pending:boolean;error:string;onRepair:(c:GameCommand)=>Promise<boolean>;onRetry:()=>void;onActivityChange?:(activity:{renovating:boolean;repairCardOpen:boolean})=>void}
export default function HomeRepairOverlay({scene,state,catalog,busy,pending,error,onRepair,onRetry,onActivityChange}:Props){
  const project=currentHomeRenovation(state,catalog),parts=project?.parts??[];
  const [selected,setSelected]=useState(''),[message,setMessage]=useState(''),[renovating,setRenovating]=useState(scene.homeRenovating);
  const root=useRef<HTMLDivElement>(null),inFlight=useRef(false);
  const part=parts.find(p=>p.id===selected&&!state.homeRepairs?.includes(p.id));
  useEffect(()=>{onActivityChange?.({renovating,repairCardOpen:!!part});},[renovating,part,onActivityChange]);
  useEffect(()=>()=>onActivityChange?.({renovating:false,repairCardOpen:false}),[onActivityChange]);
  const locked=busy||pending||renovating,requirement=part&&repairRequirements(state,part);
  useEffect(()=>{
    let frame=0,wasRenovating=scene.homeRenovating;setRenovating(wasRenovating);
    const position=()=>{
      if(wasRenovating!==scene.homeRenovating){wasRenovating=scene.homeRenovating;setRenovating(wasRenovating);}
      const bounds=scene.homeCanvas.getBoundingClientRect();
      const menuBottom=document.querySelector('.fixed-game-menu')?.getBoundingClientRect().bottom??70;
      for(const p of parts){
        const marker=root.current?.querySelector<HTMLElement>(`[data-repair-id="${p.id}"]`);if(!marker)continue;
        const point=scene.homeWorldToClient(p.x,p.y),scale=Number(getComputedStyle(marker).zoom)||1;
        const width=marker.offsetWidth*scale,height=marker.offsetHeight*scale;
        marker.style.left=Math.max(bounds.left+width/2+12,Math.min(bounds.right-width/2-12,point.x))/scale+'px';
        marker.style.top=Math.max(menuBottom+height/2+16,Math.min(bounds.bottom-height/2-16,point.y))/scale+'px';
        marker.hidden=wasRenovating||point.x<bounds.left+18||point.x>bounds.right-18||point.y<bounds.top+20||point.y>bounds.bottom-32;
      }
      if(part){const card=root.current?.querySelector<HTMLElement>('.home-repair-card'),marker=root.current?.querySelector<HTMLElement>(`[data-repair-id="${part.id}"]`);if(card){
        const p=marker?.getBoundingClientRect(),anchor=p?{x:p.left+p.width/2,y:p.top}:scene.homeWorldToClient(part.x,part.y),half=(p?.width??220)/2;
        const scale=Number(getComputedStyle(card).zoom)||1,width=card.offsetWidth*scale,height=card.offsetHeight*scale;
        const right=anchor.x+half+18,left=right+width<window.innerWidth-16?right:anchor.x-half-width-18;
        card.style.left=Math.max(16,Math.min(window.innerWidth-width-16,left))/scale+'px';card.style.top=Math.max(menuBottom+16,Math.min(window.innerHeight-height-18,anchor.y))/scale+'px';
      }}
      frame=requestAnimationFrame(position);
    };position();return()=>cancelAnimationFrame(frame);
  },[scene,project,part]);
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(!locked&&!(event.target as HTMLElement).closest('.home-repair-spot,.home-repair-card'))setSelected('');};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!locked)setSelected('');};
    window.addEventListener('pointerdown',close);window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key);};
  },[locked]);
  const repair=async()=>{
    if(!part||locked||inFlight.current||!requirement?.affordable||requirement.missing.length)return;
    inFlight.current=true;const name=part.name;scene.prepareHomeRepair(part);
    try {if(await onRepair({type:'REPAIR_HOME',repairId:part.id})){playSound('pickup');setMessage(`✓ ${name}完成`);setSelected('');}}finally{inFlight.current=false;}
  };
  useEffect(()=>{if(!message||renovating)return;const timer=setTimeout(()=>setMessage(''),2600);return()=>clearTimeout(timer);},[message,renovating]);
  return <div className="home-repairs" ref={root} aria-label="花房场景修缮">
    {parts.filter(p=>!state.homeRepairs?.includes(p.id)).map(p=>{
      const waiting=repairRequirements(state,p).missing.length>0;
      return <button key={p.id} className={`home-repair-spot${waiting?' waiting':''}`} data-repair-id={p.id} aria-label={`${p.name} · 需要修补`} aria-expanded={selected===p.id} disabled={locked} onClick={()=>setSelected(selected===p.id?'':p.id)}><span aria-hidden="true"><svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="m8 4 5 2 2 4-4 4-4-2-2-5 3-3ZM12 13l11 10-3 3-10-11M16 6l4-3 5 5-3 4M18 10l-3 3"/></svg></span><b>{p.name}</b><small>{waiting?'待前置修缮':'修缮材料'} · ◆ {p.cost.material??0}{p.cost.stamp?' ＋ ✦ '+p.cost.stamp:''}</small></button>;
    })}
    {part&&<section className="home-repair-card" role="region" aria-label={part.name}>
      <button className="home-repair-close" aria-label="关闭修缮说明" disabled={locked} onClick={()=>setSelected('')}>×</button>
      <small>花房修缮 · {project?.name}</small><h3>{part.name}</h3><p>{part.description}</p>
      <div className="home-repair-cost">{Object.entries(part.cost).map(([key,amount])=><span key={key} className={repairBalance(state,key)<amount?'short':''}>{REPAIR_COST_LABELS[key]} ×{amount}<small>现有 {repairBalance(state,key)}</small></span>)}</div>
      {!!requirement?.missing.length&&<p className="home-repair-wait">先完成：{requirement.missing.map(id=>parts.find(p=>p.id===id)?.name??id).join('、')}。</p>}
      {!requirement?.affordable&&<p className="home-repair-wait">材料还不够，探索和包裹重复家具都能带回修缮材料。</p>}
      <button className="home-repair-confirm" disabled={locked||!requirement?.affordable||!!requirement?.missing.length} onClick={()=>void repair()}>{busy?'正在修补…':'修补这里'}</button>
      {(error||pending)&&<div role="alert" className="home-repair-error">{error||'修缮结果待确认，请重试。'}<button disabled={busy} onClick={onRetry}>重试上次操作</button></div>}
    </section>}
    {message&&!renovating&&<p className="home-repair-toast" role="status">{message}</p>}
  </div>;
}
