import {expect, test, type Page, type APIRequestContext} from '@playwright/test';
import type {Session, GameState} from '../../web/src/contracts';

async function prepare(page: Page, request: APIRequestContext, checkpoint: string) {
  const session = await (await request.post('/api/v1/sessions')).json() as Session;
  const headers = {Authorization: `Bearer ${session.token}`};
  const state = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  const setup = await request.post('/api/v1/commands', {headers: {...headers,'Idempotency-Key':'sharp-'+checkpoint.replace(/\./g,'-')},
    data: {expectedRevision:state.revision,command:{type:'QA_CHECKPOINT',checkpointId:checkpoint}}});
  expect(setup.ok(),await setup.text()).toBe(true);
  await page.addInitScript(session=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session)),session);
  await page.goto('/');await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  const canvas=page.locator('.game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-background-state','ready');
  return canvas;
}

for(const dpr of [1,1.25,2]) for(const map of ['market','tunnel'] as const) test.describe(map+' density '+dpr,()=>{
  test.use({deviceScaleFactor:dpr,viewport:{width:1600,height:900}});
  test('native drawing preserves framing, aligns camera motion and survives resizing',async({page,request})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      Object.assign(window,{mapRenderSamples:[]});const original=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(...args:Parameters<typeof original>){
        if(args.length===5&&args[0] instanceof HTMLImageElement&&/night_market_|chapter4_L/.test(args[0].src)&&this.canvas.closest('.game-viewport')){
          const {a,d,e,f}=this.getTransform();
          const samples=(window as unknown as {mapRenderSamples:unknown[]}).mapRenderSamples;
          samples.push({a,d,e,f,right:e+a*1672,bottom:f+d*941,width:this.canvas.width,height:this.canvas.height});if(samples.length>120)samples.shift();
        }
        return original.apply(this,args);
      };
    });
    const canvas=await prepare(page,request,map==='market'?'market.explore':'rescue.explore');
    await expect(canvas).toHaveAttribute('width',String(1600*dpr));await expect(canvas).toHaveAttribute('height',String(960*dpr));
    await expect(canvas).toHaveAttribute('data-map-artwork','enhanced');
    const axis='x',key=map==='market'?'ArrowRight':'ArrowLeft';
    const before=Number(await canvas.getAttribute('data-player-'+axis));
    await page.evaluate(()=>{(window as unknown as {mapRenderSamples:unknown[]}).mapRenderSamples.length=0;});
    await canvas.focus();await page.keyboard.down(key);
    try{
      if(map==='market')await expect.poll(async()=>Number(await canvas.getAttribute('data-player-'+axis))).toBeGreaterThan(before+12);
      else await expect.poll(async()=>Number(await canvas.getAttribute('data-player-'+axis))).toBeLessThan(before-25);
      await page.waitForFunction(()=>(window as unknown as {mapRenderSamples:unknown[]}).mapRenderSamples.length>10);
    }
    finally{await page.keyboard.up(key);}
    const samples=await page.evaluate(()=>(window as unknown as {mapRenderSamples:{a:number;d:number;e:number;f:number;right:number;bottom:number}[]}).mapRenderSamples);
    expect(samples.length).toBeGreaterThan(5);
    const logicalScale=map==='market'?Math.sqrt(800*450/(900*520)):.75;
    expect(samples.every(s=>Math.abs(s.a-logicalScale*2*dpr)<.0001&&Math.abs(s.d-logicalScale*2*dpr)<.0001)).toBe(true);
    expect(samples.every(s=>Math.abs(s.e-Math.round(s.e))<.0001&&Math.abs(s.f-Math.round(s.f))<.0001)).toBe(true);
    expect(new Set(samples.map(s=>s.e)).size).toBeGreaterThan(2);
    // Market clips to its visible object-fit viewport; Tunnel covers the full canvas.
    expect(samples.every(s=>s.e<=.001&&s.f<=(map==='market'?30*dpr:.001)&&s.right>=1600*dpr-.001&&s.bottom>=(map==='market'?930:960)*dpr-.001)).toBe(true);
    const position=[await canvas.getAttribute('data-player-x'),await canvas.getAttribute('data-player-y')];
    await page.setViewportSize({width:1333,height:777});await expect(canvas).toHaveAttribute('width',String(Math.ceil(1333*dpr/5)*5));
    expect([await canvas.getAttribute('data-player-x'),await canvas.getAttribute('data-player-y')]).toEqual(position);
    await expect(page.locator('.alley-label-layer')).toHaveCount(1);expect(errors).toEqual([]);
  });
});

for(const [map,checkpoint] of [['market','market.explore'],['tunnel','rescue.explore']] as const){
  test(map+' stays playable during a delayed enhancement and preserves position on swap',async({page,request})=>{
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route(/enhanced-v1.*\.webp/,async route=>{await gate;await route.continue();});
    try{
      const canvas=await prepare(page,request,checkpoint);await expect(canvas).toHaveAttribute('data-map-artwork','original');
      const axis=map==='market'?'y':'x',key=map==='market'?'ArrowUp':'ArrowLeft';
      const before=Number(await canvas.getAttribute('data-player-'+axis));await canvas.focus();await page.keyboard.down(key);
      try{await expect.poll(async()=>Number(await canvas.getAttribute('data-player-'+axis))).toBeLessThan(before-12);}
      finally{await page.keyboard.up(key);}
      const position=[await canvas.getAttribute('data-player-x'),await canvas.getAttribute('data-player-y')];release();
      await expect(canvas).toHaveAttribute('data-map-artwork','enhanced');expect([await canvas.getAttribute('data-player-x'),await canvas.getAttribute('data-player-y')]).toEqual(position);
    }finally{release();}
  });
  test(map+' retains original artwork when enhancement fails',async({page,request})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route(/enhanced-v1.*\.webp/,route=>route.fulfill({contentType:'image/webp',body:'invalid image'}));
    const failed=page.waitForResponse(response=>response.url().includes('enhanced-v1'));
    const canvas=await prepare(page,request,checkpoint);await failed;await expect(canvas).toHaveAttribute('data-map-artwork','original');
    const axis=map==='market'?'y':'x',key=map==='market'?'ArrowUp':'ArrowLeft',before=Number(await canvas.getAttribute('data-player-'+axis));
    await canvas.focus();await page.keyboard.down(key);try{await expect.poll(async()=>Number(await canvas.getAttribute('data-player-'+axis))).toBeLessThan(before-12);}finally{await page.keyboard.up(key);}
    expect(errors).toEqual([]);
  });
}
