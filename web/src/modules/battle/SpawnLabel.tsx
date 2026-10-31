import './spawn-label.css';

/** The cell already describes its role to assistive technology. This label is
 * visual only and stays below the direction arrow without receiving input. */
export function SpawnLabel() {
  return <span className="btl-spawn-label" data-testid="battle-spawn-label" aria-hidden="true">出怪口</span>;
}
