/** Read-only presentation phases within the existing 0.4-second hit effect.
 * No extra timer or gameplay anticipation is added to the combat simulation. */
export function getBossAttackMotion(remaining?: number) {
  if (remaining === undefined || !Number.isFinite(remaining) || remaining <= 0) {
    return {progress: 1, pull: 0, strike: 0, impact: 0};
  }
  const progress = Math.max(0, Math.min(1, 1 - remaining / .4));
  const ease = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  const pull = progress < .18 ? ease(progress / .18) : 1 - ease((progress - .18) / .24);
  const strike = progress < .42 ? ease((progress - .18) / .24) : 1 - ease((progress - .42) / .58);
  const impact = progress < .32 ? ease((progress - .16) / .16) : 1 - ease((progress - .32) / .68);
  return {progress, pull, strike, impact};
}
