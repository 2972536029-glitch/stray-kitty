import {useEffect,useRef,type PointerEvent} from 'react';

export type StrokePoint=[number,number];
export default function PostcardCanvas({stroke,onChange,onComplete,disabled=false}:{stroke:StrokePoint[];onChange:(stroke:StrokePoint[])=>void;onComplete:()=>void;disabled?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),points=useRef<StrokePoint[]>(stroke),pointer=useRef<number|null>(null);
  const paint=()=>{
    const el=canvas.current;if(!el)return;const ctx=el.getContext('2d');if(!ctx)return;
    ctx.clearRect(0,0,el.width,el.height);if(!points.current.length)return;
    ctx.strokeStyle='#49464b';ctx.fillStyle='#49464b';ctx.lineWidth=3*Math.min(2,window.devicePixelRatio||1);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();points.current.forEach(([x,y],i)=>{if(i)ctx.lineTo(x*el.width,y*el.height);else ctx.moveTo(x*el.width,y*el.height);});ctx.stroke();
    if(points.current.length===1){const [x,y]=points.current[0];ctx.beginPath();ctx.arc(x*el.width,y*el.height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
  };
  useEffect(()=>{points.current=stroke;paint();},[stroke]);
  useEffect(()=>{const el=canvas.current!;const resize=()=>{const r=el.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1);el.width=Math.max(1,Math.round(r.width*ratio));el.height=Math.max(1,Math.round(r.height*ratio));paint();};const observer=new ResizeObserver(resize);observer.observe(el);resize();return()=>observer.disconnect();},[]);
  const point=(e:PointerEvent<HTMLCanvasElement>):StrokePoint=>{const r=e.currentTarget.getBoundingClientRect();return[Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
  const finish=(e:PointerEvent<HTMLCanvasElement>,complete=false)=>{if(pointer.current!==e.pointerId)return;pointer.current=null;onChange([...points.current]);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(complete&&points.current.length)onComplete();};
  return <canvas ref={canvas} className="postal-draw-canvas" aria-label="明信片自由涂画区域" data-testid="postcard-canvas" data-has-stroke={stroke.length>0} onPointerDown={e=>{if(disabled||!e.isPrimary||e.button!==0||pointer.current!==null||points.current.length)return;e.preventDefault();pointer.current=e.pointerId;points.current=[point(e)];e.currentTarget.setPointerCapture(e.pointerId);paint();}} onPointerMove={e=>{if(disabled||pointer.current!==e.pointerId)return;e.preventDefault();if(points.current.length<4096)points.current.push(point(e));paint();}} onPointerUp={e=>finish(e,true)} onPointerCancel={e=>finish(e)} onLostPointerCapture={e=>finish(e)}/>;
}
