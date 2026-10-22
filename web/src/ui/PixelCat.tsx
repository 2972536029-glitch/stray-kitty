import {useEffect, useRef} from 'react';
import {breeds, drawPixelCat, type CatBreed, type CatMood} from '../adapters/canvas/pixelCat';

export default function PixelCat({breed = 'miaomiao', size = 80, mood = 'idle'}: {breed?: string; size?: number; mood?: CatMood}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const id: CatBreed = Object.hasOwn(breeds, breed) ? breed as CatBreed : 'miaomiao';
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 32, 32);
    drawPixelCat(ctx, id, mood);
  }, [id, mood]);
  return <canvas ref={ref} width={32} height={32} className="pixel-cat" style={{width: size, height: size}} role="img" aria-label={breeds[id].name}/>;
}
