import {catShapes, palettes, type CatAppearance, type CatMood} from '../adapters/canvas/pixelCat';

export default function PixelCat({breed = 'miaomiao', size = 80, mood = 'idle'}: {breed?: string; size?: number; mood?: CatMood}) {
  const id: CatAppearance = Object.hasOwn(palettes, breed) ? breed as CatAppearance : 'miaomiao';
  return <svg viewBox="0 0 64 64" className="pixel-cat" style={{width: size, height: size}} role="img" aria-label={palettes[id].name} shapeRendering="crispEdges">
    {catShapes(id, mood).map((shape, index) => <path key={index} d={shape.path} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.stroke ? 2.5 : undefined} strokeLinejoin="round"/>)}
  </svg>;
}
