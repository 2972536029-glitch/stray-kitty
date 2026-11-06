import {expect,test,type Page,type APIRequestContext} from '@playwright/test';
import type {GameState,Session} from '../../web/src/contracts';

async function prepare(page:Page,request:APIRequestContext,checkpoint='greenhouse.home_3') {
  const session=await(await request.post('/api/v1/sessions')).json() as Session;
  const headers={Authorization:`Bearer ${session.token}`};
  const state=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  const result=await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':'shop-story-setup'},data:{expectedRevision:state.revision,command:{type:'QA_CHECKPOINT',checkpointId:checkpoint}}});
  expect(result.ok(),await result.text()).toBe(true);
  await page.addInitScript(session=>{
    localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));
    localStorage.setItem('stray-kitty.tutorial.home','done');
    localStorage.setItem('stray-kitty.prologue.intro','done');
  },session);
  await page.goto('/');await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  return {session,headers};
}
async function toolbar(page:Page){await expect(page.locator('.topbar')).toBeVisible();}
const recharge=(page:Page)=>page.getByRole('dialog',{name:'金枪鱼补给小站',exact:true});

for(const delayed of [false,true])test(`checkout restores recharge and selected pool; ${delayed?'delayed':'immediate'} credit opens one dismissible receipt`,async({page,request},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const {session,headers}=await prepare(page,request);
  let paid=false,reads=0,sessionCalls=0;
  const old={id:'xs-old',playerId:session.playerId,packId:'pack_medium',amount:1200,status:'confirmed',createdAt:new Date().toISOString()};
  await page.route('**/api/payment/config',route=>route.fulfill({json:{provider:'xsolla',sandbox:true}}));
  await page.route('**/api/payment/history?*',route=>{
    reads++;
    return route.fulfill({json:{playerId:session.playerId,txns:paid?[old,{...old,id:'xs-new-channel-id'}]:[old]}});
  });
  await page.route('**/api/payment/session',route=>{
    sessionCalls++;expect(route.request().postDataJSON().packId).toBe('pack_medium');
    return route.fulfill({json:{provider:'xsolla',txnId:'xs-token-id',url:new URL('/test-checkout',page.url()).href,sandbox:true}});
  });
  await page.route('**/test-checkout',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<button onclick="location.assign(\'/?payment=return&keep=1#receipt\')">返回游戏</button>'}));
  await toolbar(page);await page.getByRole('button',{name:'猫爪邮局',exact:true}).click();
  await page.getByRole('tab',{name:/月海观星/}).click();await page.getByRole('button',{name:/罐头.*前往补给小站/}).click();
  await recharge(page).locator('.pack-card').nth(1).click();
  await page.screenshot({path:info.outputPath('recharge-before-checkout.png')});
  await recharge(page).getByRole('button',{name:'前往支付 ¥12.00',exact:true}).click();
  await expect(page.getByRole('button',{name:'返回游戏'})).toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('stray-kitty.payment-return.v1')!));
  expect(saved.knownTxnIds).toEqual(['xs-old']);expect(saved.parcelPool).toBe('moonsea_observatory');
  const deliver=async()=>{
    const response=await request.post('/api/payment/charge',{data:{playerId:session.playerId,packId:'pack_medium',cardNumber:'4242424242424242'}});
    expect(response.ok(),await response.text()).toBe(true);paid=true;
  };
  if(!delayed)await deliver();
  await page.getByRole('button',{name:'返回游戏'}).click();
  await expect(recharge(page)).toBeVisible();await expect(recharge(page).locator('.pack-card').nth(1)).toHaveAttribute('aria-pressed','true');
  expect(new URL(page.url()).searchParams.get('payment')).toBeNull();expect(new URL(page.url()).searchParams.get('keep')).toBe('1');
  if(delayed){
    await expect(page.getByRole('dialog',{name:'充值到账啦'})).toHaveCount(0);
    // The old confirmed payment must not be mistaken for the new checkout.
    const previous=reads;await expect.poll(()=>reads).toBeGreaterThan(previous);
    await expect(page.getByRole('dialog',{name:'充值到账啦'})).toHaveCount(0);await deliver();
  }
  // Refresh reads the real game state; the payment service is mocked, no external charge.
  await expect(page.getByRole('dialog',{name:'充值到账啦'})).toContainText('+150');
  const before=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  await expect(recharge(page).locator('.recharge-balance')).toContainText(String(before.currencies.tuna));
  await page.screenshot({path:info.outputPath('credited.png')});
  await page.mouse.click(4,4);
  await expect(page.getByRole('dialog',{name:'充值到账啦'})).toHaveCount(0);
  await expect(recharge(page)).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.getItem('stray-kitty.payment-return.v1'))).toBeNull();
  await recharge(page).getByRole('button',{name:'关闭金枪鱼补给小站',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'猫爪邮局',exact:true})).toBeVisible();
  await expect(page.getByRole('tab',{name:/月海观星/})).toHaveAttribute('aria-selected','true');
  await page.reload();await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  await expect(page.getByRole('dialog',{name:'充值到账啦'})).toHaveCount(0);
  const after=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  expect(after.revision).toBe(before.revision);expect(after.currencies).toEqual(before.currencies);expect(sessionCalls).toBe(1);expect(errors).toEqual([]);
});

