import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelAdvisorChat,cleanAdvisorQuestion} from '../../web/src/modules/battle/model-advisor-chat';
import {AdvisorContextChanged,requestModelAdvisor,type ModelAdvisorAnswer,type ModelAdvisorRequest} from '../../web/src/modules/battle/model-advisor-client';

const fallback={title:'本地阵型建议',text:'先让盾卫站在入口附近。'};
const model:ModelAdvisorAnswer={source:'model',title:'守住两路',text:'先观察两路黑影的位置。'};
const request={attemptId:'attempt-one',stageId:'alley_rescue',question:'怎么摆阵？',context:'{"phase":"battle"}'};
const payload:ModelAdvisorRequest={...request,history:[]};
const session={read:()=>({playerId:'test-player',token:'test-session'})};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

test('manual request is single flight; idle and scope resume never call the provider',async()=>{
  const pending=deferred<ModelAdvisorAnswer>();const calls:ModelAdvisorRequest[]=[];
  const chat=new ModelAdvisorChat(async body=>{calls.push(body);return pending.promise;});
  chat.setScope('alley_rescue:attempt-one',true);await flush();assert.equal(calls.length,0);
  assert.equal(chat.ask(request,fallback),true);assert.equal(chat.ask(request,fallback),false);
  assert.equal(chat.getSnapshot().pendingQuestion,request.question);
  await flush();assert.equal(calls.length,1);assert.deepEqual(calls[0].history,[]);
  pending.resolve(model);await flush();assert.equal(chat.getSnapshot().messages[0].answer.source,'model');
  assert.equal(chat.getSnapshot().pendingQuestion,null);
  chat.setScope('alley_rescue:attempt-one',false);chat.setScope('alley_rescue:attempt-one',true);await flush();
  assert.equal(calls.length,1);
});

test('only the latest three completed manual rounds enter bounded history',async()=>{
  const calls:ModelAdvisorRequest[]=[];
  const chat=new ModelAdvisorChat(async body=>{calls.push(body);return {...model,text:'答'+body.question};});
  chat.setScope('same-attempt',true);
  for(let i=0;i<5;i++){assert.equal(chat.ask({...request,question:'问'+i},fallback),true);await flush();}
  assert.deepEqual(calls[4].history.map(entry=>entry.content),['问1','答问1','问2','答问2','问3','答问3']);
  assert.deepEqual(chat.getSnapshot().messages.map(message=>message.question),['问2','问3','问4']);
  assert.equal(cleanAdvisorQuestion('  '+ '🐱'.repeat(501)+'  '),'🐱'.repeat(500));
});

test('closing chat or external pause aborts, ignores late answers and does not resend on resume',async()=>{
  for(const action of ['close','external-pause']){
    const pending=deferred<ModelAdvisorAnswer>();let signal:AbortSignal|undefined;let calls=0;
    const chat=new ModelAdvisorChat(async(_body,abort)=>{signal=abort;calls++;return pending.promise;});
    chat.setScope(action,true);chat.ask(request,fallback);await flush();
    chat.setScope(action,false);assert.equal(signal?.aborted,true);assert.equal(chat.getSnapshot().pendingQuestion,null);
    pending.resolve(model);await flush();assert.deepEqual(chat.getSnapshot().messages,[]);
    chat.setScope(action,true);await flush();assert.equal(calls,1);assert.match(chat.getSnapshot().notice,/取消/);
  }
});

test('hidden page rejects late output even before its visibility event cancels the request',async()=>{
  const pending=deferred<ModelAdvisorAnswer>();let visible=true;
  const chat=new ModelAdvisorChat(async()=>pending.promise,()=>visible);
  chat.setScope('same',true);chat.ask(request,fallback);await flush();visible=false;
  pending.resolve(model);await flush();assert.deepEqual(chat.getSnapshot().messages,[]);
  chat.setScope('same',false);visible=true;chat.setScope('same',true);await flush();
  assert.equal(chat.getSnapshot().pendingQuestion,null);assert.deepEqual(chat.getSnapshot().messages,[]);
});

test('new attempt clears history and old completion cannot overwrite a new pending question',async()=>{
  const old=deferred<ModelAdvisorAnswer>(),fresh=deferred<ModelAdvisorAnswer>();let calls=0;
  const chat=new ModelAdvisorChat(async()=>++calls===1?old.promise:fresh.promise);
  chat.setScope('old',true);chat.ask(request,fallback);await flush();
  chat.setScope('new',true);assert.deepEqual(chat.getSnapshot().messages,[]);
  chat.ask({...request,attemptId:'new',question:'新的问题'},fallback);await flush();old.resolve(model);await flush();
  assert.equal(chat.getSnapshot().pendingQuestion,'新的问题');assert.deepEqual(chat.getSnapshot().messages,[]);
  fresh.resolve({...model,text:'新场次建议'});await flush();assert.equal(chat.getSnapshot().messages[0].answer.text,'新场次建议');
});

