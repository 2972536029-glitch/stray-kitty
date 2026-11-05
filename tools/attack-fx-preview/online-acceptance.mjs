// Production-only visual regression check, isolated anonymous QA session.
// No route interception, resource substitution, disabled cache, or TLS bypass.
import assert from 'node:assert/strict';
import {verifyOnlineAttack} from './online-gameplay.mjs';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

assert.equal(process.env.KITTY_ONLINE_ATTACK_FX_ALLOW_NEW_SESSION,'1','Explicitly enable one new online QA session');
const work=path.resolve(process.env.KITTY_ACCEPTANCE_WORK_DIR??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')),origin=process.env.KITTY_ONLINE_ORIGIN??'https://starry-kitty.duckdns.org';
assert.equal(new URL(origin).origin,origin,'Origin must omit a trailing slash');
const releaseCommit=process.env.KITTY_EXPECTED_RELEASE_COMMIT;
assert.match(releaseCommit??'',/^[0-9a-f]{40}$/);
const snapshotName=process.env.KITTY_MAP_ART_CLUSTER_SNAPSHOT??'attack-fx-cluster-after-deploy.json';
assert.equal(path.basename(snapshotName),snapshotName);
const clusterBytes=await readFile(path.join(work,snapshotName));
const cluster=JSON.parse(clusterBytes),target=cluster.restorationTarget;
assert.equal(target.commit,releaseCommit);
assert.equal(cluster.deployments.length,3);
assert(cluster.deployments.every(d=>d.commit===releaseCommit&&d.podTemplateCommit===releaseCommit&&d.status.readyReplicas===1));
assert(cluster.pods.every(p=>p.commit===releaseCommit&&p.containers.every(c=>c.ready)));
assert(cluster.frontendAssets?.indexSHA256&&cluster.frontendAssets.assets.length>0,'Cluster snapshot must include deployed frontend hashes');
const require=createRequire(import.meta.url);
const {chromium,expect}=require('@playwright/test');
const output=path.join(work,'../outputs',`attack-fx-online-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await mkdir(output,{recursive:true});
const artTimeout=Number(process.env.KITTY_ONLINE_MAP_ART_TIMEOUT_MS??600000);
assert(Number.isFinite(artTimeout)&&artTimeout>0&&artTimeout<=1200000);
const began=Date.now(),rows=[],pageErrors=[],badResponses=[],failedRequests=[],network=[],commands=[],unexpectedRequests=[];
const pending=new Map(),observedAssets=new Map(),assetChecks=[],imageTransfers=new Map();
let browser,context,page,session,original,qaAttempted=false,restored=false,restoreNeeded=false,telemetryGuardVerified=false;
let failure=null,restoreError=null,assetFailure=null,closing=false,navigating=false,phase='startup',sessionsCreated=0,lastProgress=0;

const isBattleArt=url=>/(?:scene-|floor-material-atlas|finale-room-scene)/.test(url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function sanitize(value){
  let result=value instanceof Error?value.message:String(value);
  if(session?.token)result=result.split(session.token).join('[REDACTED]');
  return result.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [REDACTED]');
}
async function own(resource='state'){
  assert(session?.token,'New anonymous session unavailable');
  return page.evaluate(async({resource,token})=>{
    const live=JSON.parse(localStorage.getItem('stray-kitty.session.v1')??'null');
    if(live?.token!==token)throw Error('Isolated session identity changed');
    const response=await fetch('/api/v1/'+resource,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(resource+' HTTP '+response.status);return response.json();
  },{resource,token:session.token});
}
async function restoreOwn(){
  const current=await own();
  restoreNeeded=!!current.qaCheckpointId;
  if(restoreNeeded){
    const value=await page.evaluate(async({token,revision})=>{
      const response=await fetch('/api/v1/commands',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},
        body:JSON.stringify({expectedRevision:revision,command:{type:'QA_RESTORE'}}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('QA_RESTORE HTTP '+response.status);return (await response.json()).state;
    },{token:session.token,revision:current.revision});
    assert.deepEqual({...value,revision:original.revision},original);
    assert.deepEqual(await own(),value);
  }else assert.deepEqual({...current,revision:original.revision},original);
  restored=true;
}
async function dismissTutorial(){const button=page.getByRole('button',{name:'知道了',exact:true});if(await button.isVisible())await button.click();}
async function topButton(name){
  await dismissTutorial();const bar=page.locator('.topbar');
  if((await bar.getAttribute('class')??'').includes('topbar-collapsed')){
    await page.locator('.topbar-sensor').hover();await expect(bar).not.toHaveClass(/topbar-collapsed/);
  }
  const button=page.getByRole('button',{name,exact:true});await button.hover();return button;
}
async function loadQA(id,manifest){
  const point=manifest.checkpoints.find(p=>p.id===id);assert(point,'Missing live QA fixture '+id);
  await (await topButton('验收工具')).click();const panel=page.getByRole('dialog',{name:'流程验收',exact:true});
  await expect(panel).toBeVisible();await panel.getByTestId('qa-chapter-'+point.chapterId).click();
  if(!original)original=await own();qaAttempted=true;
  await panel.getByTestId('qa-load-'+id).click();await expect(panel).not.toBeVisible({timeout:15000});
  const loaded=await own();assert.equal(loaded.qaCheckpointId,id);return loaded;
}
async function probe(){return page.evaluate(()=>{
  const p=window.__mapArtProbe;
  return {images:p.images.map(e=>({source:e.image.currentSrc||e.image.src||'',createdPhase:e.createdPhase,complete:e.image.complete,
    naturalWidth:e.image.naturalWidth,naturalHeight:e.image.naturalHeight,loaded:e.loaded,decoded:e.decoded,failed:e.failed})),draws:[...p.draws.values()]};
});}
async function progress(observation){
  if(Date.now()-lastProgress<15000)return;lastProgress=Date.now();
  const value={phase,elapsedMs:Date.now()-began,observation,transfers:[...imageTransfers.values()].filter(r=>!r.finished),
    pending:[...pending.values()].map(r=>({path:r.path,type:r.type,elapsedMs:Date.now()-r.started}))};
  await writeFile(path.join(output,'progress.json'),JSON.stringify(value,null,2));console.log(JSON.stringify(value));
}
async function waitForArt(required){
  const started=Date.now();
  for(;;){
    const p=await probe(),owner=phase.replace(/-artwork$/,'-battle');
    const drawn=p.draws.filter(d=>d.phase===phase&&d.ownerBattle===owner&&d.connected&&d.visible&&d.inBounds);
    const used=new Set(drawn.map(d=>d.source));
    const current=p.images.filter(i=>isBattleArt(i.source)&&(i.createdPhase===phase||used.has(new URL(i.source).pathname)));
    const ready=i=>i.loaded&&i.decoded&&i.complete&&i.naturalWidth>0&&!i.failed;
    const missing=required.filter(name=>!current.some(i=>i.source.includes(name)&&ready(i))||!drawn.some(d=>d.source.includes(name)));
    const pendingCurrent=current.filter(i=>!ready(i));
    assert.deepEqual(current.filter(i=>i.failed),[],'Current chapter artwork failed');
    assert.deepEqual(pageErrors,[],'Browser runtime error');
    assert.deepEqual(badResponses.filter(r=>r.path.startsWith('/api/')),[],'API HTTP error');
    assert.deepEqual(failedRequests.filter(r=>r.path.startsWith('/api/')),[],'API request failed');
    if(missing.length===0&&current.length>0&&pendingCurrent.length===0){
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      return {elapsedMs:Date.now()-started,required,currentImages:current,visibleDraws:drawn};
    }
    await progress({chapterWaitMs:Date.now()-started,missing,pendingCurrent});
    assert(Date.now()-started<artTimeout,'Current chapter artwork deadline exceeded: '+JSON.stringify({missing,pendingCurrent}));
    await page.waitForTimeout(250);
  }
}

try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  context=await browser.newContext({viewport:{width:1440,height:1100},ignoreHTTPSErrors:false});page=await context.newPage();
  page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(90000);
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
  cdp.on('Network.responseReceived',event=>{const url=new URL(event.response.url);if(url.origin!==origin)return;
    if(event.type==='Image')imageTransfers.set(event.requestId,{path:url.pathname,receivedBytes:0,finished:false});
  });
  cdp.on('Network.dataReceived',event=>{const transfer=imageTransfers.get(event.requestId);if(transfer)transfer.receivedBytes+=event.dataLength;});
  cdp.on('Network.loadingFinished',event=>{const transfer=imageTransfers.get(event.requestId);if(transfer)transfer.finished=true;});
  page.on('pageerror',error=>pageErrors.push(sanitize(error)));
  page.on('request',request=>{
    const url=new URL(request.url());if(url.protocol.startsWith('http')&&url.origin!==origin)unexpectedRequests.push(url.origin+url.pathname);
    if(url.origin!==origin)return;
    pending.set(request,{path:url.pathname,type:request.resourceType(),started:Date.now(),phase});
    if(url.pathname==='/api/v1/sessions'&&request.method()==='POST')sessionsCreated++;
    if(url.pathname==='/api/v1/commands'&&request.method()==='POST')commands.push({phase,type:request.postDataJSON()?.command?.type});
  });
  page.on('requestfinished',request=>{
    const record=pending.get(request);if(record)network.push({...record,durationMs:Date.now()-record.started});pending.delete(request);
  });
  page.on('requestfailed',request=>{
    const url=new URL(request.url());if(url.origin===origin)failedRequests.push({path:url.pathname,type:request.resourceType(),error:request.failure()?.errorText,phase,duringNavigation:navigating,duringClose:closing});pending.delete(request);
  });
  page.on('response',response=>{
    const url=new URL(response.url());if(url.origin!==origin)return;
    if(response.status()>=400)badResponses.push({path:url.pathname,status:response.status(),phase});
    const expected=cluster.frontendAssets.assets.find(a=>a.path===url.pathname);
    if(expected)assetChecks.push(response.body().then(body=>{const actual=hash(body);observedAssets.set(url.pathname,actual);assert.equal(actual,expected.sha256,'Browser frontend asset differs from inspected Pod');}).catch(error=>{assetFailure=sanitize(error);}));
  });
  await page.addInitScript(()=>{
    // This isolated QA browser must not send RUM/replay data to third parties.
    // Leave production files, game requests, artwork delivery and TLS untouched.
    Object.defineProperty(window,'KITTY_RUM',{configurable:false,get:()=>undefined,set:()=>{}});
    const p={images:[],draws:new Map(),phase:'startup'};Object.defineProperty(window,'__mapArtProbe',{value:p});
    const NativeImage=window.Image,canvasSources=new WeakMap(),canvasIds=new WeakMap();let nextCanvas=0;
    window.Image=new Proxy(NativeImage,{construct(target,args,newTarget){
      const image=Reflect.construct(target,args,newTarget),entry={image,createdPhase:p.phase,loaded:false,decoded:false,failed:false};p.images.push(entry);
      image.addEventListener('load',()=>{entry.loaded=true;void image.decode().then(()=>{entry.decoded=true;},()=>{entry.failed=true;});},{capture:true});
      image.addEventListener('error',()=>{entry.failed=true;},{capture:true});return image;
    }});
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args){
      const result=draw.apply(this,args),source=args[0],sources=new Set();
      if(source instanceof HTMLImageElement&&source.complete&&source.naturalWidth>0)sources.add(new URL(source.currentSrc||source.src,location.href).pathname);
      else if(source instanceof HTMLCanvasElement)for(const url of canvasSources.get(source)??[])sources.add(url);
      const canvas=this.canvas,connected=canvas.isConnected,rect=connected?canvas.getBoundingClientRect():null,style=connected?getComputedStyle(canvas):null;
      const visible=!!(connected&&rect.width>0&&rect.height>0&&rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0);
      const dx=args.length===9?args[5]:args[1],dy=args.length===9?args[6]:args[2];
      const dw=args.length===9?args[7]:args.length===5?args[3]:(source.naturalWidth??source.width),dh=args.length===9?args[8]:args.length===5?args[4]:(source.naturalHeight??source.height);
      const transform=this.getTransform(),corners=[[dx,dy],[dx+dw,dy],[dx,dy+dh],[dx+dw,dy+dh]].map(([x,y])=>transform.transformPoint({x,y}));
      const inBounds=dw>0&&dh>0&&Math.max(...corners.map(pt=>pt.x))>0&&Math.max(...corners.map(pt=>pt.y))>0&&Math.min(...corners.map(pt=>pt.x))<canvas.width&&Math.min(...corners.map(pt=>pt.y))<canvas.height;
      if(!connected&&inBounds){const known=canvasSources.get(canvas)??new Set();for(const url of sources)known.add(url);canvasSources.set(canvas,known);}
      if(!canvasIds.has(canvas))canvasIds.set(canvas,++nextCanvas);
      const target=canvas.className||canvas.getAttribute('aria-label')||(connected?'visible-canvas':'offscreen');
      const ownerBattle=connected?canvas.closest('[data-testid$="-battle"]')?.getAttribute('data-testid')??null:null;
      for(const url of sources){
        const key=p.phase+'|'+url+'|'+canvasIds.get(canvas),previous=p.draws.get(key);
        if(previous?.visible&&previous?.inBounds&&(!visible||!inBounds))continue;
        p.draws.set(key,{source:url,target,canvasId:canvasIds.get(canvas),ownerBattle,connected,visible,inBounds,phase:p.phase});
      }
      return result;
    };
  });
  navigating=true;const response=await page.goto(origin,{waitUntil:'domcontentloaded'});navigating=false;
  assert.equal(response.status(),200);assert.equal(hash(await response.body()),cluster.frontendAssets.indexSHA256,'Public index differs from inspected deployed Pod');
  const start=page.getByRole('button',{name:/^开始冒险(?:\s|$)/});await expect(start).toBeEnabled({timeout:60000});
  session=await page.evaluate(()=>JSON.parse(localStorage.getItem('stray-kitty.session.v1')??'null'));
  assert(session?.token);assert.equal(sessionsCreated,1,'Only one new anonymous session expected');
  assert.equal(await page.evaluate(()=>window.KITTY_RUM),undefined,'RUM disabled only in this isolated QA context');
  telemetryGuardVerified=true;
  const fresh=await own();assert.equal(fresh.revision,0);assert.equal(fresh.storyNodeId,'prologue_1');
  await Promise.all(assetChecks);assert.equal(assetFailure,null,'Frontend asset hash validation failed');
  assert.equal(observedAssets.size,cluster.frontendAssets.assets.length,'All frontend assets must match deployed Pod');
  await start.click();const skip=page.getByRole('button',{name:'跳过序章 »',exact:true});if(await skip.isVisible())await skip.click();
  await expect(page.locator('.prologue-overlay')).toHaveCount(0);await dismissTutorial();
  const manifest=await own('qa');assert.equal(manifest.enabled,true,'Use only QA tools already enabled in production');
  const cases=[
    ['alley.battle','chapter',['floor-material-atlas','scene-detailed-residences-garden','scene-detailed-obstacles','scene-chapter-backwalls']],
    ['market.battle','market',['floor-material-atlas','scene-market-banks','scene-chapter-backwalls']],
    ['greenhouse.battle','greenhouse',['floor-material-atlas','scene-detailed-obstacles','scene-chapter-backwalls']],
    ['rescue.battle','tunnel',['floor-material-atlas','scene-tunnel-fixtures','scene-chapter-backwalls']],
    ['finale.battle','finale',['finale-room-scene','scene-warehouse-fixtures']],
  ];
  for(const [checkpoint,prefix,required] of cases){
    phase=prefix+'-artwork';await page.evaluate(name=>{window.__mapArtProbe.phase=name;},phase);
    const prepared=await loadQA(checkpoint,manifest),board=page.getByTestId(prefix+'-battle');
    await expect(board).toHaveAttribute('data-phase','ready');await expect(board).toHaveAttribute('data-attempt-id',prepared.activeBattle.id);
    await expect(board).toHaveAttribute('data-elapsed','0.00');
    const evidence=await waitForArt(required);
    await page.getByTestId(prefix+'-cat-guard').click({timeout:1500});await expect(page.getByTestId(prefix+'-cat-menu')).toHaveAttribute('data-cat-id','guard');
    await page.getByTestId(prefix+'-close-cat-menu').click({timeout:1500});
    await expect(board).toHaveAttribute('data-elapsed','0.00');
    const screenshot=prefix+'-textures-ready.png';await page.screenshot({path:path.join(output,screenshot)});
    const gameplay=await verifyOnlineAttack(page,prefix,output);
    rows.push({checkpoint,prefix,passed:true,attemptId:prepared.activeBattle.id,screenshot,...evidence,...gameplay});
    console.log(JSON.stringify({chapter:prefix,passed:true,artworkWaitMs:evidence.elapsedMs,currentImages:evidence.currentImages.length,visibleSources:[...new Set(evidence.visibleDraws.map(d=>d.source))]}));
  }
  assert.equal(rows.length,5);assert.deepEqual(pageErrors,[]);assert.deepEqual(badResponses,[]);
  assert.deepEqual(failedRequests.filter(r=>!(r.type==='image'&&r.error==='net::ERR_ABORTED'&&(r.duringNavigation||r.duringClose))),[]);
  assert.deepEqual(unexpectedRequests,[]);assert.equal(sessionsCreated,1);
  assert.equal(await page.evaluate(()=>window.KITTY_RUM),undefined,'Isolated QA telemetry guard remains active');
}catch(error){failure=sanitize(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{
  if(page&&session&&original&&qaAttempted){try{phase='restore';await restoreOwn();}catch(error){restoreError=sanitize(error);}}
  const finalProbe=page?await probe().catch(()=>null):null;
  if(context){closing=true;await context.close().catch(error=>{restoreError??=sanitize(error);});}
  if(browser)await browser.close();
  await Promise.all(assetChecks).catch(error=>{failure??=sanitize(error);});
  failure??=assetFailure;
  const lateAPI=failedRequests.filter(r=>r.path.startsWith('/api/'));
  if(lateAPI.length)failure??='API failures recorded';
  if(badResponses.some(r=>r.path.startsWith('/api/')))failure??='API HTTP errors recorded';
  if(unexpectedRequests.length)failure??='Unexpected external requests recorded';
  const result={passed:!failure&&!restoreError&&restored&&telemetryGuardVerified&&rows.length===5,releaseCommit,origin,startedAt:new Date(began).toISOString(),completedAt:new Date().toISOString(),
    clusterEvidence:{file:snapshotName,sha256:hash(clusterBytes),pod:target.pod,podUID:target.podUID},
    frontend:{indexSHA256:cluster.frontendAssets.indexSHA256,assets:[...observedAssets].map(([assetPath,sha256])=>({path:assetPath,sha256}))},
    certificateValidationBypassed:false,isolatedNonPersistentContext:true,telemetryDisabledForOnlineProbe:true,telemetryGuardVerified,sessionTokensSaved:false,sessionsCreated,qaAttempted,restoreNeeded,restored,
    artworkObservationTimeoutMs:artTimeout,apiTimeoutMs:15000,catClickTimeoutMs:1500,combatDeadlineMs:30000,scope:'Online five-chapter real legal controls: cat drag/range/cancel/drop and short cat/boss basic combat with actual frame/video evidence. Not full chapter clearance; prologue and all individual cat styles retain local coverage.',rows,commands,pageErrors,badResponses,failedRequests,unexpectedRequests,network,finalProbe,error:failure,restoreError};
  await writeFile(path.join(output,'online-attack-fx.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({output,passed:result.passed,chapters:rows.length,restored,error:failure,restoreError}));
  if(!result.passed)process.exitCode=1;
}
