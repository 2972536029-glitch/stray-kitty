import {expect, test} from '@playwright/test';
import type {GameState, Session} from '../../web/src/contracts';

for (const entry of ['qa', 'story'] as const) {
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
    if (entry === 'qa') {
      const qa = page.getByRole('button', {name: '验收工具', exact: true});
      if (!await qa.isVisible()) await page.getByRole('button', {name: '展开顶部信息栏（可拖拽）'}).click();
      await qa.click();
      const panel = page.getByRole('dialog', {name: '流程验收'});
      await panel.getByTestId('qa-chapter-finale').click();
      await panel.getByTestId('qa-load-finale.explore').click();
      await expect(panel).not.toBeVisible();
    } else {
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
