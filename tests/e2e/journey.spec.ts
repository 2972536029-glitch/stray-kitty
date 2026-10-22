import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import type {GameState} from '../../web/src/contracts';
const spec=JSON.parse(fs.readFileSync('docs/openapi.json','utf8'));
const ajv=new Ajv2020({strict:false,allErrors:true});
const stateSchema=ajv.compile({components:spec.components,$ref:'#/components/schemas/GameState'});
const catalogSchema=ajv.compile({components:spec.components,$ref:'#/components/schemas/Catalog'});
async function enterGame(page:Page) {
 await page.getByRole('button',{name:/^(开始冒险|继续冒险)/}).click();
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

test('真实浏览器贯通探索、事件、战斗、救援、家园和刷新恢复',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.getByRole('button',{name:'开始冒险'})).toBeVisible();
 fs.mkdirSync('output/preview',{recursive:true});await page.screenshot({path:'output/preview/start.png',fullPage:true});
 await enterGame(page);await expect(page.locator('[data-renderer="canvas2d"]')).toBeVisible();
 fs.mkdirSync('output/preview',{recursive:true});await page.screenshot({path:'output/preview/desktop.png',fullPage:true});
 await finishDialogue(page);
 await page.screenshot({path:'output/preview/explore.png',fullPage:true});
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(1850);await page.keyboard.up('ArrowRight');
 await expect(page.getByRole('button',{name:'查看纸箱 · E'})).toBeVisible();await page.getByRole('button',{name:'查看纸箱 · E'}).click();
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
 const canvas=page.locator('[data-renderer="canvas2d"] canvas');const box=(await canvas.boundingBox())!;
 for(const lane of [0,1,2])await canvas.click({position:{x:191*box.width/800,y:(190+lane*82)*box.height/480}});
 await expect(page.getByRole('button',{name:'带伙伴回家'})).toBeVisible({timeout:30000});
 await page.screenshot({path:'output/preview/rescue.png',fullPage:true});
 await page.getByRole('button',{name:'带伙伴回家'}).click();await page.getByRole('button',{name:'继续故事'}).click();
 await expect(page.getByLabel('寻猫启事')).toBeVisible();await page.screenshot({path:'output/preview/poster.png',fullPage:true});await finishDialogue(page);
 await expect(page.getByRole('heading',{name:'整理我们的家'})).toBeVisible();await expect(page.getByTestId('stamps')).toHaveText('2');
 await page.getByRole('button',{name:'避雨角落'}).click();
 await page.getByRole('button',{name:'猫国商店',exact:true}).click();const shop=page.getByRole('dialog',{name:'猫国商店'});
 await page.screenshot({path:'output/preview/shop.png',fullPage:true});await shop.getByRole('button',{name:'购买蓝色饭碗，1邮票'}).click();
 await expect(shop.getByRole('button',{name:'蓝色饭碗已拥有'})).toBeDisabled();await shop.getByRole('button',{name:'关闭猫国商店'}).click();await expect(page.getByTestId('stamps')).toHaveText('1');
 await page.getByLabel('选择家具').selectOption('blue_bowl');await page.getByRole('button',{name:'窗边'}).click();
 await page.reload();await enterGame(page);await expect(page.getByRole('heading',{name:'整理我们的家'})).toBeVisible();
 await expect(page.getByRole('button',{name:'避雨角落'})).toContainText('纸箱猫窝');await expect(page.getByTestId('stamps')).toHaveText('1');
 await expect(page.getByRole('button',{name:'窗边'})).toContainText('蓝色饭碗');
 await page.getByRole('button',{name:'打开雨夜包裹'}).click();await expect(page.getByTestId('stamps')).toHaveText('0');
 await page.screenshot({path:'output/preview/home.png',fullPage:true});expect(errors).toEqual([]);
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
 await page.getByRole('button',{name:'猫国商店',exact:true}).click();const shop=page.getByRole('dialog',{name:'猫国商店'});await expect(shop).toBeVisible();
 expect(await shop.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:'output/preview/mobile-shop.png',fullPage:true});
});


test('章节地图按进度显示，弹窗冻结移动并恢复焦点',async({page})=>{
 await page.goto('/');await enterGame(page);await finishDialogue(page);
 const mapButton=page.getByRole('button',{name:'章节地图'});await mapButton.click();
 const map=page.getByRole('dialog',{name:'猫爪地图'});await expect(map).toBeVisible();
 await expect(map.locator('.map-stop.current')).toContainText('雨后小巷');await expect(map.locator('.map-stop.locked')).toHaveCount(4);
 await page.screenshot({path:'output/preview/map.png',fullPage:true});
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(1850);await page.keyboard.up('ArrowRight');
 await page.keyboard.press('Escape');await expect(map).toHaveCount(0);await expect(mapButton).toBeFocused();
 await expect(page.getByRole('button',{name:'查看纸箱 · E'})).toHaveCount(0);
 await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.getByText('旅程已暂停',{exact:true})).toBeVisible();
 await page.locator('.pause-label').getByRole('button',{name:'继续旅程'}).click();await expect(page.locator('.pause-label')).toHaveCount(0);
 await page.getByRole('button',{name:'返回标题'}).click();await expect(page.getByRole('button',{name:'继续冒险'})).toBeVisible();await enterGame(page);
 await expect(page.getByRole('button',{name:'继续故事'})).toHaveCount(0);
});

test('双骰已提交但响应丢失，刷新沿用原骰点与奖励',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await enterGame(page);await finishDialogue(page);
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(1850);await page.keyboard.up('ArrowRight');await page.getByRole('button',{name:'查看纸箱 · E'}).click();
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
  const shopButton=page.getByRole('button',{name:'猫国商店'});await shopButton.scrollIntoViewIfNeeded();await shopButton.click();
  await expect(page.getByRole('dialog',{name:'猫国商店'})).toBeVisible();await page.getByRole('button',{name:'关闭猫国商店'}).click();
  await enterGame(page);await expect(page.locator('[data-renderer="canvas2d"] canvas')).toBeVisible();
  await expect(page.locator('.cat-entry').getByRole('img',{name:'橘猫 · 团子'})).toBeVisible();
 }
 for(let step=0;step<3;step++){
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/commands')&&r.request().method()==='POST'),page.getByRole('button',{name:'继续故事'}).click()]);
  await expect(page.getByRole('button',{name:'继续故事'})).toBeEnabled();
 }
 const attitude=page.getByRole('group',{name:'猫咪态度'});await expect(attitude).toBeVisible();
 await attitude.getByRole('button',{name:'诚实撒娇'}).click();await expect(page.locator('.dialogue-copy p')).toContainText('口水');
 await attitude.getByRole('button',{name:'傲娇嘴硬'}).click();await expect(page.locator('.dialogue-copy p')).toContainText('领地之王');
});
