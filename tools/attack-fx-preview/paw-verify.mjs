import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
if(!process.argv[2])throw new Error('Usage: node paw-verify.mjs <output-directory-with-idle-baseline>');
const output=path.resolve(process.argv[2]);await mkdir(output,{recursive:true});
const previewURL=process.env.KITTY_PAW_PREVIEW_URL??'http://127.0.0.1:8190/tools/attack-fx-preview/';
const baseline=JSON.parse(await readFile(path.join(output,'idle-baseline/baseline.json'),'utf8'));
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const errors=[],failedRequests=[],rows=[];let failure,page;
try{
 page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failedRequests.push({url:r.url(),failure:r.failure()?.errorText}));
 await page.goto(new URL('paw-study.html',previewURL).href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.catPawPreview);await page.waitForLoadState('networkidle');
 const sprites=await page.evaluate(async()=>{
 const sets={chapter:['caster','guard','tuanzi','diandian'],market:['caster','guard','tuanzi','diandian','bruiser','controller'],greenhouse:['caster','guard','tuanzi','momo','bruiser','controller'],tunnel:['caster','guard','tuanzi','diandian','momo','bruiser'],finale:['caster','guard','tuanzi','diandian','momo','bruiser']};
 const names={chapter:'drawChapterCat',market:'drawMarketCat',greenhouse:'drawGreenhouseCat',tunnel:'drawTunnelCat',finale:'drawFinaleCat'};const result=[];
 function hash(data){let n=2166136261;for(const b of data)n=Math.imul(n^b,16777619);return n>>>0;}
 for(const [chapter,roles]of Object.entries(sets)){
  const module=await import('/web/src/modules/battle/'+chapter+'/painter.ts');
  for(const actor of roles){const samples=[];for(const progress of [null,0,.22,.44,.7,1]){
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;const ctx=canvas.getContext('2d');
    const reference=document.createElement('canvas');reference.width=160;reference.height=160;const referenceContext=reference.getContext('2d');
    const hop=progress===null||progress<=0||progress>=1?0:Math.sin(Math.PI*progress),body={x:2*hop,y:-hop};
    if(chapter==='chapter'){
      module[names[chapter]](ctx,actor,16,16,128,false,progress!==null,progress??undefined);
      module[names[chapter]](referenceContext,actor,16+body.x*4,16+body.y*4,128,false,false);
    }else{
      module[names[chapter]](ctx,actor,16,16,128,progress!==null,progress??undefined);
      module[names[chapter]](referenceContext,actor,16+body.x*4,16+body.y*4,128,false);
    }
    const anchors={eye:[11,13,2,2],nose:[16,17,2,1]},anchorChecks={};
    for(const [name,[x,y,w,h]]of Object.entries(anchors)){
      const box=[Math.floor(16+(x+body.x)*4),Math.floor(16+(y+body.y)*4),w*4,h*4];
      anchorChecks[name]={actual:hash(ctx.getImageData(...box).data),expected:hash(referenceContext.getImageData(...box).data)};
    }
    const pawBox=[Math.floor(16+(3+body.x)*4),Math.floor(16+(19+body.y)*4),30*4,8*4];
    samples.push({progress,bodyOffsetNativePixels:body,hash:hash(ctx.getImageData(0,0,160,160).data),limbHash:hash(ctx.getImageData(...pawBox).data),bodyOnlyLimbHash:hash(referenceContext.getImageData(...pawBox).data),staticEyeArea:hash(ctx.getImageData(16+10*4,16+12*4,4*4,5*4).data),anchors:anchorChecks,png:canvas.toDataURL('image/png').split(',')[1]});}
   result.push({chapter,actor,samples});}
 }
 return result;
 });
 await mkdir(path.join(output,'sprites'),{recursive:true});
 for(const row of sprites){for(const s of row.samples){await writeFile(path.join(output,'sprites',`${row.chapter}-${row.actor}-${s.progress===null?'idle':Math.round(s.progress*400)}.png`),Buffer.from(s.png,'base64'));delete s.png;}
  const original=baseline.find(b=>b.chapter===row.chapter&&b.actor===row.actor);assert.equal(row.samples[0].hash,original.hash,`${row.chapter}/${row.actor} idle changed`);
  assert.equal(row.samples[1].hash,original.hash,`${row.chapter}/${row.actor} initial pose changed`);assert.equal(row.samples.at(-1).hash,original.hash,`${row.chapter}/${row.actor} final pose changed`);
  assert.notEqual(row.samples[2].hash,row.samples[3].hash,`${row.chapter}/${row.actor} paw did not animate`);
  assert(row.samples.every(s=>Object.values(s.anchors).every(a=>a.actual===a.expected)),`${row.chapter}/${row.actor} facial anchors did not follow the whole-body motion`);
  for(const sample of row.samples.slice(2,5)){assert.notEqual(sample.staticEyeArea,row.samples[0].staticEyeArea,`${row.chapter}/${row.actor} body stayed still`);assert.notEqual(sample.limbHash,sample.bodyOnlyLimbHash,`${row.chapter}/${row.actor} missing separate paw gesture`);}
  rows.push({chapter:row.chapter,actor:row.actor,idlePreserved:true,startEndPreserved:true,facialAnchorsFollowBody:true,wholeBodyAnimated:true,separatePawGesture:true,samples:row.samples});
 }
 for(const ms of [0,88,176,280,400]){await page.evaluate(ms=>window.catPawPreview.freezeAt(ms),ms);await page.screenshot({path:path.join(output,`paw-gallery-${ms}ms.png`),fullPage:true});}
 await page.evaluate(()=>window.catPawPreview.freezeAt(176));const before=await page.locator('#paw-tuanzi').evaluate(c=>c.toDataURL());await page.waitForTimeout(200);assert.equal(await page.locator('#paw-tuanzi').evaluate(c=>c.toDataURL()),before,'Paused body/paw changed');assert.equal(await page.evaluate(()=>window.catPawPreview.diagnostics().mutated),false);
 // Capture the same live production-painter gallery, without synthesizing animation frames.
 await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=1120;canvas.height=720;const ctx=canvas.getContext('2d'),chunks=[];let frame;
  const draw=()=>{ctx.fillStyle='#172630';ctx.fillRect(0,0,1120,720);ctx.fillStyle='#f0d69f';ctx.font='bold 28px Microsoft YaHei';ctx.fillText('一起出招的小猫咪',28,43);const cards=[...document.querySelectorAll('.paw-grid article')];cards.forEach((card,i)=>{const x=24+(i%4)*276,y=76+Math.floor(i/4)*316;ctx.fillStyle='#21343d';ctx.fillRect(x,y,258,296);ctx.fillStyle='#f0d69f';ctx.font='bold 21px Microsoft YaHei';ctx.fillText(card.querySelector('h2').textContent,x+16,y+31);ctx.imageSmoothingEnabled=false;ctx.drawImage(card.querySelector('canvas'),x+9,y+55,240,216);});frame=requestAnimationFrame(draw);};draw();
  const recorder=new MediaRecorder(canvas.captureStream(30),{mimeType:'video/webm;codecs=vp9'});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};window.pawRecording={stop:()=>new Promise(resolve=>{recorder.onstop=async()=>{cancelAnimationFrame(frame);resolve([...new Uint8Array(await new Blob(chunks).arrayBuffer())]);};recorder.stop()})};recorder.start();window.catPawPreview.play();
 });await page.waitForTimeout(6200);const bytes=await page.evaluate(()=>window.pawRecording.stop());await writeFile(path.join(output,'cat-body-paw-motion.webm'),Buffer.from(bytes));
 await page.goto(previewURL,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.attackFxPreview);
 for(const chapter of ['alley','market','greenhouse','tunnel','finale']){await page.evaluate(c=>window.attackFxPreview.selectChapter(c),chapter);await page.waitForLoadState('networkidle');const actors=await page.evaluate(()=>window.attackFxPreview.diagnostics().availableActors.filter(a=>a!=='boss'));
  for(const actor of actors){await page.evaluate(a=>{window.attackFxPreview.selectActor(a);window.attackFxPreview.freezeAt(176)},actor);const d=await page.evaluate(()=>window.attackFxPreview.diagnostics());assert.equal(d.mutated,false);assert(d.assets.length>0);if(d.targetInAttackRange!==null)assert(d.targetInAttackRange);}
  await page.screenshot({path:path.join(output,`${chapter}-in-battle.png`),fullPage:true});
 }
 assert.equal(errors.length,0);assert.equal(failedRequests.length,0);
}catch(error){failure=error;console.error(error.stack);if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await browser.close();await writeFile(path.join(output,'verification.json'),JSON.stringify({passed:!failure,rows,errors,failedRequests,failure:failure?.stack,scope:'Local production painter fixtures, 28 chapter/cat sprite variants with whole-body motion and separate paw motion, plus eight-role gallery and five chapter effect views; not production acceptance or complete battle clears.'},null,2));}
if(failure)process.exitCode=1;else console.log('PASS '+rows.length+' sprite variants, eight-role gallery, five chapter painters.');
