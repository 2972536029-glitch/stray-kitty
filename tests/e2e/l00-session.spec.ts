import {expect, test} from '@playwright/test';
import type {GameCommand, GameState, Session} from '../../web/src/contracts';

test('既有内容版本的战斗会话刷新后沿用同一场次，宽窄屏教学可操作', async ({page, request}, testInfo) => {
  page.setDefaultTimeout(10000);
  // Create persisted state through the public API and finish the actual opening story.
  // The story enters the dedicated tutorial directly, before Rainy Alley exploration.
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
  expect(state.phase).toBe('battle');
  expect(state.schemaVersion).toBe(1);
  expect(state.activeBattle).toMatchObject({stageId:'l00_tutorial',status:'active'});
  expect(state.flags).not.toContain('alley_rescued');
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
  await page.getByRole('button', {name:/^(暂不登录|继续冒险)/}).click();
  const battle = page.locator('section[aria-label="序章塔防战斗"]');
  await expect(battle).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('battle-wave-progress')).toContainText('实战共 6 波');
  await page.getByTestId('battle-speed-toggle').click();
  await page.getByTestId('battle-play-toggle').click();
  await expect(battle).toHaveAttribute('data-phase', 'teach_position', {timeout: 20000});

  for (const viewport of [{width:1440,height:1100},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByTestId('battle-cell-A4').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('battle-cell-A4')).toBeInViewport();
    await expect(page.getByTestId('battle-open-bag')).toHaveCount(0);
    await expect(page.getByRole('complementary',{name:'安全休整区'})).toHaveCount(0);
    await page.screenshot({path:testInfo.outputPath(`l00-teaching-${viewport.width}.png`),fullPage:true});
  }
  // The second movement lesson happens after the first real wave starts.
  await page.getByTestId('battle-cat-caster').click();
  await page.getByTestId('battle-cell-A4').press('Enter');
  await expect(battle).toHaveAttribute('data-phase','teach_energy');
  await page.getByTestId('battle-begin-skill-practice').click();
  await expect(battle).toHaveAttribute('data-phase','teach_move');
  await expect(page.getByTestId('battle-wave-progress')).toContainText('第 1 / 6 波');
  await page.getByTestId('battle-cat-guard').click();
  await page.getByTestId('battle-cell-B5').press('Enter');
  await expect(battle).toHaveAttribute('data-phase','teach_live_move');
  await expect(battle).toHaveAttribute('data-effective-speed','0.5');
  await page.getByTestId('battle-cat-caster').click();
  await page.getByTestId('battle-cell-C4').press('Enter');
  await expect(battle).toHaveAttribute('data-phase','skill_charge');
  await expect(page.getByTestId('battle-cat-caster')).toHaveAttribute('aria-label',/体力 65 \/ 80，C4，/);
  await expect(page.getByTestId('battle-cat-guard')).toHaveAttribute('aria-label',/体力 240 \/ 240，B5，/);
  await page.reload();
  await page.getByRole('button', {name:/^(暂不登录|继续冒险)/}).click();
  await expect(battle).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const restored = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  expect(restored).toEqual(savedState);
  expect(browserBattleCommands).toEqual([]);
});
