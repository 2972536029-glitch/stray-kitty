import assert from 'node:assert/strict';
import {register} from 'node:module';
import test from 'node:test';
import {queueImage} from '../../web/src/core/image-loading.ts';

// Match Vite's asset URL imports without reading PNGs or starting a browser.
register('data:text/javascript,'+encodeURIComponent(`
  export async function load(url,context,nextLoad){
    if(url.endsWith('.png'))return {format:'module',source:'export default '+JSON.stringify(url),shortCircuit:true};
    return nextLoad(url,context);
  }
`),import.meta.url);

let instance=0;
async function fresh(name:string){
  return import(new URL(`../../web/src/modules/battle/${name}.ts?loading-test=${++instance}`,import.meta.url).href);
}

function browser(){
  const images:ImageStub[]=[];
  class ImageStub extends EventTarget {
    complete=true;
    naturalWidth=0;
    naturalHeight=0;
    private source='';
    fetchPriority='auto';
    onload:(()=>void)|null=null;
    onerror:(()=>void)|null=null;
    constructor(){super();images.push(this);}
    get src(){return this.source;}
    set src(value:string){this.source=value;this.complete=false;}
    load(){assert.ok(this.src,'the queue must start the request before load');this.complete=true;this.naturalWidth=2048;this.naturalHeight=2048;this.dispatchEvent(new Event('load'));this.onload?.();}
    fail(){assert.ok(this.src,'the queue must start the request before error');this.complete=true;this.dispatchEvent(new Event('error'));this.onerror?.();}
  }
  const draws:unknown[][]=[];
  const ink=new Proxy({
    globalAlpha:1,
    drawImage:(...args:unknown[])=>draws.push(args),
    createLinearGradient:()=>({addColorStop(){}}),
    createRadialGradient:()=>({addColorStop(){}}),
  },{get:(target,key)=>key in target?Reflect.get(target,key):()=>{}}) as unknown as CanvasRenderingContext2D;
  const originals=['Image','document'].map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
  Object.defineProperty(globalThis,'Image',{configurable:true,value:ImageStub});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>ink})}});
  return {images,ink,draws,names:()=>images.map(image=>new URL(image.src).pathname.split('/').at(-1)),restore(){
    ['Image','document'].forEach((key,index)=>{
      if(originals[index])Object.defineProperty(globalThis,key,originals[index]!);
      else Reflect.deleteProperty(globalThis,key);
    });
  }};
}

test('readiness subscriptions and prop planning never start image requests',async()=>{
  const env=browser();
  const stops:(()=>void)[]=[];
  try{
    const detailed=await fresh('scene-detailed-exteriors');
    const scene=await fresh('scene-art');
    const room=await fresh('illustrated-room');
    const props=await fresh('scene-new-props');
    stops.push(detailed.whenDetailedExteriorsReady(()=>{}),scene.whenSceneArtReady(()=>{}),room.whenIllustratedRoomReady(()=>{}),props.whenNewScenePropsReady(()=>{}));
    props.planNewSceneProps('greenhouse',1440,1100,80,[]);
    assert.deepEqual(env.names(),[]);
  }finally{for(const stop of stops)stop();env.restore();}
});

