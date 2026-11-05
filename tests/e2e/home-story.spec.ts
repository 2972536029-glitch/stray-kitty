import {expect, test, type Page} from '@playwright/test';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {GameState, Session} from '../../web/src/contracts';

const port = 8179, origin = `http://127.0.0.1:${port}`;
const sessions = new Map<string, Session>();
let child: ChildProcess | undefined, closed: Promise<void> | undefined;
type CatSnapshot = {breed: string; x: number; y: number; pose: string | null; action: string; height: number; bubble:string|null};
const scene = (page: Page) => page.locator('.game-viewport canvas');
const cats = async (page: Page) => JSON.parse((await scene(page).getAttribute('data-home-cats'))!) as CatSnapshot[];

test.beforeAll(async ({request}) => {
  await new Promise<void>((resolve, reject) => {const probe = net.createServer();probe.once('error', reject);probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve()));});
  const catalog = await (await request.get('/api/v1/content')).json();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kitty-home-browser-'));
  const players: Record<string, unknown> = {};
  for (const id of ['story', 'roam', 'repair', 'mobile']) {
    const session = {playerId: `home-${id}`, token: `home-browser-${id}`};sessions.set(id, session);
    const state: GameState = {
      schemaVersion: 1, contentVersion: catalog.version, revision: 1, phase: 'home',
      chapterId: 'market', storyNodeId: '', mapId: 'market',
      flags: ['l00_completed', 'alley_rescued', 'rescue_story_done', 'chapter_2_started', 'market_unlocked', 'market_cleared', 'market_exit_crossed'],
      cats: ['miaomiao', 'tuanzi', 'diandian'], inventory: {material: 40, clue: 3}, currencies: {stamp: 10},
      furniture: ['cardboard_nest', 'blue_bowl', 'box_castle', 'soft_blanket', 'moon_hammock'],
      placements: {corner: 'box_castle', window: 'blue_bowl', sun_spot: 'soft_blanket', beam: 'moon_hammock'},
      completedStages: ['l00_tutorial', 'alley_rescue'], pendingEventId: '', activeBattle: null,
      lastResult: {message: '花房场景验收。'},
    };
    if (id !== 'repair') state.flags.push('greenhouse_sealed', 'greenhouse_fortified_full');
    if (id === 'roam') {state.placements = {};state.cats.push('momo');}
    if (id === 'repair') state.placements = {corner: 'box_castle', window: 'blue_bowl'};
    players[createHash('sha256').update(session.token).digest('hex')] = {id: session.playerId, state, receipts: {}, receiptOrder: []};
  }
  const save = path.join(directory, 'save.json');fs.writeFileSync(save, JSON.stringify({schemaVersion: 1, players}));
  child = spawn(path.join(process.cwd(), '.runtime', process.platform === 'win32' ? 'kitty-preview.exe' : 'kitty-preview'), [], {
    cwd: path.join(process.cwd(), 'server'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, GAME_ADDR: `127.0.0.1:${port}`, GAME_DATA_FILE: save, GAME_WEB_DIR: path.join(process.cwd(), 'web/dist')},
  });
  closed = new Promise(resolve => child!.once('close', () => resolve()));
  let output = '';child.stdout?.on('data', chunk => output += chunk);child.stderr?.on('data', chunk => output += chunk);
  await expect.poll(async () => {if (child!.exitCode !== null) throw new Error(output);try {return (await request.get(origin + '/healthz', {timeout: 500})).ok();} catch {return false;}}, {timeout: 10000}).toBe(true);
  fs.mkdirSync('output/home-review', {recursive: true});
});
test.afterAll(async () => {if (child && closed) {const force = setTimeout(() => child?.kill('SIGKILL'), 3000);child.kill('SIGTERM');await closed;clearTimeout(force);}});

async function open(page: Page, id: string) {
  await page.addInitScript(({origin, session}) => {if (location.origin === origin) {localStorage.setItem('stray-kitty.session.v1', JSON.stringify(session));localStorage.setItem('stray-kitty.tutorial.home','done');}}, {origin, session: sessions.get(id)!});
  await page.goto(origin);await page.getByRole('button', {name: '继续冒险'}).click();
  await expect(scene(page)).toHaveAttribute('data-rendered-scene', 'home');
  await expect(scene(page)).toHaveAttribute('data-home-artwork', 'ready');
}

