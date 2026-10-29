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
type CatSnapshot = {breed: string; x: number; y: number; pose: string | null; action: string; height: number};
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
  await page.addInitScript(({origin, session}) => {if (location.origin === origin) localStorage.setItem('stray-kitty.session.v1', JSON.stringify(session));}, {origin, session: sessions.get(id)!});
  await page.goto(origin);await page.getByRole('button', {name: '继续冒险'}).click();
  await expect(scene(page)).toHaveAttribute('data-rendered-scene', 'home');
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
  const terrainPoints = [[20, 20], [200, 220], [680, 220], [355, 450], [100, 430]];
  const liveSamples = await scene(page).evaluate((canvas: HTMLCanvasElement, points) => points.map(([x, y]) => Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data)), terrainPoints);
  await page.getByRole('button', {name: '章节地图'}).click();
  const map = page.locator('.home-map');
  await expect(map).toHaveAttribute('data-layout', (await scene(page).getAttribute('data-home-layout'))!);
  await expect(page.locator('.map-stop.current')).toContainText('废弃花房');
  const paused = await scene(page).getAttribute('data-home-time');const positions = await cats(page);
  await page.waitForTimeout(700);
  expect(await scene(page).getAttribute('data-home-time')).toBe(paused);expect(await cats(page)).toEqual(positions);
  const previewSamples = await map.locator('canvas').evaluate((canvas: HTMLCanvasElement, points) => points.map(([x, y]) => Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data)), terrainPoints);
  expect(previewSamples).toEqual(liveSamples);
  await page.screenshot({path: 'output/home-review/map.png'});
  await page.keyboard.press('Escape');
  await expect.poll(async () => Number(await scene(page).getAttribute('data-home-time'))).toBeGreaterThan(Number(paused));
});

test('repairs update both views and placed furniture survives refresh', async ({page}) => {
  await open(page, 'repair');
  await expect(scene(page)).toHaveAttribute('data-home-stage', '1');
  await page.getByRole('button', {name: /动手修缮：封窗止水/}).click();
  await expect(scene(page)).toHaveAttribute('data-home-stage', '2');
  await page.getByRole('button', {name: /动手修缮：原木温室/}).click();
  await expect(scene(page)).toHaveAttribute('data-home-stage', '3');
  await page.reload();await page.getByRole('button', {name: '继续冒险'}).click();
  await expect(scene(page)).toHaveAttribute('data-home-stage', '3');
  await expect(page.getByRole('button', {name: '窗边'})).toContainText('蓝色饭碗');
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
