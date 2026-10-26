import {expect, test, type Page} from '@playwright/test';
import {playFinaleVisibleControls} from './l05-battle';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {GameState, Session} from '../../web/src/contracts';

const port = 8174, origin = `http://127.0.0.1:${port}`;
const cases = [{id:'low',pressure:-1},{id:'medium',pressure:0},{id:'high',pressure:1},{id:'retreat',pressure:0},{id:'layout',pressure:0}] as const;
const sessions = new Map<string,Session>();
let child:ChildProcess|undefined, closed:Promise<void>|undefined, directory='';
test.beforeAll(async({request})=>{
  await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const catalog=await (await request.get('/api/v1/content')).json();
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-l05-browser-'));
  const players:Record<string,unknown>={};
  for(const entry of cases){
    const session={playerId:`l05-${entry.id}`,token:`l05-browser-fixture-${entry.id}`};sessions.set(entry.id,session);
    const state:GameState={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:'alley',storyNodeId:'',mapId:'greenhouse',flags:['l00_completed','alley_rescued','rescue_story_done'],cats:['miaomiao','tuanzi','diandian'],inventory:{material:3,food:0,'warm-can':4,'bouncy-treat':2},currencies:{stamp:2},furniture:['cardboard_nest'],placements:{},completedStages:['l00_tutorial','alley_rescue'],pendingEventId:'',activeBattle:null,eventState:{pendingModifiers:{shadowPressure:entry.pressure,...(entry.id==='retreat'?{carry:'dog' as const}:{})}},lastResult:{message:'独立持久化浏览器夹具：序章已完成。'}};
    players[createHash('sha256').update(session.token).digest('hex')]={id:session.playerId,state,receipts:{},receiptOrder:[]};
  }
  const save=path.join(directory,'save.json');fs.writeFileSync(save,JSON.stringify({schemaVersion:1,players}));
  child=spawn(process.env.KITTY_FIXTURE_BINARY ?? path.join(process.cwd(),'.runtime',process.platform==='win32'?'kitty-preview.exe':'kitty-preview'),[],{cwd:path.join(process.cwd(),'server'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GAME_ADDR:`127.0.0.1:${port}`,GAME_DATA_FILE:save,GAME_WEB_DIR:path.join(process.cwd(),'web/dist')}});
  closed=new Promise(resolve=>child!.once('close',()=>resolve()));
  let output='';child.stdout?.on('data',chunk=>output+=chunk);child.stderr?.on('data',chunk=>output+=chunk);
  await expect.poll(async()=>{if(child!.exitCode!==null)throw new Error(output);try{return(await request.get(origin+'/healthz',{timeout:500})).ok();}catch{return false;}},{timeout:10000}).toBe(true);
});
test.afterAll(async()=>{if(child&&closed){const force=setTimeout(()=>child?.kill('SIGKILL'),3000);child.kill('SIGTERM');await closed;clearTimeout(force);}});

