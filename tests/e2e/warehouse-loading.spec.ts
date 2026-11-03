import {expect, test, type APIRequestContext, type Page} from '@playwright/test';
import type {GameState, Session} from '../../web/src/contracts';
import {readFileSync} from 'node:fs';

async function prepareCheckpoint(page: Page, request: APIRequestContext, checkpointId: string) {
  const session = await (await request.post('/api/v1/sessions')).json() as Session;
  const headers = {Authorization: `Bearer ${session.token}`};
  const state = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  const setup = await request.post('/api/v1/commands', {
    headers: {...headers, 'Idempotency-Key': 'cold-assets'},
    data: {expectedRevision: state.revision, command: {type: 'QA_CHECKPOINT', checkpointId}},
  });
  expect(setup.ok()).toBe(true);
  await page.addInitScript(value => localStorage.setItem('stray-kitty.session.v1', JSON.stringify(value)), session);
}

test('warehouse loads props alongside the floor, skips unrelated chapters, and reuses images on reentry', async ({page, request}) => {
  await prepareCheckpoint(page, request, 'finale.explore');
  const images: string[] = [], errors: string[] = [];
  page.on('request', request => {if (request.resourceType() === 'image') images.push(request.url());});
  page.on('pageerror', error => errors.push(error.message));
  let releaseGround!: () => void;
  const groundGate = new Promise<void>(resolve => {releaseGround = resolve;});
  await page.route(/warehouse_L0_ground.*\.(?:png|webp)/, async route => {await groundGate;await route.continue();});
  try {
    await page.goto('/');
    await page.getByRole('button', {name: /^(开始冒险|继续冒险)/}).click();
    await expect.poll(() => images.some(url => url.includes('warehouse_L0_ground'))).toBe(true);
    // The large floor is still blocked: props must already be downloading.
    await expect.poll(() => images.some(url => url.includes('crate_one'))).toBe(true);
  } finally {releaseGround();}
  const canvas = page.locator('canvas[data-map-id="warehouse"]');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  const ground = images.find(url => url.includes('warehouse_L0_ground'))!;
  expect(new URL(ground).pathname).toMatch(/\.webp$/);
  const original = readFileSync(new URL('../../level_design/chapter5/art/warehouse_L0_ground.png', import.meta.url)).toString('base64');
  const identical = await page.evaluate(async ({ground, original}) => {
    const load = async (url: string) => {const image = new Image();image.src = url;await image.decode();return image;};
    const images = await Promise.all([load(ground), load('data:image/png;base64,' + original)]);
    const pixels = images.map(image => {const canvas = document.createElement('canvas');canvas.width = image.width;canvas.height = image.height;const ctx = canvas.getContext('2d')!;ctx.drawImage(image, 0, 0);return ctx.getImageData(0, 0, image.width, image.height).data;});
    return images[0].width === images[1].width && images[0].height === images[1].height && pixels[0].every((value, i) => value === pixels[1][i]);
  }, {ground, original});
  expect(identical).toBe(true);
  await canvas.focus();
  const y = await canvas.getAttribute('data-player-y');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowUp');
  await expect(canvas).not.toHaveAttribute('data-player-y', y!);
  expect(images.filter(url => /rainy-alley|chapter4_|night.market/.test(url))).toEqual([]);

  const previous = await canvas.elementHandle();
  images.length = 0;
  const qa = page.getByRole('button', {name: '验收工具', exact: true});
  if (!await qa.isVisible()) await page.getByRole('button', {name: '展开顶部信息栏（可拖拽）'}).click();
  await qa.click();
  await page.getByTestId('qa-chapter-finale').click();
  await page.getByTestId('qa-load-finale.explore').click();
  await page.waitForFunction(element => !element!.isConnected, previous);
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  expect(images).toEqual([]);
  expect(errors).toEqual([]);
});

test('warehouse retains a working PNG fallback if the lossless ground fails', async ({page, request}) => {
  await prepareCheckpoint(page, request, 'finale.explore');
  const fallback: string[] = [];
  await page.route(/warehouse_L0_ground.*\.webp/, route => route.abort('failed'));
  page.on('response', response => {if (/warehouse_L0_ground.*\.png/.test(response.url()) && response.ok()) fallback.push(response.url());});
  await page.goto('/');
  await page.getByRole('button', {name: /^(开始冒险|继续冒险)/}).click();
  await expect(page.locator('canvas[data-map-id="warehouse"]')).toHaveAttribute('data-ready', 'true');
  expect(fallback).toHaveLength(1);
});

