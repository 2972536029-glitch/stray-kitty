import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate} from 'node:timers/promises';
import {getEventListeners} from 'node:events';

type Queue=typeof import('../../web/src/core/image-loading.ts');
let instance=0;
async function fresh():Promise<Queue>{
  return import(new URL(`../../web/src/core/image-loading.ts?queue-test=${++instance}`,import.meta.url).href);
}
async function flush(){await new Promise<void>(resolve=>queueMicrotask(resolve));}

function browser(maximum=2){
  const started:string[]=[];
  const active=new Set<ImageStub>();
  let peak=0;
  class ImageStub extends EventTarget {
    complete=true;
    naturalWidth=0;
    fetchPriority='auto';
    onload:((event:Event)=>void)|null=null;
    onerror:((event:Event)=>void)|null=null;
    onSource:((url:string)=>void)|undefined;
    decode:()=>Promise<void>=()=>Promise.resolve();
    private source='';
    constructor(readonly name:string){super();}
    get src(){return this.source;}
    set src(url:string){
      assert.equal(active.has(this),false,'one Image must not overlap its own requests');
      this.source=url;this.complete=false;this.naturalWidth=0;
      started.push(`${this.name}:${url}`);active.add(this);peak=Math.max(peak,active.size);
      assert.ok(active.size<=maximum,'unfinished requests must stay within the expected lane limits');
      this.onSource?.(url);
    }
    finish(type:'load'|'error'){
      active.delete(this);this.complete=true;this.naturalWidth=type==='load'?100:0;
      const event=new Event(type);
      // DOM target capture listeners run before the onload/onerror attribute.
      // Node's real EventTarget supplies listener registration/removal/dispatch.
      this.dispatchEvent(event);
      if(type==='load')this.onload?.(event);else this.onerror?.(event);
    }
    get element(){return this as unknown as HTMLImageElement;}
  }
  return {Image:ImageStub,image:(name:string)=>new ImageStub(name),started,active,peak:()=>peak};
}

test('empty complete Images wait for real events and the global queue never exceeds two',async()=>{
  const {queueImage}=await fresh();const env=browser();
  const images=['a','b','c','d','e'].map(env.image);
  const promises=images.map(image=>queueImage(image.element,image.name+'.png'));
  assert.ok(images.every(image=>image.complete&&image.src===''));
  assert.deepEqual(env.started,[],'src assignment is deferred to the pump microtask');
  await flush();assert.deepEqual(env.started,['a:a.png','b:b.png']);
  assert.equal(images[2].src,'','complete=true on an empty element must not finish its queued request');
  images[0].finish('load');assert.equal(await promises[0],images[0].element);
  await flush();assert.deepEqual(env.started,['a:a.png','b:b.png','c:c.png']);
  images[1].finish('error');await assert.rejects(promises[1],/Image failed to load/);
  await flush();assert.equal(images[3].src,'d.png');
  images[2].finish('load');await flush();assert.equal(images[4].src,'e.png');
  images[3].finish('load');images[4].finish('load');
  await Promise.all([promises[2],promises[3],promises[4]]);
  assert.equal(env.peak(),2);assert.equal(env.active.size,0);
});

test('battle downloads progress in two independent slots while both background slots remain occupied',async()=>{
  const {queueImage,queueBattleImage}=await fresh();const env=browser(4);
  const background=['background-a','background-b'].map(env.image);
  const waiting=background.map(image=>queueImage(image.element,image.name));
  await flush();
  const battle=['floor','residences','obstacles','props'].map(env.image);
  const ready=battle.map(image=>queueBattleImage(image.element,image.name));
  await flush();
  assert.deepEqual(env.started,['background-a:background-a','background-b:background-b','floor:floor','residences:residences']);
  for(let index=0;index<battle.length;index++){
    assert.ok(battle[index].src,'visible art starts without waiting for background completion');
    assert.ok(background.every(image=>!image.complete));
    battle[index].finish('load');await ready[index];await flush();
  }
  assert.equal(env.peak(),4);
  assert.equal(env.active.size,2,'only the original background transfers remain');
  background.forEach(image=>image.finish('load'));await Promise.all(waiting);
  assert.equal(env.active.size,0);
});

