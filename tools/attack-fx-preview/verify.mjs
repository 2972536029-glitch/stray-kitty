import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {startPreview,repo} from './server.mjs';

const output=path.resolve(process.argv[2]??path.join(repo,'test-results/attack-fx-preview'));
await mkdir(output,{recursive:true});
const {server,url}=await startPreview(8185);
const errors=[],requests=[],results=[];
let browser,context,page,failure;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
  context=await browser.newContext({viewport:{width:1440,height:1080}});
  page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>requests.push({url:request.url(),error:request.failure()?.errorText}));
  await page.goto(url);await page.waitForFunction(()=>!!window.attackFxPreview);
  await page.waitForLoadState('networkidle');
  const fingerprint=()=>page.locator('canvas').evaluate(canvas=>{
    const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
    let hash=2166136261;for(let i=0;i<data.length;i++)hash=Math.imul(hash^data[i],16777619);
    return {hash:hash>>>0,width:canvas.width,height:canvas.height};
  });
  for(const chapter of ['alley','market','greenhouse','tunnel','finale']){
    await page.locator(`[data-chapter="${chapter}"]`).click();
    await page.waitForLoadState('networkidle');
    const available=await page.evaluate(()=>window.attackFxPreview.diagnostics().availableActors);
    for(const actor of available){
      await page.locator(`[data-actor="${actor}"]`).click();
      await page.evaluate(()=>window.attackFxPreview.freezeAt(80));
      const early=await fingerprint();
      await page.evaluate(()=>window.attackFxPreview.freezeAt(230));
      const late=await fingerprint();
      assert.notEqual(early.hash,late.hash,`${chapter}/${actor}: drawing must animate`);
      const stable=await fingerprint();await page.waitForTimeout(70);
      assert.equal((await fingerprint()).hash,stable.hash,`${chapter}/${actor}: paused drawing must stay stable`);
      const diagnostic=await page.evaluate(()=>window.attackFxPreview.diagnostics());
      assert.equal(diagnostic.mutated,false,`${chapter}/${actor}: painter must not mutate fixture state`);
      assert(diagnostic.assets.length>0,`${chapter}/${actor}: actual map assets must have been drawn`);
      results.push({chapter,actor,early,late,stateUnchanged:!diagnostic.mutated,assetsDrawn:diagnostic.assets.length});
      if(actor==='boss'||chapter==='finale'&&actor==='taotao'||chapter==='alley'&&actor==='tuanzi'){
        await page.evaluate(()=>window.attackFxPreview.freezeAt(120));
        await page.screenshot({path:path.join(output,`${chapter}-${actor}.png`)});
      }
    }
  }
  await page.locator('[data-chapter="alley"]').click();
  await page.locator('[data-actor="caster"]').click();
  await page.getByRole('button',{name:'重新播放',exact:true}).click();
  await page.waitForTimeout(500);await page.getByRole('button',{name:'暂停',exact:true}).click();
  const paused=await page.evaluate(()=>window.attackFxPreview.diagnostics().elapsed);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.attackFxPreview.diagnostics().elapsed),paused);
  await page.locator('#progress').fill('175');
  assert.equal(await page.locator('#time').textContent(),'175 ms');
  await page.setViewportSize({width:640,height:900});
  await page.screenshot({path:path.join(output,'narrow-preview.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'narrow layout must not overflow');
  await page.setViewportSize({width:1440,height:1080});
  // A short uninterrupted sequence makes the animated result reviewable too.
  // Use the browser's own recorder so this local viewer needs no ffmpeg install.
  await page.evaluate(()=>{
    const recordingCanvas=document.createElement('canvas');recordingCanvas.width=1280;recordingCanvas.height=800;
    const recordingContext=recordingCanvas.getContext('2d'),chunks=[];
    const recorder=new MediaRecorder(recordingCanvas.captureStream(30),{mimeType:'video/webm;codecs=vp9'});
    let frameId;
    const paint=()=>{
      recordingContext.fillStyle='#14212b';recordingContext.fillRect(0,0,1280,800);
      recordingContext.fillStyle='#f0d69f';recordingContext.font='bold 30px Microsoft YaHei';
      recordingContext.fillText(document.querySelector('#title').textContent,40,53);
      recordingContext.fillStyle='#b2c5c6';recordingContext.font='18px Microsoft YaHei';
      recordingContext.fillText(document.querySelector('#description').textContent,40,86);
      recordingContext.fillText(document.querySelector('#scene').textContent,1000,53);
      const source=document.querySelector('#board'),scale=Math.min(1200/source.width,650/source.height);
      recordingContext.imageSmoothingEnabled=false;
      recordingContext.drawImage(source,(1280-source.width*scale)/2,120+(650-source.height*scale)/2,source.width*scale,source.height*scale);
      frameId=requestAnimationFrame(paint);
    };paint();
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    window.attackPreviewRecording={stop:()=>new Promise(resolve=>{recorder.onstop=async()=>{cancelAnimationFrame(frameId);resolve([...new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer())]);};recorder.stop();})};
    recorder.start();
  });
  for(const [chapter,actor] of [['alley','tuanzi'],['alley','caster'],['market','boss'],['greenhouse','boss'],['tunnel','boss'],['finale','boss'],['finale','taotao']]){
    await page.evaluate(([chapter,actor])=>{window.attackFxPreview.selectChapter(chapter);window.attackFxPreview.selectActor(actor);window.attackFxPreview.play();},[chapter,actor]);
    await page.waitForTimeout(1500);
  }
  const video=await page.evaluate(()=>window.attackPreviewRecording.stop());
  await writeFile(path.join(output,'attack-fx-preview.webm'),Buffer.from(video));
  assert.equal(errors.length,0,'page errors');assert.equal(requests.length,0,'failed requests');
}catch(error){failure=error;console.error(error);}
finally{
  const diagnostics=page?await page.evaluate(()=>window.attackFxPreview?.diagnostics()).catch(()=>null):null;
  if(context)await context.close();
  if(browser)await browser.close();await server.close();
  await writeFile(path.join(output,'verification.json'),JSON.stringify({passed:!failure,scope:'Five real production painters with deterministic visual fixtures; not a complete combat run.',results,errors,requests,diagnostics,failure:failure?.stack},null,2));
}
if(failure)process.exitCode=1;else console.log(`PASS: ${results.length} chapter/actor variants; evidence: ${output}`);