test('detailed art loads only painted atlases and keeps subscribers for later choices',async()=>{
  const env=browser();
  const stops:(()=>void)[]=[];
  try{
    const art=await fresh('scene-detailed-exteriors');
    let paints=0,cancelled=0;
    stops.push(art.whenDetailedExteriorsReady(()=>{paints++;}));
    const stopCancelled=art.whenDetailedExteriorsReady(()=>{cancelled++;});stops.push(stopCancelled);
    assert.equal(art.paintDetailedJoinedObstacle(env.ink,'cold-frame'),false);
    await Promise.resolve();
    assert.deepEqual(env.names(),['scene-detailed-obstacles-v1.png']);
    art.paintDetailedJoinedObstacle(env.ink,'cold-frame');
    assert.equal(env.images.length,1);
    stopCancelled();env.images[0].load();
    assert.equal(paints,1);assert.equal(cancelled,0);
    assert.equal(art.paintDetailedJoinedObstacle(env.ink,'cold-frame'),true);
    assert.ok(env.draws.length>0);
    assert.equal(env.images.length,1);

    // A later frame can request a different atlas after the first has finished.
    art.paintDetailedWorkstation(env.ink,'garden-bench',170,100);
    await Promise.resolve();
    env.images[1].fail();
    assert.equal(paints,1);
    art.paintDetailedWorkstation(env.ink,'garden-bench',170,100);
    assert.equal(env.images.length,2,'a failed atlas keeps its cached fallback instead of retrying every frame');
    assert.equal(art.hasRefinedMaterials(),false);
    await Promise.resolve();
    env.images[2].load();
    assert.equal(paints,2,'a different atlas failure does not remove the active subscriber');
    assert.equal(art.hasRefinedMaterials(),true);
    assert.deepEqual(env.names(),['scene-detailed-obstacles-v1.png','scene-detailed-workstations-v1.png','scene-refined-materials-v1.png']);

    art.paintDetailedExterior(env.ink,'planted-bed',200,100);
    await Promise.resolve();
    stops[0]();env.images[3].load();
    assert.equal(paints,2,'an unmounted backdrop must not repaint when a pending image completes');
  }finally{for(const stop of stops)stop();env.restore();}
});

test('scene painting loads the floor first and the illustrated room only for finale',async()=>{
  const env=browser();let stop=()=>{};
  try{
    const art=await fresh('scene-art');
    let paints=0;stop=art.whenSceneArtReady(()=>{paints++;});
    art.paintSceneTile(env.ink,'greenhouse',0,0,80);
    await Promise.resolve();
    assert.deepEqual(env.names(),['floor-material-atlas.png']);
    env.images[0].load();assert.equal(paints,1);
    art.paintSceneTile(env.ink,'greenhouse',0,0,80);
    assert.equal(env.images.length,1);assert.ok(env.draws.length>0);
    art.paintSceneTile(env.ink,'finale',0,0,80);
    await Promise.resolve();
    assert.deepEqual(env.names(),['floor-material-atlas.png','finale-room-scene-v1.png']);
    env.images[1].load();assert.equal(paints,2,'the floor load must not discard the room subscription');
  }finally{stop();env.restore();}
});

const singleAtlases=[
  {module:'scene-art',subscribe:'whenSceneArtReady',name:'floor-material-atlas.png',paint:(art:any,ctx:CanvasRenderingContext2D)=>art.paintSceneTile(ctx,'prologue',0,0,100)},
  {module:'illustrated-room',subscribe:'whenIllustratedRoomReady',name:'finale-room-scene-v1.png',paint:(art:any,ctx:CanvasRenderingContext2D)=>art.paintIllustratedRoom(ctx,1000,700,{x:100,y:100,width:700,height:400})},
  {module:'scene-new-props',subscribe:'whenNewScenePropsReady',name:'scene-new-props-atlas.png',paint:(art:any,ctx:CanvasRenderingContext2D)=>art.paintNewSceneProp(ctx,{kind:'wheelbarrow',x:100,y:100,width:120,height:80,worldWidth:140})},
];

