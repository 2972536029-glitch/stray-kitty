import {openHomeBattleTrials} from './home-battle-trials';
import {confirmBattleResult} from './battle-result';
import {expect, test, type Page} from '@playwright/test';
import {playVisibleControls} from './l01-battle';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {GameState, Session} from '../../web/src/contracts';

const port = 8157, origin = `http://127.0.0.1:${port}`;
const cases = [{id:'low',pressure:-1},{id:'medium',pressure:0},{id:'high',pressure:1},{id:'retreat',pressure:0}] as const;
const sessions = new Map<string,Session>();
let child:ChildProcess|undefined, closed:Promise<void>|undefined, directory='';
test.beforeAll(async({request})=>{
  await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const catalog=await (await request.get('/api/v1/content')).json();
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-l01-browser-'));
  const players:Record<string,unknown>={};
  for(const entry of cases){
    const session={playerId:`l01-${entry.id}`,token:`l01-browser-fixture-${entry.id}`};sessions.set(entry.id,session);
    const state:GameState={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:'alley',storyNodeId:'',mapId:'greenhouse',flags:['l00_completed','alley_rescued','rescue_story_done'],cats:['miaomiao','tuanzi','diandian'],inventory:{material:3,food:0,'warm-can':4,'bouncy-treat':2},currencies:{stamp:2},furniture:['cardboard_nest'],placements:{},completedStages:['l00_tutorial','alley_rescue'],pendingEventId:'',activeBattle:null,eventState:{pendingModifiers:{shadowPressure:entry.pressure}},lastResult:{message:'独立持久化浏览器夹具：序章已完成。'}};
    players[createHash('sha256').update(session.token).digest('hex')]={id:session.playerId,state,receipts:{},receiptOrder:[]};
  }
  const save=path.join(directory,'save.json');fs.writeFileSync(save,JSON.stringify({schemaVersion:1,players}));
  child=spawn(process.env.KITTY_FIXTURE_BINARY ?? path.join(process.cwd(),'.runtime',process.platform==='win32'?'kitty-preview.exe':'kitty-preview'),[],{cwd:path.join(process.cwd(),'server'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GAME_QA_ENABLED:'true',GAME_ADDR:`127.0.0.1:${port}`,GAME_DATA_FILE:save,GAME_WEB_DIR:path.join(process.cwd(),'web/dist')}});
  closed=new Promise(resolve=>child!.once('close',()=>resolve()));
  let output='';child.stdout?.on('data',chunk=>output+=chunk);child.stderr?.on('data',chunk=>output+=chunk);
  await expect.poll(async()=>{if(child!.exitCode!==null)throw new Error(output);try{return(await request.get(origin+'/healthz',{timeout:500})).ok();}catch{return false;}},{timeout:10000}).toBe(true);
});
test.afterAll(async()=>{if(child&&closed){const force=setTimeout(()=>child?.kill('SIGKILL'),3000);child.kill('SIGTERM');await closed;clearTimeout(force);}});

