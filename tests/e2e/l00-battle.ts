import {expect, type Locator, type Page} from '@playwright/test';

const battleSelector = 'section[aria-label="序章塔防战斗"]';

type CatReading = {hp: number; energy: number; blocked: number; ready: boolean};
export type L00Run = {waves: number[]; guardSkills: number; casterSkills: number; healingItems: number; energyItems: number; reforms: number};

async function phase(battle: Locator, value: string) {
  await expect(battle).toHaveAttribute('data-phase', value, {timeout: 30000});
}

async function catReading(cat: Locator): Promise<CatReading | undefined> {
  const label = await cat.evaluateAll(nodes => nodes[0]?.getAttribute('aria-label'));
  if (!label) return;
  return {
    hp: Number(label.match(/体力 (\d+)/)?.[1] ?? 0),
    energy: Number(label.match(/能量 (\d+)/)?.[1] ?? 0),
    blocked: Number(label.match(/阻挡 (\d+)/)?.[1] ?? 0),
    ready: label.includes('可重新上阵'),
  };
}

async function useItem(page: Page, item: 'warm-can' | 'bouncy-treat', target: 'guard' | 'caster') {
  await page.getByTestId('battle-open-bag').click();
  await page.getByTestId(`battle-item-${item}`).click();
  const targetButton = page.getByTestId(`battle-item-target-${target}`);
  if (!await targetButton.isEnabled()) {
    await page.getByTestId('battle-close-bag').click();
    return false;
  }
  await targetButton.click();
  await expect(page.getByTestId('battle-close-bag')).toHaveCount(0);
  return true;
}

async function castSkill(page: Page, cat: 'guard' | 'caster', target = 'B5') {
  await page.getByTestId(`battle-cat-${cat}`).click();
  const skill = page.getByTestId(`battle-skill-${cat}`);
  if (await skill.getAttribute('aria-disabled') === 'true') {
    await page.getByTestId('battle-close-cat-menu').click();
    return false;
  }
  await skill.click();
  if (cat === 'caster') {
    await expect(page.getByTestId('battle-skill-aim')).toBeVisible();
    // Enter is the documented keyboard aiming control and also reaches occupied cells.
    await page.getByTestId(`battle-cell-${target}`).press('Enter');
    await expect(page.getByTestId('battle-skill-aim')).toHaveCount(0);
  }
  return true;
}

/** Complete every teaching action through the controls presented to the player. */
async function completeTutorial(page: Page, battle: Locator) {
  await phase(battle, 'ready');
  await page.getByTestId('battle-speed-toggle').click();
  await expect(battle).toHaveAttribute('data-playback-speed', '2');
  await page.getByTestId('battle-play-toggle').click();
  await phase(battle, 'teach_bag');
  await page.getByTestId('battle-open-bag').click();
  await phase(battle, 'teach_item');
  await page.getByTestId('battle-item-warm-can').click();
  await phase(battle, 'teach_target');
  await page.getByTestId('battle-item-target-caster').click();
  await phase(battle, 'teach_deploy');
  await page.getByTestId('battle-cell-A4').press('Enter');
  await phase(battle, 'teach_move');
  await page.getByTestId('battle-cell-B5').press('Enter');
  await phase(battle, 'teach_energy');
  await page.getByTestId('battle-begin-skill-practice').click();
  await phase(battle, 'teach_energy_item');
  expect(await useItem(page, 'bouncy-treat', 'caster')).toBe(true);
  await phase(battle, 'teach_guard_skill');
  expect(await castSkill(page, 'guard')).toBe(true);
  await phase(battle, 'teach_caster_skill');
  expect(await castSkill(page, 'caster', 'C6')).toBe(true);
  await phase(battle, 'battle');
  await expect(page.getByTestId('battle-open-bag')).toContainText('罐罐 × 2');
  await expect(page.getByTestId('battle-open-bag')).toContainText('冻干 × 1');
}

async function assertFrozen(page: Page, battle: Locator) {
  await expect(battle).toHaveAttribute('data-effective-speed', '0');
  const time = await battle.getAttribute('data-battle-time');
  await page.waitForTimeout(350);
  await expect(battle).toHaveAttribute('data-battle-time', time!);
  return time!;
}

