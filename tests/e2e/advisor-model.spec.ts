import {expect,test} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {Session} from '../../web/src/contracts';
import {completeL00Tutorial} from './l00-battle';

const origin='http://127.0.0.1:8163',providerOrigin='http://127.0.0.1:8164';
const entries=[['l00_tutorial','battle'],['alley_boss','chapter'],['market_boss','market'],['greenhouse_boss','greenhouse'],['tunnel_boss','tunnel'],['finale_boss','finale']] as const;
const sessions=new Map<string,Session>();
const providerRequests:Array<Record<string,unknown>>=[];
let provider:http.Server,child:ChildProcess|undefined,closed:Promise<void>|undefined;
test.beforeAll(async({request})=>{
  provider=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);providerRequests.push(body);
    if(raw.includes('模拟不可用')){res.writeHead(503).end('fixture provider unavailable');return;}
    if(raw.includes('慢一点'))await new Promise(resolve=>setTimeout(resolve,1800));
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({title:'模型战况建议',text:'我会根据眼前伙伴的体力与能量提供建议，技能仍由你手动释放。'})}}]}));
  });
  await new Promise<void>((resolve,reject)=>{provider.once('error',reject);provider.listen(8164,'127.0.0.1',resolve);});
  const catalog=await(await request.get('/api/v1/content')).json(),players:Record<string,unknown>={};
  for(const stage of [...entries.map(entry=>entry[0]),'failure','cancel']){
    const actualStage=['failure','cancel'].includes(stage)?'tunnel_boss':stage;
    const session={playerId:'advisor-'+stage,token:'advisor-fixture-session-'+stage};sessions.set(stage,session);
    const state={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'battle',chapterId:actualStage==='l00_tutorial'?'prologue':'alley',storyNodeId:'',mapId:'greenhouse',flags:['l00_completed','alley_rescued','rescue_story_done'],cats:['miaomiao','tuanzi','diandian'],inventory:{material:3,food:0},currencies:{stamp:2},furniture:['cardboard_nest'],placements:{},completedStages:['l00_tutorial','alley_rescue'],pendingEventId:'',activeBattle:{id:'advisor-attempt-'+stage,stageId:actualStage,status:'active',modifiers:{shadowPressure:0}},eventState:{pendingModifiers:{shadowPressure:0}},lastResult:{message:'隔离军师接口测试'}};
    players[createHash('sha256').update(session.token).digest('hex')]={id:session.playerId,state,receipts:{},receiptOrder:[]};
  }
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-advisor-')),save=path.join(directory,'save.json');
  fs.writeFileSync(save,JSON.stringify({schemaVersion:1,players}));
  child=spawn(process.env.KITTY_FIXTURE_BINARY??path.join(process.cwd(),'.runtime',process.platform==='win32'?'kitty-preview.exe':'kitty-preview'),[],{cwd:path.join(process.cwd(),'server'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GAME_ADDR:'127.0.0.1:8163',GAME_DATA_FILE:save,GAME_WEB_DIR:path.join(process.cwd(),'web/dist'),ADVISOR_BASE_URL:providerOrigin,ADVISOR_MODEL:'fixture-model',ADVISOR_API_KEY:'fixture-provider-secret'}});
  closed=new Promise(resolve=>child!.once('close',()=>resolve()));
  let logs='';child.stdout?.on('data',chunk=>logs+=chunk);child.stderr?.on('data',chunk=>logs+=chunk);
  await expect.poll(async()=>{if(child!.exitCode!==null)throw Error(logs);try{return(await request.get(origin+'/healthz',{timeout:500})).ok();}catch{return false;}},{timeout:10000}).toBe(true);
});
test.afterAll(async()=>{
  if(child&&closed){child.kill('SIGTERM');await closed;}
  if(provider){provider.closeAllConnections();await new Promise<void>(resolve=>provider.close(()=>resolve()));}
});

