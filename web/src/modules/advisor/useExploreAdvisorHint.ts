import {useEffect, useLayoutEffect, useState, useSyncExternalStore} from 'react';
import {BrowserSessionStore} from '../../adapters/storage/BrowserSessionStore';
import {ExploreAdvisorHints, type ExploreHintInput} from './explore-hints';

/** Supplies optional inspectHint text. The map/UI owner keeps nearHint priority,
 * eligibility, completion and all game controls. Mounting does not create UI. */
export function useExploreAdvisorHint(input: ExploreHintInput) {
  const [hints] = useState(() => new ExploreAdvisorHints({visible: () => !document.hidden}));
  const token = new BrowserSessionStore().read()?.token;
  useLayoutEffect(() => hints.update(input), [hints, input.state, input.enabled, input.inspectHint,
    input.nearTarget, input.floor, input.hintKey, input.blocked, input.resetKey, token]);
  useEffect(() => {
    const refresh = () => hints.recheck();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('storage', refresh);
      hints.dispose();
    };
  }, [hints]);
  return useSyncExternalStore(hints.subscribe, hints.getSnapshot, hints.getSnapshot);
}
