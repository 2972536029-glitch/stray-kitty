import {expect, test, type Page} from '@playwright/test';
import {playVisibleControls} from './l02-battle';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {GameState, Session} from '../../web/src/contracts';

const port = 8158, origin = `http://127.0.0.1:${port}`;
const cases = [{id:'low',pressure:-1},{id:'medium',pressure:0},{id:'high',pressure:1},{id:'retreat',pressure:0},{id:'navigation',pressure:0},{id:'home-route',pressure:0},{id:'qa-route',pressure:0},{id:'story-entry',pressure:0},{id:'battle-route',pressure:0}] as const;
const sessions = new Map<string,Session>();
let child:ChildProcess|undefined, closed:Promise<void>|undefined, directory='';
test.beforeAll(async({request})=>{
  await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const catalog=await (await request.get('/api/v1/content')).json();
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-l02-browser-'));
  const players:Record<string,unknown>={};
  for(const entry of cases){
    const session={playerId:`l02-${entry.id}`,token:`l02-browser-fixture-${entry.id}`};sessions.set(entry.id,session);
    const navigation=entry.id==='navigation'||entry.id==='home-route'||entry.id==='qa-route'||entry.id==='battle-route';
    const state:GameState={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:navigation?'market':'alley',storyNodeId:'',mapId:navigation?'alley':'greenhouse',flags:['l00_completed','alley_rescued','rescue_story_done',...(navigation?['chapter_2_started']:[])],cats:['miaomiao','tuanzi','diandian'],inventory:{material:3,food:0,'warm-can':4,'bouncy-treat':2},currencies:{stamp:2},furniture:['cardboard_nest'],placements:{},completedStages:['l00_tutorial','alley_rescue'],pendingEventId:'',activeBattle:null,eventState:{pendingModifiers:{shadowPressure:entry.pressure}},lastResult:{message:'独立持久化浏览器夹具：序章已完成。'}};
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
test('L02 navigation: World Map opens the rendered Night Market without bypassing its battle-gated exit',async({page,request})=>{
  const headers={Authorization:`Bearer ${sessions.get('navigation')!.token}`},assets:string[]=[];
  page.on('response',response=>{if(response.url().includes('night_market_L0_streets_1672x941')&&response.ok())assets.push(response.url());});
  await openFixture(page,'navigation');
  await page.getByRole('button',{name:'章节地图'}).click();
  const map=page.getByRole('dialog',{name:'猫爪地图'});
  await map.getByRole('button',{name:'前往午夜集市'}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,mapId:state.mapId,phase:state.phase}))).toEqual({chapterId:'market',mapId:'market',phase:'explore'});
  const canvas=page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-rendered-scene','night-market');
  await expect(canvas).toHaveAttribute('data-map-id','market');
  await expect(canvas).toHaveAttribute('data-phase','explore');
  await expect(canvas).toHaveAttribute('data-floor','L0');
  await expect.poll(()=>assets.some(asset=>asset.includes('night_market_L0_streets_1672x941'))).toBe(true);
  await expect(page.getByRole('button',{name:'回到花房'})).toHaveCount(0);
  expect((await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState).activeBattle).toBeNull();
});

test('L02 home action: Chapter 2 opens the interactive Night Market and movement works',async({page,request})=>{
  const headers={Authorization:`Bearer ${sessions.get('home-route')!.token}`},assets:string[]=[];
  page.on('response',response=>{if(response.url().includes('night_market_L0_streets_1672x941')&&response.ok())assets.push(response.url());});
  await openFixture(page,'home-route');
  await page.getByRole('button',{name:/前往午夜集市/}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,mapId:state.mapId,phase:state.phase}))).toEqual({chapterId:'market',mapId:'market',phase:'explore'});
  const canvas=page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-rendered-scene','night-market');
  await expect(canvas).toHaveAttribute('data-map-id','market');
  await expect(canvas).toHaveAttribute('data-phase','explore');
  await expect(canvas).toHaveAttribute('data-floor','L0');
  await expect.poll(()=>assets.some(asset=>asset.includes('night_market_L0_streets_1672x941'))).toBe(true);
  const start=Number(await canvas.getAttribute('data-player-x'));
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(1500);await page.keyboard.up('ArrowRight');
  await expect.poll(async()=>Number(await canvas.getAttribute('data-player-x'))).toBeGreaterThan(start+20);
  const state=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(state.activeBattle).toBeNull();
  await expect(page.getByRole('button',{name:'回到花房'})).toHaveCount(0);
});

