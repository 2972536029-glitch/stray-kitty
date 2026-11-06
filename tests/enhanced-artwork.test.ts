import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setImmediate} from 'node:timers/promises';
import {chapterDisplayArtwork} from '../web/src/modules/map/enhanced-artwork';

test('all five floors upgrade only after decoding and reuse their decoded image', async () => {
  const previous=globalThis.Image;
  const images:ImageStub[]=[];
  class ImageStub extends EventTarget {
    complete=false;naturalWidth=0;fetchPriority='auto';decoding='auto';private source='';
    private decoded!:()=>void;
    private ready=new Promise<void>(resolve=>{this.decoded=resolve;});
    constructor(){super();images.push(this);}
    get src(){return this.source;}
    set src(url:string){this.source=url;queueMicrotask(()=>{this.complete=true;this.naturalWidth=1672;this.dispatchEvent(new Event('load'));});}
    decode(){return this.ready;}
    finishDecode(){this.decoded();}
  }
  globalThis.Image=ImageStub as unknown as typeof Image;
  try {
    const original={complete:false,naturalWidth:0} as HTMLImageElement;
    for(const [map,floor,stem] of [
      ['market','L0','night_market_L0_streets_'],['market','L1','night_market_L1_rooftops_'],['market','Lm1','night_market_Lminus1_tunnel_'],
      ['tunnel','L0','chapter4_L0_approved.'],['tunnel','Lm1','chapter4_Lminus1_tunnel_v11.']
    ]){
      Object.assign(original,{complete:false,naturalWidth:0});const count=images.length;
      assert.equal(chapterDisplayArtwork(map,floor,original),original);assert.equal(images.length,count);
      Object.assign(original,{complete:true,naturalWidth:1672});
      assert.equal(chapterDisplayArtwork(map,floor,original),original);await setImmediate();
      const delivered=images.at(-1)!;assert.ok(delivered.src.includes(stem));
      assert.equal(delivered.fetchPriority,'low');assert.equal(delivered.decoding,'async');
      assert.equal(chapterDisplayArtwork(map,floor,original),original,'loaded but not decoded stays on the original');
      delivered.finishDecode();await setImmediate();
      assert.equal(chapterDisplayArtwork(map,floor,original),delivered);
      assert.equal(chapterDisplayArtwork(map,floor,original),delivered);assert.equal(images.length,count+1);
    }
    assert.equal(chapterDisplayArtwork('warehouse','L0',original),original);
    assert.equal(images.length,5,'Chapter 5 never loads an enhancement');
  } finally {globalThis.Image=previous;}
});
