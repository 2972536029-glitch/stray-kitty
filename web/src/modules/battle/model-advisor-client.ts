import {runtime} from '../../config/runtime';
import {BrowserSessionStore} from '../../adapters/storage/BrowserSessionStore';

export interface ModelAdvisorAnswer {source:'model'|'local';title:string;text:string;reason?:string}
export interface AdvisorHistoryEntry {role:'user'|'assistant';content:string}
export interface ModelAdvisorRequest {
  scope?:'battle'|'journey';attemptId?:string;stageId?:string;
  sceneKey?:string;expectedRevision?:number;
  question:string;context:string;history:AdvisorHistoryEntry[];
}
/** Automatic map wording: no user question, history, battle ID or target table. */
export interface ExploreHintRequest {
  scope:'explore_hint';sceneKey:string;expectedRevision:number;context:string;
}
export class AdvisorContextChanged extends Error {
  constructor(){super('advisor_context_changed');}
}
interface Dependencies {
  fetch?:typeof fetch;
  session?:Pick<BrowserSessionStore,'read'>;
  apiBase?:string;
  timeoutMs?:number;
}

/** Read-only chat request; never enters the game's command/retry or persistence queue. */
export async function requestModelAdvisor(payload:ModelAdvisorRequest|ExploreHintRequest,signal:AbortSignal,dependencies:Dependencies={}):Promise<ModelAdvisorAnswer>{
  if(signal.aborted)throw new Error('advisor_cancelled');
  const session=(dependencies.session??new BrowserSessionStore()).read();
  if(!session?.token)throw new Error('advisor_session_unavailable');
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,dependencies.timeoutMs??20000);
  try{
    const response=await (dependencies.fetch??fetch)((dependencies.apiBase??runtime.apiBase)+'/advisor',{
      method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},
      body:JSON.stringify(payload),
    });
    if(!response.ok){
      if(response.status===409)throw new AdvisorContextChanged();
      throw new Error('advisor_request_unavailable');
    }
    const answer:unknown=await response.json();
    if(!answer||typeof answer!=='object')throw new Error('advisor_invalid_response');
    const value=answer as Record<string,unknown>;
    if((value.source!=='model'&&value.source!=='local')||typeof value.title!=='string'||typeof value.text!=='string'||Array.from(value.title).length>80||Array.from(value.text).length>1200)throw new Error('advisor_invalid_response');
    if(value.source==='model'&&(!value.title.trim()||!value.text.trim()))throw new Error('advisor_invalid_response');
    return {source:value.source,title:value.title,text:value.text,...(typeof value.reason==='string'?{reason:value.reason}:{} )};
  }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
