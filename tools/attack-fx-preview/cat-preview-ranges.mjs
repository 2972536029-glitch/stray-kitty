import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {repo} from './server.mjs';
const output=path.resolve(process.argv[2]??path.join(repo,'test-results/cat-preview-ranges'));await mkdir(output,{recursive:true});
const server=await createServer({root:repo,configFile:false,publicDir:path.join(repo,'web/public'),server:{host:'127.0.0.1',port:8186,strictPort:true,hmr:false,watch:{ignored:['**/web/dist/**']}}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)}),page=await browser.newPage({viewport:{width:1440,height:1080}});const errors=[],requests=[],records=[];let failure;
page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>requests.push(request.url()));
try{
  await page.goto('http://127.0.0.1:8186/tools/attack-fx-preview/');await page.waitForFunction(()=>!!window.attackFxPreview);
  for(const chapter of ['alley','market','greenhouse','tunnel','finale']){
    const actors=await page.evaluate(chapter=>{window.attackFxPreview.selectChapter(chapter);return window.attackFxPreview.diagnostics().availableActors.filter(id=>id!=='boss');},chapter);
    await page.waitForLoadState('networkidle');
    for(const id of actors){const data=await page.evaluate(id=>{window.attackFxPreview.selectActor(id);window.attackFxPreview.freezeAt(120);return window.attackFxPreview.diagnostics();},id);assert.equal(data.mutated,false);if(data.targetInAttackRange!==null)assert.equal(data.targetInAttackRange,true,`${chapter}/${id} target outside attack geometry`);records.push({chapter,id,target:data.target,source:data.source,targetInAttackRange:data.targetInAttackRange});if(chapter==='tunnel'&&['guard','bruiser'].includes(id))await page.screenshot({path:path.join(output,`tunnel-${id}-actual-range.png`)});}
  }
  assert.equal(errors.length,0);assert.equal(requests.length,0);console.log(`PASS ${records.filter(row=>row.targetInAttackRange===true).length} main cat actual attack geometries, ${records.filter(row=>row.targetInAttackRange===null).length} ally visual cases`);
}catch(error){failure=error;console.error(error);}finally{await writeFile(path.join(output,'verification.json'),JSON.stringify({passed:!failure,records,errors,requests,failure:failure?.stack},null,2));await browser.close();await server.close();}if(failure)process.exitCode=1;
