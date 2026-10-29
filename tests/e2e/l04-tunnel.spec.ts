import {expect, test, type Page} from '@playwright/test';
import {playVisibleControls} from './l04-battle';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {GameState, Session} from '../../web/src/contracts';

const port = 8164, origin = `http://127.0.0.1:${port}`;
const cases = [{id:'low',pressure:-1},{id:'medium',pressure:0},{id:'high',pressure:1},{id:'retreat',pressure:0},{id:'navigation',pressure:0},{id:'battle-route',pressure:0},{id:'story-entry',pressure:0}] as const;
const sessions = new Map<string,Session>();
let child:ChildProcess|undefined, closed:Promise<void>|undefined, directory='';
test.beforeAll(async({request})=>{
  await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const catalog=await (await request.get('/api/v1/content')).json();
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-l04-browser-'));
  const players:Record<string,unknown>={};
  for(const entry of cases){
    const session={playerId:`l04-${entry.id}`,token:`l04-browser-fixture-${entry.id}`};sessions.set(entry.id,session);
    const state:GameState={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:'alley',storyNodeId:'',mapId:'greenhouse',flags:['l00_completed','alley_rescued','rescue_story_done'],cats:['miaomiao','tuanzi','diandian'],inventory:{material:3,food:0,'warm-can':4,'bouncy-treat':2},currencies:{stamp:2},furniture:['cardboard_nest'],placements:{},completedStages:['l00_tutorial','alley_rescue'],pendingEventId:'',activeBattle:null,eventState:{pendingModifiers:{shadowPressure:entry.pressure,...(entry.id==='retreat'?{carry:'dog' as const}:{})}},lastResult:{message:'独立持久化浏览器夹具：序章已完成。'}};
    if(entry.id==='navigation'||entry.id==='battle-route'){
      state.chapterId='rescue';
      state.flags.push('chapter_4_started','greenhouse_fortified','lost_poster_found');
    }
    if(entry.id==='story-entry'){
      state.chapterId='greenhouse';
      state.flags.push('greenhouse_fortified');
    }
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
test('L04 navigation: Chapter 1 and Chapter 4 map entries select their real scenes and allow movement',async({page,request})=>{
  const headers={Authorization:`Bearer ${sessions.get('navigation')!.token}`},assets:string[]=[];
  page.on('response',response=>{if(response.url().includes('chapter4_L0_approved')&&response.ok())assets.push(response.url());});
  await openFixture(page,'navigation');
  await page.getByRole('button',{name:'章节地图'}).click();
  const map=page.getByRole('dialog',{name:'猫爪地图'});
  await map.getByRole('button',{name:'前往雨后小巷'}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,mapId:state.mapId,phase:state.phase}))).toEqual({chapterId:'alley',mapId:'alley',phase:'explore'});
  let canvas=page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-rendered-scene','rainy-alley');
  await expect(canvas).toHaveAttribute('data-map-id','alley');
  await page.getByRole('button',{name:'回到花房'}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>state.phase)).toBe('home');
  await page.getByRole('button',{name:/再去小巷走走/}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({mapId:state.mapId,phase:state.phase}))).toEqual({mapId:'alley',phase:'explore'});
  await expect(canvas).toHaveAttribute('data-rendered-scene','rainy-alley');
  await page.getByRole('button',{name:'回到花房'}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>state.phase)).toBe('home');
  await page.getByRole('button',{name:/前往地下暗道/}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,mapId:state.mapId,phase:state.phase}))).toEqual({chapterId:'rescue',mapId:'tunnel',phase:'explore'});
  canvas=page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-rendered-scene','chapter4-tunnel');
  await expect(canvas).toHaveAttribute('data-floor','L0');
  await page.getByRole('button',{name:'回到花房'}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>state.phase)).toBe('home');
  await page.getByRole('button',{name:'章节地图'}).click();
  await page.getByRole('dialog',{name:'猫爪地图'}).getByRole('button',{name:'前往地下通道'}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,mapId:state.mapId,phase:state.phase}))).toEqual({chapterId:'rescue',mapId:'tunnel',phase:'explore'});
  canvas=page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-rendered-scene','chapter4-tunnel');
  await expect(canvas).toHaveAttribute('data-map-id','tunnel');
  await expect(canvas).toHaveAttribute('data-phase','explore');
  await expect(canvas).toHaveAttribute('data-floor','L0');
  await expect.poll(()=>assets.some(asset=>asset.includes('chapter4_L0_approved'))).toBe(true);
  const start=Number(await canvas.getAttribute('data-player-x'));
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(800);await page.keyboard.up('ArrowRight');
  await expect.poll(async()=>Number(await canvas.getAttribute('data-player-x'))).toBeGreaterThan(start+20);
  const state=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(state.activeBattle).toBeNull();
});

