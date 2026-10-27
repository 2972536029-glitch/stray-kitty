import {expect,test,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {playVisibleControls as playChapter} from './l01-battle';
import {playVisibleControls as playMarket} from './l02-battle';
import {playVisibleControls as playGreenhouse} from './l03-battle';
import type {GameState,Session} from '../../web/src/contracts';

const port=8161,origin=`http://127.0.0.1:${port}`;
const carries=['lantern','mirror','bell','box','dog','dove','rats','kitten'] as const;
const sessions=new Map<string,Session>();
const completeCases=[
  {id:'chapter',carry:'lantern',stage:'alley_boss',play:playChapter},
  {id:'market',carry:'box',stage:'market_boss',play:playMarket},
  {id:'greenhouse',carry:'dove',stage:'greenhouse_boss',play:playGreenhouse},
] as const;
let child:ChildProcess|undefined,closed:Promise<void>|undefined;
test.beforeAll(async({request})=>{
  await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const catalog=await(await request.get('/api/v1/content')).json();
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-event-carry-'));
  const players:Record<string,unknown>={};
  for(const item of [...carries.map(carry=>({id:'ui-'+carry,carry})),{id:'ui-unknown',carry:'future-help'},{id:'retry-rats',carry:'rats'},{id:'retry-kitten',carry:'kitten'},...completeCases]){
    const session={playerId:'carry-'+item.id,token:'carry-browser-fixture-'+item.id};sessions.set(item.id,session);
    const state={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:'alley',storyNodeId:'',mapId:'greenhouse',flags:['l00_completed','alley_rescued','rescue_story_done'],cats:['miaomiao','tuanzi','diandian'],inventory:{material:3,food:0,'warm-can':4},currencies:{stamp:2},furniture:['cardboard_nest'],placements:{},completedStages:['l00_tutorial','alley_rescue'],pendingEventId:'',activeBattle:null,eventState:{pendingModifiers:{shadowPressure:0,carry:item.carry}},lastResult:{message:'事件携带物联调的隔离持久化夹具。'}};
    players[createHash('sha256').update(session.token).digest('hex')]={id:session.playerId,state,receipts:{},receiptOrder:[]};
  }
  const save=path.join(directory,'save.json');fs.writeFileSync(save,JSON.stringify({schemaVersion:1,players}));
  child=spawn(process.env.KITTY_FIXTURE_BINARY??path.join(process.cwd(),'.runtime',process.platform==='win32'?'kitty-preview.exe':'kitty-preview'),[],{cwd:path.join(process.cwd(),'server'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GAME_ADDR:`127.0.0.1:${port}`,GAME_DATA_FILE:save,GAME_WEB_DIR:path.join(process.cwd(),'web/dist')}});
  closed=new Promise(resolve=>child!.once('close',()=>resolve()));
  let output='';child.stdout?.on('data',chunk=>output+=chunk);child.stderr?.on('data',chunk=>output+=chunk);
  await expect.poll(async()=>{if(child!.exitCode!==null)throw Error(output);try{return(await request.get(origin+'/healthz',{timeout:500})).ok();}catch{return false;}},{timeout:10000}).toBe(true);
});
test.afterAll(async()=>{if(child&&closed){const force=setTimeout(()=>child?.kill('SIGKILL'),3000);child.kill('SIGTERM');await closed;clearTimeout(force);}});
async function openFixture(page:Page,id:string){
  await page.addInitScript(({origin,session})=>{if(location.origin===origin)localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));},{origin,session:sessions.get(id)!});
  await page.goto(origin);await page.getByRole('button',{name:'继续冒险'}).click();
}

test('eight event carries reach the real board, remain bounded and never create an inventory bag',async({browser},info)=>{
  test.setTimeout(180000);
  for(const carry of carries){
    const page=await browser.newPage({viewport:{width:390,height:844}});
    try{
      await openFixture(page,'ui-'+carry);await page.getByTestId('greenhouse-enter').click();
      const panel=page.getByTestId('battle-carry-panel');
      await expect(panel).toHaveAttribute('data-carry',carry);
      await expect(page.getByTestId('greenhouse-battle')).toHaveAttribute('data-phase','ready');
      await expect(page.locator('.greenhouse-cell')).toHaveCount(34);
      await expect(page.getByTestId('greenhouse-bag')).toHaveCount(0);
      const attempt=await page.getByTestId('greenhouse-battle').getAttribute('data-attempt-id');
      await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
      await expect(page.getByTestId('greenhouse-battle')).toHaveAttribute('data-attempt-id',attempt!);
      await expect(panel).toHaveAttribute('data-carry',carry);
      if(carry==='mirror')await expect(page.getByTestId('battle-carry-use')).toBeDisabled();
      if(carry==='dove')await expect(page.getByTestId('battle-carry-preview')).toContainText('第 1 波');
      await page.getByTestId('greenhouse-play-toggle').click();
      if(carry==='bell'){
        await expect.poll(async()=>Number(await page.getByTestId('greenhouse-cat-guard').getAttribute('data-energy'))).toBeGreaterThanOrEqual(20);
      }
      if(carry==='mirror'){
        await page.getByTestId('battle-carry-use').click();
        await expect(panel).toHaveAttribute('data-used','true');
        await page.getByTestId('greenhouse-play-toggle').click();
        const frozen=await panel.getAttribute('data-freeze');
        await page.waitForTimeout(350);expect(await panel.getAttribute('data-freeze')).toBe(frozen);
        await expect(page.getByTestId('battle-carry-use')).toBeDisabled();
        await page.getByTestId('greenhouse-play-toggle').click();
        await expect.poll(async()=>Number(await panel.getAttribute('data-freeze')),{timeout:7000}).toBe(0);
      }
      if(carry==='lantern')await expect.poll(async()=>Number(await panel.getAttribute('data-pulses')),{timeout:12000}).toBeGreaterThan(0);
      if(carry==='box')await expect(panel).toHaveAttribute('data-box-active','true');
      if(carry==='rats'){
        await expect(panel).toHaveAttribute('aria-label','动物来报恩');
        const initialRoute=await panel.getAttribute('data-patrol-route');
        await expect.poll(()=>panel.getAttribute('data-patrol-route'),{timeout:15000}).not.toBe(initialRoute);
        await page.getByTestId('greenhouse-play-toggle').click();
        const route=await panel.getAttribute('data-patrol-route'),status=await page.getByTestId('battle-carry-status').textContent();
        await page.waitForTimeout(350);expect(await panel.getAttribute('data-patrol-route')).toBe(route);expect(await page.getByTestId('battle-carry-status').textContent()).toBe(status);
      }
      if(carry==='kitten'){
        await expect(panel).toHaveAttribute('aria-label','动物来报恩');
        await expect(panel).toHaveAttribute('data-kitten-wave','1');
        await expect.poll(async()=>Number(await page.getByTestId('greenhouse-cat-guard').getAttribute('data-energy'))).toBeGreaterThanOrEqual(8);
        await page.getByTestId('greenhouse-play-toggle').click();
        const energy=await page.getByTestId('greenhouse-cat-guard').getAttribute('data-energy');
        await page.waitForTimeout(350);expect(await page.getByTestId('greenhouse-cat-guard').getAttribute('data-energy')).toBe(energy);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`carry-${carry}-mobile.png`),fullPage:true});
    }finally{await page.close();}
  }
});