test('priority is read when a slot opens and equal priorities retain FIFO after promotion',async()=>{
  const {queueImage}=await fresh();const env=browser();
  const blockers=['a','b'].map(env.image);
  const blockerPromises=blockers.map(image=>queueImage(image.element,image.name));
  await flush();
  const [first,second,high,auto,low]=['first','second','high','auto','low'].map(env.image);
  first.fetchPriority='low';high.fetchPriority='high';low.fetchPriority='low';
  const pending=[first,second,high,auto,low];
  const promises=pending.map(image=>queueImage(image.element,image.name));
  first.fetchPriority='high';blockers[0].finish('load');await flush();
  assert.equal(env.started.at(-1),'first:first','promoted oldest task wins the high-priority tie');
  second.fetchPriority='high';blockers[1].finish('load');await flush();
  assert.equal(env.started.at(-1),'second:second','priority is not frozen at initial enqueue');
  first.finish('load');await flush();assert.equal(env.started.at(-1),'high:high');
  second.finish('load');await flush();assert.equal(env.started.at(-1),'auto:auto');
  high.finish('load');await flush();assert.equal(env.started.at(-1),'low:low');
  auto.finish('load');low.finish('load');await Promise.all([...blockerPromises,...promises]);
});

test('same Image URLs reuse their promise, while a new URL cannot overlap the active URL',async()=>{
  const {queueImage}=await fresh();const env=browser();const image=env.image('image');
  const first=queueImage(image.element,'first');
  assert.equal(queueImage(image.element,'first'),first);await flush();
  assert.equal(queueImage(image.element,'first'),first);
  const second=queueImage(image.element,'second');
  assert.equal(queueImage(image.element,'second'),second);await flush();
  assert.deepEqual(env.started,['image:first'],'a spare global slot does not allow an overlapping same-Image transfer');
  image.finish('load');await first;await flush();assert.equal(image.src,'second');
  image.finish('load');assert.equal(await second,image.element);
  assert.equal(queueImage(image.element,'second'),second);await flush();
  assert.deepEqual(env.started,['image:first','image:second']);
});

test('original error fallback queues on the same Image after old listeners release exactly once',async()=>{
  const {queueImage}=await fresh();const env=browser();
  const image=env.image('image'),blocker=env.image('blocker'),waiting=env.image('waiting');
  let fallback:Promise<HTMLImageElement>|undefined;let failures=0,loads=0;
  const onload=()=>{loads++;};
  const onerror=()=>{
    assert.equal(getEventListeners(image,'load').length,0);
    assert.equal(getEventListeners(image,'error').length,0,'old capture listeners must be removed before fallback callbacks');
    failures++;fallback=queueImage(image.element,'fallback');
    assert.equal(image.src,'primary','queueing inside onerror must not synchronously replace src');
  };
  image.onload=onload;image.onerror=onerror;
  const primary=queueImage(image.element,'primary'),blocked=queueImage(blocker.element,'blocker');
  const next=queueImage(waiting.element,'waiting');await flush();
  assert.equal(image.onload,onload);assert.equal(image.onerror,onerror);
  image.finish('error');await assert.rejects(primary);await flush();
  assert.equal(waiting.src,'waiting');assert.equal(image.src,'primary','earlier equal-priority task retains its place');
  image.dispatchEvent(new Event('error'));
  image.dispatchEvent(new Event('load'));
  await flush();assert.equal(image.src,'primary','duplicate old events cannot release an extra slot');
  blocker.finish('load');await blocked;await flush();assert.equal(image.src,'fallback');
  assert.equal(loads,0);assert.equal(failures,1);
  image.finish('load');waiting.finish('load');await Promise.all([fallback!,next]);
  assert.equal(loads,1);assert.equal(failures,1);assert.equal(env.peak(),2);
});

test('a synchronous src error yields before starting an onerror fallback',async()=>{
  const {queueImage}=await fresh();const env=browser();const image=env.image('image');
  let insideHandler=false;let fallback:Promise<HTMLImageElement>|undefined;
  image.onSource=url=>{
    assert.equal(insideHandler,false,'fallback src must not be assigned inside the old handler');
    if(url==='primary')image.finish('error');
  };
  image.onerror=()=>{
    insideHandler=true;fallback=queueImage(image.element,'fallback');
    assert.equal(image.src,'primary');insideHandler=false;
  };
  const primary=queueImage(image.element,'primary');await assert.rejects(primary);await flush();
  assert.deepEqual(env.started,['image:primary','image:fallback']);
  image.finish('load');await fallback;
});