test('story overrides furniture, stages Momo before recruitment, stays directed after reload and resumes daily life', async ({page, request}) => {
  const errors: string[] = [];page.on('pageerror', error => errors.push(error.message));
  await open(page, 'story');
  await expect.poll(async () => (await cats(page)).filter(c => c.pose).length).toBe(3);
  await page.getByRole('button', {name: /启程：第三章剧情/}).click();
  await expect(scene(page)).toHaveAttribute('data-home-beat', 'greenhouse_intro_1');
  expect((await cats(page)).every(c => c.pose === null)).toBe(true);
  await page.getByRole('button', {name: '继续故事'}).click();
  await expect(scene(page)).toHaveAttribute('data-home-beat', 'greenhouse_intro_2');
  expect((await cats(page)).some(c => c.breed === 'momo')).toBe(false);
  await page.getByRole('button', {name: '继续故事'}).click();
  await expect(scene(page)).toHaveAttribute('data-home-beat', 'greenhouse_intro_3');
  await expect.poll(async () => (await cats(page)).find(c => c.breed === 'momo')?.height ?? 0, {intervals: [40, 60, 80]}).toBeGreaterThan(5);
  await expect.poll(async () => (await cats(page)).find(c => c.breed === 'momo')?.action).toBe('sit');
  const stopped = await cats(page);
  await page.keyboard.down('ArrowRight');await scene(page).dispatchEvent('pointerdown', {clientX: 500, clientY: 450});
  await page.waitForTimeout(4200);await page.keyboard.up('ArrowRight');
  expect(await cats(page)).toEqual(stopped);
  const headers = {Authorization: `Bearer ${sessions.get('story')!.token}`};
  const before = await (await request.get(origin + '/api/v1/state', {headers})).json() as GameState;
  expect(before.cats).not.toContain('momo');
  await page.screenshot({path: 'output/home-review/story-entrance.png'});
  await page.getByRole('button', {name: '继续故事'}).click();
  await expect(scene(page)).toHaveAttribute('data-home-beat', 'greenhouse_intro_4');
  await page.reload();await page.getByRole('button', {name: '继续冒险'}).click();
  await expect(scene(page)).toHaveAttribute('data-home-control', 'story');
  await expect(scene(page)).toHaveAttribute('data-home-beat', 'greenhouse_intro_4');
  await page.getByRole('button', {name: /跳过剧情/}).click();
  await expect(scene(page)).toHaveAttribute('data-home-beat', 'greenhouse_intro_5');
  for (let remaining = 0; remaining < 5 && await scene(page).getAttribute('data-home-control') !== 'free'; remaining++) {
    const previousBeat = await scene(page).getAttribute('data-home-beat');
    await page.getByRole('button', {name: /跳过剧情/}).click();
    await expect.poll(async () => await scene(page).getAttribute('data-home-beat') !== previousBeat).toBe(true);
  }
  await expect(scene(page)).toHaveAttribute('data-home-control', 'free');
  const after = await (await request.get(origin + '/api/v1/state', {headers})).json() as GameState;
  expect(after.cats).toContain('momo');expect(after.placements).toEqual(before.placements);
  await expect.poll(async () => (await cats(page)).filter(c => c.pose).length).toBe(4);
  expect(errors).toEqual([]);
});

test('free cats move, map freezes the clock and its terrain matches the actual home instead of the stale mapId', async ({page}) => {
  await open(page, 'roam');
  await page.getByRole('button', {name: '收起家园面板'}).click();
  const initial = await cats(page);
  await expect.poll(async () => JSON.stringify(await cats(page)) !== JSON.stringify(initial), {timeout: 10000}).toBe(true);
  await page.screenshot({path: 'output/home-review/homestead.png'});
  const terrainPoints = [[300, 100], [685, 130], [1010, 210], [900, 740], [900, 850]];
  await page.getByRole('button', {name: '章节地图'}).click();
  const map = page.locator('.home-map');
  await expect(map).toHaveAttribute('data-layout', (await scene(page).getAttribute('data-home-layout'))!);
  await expect(page.locator('.map-stop.current')).toContainText('废弃花房');
  const paused = await scene(page).getAttribute('data-home-time');const positions = await cats(page);
  await page.waitForTimeout(700);
  expect(await scene(page).getAttribute('data-home-time')).toBe(paused);expect(await cats(page)).toEqual(positions);
  await expect(map.locator('canvas')).toHaveAttribute('data-artwork', 'ready');
  // The map is world-sized; project it through the actual camera and pause tint
  // before comparing pixels in the live canvas. Avoid cats and slot markers.
  const samples = await scene(page).evaluate((canvas: HTMLCanvasElement, points) => {
    const view=JSON.parse(canvas.dataset.homeCamera!),dpr=Number(canvas.dataset.dpr);
    const projected=document.createElement('canvas');projected.width=canvas.width;projected.height=canvas.height;
    const ctx=projected.getContext('2d')!;ctx.scale(dpr,dpr);ctx.imageSmoothingEnabled=false;
    ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);
    ctx.drawImage(document.querySelector('.home-map canvas') as HTMLCanvasElement,0,0);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='rgba(24,40,42,.6)';ctx.fillRect(0,0,800,480);
    const live=canvas.getContext('2d')!;
    return points.map(([x,y])=>{
      const sx=Math.round((view.x+x*view.scale)*dpr),sy=Math.round((view.y+y*view.scale)*dpr);
      return {live:Array.from(live.getImageData(sx,sy,1,1).data),map:Array.from(ctx.getImageData(sx,sy,1,1).data)};
    });
  }, terrainPoints);
  for(const sample of samples)expect(sample.live).toEqual(sample.map);
  await page.screenshot({path: 'output/home-review/map.png'});
  await page.keyboard.press('Escape');
  await expect.poll(async () => Number(await scene(page).getAttribute('data-home-time'))).toBeGreaterThan(Number(paused));
});