async function openFixture(page:Page,id:string){
  await page.addInitScript(({origin,session})=>{if(location.origin===origin)localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));},{origin,session:sessions.get(id)!});
  await page.goto(origin);await page.getByRole('button',{name:'继续冒险'}).click();
}
for(const entry of cases.filter(value=>['low','medium','high'].includes(value.id))){
  test(`L05 ${entry.id}: real six-cat controls finish ten waves, a giant boss, two elites and fixed reinforcements without changing item inventory`,async({page,request},info)=>{
    // 全量套件串行跑到这里时浏览器累积负载会拖慢战斗快照查询,6s 会饿死 evaluate;放宽一倍防抖。
    test.setTimeout(420000);page.setDefaultTimeout(12000);
    await openFixture(page,entry.id);
    const commands:string[]=[],reports:unknown[]=[];page.on('request',req=>{if(req.url()===origin+'/api/v1/commands'&&req.method()==='POST'){const c=req.postDataJSON().command;commands.push(c.type);if(c.type==='COMPLETE_BATTLE')reports.push(c.report);}});
    await page.getByTestId('finale-enter').click();
    await expect(page.getByTestId('finale-battle')).toHaveAttribute('data-phase','ready');
    await expect(page.locator('[data-testid^="finale-cat-"][data-status]')).toHaveCount(6);
    await expect(page.locator('.finale-roster,.chapter-roster,.btl-party')).toHaveCount(0);
    await expect(page.locator('.finale-cell')).toHaveCount(74);
    await expect(page.getByTestId('finale-boss-health')).toHaveAttribute('aria-valuemax',String(Math.round(6500*(entry.pressure===-1?.8:entry.pressure===1?1.2:1))));
    await expect(page.getByTestId('finale-cell-A4')).toHaveAttribute('data-deployable','false');
    await expect(page.getByTestId('finale-cell-A6')).toHaveAttribute('data-deployable','true');
    for(const id of ['controller','taotao','yinyin'])await expect(page.getByTestId('finale-ally-'+id)).toHaveAttribute('data-status','waiting');
    for(const cell of ['B5','F5','F4','B9','F9'])await expect(page.getByTestId('finale-cell-'+cell)).toHaveAttribute('data-deployable','false');
    await page.screenshot({path:info.outputPath('l05-ready.png'),fullPage:true});
    for(const spawn of ['A11','D12','G11']){
      await expect(page.getByTestId(`finale-cell-${spawn}`)).toHaveAttribute('data-spawn','true');
      await expect(page.getByTestId(`finale-cell-${spawn}`)).toHaveAttribute('data-deployable','false');
    }
    for(const cell of ['C9','C10','C11','D9','D10','D11','E9','E10','E11']){
      await expect(page.getByTestId(`finale-cell-${cell}`)).toHaveAttribute('data-boss-footprint','true');
      await expect(page.getByTestId(`finale-cell-${cell}`)).toHaveAttribute('data-deployable','false');
    }
    const expected=Array.from({length:7},(_,y)=>{const start=y===0||y===6?4:y===1||y===5?2:1;const end=y===0||y===6?11:12;return Array.from({length:end-start+1},(_,i)=>String.fromCharCode(65+y)+(start+i));}).flat();
    const coordinates=await page.locator('.finale-cell').evaluateAll(cells=>cells.map(cell=>({name:cell.getAttribute('data-testid')!.replace('finale-cell-',''),column:getComputedStyle(cell).gridColumnStart,row:getComputedStyle(cell).gridRowStart})));
    expect(coordinates.map(cell=>cell.name).sort()).toEqual(expected.sort());
    for(const cell of coordinates){expect(cell.column).toBe(cell.name.slice(1));expect(cell.row).toBe(String(cell.name.charCodeAt(0)-64));}
    for(const missing of ['A1','A2','A3','A12','B1','F1','G1','G12'])await expect(page.getByTestId('finale-cell-'+missing)).toHaveCount(0);
    const alpha=await page.locator('[data-testid="finale-board"]>canvas').evaluate((canvas:HTMLCanvasElement)=>[...canvas.getContext('2d')!.getImageData(40,canvas.height-40,1,1).data]);
    expect(alpha[3]).toBe(0);
    const headers={Authorization:`Bearer ${sessions.get(entry.id)!.token}`};
    const before=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    const attempt=await page.getByTestId('finale-battle').getAttribute('data-attempt-id');
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    await expect(page.getByTestId('finale-battle')).toHaveAttribute('data-attempt-id',attempt!);
    const actions=await playFinaleVisibleControls(page,info);
    await expect(page.getByRole('button',{name:'返回家园 →'})).toBeVisible();
    await expect(page.getByTestId('battle-supply-rewards')).toHaveCount(0);
    const state=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    expect(state.lastResult.outcome).toBe('won');expect('battleRewards' in state.lastResult).toBe(false);
    expect(state.inventory).toEqual(before.inventory);expect(state.currencies).toEqual(before.currencies);
    expect(state.cats).toEqual(before.cats);expect(state.furniture).toEqual(before.furniture);expect(state.flags).toEqual(before.flags);
    expect(state.pushTokens).toEqual(before.pushTokens);expect(state.eventState?.pendingModifiers).toEqual(before.eventState?.pendingModifiers);
    expect(state.completedStages).toContain('finale_boss');
    expect(commands.filter(type=>type==='START_BATTLE')).toHaveLength(1);
    expect(commands.filter(type=>type==='COMPLETE_BATTLE')).toHaveLength(1);expect(reports).toEqual([{leaks:0,bossDefeated:true,elitesDefeated:2}]);
    expect(actions.skills.length).toBeGreaterThanOrEqual(6);expect(actions.arrivals).toEqual(['controller','taotao','yinyin']);expect(actions.nightVision).toBe(true);expect(actions.dodges).toBeGreaterThan(0);
    await page.screenshot({path:info.outputPath(`l05-${entry.id}-won.png`),fullPage:true});
    await page.getByRole('button',{name:'返回家园 →'}).click();
    await expect(page.getByTestId('finale-enter')).toBeVisible();
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    expect((await(await request.get(origin+'/api/v1/state',{headers})).json()).inventory).toEqual(state.inventory);
    await info.attach('real-controls-result',{contentType:'application/json',body:JSON.stringify({difficulty:entry.id,...actions,commands,inventory:state.inventory})});
  });
}

