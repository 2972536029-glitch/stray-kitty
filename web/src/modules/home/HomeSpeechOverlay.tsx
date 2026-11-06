import {useEffect,useRef,useState} from 'react';
import type {DemoScene} from '../../examples/demo/scene';
import './speech.css';

type Bubble={id:string;name:string;text:string};
type Rect={x:number;y:number;width:number;height:number};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const overlap=(a:Rect,b:Rect)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));

/** Keep text sharp at every camera zoom while following the painted cat. */
export default function HomeSpeechOverlay({scene}:{scene:DemoScene}) {
  const root=useRef<HTMLDivElement>(null),[bubbles,setBubbles]=useState<Bubble[]>([]);
  useEffect(()=>{
    let frame=0,previous='';
    const update=()=>{
      const active=scene.homeSpeechBubbles(),signature=JSON.stringify(active.map(({id,name,text})=>({id,name,text})));
      if(signature!==previous){previous=signature;setBubbles(active);}
      const menuBottom=document.querySelector('.fixed-game-menu')?.getBoundingClientRect().bottom??64;
      const obstacles=Array.from(document.querySelectorAll<HTMLElement>('.home-repair-spot:not([hidden]),.home-repair-card')).map(el=>{const r=el.getBoundingClientRect();return{x:r.left,y:r.top,width:r.width,height:r.height};});
      for(const bubble of active){
        const el=root.current?.querySelector<HTMLElement>(`[data-cat="${bubble.id}"]`);if(!el)continue;
        const scale=Number(getComputedStyle(el).zoom)||1,width=el.offsetWidth*scale,height=el.offsetHeight*scale;
        const positions=[{x:bubble.x-width/2,y:bubble.y-height-14},{x:bubble.x-width+28,y:bubble.y-height-14},{x:bubble.x-28,y:bubble.y-height-14},{x:bubble.x-width/2,y:bubble.y+62}];
        const candidates=positions.map((p,i)=>({x:clamp(p.x,12,window.innerWidth-width-12),y:clamp(p.y,menuBottom+12,window.innerHeight-height-16),width,height,index:i}));
        const box=candidates.sort((a,b)=>obstacles.reduce((sum,o)=>sum+overlap(a,o)-overlap(b,o),0)+(a.index-b.index)*2)[0];
        el.style.transform=`translate(${box.x/scale}px,${box.y/scale}px)`;el.style.opacity=String(bubble.alpha);
        el.style.setProperty('--speech-tail-x',clamp((bubble.x-box.x)/scale,18,el.offsetWidth-18)+'px');el.classList.toggle('below',box.index===3);
        if(import.meta.env.DEV||import.meta.env.MODE==='e2e')scene.homeCanvas.dataset.homeSpeech=JSON.stringify({...box,screenWidth:width,text:bubble.text,breed:bubble.id});
      }
      frame=requestAnimationFrame(update);
    };update();return()=>cancelAnimationFrame(frame);
  },[scene]);
  return <div className="home-speech-overlay" ref={root}>{bubbles.map(b=><aside key={b.id} className="home-life-speech" data-cat={b.id} aria-label={`${b.name}的日常对白`}><small>{b.name}</small><p>{b.text}</p></aside>)}</div>;
}
