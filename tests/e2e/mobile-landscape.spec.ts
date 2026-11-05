import {expect, test, type Page, type APIRequestContext} from '@playwright/test';

test.use({isMobile:true,hasTouch:true,deviceScaleFactor:1,viewport:{width:844,height:390}});
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    for(const key of ['prologue.intro','tutorial.home','tutorial.battle'])localStorage.setItem(`stray-kitty.${key}`,'done');
  });
});

async function open(page:Page){
  await page.goto('/');await expect(page.getByRole('button',{name:/^(暂不登录|继续冒险)/})).toBeVisible();
}
async function checkpoint(page:Page,request:APIRequestContext,id:string){
  const token=await page.evaluate(()=>JSON.parse(localStorage.getItem('stray-kitty.session.v1')!).token);
  const headers={Authorization:`Bearer ${token}`};
  const state=await(await request.get('/api/v1/state',{headers})).json();
  const result=await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':crypto.randomUUID()},data:{expectedRevision:state.revision,command:{type:'QA_CHECKPOINT',checkpointId:id}}});
  expect(result.ok(),await result.text()).toBe(true);
  await page.reload();await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.map-loading-panel')).toHaveCount(0);
}
async function withinViewport(page:Page,selector:string){
  const boxes=await page.locator(selector).evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>{
    const r=e.getBoundingClientRect();return {name:e.getAttribute('aria-label')??e.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};
  }));
  expect(boxes.length).toBeGreaterThan(0);
  for(const b of boxes){expect(b.x,b.name).toBeGreaterThanOrEqual(-1);expect(b.y,b.name).toBeGreaterThanOrEqual(-1);expect(b.right,b.name).toBeLessThanOrEqual(b.w+1);expect(b.bottom,b.name).toBeLessThanOrEqual(b.h+1);}
}
async function position(page:Page){
  return page.locator('.game-viewport canvas').evaluate((c:HTMLCanvasElement)=>({x:Number(c.dataset.playerX),y:Number(c.dataset.playerY)}));
}

for(const size of [{width:667,height:320},{width:844,height:390},{width:932,height:430}]){
  test(`landscape ${size.width}x${size.height}: title actions, toolbar and scrollable shop stay reachable`,async({page,request},info)=>{
    await page.setViewportSize(size);await open(page);
    await withinViewport(page,'.start-actions button');
    await page.screenshot({path:info.outputPath('title.png')});
    await checkpoint(page,request,'alley.explore');
    await withinViewport(page,'.touch-stick,.touch-actions button,.topbar nav button');
    const header=await page.locator('.topbar').boundingBox();expect(header!.height).toBeLessThanOrEqual(50);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(size.width);
    await page.locator('.topbar').getByRole('button',{name:'猫咪补给站',exact:true}).tap();
    await expect(page.getByRole('dialog',{name:'猫咪补给站'})).toBeVisible();
    await withinViewport(page,'dialog[open]');
    await page.locator('dialog[open]').evaluate(e=>e.scrollTop=e.scrollHeight);
    await withinViewport(page,'dialog[open]>.modal-close');
    await page.getByRole('button',{name:'关闭猫咪补给站',exact:true}).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

for(const id of ['alley.explore','market.explore','rescue.explore','finale.explore']){
  test(`${id}: real touch joystick moves, releases and stops when a dialog opens`,async({page,request})=>{
    await open(page);await checkpoint(page,request,id);
    const stick=page.getByRole('button',{name:'移动摇杆，按住拖动控制方向'});
    await expect(stick).toBeEnabled();
    const r=(await stick.boundingBox())!,x=r.x+r.width/2,y=r.y+r.height/2;
    const cdp=await page.context().newCDPSession(page);
    let moved=false;
    for(const [dx,dy] of [[32,0],[0,-32],[-32,0],[0,32]]){
      const before=await position(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy,id:1}]});
      await page.waitForTimeout(220);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const after=await position(page);
      if(Math.hypot(after.x-before.x,after.y-before.y)>2){moved=true;break;}
    }
    expect(moved,'one of four directions must move the actual chapter player').toBe(true);
    await page.waitForTimeout(250);const stopped=await position(page);await page.waitForTimeout(200);
    expect(await position(page)).toEqual(stopped);
    // Keep the moving thumb down while the shop opens.
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+30,y,id:1}]});
    // Trigger the existing toolbar action while the captured pointer is down;
    // the layout tests above exercise the same button through a real tap.
    await page.locator('.topbar .shop-button').evaluate((button:HTMLButtonElement)=>button.click());
    await expect(page.getByRole('dialog',{name:'猫咪补给站'})).toBeVisible();
    await expect(stick).toBeDisabled();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.getByRole('button',{name:'关闭猫咪补给站',exact:true}).tap();
    await page.waitForTimeout(250);const resumed=await position(page);await page.waitForTimeout(200);
    expect(await position(page)).toEqual(resumed);
    await cdp.detach();
  });
}

