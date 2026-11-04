import {expect, type Page} from '@playwright/test';

/** Open the current home trial UI without replacing the fixture's saved progress. */
export async function openHomeBattleTrials(page: Page) {
  const panel = page.getByRole('dialog', {name: '流程验收'});
  if (!await panel.isVisible()) {
    const qa = page.getByRole('button', {name: '验收工具', exact: true});
    if (!await qa.isVisible()) {
      await page.getByRole('button', {name: '展开顶部信息栏（可拖拽）', exact: true}).click();
    }
    await qa.click();
    await expect(panel).toBeVisible();
  }
  const trials = panel.locator('details.qa-home-trials');
  await expect(trials).toBeVisible();
  if (await trials.getAttribute('open') === null) await trials.locator('summary').click();
  return trials;
}
