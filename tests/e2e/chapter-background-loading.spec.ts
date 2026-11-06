import {expect, test, type APIRequestContext, type Page} from '@playwright/test';
import {readFileSync, statSync} from 'node:fs';
import type {GameState, Session} from '../../web/src/contracts';

const chapters = [
  ['alley.explore', 'rainy-alley', 'rainy-alley-background-clean', 'web/src/modules/rainyAlley/assets/rainy-alley-background-clean.png', 1],
  ['market.explore', 'night-market', 'night_market_L0_streets_1672x941', 'web/public/assets/night-market/night_market_L0_streets_1672x941.png', 3],
  ['rescue.explore', 'chapter4-tunnel', 'chapter4_L0_approved', 'level_design/chapter4/art/chapter4_L0_approved.png', 2],
  ['greenhouse.home_1', 'home', 'greenhouse-base', 'web/public/assets/home/greenhouse-base.png', 1],
] as const;

async function prepare(page: Page, request: APIRequestContext, checkpointId: string, artwork: string) {
  const session = await (await request.post('/api/v1/sessions')).json() as Session;
  const headers = {Authorization: `Bearer ${session.token}`};
  const state = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  const response = await request.post('/api/v1/commands', {
    headers: {...headers, 'Idempotency-Key': 'chapter-background'},
    data: {expectedRevision: state.revision, command: {type: 'QA_CHECKPOINT', checkpointId}},
  });
  expect(response.ok()).toBe(true);
  await page.addInitScript(({session, artwork}) => {
    localStorage.setItem('stray-kitty.session.v1', JSON.stringify(session));
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(...args: Parameters<typeof original>) {
      original.apply(this, args);
      const source = args[0];
      if (source instanceof HTMLImageElement && source.src.includes(artwork)) this.canvas.dataset.paintedBackground = source.src;
      if (source instanceof HTMLCanvasElement && source.dataset.paintedBackground) this.canvas.dataset.paintedBackground = source.dataset.paintedBackground;
    };
  }, {session, artwork});
}

