import {openHomeBattleTrials} from './home-battle-trials';
import {confirmBattleResult} from './battle-result';
import {battleRecording} from './battle-recording';
import {expect, test, type Page} from '@playwright/test';
import {playVisibleControls} from './l03-battle';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {GameState, Session} from '../../web/src/contracts';

test.use(battleRecording);

let origin = '';
const cases = [{id:'low',pressure:-1},{id:'medium',pressure:0},{id:'high',pressure:1},{id:'retreat',pressure:0}] as const;
const sessions = new Map<string,Session>();
let child:ChildProcess|undefined, closed:Promise<void>|undefined, directory='';
test.beforeAll(async({request},info)=>{
  // Each parallel/repeated worker owns a separate server and persisted fixture.
  const port=18159+info.workerIndex;origin=`http://127.0.0.1:${port}`;
  await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const catalog=await (await request.get('/api/v1/content')).json();
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-l03-browser-'));
  const players:Record<string,unknown>={};
  for(const entry of cases){
    const session={playerId:`l03-${entry.id}`,token:`l03-browser-fixture-${entry.id}`};sessions.set(entry.id,session);
    const state:GameState={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:'alley',storyNodeId:'',mapId:'greenhouse',flags:['l00_completed','alley_rescued','rescue_story_done','chapter_3_started','momo_joined'],cats:['miaomiao','tuanzi','diandian','momo'],inventory:{material:3,food:0,'warm-can':4,'bouncy-treat':2},currencies:{stamp:2},furniture:['cardboard_nest'],placements:{},completedStages:['l00_tutorial','alley_rescue'],pendingEventId:'',activeBattle:null,eventState:{pendingModifiers:{shadowPressure:entry.pressure}},lastResult:{message:'独立持久化浏览器夹具：序章已完成。'}};
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
  test(`L03 ${entry.id}: real six-cat controls finish eight waves and a boss without changing item inventory`,async({page,request},info)=>{
    // 全量套件串行跑到这里时浏览器累积负载会拖慢战斗快照查询,6s 会饿死 evaluate;放宽一倍防抖。
    test.setTimeout(240000);page.setDefaultTimeout(12000);
    await openFixture(page,entry.id);await openHomeBattleTrials(page);
    const commands:string[]=[];page.on('request',req=>{if(req.url()===origin+'/api/v1/commands'&&req.method()==='POST')commands.push(req.postDataJSON().command.type);});
    await page.getByTestId('greenhouse-enter').click();
    await expect(page.getByTestId('greenhouse-battle')).toHaveAttribute('data-phase','ready');
    await expect(page.locator('[data-testid^="greenhouse-cat-"][data-status]')).toHaveCount(6);
    await expect(page.locator('.greenhouse-roster,.chapter-roster,.btl-party')).toHaveCount(0);
    await expect(page.locator('.greenhouse-cell')).toHaveCount(34);
    await expect(page.getByTestId('greenhouse-boss-health')).toHaveAttribute('aria-valuemax',String(Math.round(3000*(entry.pressure===-1?.8:entry.pressure===1?1.2:1))));
    await expect(page.getByTestId('greenhouse-cell-C3')).toHaveAttribute('data-deployable','false');
    for(const spawn of ['C8','E8','F7']){
      await expect(page.getByTestId(`greenhouse-cell-${spawn}`)).toHaveAttribute('data-spawn','true');
      await expect(page.getByTestId(`greenhouse-cell-${spawn}`)).toHaveAttribute('data-deployable','false');
    }
    for(const cell of ['C6','C7','D6','D7']){
      await expect(page.getByTestId(`greenhouse-cell-${cell}`)).toHaveAttribute('data-boss-footprint','true');
      await expect(page.getByTestId(`greenhouse-cell-${cell}`)).toHaveAttribute('data-deployable','false');
    }
    const expected=['A2','A3','A4','A5',...Array.from({length:7},(_,i)=>'B'+(i+1)),...Array.from({length:7},(_,i)=>'C'+(i+2)),...Array.from({length:8},(_,i)=>'D'+(i+2)),...Array.from({length:7},(_,i)=>'E'+(i+2)),'F7'];
    const coordinates=await page.locator('.greenhouse-cell').evaluateAll(cells=>cells.map(cell=>({name:cell.getAttribute('data-testid')!.replace('greenhouse-cell-',''),column:getComputedStyle(cell).gridColumnStart,row:getComputedStyle(cell).gridRowStart})));
    expect(coordinates.map(cell=>cell.name).sort()).toEqual(expected.sort());
    for(const cell of coordinates){expect(cell.column).toBe(cell.name.slice(1));expect(cell.row).toBe(String(cell.name.charCodeAt(0)-64));}
    for(const missing of ['A1','A6','B8','C1','D1','E1','F6','F8','F9'])await expect(page.getByTestId('greenhouse-cell-'+missing)).toHaveCount(0);
    const alpha=await page.locator('[data-testid="greenhouse-board"]>canvas').evaluate((canvas:HTMLCanvasElement)=>[...canvas.getContext('2d')!.getImageData(40,40,1,1).data]);
    expect(alpha[3]).toBe(0);
    const headers={Authorization:`Bearer ${sessions.get(entry.id)!.token}`};
    const before=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    const attempt=await page.getByTestId('greenhouse-battle').getAttribute('data-attempt-id');
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    await expect(page.getByTestId('greenhouse-battle')).toHaveAttribute('data-attempt-id',attempt!);
    const actions=await playVisibleControls(page);
    await expect(page.getByRole('button',{name:'返回家园 →'})).toBeVisible();
    await expect(page.getByTestId('battle-supply-rewards')).toHaveCount(0);
    const state=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    expect(state.lastResult.outcome).toBe('won');expect('battleRewards' in state.lastResult).toBe(false);
    expect(state.inventory).toEqual(before.inventory);expect(state.currencies).toEqual(before.currencies);
    expect(state.cats).toEqual(before.cats);expect(state.furniture).toEqual(before.furniture);
    // 花房胜利沿用主流程既有行为：保留原标记并解锁后续剧情。
    expect(state.flags).toEqual([...before.flags,'greenhouse_fortified']);
    expect(state.pushTokens).toEqual(before.pushTokens);expect(state.eventState?.pendingModifiers).toEqual(before.eventState?.pendingModifiers);
    expect(state.completedStages).toContain('greenhouse_boss');
    expect(commands.filter(type=>type==='START_BATTLE')).toHaveLength(1);
    expect(commands.filter(type=>type==='COMPLETE_BATTLE')).toHaveLength(1);
    expect(actions.skills.length).toBeGreaterThanOrEqual(6);expect(actions.dodges).toBeGreaterThan(0);
    await page.screenshot({path:info.outputPath(`l03-${entry.id}-won.png`),fullPage:true});
    await page.getByRole('button',{name:'返回家园 →'}).click();await openHomeBattleTrials(page);
    await expect(page.getByTestId('greenhouse-enter')).toBeVisible();
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    expect((await(await request.get(origin+'/api/v1/state',{headers})).json()).inventory).toEqual(state.inventory);
    await info.attach('real-controls-result',{contentType:'application/json',body:JSON.stringify({difficulty:entry.id,...actions,commands,inventory:state.inventory})});
  });
}

test('L03 has no bag or item loadout, preserves pause/title and retreats to retry on a narrow screen',async({page,request},info)=>{
  test.setTimeout(90000);await openFixture(page,'retreat');await openHomeBattleTrials(page);
  await expect(page.getByRole('button',{name:'增加暖心罐罐'})).toHaveCount(0);
  await page.getByTestId('greenhouse-enter').click();
  await expect(page.getByTestId('greenhouse-battle')).toHaveAttribute('data-phase','ready');
  const headers={Authorization:`Bearer ${sessions.get('retreat')!.token}`};
  const entered=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(entered.activeBattle?.stageId).toBe('greenhouse_boss');
  expect(entered.inventory['warm-can']).toBe(4);expect(entered.inventory['bouncy-treat']).toBe(2);
  await expect(page.getByTestId('greenhouse-bag')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/重新上阵/})).toHaveCount(0);
  await page.getByTestId('greenhouse-play-toggle').click();
  await expect.poll(async()=>Number(await page.getByTestId('greenhouse-cat-guard').getAttribute('data-hp'))).toBeLessThan(240);
  await page.getByTestId('greenhouse-advisor').click();
  await expect(page.getByTestId('greenhouse-effective-speed')).toContainText('暂停');
  const pausedTime=await page.getByTestId('greenhouse-battle').getAttribute('data-elapsed');
  const energy=await page.getByTestId('greenhouse-cat-guard').getAttribute('data-energy');
  await page.waitForTimeout(500);
  expect(await page.getByTestId('greenhouse-battle').getAttribute('data-elapsed')).toBe(pausedTime);
  expect(await page.getByTestId('greenhouse-cat-guard').getAttribute('data-energy')).toBe(energy);
  await page.getByRole('button',{name:'收起聊天'}).click();
  await page.getByRole('button',{name:'返回标题',exact:true}).click();await page.getByRole('button',{name:'继续冒险'}).click();
  await expect(page.getByTestId('greenhouse-battle')).toHaveAttribute('data-attempt-id',entered.activeBattle!.id);
  await page.getByTestId('greenhouse-retreat').click();await page.getByTestId('greenhouse-confirm-retreat').click();await confirmBattleResult(page,'lost');
  await expect(page.getByRole('button',{name:'调整防线，再试一次'})).toBeVisible();
  const ended=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(ended.lastResult.outcome).toBe('lost');expect('battleRewards' in ended.lastResult).toBe(false);
  expect(ended.inventory).toEqual(entered.inventory);
  await page.getByRole('button',{name:'调整防线，再试一次'}).click();
  await expect(page.getByTestId('greenhouse-enter')).toBeVisible();
  const retry=await(await request.get(origin+'/api/v1/state',{headers})).json();
  expect(retry.phase).toBe('preparation');expect(retry.lastResult.stageId).toBe('greenhouse_boss');
  await page.getByTestId('greenhouse-enter').click();
  expect(await page.getByTestId('greenhouse-battle').getAttribute('data-attempt-id')).not.toBe(entered.activeBattle!.id);
  const restarted=await(await request.get(origin+'/api/v1/state',{headers})).json();
  expect(restarted.activeBattle.modifiers).toEqual(entered.activeBattle!.modifiers);
  expect(restarted.activeBattle.stageId).toBe('greenhouse_boss');
  await page.setViewportSize({width:390,height:844});
  const overview=page.getByRole('button',{name:'查看全图',exact:true});
  if(await overview.isVisible())await overview.click();
  await expect(page.getByTestId('greenhouse-board')).toHaveAttribute('data-overview','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.locator('.greenhouse-cell')).toHaveCount(34);
  await page.getByTestId('greenhouse-board').scrollIntoViewIfNeeded();
  expect(await page.getByTestId('greenhouse-cell-F7').evaluate(cell=>{
    const bounds=cell.getBoundingClientRect();
    return cell.contains(document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2));
  })).toBe(true);
  await page.screenshot({path:info.outputPath('l03-mobile-ready.png'),fullPage:true});
});