test('decode rejection after a successful network load queues a fallback without occupying an old slot',async()=>{
  const {queueImage}=await fresh();const env=browser();
  const image=env.image('image'),blocker=env.image('blocker'),waiting=env.image('waiting');
  let rejectDecode!:(error:Error)=>void;
  image.decode=()=>new Promise<void>((_resolve,reject)=>{rejectDecode=reject;});
  const decoded=queueImage(image.element,'primary').then(()=>image.decode()).catch(()=>queueImage(image.element,'fallback'));
  const blocked=queueImage(blocker.element,'blocker'),next=queueImage(waiting.element,'waiting');await flush();
  image.finish('load');await flush();assert.equal(waiting.src,'waiting','load releases before decode finishes');
  rejectDecode(new Error('decode failed'));await flush();assert.equal(image.src,'primary');
  blocker.finish('load');await blocked;await flush();assert.equal(image.src,'fallback');
  image.finish('load');waiting.finish('load');await Promise.all([decoded,next]);assert.equal(env.peak(),2);
});

test('cancel only removes a pending URL; an active request keeps its slot and callbacks',async()=>{
  const {queueImage,cancelQueuedImage}=await fresh();const env=browser();
  const image=env.image('image'),blocker=env.image('blocker'),waiting=env.image('waiting');
  let loads=0;const onload=()=>{loads++;};image.onload=onload;
  const active=queueImage(image.element,'active'),blocked=queueImage(blocker.element,'blocker');await flush();
  assert.equal(cancelQueuedImage(image.element),false);assert.equal(image.src,'active');
  const cancelled=queueImage(image.element,'next');
  assert.equal(cancelQueuedImage(image.element),true);
  await assert.rejects(cancelled,{name:'AbortError'});
  const next=queueImage(waiting.element,'waiting');await flush();
  assert.equal(waiting.src,'','cancelled pending task cannot release an active transfer slot');
  image.finish('load');await active;await flush();assert.equal(waiting.src,'waiting');
  assert.equal(image.onload,onload);assert.equal(loads,1);
  blocker.finish('load');waiting.finish('load');await Promise.all([blocked,next]);
});

test('cancelled pending URLs can be requeued for StrictMode setup and newer pending URLs replace older ones',async()=>{
  const {queueImage,cancelQueuedImage}=await fresh();const env=browser();const image=env.image('image');
  const cancelled=queueImage(image.element,'same');assert.equal(cancelQueuedImage(image.element),true);
  const requeued=queueImage(image.element,'same');assert.notEqual(requeued,cancelled);
  await assert.rejects(cancelled,{name:'AbortError'});await flush();assert.equal(image.src,'same');
  const older=queueImage(image.element,'older'),newer=queueImage(image.element,'newer');
  await assert.rejects(older,{name:'AbortError'});await flush();assert.equal(image.src,'same');
  image.finish('load');await requeued;await flush();assert.equal(image.src,'newer');
  image.finish('load');await newer;assert.deepEqual(env.started,['image:same','image:newer']);
  assert.equal(cancelQueuedImage(image.element),false);
});

test('duplicate completion cannot free another request slot and original callbacks remain unchanged',async()=>{
  const {queueImage}=await fresh();const env=browser();const images=['a','b','c','d'].map(env.image);
  let calls=0;const original=()=>{calls++;};images[0].onload=original;
  const promises=images.map(image=>queueImage(image.element,image.name));await flush();
  images[0].finish('load');
  assert.equal(getEventListeners(images[0],'load').length,0);
  assert.equal(getEventListeners(images[0],'error').length,0);
  images[0].dispatchEvent(new Event('load'));images[0].dispatchEvent(new Event('error'));
  await flush();assert.deepEqual(env.started,['a:a','b:b','c:c']);
  assert.equal(images[0].onload,original);assert.equal(calls,1);
  images[1].finish('load');await flush();assert.equal(images[3].src,'d');
  images[2].finish('load');images[3].finish('load');await Promise.all(promises);assert.equal(env.peak(),2);
});