test('portrait pauses the mounted battle, then rotation resumes the same attempt',async({page,request},info)=>{
  await open(page);await checkpoint(page,request,'alley.battle');
  const battle=page.getByTestId('chapter-battle');const attempt=await battle.getAttribute('data-attempt-id');
  await page.getByTestId('chapter-start').tap();
  await expect.poll(async()=>Number(await battle.getAttribute('data-elapsed'))).toBeGreaterThan(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('dialog',{name:'请横屏游玩'})).toBeVisible();
  await page.waitForTimeout(100);const elapsed=await battle.getAttribute('data-elapsed');
  await page.waitForTimeout(250);expect(await battle.getAttribute('data-elapsed')).toBe(elapsed);
  await page.screenshot({path:info.outputPath('portrait.png')});
  await page.setViewportSize({width:844,height:390});
  await expect(page.getByRole('dialog',{name:'请横屏游玩'})).toHaveCount(0);
  await expect(battle).toHaveAttribute('data-attempt-id',attempt!);
  await expect.poll(async()=>Number(await battle.getAttribute('data-elapsed'))).toBeGreaterThan(Number(elapsed));
});

test('all six battle boards fit the short screen and keep their controls visible',async({page,request},info)=>{
  test.setTimeout(90000);await open(page);
  for(const id of ['prologue.battle','alley.battle','market.battle','greenhouse.battle','rescue.battle','finale.battle']){
    await checkpoint(page,request,id);
    await withinViewport(page,'.battle-immersive,.btl-playback,.battle-hud-boss');
    const board=page.locator('.battle-immersive :is(.btl-board,.chapter-board,.market-board,.greenhouse-board,.tunnel-board,.finale-board)');
    await expect(board).toBeVisible();await expect.poll(async()=>(await board.boundingBox())!.width).toBeGreaterThan(280);
    await withinViewport(page,'.battle-immersive :is(.btl-board,.chapter-board,.market-board,.greenhouse-board,.tunnel-board,.finale-board)');
    await page.screenshot({path:info.outputPath(`${id}.png`)});
  }
});

test('home manual and furniture controls work on a small landscape phone',async({page,request},info)=>{
  page.setDefaultTimeout(10000);
  await page.setViewportSize({width:667,height:320});await open(page);await checkpoint(page,request,'greenhouse.home_3');
  await page.locator('.topbar').getByRole('button',{name:'家园手册',exact:true}).tap();
  await expect(page.locator('dialog.home-hub')).toBeVisible();await withinViewport(page,'dialog.home-hub,dialog.home-hub>.modal-close');
  await page.getByRole('button',{name:'关闭家园手册',exact:true}).tap();
  if(!await page.locator('.topbar').getByRole('button',{name:'布置家具',exact:true}).isVisible())await page.getByRole('button',{name:'展开顶部信息栏（可拖拽）'}).tap();
  await page.locator('.topbar').getByRole('button',{name:'布置家具',exact:true}).tap();
  await expect(page.getByRole('region',{name:'家具背包 · 布置模式'})).toBeVisible();
  await withinViewport(page,'.backpack-header button,.backpack-toolbar button,.backpack-bag');
  await page.getByRole('button',{name:'▼ 收起背包'}).tap();await expect(page.locator('.backpack-grid')).toBeHidden();
  await page.getByRole('button',{name:'▲ 展开背包'}).tap();await expect(page.locator('.backpack-grid')).toBeVisible();
  await page.screenshot({path:info.outputPath('home-backpack.png')});
  await page.getByRole('button',{name:'取消布置',exact:true}).tap();
  await expect(page.getByRole('region',{name:'家具背包 · 布置模式'})).toHaveCount(0);
  if(!await page.locator('.topbar').getByRole('button',{name:'猫爪邮局',exact:true}).isVisible())await page.getByRole('button',{name:'展开顶部信息栏（可拖拽）'}).tap();
  await page.locator('.topbar').getByRole('button',{name:'猫爪邮局',exact:true}).tap();
  await page.getByTestId('parcel-draw').scrollIntoViewIfNeeded();
  await withinViewport(page,'[data-testid=parcel-draw],dialog[open]>.modal-close');
});

test('desktop keeps its original layout without touch or rotation overlays',async({browser,baseURL})=>{
  const context=await browser.newContext({baseURL,viewport:{width:1440,height:900},hasTouch:false,isMobile:false});
  const page=await context.newPage();await open(page);await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  await expect(page.locator('.touch-controls')).not.toBeVisible();await expect(page.getByRole('dialog',{name:'请横屏游玩'})).toHaveCount(0);
  await context.close();
});
