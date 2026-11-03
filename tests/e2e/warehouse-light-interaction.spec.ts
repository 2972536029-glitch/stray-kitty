import {expect, test} from '@playwright/test';
import type {GameState, Session} from '../../web/src/contracts';

test('warehouse light acknowledgements do not freeze walking, bypass pause, or duplicate commands', async ({page, request}) => {
  const session = await (await request.post('/api/v1/sessions')).json() as Session;
  const headers = {Authorization: `Bearer ${session.token}`};
  const state = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  const setup = await request.post('/api/v1/commands', {
    headers: {...headers, 'Idempotency-Key': 'warehouse-light-checkpoint'},
    data: {expectedRevision: state.revision, command: {type: 'QA_CHECKPOINT', checkpointId: 'finale.explore'}},
  });
  expect(setup.ok()).toBe(true);
  await page.addInitScript(value => localStorage.setItem('stray-kitty.session.v1', JSON.stringify(value)), session);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', {name: /^(开始冒险|继续冒险)/}).click();
  const canvas = page.locator('canvas[data-map-id="warehouse"]');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await canvas.focus();
  const element = await canvas.elementHandle();
  await page.keyboard.down('ArrowUp');
  try {await page.waitForFunction(element => Number(element!.getAttribute('data-player-y')) < 600, element);}
  finally {await page.keyboard.up('ArrowUp');}
  const open = page.getByRole('button', {name: '打开聚光灯 · E', exact: true});
  const close = page.getByRole('button', {name: '关闭聚光灯 · E', exact: true});
  await expect(open).toBeEnabled();
  const brightness = () => canvas.evaluate(element => {
    const pixels = (element as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let sum = 0;for (let i = 0; i < pixels.length; i += 16) sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
    return sum / (pixels.length / 16 * 3);
  });
  const unlit = await brightness();

  let release!: () => void, commands = 0;
  const acknowledgement = new Promise<void>(resolve => {release = resolve;});
  await page.route('**/api/v1/commands', async route => {
    const command = route.request().postDataJSON().command;
    if (command.type === 'INTERACT' && command.interactionId === 'central_spotlight') {
      commands++;
      await acknowledgement;
    }
    await route.continue();
  });
  try {
    await canvas.focus();
    await page.keyboard.press('e');
    await expect.poll(() => commands).toBe(1);
    await expect(open).toBeDisabled();
    // The visible light responds before the server command is even sent.
    await expect.poll(brightness).toBeGreaterThan(unlit + 3);
    const before = Number(await canvas.getAttribute('data-player-y'));
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(250);
    await page.keyboard.up('ArrowUp');
    await expect.poll(async () => Number(await canvas.getAttribute('data-player-y'))).toBeLessThan(before - 10);
    // E must not enqueue another toggle while the first result is unknown.
    await page.keyboard.press('e');
    expect(commands).toBe(1);
    const unconfirmed = await (await request.get('/api/v1/state', {headers})).json() as GameState;
    expect(unconfirmed.flags).not.toContain('central_spotlight');

    await page.locator('.world-toolbar').getByRole('button', {name: '暂停', exact: true}).click();
    const pausedY = await canvas.getAttribute('data-player-y');
    await canvas.focus();
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(250);
    await page.keyboard.up('ArrowUp');
    await expect(canvas).toHaveAttribute('data-player-y', pausedY!);
  } finally {release();}
  await expect(close).toBeVisible();
  await page.locator('.world-toolbar').getByRole('button', {name: '继续旅程', exact: true}).click();
  await expect(close).toBeEnabled();
  const actual = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  expect(actual.flags).toContain('central_spotlight');
  expect(commands).toBe(1);

  const lit = await brightness();
  await canvas.focus();await page.keyboard.press('e');
  await expect(open).toBeEnabled();
  await expect.poll(brightness).toBeLessThan(lit - 3);
  const dark = await brightness();
  await canvas.focus();await page.keyboard.press('e');
  await expect(close).toBeEnabled();
  await expect.poll(brightness).toBeGreaterThan(dark + 3);
  expect(commands).toBe(3);
  const beforeFailure = await brightness();

  // An unknown network result still locks the ordinary pending-command flow;
  // retry must confirm the same toggle, rather than create another command.
  await page.unroute('**/api/v1/commands');
  const keys: string[] = [];
  await page.route('**/api/v1/commands', async route => {
    const command = route.request().postDataJSON().command;
    if (command.type === 'INTERACT' && command.interactionId === 'central_spotlight') {
      keys.push(route.request().headers()['idempotency-key']);
      if (keys.length === 1) {await route.abort('failed');return;}
    }
    await route.continue();
  });
  await canvas.focus();await page.keyboard.press('e');
  await expect(page.getByRole('alert')).toContainText('无法连接游戏服务');
  await expect.poll(brightness).toBeGreaterThan(beforeFailure - 2);
  const pendingY = await canvas.getAttribute('data-player-y');
  await canvas.focus();await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(250);await page.keyboard.up('ArrowUp');
  await expect(canvas).toHaveAttribute('data-player-y', pendingY!);
  const unconfirmed = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  expect(unconfirmed.flags).toContain('central_spotlight');
  await page.getByRole('button', {name: '重试上次操作', exact: true}).click();
  await expect(open).toBeEnabled();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  const recovered = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  expect(recovered.flags).not.toContain('central_spotlight');
  expect(errors).toEqual([]);
});