test('desktop home menu puts decorate before manual and tutorial follows the button below the menu',async({page,request},info)=>{
  await prepare(page,request);
  await page.evaluate(()=>localStorage.removeItem('stray-kitty.tutorial.home'));
  // This init script takes precedence over prepare's one-time tutorial shortcut.
  await page.addInitScript(()=>localStorage.removeItem('stray-kitty.tutorial.home'));
  await page.reload();await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  for(const viewport of [{width:1366,height:768},{width:1920,height:1080},{width:2549,height:1403}]){
    await page.setViewportSize(viewport);
    await expect(page.locator('.tutorial-card')).toBeVisible();
    await expect.poll(async()=>{
      const button=(await page.getByRole('button',{name:'布置家具',exact:true}).boundingBox())!,ring=(await page.locator('.tutorial-ring').boundingBox())!;
      return Math.abs(ring.x+10-button.x)+Math.abs(ring.y+10-button.y);
    }).toBeLessThan(1);
    const names=await page.getByRole('navigation',{name:'旅程工具'}).getByRole('button').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')));
    expect(names.slice(0,2)).toEqual(['布置家具','家园手册']);
    const menu=(await page.locator('.topbar').boundingBox())!,card=(await page.locator('.tutorial-card').boundingBox())!;
    expect(card.y).toBeGreaterThan(menu.y+menu.height+10);expect(card.x).toBeGreaterThanOrEqual(16);expect(card.x+card.width).toBeLessThanOrEqual(viewport.width-16);
    await page.screenshot({path:info.outputPath(`home-tutorial-${viewport.width}.png`)});
  }
  await page.getByRole('button',{name:'知道了',exact:true}).click();await expect(page.locator('.tutorial-card')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('stray-kitty.tutorial.home'))).toBe('done');
  await page.getByRole('button',{name:'布置家具',exact:true}).click();await expect(page.getByRole('region',{name:'家具背包 · 布置模式'})).toBeVisible();
});