test('L04 battle trial: the standalone button enters only the tunnel_boss battle',async({page,request})=>{
  await openFixture(page,'battle-route');
  await page.getByTestId('tunnel-enter').click();
  const headers={Authorization:`Bearer ${sessions.get('battle-route')!.token}`};
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,phase:state.phase,mapId:state.mapId,stageId:state.activeBattle?.stageId}))).toEqual({chapterId:'rescue',phase:'battle',mapId:'greenhouse',stageId:'tunnel_boss'});
  await expect(page.getByTestId('tunnel-battle')).toHaveAttribute('data-scene','tunnel');
});

test('L04 story entry: the Chapter 4 Home action begins its authored introduction',async({page,request})=>{
  const headers={Authorization:`Bearer ${sessions.get('story-entry')!.token}`};
  await openFixture(page,'story-entry');
  await page.getByRole('button',{name:/启程：第四章/}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,phase:state.phase,storyNodeId:state.storyNodeId}))).toEqual({chapterId:'rescue',phase:'dialogue',storyNodeId:'rescue_intro_1'});
});

for(const entry of cases.filter(value=>!['retreat','navigation','battle-route','story-entry'].includes(value.id))){
  test(`L04 ${entry.id}: real six-cat controls finish eight waves and a boss without changing item inventory`,async({page,request},info)=>{
    // 全量套件串行跑到这里时浏览器累积负载会拖慢战斗快照查询,6s 会饿死 evaluate;放宽一倍防抖。
    test.setTimeout(300000);page.setDefaultTimeout(12000);
    await openFixture(page,entry.id);
    const commands:string[]=[];page.on('request',req=>{if(req.url()===origin+'/api/v1/commands'&&req.method()==='POST')commands.push(req.postDataJSON().command.type);});
    await page.getByTestId('tunnel-enter').click();
    await expect(page.getByTestId('tunnel-battle')).toHaveAttribute('data-phase','ready');
    await expect(page.locator('[data-testid^="tunnel-cat-"][data-status]')).toHaveCount(6);
    await expect(page.locator('.tunnel-roster,.chapter-roster,.btl-party')).toHaveCount(0);
    await expect(page.locator('.tunnel-cell')).toHaveCount(37);
    await expect(page.getByTestId('tunnel-boss-health')).toHaveAttribute('aria-valuemax',String(Math.round(3400*(entry.pressure===-1?.8:entry.pressure===1?1.2:1))));
    await expect(page.getByTestId('tunnel-cell-B2')).toHaveAttribute('data-deployable','false');
    await expect(page.getByTestId('tunnel-cell-A1')).toHaveAttribute('data-deployable','true');
    await page.screenshot({path:info.outputPath('l04-ready.png'),fullPage:true});
    for(const spawn of ['A2','B8','D8']){
      await expect(page.getByTestId(`tunnel-cell-${spawn}`)).toHaveAttribute('data-spawn','true');
      await expect(page.getByTestId(`tunnel-cell-${spawn}`)).toHaveAttribute('data-deployable','false');
    }
    for(const cell of ['C6','C7','D6','D7']){
      await expect(page.getByTestId(`tunnel-cell-${cell}`)).toHaveAttribute('data-boss-footprint','true');
      await expect(page.getByTestId(`tunnel-cell-${cell}`)).toHaveAttribute('data-deployable','false');
    }
    const expected=[...['A','B','C','D'].flatMap(row=>Array.from({length:8},(_,i)=>row+(i+1))), 'E4','E5','E6','E7','E8'];
    const coordinates=await page.locator('.tunnel-cell').evaluateAll(cells=>cells.map(cell=>({name:cell.getAttribute('data-testid')!.replace('tunnel-cell-',''),column:getComputedStyle(cell).gridColumnStart,row:getComputedStyle(cell).gridRowStart})));
    expect(coordinates.map(cell=>cell.name).sort()).toEqual(expected.sort());
    for(const cell of coordinates){expect(cell.column).toBe(cell.name.slice(1));expect(cell.row).toBe(String(cell.name.charCodeAt(0)-64));}
    for(const missing of ['E1','E2','E3','F1'])await expect(page.getByTestId('tunnel-cell-'+missing)).toHaveCount(0);
    const alpha=await page.locator('[data-testid="tunnel-board"]>canvas').evaluate((canvas:HTMLCanvasElement)=>[...canvas.getContext('2d')!.getImageData(40,canvas.height-40,1,1).data]);
    expect(alpha[3]).toBe(0);
    const headers={Authorization:`Bearer ${sessions.get(entry.id)!.token}`};
    const before=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    const attempt=await page.getByTestId('tunnel-battle').getAttribute('data-attempt-id');
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    await expect(page.getByTestId('tunnel-battle')).toHaveAttribute('data-attempt-id',attempt!);
    const actions=await playVisibleControls(page,info);
    await expect(page.getByRole('button',{name:'返回家园 →'})).toBeVisible();
    await expect(page.getByTestId('battle-supply-rewards')).toHaveCount(0);
    const state=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    expect(state.lastResult.outcome).toBe('won');expect('battleRewards' in state.lastResult).toBe(false);
    expect(state.inventory).toEqual(before.inventory);expect(state.currencies).toEqual(before.currencies);
    expect(state.cats).toEqual(before.cats);expect(state.furniture).toEqual(before.furniture);expect(state.flags).toEqual(before.flags);
    expect(state.pushTokens).toEqual(before.pushTokens);expect(state.eventState?.pendingModifiers).toEqual(before.eventState?.pendingModifiers);
    expect(state.completedStages).toContain('tunnel_boss');
    expect(commands.filter(type=>type==='START_BATTLE')).toHaveLength(1);
    expect(commands.filter(type=>type==='COMPLETE_BATTLE')).toHaveLength(1);
    expect(actions.skills.length).toBeGreaterThanOrEqual(6);expect(actions.observedBlackout).toBe(true);expect(actions.restoredNightVision).toBe(true);
    await page.screenshot({path:info.outputPath(`l04-${entry.id}-won.png`),fullPage:true});
    await page.getByRole('button',{name:'返回家园 →'}).click();
    await expect(page.getByTestId('tunnel-enter')).toBeVisible();
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    expect((await(await request.get(origin+'/api/v1/state',{headers})).json()).inventory).toEqual(state.inventory);
    await info.attach('real-controls-result',{contentType:'application/json',body:JSON.stringify({difficulty:entry.id,...actions,commands,inventory:state.inventory})});
  });
}

