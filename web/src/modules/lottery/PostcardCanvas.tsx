import {useEffect,useRef,type PointerEvent} from 'react';

export type StrokePoint=[number,number];
export default function PostcardCanvas({stroke,onChange,onComplete,disabled=false}:{stroke:StrokePoint[];onChange:(stroke:StrokePoint[])=>void;onComplete:()=>void;disabled?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),pen=useRef<HTMLSpanElement>(null),surface=useRef<HTMLDivElement>(null),points=useRef<StrokePoint[]>(stroke),pointer=useRef<number|null>(null);
  const paint=()=>{
    const el=canvas.current;if(!el)return;const ctx=el.getContext('2d');if(!ctx)return;
    ctx.clearRect(0,0,el.width,el.height);if(!points.current.length)return;
    ctx.strokeStyle='#49464b';ctx.fillStyle='#49464b';ctx.lineWidth=3*Math.min(2,window.devicePixelRatio||1);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();points.current.forEach(([x,y],i)=>{if(i)ctx.lineTo(x*el.width,y*el.height);else ctx.moveTo(x*el.width,y*el.height);});ctx.stroke();
    if(points.current.length===1){const [x,y]=points.current[0];ctx.beginPath();ctx.arc(x*el.width,y*el.height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
  };
  useEffect(()=>{points.current=stroke;paint();},[stroke]);
  useEffect(()=>{const el=canvas.current!;const resize=()=>{const r=el.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1);el.width=Math.max(1,Math.round(r.width*ratio));el.height=Math.max(1,Math.round(r.height*ratio));paint();};const observer=new ResizeObserver(resize);observer.observe(el);resize();return()=>observer.disconnect();},[]);
  // Native offsets stay in the canvas's local space when the paper is rotated or scaled.
  const point=(e:PointerEvent<HTMLCanvasElement>):StrokePoint=>[Math.max(0,Math.min(1,e.nativeEvent.offsetX/e.currentTarget.clientWidth)),Math.max(0,Math.min(1,e.nativeEvent.offsetY/e.currentTarget.clientHeight))];
  const movePen=(e:PointerEvent<HTMLCanvasElement>)=>{if(!pen.current||disabled)return;const [x,y]=point(e);pen.current.style.left=`${x*100}%`;pen.current.style.top=`${y*100}%`;surface.current?.classList.add('pen-following');};
  const finish=(e:PointerEvent<HTMLCanvasElement>,complete=false)=>{if(pointer.current!==e.pointerId)return;pointer.current=null;surface.current?.classList.remove('pen-drawing');onChange([...points.current]);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(complete&&points.current.length)onComplete();};
  return <div ref={surface} className={`postal-draw-surface ${disabled?'is-disabled':''}`}>
    <canvas ref={canvas} className="postal-draw-canvas" aria-label="明信片自由涂画区域" data-testid="postcard-canvas" data-has-stroke={stroke.length>0} onPointerEnter={movePen} onPointerLeave={()=>{if(pointer.current===null)surface.current?.classList.remove('pen-following');}} onPointerDown={e=>{if(disabled||!e.isPrimary||e.button!==0||pointer.current!==null||points.current.length)return;e.preventDefault();movePen(e);surface.current?.classList.add('pen-drawing');pointer.current=e.pointerId;points.current=[point(e)];e.currentTarget.setPointerCapture(e.pointerId);paint();}} onPointerMove={e=>{movePen(e);if(disabled||pointer.current!==e.pointerId)return;e.preventDefault();if(points.current.length<4096)points.current.push(point(e));paint();}} onPointerUp={e=>finish(e,true)} onPointerCancel={e=>finish(e)} onLostPointerCapture={e=>finish(e)}/>
    <span ref={pen} className="postal-drawing-pen" aria-hidden="true" data-testid="postcard-pen"><svg viewBox="0 0 100 120" fill="none"><path d="M26 89C21 65 39 29 86 5c-2 15-2 26-8 37l-10 3 7 2c-5 9-11 18-20 25l-9-1 4 5c-9 8-17 12-24 13Z" fill="#efe8d2" stroke="#a3997d" strokeWidth="1.1"/><path d="M86 5C63 39 45 61 26 89c15-6 23-13 29-17l-9-1 4 5c9-8 18-18 25-29l-7-2 10-3c6-11 6-22 8-37Z" fill="#c5cdc4"/><path d="M79 14 60 36M75 22 50 40M68 35 42 51M60 48 35 61M49 63l-20 9M71 28l4 10M61 43l4 11M49 60l4 9M39 74l4 6" stroke="#a7b4ac" strokeWidth="1.2"/><path d="M82 10C63 36 43 67 19 101" stroke="#8d8a71" strokeWidth="2"/><path d="m19 95 7 5-10 9-9 1 4-9Z" fill="#c6a465" stroke="#92733e" strokeWidth=".8"/><path d="m7 110 12-12M19 97l3 2" stroke="#4a453a" strokeWidth="1.1"/><path d="m16 96 7 5M18 93l8 5" stroke="#e4c994" strokeWidth="2"/><path d="M30 73c3-15 15-32 34-47" stroke="#fffaf0" strokeWidth="2" opacity=".8"/></svg></span>
  </div>;
}
