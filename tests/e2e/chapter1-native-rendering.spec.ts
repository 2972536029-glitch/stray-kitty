import {expect, test, type Page, type APIRequestContext} from '@playwright/test';
import type {GameState, Session} from '../../web/src/contracts';

async function prepare(page: Page, request: APIRequestContext, checkpointId: string) {
  const session = await (await request.post('/api/v1/sessions')).json() as Session;
  const headers = {Authorization: `Bearer ${session.token}`};
  const state = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  const setup = await request.post('/api/v1/commands', {
    headers: {...headers, 'Idempotency-Key': 'native-' + checkpointId.replace(/\./g, '-')},
    data: {expectedRevision: state.revision, command: {type: 'QA_CHECKPOINT', checkpointId}},
  });
  expect(setup.ok(), await setup.text()).toBe(true);
  await page.addInitScript(session => localStorage.setItem('stray-kitty.session.v1', JSON.stringify(session)), session);
  await page.goto('/');
  await page.getByRole('button', {name: /^(暂不登录|继续冒险)/}).click();
  const canvas = page.locator('.game-viewport canvas');
  if (checkpointId === 'finale.explore') await expect(canvas).toHaveAttribute('data-ready', 'true');
  else await expect(canvas).toHaveAttribute('data-background-state', 'ready');
  return canvas;
}