test('L04 has no bag or item loadout, preserves pause/title and retreats to retry on a narrow screen',async({page,request},info)=>{
  test.setTimeout(90000);await openFixture(page,'retreat');
  await expect(page.getByRole('button',{name:'增加暖心罐罐'})).toHaveCount(0);
  await page.getByTestId('tunnel-enter').click();
  const headers={Authorization:`Bearer ${sessions.get('retreat')!.token}`};
  const entered=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(entered.inventory['warm-can']).toBe(4);expect(entered.inventory['bouncy-treat']).toBe(2);
  await expect(page.getByTestId('tunnel-bag')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/重新上阵/})).toHaveCount(0);
  await page.getByTestId('tunnel-play-toggle').click();
  // The short pipe lane deliberately starts at 8 seconds; pause verification needs a running clock, not early damage.
  await expect.poll(async()=>Number(await page.getByTestId('tunnel-cat-guard').getAttribute('data-energy'))).toBeGreaterThan(10);
  await page.getByTestId('tunnel-advisor').click();
  await expect(page.getByTestId('tunnel-effective-speed')).toContainText('暂停');
  const pausedTime=await page.getByTestId('tunnel-battle').getAttribute('data-elapsed');
  const energy=await page.getByTestId('tunnel-cat-guard').getAttribute('data-energy');
  await page.waitForTimeout(500);
  expect(await page.getByTestId('tunnel-battle').getAttribute('data-elapsed')).toBe(pausedTime);
  expect(await page.getByTestId('tunnel-cat-guard').getAttribute('data-energy')).toBe(energy);
  await page.getByRole('button',{name:'收起聊天'}).click();
  await page.getByRole('button',{name:'返回标题',exact:true}).click();await page.getByRole('button',{name:'继续冒险'}).click();
  await expect(page.getByTestId('tunnel-battle')).toHaveAttribute('data-attempt-id',entered.activeBattle!.id);
  await page.getByTestId('tunnel-retreat').click();await page.getByTestId('tunnel-confirm-retreat').click();
  await expect(page.getByRole('button',{name:'调整防线，再试一次'})).toBeVisible();
  const ended=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(ended.lastResult.outcome).toBe('lost');expect('battleRewards' in ended.lastResult).toBe(false);
  expect(ended.inventory).toEqual(entered.inventory);
  await page.getByRole('button',{name:'调整防线，再试一次'}).click();
  await expect(page.getByTestId('tunnel-enter')).toBeVisible();
  const retry=await(await request.get(origin+'/api/v1/state',{headers})).json();
  expect(retry.phase).toBe('preparation');expect(retry.lastResult.stageId).toBe('tunnel_boss');
  await page.getByTestId('tunnel-enter').click();
  expect(await page.getByTestId('tunnel-battle').getAttribute('data-attempt-id')).not.toBe(entered.activeBattle!.id);
  const restarted=await(await request.get(origin+'/api/v1/state',{headers})).json();
  expect(restarted.activeBattle.modifiers).toEqual(entered.activeBattle!.modifiers);
  expect(restarted.activeBattle.stageId).toBe('tunnel_boss');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'查看全图',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.locator('.tunnel-cell')).toHaveCount(37);
  await page.getByTestId('tunnel-board').scrollIntoViewIfNeeded();
  expect(await page.getByTestId('tunnel-cell-E4').evaluate(cell=>{
    const bounds=cell.getBoundingClientRect();
    return cell.contains(document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2));
  })).toBe(true);
  await page.screenshot({path:info.outputPath('l04-mobile-ready.png'),fullPage:true});
});
