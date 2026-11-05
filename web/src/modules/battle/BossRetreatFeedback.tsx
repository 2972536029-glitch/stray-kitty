import {useEffect, useState} from 'react';
import './boss-retreat-feedback.css';

const DURATION_MS = 2600;

/** Presentation time keeps the retreat readable at any combat speed, then clears
 * it even while a cat menu or pause has stopped the simulation. Key by attempt. */
export function BossRetreatFeedback({boss, columns, rows, label}: {
  boss: {phase: string; x: number; y: number; width: number; height: number};
  columns: number; rows: number; label: string;
}) {
  const defeated = boss.phase === 'defeated';
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(defeated);
    if (!defeated) return;
    const timer = setTimeout(() => setVisible(false), DURATION_MS);
    return () => clearTimeout(timer);
  }, [defeated]);

  if (!defeated || !visible) return null;
  return <div className="battle-boss-retreat" data-testid="boss-retreat-feedback" role="status"
    style={{left: `${(boss.x + boss.width / 2) / columns * 100}%`, top: `${(boss.y + boss.height / 2) / rows * 100}%`, animationDuration: `${DURATION_MS}ms`}}>
    <span className="boss-retreat-smoke" aria-hidden="true"><i/><i/><i/></span>
    <span className="boss-retreat-text">{label}</span>
  </div>;
}