for(const entry of singleAtlases){
  test(`${entry.module}: painting before subscription still repaints after load and reuses the image`,async()=>{
    const env=browser();const stops:(()=>void)[]=[];
    try{
      const art=await fresh(entry.module);let paints=0,cancelled=0;
      // L00 paints before subscribing; Backdrop uses the opposite order above.
      entry.paint(art,env.ink);
      stops.push(art[entry.subscribe](()=>{paints++;}));
      const cancel=art[entry.subscribe](()=>{cancelled++;});stops.push(cancel);cancel();
      await Promise.resolve();
      assert.deepEqual(env.names(),[entry.name]);
      env.images[0].load();assert.equal(paints,1);assert.equal(cancelled,0);
      entry.paint(art,env.ink);entry.paint(art,env.ink);
      assert.equal(env.images.length,1);assert.ok(env.draws.length>0);
      stops.push(art[entry.subscribe](()=>{paints++;}));
      assert.equal(paints,1,'subscribing after load does not trigger redundant paints or requests');
      assert.equal(env.images.length,1);
    }finally{for(const stop of stops)stop();env.restore();}
  });

  test(`${entry.module}: image failure leaves the fallback and does not notify cancelled subscribers`,async()=>{
    const env=browser();const stops:(()=>void)[]=[];
    try{
      const art=await fresh(entry.module);let paints=0;
      stops.push(art[entry.subscribe](()=>{paints++;}));
      entry.paint(art,env.ink);await Promise.resolve();env.images[0].fail();
      assert.equal(paints,0);
      entry.paint(art,env.ink);assert.equal(env.images.length,1);
      // A spurious late load must not revive the failed request's listeners.
      env.images[0].load();assert.equal(paints,0);
    }finally{for(const stop of stops)stop();env.restore();}
  });
}


test('visible battle artwork starts and repaints while two old-scene downloads remain active',async()=>{
  const env=browser();const stops:(()=>void)[]=[];
  const blockers=[new Image(),new Image()];
  const blocked=blockers.map((image,index)=>queueImage(image,`https://old-scene.invalid/warm-${index}.png`));
  try{
    await Promise.resolve();
    assert.equal(env.images.length,2);
    assert.ok(env.images.every(image=>image.src&&!image.complete),'both shared-queue slots are occupied');
    const scene=await fresh('scene-art');
    const detailed=await fresh('scene-detailed-exteriors');
    const props=await fresh('scene-new-props');
    const room=await fresh('illustrated-room');
    const repaints={floor:0,exterior:0,props:0,room:0};
    stops.push(scene.whenSceneArtReady(()=>{repaints.floor++;}));
    stops.push(detailed.whenDetailedExteriorsReady(()=>{repaints.exterior++;}));
    stops.push(props.whenNewScenePropsReady(()=>{repaints.props++;}));
    stops.push(room.whenIllustratedRoomReady(()=>{repaints.room++;}));
    const paint=()=>{
      scene.paintSceneTile(env.ink,'alley',0,0,80);
      detailed.paintDetailedExterior(env.ink,'narrow-home',172,244);
      props.paintNewSceneProp(env.ink,{kind:'bicycle',x:100,y:100,width:120,height:80,worldWidth:140});
      room.paintIllustratedRoom(env.ink,1000,700,{x:100,y:100,width:700,height:400});
    };
    paint();await Promise.resolve();
    const visible=env.images.slice(2);
    assert.equal(visible.length,4);
    assert.ok(visible.every(image=>image.src),
      'all four battle loaders must start even when old-scene requests never finish');
    assert.deepEqual(visible.map(image=>new URL(image.src).pathname.split('/').at(-1)),[
      'floor-material-atlas.png','scene-detailed-residences-garden-v1.png',
      'scene-new-props-atlas.png','finale-room-scene-v1.png',
    ]);
    assert.ok(visible.every(image=>image.fetchPriority==='high'));
    assert.ok(env.images.slice(0,2).every(image=>!image.complete),'old-scene transfers have not released either slot');
    for(const image of visible)image.load();
    assert.deepEqual(repaints,{floor:1,exterior:1,props:1,room:1},'completion requests a real scenery repaint');
    const draws=env.draws.length;
    paint();
    assert.ok(env.draws.length>draws,'ready image data replaces the fallback paint');
    assert.equal(env.images.length,6,'repainting reuses the existing battle images');
    assert.ok(env.images.slice(0,2).every(image=>!image.complete));
  }finally{
    for(const stop of stops)stop();
    // Drain even when the regression assertion fails against the old loaders.
    for(let step=0;step<10;step++){
      await Promise.resolve();
      const active=env.images.filter(image=>image.src&&!image.complete);
      if(!active.length)break;
      for(const image of active)image.load();
    }
    await Promise.allSettled(blocked);
    env.restore();
  }
});