test('repairs update both views and placed furniture survives refresh', async ({page}) => {
  await open(page, 'repair');
  await expect(scene(page)).toHaveAttribute('data-home-stage', '1');
  expect(await page.locator('.renovation-card').count()).toBe(0);
  await page.getByRole('button',{name:'排干积水、铺好干草 · 需要修补'}).click();
  await expect(page.getByRole('button',{name:'修补这里',exact:true})).toBeDisabled();
  for(const id of ['patch_windows','stop_roof_leaks','dry_bedding']){
    await page.locator('[data-repair-id="'+id+'"]').click();await page.getByRole('button',{name:'修补这里',exact:true}).click();
    await expect(page.locator('[data-repair-id="'+id+'"]').first()).toHaveCount(0);
    if(id==='patch_windows'){
      await expect(scene(page)).toHaveAttribute('data-home-stage','1');
      await page.screenshot({path:'output/home-review/repair-in-place.png'});
      await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
      await expect(page.locator('[data-repair-id="patch_windows"]')).toHaveCount(0);
    }
  }
  await expect(scene(page)).toHaveAttribute('data-home-stage', '2');
  for(const id of ['reinforce_floor','restore_skylight','revive_garden']){
    await page.locator('[data-repair-id="'+id+'"]').click();await page.getByRole('button',{name:'修补这里',exact:true}).click();
    await expect(page.locator('[data-repair-id="'+id+'"]').first()).toHaveCount(0);
  }
  await page.screenshot({path:'output/home-review/repaired-greenhouse.png'});
  await expect(scene(page)).toHaveAttribute('data-home-stage', '3');
  await page.reload();await page.getByRole('button', {name: '继续冒险'}).click();
  await expect(scene(page)).toHaveAttribute('data-home-stage', '3');
  await page.getByRole('button', {name: /^▧ 家具背包/}).click();
  const backpack=page.getByRole('region',{name:'家具背包 · 布置模式'});
  await backpack.getByRole('tab',{name:/场景/}).click();
  await expect(backpack.getByRole('button',{name:'选择蓝色饭碗',exact:true})).toBeVisible();
  await backpack.getByRole('button',{name:'取消布置',exact:true}).click();
  if(await page.getByRole('button',{name:'展开顶部信息栏（可拖拽）'}).isVisible())await page.getByRole('button',{name:'展开顶部信息栏（可拖拽）'}).click();
  await page.getByRole('button', {name: '章节地图'}).click();
  await expect(page.locator('.home-map')).toContainText('修缮 3 / 4');
  await expect(page.locator('.home-map')).toContainText('蓝色饭碗');
});

