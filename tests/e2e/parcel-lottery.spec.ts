import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {Catalog,GameState,Session} from '../../web/src/contracts';
import {PARCEL_ART, type ParcelFurnitureID} from '../../web/src/modules/lottery/furnitureArt';

const origin='http://127.0.0.1:8189';
const sessions=new Map<string,Session>();let child:ChildProcess|undefined,closed:Promise<void>|undefined,catalog:Catalog;
test.beforeAll(async({request})=>{
  catalog=await(await request.get('/api/v1/content')).json();
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-parcel-browser-')),players:Record<string,unknown>={};
  for(const id of ['free','paid','ten','moss-room','moon-room','mobile','locked']){
    const session={playerId:`parcel-${id}`,token:`parcel-test-${id}`};sessions.set(id,session);
    const state:GameState={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:'greenhouse',storyNodeId:'',mapId:'greenhouse',flags:['l00_completed','alley_rescued','rescue_story_done','market_unlocked','chapter_2_started','market_cleared','market_exit_crossed','greenhouse_sealed','greenhouse_fortified_full','momo_joined'],cats:['miaomiao','tuanzi','diandian','momo'],inventory:{material:40,clue:3},currencies:{stamp:8,tuna:0},furniture:['cardboard_nest','soft_blanket','tin_lamp'],placements:{},completedStages:['l00_tutorial','alley_rescue'],pendingEventId:'',activeBattle:null,lastResult:{message:'主题包裹验收。'}};
    if(id==='ten')state.currencies.stamp=20;
    if(id==='free'){
      state.furniture.push(...catalog.pools[0].entries.slice(0,-1).map(e=>e.furnitureId));
      state.lottery={progress:{moss_letters:{draws:17,misses:2}},history:[],day:new Date(Date.now()+8*3600000).toISOString().slice(0,10),dailyClaims:[],milestones:[]};
    }
    if(id.endsWith('-room')){
      const pool=catalog.pools[id==='moss-room'?0:1];state.furniture.push(...pool.entries.map(e=>e.furnitureId));
      for(const entry of pool.entries){const f=catalog.furniture.find(f=>f.id===entry.furnitureId)!;state.placements[f.preferredSlot!]=f.id;}
    }
    if(id==='locked'){state.flags=[];state.cats=['miaomiao','tuanzi'];}
    players[createHash('sha256').update(session.token).digest('hex')]={id:session.playerId,state,receipts:{},receiptOrder:[]};
  }
  const save=path.join(directory,'save.json');fs.writeFileSync(save,JSON.stringify({schemaVersion:1,players}));
  child=spawn(path.join(process.cwd(),'.runtime',process.platform==='win32'?'kitty-preview.exe':'kitty-preview'),[],{cwd:path.join(process.cwd(),'server'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GAME_ADDR:'127.0.0.1:8189',GAME_DATA_FILE:save,GAME_WEB_DIR:path.join(process.cwd(),'web/dist')}});
  closed=new Promise(resolve=>child!.once('close',()=>resolve()));let output='';child.stdout?.on('data',b=>output+=b);child.stderr?.on('data',b=>output+=b);
  await expect.poll(async()=>{if(child!.exitCode!==null)throw Error(output);try{return(await request.get(origin+'/healthz',{timeout:500})).ok();}catch{return false;}},{timeout:10000}).toBe(true);
  fs.mkdirSync('output/parcel-design',{recursive:true});
});
test.afterAll(async()=>{if(child&&closed){const force=setTimeout(()=>child?.kill('SIGKILL'),3000);child.kill('SIGTERM');await closed;clearTimeout(force);}});
async function open(page:Page,id:string){
  await page.addInitScript(({origin,session})=>{if(location.origin===origin){localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));localStorage.setItem('stray-kitty.tutorial.home','done');}},{origin,session:sessions.get(id)!});
  await page.goto(origin);await page.getByRole('button',{name:'继续冒险'}).click();
  await expect(page.locator('.game-viewport canvas')).toHaveAttribute('data-home-artwork','ready');
}
const postOffice=(page:Page)=>page.getByRole('dialog',{name:'猫爪邮局'});
async function counterFits(page:Page){const office=postOffice(page),box=(await office.boundingBox())!,size=page.viewportSize()!,rail=(await office.getByRole('tablist',{name:'家具卡池'}).boundingBox())!,paper=(await office.locator('.postal-paper').boundingBox())!,actions=(await office.locator('.postal-actions').boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(size.height+1);expect(actions.y+actions.height).toBeLessThanOrEqual(box.y+box.height);expect(rail.x+rail.width).toBeLessThan(paper.x);expect(paper.height).toBeGreaterThan(280);expect(await office.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);}

async function drawOnPostcard(page:Page){
  const office=postOffice(page),canvas=office.getByTestId('postcard-canvas');
  await expect(office.locator('.postal-layout')).toHaveAttribute('data-stage','drawing');
  // Wait for the postcard to settle before starting the continuous pointer gesture.
  await expect(canvas).toBeVisible();await page.waitForTimeout(650);
  const r=(await canvas.boundingBox())!;
  await page.mouse.move(r.x+r.width*.3,r.y+r.height*.45);await page.mouse.down();
  await page.mouse.move(r.x+r.width*.5,r.y+r.height*.7,{steps:10});
  await page.mouse.move(r.x+r.width*.7,r.y+r.height*.3,{steps:10});await page.mouse.up();
  await expect(office.locator('.postal-layout')).toHaveAttribute('data-stage','parcels');
}

test('postal journal fits one window; drawing auto-sends, unopened furniture stays hidden and placement and receipts persist',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,'free');
  await page.getByRole('button',{name:'猫爪邮局',exact:true}).click();const office=postOffice(page);
  await expect(office.locator('.parcel-prize')).toHaveCount(0);await expect(office.locator('.postal-pity')).toContainText('下一份');await expect(office.locator('.parcel-theme-preview canvas')).toHaveAttribute('data-artwork','ready');await counterFits(page);
  await office.getByRole('button',{name:/家具图鉴/}).click();const collection=page.getByRole('dialog',{name:'苔叶来信家具图鉴',exact:true});await expect(collection.locator('.parcel-prize')).toHaveCount(12);
  await expect.poll(()=>collection.locator('.parcel-prize img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  const sizes=await collection.locator('.parcel-prize img').evaluateAll(images=>images.map(image=>({id:(image as HTMLImageElement).src.split('/').pop(),width:image.getBoundingClientRect().width})));
  expect(sizes.find(i=>i.id==='willow_sofa.png')!.width).toBeGreaterThan(sizes.find(i=>i.id==='postmark_clock.png')!.width*5);
  await collection.getByRole('button',{name:'叶印摆钟，放大查看'}).click();await expect(collection.getByRole('region',{name:'叶印摆钟细节'})).toBeVisible();await page.screenshot({path:'output/parcel-design/moss-collection.png'});await page.keyboard.press('Escape');await expect(collection).toHaveCount(0);await expect(office).toBeVisible();
  const room=await office.locator('.parcel-theme-preview canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL('image/png').split(',')[1]);fs.writeFileSync('output/parcel-design/moss-scale-layout.png',Buffer.from(room,'base64'));
  await page.screenshot({path:'output/parcel-design/moss-post-office.png',fullPage:true});
  await office.getByTestId('parcel-draw').click();await drawOnPostcard(page);
  await expect(office.getByTestId('delivered-parcel')).toHaveCount(1);await expect(office.locator('.postal-delivery .parcel-furniture-art')).toHaveCount(0);await expect(office.locator('.postal-reward')).toHaveCount(0);
  await office.getByTestId('delivered-parcel').click();await expect(office.locator('.parcel-result-copy')).toContainText('苗苗软垫凳');await expect(office.locator('.postal-result-label')).toContainText('暖心保底');
  await counterFits(page);await page.screenshot({path:'output/parcel-design/capsule-result.png'});await office.getByRole('button',{name:'布置这件家具 ›',exact:true}).click();const backpack=page.getByRole('region',{name:'家具背包 · 布置模式'});
  await backpack.getByRole('button',{name:'放到场景中央'}).click();await backpack.getByRole('button',{name:/保存布置/}).click();await expect(backpack).not.toBeVisible();
  if(await page.getByRole('button',{name:'展开顶部信息栏（可拖拽）'}).isVisible())await page.getByRole('button',{name:'展开顶部信息栏（可拖拽）'}).click();
  await page.getByRole('button',{name:'猫国商店',exact:true}).click();let shop=page.getByRole('dialog',{name:'猫国商店',exact:true});
  await shop.getByTestId('claim-daily_wish').click();await expect(shop.getByTestId('claim-daily_wish')).toHaveText('已签收');
  await shop.getByTestId('claim-daily_letter').click();await expect(shop.getByTestId('claim-daily_letter')).toHaveText('已签收');
  await shop.getByRole('button',{name:'关闭猫国商店',exact:true}).click();
  await expect.poll(async()=>JSON.parse((await page.locator('.game-viewport canvas').getAttribute('data-home-cats'))!).find((c:{breed:string})=>c.breed==='diandian')?.pose).toBe('perch');
  await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();await page.getByRole('button',{name:'猫爪邮局',exact:true}).click();
  await expect(postOffice(page).getByRole('button',{name:/家具图鉴/})).toContainText('12/12');await expect(postOffice(page).getByTestId('claim-daily_letter')).toHaveCount(0);
  await page.setViewportSize({width:1366,height:768});await counterFits(page);await page.screenshot({path:'output/parcel-design/capsule-desktop-1366.png'});
  const headers={Authorization:`Bearer ${sessions.get('free')!.token}`},before=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  await postOffice(page).getByRole('button',{name:/收据/}).click();const receipts=page.getByRole('dialog',{name:'包裹收据',exact:true});await expect(receipts.locator('.gacha-receipts li')).toHaveCount(1);await receipts.getByRole('button',{name:'查看结果 ›'}).click();await expect(postOffice(page).locator('.parcel-result-copy')).toContainText('苗苗软垫凳');const after=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;expect(after.revision).toBe(before.revision);expect(after.currencies).toEqual(before.currencies);expect(after.lottery!.history).toHaveLength(1);expect(errors).toEqual([]);
});

test('insufficient tuna opens recharge, declined and successful demo payments, retry recovers without a second charge',async({page,request})=>{
  await open(page,'paid');await page.getByRole('button',{name:'猫爪邮局',exact:true}).click();let office=postOffice(page);
  await office.getByRole('tab',{name:/月海观星/}).click();await expect(office.getByTestId('parcel-draw')).toBeDisabled();
  const room=await office.locator('.parcel-theme-preview canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL('image/png').split(',')[1]);fs.writeFileSync('output/parcel-design/moon-scale-layout.png',Buffer.from(room,'base64'));
  await page.screenshot({path:'output/parcel-design/moon-post-office.png',fullPage:true});
  await office.getByRole('button',{name:'去补给小站 ›'}).click();const recharge=page.getByRole('dialog',{name:'金枪鱼补给小站'});
  await recharge.getByRole('button',{name:'填失败卡 (0000)'}).click();await recharge.getByRole('button',{name:'支付 ¥6.00'}).click();await expect(recharge.locator('.declined')).toBeVisible();
  await recharge.getByRole('button',{name:'换张卡试试'}).click();await recharge.getByRole('button',{name:'填成功卡 (4242)'}).click();await recharge.getByRole('button',{name:'支付 ¥6.00'}).click();await expect(recharge.locator('.recharge-result.ok')).toContainText('+60');
  await recharge.getByRole('button',{name:'回去照顾伙伴'}).click();office=postOffice(page);await expect(office.getByRole('tab',{name:/月海观星/})).toHaveAttribute('aria-selected','true');await expect(office.getByTestId('parcel-draw')).toBeEnabled();
  let dropped=false;await page.route('**/api/v1/commands',async route=>{if(!dropped&&route.request().postDataJSON().command.type==='DRAW_FURNITURE'){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await office.getByTestId('parcel-draw').click();await office.getByTestId('postcard-skip').click();await expect(office.getByRole('alert')).toBeVisible();await office.getByRole('button',{name:'重试上次操作'}).click();
  await expect(office.getByTestId('delivered-parcel')).toBeVisible();await office.getByTestId('delivered-parcel').click();await expect(office.locator('.parcel-result-copy h3')).toBeVisible();const headers={Authorization:`Bearer ${sessions.get('paid')!.token}`};const state=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(state.currencies.tuna).toBe(0);expect(state.lottery!.history).toHaveLength(1);expect(state.txns!.filter(t=>t.spent===60)).toHaveLength(1);
  await page.screenshot({path:'output/parcel-design/moon-opening.png',fullPage:true});
});

for(const fixture of ['moss-room','moon-room'])test(fixture+': twelve themed furnishings and matching cats load in the scene',async({page})=>{
  await open(page,fixture);
  const canvas=page.locator('.game-viewport canvas');
  const ids=catalog.pools[fixture==='moss-room'?0:1].entries.map(e=>e.furnitureId as ParcelFurnitureID);
  await expect.poll(async()=>{
    const objects=JSON.parse((await canvas.getAttribute('data-home-furniture'))??'[]') as {id:string;slot:string}[];
    return ids.filter(id=>objects.some(o=>o.id===id)).length;
  }).toBe(12);
  const objects=JSON.parse((await canvas.getAttribute('data-home-furniture'))!) as {id:string;slot:string}[];
  for(const id of ids){
    const object=objects.find(o=>o.id===id);
    expect(object,'furniture '+id+' must be placed').toBeDefined();
    const record=catalog.furniture.find(f=>f.id===id);
    expect(object!.slot).toBe(record!.preferredSlot);
    expect(PARCEL_ART[id].cat).toBeTruthy();
  }
  await expect.poll(async()=>{
    const cats=JSON.parse((await canvas.getAttribute('data-home-cats'))??'[]') as {breed:string}[];
    return cats.map(c=>c.breed).sort();
  }).toEqual(['advisor','diandian','miaomiao','momo','tuanzi']);
  // Cat interactions depend on proximity; distant furniture cannot summon cats across the room.
  await expect.poll(async()=>{
    const cats=JSON.parse((await canvas.getAttribute('data-home-cats'))??'[]') as {pose:string|null;slot?:string}[];
    return cats.some(cat=>Boolean(cat.slot&&cat.pose));
  }).toBe(true);
  await page.screenshot({path:'output/parcel-design/'+fixture+'.png',fullPage:true});
});

test('phone landscape fits twelve cards and locked pools show a reason without sending a command',async({page})=>{
  await page.setViewportSize({width:844,height:390});await open(page,'locked');await page.getByRole('button',{name:'猫爪邮局',exact:true}).click();
  const office=postOffice(page);await expect(office.getByTestId('parcel-draw')).toBeDisabled();await expect(office.locator('.postal-pity')).toContainText('完成点点的救援');
  expect(await office.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await office.getByRole('button',{name:/家具图鉴/}).click();const collection=page.getByRole('dialog',{name:'苔叶来信家具图鉴'});await expect(collection.locator('.parcel-prize')).toHaveCount(12);
  await page.screenshot({path:'output/parcel-design/phone-post-office.png',fullPage:true});
});

test('ten parcels open in place, resume without charging again and leave no postcard or box under furniture',async({page,request})=>{
  await open(page,'ten');await page.getByRole('button',{name:'猫爪邮局',exact:true}).click();let office=postOffice(page);
  const headers={Authorization:`Bearer ${sessions.get('ten')!.token}`};
  await office.getByTestId('parcel-draw-ten').click();
  expect((await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState).currencies.stamp).toBe(20);
  await office.getByTestId('postcard-skip').click();await expect(office.locator('.postal-layout')).toHaveAttribute('data-stage','parcels');
  const parcels=office.getByTestId('delivered-parcel');await expect(parcels).toHaveCount(10);await expect(office.locator('.postal-parcel.opened')).toHaveCount(0);
  for(const index of [1,6]){await parcels.nth(index).click();await expect(office.locator('.postal-layout')).toHaveAttribute('data-stage','parcels');}
  await expect(office.locator('.postal-parcel.opened')).toHaveCount(2);await expect(office.locator('.postal-parcel.opened .postal-parcel-sprite')).toHaveCount(0);await expect(office.locator('.postal-reward')).toHaveCount(0);await expect(office.locator('.postal-postcard')).not.toBeVisible();
  await expect(office.locator('.postal-preview-note img')).toHaveCount(1);
  await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();await page.getByRole('button',{name:'猫爪邮局',exact:true}).click();office=postOffice(page);
  await expect(office.getByTestId('delivered-parcel')).toHaveCount(10);await expect(office.locator('.postal-parcel.opened')).toHaveCount(2);
  await office.getByRole('button',{name:/全部拆开/}).click();await expect(office.locator('.postal-parcel.opened')).toHaveCount(10);
  const after=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;expect(after.currencies.stamp).toBe(10);expect(after.lottery!.history).toHaveLength(10);expect(after.lastResult.draws).toHaveLength(10);
  await page.screenshot({path:'output/parcel-design/postal-ten-opened.png',fullPage:true});
});
