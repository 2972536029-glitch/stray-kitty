import {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {drawCat} from './l00/painter';
import './battle-result.css';

interface Props {
  outcome:'won'|'lost';
  stageName:string;
  busy?:boolean;
  error?:string;
  onContinue:()=>void;
}

/** This screen has no timer or route changes: only the player's confirmation
 * asks the host to settle the finished attempt. */
export function BattleResultScreen({outcome,stageName,busy=false,error='',onContinue}:Props){
  const dialog=useRef<HTMLDialogElement>(null),portrait=useRef<HTMLCanvasElement>(null),continuation=useRef<HTMLButtonElement>(null);
  const won=outcome==='won';
  useEffect(()=>{
    const node=dialog.current;
    if(!node)return;
    const previous=document.activeElement;
    const root=document.documentElement,previousOverflow=root.style.overflow;
    root.style.overflow='hidden';
    if(!node.open)node.showModal();
    return()=>{node.close();root.style.overflow=previousOverflow;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
  },[]);
  useEffect(()=>{
    const ctx=portrait.current?.getContext('2d');
    if(ctx){ctx.clearRect(0,0,128,128);drawCat(ctx,'hero',0,0,128,won?'idle':'sleep');}
  },[won]);
  useEffect(()=>{if(!busy)continuation.current?.focus({preventScroll:true});},[busy]);

  return createPortal(<dialog ref={dialog} className={`battle-result is-${outcome}`} data-testid="battle-result" data-outcome={outcome}
    aria-labelledby="battle-result-title" aria-describedby="battle-result-stage battle-result-message" onCancel={event=>event.preventDefault()}
    onKeyDown={event=>{if(event.key==='Tab'&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();continuation.current?.focus();}}}>
    <div className="battle-result__grain" aria-hidden="true"/>
    <div className="battle-result__frame" aria-hidden="true"><i/><i/><i/><i/></div>
    <div className="battle-result__content">
      <p className="battle-result__eyebrow">小猫回家记 <span>·</span> 守护战报</p>
      <div className="battle-result__seal" aria-hidden="true">
        <svg viewBox="0 0 400 400"><circle cx="200" cy="200" r="177"/><circle cx="200" cy="200" r="167"/><circle className="battle-result__ticks" cx="200" cy="200" r="186"/><path d="M200 5 395 200 200 395 5 200Z"/><path d="M200 24V48M200 352V376M24 200H48M352 200H376"/></svg>
        <div className="battle-result__portrait"><canvas ref={portrait} width={128} height={128}/></div>
      </div>
      <div className="battle-result__heading"><span aria-hidden="true"/><h1 id="battle-result-title">{won?'战斗胜利':'战斗失败'}</h1><span aria-hidden="true"/></div>
      <div className="battle-result__divider" aria-hidden="true"><i/><b/><i/></div>
      <p id="battle-result-stage" className="battle-result__stage">{stageName}</p>
      <p id="battle-result-message" className="battle-result__message">{won?'灯光还在，伙伴们也都在。':'先带伙伴们回去，再一起守住下一次。'}</p>
      <div className="battle-result__action">
        {error&&<p className="battle-result__error" role="alert">{error}</p>}
        <button ref={continuation} type="button" data-testid="battle-result-continue" disabled={busy} aria-busy={busy} onClick={onContinue}>
          <span>{busy?'正在继续…':error?'重试并继续':'点击继续'}</span><span className="battle-result__arrow" aria-hidden="true">›</span>
        </button>
        <span className="battle-result__hint">{busy?'正在整理这一次的守护':won?'带着这份勇气，继续前行':'调整好阵型，还能再次出发'}</span>
      </div>
    </div>
  </dialog>,document.body);
}