test('ignored failures/cancellations are handled internally and repeated failed URLs do not retry',async()=>{
  const {queueImage,cancelQueuedImage}=await fresh();const env=browser();
  const failed=env.image('failed'),cancelled=env.image('cancelled');
  const unhandled:unknown[]=[];const observe=(error:unknown)=>unhandled.push(error);
  process.on('unhandledRejection',observe);
  try{
    const promise=queueImage(failed.element,'failed');
    void queueImage(cancelled.element,'cancelled');cancelQueuedImage(cancelled.element);
    await flush();failed.finish('error');await setImmediate();
    assert.equal(queueImage(failed.element,'failed'),promise);await flush();
    assert.deepEqual(env.started,['failed:failed']);assert.deepEqual(unhandled,[]);
    await assert.rejects(promise,/Image failed to load/);
  }finally{process.off('unhandledRejection',observe);}
});

test('asset consumers share one download and wait for decoding before reusing the image',async()=>{
  const {loadCachedImage}=await fresh(),env=browser();
  const original=Object.getOwnPropertyDescriptor(globalThis,'Image');
  Object.defineProperty(globalThis,'Image',{configurable:true,value:env.Image});
  try{
    const first=loadCachedImage('/shared.webp','/shared.png');
    assert.equal(loadCachedImage('/shared.webp','/shared.png'),first);
    await flush();assert.equal(env.started.length,1);
    const image=[...env.active][0];let decode!:()=>void,settled=false;
    image.decode=()=>new Promise(resolve=>{decode=resolve;});
    void first.then(()=>{settled=true;});image.finish('load');await setImmediate();
    assert.equal(settled,false);decode();
    assert.equal(await first,image.element);
    assert.equal(await loadCachedImage('/shared.webp','/shared.png'),image.element);
    assert.equal(env.started.length,1);
  }finally{if(original)Object.defineProperty(globalThis,'Image',original);else Reflect.deleteProperty(globalThis,'Image');}
});

test('battle WebP fallback preserves repaint callbacks and only reports failure if the PNG also fails',async()=>{
  const {queueBattleImage}=await fresh(),env=browser();
  for(const outcome of ['load','error'] as const){
    const image=env.image(outcome);let loaded=0,failed=0;
    image.onload=()=>{loaded++;};const onerror=()=>{failed++;};image.onerror=onerror;
    const ready=queueBattleImage(image.element,'/battle.webp','/battle.png');
    const result=outcome==='error'?assert.rejects(ready,/Image failed to load/):ready;
    await flush();image.finish('error');await setImmediate();
    assert.equal(failed,0);assert.equal(image.src,'/battle.png');
    image.finish(outcome);await result;
    assert.equal(loaded,outcome==='load'?1:0);assert.equal(failed,outcome==='error'?1:0);
    assert.equal(image.onerror,onerror);
  }
});

test('cached assets fall back after decode failure and allow a later retry after both URLs fail',async()=>{
  const {loadCachedImage}=await fresh(),env=browser();
  const original=Object.getOwnPropertyDescriptor(globalThis,'Image');
  Object.defineProperty(globalThis,'Image',{configurable:true,value:env.Image});
  try{
    const first=loadCachedImage('/fallback.webp','/fallback.png');await flush();
    const image=[...env.active][0];image.decode=()=>Promise.reject(Error('decode failed'));
    image.finish('load');await setImmediate();
    assert.equal(image.src,'/fallback.png');
    image.decode=()=>Promise.resolve();image.finish('load');assert.equal(await first,image.element);
    const failed=loadCachedImage('/retry.webp','/retry.png');
    const rejection=assert.rejects(failed,/Image failed to load/);await flush();
    const failing=[...env.active][0];failing.finish('error');await setImmediate();
    assert.equal(failing.src,'/retry.png');failing.finish('error');await rejection;
    const retry=loadCachedImage('/retry.webp','/retry.png');assert.notEqual(retry,failed);await flush();
    const recovered=[...env.active][0];assert.notEqual(recovered,failing);
    recovered.finish('load');assert.equal(await retry,recovered.element);
  }finally{if(original)Object.defineProperty(globalThis,'Image',original);else Reflect.deleteProperty(globalThis,'Image');}
});