test('L02 acceptance shortcut: the flow panel opens Night Market exploration without a battle',async({page,request})=>{
  const headers={Authorization:`Bearer ${sessions.get('qa-route')!.token}`};
  await openFixture(page,'qa-route');
  await expect(page.getByRole('button',{name:'验收工具'})).toBeVisible();
  await page.getByRole('button',{name:'验收工具'}).click();
  await page.getByTestId('qa-chapter-market').click();
  await page.getByTestId('dev-enter-market-exploration').click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,mapId:state.mapId,phase:state.phase}))).toEqual({chapterId:'market',mapId:'market',phase:'explore'});
  const canvas=page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-rendered-scene','night-market');
  await expect(canvas).toHaveAttribute('data-floor','L0');
  expect((await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState).activeBattle).toBeNull();
});

test('L02 story entry: the normal Chapter 2 action begins its authored introduction',async({page,request})=>{
  const headers={Authorization:`Bearer ${sessions.get('story-entry')!.token}`};
  await openFixture(page,'story-entry');
  await page.getByRole('button',{name:/启程：第二章/}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,phase:state.phase,storyNodeId:state.storyNodeId}))).toEqual({chapterId:'market',phase:'dialogue',storyNodeId:'market_intro_1'});
  await expect(page.getByRole('button',{name:/继续/})).toBeVisible();
});

test('L02 battle trial: the standalone battle button enters only the market_boss battle',async({page,request})=>{
  const headers={Authorization:`Bearer ${sessions.get('battle-route')!.token}`};
  await openFixture(page,'battle-route');
  await page.getByTestId('market-battle-trial-enter').click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(current=>({chapterId:current.chapterId,phase:current.phase,mapId:current.mapId,stageId:current.activeBattle?.stageId}))).toEqual({chapterId:'market',phase:'battle',mapId:'alley',stageId:'market_boss'});
  await expect(page.getByTestId('market-battle')).toHaveAttribute('data-scene','market');
});

for(const entry of cases.filter(value=>!['retreat','navigation','home-route','qa-route','story-entry','battle-route'].includes(value.id))){
  test(`L02 ${entry.id}: real six-cat controls finish eight waves and a boss without changing item inventory`,async({page,request},info)=>{
    // 全量套件串行跑到这里时浏览器累积负载会拖慢战斗快照查询,6s 会饿死 evaluate;放宽一倍防抖。
    test.setTimeout(240000);page.setDefaultTimeout(12000);
    await openFixture(page,entry.id);
    const commands:string[]=[];page.on('request',req=>{if(req.url()===origin+'/api/v1/commands'&&req.method()==='POST')commands.push(req.postDataJSON().command.type);});
    await page.getByTestId('market-battle-trial-enter').click();
    await expect(page.getByTestId('market-battle')).toHaveAttribute('data-phase','ready');
    await expect(page.locator('[data-testid^="market-cat-"][data-status]')).toHaveCount(6);
    await expect(page.locator('.market-roster,.chapter-roster,.btl-party')).toHaveCount(0);
    await expect(page.locator('.market-cell')).toHaveCount(40);
    await expect(page.getByTestId('market-boss-health')).toHaveAttribute('aria-valuemax',String(Math.round(1800*(entry.pressure===-1?.8:entry.pressure===1?1.2:1))));
    await expect(page.getByTestId('market-cell-A1')).toHaveAttribute('data-deployable','false');
    for(const spawn of ['A4','A5','B8','C8','D8','E4','E5']){
      await expect(page.getByTestId(`market-cell-${spawn}`)).toHaveAttribute('data-spawn','true');
      await expect(page.getByTestId(`market-cell-${spawn}`)).toHaveAttribute('data-deployable','false');
    }
    for(const cell of ['C7']){
      await expect(page.getByTestId(`market-cell-${cell}`)).toHaveAttribute('data-boss-footprint','true');
      await expect(page.getByTestId(`market-cell-${cell}`)).toHaveAttribute('data-deployable','false');
    }
    const headers={Authorization:`Bearer ${sessions.get(entry.id)!.token}`};
    const before=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    const attempt=await page.getByTestId('market-battle').getAttribute('data-attempt-id');
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    await expect(page.getByTestId('market-battle')).toHaveAttribute('data-attempt-id',attempt!);
    const actions=await playVisibleControls(page);
    await expect(page.getByRole('button',{name:'返回家园 →'})).toBeVisible();
    await expect(page.getByTestId('battle-supply-rewards')).toHaveCount(0);
    const state=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    expect(state.lastResult.outcome).toBe('won');expect('battleRewards' in state.lastResult).toBe(false);
    expect(state.inventory).toEqual(before.inventory);expect(state.currencies).toEqual(before.currencies);
    expect(state.cats).toEqual(before.cats);expect(state.furniture).toEqual(before.furniture);expect(state.flags).toEqual(before.flags);
    expect(state.pushTokens).toEqual(before.pushTokens);expect(state.eventState?.pendingModifiers).toEqual(before.eventState?.pendingModifiers);
    expect(state.completedStages).toContain('market_boss');
    expect(commands.filter(type=>type==='START_BATTLE')).toHaveLength(1);
    expect(commands.filter(type=>type==='COMPLETE_BATTLE')).toHaveLength(1);
    expect(actions.skills.length).toBeGreaterThanOrEqual(6);expect(actions.dodges).toBeGreaterThan(0);
    await page.screenshot({path:info.outputPath(`l02-${entry.id}-won.png`),fullPage:true});
    await page.getByRole('button',{name:'返回家园 →'}).click();
    await expect(page.getByTestId('market-battle-trial-enter')).toBeVisible();
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    expect((await(await request.get(origin+'/api/v1/state',{headers})).json()).inventory).toEqual(state.inventory);
    await info.attach('real-controls-result',{contentType:'application/json',body:JSON.stringify({difficulty:entry.id,...actions,commands,inventory:state.inventory})});
  });
}