for (const [checkpoint, scene, artwork] of [
  ['alley.explore', 'rainy-alley', 'rainy-alley-background-clean'],
  ['market.explore', 'night-market', 'night_market_L0_streets'],
  ['rescue.explore', 'chapter4-tunnel', 'chapter4_L0_approved'],
]) {
  test(`deferred ${scene} artwork loads when its chapter opens and movement still works`, async ({page, request}) => {
    await prepareCheckpoint(page, request, checkpoint);
    const images: string[] = [], errors: string[] = [];
    page.on('response', response => {if (response.request().resourceType() === 'image' && response.ok()) images.push(response.url());});
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', {name: /^(开始冒险|继续冒险)/}).click();
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('data-rendered-scene', scene);
    await expect.poll(() => images.some(url => url.includes(artwork))).toBe(true);
    await canvas.focus();
    const before = [await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')];
    await expect(async () => {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(300);
      await page.keyboard.up('ArrowRight');
      expect([await canvas.getAttribute('data-player-x'), await canvas.getAttribute('data-player-y')]).not.toEqual(before);
    }).toPass({timeout: 10000});
    expect(errors).toEqual([]);
  });
}

for (const entry of ['qa', 'story', 'qa-story'] as const) {
  test(`warehouse ${entry} entry works in an open tab after late JavaScript assets become unavailable`, async ({page, request}, info) => {
    const errors: string[] = [], lateScripts: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', {name: /^(开始冒险|继续冒险)/}).click();
    await expect(page.getByRole('button', {name: '继续故事', exact: true})).toBeVisible();
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('stray-kitty.session.v1')!) as Session);
    const headers = {Authorization: `Bearer ${session.token}`};

    if (entry === 'story') {
      // Prepare the preceding story, then enter the map through ordinary story
      // commands. The warehouse checkpoint is used only by the other case.
      const state = await (await request.get('/api/v1/state', {headers})).json() as GameState;
      const response = await request.post('/api/v1/commands', {
        headers: {...headers, 'Idempotency-Key': `warehouse-loading-${entry}`},
        data: {expectedRevision: state.revision, command: {type: 'QA_CHECKPOINT', checkpointId: 'finale.story'}},
      });
      expect(response.ok()).toBe(true);
      await page.reload();
      await page.getByRole('button', {name: /^(开始冒险|继续冒险)/}).click();
      await expect(page.getByRole('button', {name: '继续故事', exact: true})).toBeVisible();
    }

    // Model an already-open page whose deployment has retired its old chunks.
    // Images and API calls still work, but no later JS request can succeed.
    await page.route(/\.js(?:\?.*)?$/, route => {
      lateScripts.push(route.request().url());
      return route.abort('failed');
    });
    let reloads = 0;
    page.on('framenavigated', frame => {if (frame === page.mainFrame()) reloads++;});
    if (entry === 'qa' || entry === 'qa-story') {
      const qa = page.getByRole('button', {name: '验收工具', exact: true});
      if (!await qa.isVisible()) await page.getByRole('button', {name: '展开顶部信息栏（可拖拽）'}).click();
      await qa.click();
      const panel = page.getByRole('dialog', {name: '流程验收'});
      await panel.getByTestId('qa-chapter-finale').click();
      await panel.getByTestId(entry === 'qa-story' ? 'qa-load-finale.story' : 'qa-load-finale.explore').click();
      await expect(panel).not.toBeVisible();
    }
    if (entry === 'qa-story') {
      const dialogueCanvas = page.locator('canvas[data-map-id="warehouse"]');
      await expect(dialogueCanvas).toHaveAttribute('data-ready', 'true');
      await expect(dialogueCanvas).toHaveAttribute('data-phase', 'dialogue');
      await expect(dialogueCanvas).toHaveAttribute('data-rendered-scene', 'chapter5-warehouse');
      await page.screenshot({path: info.outputPath('warehouse-qa-story-dialogue.png')});
    }
    if (entry !== 'qa') {
      for (let i = 0; i < 4; i++) {
        const [response] = await Promise.all([
          page.waitForResponse(value => value.url().endsWith('/api/v1/commands') && value.request().method() === 'POST'),
          page.getByRole('button', {name: '继续故事', exact: true}).click(),
        ]);
        expect(response.ok()).toBe(true);
      }
    }

    const canvas = page.locator('canvas[data-map-id="warehouse"]');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await expect(canvas).toHaveAttribute('data-floor', 'L0');
    const before = await canvas.getAttribute('data-player-y');
    await canvas.focus();
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowUp');
    await expect(canvas).not.toHaveAttribute('data-player-y', before!);
    const actual = await (await request.get('/api/v1/state', {headers})).json() as GameState;
    expect({map: actual.mapId, phase: actual.phase}).toEqual({map: 'warehouse', phase: 'explore'});
    expect(lateScripts).toEqual([]);
    expect(errors).toEqual([]);
    expect(reloads).toBe(0);
    await page.screenshot({path: info.outputPath(`warehouse-${entry}-loaded.png`)});
  });
}
