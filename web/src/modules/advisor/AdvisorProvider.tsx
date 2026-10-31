import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type Dispatch,type ReactNode,type SetStateAction} from 'react';
import type {Catalog,GameState} from '../../contracts';
import {BrowserSessionStore} from '../../adapters/storage/BrowserSessionStore';
import {ModelAdvisorChat,type LocalAdvisorAnswer} from '../battle/model-advisor-chat';
import {requestModelAdvisor,type ModelAdvisorRequest} from '../battle/model-advisor-client';
import {buildModelAdvisorContext} from '../battle/advisor-context';
import {buildJourneyAdvisorContext,getJourneyLocalAnswer,journeySceneKey,journeySceneLabel,type JourneySceneObservation} from './journey-context';

export interface BattleAdvisorAdapter {
  attemptId:string;stageId:string;
  blocked:()=>boolean;
  prepare:(question:string)=>{request:Omit<ModelAdvisorRequest,'history'>;fallback:LocalAdvisorAnswer}|null;
}
interface Props {
  state:GameState;catalog:Catalog;open:boolean;onOpenChange:Dispatch<SetStateAction<boolean>>;
  blocked:boolean;scene?:JourneySceneObservation;resetKey?:string|number;children:ReactNode;
}
interface SharedAdvisor {
  chat:ModelAdvisorChat;open:boolean;setOpen:Dispatch<SetStateAction<boolean>>;
  ready:boolean;sceneLabel:string;ask:(question:string)=>boolean;
  registerBattle:(adapter:BattleAdvisorAdapter)=>()=>void;
  synchronize:()=>void;
}
const AdvisorContext=createContext<SharedAdvisor|null>(null);

// Ignore movement counters and payment records. Changes to what the player can
// ask about invalidate pending answers, but completed conversations can continue.
function progressKey(state:GameState){
  return JSON.stringify([journeySceneKey(state),state.flags,state.cats,state.inventory,state.currencies,
    state.completedStages,state.furniture,state.placements,state.homeRepairs,state.eventState,
    state.lastResult,state.activeBattle?.status]);
}
function observationKey(scene?:JourneySceneObservation){
  return JSON.stringify([scene?.nearby?.id,scene?.nearby?.label,scene?.floor,
    Number.isFinite(scene?.position?.x)?scene?.position?.x:null,
    Number.isFinite(scene?.position?.y)?scene?.position?.y:null]);
}

