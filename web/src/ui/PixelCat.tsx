import {breeds, catShapes, type CatBreed, type CatMood} from '../adapters/canvas/pixelCat';

export default function PixelCat({breed = 'miaomiao', size = 80, mood = 'idle'}: {breed?: string; size?: number; mood?: CatMood}) {
  const id: CatBreed = Object.hasOwn(breeds, breed) ? breed as CatBreed : 'miaomiao';
  return <svg viewBox="0 0 64 64" className="pixel-cat" style={{width: size, height: size}} role="img" aria-label={breeds[id].name} shapeRendering="crispEdges">
    {catShapes(id, mood).map((shape, index) => <path key={index} d={shape.path} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.stroke ? 2.5 : undefined} strokeLinejoin="round"/>)}
  </svg>;
}
