import type {BattleResult, Catalog, GameState} from '../../contracts';
import {L00BattleHost} from './L00BattleHost';
import {createChapterContext} from './chapter-context';
import {ChapterBattleViewport} from './chapter/ChapterBattleViewport';

export function BattleHost({state, catalog, paused, onResult}: {
  state: GameState; catalog: Catalog; paused: boolean; onResult: (result: BattleResult) => void;
}) {
  // 序章教学战(l00_tutorial,雨巷探索前的独立教学)与救援战(alley_rescue,序章
  // 剧情对齐后的 L00 体验)都走 L00BattleHost;教学与救援是两场服务端 attempt。
  if (state.activeBattle?.stageId === 'l00_tutorial' || state.activeBattle?.stageId === 'alley_rescue') {
    return <L00BattleHost key={state.activeBattle.id} state={state} catalog={catalog} paused={paused} onResult={onResult}/>;
  }
  let context: ReturnType<typeof createChapterContext>;
  try {context = createChapterContext(state, catalog);}
  catch (error) {return <section className="l00-host-error" role="alert"><h2>战斗暂时无法进入</h2><p>{error instanceof Error ? error.message : '暂时无法进入这场战斗。'}</p></section>;}
  return <ChapterBattleViewport key={context.attemptId} {...context} paused={paused} onResult={result => onResult({attemptId: context.attemptId, ...result})}/>;
}
