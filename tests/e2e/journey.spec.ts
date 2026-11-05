import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import type {GameCommand,GameState} from '../../web/src/contracts';
import {playL00ThroughHost} from './l00-battle';
import {playVisibleControls} from './l01-battle';
const spec=JSON.parse(fs.readFileSync('docs/openapi.json','utf8'));
const ajv=new Ajv2020({strict:false,allErrors:true});
const stateSchema=ajv.compile({components:spec.components,$ref:'#/components/schemas/GameState'});
const catalogSchema=ajv.compile({components:spec.components,$ref:'#/components/schemas/Catalog'});
async function enterGame(page:Page) {
 await page.getByRole('button',{name:/^(开始冒险|继续冒险)/}).click();
}
// 序章对话结束后服务端自动进入 l00_tutorial 教学战(雨巷探索的前置教学)。
// 这里用 API 上下文结算教学战(不经过页面,避免污染 battleCommands 断言),再刷新同步前端。
async function settleTutorial(page:Page,request:APIRequestContext) {
 const headers={Authorization:`Bearer ${JSON.parse((await page.evaluate(() => localStorage.getItem('stray-kitty.session.v1')))!).token}`};
 let state=await(await request.get('/api/v1/state',{headers})).json() as GameState;
 if(state.activeBattle?.stageId!=='l00_tutorial')return;
 const post=async(key:string,command:GameCommand)=>await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':key},data:{expectedRevision:state.revision,command}});
 await post(`e2e-tutorial-${state.revision}`,{type:'COMPLETE_BATTLE',attemptId:state.activeBattle.id,outcome:'won'});
 state=await(await request.get('/api/v1/state',{headers})).json() as GameState;
 await post(`e2e-tutorial-continue-${state.revision}`,{type:'CONTINUE'});
 await page.reload();await enterGame(page);
}
async function finishDialogue(page:Page) {
 for(let count=0;count<20;count++){
  const next=page.getByRole('button',{name:'继续故事'});
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/commands')&&r.request().method()==='POST'),next.click()]);
  expect(response.status()).toBe(200);
  if((await response.json()).state.phase!=='dialogue'){await expect(next).toHaveCount(0);return;}
  await expect(next).toBeEnabled();
 }
 throw Error('剧情未到达出口');
}
// 自隐 HUD：非战斗阶段顶栏默认收起，先展开再点验收工具（战斗阶段顶栏常驻展开）。
async function openQaTools(page:Page) {
 const qa=page.getByRole('button',{name:'验收工具'});
 if(!await qa.isVisible())await page.getByRole('button',{name:'展开顶部信息栏（可拖拽）'}).click();
 await qa.click();
}
// 当前流程快捷操作使用真实 INTERACT，不创建或覆盖验收进度。
async function triggerCrateFromDevTools(page:Page) {
 await openQaTools(page);
 await page.getByRole('button',{name:/触发纸箱事件/}).click();
}