test('task rewards show both currencies, clicks consume only the receipt and retry does not claim twice',async({page,request},info)=>{
  const {headers}=await prepare(page,request);await toolbar(page);await page.getByRole('button',{name:'猫咪补给站',exact:true}).click();
  const shop=page.getByRole('dialog',{name:'猫咪补给站',exact:true});
  await shop.getByTestId('claim-market_letter').click();
  let receipt=page.getByRole('dialog',{name:'领取成功'});await expect(receipt).toContainText('+2');await expect(receipt).toContainText('+30');
  await page.screenshot({path:info.outputPath('task-rewards.png')});
  await receipt.getByText('猫爪邮票', {exact:true}).click();await expect(receipt).toHaveCount(0);await expect(shop).toBeVisible();await expect(shop.getByTestId('claim-market_letter')).toBeDisabled();
  let dropped=false;
  await page.route('**/api/v1/commands',async route=>{
    if(!dropped&&route.request().postDataJSON().command.type==='CLAIM_PARCEL_REWARD'){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();
  });
  const before=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  await shop.getByTestId('claim-daily_letter').click();await expect(shop.getByRole('alert')).toBeVisible();await expect(receipt).toHaveCount(0);
  await shop.getByRole('button',{name:'重试上次操作'}).click();receipt=page.getByRole('dialog',{name:'领取成功'});await expect(receipt).toContainText('+1');
  await page.keyboard.press('Escape');await expect(receipt).toHaveCount(0);
  const after=await(await request.get('/api/v1/state',{headers})).json() as GameState;expect(after.currencies.stamp).toBe(before.currencies.stamp+1);
});

test('skip stops at a choice, then the next scene, then the tutorial battle',async({page,request},info)=>{
  const {headers}=await prepare(page,request,'prologue.story');
  const state=async()=>await(await request.get('/api/v1/state',{headers})).json() as GameState;
  await page.getByRole('button',{name:/跳过剧情/}).click();await expect(page.getByRole('dialog',{name:'这一刻，想怎么回应？'})).toBeVisible();
  expect((await state()).storyNodeId).toBe('prologue_sneak');
  await page.getByRole('button',{name:/诚实撒娇/}).click();
  for(const viewport of [{width:1440,height:900},{width:1920,height:1080},{width:2549,height:1403}]){
    await page.setViewportSize(viewport);
    const card=page.getByRole('region',{name:'剧情对话'});
    await expect.poll(()=>card.evaluate(el=>{
      const c=el.getBoundingClientRect(),a=el.querySelector('.dialogue-avatar')!.getBoundingClientRect();
      return Math.abs(a.y+a.height/2-c.y-c.height/2);
    })).toBeLessThan(1);
    expect(await card.evaluate(el=>{
      const c=el.getBoundingClientRect(),a=el.querySelector('.dialogue-avatar')!.getBoundingClientRect();
      return a.top>=c.top&&a.bottom<=c.bottom;
    })).toBe(true);
  }
  await page.setViewportSize({width:1440,height:900});await page.screenshot({path:info.outputPath('centered-miaomiao.png')});
  await page.getByRole('button',{name:/跳过剧情/}).click();
  await expect.poll(async()=>(await state()).storyNodeId).toBe('prologue_street');
  await page.getByRole('button',{name:/跳过剧情/}).click();
  await expect.poll(async()=>(await state()).phase).toBe('battle');
});

test('chapter one skip leaves its attitude choice to the player and then enters exploration',async({page,request})=>{
  const {headers}=await prepare(page,request,'alley.story');
  const state=async()=>await(await request.get('/api/v1/state',{headers})).json() as GameState;
  await page.getByRole('button',{name:/跳过剧情/}).click();await expect(page.getByRole('dialog',{name:'这一刻，想怎么回应？'})).toBeVisible();
  expect((await state()).storyNodeId).toBe('prologue_banter');
  await page.getByRole('button',{name:/傲娇嘴硬/}).click();await page.getByRole('button',{name:/跳过剧情/}).click();
  await expect.poll(async()=>(await state()).phase).toBe('explore');
});

test('opening cinematic skip reaches the first choice instead of starting the same narration again',async({page,request})=>{
  const {headers}=await prepare(page,request,'prologue.story');
  await page.goto('/?prologue');await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  await page.getByRole('dialog',{name:'序章',exact:true}).getByRole('button',{name:/跳过剧情/}).click();
  await expect(page.getByRole('dialog',{name:'这一刻，想怎么回应？'})).toBeVisible();
  const state=await(await request.get('/api/v1/state',{headers})).json() as GameState;expect(state.storyNodeId).toBe('prologue_sneak');
});

for(const viewport of [{width:1600,height:900},{width:1366,height:768},{width:2549,height:1403}])test(`checkout layout fits ${viewport.width}x${viewport.height}`,async({page,request},info)=>{
  await page.setViewportSize(viewport);await page.route('**/api/payment/config',route=>route.fulfill({json:{provider:'xsolla',sandbox:true}}));
  await prepare(page,request);await toolbar(page);await page.getByRole('button',{name:'猫咪补给站',exact:true}).click();await page.getByRole('button',{name:/罐头.*前往补给小站/}).click();
  const dialog=recharge(page);await expect(dialog.locator('.pack-card')).toHaveCount(3);
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await dialog.locator('.pack-card strong').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(22);
  expect(await dialog.locator('.pack-quantity').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28);
  await dialog.getByRole('button',{name:'前往支付 ¥6.00',exact:true}).scrollIntoViewIfNeeded();await expect(dialog.getByRole('button',{name:'前往支付 ¥6.00',exact:true})).toBeInViewport();
  const footer=(await dialog.locator('.recharge-dialog>footer').boundingBox())!,frame=(await dialog.boundingBox())!;
  expect(frame.y+frame.height-footer.y-footer.height).toBeLessThan(40);
  await page.screenshot({path:info.outputPath('recharge-layout.png')});
});

test('desktop HUD and dialogue keep their proportions while resizing without advancing the story',async({page,request},info)=>{
  const {headers}=await prepare(page,request,'alley.story');
  const initial=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  const catalog=await(await request.get('/api/v1/content')).json();
  await expect(page.locator('.story-dialogue .dialogue-copy p')).toHaveText(catalog.story.find((node:{id:string})=>node.id===initial.storyNodeId).text);
  let proportions:{dialogue:number;speaker:number;menu:number}|undefined;
  for(const viewport of [{width:1920,height:1080},{width:1600,height:900},{width:1280,height:720},{width:1024,height:576},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);
    await expect.poll(()=>page.evaluate(()=>Number(getComputedStyle(document.documentElement).getPropertyValue('--desktop-ui-scale')))).toBeCloseTo(Math.min(1,viewport.width/1920,viewport.height/1080),3);
    const frame=(await page.locator('.story-dialogue').boundingBox())!,speaker=(await page.locator('.story-dialogue .speaker').boundingBox())!,menu=(await page.locator('.topbar').boundingBox())!;
    const current={dialogue:frame.height/viewport.height,speaker:speaker.height/viewport.height,menu:menu.height/viewport.height};
    if(proportions){for(const key of ['dialogue','speaker','menu'] as const)expect(Math.abs(current[key]-proportions[key])).toBeLessThan(.005);}else proportions=current;
    expect(frame.x).toBeGreaterThanOrEqual(0);expect(frame.y+frame.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.locator('.topbar nav').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath(`desktop-dialogue-${viewport.width}.png`)});
  }
  const after=await(await request.get('/api/v1/state',{headers})).json() as GameState;expect(after.revision).toBe(initial.revision);expect(after.storyNodeId).toBe(initial.storyNodeId);
  await page.getByRole('button',{name:'继续故事'}).click();await expect.poll(async()=>(await(await request.get('/api/v1/state',{headers})).json()).storyNodeId).not.toBe(initial.storyNodeId);
});
