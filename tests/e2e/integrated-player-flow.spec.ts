import {test, expect, type Page} from '@playwright/test';
import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import type {GameState} from '../../web/src/contracts';
import {findPath, sweepMove, type CollisionField} from '../../web/src/modules/rainyAlley/collision';
import {rainyAlleyFieldClosed, rainyAlleyFieldOpen, CRATE_CLIMBS} from '../../web/src/modules/rainyAlley/runtimeGeometry';
import {rainyAlleyMapData} from '../../web/src/modules/rainyAlley/mapData';
import {isMarketTraversable, nearestMarketPosition, sweepMarketMove, marketPortals, type MarketFloor} from '../../web/src/modules/nightMarket/map';
import {tunnelClimbSurface, tunnelGroundMask} from '../../web/src/modules/chapter4/surfaces';
import tunnelData from '../../level_design/chapter4/data/chapter4.map.json' with { type: 'json' };

const root = process.cwd(), origin = 'http://127.0.0.1:8179';
const catalog = JSON.parse(fs.readFileSync('server/internal/platform/catalog.json', 'utf8'));
const allFlags = ['l00_completed','alley_rescued','rescue_story_done','lost_poster_found','chapter_2_started','market_cleared','market_exit_crossed','chapter_3_started','momo_joined','greenhouse_fortified','chapter_4_started','tunnel_unlocked','tunnel_explored','cats_rescued_batch1'];
let child: ChildProcess, closed: Promise<void>;
const rows: object[] = [];
const assets = new Set<string>();
const zoneChecks = new Set<string>();
const moveProbes=new WeakMap<CollisionField,(p:Point,d:Point)=>Point>();
let lastAction='';
function fixture(): GameState {
  return {schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:'rescue',mapId:'greenhouse',storyNodeId:'rescue_intro_1',flags:[...allFlags],cats:['miaomiao','tuanzi','diandian','momo'],inventory:{material:10,food:0,clue:3},currencies:{stamp:2},furniture:['cardboard_nest'],placements:{},completedStages:['l00_tutorial','alley_rescue'],pendingEventId:'',activeBattle:null,lastResult:{message:'Isolated navigation fixture'}};
}
test.beforeAll(async({request}) => {
  await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(8179,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'kitty-integrated-flow-'));
  const players: Record<string,unknown> = {};
  for (let i=0;i<105;i++) {
    const state = fixture();
    if(i===1) state.flags=state.flags.filter(f=>f!=='market_cleared');
    if(i===80) state.flags=state.flags.filter(f=>f!=='chapter_2_started');
    if(i===81) state.flags=state.flags.filter(f=>f!=='chapter_3_started');
    if(i===82) state.flags=state.flags.filter(f=>f!=='chapter_4_started');
    if(i===83) state.flags.push('finale_started','finale_completed');
    if(i===84) {state.flags=['alley_rescued','lost_poster_found','rescue_story_done'];state.chapterId='alley';}
    if(i===85||i===87) state.inventory.clue=2;
    if(i===86) {state.phase='preparation';state.chapterId='market';state.mapId='market';state.storyNodeId='';}
    if(i===88){state.phase='dialogue';state.chapterId='alley';state.mapId='alley';state.storyNodeId='event_forced_chase';state.eventState={pendingModifiers:{shadowPressure:1},lastResolution:{eventId:'moving_sack_event',optionId:'rush_untie',dice:[1,1],tier:'fail',outcome:{text:'Isolated failed random encounter',situation:{kind:'forced_chase',storyNodeId:'event_forced_chase'}}}};}
    if(i>=90&&i<=93){const stage=['market_boss','greenhouse_boss','tunnel_boss','finale_boss'][i-90];state.phase='settlement';state.activeBattle={id:`lost-${i}`,stageId:stage,status:'lost'};state.lastResult={stageId:stage,outcome:'lost',message:'Isolated retry navigation fixture'};}
    if(i===95){state.phase='explore';state.chapterId='market';state.mapId='market';state.storyNodeId='';state.flags=state.flags.filter(f=>f!=='market_exit_crossed');}
    if(i===96){state.phase='explore';state.chapterId='rescue';state.mapId='tunnel';state.storyNodeId='';state.flags=state.flags.filter(f=>!['tunnel_explored','cats_rescued_batch1'].includes(f));state.flags.push('tunnel_false_kitten_trap_found','valve_three_investigated');}
    if(i===97||i===98){const stage=i===97?'alley_rescue':'l00_tutorial';state.phase='settlement';state.activeBattle={id:`lost-${i}`,stageId:stage,status:'lost'};state.lastResult={stageId:stage,outcome:'lost',message:'Isolated first-chapter/tutorial retry fixture'};}
    if(i===100){state.chapterId='market';state.mapId='market';state.storyNodeId='';state.cats=['miaomiao','tuanzi','diandian'];state.flags=['l00_completed','alley_rescued','lost_poster_found','rescue_story_done','chapter_2_started','market_cleared','market_exit_crossed'];}
    if(i===101||i===102){state.mapId='market';state.flags.push('greenhouse_sealed','greenhouse_fortified_full');}
    if(i===103){state.chapterId='alley';state.storyNodeId='';state.cats=['miaomiao','tuanzi','diandian'];state.flags=['alley_rescued','lost_poster_found','rescue_story_done','market_crow_clue_completed','market_pigeon_clue_completed'];state.inventory.clue=2;}
    if(i===104){state.phase='dialogue';state.chapterId='greenhouse';state.mapId='greenhouse';state.storyNodeId='greenhouse_intro_1';state.cats=['miaomiao','tuanzi','diandian'];state.flags=['l00_completed','alley_rescued','lost_poster_found','rescue_story_done','chapter_2_started','market_cleared','market_exit_crossed','chapter_3_started'];}
    players[createHash('sha256').update(`integrated-player-flow-${i}`).digest('hex')]={id:`fixture-${i}`,state,receipts:{},receiptOrder:[]};
  }
  const save=path.join(directory,'save.json');fs.writeFileSync(save,JSON.stringify({schemaVersion:1,players}));
  const binary=path.join(root,'.runtime','kitty-integrated-flow.exe');
  const build=spawnSync('go',['build','-o',binary,'./cmd/api'],{cwd:path.join(root,'server'),encoding:'utf8'});
  if(build.status!==0)throw new Error(build.stderr);
  child=spawn(binary,[],{cwd:path.join(root,'server'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GAME_ADDR:'127.0.0.1:8179',GAME_DATA_FILE:save,GAME_QA_ENABLED:'true',GAME_WEB_DIR:path.join(root,'web/dist')}});
  closed=new Promise(resolve=>child.once('close',()=>resolve()));
  let output='';child.stderr?.on('data',chunk=>output+=chunk);child.stdout?.on('data',()=>{});
  await expect.poll(async()=>{if(child.exitCode!==null)throw new Error(output);try{return(await request.get('/healthz')).ok();}catch{return false;}}).toBe(true);
});
test.afterAll(async()=>{
  fs.mkdirSync('output/player-flow',{recursive:true});fs.writeFileSync('output/player-flow/navigation.json',JSON.stringify({application:{pid:child?.pid,origin,branch:spawnSync('git',['branch','--show-current'],{encoding:'utf8'}).stdout.trim()},rows,assets:[...assets],zoneChecks:[...zoneChecks]},null,2));
  if(child){child.kill('SIGTERM');await closed;}
});
test.beforeEach(async({page})=>{
  page.setDefaultTimeout(10000);
  await page.addInitScript(()=>{
    const original=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args:Parameters<typeof original>){
      const image=args[0];
      if(this.canvas instanceof HTMLCanvasElement && this.canvas.closest('[data-renderer="canvas2d"]') && image instanceof HTMLImageElement)this.canvas.dataset.paintedImage=image.src;
      return Reflect.apply(original,this,args);
    };
  });
  page.on('response',r=>{if(r.ok()&&/\.(png|svg)(\?|$)/.test(r.url()))assets.add(r.url().replace(origin,''));});
  page.on('response',r=>{if(r.ok()&&r.url().endsWith('/commands')&&r.request().method()==='POST'){const command=r.request().postDataJSON()?.command;if(command?.type==='CHECK_RANDOM_ZONE')zoneChecks.add(command.zoneId);}});
  page.on('pageerror',e=>{throw e;});
});
async function open(page:Page,id:number) {
  await page.goto('/');
  await expect(page.locator('.start-play')).toBeEnabled();
  await page.evaluate(id=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify({playerId:`fixture-${id}`,token:`integrated-player-flow-${id}`})),id);
  await page.reload();await page.getByRole('button',{name:/继续冒险|开始冒险/}).click();
}
async function state(page:Page):Promise<GameState> {
  return page.evaluate(async()=>{const session=JSON.parse(localStorage.getItem('stray-kitty.session.v1')!);return(await fetch('/api/v1/state',{signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${session.token}`}})).json();});
}
async function click(page:Page,name:string|RegExp) {
  lastAction=typeof name==='string'?name:name.source;
  await page.getByRole('button',{name}).click();
  await page.waitForTimeout(100);
}
async function dialogue(page:Page) {
  for(let n=0;n<40;n++) {
    if((await state(page)).phase!=='dialogue')return;
    await Promise.all([page.waitForResponse(r=>r.url().endsWith('/commands')&&r.request().method()==='POST'),click(page,'继续故事')]);
    if((await state(page)).phase==='dialogue')await expect(page.getByRole('button',{name:'继续故事'})).toBeEnabled();
  }
  throw new Error('Dialogue did not terminate');
}
const canvas=(page:Page)=>page.locator('[data-renderer="canvas2d"] canvas');
async function position(page:Page) {return canvas(page).evaluate(el=>({x:Number((el as HTMLElement).dataset.playerX),y:Number((el as HTMLElement).dataset.playerY)}));}
async function checkScene(page:Page,map:string,move=false,button=lastAction) {
  const scene={alley:'rainy-alley',market:'night-market',tunnel:'chapter4-tunnel'}[map]!;
  await expect(canvas(page)).toHaveAttribute('data-rendered-scene',scene);
  await expect(canvas(page)).toHaveAttribute('data-floor','L0');
  await expect(canvas(page)).toHaveAttribute('data-painted-image',new RegExp({alley:'rainy_alley_background',market:'night_market_L0',tunnel:'chapter4_L0_approved'}[map]!));
  const s=await state(page);expect({chapter:s.chapterId,map:s.mapId,phase:s.phase,battle:s.activeBattle,story:s.storyNodeId}).toEqual({chapter:map==='tunnel'?'rescue':map,map,phase:'explore',battle:null,story:''});
  if(move) {const p=await position(page);await page.keyboard.down('ArrowRight');await page.waitForTimeout(500);await page.keyboard.up('ArrowRight');expect(Math.hypot((await position(page)).x-p.x,(await position(page)).y-p.y)).toBeGreaterThan(10);}
  rows.push({button,expected:map,scene,art:await canvas(page).getAttribute('data-painted-image'),state:s,result:'pass'});
}
async function flowRow(page:Page,stage:string,trigger:string,required:string) {
  rows.push({stage,trigger,required,state:await state(page),result:'pass'});
  console.log(`Player flow verified: ${stage}`);
}
test('A: registry mounts integrated Alley, Market and Tunnel, loads artwork and moves',async({page})=>{
  for(const [i,map,label,spawnPoint] of [[0,'alley','进入第一章试玩',{x:111,y:626}],[1,'market','进入第二章试玩',{x:670,y:781}],[2,'tunnel','进入第四章试玩',{x:845,y:135}]] as const){
    await open(page,i);await click(page,new RegExp(label));
    await checkScene(page,map);const p=await position(page);expect(Math.hypot(p.x-spawnPoint.x,p.y-spawnPoint.y)).toBeLessThan(12);
    await checkScene(page,map,true);await page.screenshot({path:`output/player-flow/registry-${map}.png`});
  }
  for(const part of ['rainy_alley_background','night_market_L0','night_market_L1','night_market_Lminus1','chapter4_L0_approved','chapter4_Lminus1','chapter4_L0_walkable','chapter4_Lminus1_walkable'])expect([...assets].some(a=>a.includes(part)),part).toBe(true);
});

test('H: Tunnel smoke — movement, event retry and reversible lower-floor stairs',async({page})=>{
  test.setTimeout(120000);
  await page.addInitScript(()=>{
    const texts=new Set<string>();
    (window as unknown as {tunnelSmokeTexts:Set<string>}).tunnelSmokeTexts=texts;
    const fillText=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(...args:Parameters<typeof fillText>){texts.add(args[0]);return Reflect.apply(fillText,this,args);};
  });
  await open(page,94);await click(page,/进入第四章试玩/);await checkScene(page,'tunnel',true);
  await page.screenshot({path:'output/player-flow/tunnel-signs-entry.png'});
  const fields=await tunnelFields(page);
  const walk=async(target:Endpoint)=>{
    const flags=(await state(page)).flags;
    const links=tunnelData.portals.filter(link=>link.key!=='F'||flags.includes('tunnel_false_kitten_trap_found'));
    await traverse(page,plan(fields,{...await position(page),layer:(await canvas(page).getAttribute('data-floor'))!},target,links,flags),142);
  };
  await walk({x:402,y:239,layer:'L0'});
  // One failed fetch must remain safely retryable, then open the real event card.
  let interrupted=false;
  const keys:string[]=[];
  await page.route('**/api/v1/commands',route=>{
    if(route.request().postDataJSON()?.command?.type==='INTERACT') {
      keys.push(route.request().headers()['idempotency-key']);
      if(!interrupted){interrupted=true;return route.abort('failed');}
    }
    return route.continue();
  });
  await page.keyboard.press('e');await expect(page.getByRole('alert')).toContainText('无法连接游戏服务');
  await click(page,'重试上次操作');await expect(page.locator('.choice-list button').first()).toBeVisible();
  expect(keys.length).toBe(2);expect(keys[0]).toBe(keys[1]);
  await event(page);expect((await state(page)).flags).toContain('tunnel_false_kitten_trap_found');
  await walk({x:320,y:422,layer:'L0'});
  await page.screenshot({path:'output/player-flow/tunnel-signs-stairs.png'});
  await page.keyboard.press('f');await expect(canvas(page)).toHaveAttribute('data-floor','Lm1');
  await page.waitForTimeout(500);
  await walk({x:330,y:430,layer:'Lm1'});
  await page.screenshot({path:'output/player-flow/tunnel-signs-lower.png'});
  await page.keyboard.press('Space');await page.waitForTimeout(600);
  expect(Math.hypot((await position(page)).x-520,(await position(page)).y-470)).toBeLessThan(4);
  await page.screenshot({path:'output/player-flow/tunnel-lower-bank-landing.png'});
  await page.keyboard.press('Space');await page.waitForTimeout(600);
  expect(Math.hypot((await position(page)).x-330,(await position(page)).y-430)).toBeLessThan(4);
  await walk({x:160,y:195,layer:'Lm1'});
  await page.keyboard.press('f');await expect(canvas(page)).toHaveAttribute('data-floor','L0');
  await page.waitForTimeout(500);
  const start=await position(page);await page.keyboard.down('ArrowUp');await page.waitForTimeout(300);await page.keyboard.up('ArrowUp');
  expect(Math.hypot((await position(page)).x-start.x,(await position(page)).y-start.y)).toBeGreaterThan(10);
  const texts=await page.evaluate(()=>[...(window as unknown as {tunnelSmokeTexts:Set<string>}).tunnelSmokeTexts]);
  expect(texts.some(text=>/^R[1-4] ·|^\?$/.test(text))).toBe(false);
  expect(texts.some(text=>text.includes('Space · 跳过水沟'))).toBe(true);
  await flowRow(page,'Tunnel signs and stairs smoke','visible E event, same-key fetch retry, F down/up and Space between reachable banks','D flag, both floor renders, no random signs; no crash');
});

test('B: every available Home, map, trial, story, replay and development chapter control',async({page})=>{
  test.setTimeout(180000);
  let id=10;
  for(const [label,map] of [['再去小巷走走','alley'],['前往午夜集市','market'],['前往地下暗道','tunnel'],['进入第一章试玩','alley'],['进入第二章试玩','market'],['进入第四章试玩','tunnel']] as const){await open(page,id++);await click(page,new RegExp(label));await checkScene(page,map);}
  for(const [label,map] of [['前往雨后小巷','alley'],['前往午夜集市','market'],['前往地下通道','tunnel']] as const){await open(page,id++);await click(page,'章节地图');await page.getByRole('dialog',{name:'猫爪地图'}).getByRole('button',{name:label,exact:true}).click();await checkScene(page,map,false,label);}
  for(const [label,node,fixtureId] of [['重温第一章剧情','chapter1_intro',30],['重温第二章剧情','market_intro_1',31],['重温第三章剧情','greenhouse_intro_1',32],['重温第四章剧情','rescue_intro_1',33],['启程：第二章','market_intro_1',80],['启程：第三章','greenhouse_intro_1',81],['启程：第四章','rescue_intro_1',82],['启程：终章','finale_intro_1',34],['重温终章大结局','finale_intro_1',83],['进入第三章剧情','greenhouse_intro_1',35],['进入第五章剧情','finale_intro_1',36]] as const){
    await open(page,fixtureId);await click(page,new RegExp(label));expect((await state(page)).storyNodeId).toBe(node);expect((await state(page)).activeBattle).toBeNull();rows.push({button:label,expected:node,result:'pass'});
  }
  for(const [label,node] of [['前往废弃花房剧情','greenhouse_intro_1'],['前往废弃仓库剧情','finale_intro_1']] as const){await open(page,id++);await click(page,'章节地图');await click(page,label);expect((await state(page)).storyNodeId).toBe(node);rows.push({button:label,expected:node,result:'pass'});}
  for(const [label,map] of [['直达雨巷','alley'],['直达午夜集市','market']] as const){await open(page,id++);await click(page,'验收工具');await click(page,new RegExp(label));await checkScene(page,map);}
  for(const [label,node] of [['开启第二章剧情','market_intro_1'],['开启终章剧情','finale_intro_1']] as const){await open(page,id++);await click(page,'验收工具');await click(page,new RegExp(label));expect((await state(page)).storyNodeId).toBe(node);rows.push({button:label,expected:node,result:'pass'});await click(page,/\u8df3\u8fc7\u672c\u6bb5\u5bf9\u8bdd/);await expect.poll(async()=>(await state(page)).phase).toBe(node==='market_intro_1'?'explore':'home');rows.push({button:`QA skip ${node}`,expected:node==='market_intro_1'?'market exploration':'home ending',result:'pass'});}
  for(const [testId,stage] of [['chapter-enter','alley_boss'],['market-battle-trial-enter','market_boss'],['greenhouse-enter','greenhouse_boss'],['tunnel-enter','tunnel_boss'],['finale-enter','finale_boss']] as const){
    await open(page,id++);await expect(page.getByTestId(testId)).toContainText('战斗试玩');await page.getByTestId(testId).click();expect((await state(page)).activeBattle?.stageId).toBe(stage);await click(page,'模拟胜利（QA）');await click(page,stage==='alley_boss'?'带伙伴回家 →':'返回家园 →');expect((await state(page)).phase).toBe('home');rows.push({button:testId,expected:stage,result:'pass'});
  }
  await open(page,84);const before=await state(page);await click(page,'章节地图');await expect(page.getByRole('button',{name:'前往午夜集市',exact:true})).toHaveCount(0);await click(page,'关闭猫爪地图');expect(await state(page)).toEqual(before);
  await click(page,'返回标题');await click(page,/继续冒险/);expect(await state(page)).toEqual(before);
  rows.push({button:'关闭猫爪地图 / 返回标题 / 继续冒险',expected:'same saved state',result:'pass'});
  await click(page,'返回标题');await click(page,/重新开始（重置为新存档）/);await expect(page.getByRole('button',{name:/开始冒险/})).toBeVisible();expect((await state(page)).storyNodeId).toBe('prologue_1');rows.push({button:'标题 / 重新开始（重置为新存档）',expected:'new isolated prologue session',result:'pass'});
  await open(page,85);await click(page,/听阿策分析线索/);expect((await state(page)).storyNodeId).toBe('finale_clue_insufficient');await dialogue(page);await checkScene(page,'market');
  await open(page,87);await click(page,/回集市收集线索/);await checkScene(page,'market');
  await open(page,86);await click(page,/带着收获继续探索集市/);await checkScene(page,'market');
  for(const fixtureId of [90,91,92,93]){await open(page,fixtureId);await click(page,'调整防线，再试一次');expect((await state(page)).phase).toBe('preparation');rows.push({button:`调整防线，再试一次 (${fixtureId-88}章)`,expected:'preparation',result:'pass'});await click(page,'返回家园');const s=await state(page);expect(s.phase).toBe('home');expect(s.activeBattle).toBeNull();expect(s.flags).toEqual(allFlags);rows.push({button:`返回家园 (${fixtureId-88}章失败准备页)`,expected:'home',result:'pass'});}
  await open(page,97);await click(page,'调整防线，再试一次');await page.getByTestId('chapter-enter').click();expect((await state(page)).activeBattle?.stageId).toBe('alley_rescue');await click(page,'模拟胜利（QA）');await click(page,'带伙伴回家 →');expect((await state(page)).phase).toBe('home');rows.push({button:'第一章失败 / 调整防线，再试一次 / 开始第一章战斗试玩',expected:'alley_rescue retry → home',result:'pass'});
  await open(page,98);await click(page,'重新开始教学');expect((await state(page)).activeBattle?.stageId).toBe('l00_tutorial');await click(page,'模拟胜利（QA）');await click(page,'进入雨夜小巷 →');await dialogue(page);await checkScene(page,'alley',false,'重新开始教学 / 进入雨夜小巷');
  for(const [fixtureId,map] of [[50,'alley'],[51,'tunnel']] as const){await open(page,fixtureId);await click(page,new RegExp(map==='alley'?'再去小巷走走':'前往地下暗道'));await click(page,'回到花房');expect((await state(page)).phase).toBe('home');rows.push({button:`回到花房 (${map})`,expected:'home',result:'pass'});}
  await open(page,52);await click(page,/再去小巷走走/);await click(page,'验收工具');await click(page,/直达花房/);expect((await state(page)).phase).toBe('home');rows.push({button:'验收 / 直达花房',expected:'home',result:'pass'});
  await open(page,88);await dialogue(page);await checkScene(page,'alley',false,'随机遭遇失败 / 继续故事');
  await open(page,99);await click(page,'验收工具');await click(page,/重置为新存档/);await expect(page.getByRole('button',{name:/开始冒险/})).toBeVisible();expect((await state(page)).storyNodeId).toBe('prologue_1');rows.push({button:'验收 / 重置为新存档',expected:'new isolated prologue session',result:'pass'});
});

// This helper only presses real movement keys. Routes use the production collision
// field; special links are the authored C climbs, never teleports or edited geometry.
async function follow(page:Page,points:{x:number;y:number}[],speed:number,field:CollisionField) {
  const dense=points.flatMap((p,i)=>i===0?[]:Array.from({length:Math.ceil(Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)/10)},(_,j)=>({x:points[i-1].x+(p.x-points[i-1].x)*(j+1)/Math.ceil(Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)/10),y:points[i-1].y+(p.y-points[i-1].y)*(j+1)/Math.ceil(Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)/10)})));
  for(const target of dense) {
    let stuck=0,reached=false;
    for(let n=0;n<120;n++) {
      const p=await position(page),dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
      if(d<4){reached=true;break;}
      // Choose a legal keyboard direction from the actual collision field. Near
      // slanted edges a tiny corrective axis movement can be essential, even
      // when that axis is already within the waypoint tolerance.
      const directions=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
      const probe=moveProbes.get(field)??((p:Point,d:Point)=>sweepMove(field,p,d,.25).position);
      const length=Math.min(6,d),legal=directions.map(([x,y])=>{const len=Math.hypot(x,y);return {x,y,q:probe(p,{x:x/len*length,y:y/len*length})};})
        .filter(v=>Math.hypot(v.q.x-p.x,v.q.y-p.y)>.3).sort((a,b)=>Math.hypot(a.q.x-target.x,a.q.y-target.y)-Math.hypot(b.q.x-target.x,b.q.y-target.y));
      if(!legal.length)throw new Error(`No legal keyboard step at ${JSON.stringify(p)}`);
      const move=legal[0],keys:string[]=[];
      if(move.x)keys.push(move.x>0?'ArrowRight':'ArrowLeft');
      if(move.y)keys.push(move.y>0?'ArrowDown':'ArrowUp');
      for(const key of keys)await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(180,Math.max(18,d/speed*1000*.7)));
      for(const key of keys)await page.keyboard.up(key);
      if((await state(page)).phase==='battle')return;
      const q=await position(page);
      if(Math.hypot(q.x-p.x,q.y-p.y)<.3)stuck++;else stuck=0;
      if(stuck>10)throw new Error(`Movement stalled at ${JSON.stringify(q)} toward ${JSON.stringify(target)}`);
      await resolveEncounter(page);
      if((await state(page)).phase==='battle')return;
    }
    if(!reached)throw new Error(`Movement did not converge at ${JSON.stringify(await position(page))} toward ${JSON.stringify(target)}`);
  }
}

type Point={x:number;y:number};
type Endpoint=Point & {layer:string};
type Link={id:string;key:string;a:Endpoint;b:Endpoint;requiresFlag?:string};
type Step={points:Point[];field:CollisionField;link?:Link;landing?:Endpoint};
function walkPath(field:CollisionField,start:Point,target:Point) {
  // Plan toward the interior of the existing walkable surface. This is only a
  // test-driver clearance preference; the game's authored collision is untouched.
  const safe=(x:number,y:number)=>[[0,0],[2,0],[-2,0],[0,2],[0,-2],[2,2],[-2,2],[2,-2],[-2,-2]].every(([dx,dy])=>field.isTraversable(x+dx,y+dy));
  const interior={geometry:field.geometry,resolution:field.resolution,isTraversable:safe,nearestTraversable:(p:Point)=>{
    if(safe(p.x,p.y))return p;
    for(let r=2;r<=32;r+=2)for(let a=0;a<Math.PI*2;a+=Math.PI/12){const q={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};if(safe(q.x,q.y))return q;}
    return null;
  }} as CollisionField;
  const path=findPath(interior,start,target,4);
  return path.length?[start,...path]:findPath(field,start,target,4);
}
function fieldFor(canStand:(p:Point)=>boolean,nearest:(p:Point)=>Point|null,move:(p:Point,d:Point)=>Point):CollisionField {
  const field={geometry:{width:1672,height:941},resolution:2,isTraversable:(x:number,y:number)=>canStand({x,y}),nearestTraversable:nearest} as CollisionField;
  moveProbes.set(field,move);return field;
}
function plan(fields:Record<string,CollisionField>,start:Endpoint,target:Endpoint,links:Link[],flags:string[]):Step[] {
  const queue:{point:Endpoint;steps:Step[]}[]=[{point:start,steps:[]}],seen=new Set<string>();
  while(queue.length) {
    const {point,steps}=queue.shift()!,field=fields[point.layer];
    if(point.layer===target.layer){const route=walkPath(field,point,target);if(route.length)return [...steps,{points:route,field}];}
    for(const link of links)for(const [a,b] of [[link.a,link.b],[link.b,link.a]]) {
      // Raised ridge edges are tested separately, not as ground-floor shortcuts.
      if(tunnelClimbSurface(link.id))continue;
      const key=`${link.id}:${a.layer}:${a.x}`;
      if(a.layer!==point.layer||seen.has(key)||(link.requiresFlag&&!flags.includes(link.requiresFlag)))continue;
      const route=walkPath(field,point,a);
      if(route.length){seen.add(key);queue.push({point:b,steps:[...steps,{points:route,field,link,landing:b}]});}
    }
  }
  throw new Error(`No authored route ${JSON.stringify(start)} -> ${JSON.stringify(target)}`);
}
async function traverse(page:Page,steps:Step[],speed:number) {
  for(const step of steps){
    await follow(page,step.points,speed,step.field);
    if(step.link){await page.keyboard.press(step.link.key.toLowerCase()==='space'?'Space':step.link.key.toLowerCase());await page.waitForTimeout(1400);await expect(canvas(page)).toHaveAttribute('data-floor',step.landing!.layer);
      const s=await state(page),floor=step.landing!.layer;
      const part=s.mapId==='market'?{L0:'night_market_L0',L1:'night_market_L1',Lm1:'night_market_Lminus1'}[floor]:{L0:'chapter4_L0_approved',Lm1:'chapter4_Lminus1_tunnel'}[floor];
      await expect(canvas(page)).toHaveAttribute('data-painted-image',new RegExp(part!));
      if(s.mapId==='tunnel'){const p=await position(page);expect(Math.hypot(p.x-step.landing!.x,p.y-step.landing!.y),`landing ${step.link.id}`).toBeLessThan(4);}
      rows.push({traversal:step.link.id,map:s.mapId,floor,asset:await canvas(page).getAttribute('data-painted-image'),result:'pass'});
      await page.screenshot({path:`output/player-flow/${s.mapId}-${floor}.png`});
    }
  }
}
async function marketWalk(page:Page,target:Endpoint) {
  const s=await state(page),cleared=s.flags.includes('market_cleared');
  const fields=Object.fromEntries((['L0','L1','Lm1'] as MarketFloor[]).map(floor=>[floor,fieldFor(p=>isMarketTraversable(floor,p.x,p.y,cleared),p=>nearestMarketPosition(floor,p.x,p.y,cleared),(p,d)=>sweepMarketMove(floor,p,d,cleared,.25).position)]));
  const start={...await position(page),layer:(await canvas(page).getAttribute('data-floor'))!};
  await traverse(page,plan(fields,start,target,marketPortals,s.flags),180);
}
async function event(page:Page,option?:string) {
  await expect(page.locator('.choice-list button').first()).toBeVisible();
  if(option)await click(page,new RegExp(option));else await page.locator('.choice-list button').first().click();
  await click(page,'掷出骰子');await dialogue(page);
  if((await state(page)).phase==='preparation')await click(page,/带着收获继续探索集市/);
  await resolveEncounter(page);
}
async function tunnelFields(page:Page) {
  const result:Record<string,CollisionField>={};
  for(const [floor,part] of [['L0','chapter4_L0_walkable'],['Lm1','chapter4_Lminus1_walkable']]) {
    const url=[...assets].find(a=>a.includes(part))!;
    const raw=await page.evaluate(async url=>{
      const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
      const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
      const bytes=new Uint8Array(c.width*c.height);for(let i=0;i<bytes.length;i++)bytes[i]=pixels[i*4];
      let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);
    },url);
    const mask=tunnelGroundMask(floor as 'L0'|'Lm1',1672,941,new Uint8Array(Buffer.from(raw,'base64')));
    const nearest=(p:Point)=>{if(mask.isWalkable(p))return p;for(let r=2;r<80;r+=2)for(let a=0;a<Math.PI*2;a+=Math.PI/16){const q={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};if(mask.isWalkable(q))return q;}return null;};
    result[floor]=fieldFor(p=>mask.isWalkable(p),nearest,(p,d)=>mask.move(p,d,.25).position);
  }
  return result;
}
async function resolveEncounter(page:Page) {
  if((await state(page)).phase==='event') {
    await page.locator('.choice-list button').first().click();await click(page,'掷出骰子');await dialogue(page);
  }
  if(await page.getByRole('button',{name:'继续赶路 →',exact:true}).count())await click(page,'继续赶路 →');
}
async function alleyWalk(page:Page,target:{x:number;y:number},openGate:boolean) {
  const field=openGate?rainyAlleyFieldOpen:rainyAlleyFieldClosed;
  const start=await position(page),direct=walkPath(field,start,target);
  if(direct.length){await follow(page,direct,96,field);return;}
  for(const climb of CRATE_CLIMBS) {
    if(climb.rescueRequired&&!openGate)continue;
    for(const [a,b] of [[climb.ends[0],climb.ends[1]],[climb.ends[1],climb.ends[0]]]) {
      const first=walkPath(field,start,a),second=walkPath(field,b,target);
      if(first.length&&second.length){await follow(page,first,96,field);await page.keyboard.press('c');await page.waitForTimeout(700);await follow(page,second,96,field);return;}
    }
  }
  throw new Error(`No authored Alley path ${JSON.stringify(start)} -> ${JSON.stringify(target)}`);
}

test('C: connected normal journey through implemented exploration, story and completion transitions',async({page})=>{
  test.setTimeout(900000);
  zoneChecks.clear();
  await page.goto('/');await click(page,/开始冒险/);await dialogue(page);
  expect((await state(page)).activeBattle?.stageId).toBe('l00_tutorial');await click(page,'模拟胜利（QA）');await click(page,'进入雨夜小巷 →');await dialogue(page);await checkScene(page,'alley');
  await flowRow(page,'Prologue → Chapter 1','continue tutorial settlement and chapter introduction','l00_completed; alley/explore');
  await alleyWalk(page,{x:975,y:453},false);await page.keyboard.press('e');
  expect((await state(page)).pendingEventId).toBe('crate_event');await click(page,'仔细搜索周围的物资');await click(page,'掷出骰子');await dialogue(page);await click(page,/开始守护/);
  await flowRow(page,'Crate → rescue battle','walk authored route, E, 2d6, start defense','alley_rescue active');
  expect((await state(page)).activeBattle?.stageId).toBe('alley_rescue');await click(page,'模拟胜利（QA）');await click(page,'带伙伴回家 →');await dialogue(page);
  expect((await state(page)).flags).toContain('alley_rescued');
  const poster=rainyAlleyMapData.objects.fixed.find(o=>o.id==='alley_poster')!;
  await alleyWalk(page,{x:975,y:380},true);await alleyWalk(page,poster,true);await page.keyboard.press('e');await dialogue(page);
  expect((await state(page)).flags).toContain('lost_poster_found');expect((await state(page)).phase).toBe('home');
  await flowRow(page,'Rescue → poster → Home','settlement, rescue story, C climb and E at poster','diandian; alley_rescued; lost_poster_found; rescue_story_done');
  await click(page,/启程：第二章/);await dialogue(page);await checkScene(page,'market');
  await page.screenshot({path:'output/player-flow/journey-market.png'});
  rows.push({stage:'connected-prologue-alley-home-market',result:'pass'});
  await flowRow(page,'Home → Market','Chapter 2 story button and continue dialogue','market_intro_1 → market/explore; no battle');
  await marketWalk(page,{x:652,y:632,layer:'L0'});await resolveEncounter(page);
  await marketWalk(page,{x:910,y:245,layer:'L0'});await page.keyboard.press('e');await event(page);
  expect((await state(page)).flags).toContain('market_crow_clue_completed');
  await marketWalk(page,{x:680,y:166,layer:'L1'});await resolveEncounter(page);
  await marketWalk(page,{x:975,y:429,layer:'Lm1'});await resolveEncounter(page);
  await marketWalk(page,{x:1310,y:426,layer:'L1'});await page.keyboard.press('e');await event(page);
  let s=await state(page);expect(s.flags).toContain('market_pigeon_clue_completed');
  for(const zone of ['market_random_r1','market_random_r2','market_random_r3'])expect(zoneChecks.has(zone),zone).toBe(true);
  await flowRow(page,'Market floors, clues and R1/R2/R3','real C/F links, E at crow and pigeon, 2d6','L0/L1/Lm1 artwork; both clue flags; successful R1/R2/R3 responses');
  await marketWalk(page,{x:1310,y:169,layer:'L0'});
  expect((await state(page)).phase).toBe('explore'); // boss never launches just by walking in
  await page.keyboard.press('e');await expect(page.getByTestId('market-battle')).toBeVisible();
  expect((await state(page)).activeBattle?.mainline).toBe(true);await click(page,'模拟胜利（QA）');await page.getByTestId('market-continue').click();
  await expect(canvas(page)).toHaveAttribute('data-rendered-scene','night-market');expect((await state(page)).flags).toContain('market_cleared');
  await flowRow(page,'Market boss → exploration','E at authored boss, QA battle completion, settlement continue','mainline market_boss; market_cleared; explore');
  await marketWalk(page,{x:1365,y:166,layer:'L0'});await page.keyboard.press('c');
  await expect(canvas(page)).toHaveAttribute('data-home-beat','greenhouse_intro_1');expect((await state(page)).flags).toContain('market_exit_crossed');
  await flowRow(page,'Market → Chapter 3 automatically','cross the north exit trigger after the final C climb','market_exit_crossed; chapter_3_started; greenhouse_intro_1');
  await dialogue(page);s=await state(page);expect(s.flags).toContain('momo_joined');expect(s.cats).toContain('momo');
  await page.getByTestId('chapter3-defense-start').click();await click(page,'模拟胜利（QA）');await page.getByTestId('greenhouse-continue').click();
  await expect(page.getByRole('heading',{name:'整理我们的家'})).toBeVisible();expect((await state(page)).flags).toContain('greenhouse_fortified');
  await flowRow(page,'Chapter 3 → Chapter 4 unlock','greenhouse narrative, Momo recruitment, visible primary defense action','momo_joined; greenhouse_fortified');
  await click(page,/启程：第四章/);await dialogue(page);await checkScene(page,'tunnel');
  const fields=await tunnelFields(page);
  const walkTunnel=async(target:Endpoint)=>{
    const start={...await position(page),layer:(await canvas(page).getAttribute('data-floor'))!};
    const flags=(await state(page)).flags;
    const links=tunnelData.portals.filter(link=>link.key!=='F'||flags.includes('tunnel_false_kitten_trap_found'));
    await traverse(page,plan(fields,start,target,links,flags),142);
  };
  // Take the authored short northern route, and verify Space in both directions.
  await walkTunnel({x:955,y:190,layer:'L0'});await page.keyboard.press('Space');await page.waitForTimeout(700);
  let jumpPosition=await position(page);expect(Math.hypot(jumpPosition.x-1130,jumpPosition.y-196)).toBeLessThan(4);
  await walkTunnel({x:1178,y:176,layer:'L0'});await page.keyboard.press('e');await event(page,'蹲在暗处');
  await walkTunnel({x:1130,y:196,layer:'L0'});await page.keyboard.press('Space');await page.waitForTimeout(700);
  jumpPosition=await position(page);expect(Math.hypot(jumpPosition.x-955,jumpPosition.y-190)).toBeLessThan(4);
  await walkTunnel({x:402,y:239,layer:'L0'});await page.keyboard.press('e');await event(page,'记下绊线位置');
  expect((await state(page)).flags).toContain('tunnel_false_kitten_trap_found');
  // Exercise both approved floors via the authored E1/E2 connectors.
  await walkTunnel({x:160,y:195,layer:'Lm1'});await expect(canvas(page)).toHaveAttribute('data-floor','Lm1');
  await walkTunnel({x:328,y:698,layer:'L0'});await page.keyboard.press('e');await event(page,'顺着旧记号');
  await walkTunnel({x:867,y:743,layer:'L0'});await page.keyboard.press('e');await event(page);
  expect((await state(page)).flags).toContain('valve_three_investigated');
  await flowRow(page,'Tunnel floors, trap and valve','E at authored trap/valve, F connectors, 2d6','tunnel_false_kitten_trap_found; valve_three_investigated');
  await walkTunnel({x:1520,y:759,layer:'L0'});await expect(page.getByTestId('tunnel-battle')).toBeVisible();
  await click(page,'模拟胜利（QA）');await page.getByTestId('tunnel-continue').click();expect((await state(page)).storyNodeId).toBe('rescue_intro_10');await dialogue(page);
  s=await state(page);for(const flag of ['tunnel_boss_cleared','tunnel_explored','cats_rescued_batch1'])expect(s.flags).toContain(flag);
  expect(s.phase).toBe('home');
  await flowRow(page,'Tunnel battle → rescue completion → Home','authored G region, QA battle completion, continue rescue_intro_10','tunnel_boss_cleared; tunnel_explored; cats_rescued_batch1');
  // Existing finale is a narrative ending; its independent battle is covered by B.
  // No warehouse exploration runtime or narrative-to-battle hook is invented here.
  if((s.inventory.clue??0)<3)throw new Error('Connected route needs three clues before finale; record the exact missing clue source.');
  await click(page,/启程：终章/);await dialogue(page);s=await state(page);
  for(const flag of ['finale_completed','kingdom_founded'])expect(s.flags).toContain(flag);
  expect(s.phase).toBe('home');await page.screenshot({path:'output/player-flow/ending.png'});
  await flowRow(page,'Finale story → Ending','existing Chapter 5 narrative, continue all ending nodes','finale_completed; kingdom_founded; home');
  rows.push({stage:'connected-market-greenhouse-tunnel-finale-ending',state:s,result:'pass'});
});

test('D: physical Market exit and automatic Tunnel encounter cross the real HTTP boundary',async({page})=>{
  test.setTimeout(180000);
  await open(page,95);await checkScene(page,'market');await marketWalk(page,{x:1365,y:166,layer:'L0'});await page.keyboard.press('c');
  await expect(canvas(page)).toHaveAttribute('data-home-beat','greenhouse_intro_1');expect((await state(page)).flags).toContain('market_exit_crossed');
  await flowRow(page,'Market exit HTTP regression','physical C climb from cleared Market fixture','EXIT_MARKET accepted as object position; Chapter 3 story in Home scene');
  await open(page,96);await checkScene(page,'tunnel');const fields=await tunnelFields(page);
  const start={...await position(page),layer:(await canvas(page).getAttribute('data-floor'))!};
  await traverse(page,plan(fields,start,{x:1520,y:759,layer:'L0'},tunnelData.portals,(await state(page)).flags),142);
  await expect(page.getByTestId('tunnel-battle')).toBeVisible();expect((await state(page)).activeBattle?.mainline).toBe(true);
  await click(page,'模拟胜利（QA）');await page.getByTestId('tunnel-continue').click();expect((await state(page)).storyNodeId).toBe('rescue_intro_10');await dialogue(page);
  expect((await state(page)).flags).toContain('cats_rescued_batch1');await flowRow(page,'Tunnel G HTTP regression','walk into authored G region and continue settlement','current position accepted; rescue_intro_10; home');
});

test('E: merged HomeMap, directed Momo story and home navigation remain connected',async({page})=>{
  await open(page,100);await expect(canvas(page)).toHaveAttribute('data-rendered-scene','home');
  await click(page,/启程：第三章剧情/);await expect(canvas(page)).toHaveAttribute('data-home-beat','greenhouse_intro_1');
  const cats=()=>canvas(page).evaluate(el=>JSON.parse((el as HTMLElement).dataset.homeCats!));
  expect((await cats()).every((cat:{pose:string|null})=>cat.pose===null)).toBe(true);
  await click(page,'继续故事');await click(page,'继续故事');await expect(canvas(page)).toHaveAttribute('data-home-beat','greenhouse_intro_3');
  await expect.poll(async()=>(await cats()).find((cat:{breed:string;height:number})=>cat.breed==='momo')?.height??0,{intervals:[40,60,80]}).toBeGreaterThan(5);
  expect((await state(page)).cats).not.toContain('momo');await page.screenshot({path:'output/player-flow/home-story.png'});
  await click(page,/跳过剧情/);await expect(canvas(page)).toHaveAttribute('data-home-control','free');expect((await state(page)).cats).toContain('momo');
  rows.push({button:'跳过剧情（第三章）',expected:'Momo recruited; home free mode',result:'pass'});
  await open(page,101);await expect(canvas(page)).toHaveAttribute('data-rendered-scene','home');
  await click(page,'收起家园面板');await expect(page.getByRole('heading',{name:'整理我们的家'})).toHaveCount(0);await click(page,'整理家园');await expect(page.getByRole('heading',{name:'整理我们的家'})).toBeVisible();
  const before=await state(page);await click(page,'章节地图');await expect(page.locator('.home-map')).toHaveAttribute('data-layout',(await canvas(page).getAttribute('data-home-layout'))!);await expect(page.locator('.map-stop.current')).toContainText('废弃花房');
  const time=await canvas(page).getAttribute('data-home-time');await page.waitForTimeout(350);expect(await canvas(page).getAttribute('data-home-time')).toBe(time);await page.screenshot({path:'output/player-flow/home-map.png'});
  await click(page,'关闭猫爪地图');expect(await state(page)).toEqual(before);rows.push({button:'收起家园面板 / 整理家园 / 家园地图 / 关闭猫爪地图',expected:'same home layout and saved state; clock resumes',result:'pass'});
  await page.setViewportSize({width:390,height:844});await open(page,102);await click(page,'收起家园面板');await click(page,'章节地图');await expect(page.locator('.home-map canvas')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'output/player-flow/mobile-home-map.png'});await click(page,'关闭猫爪地图');
});

test('F: QA Chapter 2 story entry can finish its battle, leave the Market and start Chapter 3',async({page})=>{
  test.setTimeout(180000);
  const exits:unknown[]=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/commands')&&request.postDataJSON()?.command?.type==='EXIT_MARKET')exits.push(request.postDataJSON().command);});
  await open(page,103);await click(page,'验收工具');await click(page,/开启第二章剧情/);
  expect((await state(page)).storyNodeId).toBe('market_intro_1');await click(page,/跳过本段对话/);
  // Skip advances multiple server nodes; the Market backdrop is already drawn
  // during dialogue, so wait for the actual exploration state before checking it.
  await expect.poll(async()=>(await state(page)).phase).toBe('explore');await checkScene(page,'market');
  await marketWalk(page,{x:1310,y:169,layer:'L0'});await page.keyboard.press('e');await expect(page.getByTestId('market-battle')).toBeVisible();
  expect((await state(page)).activeBattle?.mainline).toBe(true);await click(page,'模拟胜利（QA）');await page.getByTestId('market-continue').click();
  await expect(canvas(page)).toHaveAttribute('data-rendered-scene','night-market');expect((await state(page)).flags).toContain('market_cleared');
  await marketWalk(page,{x:1365,y:166,layer:'L0'});await page.keyboard.press('c');
  await expect(canvas(page)).toHaveAttribute('data-home-beat','greenhouse_intro_1');const s=await state(page);
  expect(s.flags).toContain('market_exit_crossed');expect(s.flags).toContain('chapter_3_started');expect(s.storyNodeId).toBe('greenhouse_intro_1');expect(s.chapterId).toBe('greenhouse');expect(s.mapId).toBe('greenhouse');expect(s.activeBattle).toBeNull();
  await page.waitForTimeout(300);expect(exits).toHaveLength(1);
  await page.screenshot({path:'output/player-flow/market-exit-chapter3.png'});
  await flowRow(page,'QA Chapter 2 → north exit → Chapter 3','QA story entry, real boss entry/settlement, north exit trigger automatically starts Chapter 3','market_cleared; market_exit_crossed; greenhouse_intro_1');
});

test('G: Chapter 3 shows its required defense and Chapter 4 entry without scrolling',async({page})=>{
  await open(page,104);await dialogue(page);
  expect((await state(page)).flags).toContain('momo_joined');expect((await state(page)).flags).not.toContain('greenhouse_fortified');
  const withinPanel=async(testId:string)=>page.getByTestId(testId).evaluate(el=>{const panel=el.closest('.home-controls')!.getBoundingClientRect(),button=el.getBoundingClientRect();return button.top>=panel.top&&button.bottom<=panel.bottom;});
  await expect(page.getByRole('region',{name:'主线进度'})).toContainText('完成第三章花房保卫战后');
  expect(await withinPanel('chapter3-defense-start')).toBe(true);await expect(page.getByTestId('chapter4-start')).toHaveCount(0);
  await page.screenshot({path:'output/player-flow/chapter3-next-step.png'});
  await page.setViewportSize({width:390,height:844});expect(await withinPanel('chapter3-defense-start')).toBe(true);
  await page.screenshot({path:'output/player-flow/chapter3-next-step-mobile.png'});await page.setViewportSize({width:1440,height:1100});
  await page.getByTestId('chapter3-defense-start').click();await expect(page.getByTestId('greenhouse-battle')).toBeVisible();
  expect((await state(page)).activeBattle?.stageId).toBe('greenhouse_boss');await click(page,'模拟胜利（QA）');await page.getByTestId('greenhouse-continue').click();
  expect((await state(page)).flags).toContain('greenhouse_fortified');await expect(page.getByTestId('chapter3-defense-start')).toHaveCount(0);
  expect(await withinPanel('chapter4-start')).toBe(true);await page.screenshot({path:'output/player-flow/chapter4-next-step.png'});
  await page.reload();await page.getByRole('button',{name:/继续冒险|开始冒险/}).click();expect(await withinPanel('chapter4-start')).toBe(true);
  await page.getByTestId('chapter4-start').click();expect((await state(page)).storyNodeId).toBe('rescue_intro_1');await dialogue(page);await checkScene(page,'tunnel',true,'主线进度 / 启程：第四章');
  await flowRow(page,'Chapter 3 visible next step → Chapter 4','finish Chapter 3 dialogue, primary defense action, QA victory, top Chapter 4 entry','greenhouse_fortified; rescue_intro_1 → actual TunnelMap');
});
