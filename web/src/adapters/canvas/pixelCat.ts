// 轩扬 MR !2（a553076）的 64×64 像素图稿，UI 与 Canvas 共用路径。
// 团子沿用橘猫设定；点点使用暹罗辅助形象，与奶牛猫盾卫斑斑区分。
export const breeds = {
  miaomiao: {fur: '#f2dfb8', shade: '#d5bc87', patch: '#b77b32', point: '#3b3131', eye: '#262b31', accent: '#b54035', name: '英短 · 喵喵'},
  diandian: {fur: '#d9c7a8', shade: '#b9a789', patch: '#63594d', point: '#443d35', eye: '#82aeb8', accent: '#d8a1a0', name: '暹罗猫 · 点点'},
  tuanzi: {fur: '#e7ad67', shade: '#c38343', patch: '#a66536', point: '#523729', eye: '#553d2e', accent: '#39698c', name: '橘猫 · 团子'},
  momo: {fur: '#46434a', shade: '#2c2a30', patch: '#69646d', point: '#211f24', eye: '#c99b35', accent: '#39698c', name: '孟买猫 · 墨墨'}
} as const;
export type CatBreed = keyof typeof breeds;
// The advisor shares the resident silhouette without becoming an owned breed.
export const advisorPalette = {fur: '#eae4cf', shade: '#c3baa4', patch: '#c49165', point: '#4b5148', eye: '#6c856b', accent: '#718263'} as const;
export type CatAppearance = CatBreed | 'advisor';
export type CatMood = 'idle' | 'worried' | 'brave';
export interface CatShape {path: string; fill: string; stroke?: string}

export function catShapes(breed: CatAppearance, mood: CatMood): CatShape[] {
  const p = breed === 'advisor' ? advisorPalette : breeds[breed];
  const outlined = (path: string, fill: string): CatShape => ({path, fill, stroke: p.point});
  const flat = (path: string, fill: string): CatShape => ({path, fill});
  const shapes: CatShape[] = [
    outlined('M43 43h8v-4h5v-9h-5v5h-7z', p.shade),
    outlined('M20 40h25v5h4v12H15V45h5z', p.fur),
    flat('M39 41h6v4h4v12H39z', p.shade),
    outlined('M10 21v-8h6V8l8 7h16l8-7v5h6v8h4v20h-4v5H10v-5H6V21z', p.fur),
    flat('M45 14l3-4v5h6v7h3v19h-6V20z', p.shade)
  ];
  if (breed === 'diandian') shapes.push(flat('M10 14h6V9l8 7v7H10zM40 16l8-7v5h6v9H40z', p.patch), flat('M18 24h28v14H18zM23 38h18v5H23z', p.patch), flat('M45 43h6v-4h5v-9h-5v5h-6z', p.patch));
  if (breed === 'miaomiao') shapes.push(flat('M8 22v-7h9v13h-7z', p.patch), flat('M47 14h7v12h-9z', p.patch), flat('M37 44h11v11H36z', p.patch));
  if (breed === 'tuanzi') shapes.push(flat('M18 15h4v9h-4zM29 15h4v10h-4zM40 15h4v9h-4zM18 46h4v8h-4zM40 46h4v8h-4z', p.patch));
  if (breed === 'momo') shapes.push(flat('M20 34h24v9H20z', p.patch));
  if (breed === 'advisor') shapes.push(flat('M9 18v-4h8v-3l7 5v10H10zM37 44h11v11H37z', p.patch), flat('M43 14l5-4v4h6v12H43z', p.point));
  shapes.push(outlined('M15 52h12v7H14v-4zM37 52h13v7H37z', breed === 'momo' || breed === 'diandian' ? p.patch : '#fff4dc'));
  if (mood === 'worried') shapes.push(flat('M19 29h8v2h-8zM37 29h8v2h-8z', p.point));
  else shapes.push(flat('M21 27h4v7h-4zM39 27h4v7h-4z', p.eye), flat('M22 27h1.5v2H22zM40 27h1.5v2H40z', '#fff'));
  if (mood === 'brave') shapes.push(flat('M19 24l8 2v2l-8-2zM37 26l8-2v2l-8 2z', p.point));
  shapes.push(flat('M30 34h5v4h-5z', '#c78963'), flat('M27 39h4v2h-4zM34 39h4v2h-4z', p.point), flat('M8 34h10v1.5H8zM9 38h9v1.5H9zM46 34h10v1.5H46zM46 38h9v1.5H46z', p.point));
  if (breed === 'miaomiao') shapes.push(flat('M48 15h6v-4h7v11h-7v-4h-6z', p.accent), flat('M52 14h5v5h-5z', '#d2a33e'));
  else shapes.push(flat('M20 44h24v4H20zM29 47h7v6h-7z', p.accent), flat('M31 46h3v3h-3z', '#d2a33e'));
  if (breed === 'advisor') shapes.push(
    outlined('M33 47v-4h5v-3h12v3h5v5h3v4H47v5h-6v-5h-8z', '#fff0cb'),
    flat('M43 43h2v10h-2zM37 43h2v7h-2zM49 43h2v7h-2zM34 49h23v3H34zM42 52h4v5h-4z', '#b4a379'),
    flat('M39 44h3v2h-3zM41 45h2v3h-2zM43 47h5v2h-5z', '#79916e'),
    flat('M51 45h3v3h-3z', '#b97a63'),
    outlined('M29 49h7v5h-7z', p.fur)
  );
  shapes.push(flat('M14 19h3v6h-3zM18 16h3v3h-3zM18 45h3v3h-3z', 'rgba(255,255,255,.5)'), flat('M13 58h14v2H13zM37 58h14v2H37z', 'rgba(34,32,37,.28)'));
  return shapes;
}

const paths = new Map<string, Path2D>();
export function drawPixelCat(ctx: CanvasRenderingContext2D, breed: CatAppearance = 'miaomiao', mood: CatMood = 'idle') {
  ctx.save();ctx.imageSmoothingEnabled = false;ctx.lineJoin = 'round';ctx.lineWidth = 2.5;
  for (const shape of catShapes(breed, mood)) {
    let path = paths.get(shape.path);
    if (!path) {path = new Path2D(shape.path);paths.set(shape.path, path);}
    ctx.fillStyle = shape.fill;ctx.fill(path);
    if (shape.stroke) {ctx.strokeStyle = shape.stroke;ctx.stroke(path);}
  }
  ctx.restore();
}
