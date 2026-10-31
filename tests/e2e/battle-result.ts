import {expect, test, type Page} from '@playwright/test';

/** The outcome stays in battle until an explicit confirmation. Escape cannot
 * discard it, and the modal keeps keyboard focus on its continuation control. */
export async function confirmBattleResult(page:Page,outcome:'won'|'lost'){
  const screen=page.getByTestId('battle-result'),button=page.getByTestId('battle-result-continue');
  await expect(screen).toBeVisible();await expect(screen).toHaveAttribute('data-outcome',outcome);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-phase','battle');
  await page.keyboard.press('Escape');await page.waitForTimeout(400);
  await expect(screen).toBeVisible();await expect(page.locator('.app-shell')).toHaveAttribute('data-phase','battle');
  await page.keyboard.press('Tab');await expect(button).toBeFocused();
  await page.screenshot({path:test.info().outputPath(`battle-result-${outcome}.png`),fullPage:false});
  await button.click();await expect(screen).toHaveCount(0);
}
