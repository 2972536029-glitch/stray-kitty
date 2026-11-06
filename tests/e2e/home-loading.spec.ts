import {expect,test,type APIRequestContext,type Page} from '@playwright/test';
import type {CommandResponse,GameState,Session} from '../../web/src/contracts';
import {HOME_ATLASES,HOME_FRAMES} from '../../web/src/modules/home/assets';
import {homeObjects} from '../../web/src/modules/home/objects';

async function prepare(page:Page,request:APIRequestContext,checkpointId:string){
  const session=await(await request.post('/api/v1/sessions')).json() as Session;
  const headers={Authorization:`Bearer ${session.token}`};
  const state=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  const response=await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':'home-loading'},data:{expectedRevision:state.revision,command:{type:'QA_CHECKPOINT',checkpointId}}});
  expect(response.ok()).toBe(true);
  await page.addInitScript(session=>{localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));localStorage.setItem('stray-kitty.tutorial.home','done');localStorage.setItem('stray-kitty.hud.topbar','expanded');},session);
  return (await response.json() as CommandResponse).state;
}

for(const checkpoint of ['greenhouse.home_1','greenhouse.home_2','greenhouse.home_3','finale.celebration']){
  test(`${checkpoint} downloads only visible furniture sheets and reuses them on reentry`,async({page,request},info)=>{
    const state=await prepare(page,request,checkpoint);
    const sheets=[...new Set(['atlas',...homeObjects(state).map(object=>HOME_FRAMES[object.sprite].sheet)])] as (keyof typeof HOME_ATLASES)[];
    const expected=sheets.map(sheet=>HOME_ATLASES[sheet].replace(/\.png$/,'.lossless.webp')).sort();
    const images:string[]=[],errors:string[]=[];
    page.on('request',request=>{if(request.resourceType()==='image')images.push(new URL(request.url()).pathname);});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/assets/home/*',route=>expected.includes(new URL(route.request().url()).pathname)?route.continue():route.abort('failed'));
    await page.goto('/',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
    const canvas=page.locator('.game-viewport canvas');
    await expect(canvas).toHaveAttribute('data-home-artwork','ready');
    expect(images.filter(url=>url.startsWith('/assets/home/')).sort()).toEqual(expected);
    expect(images.filter(url=>/rainy-alley-background|night_market_|chapter4_/.test(url))).toEqual([]);
    await page.screenshot({path:info.outputPath(checkpoint+'-loaded.png')});
    images.length=0;
    await page.getByRole('button',{name:'返回标题',exact:true}).click();
    await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
    await expect(canvas).toHaveAttribute('data-home-artwork','ready');
    expect(images.filter(url=>url.startsWith('/assets/home/'))).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('home furniture retains its PNG fallback when a lossless sheet is unavailable',async({page,request})=>{
  await prepare(page,request,'greenhouse.home_1');
  const fallbacks:string[]=[],errors:string[]=[];
  await page.route('**/assets/home/*.webp',route=>route.abort('failed'));
  page.on('response',response=>{if(response.ok()&&/\/assets\/home\/.*\.png$/.test(response.url()))fallbacks.push(response.url());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  await expect(page.locator('.game-viewport canvas')).toHaveAttribute('data-home-artwork','ready');
  expect(fallbacks.some(url=>url.endsWith('/components.png'))).toBe(true);
  expect(fallbacks.some(url=>url.endsWith('/furniture-shelter-v3.png'))).toBe(true);
  expect(new Set(fallbacks).size).toBe(fallbacks.length);
  expect(errors).toEqual([]);
});

test('postal themes load on demand and share decoded sheets with the furniture collection',async({page,request})=>{
  await prepare(page,request,'greenhouse.home_1');
  const parcels:string[]=[],errors:string[]=[];
  page.on('request',request=>{if(/furniture-parcels-/.test(request.url()))parcels.push(new URL(request.url()).pathname);});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  await expect(page.locator('.game-viewport canvas')).toHaveAttribute('data-home-artwork','ready');
  expect(parcels).toEqual([]);
  await page.getByRole('button',{name:'猫爪邮局',exact:true}).click();
  const preview=page.locator('.parcel-theme-preview canvas');
  await expect(preview).toHaveAttribute('data-artwork','ready');
  expect(parcels).toEqual(['/assets/home/furniture-parcels-moss-v2.lossless.webp']);
  await page.getByRole('tab',{name:/月海观星/}).click();
  await expect(preview).toHaveAttribute('data-artwork','ready');
  expect(parcels).toHaveLength(2);
  await page.getByRole('tab',{name:/苔叶来信/}).click();
  await expect(preview).toHaveAttribute('data-artwork','ready');
  expect(parcels).toHaveLength(2);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'家园手册',exact:true}).click();
  await page.getByRole('button',{name:'家具收藏',exact:true}).click();
  const furniture=page.locator('.home-hub-collection canvas');
  await expect(furniture.first()).toBeVisible();
  await expect.poll(()=>furniture.evaluateAll(canvases=>canvases.every(canvas=>{
    const element=canvas as HTMLCanvasElement;
    return element.getContext('2d')!.getImageData(0,0,element.width,element.height).data.some((value,index)=>index%4===3&&value>0);
  }))).toBe(true);
  expect(parcels).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('placing stored parcel furniture loads its sheet into the existing scene and saves the layout',async({page,request})=>{
  await prepare(page,request,'greenhouse.home_1');
  await page.addInitScript(()=>{
    const original=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args:Parameters<typeof original>){
      original.apply(this,args);
      if(args[0] instanceof HTMLImageElement&&args[0].src.includes('furniture-parcels-moss'))this.canvas.dataset.paintedParcel='true';
    };
  });
  const images:string[]=[],errors:string[]=[];
  page.on('request',request=>{if(request.url().includes('furniture-parcels-moss'))images.push(request.url());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  const canvas=page.locator('.game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-home-artwork','ready');
  const original=await canvas.elementHandle();
  await page.getByRole('button',{name:'布置家具',exact:true}).click();
  const editor=page.getByRole('region',{name:'家具背包 · 布置模式'});
  const card=editor.locator('[data-layout-key="furniture:moss_cottage"]');
  await expect.poll(()=>card.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>0))).toBe(true);
  await card.locator('.backpack-item').click();
  await card.getByRole('button',{name:'放入场景',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-painted-parcel','true');
  expect(await canvas.evaluate((canvas,original)=>canvas===original,original)).toBe(true);
  const [saved]=await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/v1/commands')&&response.request().method()==='POST'),editor.getByRole('button',{name:'保存布置',exact:true}).click()]);
  expect(saved.ok()).toBe(true);
  expect((await saved.json()).state.homeLayout['furniture:moss_cottage'].stored).toBe(false);
  await expect(editor).not.toBeVisible();
  await expect(canvas).toHaveAttribute('data-home-artwork','ready');
  expect(images).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('repairs load newly visible stage sheets and reuse earlier artwork throughout both upgrades',async({page,request})=>{
  await page.setViewportSize({width:1920,height:1000});
  await prepare(page,request,'greenhouse.home_1');
  const images:string[]=[],errors:string[]=[];
  page.on('request',request=>{if(request.url().includes('/assets/home/'))images.push(request.url());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  const canvas=page.locator('.game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-home-artwork','ready');
  for(const [stage,repairs] of [[2,['patch_windows','stop_roof_leaks','dry_bedding']],[3,['reinforce_floor','restore_skylight','revive_garden']]] as const){
    for(const repair of repairs){
      await page.locator(`[data-repair-id="${repair}"]`).click();
      await page.getByRole('button',{name:'修补这里',exact:true}).click();
      await expect(page.locator(`[data-repair-id="${repair}"]`)).toHaveCount(0);
      await expect(canvas).toHaveAttribute('data-home-renovation','null');
    }
    await expect(canvas).toHaveAttribute('data-home-stage',String(stage));
    await expect(canvas).toHaveAttribute('data-home-artwork','ready');
  }
  expect(images.some(url=>url.includes('furniture-improvised-v3.lossless.webp'))).toBe(true);
  expect(images.some(url=>url.includes('furniture-timber-v3.lossless.webp'))).toBe(true);
  expect(new Set(images).size).toBe(images.length);
  expect(errors).toEqual([]);
});
