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
