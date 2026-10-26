import {expect, test} from '@playwright/test';
import fs from 'node:fs';
import type {GameCommand, GameState, Session} from '../../web/src/contracts';

test('既有内容版本的战斗会话刷新后沿用同一场次，宽窄屏教学可操作', async ({page, request}) => {
  page.setDefaultTimeout(10000);
  // Create persisted state only through the public API. The previous main uses this
  // same content version and stores stageId in the attempt, without a tactical snapshot.
  const session = await (await request.post('/api/v1/sessions')).json() as Session;
  const headers = {Authorization: `Bearer ${session.token}`};
  let state = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  const command = async (value: GameCommand) => {
    const response = await request.post('/api/v1/commands', {
      headers: {...headers, 'Idempotency-Key': `l00-session-${state.revision}`},
      data: {expectedRevision: state.revision, command: value},
    });
    expect(response.status()).toBe(200);
    state = (await response.json()).state;
  };
  const finishStory = async () => {
    for (let count = 0; state.phase === 'dialogue' && count < 20; count++) {
      await command({type: 'ADVANCE_STORY', nodeId: state.storyNodeId});
    }
    expect(state.phase).not.toBe('dialogue');
  };
  await finishStory();
  await command({type: 'INTERACT', interactionId: 'alley_crate'});
  await command({type: 'CHOOSE_EVENT', eventId: 'crate_event', optionId: 'search'});
  await finishStory();
  await command({type: 'START_BATTLE', stageId: 'alley_rescue'});
  expect(state.contentVersion).toBe('2026.10.22.1');
  expect(state.schemaVersion).toBe(1);
  expect(state.activeBattle).toMatchObject({stageId: 'alley_rescue', status: 'active'});
  const savedState = state;

  await page.addInitScript(value => localStorage.setItem('stray-kitty.session.v1', JSON.stringify(value)), session);
  const browserBattleCommands: string[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/api/v1/commands') && request.method() === 'POST') {
      const type = request.postDataJSON().command?.type;
      if (type === 'START_BATTLE' || type === 'COMPLETE_BATTLE') browserBattleCommands.push(type);
    }
  });
  await page.goto('/');
  await page.getByRole('button', {name: '继续冒险'}).click();
  const battle = page.locator('section[aria-label="序章塔防战斗"]');
  await expect(battle).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('battle-wave-progress')).toContainText('实战共 10 波');
  await page.getByTestId('battle-speed-toggle').click();
  await page.getByTestId('battle-play-toggle').click();
  await expect(battle).toHaveAttribute('data-phase', 'teach_bag', {timeout: 20000});

  fs.mkdirSync('output/preview', {recursive: true});
  for (const viewport of [{width: 1440, height: 1100}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByTestId('battle-open-bag').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('battle-open-bag')).toBeInViewport();
    await page.screenshot({path: `output/preview/l00-teaching-${viewport.width}.png`, fullPage: true});
  }
  // Exercise the narrow-screen bag and targeting controls before refreshing.
  await page.getByTestId('battle-open-bag').click();
  await page.getByTestId('battle-item-warm-can').click();
  await page.getByTestId('battle-item-target-caster').click();
  await expect(battle).toHaveAttribute('data-phase', 'teach_deploy');
  await page.reload();
  await page.getByRole('button', {name: '继续冒险'}).click();
  await expect(battle).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const restored = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  expect(restored).toEqual(savedState);
  expect(browserBattleCommands).toEqual([]);
});
