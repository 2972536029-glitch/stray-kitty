import assert from 'node:assert/strict';
import test from 'node:test';
import {queueImage} from '../../web/src/core/image-loading.ts';

type Artwork=typeof import('../../web/src/modules/map/artwork.ts');
let instance=0;
async function fresh():Promise<Artwork>{
  return import(new URL(`../../web/src/modules/map/artwork.ts?priority-test=${++instance}`,import.meta.url).href);
}
async function flush(){await new Promise<void>(resolve=>queueMicrotask(resolve));}

function browser(){
  const images:ImageStub[]=[],started:ImageStub[]=[];
  const active=new Set<ImageStub>();
  class ImageStub extends EventTarget {
    complete=true;naturalWidth=0;fetchPriority='auto';decoding='auto';
    onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
    private source='';
    constructor(){super();images.push(this);}
    get src(){return this.source;}
    set src(url:string){
      assert.equal(active.has(this),false);this.source=url;this.complete=false;
      active.add(this);started.push(this);assert.ok(active.size<=2);
    }
    decode(){return Promise.resolve();}
    load(){
      active.delete(this);this.complete=true;this.naturalWidth=2048;
      this.dispatchEvent(new Event('load'));this.onload?.();
    }
    get element(){return this as unknown as HTMLImageElement;}
  }
  const original=Object.getOwnPropertyDescriptor(globalThis,'Image');
  Object.defineProperty(globalThis,'Image',{configurable:true,value:ImageStub});
  return {images,started,image:()=>new ImageStub(),async drain(){
    for(let step=0;step<30;step++){
      await flush();if(!active.size)return;
      for(const image of [...active])image.load();
    }
    assert.fail('all finite test artwork requests should drain');
  },restore(){
    if(original)Object.defineProperty(globalThis,'Image',original);else Reflect.deleteProperty(globalThis,'Image');
  }};
}

for(const entry of [
  {method:'state',map:'market',floor:'Lm1',file:'night_market_Lminus1_tunnel_1672x941.lossless.webp'},
  {method:'ready',map:'tunnel',floor:'Lm1',file:'chapter4_Lminus1_tunnel_v11.lossless.webp'},
  {method:'ready',map:'market',floor:'L0',file:'night_market_L0_streets_1672x941.lossless.webp'},
] as const){
  test(`${entry.method} promotes a cached warm ${entry.map}/${entry.floor} into the next real queue slot`,async()=>{
    const env=browser();
    try{
      const art=await fresh();
      const first=env.image(),second=env.image();
      const firstPromise=queueImage(first.element,'first-blocker');
      const secondPromise=queueImage(second.element,'second-blocker');await flush();
      const automatic=env.image();const autoPromise=queueImage(automatic.element,'earlier-auto');
      // Prologue has no registry entry, so this invokes the existing pure-warm
      // path: every chapter/floor is cached and queued low behind two blockers.
      art.preloadClassicChapterArtwork('prologue');
      const warmImages=env.images.slice(3),count=env.images.length;
      assert.equal(warmImages.length,6);
      assert.ok(warmImages.every(image=>image.fetchPriority==='low'&&image.src===''));
      let ready:Promise<HTMLImageElement>|undefined;
      if(entry.method==='state')assert.equal(art.chapterBackgroundState(entry.map,entry.floor),'loading');
      else ready=art.chapterBackgroundReady(entry.map,entry.floor);
      assert.equal(env.images.length,count,'visible demand must promote the existing cached Image');
      // Subsequent background warming must not demote a visible pending image.
      art.preloadClassicChapterArtwork('prologue');
      assert.equal(env.images.length,count);
      first.load();await firstPromise;await flush();
      const promoted=env.started.at(-1)!;
      assert.equal(promoted.src.split('/').at(-1),entry.file);
      assert.equal(promoted.fetchPriority,'high');
      assert.equal(automatic.src,'','the promoted visible background precedes an older auto request');
      assert.ok(warmImages.filter(image=>image!==promoted).every(image=>image.fetchPriority==='low'));
      promoted.load();await flush();
      if(ready)assert.equal(await ready,promoted.element);
      assert.equal(art.chapterBackgroundState(entry.map,entry.floor),'ready');
      await env.drain();await Promise.all([secondPromise,autoPromise]);
    }finally{await env.drain();env.restore();}
  });
}