async function openFixture(page:Page,id:string){
  await page.addInitScript(({origin,session})=>{if(location.origin===origin)localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));},{origin,session:sessions.get(id)!});
  await page.goto(origin);await page.getByRole('button',{name:'继续冒险'}).click();
}
for(const entry of cases.filter(value=>value.id!=='retreat')){
  test(`L01 ${entry.id}: real four-cat controls finish eight waves and a boss without changing item inventory`,async({page,request},info)=>{
    // 全量套件串行跑到这里时浏览器累积负载会拖慢战斗快照查询,6s 会饿死 evaluate;放宽一倍防抖。
    test.setTimeout(240000);page.setDefaultTimeout(12000);
    await openFixture(page,entry.id);await openHomeBattleTrials(page);
    const commands:string[]=[];page.on('request',req=>{if(req.url()===origin+'/api/v1/commands'&&req.method()==='POST')commands.push(req.postDataJSON().command.type);});
    await page.getByTestId('chapter-enter').click();
    await expect(page.getByTestId('chapter-battle')).toHaveAttribute('data-phase','ready');
    await expect(page.locator('[data-testid^="chapter-cat-"][data-status]')).toHaveCount(4);
    if(entry.id==='low')await page.screenshot({path:info.outputPath('l01-ready-siamese-diandian.png'),fullPage:true});
    await expect(page.locator('.chapter-roster [data-testid^="chapter-skill-"]')).toHaveCount(0);
    await expect(page.locator('.chapter-cell')).toHaveCount(26);
    await expect(page.getByTestId('chapter-boss-health')).toHaveAttribute('aria-valuemax',String(Math.round(2600*(entry.pressure===-1?.8:entry.pressure===1?1.2:1))));
    await expect(page.getByTestId('chapter-cell-A5')).toHaveAttribute('data-deployable','false');
    for(const spawn of ['A4','D10','E10']){
      await expect(page.getByTestId(`chapter-cell-${spawn}`)).toHaveAttribute('data-spawn','true');
      await expect(page.getByTestId(`chapter-cell-${spawn}`)).toHaveAttribute('data-deployable','false');
    }
    for(const cell of ['D8','D9','E8','E9']){
      await expect(page.getByTestId(`chapter-cell-${cell}`)).toHaveAttribute('data-boss-footprint','true');
      await expect(page.getByTestId(`chapter-cell-${cell}`)).toHaveAttribute('data-deployable','false');
    }
    const attempt=await page.getByTestId('chapter-battle').getAttribute('data-attempt-id');
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    await expect(page.getByTestId('chapter-battle')).toHaveAttribute('data-attempt-id',attempt!);
    const actions=await playVisibleControls(page);
    await expect(page.getByRole('button',{name:'带伙伴回家 →'})).toBeVisible();
    await expect(page.getByTestId('battle-supply-rewards')).toHaveCount(0);
    const headers={Authorization:`Bearer ${sessions.get(entry.id)!.token}`};
    const state=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    expect(state.lastResult.outcome).toBe('won');expect('battleRewards' in state.lastResult).toBe(false);
    expect(state.inventory['warm-can']).toBe(4);expect(state.inventory['bouncy-treat']).toBe(2);
    expect(commands.filter(type=>type==='START_BATTLE')).toHaveLength(1);
    expect(commands.filter(type=>type==='COMPLETE_BATTLE')).toHaveLength(1);
    expect(actions.skills.length).toBeGreaterThanOrEqual(4);expect(actions.dodges).toBeGreaterThan(0);
    await page.screenshot({path:info.outputPath(`l01-${entry.id}-won.png`),fullPage:true});
    await page.getByRole('button',{name:'带伙伴回家 →'}).click();await openHomeBattleTrials(page);
    await expect(page.getByTestId('chapter-enter')).toBeVisible();
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    expect((await(await request.get(origin+'/api/v1/state',{headers})).json()).inventory).toEqual(state.inventory);
    await info.attach('real-controls-result',{contentType:'application/json',body:JSON.stringify({difficulty:entry.id,...actions,commands,inventory:state.inventory})});
  });
}

test('L01 has no bag or item loadout, preserves pause/title and retreats to retry on a narrow screen',async({page,request},info)=>{
  test.setTimeout(90000);await openFixture(page,'retreat');await openHomeBattleTrials(page);
  await expect(page.getByRole('button',{name:'增加暖心罐罐'})).toHaveCount(0);
  await page.getByTestId('chapter-enter').click();
  const headers={Authorization:`Bearer ${sessions.get('retreat')!.token}`};
  const entered=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(entered.inventory['warm-can']).toBe(4);expect(entered.inventory['bouncy-treat']).toBe(2);
  await expect(page.getByTestId('chapter-bag')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/重新上阵/})).toHaveCount(0);
  await page.getByTestId('chapter-start').click();
  await expect.poll(async()=>Number(await page.getByTestId('chapter-cat-guard').getAttribute('data-hp'))).toBeLessThan(240);
  await page.getByTestId('chapter-advisor').click();
  await expect(page.getByTestId('chapter-effective-speed')).toContainText('暂停');
  const pausedTime=await page.getByTestId('chapter-battle').getAttribute('data-elapsed');
  const energy=await page.getByTestId('chapter-cat-guard').getAttribute('data-energy');
  await page.waitForTimeout(500);
  expect(await page.getByTestId('chapter-battle').getAttribute('data-elapsed')).toBe(pausedTime);
  expect(await page.getByTestId('chapter-cat-guard').getAttribute('data-energy')).toBe(energy);
  await page.getByRole('button',{name:'收起聊天'}).click();
  await page.getByRole('button',{name:'返回标题',exact:true}).click();await page.getByRole('button',{name:'继续冒险'}).click();
  await expect(page.getByTestId('chapter-battle')).toHaveAttribute('data-attempt-id',entered.activeBattle!.id);
  await page.getByTestId('chapter-retreat').click();await page.getByTestId('chapter-confirm-retreat').click();await confirmBattleResult(page,'lost');
  await expect(page.getByRole('button',{name:'调整防线，再试一次'})).toBeVisible();
  const ended=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(ended.lastResult.outcome).toBe('lost');expect('battleRewards' in ended.lastResult).toBe(false);
  expect(ended.inventory).toEqual(entered.inventory);
  await page.getByRole('button',{name:'调整防线，再试一次'}).click();
  await expect(page.getByTestId('chapter-enter')).toBeVisible();
  expect((await(await request.get(origin+'/api/v1/state',{headers})).json()).phase).toBe('preparation');
  await page.getByTestId('chapter-enter').click();
  expect(await page.getByTestId('chapter-battle').getAttribute('data-attempt-id')).not.toBe(entered.activeBattle!.id);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.locator('.chapter-cell')).toHaveCount(26);
  await page.screenshot({path:info.outputPath('l01-mobile-ready.png'),fullPage:true});
});
