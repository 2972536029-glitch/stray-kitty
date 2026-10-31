import {useCallback, useRef, useState} from 'react';
import type {BattleResult, Catalog, GameState} from '../../contracts';
import {BattleResultScreen} from './BattleResultScreen';
import {L00BattleHost} from './L00BattleHost';
import {createChapterContext} from './chapter-context';
import {ChapterBattleViewport} from './chapter/ChapterBattleViewport';
import {createMarketContext} from './market-context';
import {MarketBattleViewport} from './market/MarketBattleViewport';
import {createGreenhouseContext} from './greenhouse-context';
import {GreenhouseBattleViewport} from './greenhouse/GreenhouseBattleViewport';
import {createTunnelContext} from './tunnel-context';
import {TunnelBattleViewport} from './tunnel/TunnelBattleViewport';
import {createFinaleContext} from './finale-context';
import {FinaleBattleViewport} from './finale/FinaleBattleViewport';
import './scene-art.css';
import './immersive.css';

interface Props {
  state:GameState;catalog:Catalog;paused:boolean;
  onResult:(result:BattleResult)=>void|boolean|Promise<boolean|void>;
  settlement?:{busy:boolean;pending:boolean;error:string;retry:()=>void|Promise<void>};
}

export function BattleHost(props:Props){
  return <BattleSession key={props.state.activeBattle?.id??'missing-attempt'} {...props}/>;
}

function BattleSession(props:Props){
  const [result,setResult]=useState<BattleResult|null>(null),[continued,setContinued]=useState(false);
  const [submitting,setSubmitting]=useState(false),[localError,setLocalError]=useState('');
  const inFlight=useRef(false);
  // Terminal callbacks are local notifications. Persistence and navigation wait
  // for confirmation, for every chapter and for both outcomes.
  const capture=useCallback((next:BattleResult)=>setResult(previous=>previous??next),[]);
  async function continueBattle(){
    if(!result||inFlight.current||props.settlement?.busy)return;
    inFlight.current=true;setSubmitting(true);setLocalError('');
    try{
      if(props.settlement?.pending){
        // Reuse the app's pending command/idempotency key after an uncertain
        // response, rather than submitting a second completion request.
        await props.settlement.retry();
      }else{
        const accepted=await props.onResult(result);
        if(accepted===false)setLocalError('暂时未能确认战斗结果，请重试。');
        else setContinued(true);
      }
    }catch(error){setLocalError(error instanceof Error?error.message:'暂时未能确认战斗结果，请重试。');}
    finally{inFlight.current=false;setSubmitting(false);}
  }
  const stageName=props.catalog.stages.find(stage=>stage.id===props.state.activeBattle?.stageId)?.name??'一起守住回家的路';
  return <>
    <BattleStage {...props} onResult={capture}/>
    {result&&!continued&&<BattleResultScreen outcome={result.outcome} stageName={stageName} busy={submitting||props.settlement?.busy}
      error={props.settlement?.error||localError} onContinue={()=>void continueBattle()}/>}
  </>;
}

function BattleStage({state, catalog, paused, onResult}: {
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
  if (state.activeBattle?.stageId === 'tunnel_boss') {
    let context: ReturnType<typeof createTunnelContext>;
    try {context = createTunnelContext(state, catalog);}
    catch (error) {return <section className="l00-host-error" role="alert"><h2>战斗暂时无法进入</h2><p>{error instanceof Error ? error.message : '暂时无法进入这场战斗。'}</p></section>;}
    return <TunnelBattleViewport key={context.attemptId} {...context} paused={paused} onResult={result => onResult({attemptId: context.attemptId, ...result})}/>;
  }
  if (state.activeBattle?.stageId === 'finale_boss') {
    let context: ReturnType<typeof createFinaleContext>;
    try {context = createFinaleContext(state, catalog);}
    catch (error) {return <section className="l00-host-error" role="alert"><h2>战斗暂时无法进入</h2><p>{error instanceof Error ? error.message : '暂时无法进入这场战斗。'}</p></section>;}
    return <FinaleBattleViewport key={context.attemptId} {...context} paused={paused} onResult={result => onResult({attemptId: context.attemptId, ...result})}/>;
  }
  let context: ReturnType<typeof createChapterContext>;
  try {context = createChapterContext(state, catalog);}
  catch (error) {return <section className="l00-host-error" role="alert"><h2>战斗暂时无法进入</h2><p>{error instanceof Error ? error.message : '暂时无法进入这场战斗。'}</p></section>;}
  return <ChapterBattleViewport key={context.attemptId} {...context} stageId={state.activeBattle?.stageId} paused={paused} onResult={result => onResult({attemptId: context.attemptId, ...result})}/>;
}