test('L05 has no bag or item loadout, preserves pause/title and retreats to retry on a narrow screen',async({page,request},info)=>{
  test.setTimeout(90000);await openFixture(page,'retreat');
  await expect(page.getByRole('button',{name:'增加暖心罐罐'})).toHaveCount(0);
  await page.getByTestId('finale-enter').click();
  const headers={Authorization:`Bearer ${sessions.get('retreat')!.token}`};
  const entered=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(entered.inventory['warm-can']).toBe(4);expect(entered.inventory['bouncy-treat']).toBe(2);
  await expect(page.getByTestId('finale-bag')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/重新上阵/})).toHaveCount(0);
  await page.getByTestId('finale-play-toggle').click();
  // Pause verification observes the running energy clock without editing combat state.
  await expect.poll(async()=>Number(await page.getByTestId('finale-cat-guard').getAttribute('data-energy'))).toBeGreaterThan(10);
  await page.getByTestId('finale-advisor').click();
  await expect(page.getByTestId('finale-effective-speed')).toContainText('暂停');
  const pausedTime=await page.getByTestId('finale-battle').getAttribute('data-elapsed');
  const energy=await page.getByTestId('finale-cat-guard').getAttribute('data-energy');
  await page.waitForTimeout(500);
  expect(await page.getByTestId('finale-battle').getAttribute('data-elapsed')).toBe(pausedTime);
  expect(await page.getByTestId('finale-cat-guard').getAttribute('data-energy')).toBe(energy);
  await page.getByRole('button',{name:'收起聊天'}).click();
  await page.getByRole('button',{name:'返回标题',exact:true}).click();await page.getByRole('button',{name:'继续冒险'}).click();
  await expect(page.getByTestId('finale-battle')).toHaveAttribute('data-attempt-id',entered.activeBattle!.id);
  await page.getByTestId('finale-retreat').click();await page.getByTestId('finale-confirm-retreat').click();
  await expect(page.getByRole('button',{name:'调整防线，再试一次'})).toBeVisible();
  const ended=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(ended.lastResult.outcome).toBe('lost');expect('battleRewards' in ended.lastResult).toBe(false);
  expect(ended.inventory).toEqual(entered.inventory);
  await page.getByRole('button',{name:'调整防线，再试一次'}).click();
  await expect(page.getByTestId('finale-enter')).toBeVisible();
  const retry=await(await request.get(origin+'/api/v1/state',{headers})).json();
  expect(retry.phase).toBe('preparation');expect(retry.lastResult.stageId).toBe('finale_boss');
  await page.getByTestId('finale-enter').click();
  expect(await page.getByTestId('finale-battle').getAttribute('data-attempt-id')).not.toBe(entered.activeBattle!.id);
  const restarted=await(await request.get(origin+'/api/v1/state',{headers})).json();
  expect(restarted.activeBattle.modifiers).toEqual(entered.activeBattle!.modifiers);
  expect(restarted.activeBattle.stageId).toBe('finale_boss');
  await page.setViewportSize({width:390,height:844});
  if(await page.getByRole('button',{name:'查看全图',exact:true}).isVisible())await page.getByRole('button',{name:'查看全图',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.locator('.finale-cell')).toHaveCount(74);
  await page.getByTestId('finale-board').scrollIntoViewIfNeeded();
  expect(await page.getByTestId('finale-cell-D4').evaluate(cell=>{
    const bounds=cell.getBoundingClientRect();
    return cell.contains(document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2));
  })).toBe(true);
  await page.screenshot({path:info.outputPath('l05-mobile-ready.png'),fullPage:true});
});

test('L05 full-board view fits desktop and mobile, and still opens cat controls',async({page},info)=>{
  await openFixture(page,'layout');await page.getByTestId('finale-enter').click();
  for(const viewport of [{width:1440,height:1100},{width:1366,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    const overview=page.getByRole('button',{name:'查看全图',exact:true});if(await overview.isVisible())await overview.click();
    await page.getByTestId('finale-board').scrollIntoViewIfNeeded();
    await expect.poll(()=>page.getByTestId('finale-board').evaluate(board=>{
      const b=board.getBoundingClientRect(),panel=board.closest('.world-panel')!.getBoundingClientRect();
      return b.top>=Math.max(0,panel.top)-2&&b.bottom<=Math.min(innerHeight,panel.bottom)+2;
    })).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const cell of ['A11','D2','G11'])expect(await page.getByTestId('finale-cell-'+cell).evaluate(cell=>{const b=cell.getBoundingClientRect();return cell.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
    await page.screenshot({path:info.outputPath(`l05-fit-${viewport.width}-${viewport.height}.png`),fullPage:true});
    await page.getByTestId('finale-cat-momo').click();await expect(page.getByTestId('finale-skill-momo')).toBeVisible();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'放大战场',exact:true}).click();await expect(page.getByRole('button',{name:'查看全图',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'查看全图',exact:true}).click();
  }
});