for (const [checkpoint, scene, artwork] of chapters.slice(0, 3)) {
  test(`${scene} holds characters, movement and interaction until a slow map is decoded`, async ({page, request}, info) => {
    await prepare(page, request, checkpoint, artwork);
    const commands: string[] = [], errors: string[] = [];
    page.on('request', req => {if (req.url().endsWith('/api/v1/commands') && req.method() === 'POST') commands.push(req.postData() ?? '');});
    page.on('pageerror', error => errors.push(error.message));
    let release!: () => void;
    const gate = new Promise<void>(resolve => {release = resolve;});
    await page.route(new RegExp(artwork + '.*\\.(?:webp|png)'), async route => {await gate;await route.continue();});
    const canvas = page.locator('.game-viewport canvas');
    try {
      await page.goto('/', {waitUntil: 'domcontentloaded'});
      await page.getByRole('button', {name: /^(暂不登录|继续冒险)/}).click();
      await expect(canvas).toHaveAttribute('data-background-state', 'loading');
      await expect(page.getByRole('status').filter({hasText: '正在打开地图'})).toBeVisible();
      const position = [await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')];
      await canvas.focus();
      await page.keyboard.down('ArrowRight');await page.waitForTimeout(600);await page.keyboard.up('ArrowRight');
      await page.keyboard.press('e');await page.keyboard.press('c');await page.keyboard.press('f');
      expect([await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')]).toEqual(position);
      expect(await canvas.getAttribute('data-painted-background')).toBeNull();
      expect(commands).toEqual([]);
      await page.screenshot({path: info.outputPath(scene + '-slow-loading.png')});
    } finally {release();}
    await expect(canvas).toHaveAttribute('data-background-state', 'ready');
    await expect(canvas).toHaveAttribute('data-painted-background', /\.webp$/);
    await expect(page.locator('.map-loading-panel')).toHaveCount(0);
    const before = [await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')];
    await expect(async () => {
      await page.keyboard.down('ArrowRight');await page.waitForTimeout(300);await page.keyboard.up('ArrowRight');
      expect([await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')]).not.toEqual(before);
    }).toPass({timeout: 10000});
    expect(errors).toEqual([]);
    await page.screenshot({path: info.outputPath(scene + '-slow-ready.png')});
  });
}

test('failed classic-map downloads show retry and recover without refreshing or losing position', async ({page, request}) => {
  await prepare(page, request, 'alley.explore', 'rainy-alley-background-clean');
  let failing = true;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/rainy-alley-background-clean.*\.(?:webp|png)/, route => failing ? route.abort('failed') : route.continue());
  await page.goto('/');
  await page.getByRole('button', {name: /^(暂不登录|继续冒险)/}).click();
  const canvas = page.locator('.game-viewport canvas');
  await expect(canvas).toHaveAttribute('data-background-state', 'error');
  await expect(page.getByRole('alert').filter({hasText: '地图暂时没打开'})).toBeVisible();
  const before = [await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')];
  failing = false;
  await page.getByRole('button', {name: '重新加载地图', exact: true}).click();
  await expect(canvas).toHaveAttribute('data-background-state', 'ready');
  await expect(canvas).toHaveAttribute('data-painted-background', /\.webp$/);
  expect([await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')]).toEqual(before);
  expect(errors).toEqual([]);
});

for (const [checkpoint, scene, artwork, source, floorCount] of chapters) {
  test(`${scene} warms only its own floors and reuses decoded artwork on reentry`, async ({page, request}, info) => {
    await prepare(page, request, checkpoint, artwork);
    const requests: string[] = [], errors: string[] = [];
    page.on('request', request => {if (/lossless.*\.webp/.test(request.url()) && !request.url().includes('/assets/home/')) requests.push(request.url());});
    page.on('pageerror', error => errors.push(error.message));
    let release!: () => void;
    const gate = new Promise<void>(resolve => {release = resolve;});
    await page.route(new RegExp(artwork + '.*\\.webp'), async route => {await gate;await route.continue();});
    try {
      await page.goto('/', {waitUntil: 'domcontentloaded'});
      await expect(page.getByRole('button', {name: /^(暂不登录|继续冒险)/})).toBeVisible();
      await expect.poll(() => requests.length).toBe(1);
      expect(requests.filter(url => url.includes(artwork))).toHaveLength(1);
      expect(requests.some(url => url.includes('warehouse'))).toBe(false);
      expect(await page.locator('.game-viewport canvas').count()).toBe(0);
    } finally {release();}
    await expect.poll(() => requests.filter(url => !url.includes('/assets/home/')).length).toBe(floorCount);
    const chapterPrefix = scene === 'night-market' ? 'night_market_' : scene === 'chapter4-tunnel' ? 'chapter4_' : artwork;
    await expect.poll(() => requests.filter(url => url.includes(chapterPrefix)).length).toBe(floorCount);
    await page.getByRole('button', {name: /^(暂不登录|继续冒险)/}).click();
    const canvas = page.locator('.game-viewport canvas');
    await expect(canvas).toHaveAttribute('data-rendered-scene', scene);
    await expect(canvas).toHaveAttribute('data-painted-background', /\.webp$/);
    if (scene === 'home') await expect(canvas).toHaveAttribute('data-home-artwork', 'ready');
    if (checkpoint === 'alley.explore') await expect(canvas).toHaveAttribute('data-alley-artwork', 'enhanced');
    expect(requests.filter(url => !url.includes('/assets/home/')).length).toBe(floorCount + (checkpoint === 'alley.explore' ? 1 : 0));

    const delivered = requests.find(url => url.includes(artwork))!;
    expect(statSync('web/src/modules/map/assets/' + artwork + '.lossless.webp').size).toBeLessThan(statSync(source).size);
    const original = readFileSync(source).toString('base64');
    expect(await page.evaluate(async ({delivered, original}) => {
      const pixels = async (url: string) => {
        const image = new Image();image.src = url;await image.decode();
        const canvas = document.createElement('canvas');canvas.width = image.width;canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;ctx.drawImage(image, 0, 0);
        return {width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data};
      };
      const [a, b] = await Promise.all([pixels(delivered), pixels('data:image/png;base64,' + original)]);
      return a.width === b.width && a.height === b.height && a.data.every((value, i) => value === b.data[i]);
    }, {delivered, original})).toBe(true);

    const previous = await canvas.elementHandle();
    requests.length = 0;
    await page.getByRole('button', {name: '验收工具', exact: true}).click();
    await page.getByTestId('qa-chapter-' + checkpoint.split('.')[0]).click();
    await page.getByTestId(checkpoint === 'alley.explore' ? 'dev-direct-alley' : checkpoint === 'market.explore' ? 'dev-enter-market-exploration' : 'qa-load-' + checkpoint).click();
    await page.waitForFunction(element => !element!.isConnected, previous);
    await expect(canvas).toHaveAttribute('data-painted-background', /\.webp$/);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({path: info.outputPath(scene + '-loaded.png')});
  });

  test(`${scene} paints the approved PNG if WebP fails`, async ({page, request}) => {
    await prepare(page, request, checkpoint, artwork);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(new RegExp(artwork + '.*\\.webp'), route => route.abort('failed'));
    await page.goto('/');
    await page.getByRole('button', {name: /^(暂不登录|继续冒险)/}).click();
    const canvas = page.locator('.game-viewport canvas');
    await expect(canvas).toHaveAttribute('data-painted-background', /\.png$/);
    if (scene === 'home') await expect(canvas).toHaveAttribute('data-home-artwork', 'ready');
    expect(errors).toEqual([]);
  });
}
