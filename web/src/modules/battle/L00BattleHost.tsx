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
  const isTutorial = state.activeBattle?.stageId === 'l00_tutorial';
  const prepared = useMemo(() => {
    if (isTutorial) return {context: null, error: ''};
    try {return {context: createL00Context(state, catalog), error: ''};}
    catch (error) {return {context: null, error: error instanceof Error ? error.message : '暂时无法进入这场战斗。'};}
  }, [state, catalog, isTutorial]);

  if (isTutorial || !prepared.context) {
    return (
      <section className="l00-host-error" role="alert" style={{maxWidth: '680px', margin: '32px auto', textAlign: 'center', padding: '28px', background: '#f5f7f2', border: '1px solid #c8d4bf', borderRadius: '8px'}}>
        <h2 style={{color: '#344535', marginBottom: '12px'}}>{isTutorial ? '窗外的第一道防线 · 驱散暗影' : '战斗暂时无法进入'}</h2>
        <p style={{margin: '12px 0 20px', color: '#586b59', lineHeight: '1.8', fontSize: '15px'}}>
          {isTutorial
            ? '喵喵立起尾巴，借着马灯光芒奋力驱退了第一波逼近的暗影！第一道防线守住了。'
            : (prepared.error || '关卡战斗准备中，可直接跳过进入下一阶段。')}
        </p>
        <div style={{display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap'}}>
          <button
            className="primary-action-btn"
            style={{padding: '10px 20px', fontSize: '14px'}}
            onClick={() => onResult({attemptId: state.activeBattle!.id, outcome: 'won'})}
          >
            {isTutorial ? '守住第一道防线，进入雨夜小巷 →' : '完成当前战斗并胜利 →'}
          </button>
        </div>
      </section>
    );
  }

  return <BattleViewport key={prepared.context.attempt.id} context={prepared.context} paused={paused} onSuppliesChange={value => {usage.current = value.usedExtras;}} onResult={result => onResult({...result, usedSupplies: {...usage.current}})} autoComplete/>;
}
