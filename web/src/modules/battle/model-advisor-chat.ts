import {AdvisorContextChanged,type AdvisorHistoryEntry,type ModelAdvisorAnswer,type ModelAdvisorRequest} from './model-advisor-client';

export interface LocalAdvisorAnswer {title:string;text:string}
export interface AdvisorChatMessage {id:number;question:string;answer:ModelAdvisorAnswer}
export interface AdvisorChatSnapshot {messages:AdvisorChatMessage[];pendingQuestion:string|null;notice:string}
type Requester=(request:ModelAdvisorRequest,signal:AbortSignal)=>Promise<ModelAdvisorAnswer>;
const short=(value:string,limit:number)=>Array.from(value).slice(0,limit).join('');
export const cleanAdvisorQuestion=(value:string)=>short(value.trim(),500);

/** One attempt's last three manual exchanges, separate from automatic local teaching. */
export class ModelAdvisorChat {
  private state:AdvisorChatSnapshot={messages:[],pendingQuestion:null,notice:''};
  private listeners=new Set<()=>void>();
  private active:AbortController|null=null;
  private epoch=0;
  private nextId=0;
  private key='';
  private enabled=false;
  constructor(private request:Requester,private available:()=>boolean=()=>true){}
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(next:AdvisorChatSnapshot){this.state=next;for(const listener of this.listeners)listener();}
  setScope(key:string,enabled:boolean,preserveHistory=false){
    if(key!==this.key){this.cancel(false);this.key=key;this.publish({messages:preserveHistory?this.state.messages:[],pendingQuestion:null,notice:''});}
    if(!enabled)this.cancel(true);
    this.enabled=enabled;
  }
  cancel(showNotice=true){
    const pending=!!this.active;this.epoch++;this.active?.abort();this.active=null;
    if(pending)this.publish({...this.state,pendingQuestion:null,notice:showNotice?'本次提问已取消，恢复后可以重新询问。':''});
  }
  private usable(){return this.enabled&&this.available()&&!this.active;}
  private append(question:string,answer:ModelAdvisorAnswer,notice:string){
    this.publish({messages:[...this.state.messages,{id:++this.nextId,question,answer}].slice(-3),pendingQuestion:null,notice});
  }
  replyLocally(question:string,answer:LocalAdvisorAnswer){
    if(!this.usable()||!cleanAdvisorQuestion(question))return false;
    this.append(cleanAdvisorQuestion(question),{...answer,source:'local'},'暂时无法整理模型所需战况，先参考本地建议。');return true;
  }
  ask(input:Omit<ModelAdvisorRequest,'history'>,fallback:LocalAdvisorAnswer):boolean{
    const question=cleanAdvisorQuestion(input.question);
    if(!question||!this.usable())return false;
    const history:AdvisorHistoryEntry[]=this.state.messages.flatMap(message=>[
      {role:'user' as const,content:short(message.question,1200)},
      {role:'assistant' as const,content:short(message.answer.text,1200)},
    ]).slice(-6);
    const controller=new AbortController(),epoch=++this.epoch,key=this.key;
    this.active=controller;this.publish({...this.state,pendingQuestion:question,notice:''});
    const current=()=>epoch===this.epoch&&key===this.key&&this.enabled&&this.available()&&!controller.signal.aborted;
    void Promise.resolve().then(()=>{
      if(!current())throw new Error('advisor_cancelled');
      return this.request({...input,question,history},controller.signal);
    }).then(answer=>{
      if(!current())return;
      this.active=null;
      if(answer.source==='model')this.append(question,answer,'');
      else this.append(question,{...fallback,source:'local'},'模型暂时不可用，这次由本地规则给出建议。');
    }).catch(error=>{
      if(!current())return;
      this.active=null;
      if(error instanceof AdvisorContextChanged){
        this.publish({...this.state,pendingQuestion:null,notice:'眼前的情况已经变化，请重新问一次，我会查看最新进度。'});
        return;
      }
      this.append(question,{...fallback,source:'local'},'暂时连不上模型，先参考本地建议。');
    });
    return true;
  }
}
