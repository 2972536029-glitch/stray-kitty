import {useLayoutEffect, useState, type RefObject} from 'react';

/** Size the board from the space reserved for it, never from its own rendered height. */
export function useBattleBoardFit(scrollRef:RefObject<HTMLDivElement|null>,columns:number,rows:number){
  const [width,setWidth]=useState<number>();
  useLayoutEffect(()=>{
    let frame=0,observer:ResizeObserver|undefined,stopped=false;
    const update=()=>{
      const node=scrollRef.current;if(!node)return;
      const availableWidth=Math.max(120,node.clientWidth-24),availableHeight=Math.max(100,node.clientHeight-24);
      const next=Math.floor(Math.min(availableWidth,availableHeight*columns/rows));
      setWidth(previous=>previous===next?previous:next);
    };
    const connect=()=>{
      if(stopped)return;
      const node=scrollRef.current;
      // L00 mounts its canvas after the battle runtime publishes the first snapshot.
      if(!node){frame=requestAnimationFrame(connect);return;}
      observer=new ResizeObserver(update);observer.observe(node);update();
    };
    connect();window.addEventListener('resize',update);
    return()=>{stopped=true;cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',update);};
  },[scrollRef,columns,rows]);
  return width;
}