export function AdvisorProvider(props:Props){
  const latest=useRef(props);latest.current=props;
  const battle=useRef<BattleAdvisorAdapter|null>(null);
  const [,refreshBridge]=useState(0);
  const session=useRef(new BrowserSessionStore());
  const identity=useRef<{token:string|undefined;qa:string|undefined;reset:Props['resetKey'];revision:number;epoch:number}|null>(null);
  const activeIdentity=useRef(-1);
  const available=()=>{
    const current=latest.current;
    if(!current.open||current.blocked||document.hidden)return false;
    // A same-tab account change does not dispatch a browser storage event.
    // Check again when accepting a response, before App finishes refreshing state.
    if(session.current.read()?.token!==identity.current?.token)return false;
    return current.state.phase!=='battle'||(!!battle.current&&battle.current.attemptId===current.state.activeBattle?.id&&!battle.current.blocked());
  };
  const availableRef=useRef(available);availableRef.current=available;
  const [chat]=useState(()=>new ModelAdvisorChat(requestModelAdvisor,()=>availableRef.current()));
  const synchronize=useCallback(()=>{
    const current=latest.current;
    const token=session.current.read()?.token;
    const previous=identity.current;
    const reset=!previous||previous.token!==token||previous.qa!==current.state.qaCheckpointId||
      previous.reset!==current.resetKey||current.state.revision<previous.revision;
    const epoch=reset?(previous?.epoch??0)+1:previous.epoch;
    identity.current={token,qa:current.state.qaCheckpointId,reset:current.resetKey,revision:current.state.revision,epoch};
    const keep=activeIdentity.current===epoch;
    activeIdentity.current=epoch;
    chat.setScope(`${epoch}:${progressKey(current.state)}:${observationKey(current.scene)}`,availableRef.current(),keep);
  },[chat]);
  const token=session.current.read()?.token;
  useLayoutEffect(synchronize,[synchronize,props.state,props.scene,props.open,props.blocked,props.resetKey,token]);
  useEffect(()=>{
    const onVisibility=()=>synchronize();
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('storage',onVisibility);
    return()=>{document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('storage',onVisibility);chat.cancel(false);};
  },[chat,synchronize]);
  const registerBattle=useCallback((adapter:BattleAdvisorAdapter)=>{
    battle.current=adapter;synchronize();refreshBridge(n=>n+1);
    return()=>{
      if(battle.current===adapter){battle.current=null;chat.cancel(false);refreshBridge(n=>n+1);}
    };
  },[chat,synchronize]);
  const ask=useCallback((question:string)=>{
    synchronize();
    if(!availableRef.current()||!question.trim())return false;
    const {state,catalog,scene}=latest.current;
    if(state.phase==='battle'){
      try{
        const prepared=battle.current?.prepare(question);
        return prepared?chat.ask(prepared.request,prepared.fallback):false;
      }catch{
        return chat.replyLocally(question,{title:'暂时无法读取战况',text:'当前战斗信息尚未准备好，请以棋盘上的血量、能量和提示为准，稍后再问我。'});
      }
    }
    const fallback=getJourneyLocalAnswer(state,catalog,question,scene);
    return chat.ask({scope:'journey',sceneKey:journeySceneKey(state),expectedRevision:state.revision,
      question,context:buildJourneyAdvisorContext(state,catalog,scene)},fallback);
  },[chat,synchronize]);
  const ready=!props.blocked&&(props.state.phase!=='battle'||
    (!!battle.current&&battle.current.attemptId===props.state.activeBattle?.id&&!battle.current.blocked()));
  const value=useMemo(()=>({chat,open:props.open,setOpen:props.onOpenChange,ready,
    sceneLabel:journeySceneLabel(props.state,props.catalog),ask,registerBattle,synchronize}),
  [chat,props.open,props.onOpenChange,props.state,props.catalog,ready,ask,registerBattle,synchronize]);
  return <AdvisorContext.Provider value={value}>{props.children}</AdvisorContext.Provider>;
}

export function useSharedAdvisor(){return useContext(AdvisorContext);}
/** Opt-in adapter: the battle owner chooses whether to use the shared session.
 * It neither opens a panel nor changes simulation/pause state. */
export function useBattleAdvisorBridge<T extends Parameters<typeof buildModelAdvisorContext>[1]>(options:{
  attemptId:string;stageId:string;blocked:boolean;getSnapshot:()=>T|null;
  localAnswer:(state:T,question:string)=>LocalAdvisorAnswer;
}){
  const shared=useSharedAdvisor();
  const latest=useRef(options);latest.current=options;
  const register=shared?.registerBattle;
  useLayoutEffect(()=>{
    if(!register)return;
    return register({attemptId:options.attemptId,stageId:options.stageId,blocked:()=>latest.current.blocked,
      prepare:question=>{
        const current=latest.current;const state=current.getSnapshot();if(!state)return null;
        return {request:{attemptId:current.attemptId,stageId:current.stageId,question,context:buildModelAdvisorContext(current.stageId,state)},
          fallback:current.localAnswer(state,question)};
      }});
  },[register,options.attemptId,options.stageId,options.blocked]);
}
export function useAdvisorOpen():[boolean,Dispatch<SetStateAction<boolean>>]{
  const shared=useSharedAdvisor();
  const local=useState(false);
  return shared?[shared.open,shared.setOpen]:local;
}
export function useGlobalAdvisor(){
  const shared=useSharedAdvisor();
  if(!shared)throw new Error('AdvisorProvider is required');
  const snapshot=useSyncExternalStore(shared.chat.subscribe,shared.chat.getSnapshot,shared.chat.getSnapshot);
  return {...snapshot,loading:snapshot.pendingQuestion!==null,ask:shared.ask,ready:shared.ready,sceneLabel:shared.sceneLabel};
}