test('new animal allies survive real retreat, retry and refresh without spending mainline rewards',async({browser,request})=>{
  test.setTimeout(90000);
  for(const entry of [{carry:'rats',prefix:'tunnel'},{carry:'kitten',prefix:'finale'}]){
    const page=await browser.newPage();
    try{
      await openFixture(page,'retry-'+entry.carry);await page.getByTestId(entry.prefix+'-enter').click();
      const headers={Authorization:'Bearer '+sessions.get('retry-'+entry.carry)!.token};
      const before=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
      await expect(page.getByTestId('battle-carry-panel')).toHaveAttribute('data-carry',entry.carry);
      await page.getByTestId(entry.prefix+'-play-toggle').click();
      await expect(page.getByTestId(entry.prefix+'-battle')).toHaveAttribute('data-phase','battle');
      await page.getByTestId(entry.prefix+'-retreat').click();await page.getByTestId(entry.prefix+'-confirm-retreat').click();
      await page.getByRole('button',{name:'调整防线，再试一次'}).click();await page.getByTestId(entry.prefix+'-enter').click();
      const after=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
      expect(after.activeBattle!.id).not.toBe(before.activeBattle!.id);expect(after.activeBattle!.modifiers).toEqual(before.activeBattle!.modifiers);
      expect(after.eventState!.pendingModifiers.carry).toBe(entry.carry);expect(after.inventory).toEqual(before.inventory);
      await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
      await expect(page.getByTestId(entry.prefix+'-battle')).toHaveAttribute('data-attempt-id',after.activeBattle!.id);
      await expect(page.getByTestId('battle-carry-panel')).toHaveAttribute('data-carry',entry.carry);
      if(entry.carry==='kitten')await expect(page.getByTestId('battle-carry-panel')).toHaveAttribute('data-kitten-wave','0');
    }finally{await page.close();}
  }
});

test('unknown future carry does not block entering or starting the base chapter',async({page})=>{
  await openFixture(page,'ui-unknown');await page.getByTestId('greenhouse-enter').click();
  await expect(page.getByTestId('greenhouse-battle')).toHaveAttribute('data-phase','ready');
  await page.getByTestId('greenhouse-play-toggle').click();
  await expect(page.getByTestId('greenhouse-battle')).toHaveAttribute('data-phase','battle');
  await expect(page.getByTestId('greenhouse-cell-C8')).toHaveAttribute('data-enemies',/[1-9]/);
});

for(const entry of completeCases){
  test(`${entry.id}: event ${entry.carry} finishes with real controls and respects settlement boundaries`,async({page,request},info)=>{
    test.setTimeout(240000);page.setDefaultTimeout(12000);
    await openFixture(page,entry.id);await page.getByTestId(`${entry.id}-enter`).click();
    await expect(page.getByTestId('battle-carry-panel')).toHaveAttribute('data-carry',entry.carry);
    const headers={Authorization:'Bearer '+sessions.get(entry.id)!.token};
    const before=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    expect(before.activeBattle!.modifiers!.carry).toBe(entry.carry);
    const actions=await entry.play(page);
    await expect(page.getByRole('button',{name:entry.id==='chapter'?'带伙伴回家 →':'返回家园 →'})).toBeVisible();
    const after=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    expect(after.lastResult.outcome).toBe('won');expect(after.completedStages).toContain(entry.stage);
    expect(after.inventory).toEqual(before.inventory);expect(after.cats).toEqual(before.cats);
    expect(after.eventState!.pendingModifiers.carry).toBe(entry.id==='chapter'?undefined:entry.carry);
    await info.attach('carry-completion',{contentType:'application/json',body:JSON.stringify({carry:entry.carry,stage:entry.stage,outcome:after.lastResult.outcome,actions})});
  });
}
