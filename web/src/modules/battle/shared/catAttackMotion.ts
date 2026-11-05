type Actor = {id: string; x: number; y: number; status?: string};
type Attack = {kind: string; from: {x: number; y: number; id?: string}; remaining: number};
export type CatLimbStyle = 'claw' | 'shield' | 'cast' | 'support' | 'punch' | 'bell' | 'lantern';

/** Use the existing hit snapshot, never the cooldown or a separate animation clock. */
export function getCatAttackProgress(effects: readonly Attack[], cat: Actor): number | undefined {
  if (cat.status !== undefined && cat.status !== 'active') return undefined;
  let remaining = 0;
  for (const effect of effects) {
    if ((effect.kind === 'attack' || effect.kind === 'ally-attack') &&
      effect.from.id === cat.id && effect.from.x === cat.x && effect.from.y === cat.y &&
      Number.isFinite(effect.remaining) && effect.remaining > remaining) remaining = effect.remaining;
  }
  return remaining > 0 ? Math.max(0, 1 - remaining / .4) : undefined;
}

const ease = (n: number) => {const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t);};
const rest = () => ({x: 0, y: 0, angle: 0});

/** Keep the original whole-cat forward hop underneath the separate paw gesture. */
export function getCatBodyPose(progress?: number) {
  if (progress === undefined || !Number.isFinite(progress) || progress <= 0 || progress >= 1) return {x: 0, y: 0};
  const hop = Math.sin(progress * Math.PI);
  return {x: 2 * hop, y: -hop};
}

/** A small shoulder/wrist gesture in the original 32-pixel sprite coordinates. */
export function getCatLimbPose(style: CatLimbStyle, progress?: number) {
  if (progress === undefined || !Number.isFinite(progress) || progress <= 0 || progress >= 1) return rest();
  const pull = progress < .22 ? ease(progress / .22) : 1 - ease((progress - .22) / .22);
  const strike = progress < .44 ? ease((progress - .22) / .22) : 1 - ease((progress - .44) / .56);
  const flick = progress > .44 ? Math.sin((progress - .44) / .56 * Math.PI * 2) * (1 - ease((progress - .44) / .56)) : 0;
  switch (style) {
    case 'claw': return {x: -pull + 2.2 * strike, y: -2.1 * pull - .3 * strike, angle: -.62 * pull + .36 * strike};
    case 'shield': return {x: -.7 * pull + 2.5 * strike, y: -.5 * pull - .5 * strike, angle: .14 * pull - .22 * strike};
    case 'cast': return {x: -.4 * pull + .8 * strike, y: -1.4 * pull - .6 * strike, angle: -.32 * pull + .48 * strike};
    case 'support': return {x: -.4 * pull + 1.6 * strike, y: -1.8 * pull - 1.4 * strike, angle: -.4 * pull + .18 * strike};
    case 'punch': return {x: -.8 * pull + 2.6 * strike, y: -pull - .5 * strike, angle: -.18 * pull + .24 * strike};
    case 'bell': return {x: .5 * strike, y: -2.4 * pull - 1.4 * strike, angle: -.3 * pull + .35 * strike + .2 * flick};
    case 'lantern': return {x: -.3 * pull + 1.4 * strike, y: -1.4 * pull - 1.2 * strike, angle: -.25 * pull + .22 * strike};
  }
}

export function withCatAttackLimb(ctx: CanvasRenderingContext2D, style: CatLimbStyle,
  progress: number | undefined, pivotX: number, pivotY: number, paint: () => void) {
  const pose = getCatLimbPose(style, progress);
  if (pose.x === 0 && pose.y === 0 && pose.angle === 0) {paint(); return;}
  ctx.save();
  try {
    ctx.translate(pivotX + pose.x, pivotY + pose.y);
    ctx.rotate(pose.angle);
    ctx.translate(-pivotX, -pivotY);
    paint();
  } finally {ctx.restore();}
}
