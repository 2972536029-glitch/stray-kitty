// 移植自轩扬 react-demo@b740853 的 PixelCat.jsx，保留原像素造型。
export const breeds = {
  miaomiao: { fur:'#fffef8', light:'#ffffff', shade:'#ddd8ce', dark:'#25252b', patch:'#ffd21f', eye:'#25252b', accent:'#e31b23', name:'英短 · 喵喵' },
  diandian: { fur:'#fffef8', light:'#ffffff', shade:'#ddd8ce', dark:'#25252b', patch:'#45434a', eye:'#25252b', accent:'#e31b23', name:'奶牛猫 · 点点' },
  tuanzi: { fur:'#f5a442', light:'#ffd980', shade:'#d66b26', dark:'#6e3e2f', patch:'#d66b26', eye:'#25252b', accent:'#0878c9', name:'橘猫 · 团子' },
  momo: { fur:'#47444d', light:'#77727b', shade:'#2c2931', dark:'#202027', patch:'#35323b', eye:'#ffd21f', accent:'#0878c9', name:'孟买猫 · 墨墨' },
} as const;
export type CatBreed = keyof typeof breeds;
export type CatMood = 'idle' | 'worried' | 'brave';
function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

export function drawPixelCat(ctx: CanvasRenderingContext2D, breed: CatBreed = 'miaomiao', mood: CatMood = 'idle') {
  const p = breeds[breed];
  ctx.imageSmoothingEnabled = false
  // 拼豆娃娃比例：大圆方头、短身体、短脚。
  px(ctx,9,19,15,9,p.fur); px(ctx,7,22,4,5,p.fur); px(ctx,22,22,4,5,p.fur)
  px(ctx,8,8,17,13,p.fur); px(ctx,9,6,5,5,p.fur); px(ctx,20,6,4,5,p.fur)
  px(ctx,10,5,3,3,p.dark); px(ctx,21,5,2,3,p.dark)
  px(ctx,7,11,2,7,p.fur); px(ctx,25,11,2,7,p.fur)
  px(ctx,11,15,11,5,p.light); px(ctx,16,16,2,2,'#f0c252')
  // 固定右下暗面：用二维色块模拟体积，不使用渐变。
  px(ctx,23,12,2,7,p.shade); px(ctx,21,19,3,2,p.shade); px(ctx,22,22,2,5,p.shade)
  // breed markings
  if (breed === 'diandian') { px(ctx,8,9,6,6,p.patch); px(ctx,20,8,5,4,p.patch); px(ctx,18,21,6,6,p.patch) }
  if (breed === 'tuanzi') { px(ctx,11,8,2,4,p.dark); px(ctx,16,7,2,5,p.dark); px(ctx,21,8,2,4,p.dark); px(ctx,12,21,2,5,p.dark); px(ctx,19,21,2,5,p.dark) }
  if (breed === 'momo') { px(ctx,11,15,11,5,p.light); px(ctx,9,20,3,4,p.light) }
  if (breed === 'miaomiao') { px(ctx,8,10,4,5,p.patch); px(ctx,21,9,4,5,p.patch); px(ctx,19,21,5,5,p.patch) }
  // eyes / expression
  if (mood === 'worried') { px(ctx,11,13,3,1,p.dark); px(ctx,19,13,3,1,p.dark) }
  else { px(ctx,11,13,2,3,p.eye); px(ctx,21,13,2,3,p.eye) }
  if (mood === 'brave') { px(ctx,11,11,3,1,p.dark); px(ctx,19,11,3,1,p.dark) }
  // 原创配饰：喵喵蝴蝶结，其余猫使用领巾/星饰，避免角色同质化。
  if (breed === 'miaomiao') { px(ctx,23,8,3,4,p.accent); px(ctx,27,7,3,5,p.accent); px(ctx,26,10,2,2,'#ffd25f') }
  else { px(ctx,11,20,13,2,p.accent); px(ctx,16,21,3,3,'#ffd25f') }
  px(ctx,8,26,6,3,p.light); px(ctx,21,26,6,3,p.light)
  px(ctx,9,10,1,5,'rgba(255,255,255,.55)')
}
