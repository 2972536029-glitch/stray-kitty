import {expect, test, type Page, type APIRequestContext} from '@playwright/test';
import {spawn, type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {GameState, QATools} from '../../web/src/contracts';

let disabledServer: ChildProcess | undefined, disabledClosed: Promise<void> | undefined;
const disabledOrigin = 'http://127.0.0.1:8189';
test.beforeAll(async () => {
  fs.mkdirSync('output/qa-review', {recursive: true});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kitty-qa-disabled-'));
  disabledServer = spawn(path.join(process.cwd(), '.runtime', process.platform === 'win32' ? 'kitty-preview.exe' : 'kitty-preview'), [], {cwd: path.join(process.cwd(), 'server'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, GAME_ADDR: '127.0.0.1:8189', GAME_QA_ENABLED: 'false', GAME_DATA_FILE: path.join(directory, 'save.json'), GAME_WEB_DIR: path.join(process.cwd(), 'web/dist')}});
  disabledClosed = new Promise(resolve => disabledServer!.once('close', () => resolve()));
});
test.afterAll(async () => {if (disabledServer && disabledClosed) {const force = setTimeout(() => disabledServer?.kill('SIGKILL'), 3000);disabledServer.kill('SIGTERM');await disabledClosed;clearTimeout(force);}});

async function enter(page: Page, url = '/') {
  await page.goto(url);await page.getByRole('button', {name: /^(暂不登录|继续冒险)/}).click();
}
async function state(page: Page, request: APIRequestContext): Promise<GameState> {
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('stray-kitty.session.v1')!).token);
  return (await request.get(new URL('/api/v1/state', page.url()).href, {headers: {Authorization: `Bearer ${token}`}})).json();
}
async function tools(page: Page, request: APIRequestContext): Promise<QATools> {
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('stray-kitty.session.v1')!).token);
  return (await request.get(new URL('/api/v1/qa', page.url()).href, {headers: {Authorization: `Bearer ${token}`}})).json();
}
async function openQA(page: Page, chapter?: string) {
  await page.getByRole('button', {name: '验收工具', exact: true}).click();
  const panel = page.getByRole('dialog', {name: '流程验收'});
  await expect(panel).toBeVisible();
  if (chapter) await panel.getByTestId(`qa-chapter-${chapter}`).click();
  return panel;
}
async function load(page: Page, chapter: string, id: string) {
  const panel = await openQA(page, chapter);
  const testId = id === 'market.explore' ? 'dev-enter-market-exploration' : id === 'market.story' ? 'dev-start-market-story' : id === 'alley.explore' ? 'dev-direct-alley' : `qa-load-${id}`;
  await panel.getByTestId(testId).click();
  await expect(panel).not.toBeVisible();
  await expect(page.locator('.qa-active-badge')).toBeVisible();
}

