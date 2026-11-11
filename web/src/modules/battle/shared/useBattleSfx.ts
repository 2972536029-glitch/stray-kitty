import {useEffect, useRef} from 'react';
import {playSfx} from '../../../core/sound';

/** An effect entry only needs its kind for the hit cue (l00 passes projectiles,
 * whose entries also carry `kind`). */
export interface BattleSfxEffect {id: string | number; kind: string}

export interface BattleSfxOptions {
  effects?: readonly BattleSfxEffect[];
  /** Effect kinds counted as a basic-attack hit. Omitted → no hit cue. */
  attackKinds?: readonly string[];
}

/** Presentational state-diff cues for the battle loop: leaks and basic-attack
 * hits. Reads only the fields handed to it, so the battle engines stay
 * untouched; every sound goes through the shared playSfx cache (see
 * docs/AUDIO-CREDITS.md for the sources).
 *
 * Engines publish new state at 20 Hz (50 ms render throttle) — every rAF frame
 * for l00's runtime — so the hit cue rate-limits itself to 150 ms. The leak
 * cue compares numbers, so unrelated re-renders (hover, selection) stay
 * silent, and attempt restarts (numbers dropping back) never re-trigger. */
export function useBattleSfx<State extends {leaks?: number}>(game: State | null, options?: BattleSfxOptions): void {
  const prev = useRef<State | null>(null);
  const hitCounts = useRef(new Map<string, number>());
  const lastHitAt = useRef(0);

  useEffect(() => {
    const p = prev.current;
    if (game) {
      if (game.leaks !== undefined && game.leaks > (p?.leaks ?? 0)) playSfx('/assets/sfx/battle-leak.ogg', 0.5);
      const effects = options?.effects ?? (game as {effects?: readonly BattleSfxEffect[]}).effects;
      if (options?.attackKinds) {
        // Per-kind counts survive expiry+spawn in the same tick, unlike a raw
        // length diff. l00 passes `projectiles` here instead of `effects`.
        const next = new Map<string, number>();
        for (const fx of effects ?? []) next.set(fx.kind, (next.get(fx.kind) ?? 0) + 1);
        for (const kind of options.attackKinds) {
          if ((next.get(kind) ?? 0) > (hitCounts.current.get(kind) ?? 0)) {
            const now = performance.now();
            if (now - lastHitAt.current >= 150) {
              lastHitAt.current = now;
              playSfx('/assets/sfx/attack-hit.ogg', 0.35);
            }
            break;
          }
        }
        hitCounts.current = next;
      }
    }
    prev.current = game;
  });
}