for (const dpr of [1, 2]) test.describe('Chapter 1 display density ' + dpr, () => {
  test.use({deviceScaleFactor: dpr, viewport: {width: 1600, height: 900}});
  test('native pixels and aligned camera survive walking and resizing without resetting progress', async ({page, request}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const samples: {a: number; d: number; e: number; f: number; right: number; bottom: number}[] = [];
      Object.assign(window, {alleyRenderSamples: samples});
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(...args: Parameters<typeof original>) {
        const source = args[0];
        // The full map, excluding the squeeze passage's cropped facade textures.
        if (args.length === 5 && source instanceof HTMLImageElement && source.src.includes('rainy-alley-background-clean') && this.canvas.closest('.game-viewport')) {
          const {a, d, e, f} = this.getTransform();
          samples.push({a, d, e, f, right: e + a * Number(args[3]), bottom: f + d * Number(args[4])});
          if (samples.length > 120) samples.shift();
        }
        return original.apply(this, args);
      };
    });
    const canvas = await prepare(page, request, 'alley.explore');
    await expect(canvas).toHaveAttribute('width', String(1600 * dpr));
    await expect(canvas).toHaveAttribute('height', String(960 * dpr));
    await expect(canvas).toHaveAttribute('data-logical-width', '800');
    await expect(canvas).toHaveAttribute('data-logical-height', '480');
    const expectCovered = async () => {
      const expectedScale = Math.min(800 / (530 * 1.425), 480 / (325 * 1.345)) * Number(await canvas.getAttribute('width')) / 800;
      await expect.poll(() => page.evaluate(() => (window as unknown as {alleyRenderSamples: {a: number}[]}).alleyRenderSamples.at(-1)?.a ?? 0)).toBeCloseTo(expectedScale, 4);
      const painted = await page.evaluate(() => (window as unknown as {alleyRenderSamples: {e: number; f: number; right: number; bottom: number}[]}).alleyRenderSamples.at(-1));
      expect(painted).toBeDefined();
      expect(painted!.e).toBeLessThanOrEqual(.001);
      expect(painted!.f).toBeLessThanOrEqual(.001);
      expect(painted!.right).toBeGreaterThanOrEqual(Number(await canvas.getAttribute('width')) - .001);
      expect(painted!.bottom).toBeGreaterThanOrEqual(Number(await canvas.getAttribute('height')) - .001);
    };
    // Spawn sits against the world edge where registration previously left a blank strip.
    await expectCovered();
    const beforeClickY = Number(await canvas.getAttribute('data-player-y'));
    const clickTarget = await canvas.evaluate(c => {
      const canvas = c as HTMLCanvasElement, bounds = canvas.getBoundingClientRect();
      const fit = getComputedStyle(canvas).objectFit === 'cover' ? Math.max : Math.min;
      const scale = fit(bounds.width / canvas.width, bounds.height / canvas.height);
      const drawn = (window as unknown as {alleyRenderSamples: {a: number; d: number; e: number; f: number}[]}).alleyRenderSamples.at(-1)!;
      return {
        x: bounds.left + (bounds.width - canvas.width * scale) / 2 + (drawn.e + drawn.a * (-51 + Number(canvas.dataset.playerX) * 1.425)) * scale,
        y: bounds.top + (bounds.height - canvas.height * scale) / 2 + (drawn.f + drawn.d * (-83 + (Number(canvas.dataset.playerY) - 12) * 1.345)) * scale,
      };
    });
    await page.mouse.click(clickTarget.x, clickTarget.y);
    await expect.poll(async () => Number(await canvas.getAttribute('data-player-y'))).toBeLessThan(beforeClickY - 6);
    // Walk out of the entrance's collision corner before testing camera motion.
    const element = await canvas.elementHandle();
    await canvas.focus();await page.keyboard.down('ArrowUp');
    try {await page.waitForFunction(element => Number(element!.getAttribute('data-player-y')) < 602, element, {timeout: 10000});}
    finally {await page.keyboard.up('ArrowUp');}
    await page.keyboard.down('ArrowRight');
    try {await page.waitForFunction(element => Number(element!.getAttribute('data-player-x')) > 145, element, {timeout: 10000});}
    finally {await page.keyboard.up('ArrowRight');}
    await page.evaluate(() => {(window as unknown as {alleyRenderSamples: unknown[]}).alleyRenderSamples.length = 0;});
    const startY = Number(await canvas.getAttribute('data-player-y'));
    await page.keyboard.down('ArrowUp');
    try {
      await page.waitForFunction(startY => {
        const samples = (window as unknown as {alleyRenderSamples: {e: number; f: number}[]}).alleyRenderSamples;
        return samples.length > 10 && Number(document.querySelector('.game-viewport canvas')?.getAttribute('data-player-y')) < startY - 10;
      }, startY, {timeout: 10000});
    } finally {await page.keyboard.up('ArrowUp');}
    const samples = await page.evaluate(() => (window as unknown as {alleyRenderSamples: {a: number; d: number; e: number; f: number}[]}).alleyRenderSamples);
    expect(samples.every(s => Math.abs(s.e - Math.round(s.e)) < .0001 && Math.abs(s.f - Math.round(s.f)) < .0001)).toBe(true);
    // The agreed 530 x 325 camera at zoom 1 must not change with display density.
    const agreedScale = Math.min(800 / (530 * 1.425), 480 / (325 * 1.345)) * 2 * dpr;
    expect(samples.every(s => Math.abs(s.a - agreedScale) < .0001 && Math.abs(s.d - agreedScale) < .0001)).toBe(true);
    const position = [await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')];
    await page.setViewportSize({width: 1333, height: 777});
    await expect(canvas).toHaveAttribute('width', String(1335 * dpr));
    await expect(canvas).toHaveAttribute('height', String(801 * dpr));
    expect([await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')]).toEqual(position);
    await expect(page.locator('.alley-label-layer')).toHaveCount(1);
    await expectCovered();
    expect(errors).toEqual([]);
  });
});

test('Chapter 5 retains its existing rendering resolution', async ({page, request}) => {
  for (const checkpoint of ['finale.explore']) {
    const canvas = await prepare(page, request, checkpoint);
    const {density, width, height} = await canvas.evaluate(c => ({density: Math.max(1, devicePixelRatio), width: (c as HTMLCanvasElement).width, height: (c as HTMLCanvasElement).height}));
    expect([width, height]).toEqual([Math.round(800 * density), Math.round(480 * density)]);
  }
});

test('Chapter 1 stays playable while enhancement is delayed and swaps after decode', async ({page, request}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release = resolve;});
  await page.route(/rainy-alley-background-clean\.enhanced-v1.*\.webp/, async route => {await gate;await route.continue();});
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const canvas = await prepare(page, request, 'alley.explore');
    await expect(canvas).toHaveAttribute('data-alley-artwork', 'original');
    const before = Number(await canvas.getAttribute('data-player-y'));
    await canvas.focus();await page.keyboard.down('ArrowUp');
    try {await expect.poll(async () => Number(await canvas.getAttribute('data-player-y'))).toBeLessThan(before - 10);}
    finally {await page.keyboard.up('ArrowUp');}
    await expect(canvas).toHaveAttribute('data-background-state', 'ready');
    const position = [await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')];
    release();
    await expect(canvas).toHaveAttribute('data-alley-artwork', 'enhanced');
    expect([await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')]).toEqual(position);
    expect(errors).toEqual([]);
  } finally {release();}
});

test('Chapter 1 keeps the original playable if enhancement decoding fails', async ({page, request}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/rainy-alley-background-clean\.enhanced-v1.*\.webp/, route => route.fulfill({contentType: 'image/webp', body: 'invalid image'}));
  const failed = page.waitForResponse(response => response.url().includes('enhanced-v1'));
  const canvas = await prepare(page, request, 'alley.explore');
  await failed;
  await expect(canvas).toHaveAttribute('data-alley-artwork', 'original');
  const before = Number(await canvas.getAttribute('data-player-y'));
  await canvas.focus();await page.keyboard.down('ArrowUp');
  try {await expect.poll(async () => Number(await canvas.getAttribute('data-player-y'))).toBeLessThan(before - 10);}
  finally {await page.keyboard.up('ArrowUp');}
  await expect(canvas).toHaveAttribute('data-background-state', 'ready');
  expect(errors).toEqual([]);
});
