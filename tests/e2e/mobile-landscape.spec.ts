import {expect,test,type Page,type APIRequestContext,type Locator} from '@playwright/test';
import type {Session} from '../../web/src/contracts';

test.use({isMobile:true,hasTouch:true,deviceScaleFactor:1,viewport:{width:390,height:844}});
const game=(page:Page)=>page.frameLocator('.phone-game-frame');
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{for(const key of ['prologue.intro','tutorial.home','tutorial.battle'])localStorage.setItem(`stray-kitty.${key}`,'done');});
});
async function prepare(page:Page,request:APIRequestContext,id='alley.explore'){
 const session=await(await request.post('/api/v1/sessions')).json() as Session,headers={Authorization:`Bearer ${session.token}`};
 const before=await(await request.get('/api/v1/state',{headers})).json();
 const setup=await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':'phone-setup'},data:{expectedRevision:before.revision,command:{type:'QA_CHECKPOINT',checkpointId:id}}});expect(setup.ok(),await setup.text()).toBe(true);
 await page.addInitScript(session=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session)),session);
 await page.goto('/');await game(page).getByRole('button',{name:/^(暂不登录|继续冒险)/}).tap();
 await expect(game(page).locator('.app-shell')).toBeVisible();await expect(game(page).locator('.map-loading-panel')).toHaveCount(0);return{session,headers};
}
async function within(page:Page,selector:string){
 const boxes=await game(page).locator(selector).evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return{name:el.getAttribute('aria-label')??el.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};}));expect(boxes.length).toBeGreaterThan(0);
 for(const box of boxes){expect(box.x,box.name).toBeGreaterThanOrEqual(-1);expect(box.y,box.name).toBeGreaterThanOrEqual(-1);expect(box.right,box.name).toBeLessThanOrEqual(box.w+1);expect(box.bottom,box.name).toBeLessThanOrEqual(box.h+1);}
}
const position=(page:Page)=>game(page).locator('.game-viewport canvas').evaluate((c:HTMLCanvasElement)=>({x:Number(c.dataset.playerX),y:Number(c.dataset.playerY)}));
async function screenPoint(page:Page,locator:Locator,dx=0,dy=0){
 const local=await locator.evaluate((el,{dx,dy})=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2+dx,y:r.y+r.height/2+dy};},{dx,dy});
 const element=page.locator('.phone-game-frame'),frame=(await element.boundingBox())!,data=await element.evaluate(el=>({scale:Number((el as HTMLElement).dataset.scale),angle:Number((el as HTMLElement).dataset.angle)}));
 if(data.angle===90)return{x:frame.x+frame.width-local.y*data.scale,y:frame.y+local.x*data.scale};
 if(data.angle===180)return{x:frame.x+frame.width-local.x*data.scale,y:frame.y+frame.height-local.y*data.scale};
 return{x:frame.x+local.x*data.scale,y:frame.y+local.y*data.scale};
}
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:360,height:640},{width:430,height:932}])test(`locked portrait fills available viewport at ${viewport.width}x${viewport.height}`,async({page,request},info)=>{
 await page.setViewportSize(viewport);await prepare(page,request,'greenhouse.home_3');
 const frame=page.locator('.phone-game-frame'),box=(await frame.boundingBox())!;
 expect(box.width).toBeCloseTo(viewport.width,0);expect(box.height).toBeCloseTo(viewport.height,0);expect(box.x).toBeGreaterThanOrEqual(-1);expect(box.y).toBeGreaterThanOrEqual(-1);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width+1);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1);
 expect(await game(page).locator('html').evaluate(()=>innerWidth)).toBe(1920);expect(await game(page).locator('html').evaluate(()=>innerHeight)).toBeGreaterThan(800);
 await expect(game(page).getByRole('dialog',{name:'请横屏游玩'})).toHaveCount(0);await within(page,'.topbar nav button');
 await game(page).getByRole('button',{name:'家园手册',exact:true}).tap();await within(page,'dialog[open],dialog[open]>.modal-close');
 expect(await game(page).locator('.window-heading h2').evaluate(el=>getComputedStyle(el).fontSize)).toBe('28px');await page.screenshot({path:info.outputPath('manual-rotated.png')});await game(page).getByRole('button',{name:'关闭家园手册',exact:true}).tap();
 await game(page).getByRole('button',{name:'猫咪补给站',exact:true}).tap();await game(page).getByRole('button',{name:/罐头.*前往补给小站/}).tap();await within(page,'dialog[open]');await expect(game(page).locator('.recharge-balance')).not.toContainText('我的罐头');await game(page).getByRole('button',{name:'关闭金枪鱼补给小站',exact:true}).tap();
});
for(const id of ['alley.explore','market.explore','rescue.explore','finale.explore'])test(`${id}: rotated real touch moves in game direction and releases on resize or modal`,async({page,request})=>{
 await prepare(page,request,id);if(id==='finale.explore')await expect(game(page).locator('.game-viewport canvas')).toHaveAttribute('data-ready','true',{timeout:30000});const stick=game(page).getByRole('button',{name:'移动摇杆，按住拖动控制方向'});await expect(stick).toBeEnabled();const cdp=await page.context().newCDPSession(page);
 let moved=false;
 for(const [dx,dy] of [[64,0],[0,-64],[-64,0],[0,64]]){
  const start=await screenPoint(page,stick),end=await screenPoint(page,stick,dx,dy),before=await position(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});await page.waitForTimeout(250);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});const after=await position(page);
  if(Math.hypot(after.x-before.x,after.y-before.y)>2){moved=true;break;}
 }
 expect(moved).toBe(true);await page.waitForTimeout(200);const stopped=await position(page);await page.waitForTimeout(200);expect(await position(page)).toEqual(stopped);
 const start=await screenPoint(page,stick),end=await screenPoint(page,stick,64,0);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});
 await page.setViewportSize({width:844,height:390});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);const resized=await position(page);await page.waitForTimeout(200);expect(await position(page)).toEqual(resized);
 // Raw CDP touch cancellation suppresses the next compatibility click in Chromium;
 // real toolbar taps are covered above; exercise the modal transition here.
 await game(page).getByRole('button',{name:'猫咪补给站',exact:true}).evaluate((button:HTMLButtonElement)=>button.click());await expect(game(page).getByRole('dialog',{name:'猫咪补给站',exact:true})).toBeVisible();await expect(stick).toBeDisabled();await game(page).getByRole('button',{name:'关闭猫咪补给站',exact:true}).evaluate((button:HTMLButtonElement)=>button.click());await expect(game(page).getByRole('dialog',{name:'猫咪补给站',exact:true})).toBeHidden();await expect(stick).toBeEnabled();await cdp.detach();
});
test('physical rotation and shorter browser viewport preserve the mounted battle',async({page,request},info)=>{
 await prepare(page,request,'alley.battle');const battle=game(page).getByTestId('chapter-battle'),attempt=await battle.getAttribute('data-attempt-id');await game(page).getByTestId('chapter-start').tap();
 await expect.poll(async()=>Number(await battle.getAttribute('data-elapsed'))).toBeGreaterThan(0);
 await game(page).getByTestId('chapter-cat-guard').tap();await expect(game(page).getByTestId('chapter-cat-menu')).toHaveAttribute('data-cat-id','guard');await game(page).getByRole('button',{name:'关闭猫咪菜单',exact:true}).tap();await expect(game(page).getByTestId('chapter-cat-menu')).toHaveCount(0);
 for(const viewport of [{width:844,height:390},{width:390,height:700},{width:390,height:844}]){
  const elapsed=Number(await battle.getAttribute('data-elapsed'));await page.setViewportSize(viewport);await expect(battle).toHaveAttribute('data-attempt-id',attempt!);await expect.poll(async()=>Number(await battle.getAttribute('data-elapsed'))).toBeGreaterThan(elapsed);await within(page,'.chapter-board,.btl-playback');
 }
 await page.screenshot({path:info.outputPath('battle-rotated.png')});
});
test('all six desktop battle boards stay inside the rotated viewport',async({page,request},info)=>{
 test.setTimeout(120000);
 for(const id of ['prologue.battle','alley.battle','market.battle','greenhouse.battle','rescue.battle','finale.battle']){
  await prepare(page,request,id);await within(page,'.battle-immersive,.btl-playback,.battle-hud-boss');const board=game(page).locator('.battle-immersive :is(.btl-board,.chapter-board,.market-board,.greenhouse-board,.tunnel-board,.finale-board)');await expect(board).toBeVisible();await within(page,'.battle-immersive :is(.btl-board,.chapter-board,.market-board,.greenhouse-board,.tunnel-board,.finale-board)');await page.screenshot({path:info.outputPath(id+'.png')});
 }
});
test('furniture tools, postal counter and nested manual receive rotated taps',async({page,request},info)=>{
 await prepare(page,request,'greenhouse.home_3');await expect(game(page).locator('.game-viewport canvas')).toHaveAttribute('data-home-artwork','ready');
 await game(page).getByRole('button',{name:'布置家具',exact:true}).tap();const editor=game(page).getByRole('region',{name:'家具背包 · 布置模式'});await expect(editor).toBeVisible();await game(page).getByRole('button',{name:'▼ 收起背包'}).tap();await expect(editor.locator('.backpack-grid')).toBeHidden();await game(page).getByRole('button',{name:'▲ 展开背包'}).tap();await expect(editor.locator('.backpack-grid')).toBeVisible();await game(page).getByRole('button',{name:'取消布置',exact:true}).tap();
 await game(page).getByRole('button',{name:'猫爪邮局',exact:true}).tap();const post=game(page).getByRole('dialog',{name:'猫爪邮局',exact:true});await expect(post.locator('.parcel-theme-preview canvas')).toHaveAttribute('data-artwork','ready');await post.locator('.postal-rules-button').tap();await within(page,'dialog.postal-info,dialog.postal-info>.modal-close');await page.screenshot({path:info.outputPath('postal-manual.png')});await game(page).getByRole('button',{name:'关闭邮局规则与收据',exact:true}).tap();await expect(post).toBeVisible();
});
test('mobile checkout leaves the whole page and restores the selected pack on return',async({page,request})=>{
 const {session}=await prepare(page,request,'greenhouse.home_3');await page.route('**/api/payment/config',route=>route.fulfill({json:{provider:'xsolla',sandbox:true}}));await page.route('**/api/payment/history?*',route=>route.fulfill({json:{playerId:session.playerId,txns:[]}}));
 await page.route('**/api/payment/session',route=>route.fulfill({json:{provider:'xsolla',txnId:'phone-token',url:new URL('/phone-checkout',page.url()).href,sandbox:true}}));await page.route('**/phone-checkout',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<button onclick="location.assign(\'/?payment=return&keep=1\')">返回游戏</button>'}));
 await game(page).getByRole('button',{name:'猫咪补给站',exact:true}).tap();await game(page).getByRole('button',{name:/罐头.*前往补给小站/}).tap();await game(page).locator('.pack-card').nth(1).tap();await game(page).getByRole('button',{name:'前往支付 ¥12.00',exact:true}).tap();await expect(page.getByRole('button',{name:'返回游戏'})).toBeVisible();await expect(page.locator('.phone-game-frame')).toHaveCount(0);expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('stray-kitty.payment-return.v1')!).packId)).toBe('pack_medium');await page.getByRole('button',{name:'返回游戏'}).tap();await expect(game(page).getByRole('dialog',{name:'金枪鱼补给小站',exact:true})).toBeVisible();await expect(game(page).locator('.pack-card').nth(1)).toHaveAttribute('aria-pressed','true');await expect.poll(()=>new URL(page.url()).searchParams.get('payment')).toBeNull();expect(new URL(page.url()).searchParams.get('keep')).toBe('1');
});
test('desktop keeps its layout without the mobile presentation',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:{width:1920,height:1080},hasTouch:false,isMobile:false});const page=await context.newPage();await page.goto('/');await expect(page.getByRole('button',{name:'暂不登录',exact:true})).toBeVisible();await expect(page.locator('.phone-game-frame')).toHaveCount(0);await page.getByRole('button',{name:'暂不登录',exact:true}).click();await expect(page.locator('.touch-controls')).not.toBeVisible();await context.close();
});
