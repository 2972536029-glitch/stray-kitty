import {test,expect,type Page,type Locator} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {Catalog,GameState} from '../../web/src/contracts';

const origin='http://127.0.0.1:8193';let child:ChildProcess,closed:Promise<void>,catalog:Catalog;
const sessions=new Map<string,{playerId:string;token:string}>();
test.beforeAll(async({request})=>{
  catalog=await(await request.get('/api/v1/content')).json();const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-home-editor-')),players:Record<string,unknown>={};
  for(const [id,stage] of [['desktop',3],['cats',3],['cat-actions',3],['retry',3],['stage1',1],['stage2',2],['stage4',4]] as const){
    const session={playerId:'home-'+id,token:'home-editor-test-'+id};sessions.set(id,session);
    const state:GameState={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:'greenhouse',storyNodeId:'',mapId:'greenhouse',flags:['l00_completed','alley_rescued','rescue_story_done',...(stage>=2?['greenhouse_sealed']:[]),...(stage>=3?['greenhouse_fortified_full','momo_joined']:[]),...(stage===4?['kingdom_founded']:[])],cats:['miaomiao','tuanzi','diandian','momo'],inventory:{material:40},currencies:{stamp:10,tuna:0},furniture:['soft_blanket','moon_hammock','moss_cottage','luna_boat'],placements:{},completedStages:[],pendingEventId:'',activeBattle:null,lastResult:{message:'布置验收'}};
    if(id==='cat-actions')state.cats=['miaomiao'];
    players[createHash('sha256').update(session.token).digest('hex')]={id:session.playerId,state,receipts:{},receiptOrder:[]};
  }
  const save=path.join(directory,'save.json');fs.writeFileSync(save,JSON.stringify({schemaVersion:1,players}));
  child=spawn(path.join(process.cwd(),'.runtime',process.platform==='win32'?'kitty-preview.exe':'kitty-preview'),[],{cwd:path.join(process.cwd(),'server'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GAME_ADDR:'127.0.0.1:8193',GAME_DATA_FILE:save,GAME_WEB_DIR:path.join(process.cwd(),'web/dist')}});
  closed=new Promise(resolve=>child.once('close',()=>resolve()));let output='';child.stdout?.on('data',b=>output+=b);child.stderr?.on('data',b=>output+=b);
  await expect.poll(async()=>{if(child.exitCode!==null)throw Error(output);try{return(await request.get(origin+'/healthz',{timeout:500})).ok();}catch{return false;}},{timeout:10000}).toBe(true);fs.mkdirSync('output/home-editor',{recursive:true});
});
test.afterAll(async()=>{if(child){const timer=setTimeout(()=>child.kill('SIGKILL'),3000);child.kill();await closed;clearTimeout(timer);}});
async function open(page:Page,id:string){await page.addInitScript(({origin,session})=>{if(location.origin===origin){localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));localStorage.setItem('stray-kitty.make-it-ours.open','closed');localStorage.setItem('stray-kitty.tutorial.home','done');}},{origin,session:sessions.get(id)!});await page.goto(origin);await page.getByRole('button',{name:'继续冒险'}).click();await page.locator('.game-viewport canvas').evaluate(c=>{(window as any).__homeCanvas=c;(window as any).__homeView=c.getAttribute('data-home-camera');});await page.getByRole('button',{name:/^▧ 家具背包/}).click();await expect(editor(page)).toBeVisible();await expect.poll(()=>page.locator('.game-viewport canvas').evaluate(c=>c===(window as any).__homeCanvas&&c.getAttribute('data-home-camera')===(window as any).__homeView)).toBe(true);await expect(canvas(page)).toHaveAttribute('data-home-artwork','ready');}
const editor=(p:Page)=>p.getByRole('region',{name:'家具背包 · 布置模式'});
const canvas=(p:Page)=>p.locator('.game-viewport canvas');
async function worldPoint(c:Locator,x:number,y:number){return c.evaluate((element:HTMLCanvasElement,{x,y})=>{const v=JSON.parse(element.dataset.editorView!),r=element.getBoundingClientRect(),w=Number(element.dataset.logicalWidth),h=Number(element.dataset.logicalHeight),fit=getComputedStyle(element).objectFit==='cover'?Math.max:Math.min,scale=fit(r.width/w,r.height/h);return{x:r.left+(r.width-w*scale)/2+(v.x+x*v.scale)*scale,y:r.top+(r.height-h*scale)/2+(v.y+y*v.scale)*scale};},{x,y});}
async function item(p:Page,key:string){return canvas(p).evaluate((c:HTMLCanvasElement,key)=>JSON.parse(c.dataset.editorItems!).find((i:{layoutKey:string})=>i.layoutKey===key),key);}
async function drag(p:Page,from:{x:number;y:number},to:{x:number;y:number}){await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:12});await p.mouse.up();}