test('all six chapters use the authenticated model route without changing game state',async({browser,request})=>{
  test.setTimeout(150000);
  for(const [stage,prefix] of entries){
    const page=await browser.newPage();page.setDefaultTimeout(12000);
    try{
      const session=sessions.get(stage)!;
      await page.addInitScript(session=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session)),session);
      await page.goto(origin);await page.getByRole('button',{name:'继续冒险'}).click();
      const battle=stage==='l00_tutorial'?page.locator('section[aria-label="序章塔防战斗"]'):page.getByTestId(prefix+'-battle');
      if(stage==='l00_tutorial')await completeL00Tutorial(page,battle);else await battle.getByRole('button',{name:'开始守护',exact:true}).click();
      await page.getByTestId(prefix+'-advisor').click();
      const before=await(await request.get(origin+'/api/v1/state',{headers:{Authorization:'Bearer '+session.token}})).json();
      const dialog=page.getByRole('region',{name:'军师阿策聊天'});
      await dialog.getByLabel('询问军师').fill('现在怎么安排护盾和技能？');
      await dialog.getByRole('button',{name:'询问',exact:true}).click();
      await expect(dialog).toContainText('模型战况建议');
      await expect(dialog).toContainText('技能仍由你手动释放');
      const after=await(await request.get(origin+'/api/v1/state',{headers:{Authorization:'Bearer '+session.token}})).json();
      expect(after).toEqual(before);
      expect(await page.content()).not.toContain('fixture-provider-secret');
      const providerBody=providerRequests.at(-1)!;
      expect(providerBody.model).toBe('fixture-model');
      expect(JSON.stringify(providerBody)).not.toContain(session.token);
      expect(JSON.stringify(providerBody)).not.toContain('spawnQueue');
      if(stage==='l00_tutorial')await expect(battle).toHaveAttribute('data-effective-speed','0');
      else await expect(battle).toHaveAttribute('data-effective-speed','0');
    }finally{await page.close();}
  }
});

test('provider failure gives the existing local chapter answer',async({page})=>{
  await page.addInitScript(session=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session)),sessions.get('failure')!);
  await page.goto(origin);await page.getByRole('button',{name:'继续冒险'}).click();
  await page.getByTestId('tunnel-advisor').click();
  const dialog=page.getByRole('region',{name:'军师阿策聊天'});
  await dialog.getByLabel('询问军师').fill('模拟不可用，墨墨夜视能持续多久？');
  await dialog.getByRole('button',{name:'询问',exact:true}).click();
  await expect(dialog).toContainText('本地');
  await expect(dialog).toContainText('夜视');
  await expect(dialog).not.toContainText('fixture provider unavailable');
  await expect(dialog.getByRole('button',{name:'询问',exact:true})).toBeVisible();
});

test('closing chat discards a delayed response and opening it does not resubmit',async({page})=>{
  await page.addInitScript(session=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session)),sessions.get('cancel')!);
  await page.goto(origin);await page.getByRole('button',{name:'继续冒险'}).click();
  await page.getByTestId('tunnel-advisor').click();
  const dialog=page.getByRole('region',{name:'军师阿策聊天'});
  await dialog.getByLabel('询问军师').fill('慢一点回答，墨墨怎样恢复视野？');
  const count=providerRequests.length;
  await dialog.getByRole('button',{name:'询问',exact:true}).click();
  await expect.poll(()=>providerRequests.length).toBe(count+1);
  await dialog.getByRole('button',{name:'收起聊天'}).click();
  await page.waitForTimeout(2000);
  await page.getByTestId('tunnel-advisor').click();
  await expect(dialog).not.toContainText('模型战况建议');
  expect(providerRequests.length).toBe(count+1);
});

test('battle chat redirects home questions locally without consuming a provider request',async({page})=>{
  await page.addInitScript(session=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session)),sessions.get('cancel')!);
  await page.goto(origin);await page.getByRole('button',{name:'继续冒险'}).click();
  await page.getByTestId('tunnel-advisor').click();
  const dialog=page.getByRole('region',{name:'军师阿策聊天'});
  const before=providerRequests.length;
  await dialog.getByLabel('询问军师').fill('家园家具怎么摆放？');
  await dialog.getByRole('button',{name:'询问',exact:true}).click();
  await expect(dialog).toContainText('回家园再聊');
  await expect(dialog).toContainText('回到家园问我');
  expect(providerRequests.length).toBe(before);
});