test('every chapter button loads its real checkpoint from any phase and restore preserves original progress', async ({page, request}) => {
  test.setTimeout(150000);
  const errors: string[] = [];page.on('pageerror', error => errors.push(error.message));
  await enter(page);
  const original = await state(page, request);
  const manifest = await tools(page, request);
  expect(manifest.enabled).toBe(true);
  for (const point of manifest.checkpoints.filter(item => item.kind !== 'event')) {
    await load(page, point.chapterId, point.id);
    const actual = await state(page, request);
    expect({id: actual.qaCheckpointId, phase: actual.phase, map: actual.mapId}).toEqual({id: point.id, phase: point.phase, map: point.mapId});
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  const panel = await openQA(page, 'greenhouse');
  await expect(panel.getByTestId('qa-load-greenhouse.home_3')).toBeEnabled();
  await page.screenshot({path: 'output/qa-review/flow-panel.png'});
  await panel.getByTestId('qa-restore').click();
  const restored = await state(page, request);
  expect(restored.revision).toBeGreaterThan(original.revision);
  expect({...restored, revision: original.revision}).toEqual(original);
  await expect(page.locator('.qa-active-badge')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('distant market cards open without forged positions and keyboard activation does not advance hidden dialogue', async ({page, request}) => {
  await enter(page);
  const commands: string[] = [];
  page.on('request', req => {if (req.url().endsWith('/api/v1/commands') && req.method() === 'POST') commands.push(req.postDataJSON().command.type);});
  let panel = await openQA(page, 'market');
  await panel.getByTestId('dev-start-market-story').focus();await page.keyboard.press('Enter');
  await expect(panel).not.toBeVisible();
  expect((await state(page, request)).storyNodeId).toBe('market_intro_1');
  expect(commands).toEqual(['QA_CHECKPOINT']);
  panel = await openQA(page, 'market');
  await panel.getByLabel('选择事件').selectOption('event:market:crow_intel_event');
  await panel.getByTestId('qa-load-event').click();
  await expect(page.locator('.choice-list')).toBeVisible();
  await page.locator('.choice-list button').first().click();
  await page.getByRole('button', {name: '掷出骰子', exact: true}).click();
  await expect.poll(async () => (await state(page, request)).phase).not.toBe('event');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();await page.getByRole('button', {name:/^(暂不登录|继续冒险)/}).click();
  panel = await openQA(page);await panel.getByTestId('qa-restore').click();
  expect((await state(page, request)).storyNodeId).toBe('prologue_1');
});

test('battle inspection pauses simulation and mainline victories and finale defeats use normal settlement', async ({page, request}) => {
  test.setTimeout(90000);
  await enter(page);await load(page, 'market', 'market.battle');
  await page.getByTestId('market-play-toggle').click();
  await expect.poll(async () => Number(await page.getByTestId('market-battle').getAttribute('data-elapsed'))).toBeGreaterThan(0);
  let panel = await openQA(page);
  const paused = await page.getByTestId('market-battle').getAttribute('data-elapsed');
  await page.waitForTimeout(700);
  expect(await page.getByTestId('market-battle').getAttribute('data-elapsed')).toBe(paused);
  await page.screenshot({path: 'output/qa-review/battle-controls.png'});
  await panel.getByTestId('qa-simulate-victory').click();
  let actual = await state(page, request);
  expect(actual.phase).toBe('settlement');expect(actual.lastResult.outcome).toBe('won');expect(actual.flags).toContain('market_cleared');
  panel = await openQA(page);await panel.getByTestId('qa-continue').click();
  actual = await state(page, request);expect(actual.phase).toBe('explore');expect(actual.mapId).toBe('market');
  await load(page, 'finale', 'finale.battle');
  panel = await openQA(page);await panel.getByTestId('qa-simulate-defeat').click();
  actual = await state(page, request);expect(actual.phase).toBe('settlement');expect(actual.lastResult.outcome).toBe('lost');
  panel = await openQA(page);await panel.getByTestId('qa-continue').click();
  actual = await state(page, request);expect(actual.phase).toBe('preparation');
  panel = await openQA(page);await panel.getByTestId('qa-enter-battle').click();
  expect((await state(page, request)).phase).toBe('battle');
  panel = await openQA(page);await panel.getByTestId('qa-restore').click();
  expect((await state(page, request)).phase).toBe('dialogue');
});

test('server-disabled QA explains unavailable tools and keeps ordinary dialogue usable', async ({page, request}) => {
  await expect.poll(async () => {try {return (await request.get(disabledOrigin + '/healthz')).ok();} catch {return false;}}).toBe(true);
  await enter(page, disabledOrigin);
  const panel = await openQA(page, 'market');
  await expect(panel).toContainText('服务端未启用验收模式');
  await expect(panel.locator('.qa-checkpoints')).toHaveCount(0);
  await expect(panel.getByTestId('qa-next-story')).toBeEnabled();
  await panel.getByTestId('qa-next-story').click();
  expect((await state(page, request)).storyNodeId).toBe('prologue_home_narrator');
});

test('mobile can choose chapter and event, close the panel and return to original progress', async ({page, request}) => {
  await page.setViewportSize({width: 390, height: 844});
  await enter(page);
  let panel = await openQA(page, 'rescue');
  await expect(panel.getByTestId('qa-load-rescue.battle')).toBeEnabled();
  await page.screenshot({path: 'output/qa-review/mobile.png'});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.getByLabel('选择事件').selectOption('event:tunnel:valve_three_event');
  await panel.getByTestId('qa-load-event').click();
  expect((await state(page, request)).pendingEventId).toBe('valve_three_event');
  panel = await openQA(page);await panel.getByTestId('qa-restore').click();
  expect((await state(page, request)).storyNodeId).toBe('prologue_1');
});
