import {expect, test, type APIRequestContext, type Page, type Locator} from '@playwright/test';
import type {GameState, Session} from '../../web/src/contracts';

async function openChapter(page: Page, request: APIRequestContext, checkpointId: string) {
  const session = await (await request.post('/api/v1/sessions')).json() as Session;
  const headers = {Authorization: `Bearer ${session.token}`};
  const state = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  const response = await request.post('/api/v1/commands', {
    headers: {...headers, 'Idempotency-Key': 'labels-' + checkpointId.replace(/\./g, '-')},
    data: {expectedRevision: state.revision, command: {type: 'QA_CHECKPOINT', checkpointId}},
  });
  expect(response.ok(), await response.text()).toBe(true);
  await page.addInitScript(session => localStorage.setItem('stray-kitty.session.v1', JSON.stringify(session)), session);
  await page.goto('/');
  await page.getByRole('button', {name: /^(暂不登录|继续冒险)/}).click();
  const canvas = page.locator('.game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-phase', 'explore');
  if (checkpointId.startsWith('finale.')) await expect(canvas).toHaveAttribute('data-ready', 'true');
  else await expect(canvas).toHaveAttribute('data-background-state', 'ready');
  return {canvas, headers};
}

async function walkTo(page: Page, canvas: Locator, key: string, axis: 'x' | 'y', limit: number, below: boolean) {
  await canvas.focus();
  const element = await canvas.elementHandle();
  await page.keyboard.down(key);
  try {
    // Sample each animation frame so a held key cannot overshoot the interaction radius.
    await page.waitForFunction(({element, axis, limit, below}) => {
      const value = Number(element!.getAttribute('data-player-' + axis));
      return below ? value < limit : value > limit;
    }, {element, axis, limit, below}, {polling: 'raf', timeout: 10000});
  } finally {await page.keyboard.up(key);}
}

test('chapters 1, 2, 4 and 5 share the exact glass style with no duplicate interaction hints', async ({page, request}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let reference: unknown;
  for (const [checkpoint, mapId] of [['alley.explore', 'alley'], ['market.explore', 'market'], ['rescue.explore', 'tunnel'], ['finale.explore', 'warehouse']]) {
    const {canvas} = await openChapter(page, request, checkpoint);
    await expect(canvas).toHaveAttribute('data-map-id', mapId);
    await expect(page.locator('.alley-label-layer')).toHaveCount(1);
    const label = page.locator('.alley-glass-label').first();
    await expect(label).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
    const style = await label.evaluate(element => {
      const css = getComputedStyle(element);
      return Object.fromEntries(['fontFamily', 'fontSize', 'fontWeight', 'color', 'borderRadius', 'backgroundImage', 'backgroundColor', 'backdropFilter', 'padding', 'minHeight'].map(key => [key, css[key as keyof CSSStyleDeclaration]]));
    });
    if (!reference) reference = style;
    else expect(style).toEqual(reference);
    await expect(page.locator('.discovery-dock,.inspect-hint')).toHaveCount(0);
    if (mapId !== 'alley') await expect(page.locator('.world-footer p')).toHaveCount(0);
    await page.screenshot({path: info.outputPath(mapId + '-labels.png')});
  }
  expect(errors).toEqual([]);
});

test('warehouse glass labels preserve E light toggles and reversible C shelf climbs', async ({page, request}, info) => {
  const {canvas, headers} = await openChapter(page, request, 'finale.explore');
  const commands: string[] = [];
  page.on('request', req => {
    if (!req.url().endsWith('/api/v1/commands') || req.method() !== 'POST') return;
    const command = req.postDataJSON().command;
    if (command.type === 'INTERACT') commands.push(command.interactionId);
  });
  await walkTo(page, canvas, 'ArrowUp', 'y', 600, true);
  const label = page.locator('[data-label="central_spotlight"] .alley-glass-label');
  await expect(label).toHaveAccessibleName('打开聚光灯（E）');
  await expect(label).toBeEnabled();
  await page.screenshot({path: info.outputPath('warehouse-active-light.png')});
  await label.click();
  await expect(label).toHaveAccessibleName('关闭聚光灯（E）');
  await expect(label).toBeEnabled();
  await expect.poll(async () => ((await (await request.get('/api/v1/state', {headers})).json()) as GameState).flags.includes('central_spotlight')).toBe(true);
  await canvas.focus();await page.keyboard.press('e');
  await expect(label).toHaveAccessibleName('打开聚光灯（E）');
  await expect(label).toBeEnabled();
  expect(commands).toEqual(['central_spotlight', 'central_spotlight']);
  await expect(page.locator('.discovery-dock,.inspect-hint')).toHaveCount(0);
  // The capsule's C action uses the same two-floor climb as the keyboard.
  await walkTo(page, canvas, 'ArrowUp', 'y', 505, true);
  await walkTo(page, canvas, 'ArrowLeft', 'x', 792, true);
  await walkTo(page, canvas, 'ArrowUp', 'y', 425, true);
  const climb = page.locator('[data-label="climb:C2"] .alley-glass-label');
  await expect(climb).toHaveAccessibleName('攀上货架（C）');
  await climb.click();
  await expect(canvas).toHaveAttribute('data-floor', 'L1');
  await expect(climb).toHaveAccessibleName('回到地面（C）');
  await page.screenshot({path: info.outputPath('warehouse-upper-labels.png')});
  await canvas.focus();await page.keyboard.press('c');
  await expect(canvas).toHaveAttribute('data-floor', 'L0');
  await walkTo(page, canvas, 'ArrowLeft', 'x', 792, true);
  await walkTo(page, canvas, 'ArrowDown', 'y', 585, false);
  await walkTo(page, canvas, 'ArrowRight', 'x', 830, false);
  await walkTo(page, canvas, 'ArrowDown', 'y', 735, false);
  await expect(label).toBeDisabled();
  await expect(page.locator('[data-label="central_spotlight"]')).toHaveAttribute('data-visible', 'false');
});
