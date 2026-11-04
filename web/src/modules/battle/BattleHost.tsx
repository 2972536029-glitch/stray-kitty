import {useCallback, useRef, useState} from 'react';
import type {ComponentType} from 'react';
import type {BattleResult, Catalog, GameState} from '../../contracts';
import {BattleResultScreen} from './BattleResultScreen';
import {L00BattleHost} from './L00BattleHost';
import {createChapterContext} from './chapter-context';
import {ChapterBattleViewport} from './chapter/ChapterBattleViewport';
import type {ChapterBattleViewportProps} from './chapter/ChapterBattleViewport';
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

interface ChapterStage {
  createContext: typeof createChapterContext;
  Viewport: ComponentType<ChapterBattleViewportProps>;
}

const CHAPTER_STAGES: Readonly<Record<string, ChapterStage>> = {
  alley_rescue: {createContext: createChapterContext, Viewport: ChapterBattleViewport},
  alley_boss: {createContext: createChapterContext, Viewport: ChapterBattleViewport},
  market_boss: {createContext: createMarketContext, Viewport: MarketBattleViewport},
  greenhouse_boss: {createContext: createGreenhouseContext, Viewport: GreenhouseBattleViewport},
  tunnel_boss: {createContext: createTunnelContext, Viewport: TunnelBattleViewport},
  finale_boss: {createContext: createFinaleContext, Viewport: FinaleBattleViewport},
};

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
  // Unknown stages retain the chapter adapter's validation and existing error message.
  const stageId = state.activeBattle?.stageId ?? '';
  const {createContext, Viewport} = Object.hasOwn(CHAPTER_STAGES, stageId) ? CHAPTER_STAGES[stageId] : CHAPTER_STAGES.alley_boss;
  let context: ReturnType<typeof createChapterContext>;
  try {context = createContext(state, catalog);}
  catch (error) {return <section className="l00-host-error" role="alert"><h2>战斗暂时无法进入</h2><p>{error instanceof Error ? error.message : '暂时无法进入这场战斗。'}</p></section>;}
  return <Viewport key={context.attemptId} {...context} stageId={state.activeBattle?.stageId} paused={paused} onResult={result => onResult({attemptId: context.attemptId, ...result})}/>;
}
