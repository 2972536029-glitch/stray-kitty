import {expect,test} from '@playwright/test';

const phoneUA='Mozilla/5.0 (Linux; Android 14; V2307A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const desktopUA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
for(const mode of ['phone-ua','touch-with-desktop-ua','embedded-phone'] as const)test(`${mode}: first-entry prologue uses the sideways game viewport even without pointer media reports`,async({browser,baseURL,request},info)=>{
 const session=await(await request.post('/api/v1/sessions')).json();const headers={Authorization:`Bearer ${session.token}`};
 const state=await(await request.get('/api/v1/state',{headers})).json();
 const setup=await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':'phone-detection'},data:{expectedRevision:state.revision,command:{type:'QA_CHECKPOINT',checkpointId:'prologue.story'}}});expect(setup.ok(),await setup.text()).toBe(true);
 const context=await browser.newContext({baseURL,viewport:{width:393,height:852},screen:{width:393,height:873},isMobile:true,hasTouch:true,userAgent:mode==='touch-with-desktop-ua'?desktopUA:phoneUA});
 await context.addInitScript(({session,mode})=>{
  localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));
  const nativeMatch=window.matchMedia.bind(window);window.matchMedia=query=>{const media=nativeMatch(query);if(/pointer|hover/.test(query))Object.defineProperty(media,'matches',{value:false});return media;};
  if(mode==='phone-ua')Object.defineProperty(navigator,'maxTouchPoints',{value:0});
 },{session,mode});
 const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 if(mode==='embedded-phone')await page.route('**/phone-host',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><iframe class="hosted-game" src="/?prologue=1" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>'}));
 await page.goto(mode==='embedded-phone'?'/phone-host':'/?prologue=1');
 const host=mode==='embedded-phone'?page.frameLocator('.hosted-game'):page;
 await expect(host.locator('.phone-game-frame')).toBeVisible();const game=host.frameLocator('.phone-game-frame');
 await expect(host.locator('.phone-game-frame')).toHaveAttribute('data-angle','90');
 await game.getByRole('button',{name:'暂不登录',exact:true}).tap();await expect(game.getByRole('dialog',{name:'序章',exact:true})).toBeVisible();
 expect(await game.locator('html').evaluate(()=>innerWidth)).toBe(1920);
 await expect(game.locator('.prologue-text')).toContainText('午后的阳光');
 await page.screenshot({path:info.outputPath('first-entry-prologue.png')});
 await game.getByRole('dialog',{name:'序章',exact:true}).getByRole('button',{name:/跳过剧情/}).tap();await expect(game.getByRole('dialog',{name:'序章',exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);await context.close();
});

test('a narrow mouse-only desktop window keeps the desktop presentation',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:{width:393,height:852},screen:{width:1920,height:1080},hasTouch:false,isMobile:false,userAgent:desktopUA}),page=await context.newPage();
 await page.goto('/');await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible();await expect(page.locator('.phone-game-frame')).toHaveCount(0);await context.close();
});

test('the phone entry selects sideways presentation even when all device signals are desktop',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:{width:393,height:852},screen:{width:1920,height:1080},hasTouch:false,isMobile:false,userAgent:desktopUA}),page=await context.newPage();
 await page.goto('/?display=phone');await expect(page.locator('.phone-game-frame')).toBeVisible();await expect(page.locator('.phone-game-frame')).toHaveAttribute('data-angle','90');
 await expect(page.frameLocator('.phone-game-frame').getByRole('button',{name:'登录',exact:true})).toBeVisible();await context.close();
});
