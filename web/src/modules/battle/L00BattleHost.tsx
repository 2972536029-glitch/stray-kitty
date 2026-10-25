import {useMemo, useRef} from 'react';
import type {BattleResult, Catalog, GameState} from '../../contracts';
import {BattleViewport} from './l00';
import {createL00Context} from './host-context';

interface Props {
  state: GameState;
  catalog: Catalog;
  paused: boolean;
  onResult: (result: BattleResult) => void;
}

export function L00BattleHost({state, catalog, paused, onResult}: Props) {
  const usage = useRef({'warm-can': 0, 'bouncy-treat': 0});
  const prepared = useMemo(() => {
    try {return {context: createL00Context(state, catalog), error: ''};}
    catch (error) {return {context: null, error: error instanceof Error ? error.message : '暂时无法进入这场战斗。'};}
  }, [state, catalog]);
  if (!prepared.context) return <section className="l00-host-error" role="alert"><h2>战斗暂时无法进入</h2><p>{prepared.error}</p></section>;
  return <BattleViewport key={prepared.context.attempt.id} context={prepared.context} paused={paused} onSuppliesChange={value => {usage.current = value.usedExtras;}} onResult={result => onResult({...result, usedSupplies: {...usage.current}})} autoComplete/>;
}