test('真实浏览器贯通序章救援与家园闭环、集市事件验收和原进度恢复',async({page,request},testInfo)=>{
 test.setTimeout(480000);
 page.setDefaultTimeout(10000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const battleCommands:string[]=[];page.on('request',request=>{
  if(request.url().endsWith('/api/v1/commands')&&request.method()==='POST'){
   const type=request.postDataJSON().command?.type;
   if(type==='START_BATTLE'||type==='COMPLETE_BATTLE')battleCommands.push(type);
  }
 });
 await page.goto('/');await expect(page.getByRole('button',{name:'开始冒险'})).toBeVisible();
 fs.mkdirSync('output/preview',{recursive:true});await page.screenshot({path:'output/preview/start.png',fullPage:true});
 await enterGame(page);await expect(page.locator('[data-renderer="canvas2d"]')).toBeVisible();
 fs.mkdirSync('output/preview',{recursive:true});await page.screenshot({path:'output/preview/desktop.png',fullPage:true});
 await finishDialogue(page);
 await expect(page.locator('section[aria-label="序章塔防战斗"]')).toBeVisible();
 await page.getByRole('button',{name:'验收工具'}).click();
 const battleDevTools=page.getByRole('dialog',{name:'流程验收'});
 await expect(battleDevTools.getByTestId('qa-simulate-victory')).toBeEnabled();
 await expect(battleDevTools.getByTestId('qa-simulate-defeat')).toBeEnabled();
 await expect(battleDevTools.getByTestId('qa-chapter-market')).toBeVisible();
 await expect(page.locator('.qa-active-badge')).toHaveCount(0);
 expect(battleCommands).toEqual([]);
 await page.getByRole('button',{name:'关闭流程验收'}).click();
 const tutorialRun=await playL00ThroughHost(page);
 await testInfo.attach('l00-new-tutorial-six-waves',{body:JSON.stringify(tutorialRun),contentType:'application/json'});
 await page.getByRole('button',{name:'进入雨夜小巷 →'}).click();
 await finishDialogue(page);
 await page.screenshot({path:'output/preview/explore.png',fullPage:true});
 await triggerCrateFromDevTools(page);
 await page.getByRole('button',{name:'仔细搜索周围的物资'}).click();await expect(page.getByRole('button',{name:'掷出骰子'})).toBeEnabled();
 await page.screenshot({path:'output/preview/event.png',fullPage:true});
 const [eventResponse]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/commands')&&r.request().method()==='POST'),page.getByRole('button',{name:'掷出骰子'}).click()]);
 const eventState=(await eventResponse.json()).state as GameState;expect(stateSchema(eventState),JSON.stringify(stateSchema.errors)).toBe(true);
 if(eventState.phase==='dialogue')await finishDialogue(page);
 await expect(page.getByRole('button',{name:'开始守护'})).toBeVisible();
 const dice=eventState.eventState!.lastResolution.dice;
 await expect(page.getByTestId('event-resolution').locator('.dice')).toHaveCount(2);
 expect(await page.getByTestId('event-resolution').locator('.dice').evaluateAll(els=>els.map(el=>el.getAttribute('aria-label')))).toEqual(dice.map(value=>`骰子 ${value} 点`));
 await page.screenshot({path:'output/preview/event-result.png',fullPage:true});
 await page.getByRole('button',{name:'开始守护'}).click();
 const battleRun=await playVisibleControls(page);
 expect(battleCommands).toEqual(['COMPLETE_BATTLE','START_BATTLE','COMPLETE_BATTLE']);
 await expect(page.getByTestId('chapter-battle')).toHaveCount(0);
 await expect(page.getByTestId('battle-supply-rewards')).toHaveCount(0);
 await testInfo.attach('l01-first-rescue-boss-run',{body:JSON.stringify(battleRun,null,2),contentType:'application/json'});
 await page.screenshot({path:'output/preview/rescue.png',fullPage:true});
 await page.getByRole('button',{name:'带伙伴回家 →',exact:true}).click();await page.getByRole('button',{name:'继续故事'}).click();
 await openQaTools(page);await page.getByTestId('qa-inspect-poster').click();
 await expect(page.getByLabel('寻猫启事')).toBeVisible();await page.screenshot({path:'output/preview/poster.png',fullPage:true});await finishDialogue(page);
 await expect(page.getByRole('heading',{name:'整理我们的家'})).toBeVisible();await expect(page.getByTestId('stamps')).toHaveText('2');
 await page.getByRole('button',{name:'避雨角落'}).click();
 await page.getByRole('button',{name:'猫咪补给站',exact:true}).click();const shop=page.getByRole('dialog',{name:'猫咪补给站'});
 await page.screenshot({path:'output/preview/shop.png',fullPage:true});await expect(shop.getByRole('button',{name:'蓝色饭碗随剧情免费赠送'})).toBeDisabled();
 await shop.getByRole('button',{name:'关闭猫咪补给站'}).click();await expect(page.getByTestId('stamps')).toHaveText('2');
 await page.getByRole('button',{name:'选择家具'}).click();await page.getByRole('option',{name:'柔软毛毯'}).click();await page.getByRole('button',{name:'窗边'}).click();
 await page.reload();await enterGame(page);await expect(page.getByRole('heading',{name:'整理我们的家'})).toBeVisible();
 await expect(page.getByRole('button',{name:'避雨角落'})).toContainText('纸箱猫窝');await expect(page.getByTestId('stamps')).toHaveText('2');
 await expect(page.getByRole('button',{name:'窗边'})).toContainText('柔软毛毯');
 await page.getByRole('button',{name:'猫爪邮局',exact:true}).click();const postOffice=page.getByRole('dialog',{name:'猫爪邮局'});
 await postOffice.getByTestId('parcel-draw').click();await expect(postOffice.locator('.parcel-result-copy')).toBeVisible();await postOffice.getByRole('button',{name:'关闭猫爪邮局'}).click();await expect(page.getByTestId('stamps')).toHaveText('1');
 await page.screenshot({path:'output/preview/home.png',fullPage:true});
 await page.getByRole('button',{name:'启程：第二章《午夜集市》',exact:false}).click();
 await expect(page.locator('.chapter-pill')).toHaveText('第二章 · 午夜集市');
 await expect(page.locator('.dialogue-copy p')).toContainText('午夜集市');
 await page.screenshot({path:'output/preview/market-intro.png',fullPage:true});await finishDialogue(page);
 await expect(page.locator('.area-label')).toHaveText('午夜集市');
 const session=JSON.parse((await page.evaluate(()=>localStorage.getItem('stray-kitty.session.v1')))!) as {token:string};
 const headers={Authorization:`Bearer ${session.token}`};
 const beforeCards=(await(await request.get('/api/v1/state',{headers})).json()) as GameState;
 for(const eventId of ['crow_intel_event','pigeon_rumor_event']){
   await openQaTools(page);
   await page.getByTestId('qa-chapter-market').click();
   await page.getByLabel('选择事件').selectOption(`event:market:${eventId}`);
   await page.getByTestId('qa-load-event').click();
   await page.locator('.choice-list button').first().click();
   const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/commands')&&r.request().method()==='POST'),page.getByRole('button',{name:'掷出骰子'}).click()]);
   expect(response.status()).toBe(200);
   const resolved=(await response.json()).state as GameState;
   expect(stateSchema(resolved),JSON.stringify(stateSchema.errors)).toBe(true);
   expect(resolved.eventState!.lastResolution.eventId).toBe(eventId);
   if(resolved.phase==='dialogue')await finishDialogue(page);
   await page.screenshot({path:`output/preview/${eventId}.png`,fullPage:true});
 }
 await page.reload();await enterGame(page);
 await openQaTools(page);await page.getByTestId('qa-restore').click();
 const restored=(await(await request.get('/api/v1/state',{headers})).json()) as GameState;
 expect({...restored,revision:beforeCards.revision}).toEqual(beforeCards);
 await expect(page.locator('.qa-active-badge')).toHaveCount(0);
 await expect(page.locator('.area-label')).toHaveText('午夜集市');
 expect(errors).toEqual([]);
});
test('匿名会话隔离、幂等与 API 真实响应',async({request})=>{
 const session=await(await request.post('/api/v1/sessions')).json();
 const headers={Authorization:`Bearer ${session.token}`,'Idempotency-Key':'e2e-command-123'};
 const data={expectedRevision:0,command:{type:'ADVANCE_STORY',nodeId:'prologue_1'}};
 const first=await request.post('/api/v1/commands',{headers,data});expect(first.status()).toBe(200);const result=await first.json();expect(result.state.revision).toBe(1);
 expect(stateSchema(result.state),JSON.stringify(stateSchema.errors)).toBe(true);
 const catalog=await(await request.get('/api/v1/content')).json();expect(catalogSchema(catalog),JSON.stringify(catalogSchema.errors)).toBe(true);
 const replay=await(await request.post('/api/v1/commands',{headers,data})).json();expect(replay.replayed).toBe(true);expect(replay.state).toEqual(result.state);
 const other=await(await request.post('/api/v1/sessions')).json();const state=await(await request.get('/api/v1/state',{headers:{Authorization:`Bearer ${other.token}`}})).json();expect(state.revision).toBe(0);
 expect((await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':'different-command'},data})).status()).toBe(409);
});
test('服务器已提交但响应丢失时，重试原请求不会重复推进',async({page})=>{
 await page.goto('/');await enterGame(page);await expect(page.getByRole('button',{name:'继续故事'})).toBeVisible();let lost=false;
 await page.route('**/api/v1/commands',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
 await page.getByRole('button',{name:'继续故事'}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.getByRole('button',{name:'重试上次操作'}).click();await expect(page.locator('.speaker')).toHaveText('旁白');
 const revision=await page.evaluate(async()=>{const session=JSON.parse(localStorage.getItem('stray-kitty.session.v1')!);return (await(await fetch('/api/v1/state',{headers:{Authorization:`Bearer ${session.token}`}})).json()).revision;});
 expect(revision).toBe(1);
});
test('窄屏首屏没有水平溢出且故事可操作',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByRole('button',{name:'开始冒险'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'output/preview/mobile-start.png',fullPage:true});
 await enterGame(page);await expect(page.getByRole('button',{name:'继续故事'})).toBeVisible();await page.getByRole('button',{name:'继续故事'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'output/preview/mobile.png',fullPage:true});
 // 自隐 HUD 在窄屏默认收起,先展开顶栏才能点到猫咪补给站;溢出断言在此之前已完成,不受影响。
 const shopButton=page.getByRole('button',{name:'猫咪补给站',exact:true});
 if(!await shopButton.isVisible())await page.getByRole('button',{name:'展开顶部信息栏（可拖拽）'}).click();
 await shopButton.click();const shop=page.getByRole('dialog',{name:'猫咪补给站'});await expect(shop).toBeVisible();
 expect(await shop.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:'output/preview/mobile-shop.png',fullPage:true});
});


test('章节地图按进度显示，弹窗冻结移动并恢复焦点',async({page})=>{
 await page.goto('/');await enterGame(page);await finishDialogue(page);
 const mapButton=page.getByRole('button',{name:'章节地图'});await mapButton.click();
 const map=page.getByRole('dialog',{name:'猫爪地图'});await expect(map).toBeVisible();
 await expect(map.locator('.map-stop.current')).toContainText('雨后小巷');await expect(map.locator('.map-stop.locked')).toHaveCount(4);
 await page.screenshot({path:'output/preview/map.png',fullPage:true});
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(2300);await page.keyboard.up('ArrowRight');
 await page.keyboard.press('Escape');await expect(map).toHaveCount(0);await expect(mapButton).toBeFocused();
 await expect(page.getByRole('button',{name:'点点 · 纸箱 · E'})).toHaveCount(0);
 await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.getByText('旅程已暂停',{exact:true})).toBeVisible();
 await page.locator('.pause-label').getByRole('button',{name:'继续旅程'}).click();await expect(page.locator('.pause-label')).toHaveCount(0);
 await page.getByRole('button',{name:'返回标题'}).click();await expect(page.getByRole('button',{name:'继续冒险'})).toBeVisible();await enterGame(page);
 await expect(page.getByRole('button',{name:'继续故事'})).toHaveCount(0);
});

test('双骰已提交但响应丢失，刷新沿用原骰点与奖励',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await enterGame(page);await finishDialogue(page);
 await settleTutorial(page,request);
 await finishDialogue(page);
 await triggerCrateFromDevTools(page);
 await page.getByRole('button',{name:'先安抚点点，再寻找安全路线'}).click();await expect(page.getByLabel('双骰四档规则')).toBeVisible();
 await page.screenshot({path:'output/preview/mobile-event.png',fullPage:true});
 let committed:GameState|undefined;
 await page.route('**/api/v1/commands',async route=>{
  if(!committed&&route.request().postDataJSON().command.type==='CHOOSE_EVENT'){const result=await route.fetch();committed=(await result.json()).state;await route.abort('failed');}
  else await route.continue();
 });
 await page.getByRole('button',{name:'掷出骰子'}).click();await expect(page.getByRole('alert')).toBeVisible();expect(committed).toBeDefined();
 await page.reload();await enterGame(page);await expect(page.getByTestId('event-resolution')).toBeVisible();
 const actual:GameState=await page.evaluate(async()=>{const session=JSON.parse(localStorage.getItem('stray-kitty.session.v1')!);return (await(await fetch('/api/v1/state',{headers:{Authorization:`Bearer ${session.token}`}})).json());});
 expect(actual).toEqual(committed);expect(stateSchema(actual),JSON.stringify(stateSchema.errors)).toBe(true);
 expect(await page.getByTestId('event-resolution').locator('.dice').evaluateAll(els=>els.map(el=>el.getAttribute('aria-label')))).toEqual(committed!.eventState!.lastResolution.dice.map(value=>`骰子 ${value} 点`));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'output/preview/mobile-event-result.png',fullPage:true});
});