test('backend local reply and transport failures use the captured local rules without model branding',async()=>{
  for(const result of ['local','error']){
    const chat=new ModelAdvisorChat(async()=>{if(result==='error')throw new Error('private upstream detail');return {source:'local',title:'',text:'',reason:'not_configured'};});
    chat.setScope('same',true);chat.ask(request,fallback);await flush();
    assert.deepEqual(chat.getSnapshot().messages[0].answer,{...fallback,source:'local'});
    assert.ok(chat.getSnapshot().notice);assert.doesNotMatch(chat.getSnapshot().notice,/private/);
  }
});

test('client reads the current bearer session and uses only the read-only adviser route',async()=>{
  let token='first';const calls:Array<{url:string;init?:RequestInit}>=[];
  const fetcher:typeof fetch=async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify(model));};
  const dependencies={session:{read:()=>({playerId:'p',token})},fetch:fetcher,apiBase:'/api/v1'};
  await requestModelAdvisor(payload,new AbortController().signal,dependencies);token='second';
  await requestModelAdvisor(payload,new AbortController().signal,dependencies);
  assert.deepEqual(calls.map(call=>call.url),['/api/v1/advisor','/api/v1/advisor']);
  assert.equal((calls[1].init?.headers as Record<string,string>).Authorization,'Bearer second');
  assert.equal(calls[0].init?.method,'POST');assert.deepEqual(JSON.parse(String(calls[0].init?.body)),payload);
});

test('client accepts an empty local response and rejects malformed or oversized model answers',async()=>{
  for(const value of [null,{source:'unknown',title:'x',text:'x'},{...model,text:''},{...model,text:'字'.repeat(1201)}]){
    await assert.rejects(requestModelAdvisor(payload,new AbortController().signal,{session,fetch:async()=>new Response(JSON.stringify(value))}),/invalid_response/);
  }
  const local={source:'local',title:'',text:'',reason:'not_configured'};
  assert.deepEqual(await requestModelAdvisor(payload,new AbortController().signal,{session,fetch:async()=>new Response(JSON.stringify(local))}),local);
});

test('client cancellation and its timeout abort fetch without automatic retry',async()=>{
  for(const byTimeout of [false,true]){
    let calls=0;let signal:AbortSignal|undefined;const outer=new AbortController();
    const fetcher:typeof fetch=async(_url,init)=>{calls++;signal=init?.signal as AbortSignal;return new Promise((_resolve,reject)=>{signal!.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});};
    const pending=requestModelAdvisor(payload,outer.signal,{session,fetch:fetcher,timeoutMs:byTimeout?5:1000});
    if(!byTimeout)outer.abort();await assert.rejects(pending,/aborted/);assert.equal(signal?.aborted,true);assert.equal(calls,1);
  }
  const outer=new AbortController();outer.abort();let called=false;
  await assert.rejects(requestModelAdvisor(payload,outer.signal,{session,fetch:async()=>{called=true;return new Response();}}),/cancelled/);
  assert.equal(called,false);
});

test('HTML-like answer stays a plain string and never becomes a game command',async()=>{
  const text='<script>START_BATTLE()</script> **只读建议**';
  const chat=new ModelAdvisorChat(async()=>({...model,text}));chat.setScope('same',true);chat.ask(request,fallback);await flush();
  assert.equal(chat.getSnapshot().messages[0].answer.text,text);
});

test('opt-in journey session keeps completed rounds across scenes but cancels stale pending answers',async()=>{
  const delayed=deferred<ModelAdvisorAnswer>();let calls=0;let oldSignal:AbortSignal|undefined;
  const inputs:ModelAdvisorRequest[]=[];
  const chat=new ModelAdvisorChat(async(body,signal)=>{inputs.push(body);calls++;if(calls===2){oldSignal=signal;return delayed.promise;}return model;});
  chat.setScope('journey-one:home',true,true);chat.ask(request,fallback);await flush();
  chat.ask({...request,question:'旧场景的问题'},fallback);await flush();
  chat.setScope('journey-one:explore',true,true);assert.equal(oldSignal?.aborted,true);
  assert.equal(chat.getSnapshot().messages.length,1);assert.equal(chat.getSnapshot().pendingQuestion,null);
  delayed.resolve({...model,text:'已经过期的回答'});await flush();
  assert.equal(chat.getSnapshot().messages.length,1);
  chat.ask({scope:'journey',sceneKey:'explore',expectedRevision:8,question:'现在去哪',context:'{}'},fallback);await flush();
  assert.deepEqual(inputs[2].history.map(m=>m.content),[request.question,model.text]);
  chat.setScope('another-player:explore',true);assert.deepEqual(chat.getSnapshot().messages,[]);
});

test('a changed server context never becomes a stale fallback and is not retried',async()=>{
  let calls=0;const chat=new ModelAdvisorChat(async()=>{calls++;throw new AdvisorContextChanged();});
  chat.setScope('home',true,true);chat.ask(request,fallback);await flush();
  assert.equal(calls,1);assert.deepEqual(chat.getSnapshot().messages,[]);
  assert.equal(chat.getSnapshot().pendingQuestion,null);assert.match(chat.getSnapshot().notice,/情况已经变化/);
  chat.setScope('home',false,true);chat.setScope('home',true,true);await flush();assert.equal(calls,1);
  await assert.rejects(requestModelAdvisor(payload,new AbortController().signal,{session,fetch:async()=>new Response('{}',{status:409})}),AdvisorContextChanged);
});