test('L02 has no bag or item loadout, preserves pause/title and retreats to retry on a narrow screen',async({page,request},info)=>{
  test.setTimeout(90000);await openFixture(page,'retreat');
  await expect(page.getByRole('button',{name:'增加暖心罐罐'})).toHaveCount(0);
  await page.getByTestId('market-battle-trial-enter').click();
  const headers={Authorization:`Bearer ${sessions.get('retreat')!.token}`};
  const entered=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(entered.inventory['warm-can']).toBe(4);expect(entered.inventory['bouncy-treat']).toBe(2);
  await expect(page.getByTestId('market-bag')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/重新上阵/})).toHaveCount(0);
  await page.getByTestId('market-play-toggle').click();
  await expect.poll(async()=>Number(await page.getByTestId('market-cat-tuanzi').getAttribute('data-hp'))).toBeLessThan(220);
  await page.getByTestId('market-advisor').click();
  await expect(page.getByTestId('market-effective-speed')).toContainText('暂停');
  const pausedTime=await page.getByTestId('market-battle').getAttribute('data-elapsed');
  const energy=await page.getByTestId('market-cat-guard').getAttribute('data-energy');
  await page.waitForTimeout(500);
  expect(await page.getByTestId('market-battle').getAttribute('data-elapsed')).toBe(pausedTime);
  expect(await page.getByTestId('market-cat-guard').getAttribute('data-energy')).toBe(energy);
  await page.getByRole('button',{name:'收起聊天'}).click();
  await page.getByRole('button',{name:'返回标题',exact:true}).click();await page.getByRole('button',{name:'继续冒险'}).click();
  await expect(page.getByTestId('market-battle')).toHaveAttribute('data-attempt-id',entered.activeBattle!.id);
  await page.getByTestId('market-retreat').click();await page.getByTestId('market-confirm-retreat').click();
  await expect(page.getByRole('button',{name:'调整防线，再试一次'})).toBeVisible();
  const ended=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(ended.lastResult.outcome).toBe('lost');expect('battleRewards' in ended.lastResult).toBe(false);
  expect(ended.inventory).toEqual(entered.inventory);
  await page.getByRole('button',{name:'调整防线，再试一次'}).click();
  await expect(page.getByTestId('market-battle-trial-enter')).toBeVisible();
  const retry=await(await request.get(origin+'/api/v1/state',{headers})).json();
  expect(retry.phase).toBe('preparation');expect(retry.lastResult.stageId).toBe('market_boss');
  await page.getByTestId('market-battle-trial-enter').click();
  expect(await page.getByTestId('market-battle').getAttribute('data-attempt-id')).not.toBe(entered.activeBattle!.id);
  const restarted=await(await request.get(origin+'/api/v1/state',{headers})).json();
  expect(restarted.activeBattle.modifiers).toEqual(entered.activeBattle!.modifiers);
  expect(restarted.activeBattle.stageId).toBe('market_boss');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.locator('.market-cell')).toHaveCount(40);
  await page.screenshot({path:info.outputPath('l02-mobile-ready.png'),fullPage:true});
});
