/** The five chapter engines increment boss.slams only when a boss skill lands.
 * Compare within one simulation step: basic attacks, damage, pauses and restored
 * attempts cannot replay a shake. This is presentation only; no state is changed.
 */
export function triggerBossSkillShake(element: HTMLElement | null, previousSkills: number, currentSkills: number): void {
  if (!element || currentSkills <= previousSkills) return;
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const className = 'fx-shake-strong';
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  element.addEventListener('animationend', function cleanup(event: AnimationEvent) {
    if (event.target !== element || event.animationName !== 'fx-screen-shake-strong') return;
    element.classList.remove(className);
    element.removeEventListener('animationend', cleanup);
  });
}

/** 系统开启了“减少动态效果”时，跳过一切附加特效（保留引擎原有绘制）。 */
export function battleReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 战斗容器 Screen Shake（纯表现层）：当前策略下只有最后一波的高光时刻会触发 'strong'（见 isFinalWaveDefeat）。 */
export function triggerBattleShake(element: HTMLElement | null, strength: 'light' | 'strong' = 'light'): void {
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

/**
 * 震动降噪·终波收敛（防眩晕，纯表现层判定）：全场默认零震动——
 * 普通命中不震、普通小怪死亡不震、中间波次清场也不震、释放大招同样不震。
 * 只有“最后一波”的高光时刻才允许强震：
 * · 终波 Boss 登场（bossJustAppeared，仅章节战斗有 Boss）；
 * · 终波最后一只敌人被击败 / Boss 倒下（清场即终局）。
 * 序章六波教学战与各章守线战共用同一规则（currentWave >= totalWaves 才是终波）。
 */
export function isFinalWaveDefeat(killedAny: boolean, enemiesRemaining: number, currentWave: number, totalWaves: number, bossJustDied = false, bossJustAppeared = false): boolean {
  if (bossJustDied && enemiesRemaining === 0) return true; // Boss 倒下即终局高光（Boss 只在最后一波出现）
  if (currentWave < totalWaves) return false;              // 前面的波次：一概不震
  return bossJustAppeared || (killedAny && enemiesRemaining === 0); // 终波：Boss 登场或清场瞬间
}

/** 释放技能：战斗容器四周泛起一圈金色光晕后淡去（::after 全覆盖层，不挡交互）。 */
export function triggerSkillGlow(element: HTMLElement | null): void {
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
