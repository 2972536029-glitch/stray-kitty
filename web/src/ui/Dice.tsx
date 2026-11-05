import {useEffect, useLayoutEffect, useRef} from 'react';
import './dice-overlay.css';

const dots: Record<number, number[]> = {1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const turns: Record<number, string> = {1:'',2:'rotateX(-90deg)',3:'rotateY(-90deg)',4:'rotateY(90deg)',5:'rotateX(90deg)',6:'rotateY(180deg)'};

/** Six real faces; the server's result faces upward beneath an oblique camera. */
export default function Dice({value = 1, rolling = false}: {value?: number; rolling?: boolean}) {
  const cube = useRef<HTMLSpanElement>(null);
  const motion = useRef<Animation | null>(null);
  const transform = turns[value] || 'rotateX(0deg)';
  useLayoutEffect(() => {
    const el = cube.current!;
    const from = getComputedStyle(el).transform;
    motion.current?.cancel();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    motion.current = rolling
      ? el.animate([
          {transform:'rotateX(0deg) rotateY(0deg) rotateZ(0deg)'},
          {transform:'rotateX(720deg) rotateY(1080deg) rotateZ(360deg)'},
        ], {duration:1400,iterations:Infinity,easing:'linear'})
      : el.animate([{transform:from},{transform}], {duration:480,easing:'cubic-bezier(.16,.8,.25,1)'});
  }, [rolling, transform]);
  useEffect(() => () => motion.current?.cancel(), []);
  return <div className={`dice cube-dice${rolling ? ' is-rolling' : ''}`} role="img" aria-label={rolling ? '骰子滚动中' : `骰子 ${value} 点`}>
    <span className="dice-top-view" aria-hidden="true">
      <span ref={cube} className="dice-cube" style={{transform}}>
        {[1,2,3,4,5,6].map(face => <span className={`dice-face face-${face}`} key={face}>
          {Array.from({length:9}, (_,i) => <i key={i} className={dots[face].includes(i) ? 'on' : ''}/>)}
        </span>)}
      </span>
    </span>
  </div>;
}
