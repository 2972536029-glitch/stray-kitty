import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {repo} from './server.mjs';

const output=path.resolve(process.argv[2]??path.join(repo,'test-results/greenhouse-arm'));
const mode=process.argv[3]??'verify';
const focused=mode==='greenhouse-only'||mode==='greenhouse-whip';
const captureTimes=mode==='greenhouse-whip'?[0,70,120,168,240,350]:[70,150,240,390];
await mkdir(output,{recursive:true});
const server=await createServer({root:repo,configFile:false,publicDir:path.join(repo,'web/public'),server:{host:'127.0.0.1',port:8186,strictPort:true,hmr:false,watch:{ignored:['**/web/dist/**','**/test-results/**']}}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
const context=await browser.newContext({viewport:{width:1440,height:1080}}),page=await context.newPage();
const errors=[],requests=[],poses=[],records=[];let failure,retained,retainedFailure;
page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>requests.push(request.url()));
try{
  await page.goto('http://127.0.0.1:8186/tools/attack-fx-preview/');await page.waitForFunction(()=>!!window.attackFxPreview);
  if(!focused){
  const otherBosses=[];
  for(const chapter of ['alley','market','tunnel','finale']){
    await page.evaluate(chapter=>{window.attackFxPreview.selectChapter(chapter);window.attackFxPreview.selectActor('boss');window.attackFxPreview.freezeAt(150);},chapter);await page.waitForLoadState('networkidle');
    for(const distance of ['near','edge']){
      await page.evaluate(distance=>{window.attackFxPreview.selectTarget(distance);window.attackFxPreview.freezeAt(150);},distance);
      const hash=await page.evaluate(async()=>{const canvas=document.querySelector('#board'),bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');});otherBosses.push({chapter,distance,ms:150,hash});
    }
  }
  const cats=await page.evaluate(async()=>{
    const {paintBasicAttack}=await import('/web/src/modules/battle/shared/basicAttackPainter.ts');const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d'),rows=[];
    for(const id of ['caster','guard','tuanzi','diandian','bruiser','controller','momo','taotao'])for(const ms of [80,120,230]){
      ctx.clearRect(0,0,640,360);ctx.save();ctx.globalAlpha=Math.min(1,(.4-ms/1000)*3);paintBasicAttack(ctx,{kind:'attack',from:{id,x:1,y:1},to:{id:'enemy',x:4,y:2},remaining:.4-ms/1000},{cellSize:80,theme:'alley'});ctx.restore();const bytes=ctx.getImageData(0,0,640,360).data,hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');rows.push({id,ms,hash});
    }return rows;
  });retained={otherBosses,cats};
  }
  if(mode==='baseline'){
    assert.equal(errors.length,0);assert.equal(requests.length,0);await writeFile(path.join(output,'baseline.json'),JSON.stringify(retained,null,2));console.log('Saved 8 other-boss full-scene hashes + 24 cat effect hashes');
  }else{
    if(mode==='verify'){
      const baseline=JSON.parse(await readFile(path.join(output,'baseline.json'),'utf8'));try{assert.deepEqual(retained,baseline,'other four bosses and all cat effects must remain pixel-identical');}catch(error){retainedFailure=error;}
    }
    await page.evaluate(()=>{window.attackFxPreview.selectChapter('greenhouse');window.attackFxPreview.selectActor('boss');window.attackFxPreview.freezeAt(70);window.greenhouseArmStrip=[];});await page.waitForLoadState('networkidle');
    const probes=await page.evaluate(async()=>{
      const {createGreenhouseBattle}=await import('/web/src/modules/battle/greenhouse/engine.ts'),{paintGreenhouse,BOARD_WIDTH,BOARD_HEIGHT}=await import('/web/src/modules/battle/greenhouse/painter.ts');
      const canvas=document.createElement('canvas');canvas.width=BOARD_WIDTH;canvas.height=BOARD_HEIGHT;const raw=canvas.getContext('2d'),invalid=[],methods=new Map();
      const ctx=new Proxy(raw,{get(target,key){const member=Reflect.get(target,key,target);if(typeof member!=='function')return member;if(!methods.has(key))methods.set(key,(...args)=>{for(const argument of args)if(typeof argument==='number'&&!Number.isFinite(argument))invalid.push({method:String(key),argument:String(argument)});return Reflect.apply(member,target,args);});return methods.get(key);},set(target,key,value){if(typeof value==='number'&&!Number.isFinite(value))invalid.push({property:String(key),value:String(value)});return Reflect.set(target,key,value,target);}});
      const rows=[];
      for(const [distance,offset] of [['near',1],['edge',3]])for(const [direction,nx,ny] of [['left',-1,0],['right',1,0],['up',0,-1],['down',0,1]]){
        const state=createGreenhouseBattle(),boss=state.boss;state.elapsed=1;state.phase='battle';
        // Artificial directional hit snapshots exercise the drawing math only.
        // The interactive near/edge captures below use actual in-range cats.
        const to={id:'guard',x:nx<0?boss.x-offset:nx>0?boss.x+boss.width-1+offset:boss.x,y:ny<0?boss.y-offset:ny>0?boss.y+boss.height-1+offset:boss.y};
        for(const ms of [0,70,150,240,390]){
          const frame={...state,effects:[{id:1,kind:'boss-attack',from:{...boss},to,remaining:.4-ms/1000}]},before=JSON.stringify(frame);paintGreenhouse(ctx,frame,null,null);
          const bytes=raw.getImageData(boss.x*80+12,boss.y*80+12,boss.width*80-24,boss.height*80-24).data,bodyHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');rows.push({distance,direction,ms,bodyHash,stateUnchanged:before===JSON.stringify(frame),target:to});
        }
      }return {frames:rows,invalid};
    });
    poses.push(probes);
    assert.equal(probes.invalid.length,0,'all greenhouse Canvas numeric arguments must remain finite');
    for(const distance of ['near','edge'])for(const direction of ['left','right','up','down']){
      const samples=probes.frames.filter(row=>row.distance===distance&&row.direction===direction);assert(new Set(samples.map(row=>row.bodyHash)).size>=3,`${distance}/${direction}: body must change across the swing`);assert(samples.every(row=>row.stateUnchanged));
    }
    for(const distance of ['near','edge']){
      await page.locator(`[data-target-mode="${distance}"]`).click();
      const diagnostic=await page.evaluate(()=>window.attackFxPreview.diagnostics());assert.equal(diagnostic.targetMatchesActualCat,true);assert(diagnostic.targetDistance<=diagnostic.bossRange);assert.equal(diagnostic.mutated,false);records.push({distance,target:diagnostic.target,targetDistance:diagnostic.targetDistance,bossRange:diagnostic.bossRange});
      for(const ms of captureTimes){
        await page.evaluate(ms=>window.attackFxPreview.freezeAt(ms),ms);await page.screenshot({path:path.join(output,`greenhouse-${distance}-${ms}ms.png`)});
        await page.evaluate(({distance,ms})=>{
          const info=window.attackFxPreview.diagnostics(),source=document.querySelector('#board'),canvas=document.createElement('canvas');canvas.width=340;canvas.height=240;const ctx=canvas.getContext('2d'),from=info.source,to=info.target;
          const left=Math.max(0,Math.min(from.x*80,(to.x+.5)*80)-60),top=Math.max(0,Math.min(from.y*80,(to.y+.5)*80)-45),right=Math.min(source.width,Math.max((from.x+from.width)*80,(to.x+.5)*80)+45),bottom=Math.min(source.height,Math.max((from.y+from.height)*80,(to.y+.5)*80)+40),w=right-left,h=bottom-top,scale=Math.min(330/w,230/h);ctx.fillStyle='#172630';ctx.fillRect(0,0,340,240);ctx.imageSmoothingEnabled=false;ctx.drawImage(source,left,top,w,h,(340-w*scale)/2,(240-h*scale)/2,w*scale,h*scale);window.greenhouseArmStrip.push({distance,ms,target:info.target.name,canvas});
        },{distance,ms});
      }
      await page.evaluate(()=>{
        const chunks=[],recorder=new MediaRecorder(document.querySelector('#board').captureStream(30),{mimeType:'video/webm;codecs=vp9'});recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};window.greenhouseArmRecorder={stop:()=>new Promise(resolve=>{recorder.onstop=async()=>resolve([...new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer())]);recorder.stop();})};recorder.start();window.attackFxPreview.play();
      });await page.waitForTimeout(3450);const video=await page.evaluate(()=>window.greenhouseArmRecorder.stop());await writeFile(path.join(output,`greenhouse-${distance}.webm`),Buffer.from(video));
    }
    await page.setViewportSize({width:mode==='greenhouse-whip'?2160:1520,height:800});
    await page.evaluate(({columns})=>{
      window.attackFxPreview.pause();const board=document.createElement('section');board.id='greenhouse-arm-strip';Object.assign(board.style,{position:'fixed',inset:'0',zIndex:'9999',background:'#14212b',padding:'28px 40px',fontFamily:'Microsoft YaHei, sans-serif',color:'#e7ece4'});board.innerHTML='<div style="letter-spacing:3px;color:#d8c08b;font-size:12px">STRAY KITTY / GREENHOUSE BOSS</div><h1 style="font-size:28px;margin:10px 0 5px">藤臂带着长鞭，自然甩出去</h1><p style="color:#b2c5c6;margin:0 0 20px;font-size:14px">近距离与射程边缘 · 起手、甩出、回收与收势</p>';
      const grid=document.createElement('div');Object.assign(grid.style,{display:'grid',gridTemplateColumns:`repeat(${columns},1fr)`,gap:'14px'});const stages={0:'起势',70:'蓄弯',120:'甩出',150:'甩出',168:'命中',240:'反弧回收',350:'收势',390:'收势'};
      for(const item of window.greenhouseArmStrip){const card=document.createElement('article');Object.assign(card.style,{background:'#1a2c37',border:'1px solid #40535c',borderRadius:'8px',overflow:'hidden'});const label=document.createElement('div');label.textContent=`${item.distance==='near'?'近距离':'射程边缘'} · ${stages[item.ms]} ${item.ms}ms`;Object.assign(label.style,{padding:'12px 14px 8px',fontSize:'14px',color:'#efcf94'});item.canvas.style.width='100%';item.canvas.style.display='block';item.canvas.style.imageRendering='pixelated';card.append(label,item.canvas);grid.append(card);}board.append(grid);document.body.append(board);
    },{columns:captureTimes.length});await page.locator('#greenhouse-arm-strip').screenshot({path:path.join(output,'greenhouse-arm-motion-strip.png')});
    assert.equal(errors.length,0);assert.equal(requests.length,0);if(retainedFailure)throw retainedFailure;console.log(focused?'PASS: focused greenhouse 40 directional pose frames and near/edge captures':'PASS: greenhouse 40 directional pose frames, near/edge captures, 8 other-boss and 24 cat hashes unchanged');
  }
}catch(error){failure=error;console.error(error);}
finally{if(mode!=='baseline'||failure)await writeFile(path.join(output,mode==='baseline'?'baseline-failure.json':'verification.json'),JSON.stringify({passed:!failure,scope:focused?'Focused greenhouse arm/whip adjustment; other-boss and cat comparisons were not repeated.':'Greenhouse arm only; retained other bosses and cats checked with exact pixel hashes.',retained,poses,records,errors,requests,failure:failure?.stack},null,2));await context.close();await browser.close();await server.close();}
if(failure)process.exitCode=1;