test('新版美术资源可加载，矮屏菜单与新增剧情态度可操作',async({page,request})=>{
 const art=await request.get('/assets/city-backdrop.svg');expect(art.status()).toBe(200);expect(art.headers()['content-type']).toContain('image/svg+xml');
 for(const viewport of [{width:1280,height:620},{width:375,height:560}]){
  await page.setViewportSize(viewport);await page.goto('/');
  const decoded=await page.evaluate(async()=>{const image=new Image();image.src='/assets/city-backdrop.svg';await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};});expect(decoded.width).toBeGreaterThan(0);expect(decoded.height).toBeGreaterThan(0);
  await expect(page.locator('.start-menu-backdrop')).toBeVisible();await expect(page.locator('.start-cats svg.pixel-cat')).toHaveCount(3);
  const play=page.getByRole('button',{name:'开始冒险'});await play.scrollIntoViewIfNeeded();
  const bounds=(await play.boundingBox())!;expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`output/preview/start-${viewport.width}x${viewport.height}.png`,fullPage:true});
  const shopButton=page.getByRole('button',{name:'猫咪补给站'});await shopButton.scrollIntoViewIfNeeded();await shopButton.click();
  await expect(page.getByRole('dialog',{name:'猫咪补给站'})).toBeVisible();await page.getByRole('button',{name:'关闭猫咪补给站'}).click();
  await enterGame(page);await expect(page.locator('[data-renderer="canvas2d"] canvas')).toBeVisible();
  await page.getByRole('button',{name:'旅程记录',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'旅程记录'}).locator('.cat-entry').getByRole('img',{name:'橘猫 · 团子'})).toBeVisible();
  await page.getByRole('button',{name:'关闭旅程记录'}).click();
 }
 for(let step=0;step<3;step++){
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/commands')&&r.request().method()==='POST'),page.getByRole('button',{name:'继续故事'}).click()]);
  await expect(page.getByRole('button',{name:'继续故事'})).toBeEnabled();
 }
 const attitude=page.getByRole('group',{name:'猫咪态度'});await expect(attitude).toBeVisible();
 await attitude.getByRole('button',{name:'诚实撒娇'}).click();await expect(page.locator('.dialogue-copy p')).toContainText('口水');
 await attitude.getByRole('button',{name:'傲娇嘴硬'}).click();await expect(page.locator('.dialogue-copy p')).toContainText('领地之王');
});

