import type {BattleResult, Catalog, GameState} from '../../contracts';
import {L00BattleHost} from './L00BattleHost';
import {createChapterContext} from './chapter-context';
import {ChapterBattleViewport} from './chapter/ChapterBattleViewport';
import {createMarketContext} from './market-context';
import {MarketBattleViewport} from './market/MarketBattleViewport';
import {createGreenhouseContext} from './greenhouse-context';
import {GreenhouseBattleViewport} from './greenhouse/GreenhouseBattleViewport';

export function BattleHost({state, catalog, paused, onResult}: {
  state: GameState; catalog: Catalog; paused: boolean; onResult: (result: BattleResult) => void;
}) {
  // The prologue teaches combat; the first rescue and home replay share L01.
  if (state.activeBattle?.stageId === 'l00_tutorial') {
    return <L00BattleHost key={state.activeBattle.id} state={state} catalog={catalog} paused={paused} onResult={onResult}/>;
  }
  if (state.activeBattle?.stageId === 'market_boss') {
    let context: ReturnType<typeof createMarketContext>;
    try {context = createMarketContext(state, catalog);}
    catch (error) {return <section className="l00-host-error" role="alert"><h2>战斗暂时无法进入</h2><p>{error instanceof Error ? error.message : '暂时无法进入这场战斗。'}</p></section>;}
    return <MarketBattleViewport key={context.attemptId} {...context} paused={paused} onResult={result => onResult({attemptId: context.attemptId, ...result})}/>;
  }
  if (state.activeBattle?.stageId === 'greenhouse_boss') {
    let context: ReturnType<typeof createGreenhouseContext>;
    try {context = createGreenhouseContext(state, catalog);}
    catch (error) {return <section className="l00-host-error" role="alert"><h2>战斗暂时无法进入</h2><p>{error instanceof Error ? error.message : '暂时无法进入这场战斗。'}</p></section>;}
    return <GreenhouseBattleViewport key={context.attemptId} {...context} paused={paused} onResult={result => onResult({attemptId: context.attemptId, ...result})}/>;
  }
  let context: ReturnType<typeof createChapterContext>;
  try {context = createChapterContext(state, catalog);}
  catch (error) {return <section className="l00-host-error" role="alert"><h2>战斗暂时无法进入</h2><p>{error instanceof Error ? error.message : '暂时无法进入这场战斗。'}</p></section>;}
  return <ChapterBattleViewport key={context.attemptId} {...context} paused={paused} onResult={result => onResult({attemptId: context.attemptId, ...result})}/>;
}
