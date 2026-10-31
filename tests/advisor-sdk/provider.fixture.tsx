import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {AdvisorProvider, useGlobalAdvisor, useSharedAdvisor} from '../../web/src/modules/advisor/AdvisorProvider';
import type {Catalog, GameState} from '../../web/src/contracts';

const catalog: Catalog = {version:'test',chapters:[],story:[],maps:[],events:[],cats:[],stages:[],furniture:[],slots:[],items:[],pools:[],tutorials:[],assets:[],products:[],homeDecor:[]};
const state: GameState = {schemaVersion:1,contentVersion:'test',revision:1,phase:'explore',chapterId:'alley',mapId:'alley',storyNodeId:'',pendingEventId:'',activeBattle:null,flags:[],cats:[],inventory:{},currencies:{},furniture:[],placements:{},completedStages:[],lastResult:{message:''}};
let advisor: ReturnType<typeof useGlobalAdvisor>, shared: NonNullable<ReturnType<typeof useSharedAdvisor>>;
const root=createRoot(document.getElementById('root')!);
const props={state,catalog,open:true,blocked:false,resetKey:0,scene:{nearby:{id:'first',label:'第一处纸箱'}}};
function Probe(){advisor=useGlobalAdvisor();shared=useSharedAdvisor()!;return null;}
function render(){flushSync(()=>root.render(createElement(AdvisorProvider,{...props,onOpenChange:value=>{props.open=typeof value==='function'?value(props.open):value;render();},children:createElement(Probe)})));}
const pending: Array<{body:Record<string,unknown>;signal:AbortSignal;resolve:(value:Response)=>void}> = [];
window.fetch = async (_url, init) => new Promise<Response>(resolve=>pending.push({body:JSON.parse(String(init?.body)),signal:init?.signal as AbortSignal,resolve}));
const sdk={
  init(){localStorage.setItem('stray-kitty.session.v1',JSON.stringify({playerId:'first-player',token:'first-token'}));render();},
  update(changes:Partial<typeof props>){Object.assign(props,changes);render();},
  state(){return props.state;},
  ask(question:string){let accepted=false;flushSync(()=>{accepted=advisor.ask(question);});return accepted;},
  snapshot(){return {messages:advisor.messages,pendingQuestion:advisor.pendingQuestion,notice:advisor.notice,ready:advisor.ready};},
  requests(){return pending.map(item=>({body:item.body,aborted:item.signal.aborted}));},
  answer(index:number,text='当前回答'){pending[index].resolve(new Response(JSON.stringify({source:'model',title:'阿策建议',text})));},
  token(value:string){localStorage.setItem('stray-kitty.session.v1',JSON.stringify({playerId:value,token:value}));},
  sync(){flushSync(()=>shared.synchronize());},
  battle(){flushSync(()=>shared.registerBattle({attemptId:'battle-one',stageId:'alley_rescue',blocked:()=>false,
    prepare:question=>({request:{scope:'battle',attemptId:'battle-one',stageId:'alley_rescue',question,context:'当前棋盘'},fallback:{title:'本地',text:'先看看棋盘。'}})}));},
  brokenBattle(){flushSync(()=>shared.registerBattle({attemptId:'battle-one',stageId:'alley_rescue',blocked:()=>false,
    prepare:()=>{throw new Error('private snapshot internals');}}));},
};
(window as unknown as {sdk:typeof sdk}).sdk=sdk;