test('场景铺满窗口，商店居中且旅程记录可关闭',async({page})=>{
 for(const viewport of [{width:1920,height:1080},{width:1280,height:620},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.goto('/');await enterGame(page);
  const canvas=page.locator('[data-renderer="canvas2d"] canvas');await expect(canvas).toBeVisible();
  expect(await page.locator('.app-shell').boundingBox()).toEqual({x:0,y:0,width:viewport.width,height:viewport.height});
  expect(await canvas.boundingBox()).toEqual({x:0,y:0,width:viewport.width,height:viewport.height});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  const journalButton=page.getByRole('button',{name:'旅程记录',exact:true});await journalButton.click();
  await expect(page.getByRole('dialog',{name:'旅程记录'})).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'旅程记录'})).toHaveCount(0);await expect(journalButton).toBeFocused();
  await page.screenshot({path:`output/preview/fullscreen-${viewport.width}x${viewport.height}.png`,fullPage:true});
  await page.getByRole('button',{name:'返回标题'}).click();await page.locator('.start-actions').getByRole('button',{name:'猫咪补给站'}).click();
  const shop=page.getByRole('dialog',{name:'猫咪补给站'});await expect(shop).toBeVisible();await expect(page.locator('.start-title')).toBeHidden();
  const bounds=(await shop.boundingBox())!;
  expect(Math.abs(bounds.x+bounds.width/2-viewport.width/2)).toBeLessThan(1);
  expect(Math.abs(bounds.y+bounds.height/2-viewport.height/2)).toBeLessThan(1);
  expect(await shop.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:`output/preview/fullscreen-shop-${viewport.width}x${viewport.height}.png`,fullPage:true});
  await page.keyboard.press('Escape');await expect(page.locator('.start-title')).toBeVisible();
 }
});
