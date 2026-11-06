import {useEffect,useRef} from 'react';
import type {HomeSurface} from '../../contracts';
import {drawSurfaceSwatch} from './surfaces';

export default function SurfacePreview({item}:{item:HomeSurface}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{drawSurfaceSwatch(ref.current!.getContext('2d')!,item,176,128);},[item]);
  return <canvas ref={ref} width={176} height={128} className="home-surface-preview" role="img" aria-label={`${item.name}材质预览`}/>;
}
