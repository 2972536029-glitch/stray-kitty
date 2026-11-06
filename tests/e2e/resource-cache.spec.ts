import {expect,test} from '@playwright/test';

for(const mobile of [false,true])test(`${mobile?'phone':'desktop'}: idle static warming persists, survives another page and serves encoded assets offline`,async({browser,request,baseURL})=>{
 const manifest=await(await request.get('/resource-manifest.json')).json() as {version:string;resources:{url:string;revision:string;bytes:number}[]};
 const resources=manifest.resources.slice(0,3),context=await browser.newContext({baseURL,isMobile:mobile,hasTouch:mobile,viewport:mobile?{width:390,height:844}:{width:1920,height:1080}});
 await context.route('**/resource-manifest.json',route=>route.fulfill({json:{...manifest,resources}}));
 const page=await context.newPage();await page.addInitScript(()=>{
  const network=Object.assign(new EventTarget(),{saveData:true,effectiveType:'4g'});Object.defineProperty(navigator,'connection',{value:network});
  const nativeFetch=window.fetch;const calls:{url:string;priority?:string}[]=[];(window as unknown as {warmCalls:typeof calls}).warmCalls=calls;
  window.fetch=(input,init)=>{if(new Headers(init?.headers).get('X-Kitty-Warmup')==='1')calls.push({url:String(input),priority:(init as RequestInit&{priority?:string}).priority});return nativeFetch(input,init);};
 });
 await page.goto('/');const app=mobile?page.frameLocator('.phone-game-frame').locator('body'):page.locator('body');await expect(app.getByRole('button',{name:'登录',exact:true})).toBeVisible();
 await page.waitForTimeout(3500);expect(await app.evaluate(()=> (window as unknown as {warmCalls:unknown[]}).warmCalls.length)).toBe(0);
 await app.evaluate(()=>{const network=(navigator as Navigator&{connection:EventTarget&{saveData:boolean}}).connection;network.saveData=false;network.dispatchEvent(new Event('change'));});
 await expect.poll(()=>app.evaluate(async(_el,resources)=>{const cache=await caches.open('stray-kitty-static-v1');return(await Promise.all(resources.map(resource=>cache.match(new URL(resource.url+'?__kitty_revision='+resource.revision,location.origin).href)))).every(Boolean);},resources),{timeout:30000}).toBe(true);
 const calls=await app.evaluate(()=>(window as unknown as {warmCalls:{url:string;priority:string}[]}).warmCalls);expect(calls.length).toBeGreaterThan(0);expect(calls.every(call=>call.priority==='low')).toBe(true);
 const keys=await app.evaluate(async()=> (await(await caches.open('stray-kitty-static-v1')).keys()).map(key=>key.url));expect(keys.every(key=>new URL(key).pathname.startsWith('/assets/'))).toBe(true);
 await page.close();const again=await context.newPage();await again.goto('/');const body=mobile?again.frameLocator('.phone-game-frame').locator('body'):again.locator('body');await expect(body.getByRole('button',{name:'登录',exact:true})).toBeVisible();await expect.poll(()=>body.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await context.setOffline(true);const first=resources[0];expect(await body.evaluate(async(_el,resource)=>(await(await fetch(resource.url)).arrayBuffer()).byteLength,first)).toBe(first.bytes);
 expect(await body.evaluate(async()=>{try{await fetch('/api/payment/config',{cache:'no-store'});return false;}catch{return true;}})).toBe(true);
 await context.close();
});

test('interaction aborts a slow background transfer and pauses the next one',async({page,request})=>{
 const manifest=await(await request.get('/resource-manifest.json')).json() as {resources:{url:string;revision:string;bytes:number}[]};const resources=manifest.resources.slice(0,2);
 await page.route('**/resource-manifest.json',route=>route.fulfill({json:{...manifest,resources}}));
 await page.route('**'+resources[0].url,async route=>{if(route.request().headers()['x-kitty-warmup']==='1')await new Promise(resolve=>setTimeout(resolve,1500));try{await route.fulfill({response:await route.fetch()});}catch{/* The expected abort may close the request. */}});
 await page.addInitScript(()=>{
  const nativeFetch=window.fetch;const calls:{signal?:AbortSignal|null;started:number}[]=[];(window as unknown as {warmCalls:typeof calls}).warmCalls=calls;
  window.fetch=(input,init)=>{if(new Headers(init?.headers).get('X-Kitty-Warmup')==='1')calls.push({signal:init?.signal,started:performance.now()});return nativeFetch(input,init);};
 });
 await page.goto('/');await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as unknown as {warmCalls:unknown[]}).warmCalls.length),{timeout:20000}).toBe(1);
 await page.locator('.start-title h1').click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {warmCalls:{signal:AbortSignal}[]}).warmCalls[0].signal.aborted)).toBe(true);
 await page.waitForTimeout(800);expect(await page.evaluate(()=>(window as unknown as {warmCalls:unknown[]}).warmCalls.length)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {warmCalls:unknown[]}).warmCalls.length),{timeout:15000}).toBeGreaterThan(1);
});
