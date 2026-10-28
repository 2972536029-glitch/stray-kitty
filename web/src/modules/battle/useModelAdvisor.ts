import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {requestModelAdvisor} from './model-advisor-client';
import {ModelAdvisorChat,type LocalAdvisorAnswer} from './model-advisor-chat';
import {buildModelAdvisorContext} from './advisor-context';

type BattleSnapshot=Parameters<typeof buildModelAdvisorContext>[1];
interface Options<T extends BattleSnapshot> {
  attemptId:string;stageId:string;open:boolean;blocked:boolean;
  getSnapshot:()=>T|null;
  localAnswer:(state:T,question:string)=>LocalAdvisorAnswer;
}
export function useModelAdvisor<T extends BattleSnapshot>(options:Options<T>){
  const latest=useRef(options);latest.current=options;
  const [chat]=useState(()=>new ModelAdvisorChat(requestModelAdvisor,()=>latest.current.open&&!latest.current.blocked&&!document.hidden));
  const state=useSyncExternalStore(chat.subscribe,chat.getSnapshot,chat.getSnapshot);
  useLayoutEffect(()=>{chat.setScope(options.stageId+':'+options.attemptId,options.open&&!options.blocked&&!document.hidden);},[chat,options.stageId,options.attemptId,options.open,options.blocked]);
  useEffect(()=>{
    const visibility=()=>{
      const current=latest.current;
      chat.setScope(current.stageId+':'+current.attemptId,current.open&&!current.blocked&&!document.hidden);
    };
    document.addEventListener('visibilitychange',visibility);
    return()=>{document.removeEventListener('visibilitychange',visibility);chat.cancel(false);};
  },[chat]);
  const ask=(question:string)=>{
    const current=latest.current;
    if(!current.open||current.blocked||document.hidden||!question.trim())return false;
    const snapshot=current.getSnapshot();if(!snapshot)return false;
    const fallback=current.localAnswer(snapshot,question);
    try{
      const context=buildModelAdvisorContext(current.stageId,snapshot);
      return chat.ask({attemptId:current.attemptId,stageId:current.stageId,question,context},fallback);
    }catch{return chat.replyLocally(question,fallback);}
  };
  return {...state,loading:state.pendingQuestion!==null,ask};
}