test('phone can collapse home controls, view the full map and return without horizontal scrolling', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await open(page, 'mobile');
  await page.getByRole('button', {name: '收起家园面板'}).click();
  await expect(page.getByRole('button', {name: '整理家园'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: 'output/home-review/mobile.png'});
  await page.getByRole('button', {name: '章节地图'}).click();
  await expect(page.locator('.home-map canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', {name: '关闭猫爪地图'}).click();
  await page.getByRole('button', {name: '整理家园'}).click();
  await expect(page.getByRole('heading', {name: '整理我们的家'})).toBeVisible();
});

test('all four approved interior stages load through the real chapter checkpoints',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:/^(开始冒险|继续冒险)/}).click();
  const fingerprints:string[]=[],floorBrightness:number[]=[];
  for(const [index,id] of ['greenhouse.home_1','greenhouse.home_2','greenhouse.home_3','finale.home'].entries()){
    await page.getByRole('button',{name:'验收工具',exact:true}).click();
    const panel=page.getByRole('dialog',{name:'流程验收'});
    await panel.getByTestId('qa-chapter-'+(index===3?'finale':'greenhouse')).click();
    await panel.getByTestId('qa-load-'+id).click();await expect(panel).not.toBeVisible();
    await expect(scene(page)).toHaveAttribute('data-home-stage',String(index+1));
    await expect(scene(page)).toHaveAttribute('data-home-artwork','ready');
    if(await page.getByRole('button',{name:'收起家园面板'}).isVisible())await page.getByRole('button',{name:'收起家园面板'}).click();
    const objects=JSON.parse((await scene(page).getAttribute('data-home-objects'))!) as {id:string}[];
    expect(objects.some(o=>o.id==='workbench')).toBe(index>=1);
    expect(objects.some(o=>o.id==='cat-tower')).toBe(index>=2);
    fingerprints.push(await scene(page).evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL()));
    floorBrightness.push(await scene(page).evaluate((canvas:HTMLCanvasElement)=>{
      const view=JSON.parse(canvas.dataset.homeCamera!),dpr=Number(canvas.dataset.dpr),ctx=canvas.getContext('2d')!;
      return [[840,600],[930,670],[1150,560]].reduce((sum,[x,y])=>{
        const [r,g,b]=ctx.getImageData(Math.round((view.x+x*view.scale)*dpr),Math.round((view.y+y*view.scale)*dpr),1,1).data;
        return sum+r*.2126+g*.7152+b*.0722;
      },0)/3;
    }));
    await page.screenshot({path:`output/home-review/stage-${index+1}.png`});
  }
  expect(new Set(fingerprints).size).toBe(4);expect(errors).toEqual([]);
  expect(floorBrightness[3],'the finished celebration keeps the restored greenhouse daylight').toBeGreaterThanOrEqual(floorBrightness[2]);
});

test('desktop and touch phone can zoom, pan, poke the same original cat and return to the full interior',async({browser})=>{
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await open(page,'mobile');await page.getByRole('button',{name:'收起家园面板'}).click();
    const camera=async()=>JSON.parse((await scene(page).getAttribute('data-home-camera'))!);
    await page.getByRole('button',{name:'放大花房'}).click({clickCount:3,delay:80});
    await expect.poll(async()=>(await camera()).zoom).toBe(2.05);
    const previous=await camera();
    const box=(await scene(page).boundingBox())!,start={x:box.x+box.width*.58,y:box.y+box.height*.5};
    if(mobile){
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
      for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+i*6,y:start.y+i*3}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    }else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+50,start.y+30,{steps:6});await page.mouse.up();}
    await expect.poll(async()=>(await camera()).x).not.toBe(previous.x);
    expect((await cats(page)).every(cat=>!cat.bubble)).toBe(true,'dragging must not poke a cat');
    const target=await scene(page).evaluate((canvas:HTMLCanvasElement)=>{
      const view=JSON.parse(canvas.dataset.homeCamera!),cat=JSON.parse(canvas.dataset.homeCats!).find((item:CatSnapshot)=>item.breed==='miaomiao');
      const bounds=canvas.getBoundingClientRect(),w=Number(canvas.dataset.logicalWidth),h=Number(canvas.dataset.logicalHeight);
      const scale=(getComputedStyle(canvas).objectFit==='cover'?Math.max:Math.min)(bounds.width/w,bounds.height/h);
      return{x:bounds.left+(bounds.width-w*scale)/2+(view.x+cat.x*view.scale)*scale,y:bounds.top+(bounds.height-h*scale)/2+(view.y+(cat.y-16)*view.scale)*scale};
    });
    if(mobile)await page.touchscreen.tap(target.x,target.y);else await page.mouse.click(target.x,target.y);
    await expect.poll(async()=>(await cats(page)).find(cat=>cat.breed==='miaomiao')?.bubble).toContain('本咪');
    await page.screenshot({path:`output/home-review/${mobile?'mobile':'desktop'}-interaction.png`});
    await page.getByRole('button',{name:'花房全景',exact:true}).click();
    await expect.poll(async()=>(await camera()).zoom).toBe(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);await context.close();
  }
});
