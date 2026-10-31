import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium, type Browser, type Page} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

// Explicit SDK-only test: no production App, game pages, preview or model network.
let browser: Browser, bundle: string;
test.before(async()=>{
  const result=await build({entryPoints:[path.resolve('tests/advisor-sdk/provider.fixture.tsx')],bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
  bundle=result.outputFiles[0].text;
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'&&fs.existsSync(edge)?edge:undefined);
  browser=await chromium.launch({headless:true,executablePath});
});
test.after(async()=>{await browser?.close();});
async function fixture(){
  const page=await browser.newPage();
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.goto('http://advisor-sdk.test/');
  await page.addScriptTag({content:bundle});
  await page.evaluate('sdk.init()');
  return page;
}
async function tick(page:Page){await page.evaluate(()=>new Promise<void>(resolve=>setTimeout(resolve,0)));}

test('phase changes preserve recent history, cancel stale requests and never auto-submit',async()=>{
  const page=await fixture();
  try{
    assert.equal(await page.evaluate('sdk.ask("第一问")'),true);await tick(page);
    await page.evaluate('sdk.answer(0,"第一答")');await tick(page);
    await page.evaluate('sdk.ask("未完成的旧场景问题")');await tick(page);
    await page.evaluate('sdk.update({state:{...sdk.state(),phase:"home",mapId:"greenhouse",revision:2}})');
    assert.equal(await page.evaluate('sdk.requests()[1].aborted'),true);
    await page.evaluate('sdk.answer(1,"过期回答")');await tick(page);
    assert.equal(await page.evaluate('sdk.snapshot().messages.length'),1);
    assert.equal(await page.evaluate('sdk.snapshot().pendingQuestion'),null);
    assert.equal(await page.evaluate('sdk.requests().length'),2);
    await page.evaluate('sdk.ask("家园里的问题")');await tick(page);
    const body=await page.evaluate('sdk.requests()[2].body');
    assert.equal(body.scope,'journey');assert.match(JSON.stringify(body.history),/第一问/);assert.match(body.context,/家园/);
  }finally{await page.close();}
});

test('QA reset and account switch clear prior completed history',async()=>{
  const page=await fixture();
  try{
    await page.evaluate('sdk.ask("原旅程")');await tick(page);await page.evaluate('sdk.answer(0)');await tick(page);
    await page.evaluate('sdk.update({resetKey:1})');
    assert.equal(await page.evaluate('sdk.snapshot().messages.length'),0);
    await page.evaluate('sdk.ask("验收进度")');await tick(page);await page.evaluate('sdk.answer(1)');await tick(page);
    await page.evaluate('sdk.token("second-token");sdk.sync()');
    assert.equal(await page.evaluate('sdk.snapshot().messages.length'),0);
  }finally{await page.close();}
});

test('opening shared battle chat stays available while external blocking cancels',async()=>{
  const page=await fixture();
  try{
    await page.evaluate('sdk.update({state:{...sdk.state(),phase:"battle",activeBattle:{id:"battle-one",stageId:"alley_rescue",status:"active"}}});sdk.battle()');
    assert.equal(await page.evaluate('sdk.ask("实时战况")'),true);await tick(page);
    assert.equal(await page.evaluate('sdk.requests()[0].body.context'),'当前棋盘');
    await page.evaluate('sdk.update({blocked:true})');
    assert.equal(await page.evaluate('sdk.requests()[0].aborted'),true);
    await page.evaluate('sdk.answer(0,"不应该显示")');await tick(page);
    assert.equal(await page.evaluate('sdk.snapshot().messages.length'),0);
    await page.evaluate('sdk.update({blocked:false})');
    assert.equal(await page.evaluate('sdk.requests().length'),1);
  }finally{await page.close();}
});

test('changing only nearby scenery invalidates the previous answer',async()=>{
  const page=await fixture();
  try{
    await page.evaluate('sdk.ask("附近是什么？")');await tick(page);
    await page.evaluate('sdk.update({scene:{nearby:{id:"second",label:"第二处纸箱"}}})');
    await page.evaluate('sdk.answer(0,"第一处纸箱的回答")');await tick(page);
    assert.equal(await page.evaluate('sdk.snapshot().messages.length'),0);
    assert.equal(await page.evaluate('sdk.snapshot().pendingQuestion'),null);
  }finally{await page.close();}
});

test('missing battle bridge is unavailable and a broken snapshot falls back without a model request',async()=>{
  const page=await fixture();
  try{
    await page.evaluate('sdk.update({state:{...sdk.state(),phase:"battle",activeBattle:null}})');
    assert.equal(await page.evaluate('sdk.snapshot().ready'),false);
    assert.equal(await page.evaluate('sdk.ask("还没准备好")'),false);
    await page.evaluate('sdk.update({state:{...sdk.state(),activeBattle:{id:"battle-one",stageId:"alley_rescue",status:"active"}}});sdk.brokenBattle()');
    assert.equal(await page.evaluate('sdk.ask("坏快照也别崩溃")'),true);await tick(page);
    const snapshot=await page.evaluate('sdk.snapshot()');
    assert.equal(snapshot.messages[0].answer.source,'local');
    assert.doesNotMatch(JSON.stringify(snapshot),/private snapshot internals/);
    assert.equal(await page.evaluate('sdk.requests().length'),0);
  }finally{await page.close();}
});

test('a same-tab token change rejects an old account reply before state refresh',async()=>{
  const page=await fixture();
  try{
    await page.evaluate('sdk.ask("旧账号的提问")');await tick(page);
    // localStorage writes in the same tab emit no storage event.
    await page.evaluate('sdk.token("new-account");sdk.answer(0,"旧账号的私人回复")');await tick(page);
    assert.equal(await page.evaluate('sdk.snapshot().messages.length'),0);
  }finally{await page.close();}
});
