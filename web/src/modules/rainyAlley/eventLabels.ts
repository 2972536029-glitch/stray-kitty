export const EVENT_PROP_SCALE = .9;

export interface AlleyLabel {
  id: string;
  text: string;
  key?: 'e' | 'c' | 'q';
  x: number;
  y: number;
  alpha: number;
  objective?: boolean;
}

export function rainyEventObjective(flags: readonly string[]) {
  return !flags.includes('alley_rescued') ? 'alley_crate' : !flags.includes('lost_poster_found') ? 'alley_poster' : null;
}
