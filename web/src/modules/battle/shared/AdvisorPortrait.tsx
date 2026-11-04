import {useEffect, useRef} from 'react';
import {drawCat} from '../l00/painter';

export function AdvisorPortrait() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (context) drawCat(context, 'advisor', 0, 0, 96);
  }, []);
  return <canvas ref={ref} width={96} height={96} className="btl-portrait" aria-hidden="true"/>;
}