test('default and owned furniture drag, store, undo, cancel and persist together; cats use the moved anchor',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,'desktop');
  await expect(canvas(page)).toHaveAttribute('data-home-editing','true');
  expect(JSON.parse((await canvas(page).getAttribute('data-home-cats'))!)).toEqual([]);
  expect(await page.locator('.backpack-scene canvas').count()).toBe(0);
  // Keep the live camera (including zoom), then restore the full view for placement.
  await editor(page).getByRole('button',{name:'取消布置',exact:true}).click();
  await page.getByRole('button',{name:'放大花房',exact:true}).click();
  await expect.poll(async()=>JSON.parse((await canvas(page).getAttribute('data-home-camera'))!).zoom).toBe(1.35);
  const viewBefore=await canvas(page).getAttribute('data-home-camera');
  await page.getByRole('button',{name:/^▧ 家具背包/}).click();
  await expect(canvas(page)).toHaveAttribute('data-home-camera',viewBefore!);
  await editor(page).getByRole('button',{name:'135%',exact:true}).click();
  const card=editor(page).locator('[data-layout-key="furniture:moss_cottage"]');await card.scrollIntoViewIfNeeded();const r=await card.boundingBox();await drag(page,{x:r!.x+r!.width/2,y:r!.y+35},await worldPoint(canvas(page),870,580));
  await expect.poll(async()=>({x:(await item(page,'furniture:moss_cottage')).x,stored:(await item(page,'furniture:moss_cottage')).stored})).toEqual({x:870,stored:false});
  // All default furniture is present under the Scene filter and can move.
  await editor(page).getByRole('tab',{name:/场景/}).click();await editor(page).locator('[data-layout-key="stage:3:cat-tower"]').click();
  const tower=await item(page,'stage:3:cat-tower');await drag(page,await worldPoint(canvas(page),tower.x,tower.y-160),await worldPoint(canvas(page),1190,420));
  const moved=await item(page,'stage:3:cat-tower');expect(moved.x).toBe(1190);expect(moved.y).toBe(580);
  await editor(page).getByRole('button',{name:'收回背包',exact:true}).click();expect((await item(page,'stage:3:cat-tower')).stored).toBe(true);
  await editor(page).getByRole('button',{name:'撤销',exact:true}).click();expect((await item(page,'stage:3:cat-tower')).stored).toBe(false);
  await editor(page).getByRole('button',{name:'重做',exact:true}).click();expect((await item(page,'stage:3:cat-tower')).stored).toBe(true);
  await editor(page).getByRole('button',{name:'撤销',exact:true}).click();
  const bag=await editor(page).getByRole('region',{name:'家具背包',exact:true}).boundingBox();
  await drag(page,await worldPoint(canvas(page),1190,420),{x:bag!.x+90,y:bag!.y+50});
  expect((await item(page,'stage:3:cat-tower')).stored).toBe(true);
  await editor(page).getByRole('button',{name:'撤销',exact:true}).click();
  await editor(page).getByRole('button',{name:'▼ 收起背包'}).click();await expect(editor(page).locator('.backpack-grid')).toBeHidden();await editor(page).getByRole('button',{name:'▲ 展开背包'}).click();
  await page.screenshot({path:'output/home-editor/desktop-backpack.png',fullPage:true});
  await editor(page).getByRole('button',{name:/保存布置/}).click();await expect(editor(page)).not.toBeVisible();
  const headers={Authorization:'Bearer '+sessions.get('desktop')!.token},saved=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(saved.homeLayout!['furniture:moss_cottage']).toEqual({x:870,y:580,stored:false});expect(saved.homeLayout!['stage:3:cat-tower'].x).toBe(1190);
  await expect.poll(async()=>JSON.parse((await page.locator('.game-viewport canvas').getAttribute('data-home-cats'))!).find((c:{breed:string})=>c.breed==='diandian')?.pose).toBe('castle_peek');
  const cats=JSON.parse((await page.locator('.game-viewport canvas').getAttribute('data-home-cats'))!);expect(Math.abs(cats.find((c:{breed:string})=>c.breed==='diandian').x-870)).toBeLessThan(40);
  await page.getByRole('button',{name:/^▧ 家具背包/}).click();await expect(canvas(page)).toHaveAttribute('data-home-artwork','ready');
  await editor(page).getByRole('tab',{name:/场景/}).click();await editor(page).locator('[data-layout-key="stage:3:cat-tower"]').click();await editor(page).getByRole('button',{name:'收回背包',exact:true}).click();
  await editor(page).getByRole('button',{name:'取消布置',exact:true}).click();const after=await(await request.get(origin+'/api/v1/state',{headers})).json();expect(after.revision).toBe(saved.revision);expect(after.homeLayout).toEqual(saved.homeLayout);
  await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();await page.getByRole('button',{name:/^▧ 家具背包/}).click();expect((await item(page,'stage:3:cat-tower')).x).toBe(1190);expect(errors).toEqual([]);
});
test('lost save response retries the same command without discarding draft or applying twice',async({page,request})=>{
  await open(page,'retry');const card=editor(page).locator('[data-layout-key="furniture:luna_boat"]');await card.click();await editor(page).getByRole('button',{name:'放到场景中央'}).click();
  let dropped=false;await page.route('**/api/v1/commands',async route=>{if(!dropped&&route.request().postDataJSON().command.type==='SAVE_HOME_LAYOUT'){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await editor(page).getByRole('button',{name:/保存布置/}).click();await expect(editor(page).getByRole('button',{name:'重试上次保存'})).toBeEnabled();await editor(page).getByRole('button',{name:'重试上次保存'}).click();await expect(editor(page)).not.toBeVisible();
  const saved=await(await request.get(origin+'/api/v1/state',{headers:{Authorization:'Bearer '+sessions.get('retry')!.token}})).json();expect(saved.revision).toBe(2);expect(saved.homeLayout['furniture:luna_boat']).toEqual({x:820,y:540,stored:false});
});
for(const stage of [1,2,4])test(`stage ${stage} defaults are individually editable and remain bright in celebration`,async({page})=>{
  await open(page,'stage'+stage);await editor(page).getByRole('tab',{name:/场景/}).click();const key=stage===1?'stage:1:rain-bucket':stage===2?'stage:2:workbench':'stage:4:ceiling-bunting';
  const card=editor(page).locator(`[data-layout-key="${key}"]`);await card.scrollIntoViewIfNeeded();await card.click();await page.keyboard.press('ArrowRight');
  await expect(editor(page).getByRole('button',{name:/保存布置/})).toBeEnabled();await page.screenshot({path:`output/home-editor/stage${stage}-backpack.png`,fullPage:true});await editor(page).getByRole('button',{name:/保存布置/}).click();await expect(editor(page)).not.toBeVisible();
});

const liveCanvas=(p:Page)=>p.locator('.game-viewport canvas');
async function livePoint(p:Page,x:number,y:number){return liveCanvas(p).evaluate((c:HTMLCanvasElement,{x,y})=>{const v=JSON.parse(c.dataset.homeCamera!),r=c.getBoundingClientRect(),w=Number(c.dataset.logicalWidth),h=Number(c.dataset.logicalHeight),fit=getComputedStyle(c).objectFit==='cover'?Math.max:Math.min,s=fit(r.width/w,r.height/h);return{x:r.left+(r.width-w*s)/2+(v.x+x*v.scale)*s,y:r.top+(r.height-h*s)/2+(v.y+y*v.scale)*s};},{x,y});}
async function liveCats(p:Page){return JSON.parse((await liveCanvas(p).getAttribute('data-home-cats'))!) as {breed:string;x:number;y:number;pose:string|null;slot?:string;social?:string}[];}
async function dragCat(p:Page,breed:string,x:number,y:number){const c=(await liveCats(p)).find(c=>c.breed===breed)!;await drag(p,await livePoint(p,c.x,c.y-26),await livePoint(p,x,y));}
test('drag cats to free floor and all five social activities, with separated bodies and cancelable carrying',async({page})=>{
  await open(page,'cats');await editor(page).getByRole('button',{name:'取消布置',exact:true}).click();
  await dragCat(page,'miaomiao',820,610);await expect.poll(async()=>JSON.parse((await liveCanvas(page).getAttribute('data-home-interaction'))!).kind).toBe('cat-drop');
  const dropped=(await liveCats(page)).find(c=>c.breed==='miaomiao')!;expect(Math.abs(dropped.x-820)).toBeLessThan(65);
  for(const kind of ['nose','rub','groom','play','nap']){const target=(await liveCats(page)).find(c=>c.breed==='tuanzi')!;await dragCat(page,'miaomiao',target.x,target.y-26);await expect.poll(async()=>(await liveCats(page)).find(c=>c.breed==='miaomiao')?.social).toBe(kind);const cats=await liveCats(page),a=cats.find(c=>c.breed==='miaomiao')!,b=cats.find(c=>c.breed==='tuanzi')!;expect(Math.abs(a.x-b.x)>=60||Math.abs(a.y-b.y)>=52).toBe(true);}
  await page.screenshot({path:'output/home-editor/cat-social.png',fullPage:true});
  const before=(await liveCats(page)).find(c=>c.breed==='miaomiao')!,from=await livePoint(page,before.x,before.y-26),to=await livePoint(page,1120,500);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await expect(liveCanvas(page)).toHaveAttribute('data-home-drop-target',/ground|furniture|cat/);await page.keyboard.press('Escape');await page.mouse.up();expect((await liveCats(page)).find(c=>c.breed==='miaomiao')!.x).toBe(before.x);
});
test('the same original cat can eat, sleep, climb, investigate, garden and use the workbench without being buried under furniture',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,'cat-actions');await editor(page).getByRole('button',{name:'取消布置',exact:true}).click();
  for(const [x,y,pose] of [[820,300,'paw_table'],[555,340,'investigate'],[1320,260,'sniff'],[1470,260,'perch'],[1400,608,'bowl_eat'],[1050,570,'belly'],[280,560,'hammock_sleep']] as const){await dragCat(page,'miaomiao',x,y);await expect.poll(async()=>(await liveCats(page))[0].pose,{message:'drag to '+pose}).toBe(pose);expect((await liveCats(page))[0].breed).toBe('miaomiao');}
  const opaqueFur=await liveCanvas(page).evaluate((c:HTMLCanvasElement)=>{const cat=JSON.parse(c.dataset.homeCats!)[0],v=JSON.parse(c.dataset.homeCamera!),dpr=c.width/Number(c.dataset.logicalWidth),x=Math.round((v.x+(cat.x-36)*v.scale)*dpr),y=Math.round((v.y+(cat.y-65)*v.scale)*dpr),w=Math.ceil(75*v.scale*dpr),h=Math.ceil(80*v.scale*dpr),data=c.getContext('2d')!.getImageData(x,y,w,h).data;let count=0;for(let i=0;i<data.length;i+=4)if(Math.abs(data[i]-242)<3&&Math.abs(data[i+1]-223)<3&&Math.abs(data[i+2]-184)<3)count++;return count;});
  expect(opaqueFur).toBeGreaterThan(12);
  await page.screenshot({path:'output/home-editor/cat-furniture-sleep.png',fullPage:true});expect(errors).toEqual([]);
});
