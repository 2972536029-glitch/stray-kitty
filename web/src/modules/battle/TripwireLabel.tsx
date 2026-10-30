import './tripwire-label.css';

export const TRIPWIRE_DESCRIPTION='点点已识破并排除绊线；该格仍为场景障碍，不能部署。';

/** The obstacle button owns the accessible name and explanation; this caption is visual only. */
export function TripwireLabel(){
  return <span className="btl-tripwire-label" data-testid="battle-tripwire-label" aria-hidden="true">绊线已排除</span>;
}