/** Host controls must pause this exact battle, including while the title is visible. */
async function checkHostPauseAndReentry(page: Page, battle: Locator) {
  await page.getByRole('button', {name: '暂停', exact: true}).click();
  const pausedTime = await assertFrozen(page, battle);
  await page.locator('.pause-label').getByRole('button', {name: '继续旅程'}).click();
  await expect.poll(async () => Number(await battle.getAttribute('data-battle-time'))).toBeGreaterThan(Number(pausedTime));

  await page.getByRole('button', {name: '章节地图'}).click();
  await expect(page.getByRole('dialog', {name: '猫爪地图'})).toBeVisible();
  const modalTime = await assertFrozen(page, battle);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', {name: '猫爪地图'})).toHaveCount(0);
  await expect.poll(async () => Number(await battle.getAttribute('data-battle-time'))).toBeGreaterThan(Number(modalTime));

  const existingBattle = await battle.elementHandle();
  expect(existingBattle).not.toBeNull();
  await page.getByRole('button', {name: '返回标题'}).click();
  await expect(page.getByRole('button', {name: '继续冒险'})).toBeVisible();
  const titleTime = await assertFrozen(page, battle);
  await expect(battle).toBeHidden();
  await page.getByRole('button', {name: '继续冒险'}).click();
  await expect(battle).toBeVisible();
  expect(await existingBattle!.evaluate((node, selector) => node === document.querySelector(selector), battleSelector)).toBe(true);
  await phase(battle, 'battle');
  expect(Number(await battle.getAttribute('data-battle-time'))).toBeGreaterThanOrEqual(Number(titleTime));
  await expect.poll(async () => Number(await battle.getAttribute('data-battle-time'))).toBeGreaterThan(Number(titleTime));
  await existingBattle!.dispose();
}

/** A player strategy: keep the guard healthy, use earned skills, and defend all ten waves. */
export async function playL00ThroughHost(page: Page): Promise<L00Run> {
  const battle = page.locator(battleSelector);
  await expect(battle).toBeVisible();
  await completeTutorial(page, battle);
  await checkHostPauseAndReentry(page, battle);
  const run: L00Run = {waves: [], guardSkills: 0, casterSkills: 0, healingItems: 0, energyItems: 0, reforms: 0};
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    if (await page.getByRole('button', {name: '带伙伴回家'}).isVisible()) break;
    const visibleState = await battle.evaluateAll(nodes => {
      const root = nodes[0];
      return root ? {
        phase: root.getAttribute('data-phase'),
        wave: root.querySelector('[data-testid="battle-wave-progress"]')?.textContent ?? '',
      } : undefined;
    });
    if (!visibleState) {
      await expect(page.getByRole('button', {name: '带伙伴回家'})).toBeVisible();
      break;
    }
    const currentPhase = visibleState.phase;
    expect(['battle', 'reform', 'won']).toContain(currentPhase);
    const wave = Number(visibleState.wave.match(/第\s*(\d+)\s*\//)?.[1]);
    if (wave && !run.waves.includes(wave)) run.waves.push(wave);
    if (currentPhase === 'won') {
      await expect(page.getByRole('button', {name: '带伙伴回家'})).toBeVisible();
      break;
    }
    if (currentPhase === 'reform') {
      expect(++run.reforms, '免费重整应能恢复当前波，不能无限重试').toBeLessThanOrEqual(5);
      await page.getByRole('button', {name: '免费重整当前波'}).click();
      continue;
    }

    const guard = await catReading(page.getByTestId('battle-cat-guard'));
    const caster = await catReading(page.getByTestId('battle-cat-caster'));
    // Settlement can replace the battle between reads; an absent control means no action remains.
    const supplies = await page.getByTestId('battle-open-bag').evaluateAll(nodes => nodes[0]?.textContent ?? '');
    const cans = Number(supplies.match(/罐罐\s*×\s*(\d+)/)?.[1] ?? 0);
    const treats = Number(supplies.match(/冻干\s*×\s*(\d+)/)?.[1] ?? 0);

    if (guard && guard.energy >= 100 && guard.blocked > 0) {
      if (await castSkill(page, 'guard')) run.guardSkills++;
    }
    if (caster && caster.energy >= 100 && (guard?.blocked ?? 0) > 0) {
      if (await castSkill(page, 'caster')) run.casterSkills++;
    }
    if (guard && guard.hp <= 150 && cans > 0) {
      if (await useItem(page, 'warm-can', 'guard')) run.healingItems++;
    } else if (!guard && cans > 0) {
      if (await useItem(page, 'warm-can', 'guard')) run.healingItems++;
    }
    if (treats > 0 && caster && caster.energy >= 70 && caster.energy < 100 && (guard?.blocked ?? 0) > 0) {
      if (await useItem(page, 'bouncy-treat', 'caster')) run.energyItems++;
    }
    const restingGuard = await catReading(page.getByTestId('battle-rest-guard'));
    if (restingGuard?.ready) {
      await page.getByTestId('battle-rest-guard').click();
      await page.getByTestId('battle-cell-B5').press('Enter');
    }
    await page.waitForTimeout(300);
  }
  await expect(page.getByRole('button', {name: '带伙伴回家'})).toBeVisible();
  expect(run.waves).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(run.guardSkills).toBeGreaterThan(0);
  expect(run.casterSkills).toBeGreaterThan(0);
  return run;
}
