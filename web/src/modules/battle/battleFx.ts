// 战斗表现层特效（纯视觉，不触碰任何数值/状态机）：
// · 像素伤害飘字 + 白色爆裂闪光 + 黑影碎裂粒子 —— canvas 绘制，由两套 painter 在各自特效循环里调用；
// · 屏幕震动 / 技能边缘泛光 —— DOM class 触发 CSS keyframes，由两个 Viewport 在 diff 到伤害/施法时调用。
// 所有绘制函数接收 progress∈[0,1]（由 effect 的 ttl 推出），确定性动画、无需逐帧步进状态。

/** 系统开启了“减少动态效果”时，跳过一切附加特效（保留引擎原有绘制）。 */
export function battleReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 战斗容器轻微 Screen Shake：命中黑影（普通）与黑影被击败（强烈）两档。 */
export function triggerBattleShake(element: HTMLElement | null, strength: 'light' | 'strong' = 'light') {
  if (!element || battleReducedMotion()) return;
  const className = strength === 'strong' ? 'fx-shake-strong' : 'fx-shake';
  element.classList.remove('fx-shake', 'fx-shake-strong');
  void element.offsetWidth; // 强制 reflow，让同名动画可以立即重放
  element.classList.add(className);
  element.addEventListener('animationend', function cleanup(event: AnimationEvent) {
    if (event.target !== element) return;
    element.classList.remove(className);
    element.removeEventListener('animationend', cleanup);
  });
}

/** 释放技能：战斗容器四周泛起一圈金色光晕后淡去（::after 全覆盖层，不挡交互）。 */
export function triggerSkillGlow(element: HTMLElement | null) {
  if (!element || battleReducedMotion()) return;
  element.classList.remove('fx-skill-glow');
  void element.offsetWidth;
  element.classList.add('fx-skill-glow');
  element.addEventListener('animationend', function cleanup(event: AnimationEvent) {
    if (event.target !== element && event.pseudoElement !== '::after') return;
    element.classList.remove('fx-skill-glow');
    element.removeEventListener('animationend', cleanup);
  });
}

/** 红色像素伤害数字：先弹跳放大再上飘淡出，深色描边压住复杂底色，保持像素游戏的“读数感”。 */
export function drawDamagePop(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, progress: number) {
  const pop = progress < .25 ? progress / .25 : 1;             // 前 25% 弹跳放大
  const rise = Math.pow(progress, 1.4) * 26;                    // 持续上飘（先快后慢）
  const alpha = progress < .6 ? 1 : 1 - (progress - .6) / .4;   // 后 40% 淡出
  const size = 13 + 7 * Math.sin(pop * Math.PI * .5);
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.font = `900 ${size}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const dy = y - rise;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,10,.9)';
  ctx.strokeText(text, x, dy);
  ctx.fillStyle = '#ff5d47';
  ctx.fillText(text, x, dy);
  ctx.fillStyle = 'rgba(255,214,150,.85)';
  ctx.fillText(text, x - .8, dy - .8); // 左上高光，像素字的“亮面”
  ctx.restore();
}

/** 白色像素爆裂闪光：两圈纯方块从命中点放射炸开、快速淡出（命中反馈）。 */
export function drawHitBurst(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number) {
  if (progress >= 1) return;
  const alpha = 1 - progress;
  ctx.save();
  ctx.globalAlpha = alpha * .95;
  ctx.fillStyle = '#fffdf2';
  const spread = 4 + progress * 20;
  for (let index = 0; index < 8; index++) {
    const angle = index / 8 * Math.PI * 2 + progress * .6;
    const size = index % 2 ? 3 : 4.5;
    ctx.fillRect(x + Math.cos(angle) * spread - size / 2, y + Math.sin(angle) * spread - size / 2, size, size);
  }
  // 中心十字大闪：前 30% 最亮
  if (progress < .5) {
    ctx.globalAlpha = (1 - progress * 2) * .9;
    const arm = 10 * (1 - progress);
    ctx.fillRect(x - arm, y - 1.5, arm * 2, 3);
    ctx.fillRect(x - 1.5, y - arm, 3, arm * 2);
  }
  ctx.restore();
}

/** 黑影碎裂消散：深色像素块按放射方向飞散、缩小、淡出（击败反馈）。 */
export function drawShatter(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number) {
  if (progress >= 1) return;
  const alpha = 1 - progress * progress; // 先慢后快的淡出
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  for (let index = 0; index < 12; index++) {
    const angle = index / 12 * Math.PI * 2 + (index % 3) * .18;
    const speed = 26 + (index % 4) * 9;
    const distance = Math.pow(progress, .8) * speed;
    const size = (index % 3 ? 4 : 6) * (1 - progress * .55);
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance - progress * 10; // 整体略上飘，像化作雾气
    ctx.fillStyle = index % 3 === 2 ? '#3d4a52' : '#1c2b33';
    ctx.fillRect(px - size / 2, py - size / 2, size, size);
    if (index % 4 === 0) { ctx.fillStyle = 'rgba(239,197,138,.5)'; ctx.fillRect(px - 1, py - 1, 2, 2); } // 混一点金色碎屑
  }
  ctx.restore();
}

/** 章节战斗的活动飘字（引擎 effect 不带伤害数值，由 Viewport diff 敌方 hp 得出）。 */
export interface BattleFloatText {x: number; y: number; text: string; born: number}

/** 把超时的飘字清掉；返回仍需绘制的列表（直接原地过滤，供 ref 持有）。 */
export function pruneFloats(floats: BattleFloatText[], now: number, lifeMs = 760): BattleFloatText[] {
  while (floats.length && now - floats[0].born > lifeMs) floats.shift();
  return floats;
}
