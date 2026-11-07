import {expect,test,type Locator} from '@playwright/test';

for(const insets of [{top:40,right:0,bottom:0,left:0},{top:44,right:6,bottom:24,left:9}])test(`rotated artwork fills safe area ${JSON.stringify(insets)} while UI stays clear`,async({browser,baseURL},info)=>{
 const viewport={width:393,height:873},context=await browser.newContext({baseURL,viewport,isMobile:true,hasTouch:true}),page=await context.newPage(),cdp=await context.newCDPSession(page);
 await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets});
 const withinSafe=async(locator:Locator)=>{const box=await locator.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(insets.left-1);expect(box!.y).toBeGreaterThanOrEqual(insets.top-1);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width-insets.right+1);expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height-insets.bottom+1);};
 await page.goto('/?display=phone&prologue=1');const frame=page.locator('.phone-game-frame'),game=page.frameLocator('.phone-game-frame');
 await expect(game.getByRole('button',{name:'登录',exact:true})).toBeVisible();
 const box=(await frame.boundingBox())!;expect(box.x).toBeCloseTo(0,0);expect(box.y).toBeCloseTo(0,0);expect(box.width).toBeCloseTo(viewport.width,0);expect(box.height).toBeCloseTo(viewport.height,0);
 await withinSafe(game.locator('.start-brand'));await withinSafe(game.getByRole('button',{name:'登录',exact:true}));
 await game.locator('.start-menu-backdrop img').evaluate((img:HTMLImageElement)=>img.decode());await page.screenshot({path:info.outputPath('title-full-bleed.png')});
 await game.getByRole('button',{name:'登录',exact:true}).tap();await withinSafe(game.locator('dialog[open]'));await withinSafe(game.locator('dialog[open]>.modal-close'));await game.locator('dialog[open]>.modal-close').tap();
 await game.getByRole('button',{name:'暂不登录',exact:true}).tap();const intro=game.getByRole('dialog',{name:'序章',exact:true});await expect(intro).toBeVisible();await withinSafe(intro.locator('.prologue-chapter-mark'));await withinSafe(intro.locator('.story-dialogue'));
 await intro.locator('.prologue-plate-home').evaluate((img:HTMLImageElement)=>img.decode());await page.screenshot({path:info.outputPath('prologue-full-bleed.png')});
 await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,right:0,bottom:0,left:0}});await expect.poll(()=>game.locator('html').evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-left')))).toBe(0);
 await context.close();
});
