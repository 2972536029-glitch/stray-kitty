import {test, expect, type Page, type APIRequestContext} from '@playwright/test';
import type {GameState} from '../../web/src/contracts';

async function enterHome(page: Page, request: APIRequestContext) {
  await page.addInitScript(() => {
    localStorage.setItem('stray-kitty.tutorial.home', 'done');
    localStorage.setItem('stray-kitty.hud.topbar', 'expanded');
  });
  await page.goto('/');
  await expect(page.getByRole('button', {name: /^(开始冒险|继续冒险)/})).toBeVisible();
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('stray-kitty.session.v1')!).token as string);
  const headers = {Authorization: `Bearer ${token}`};
  const before = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  const moved = await request.post('/api/v1/commands', {headers: {...headers, 'Idempotency-Key': crypto.randomUUID()},
    data: {expectedRevision: before.revision, command: {type: 'QA_CHECKPOINT', checkpointId: 'greenhouse.home_2'}}});
  expect(moved.ok(), await moved.text()).toBe(true);
  await page.reload();await page.getByRole('button', {name: '继续冒险'}).click();
  await expect(page.getByRole('button', {name: '问阿策', exact: true})).toBeEnabled();
  return {headers, token};
}
const dialog = (page: Page) => page.getByRole('dialog', {name: '阿策 · 花房问答', exact: true});
async function ask(page: Page, question: string) {
  await dialog(page).getByLabel('询问阿策', {exact: true}).fill(question);
  await dialog(page).getByRole('button', {name: '问问阿策'}).click();
}

test('home entry sends a read-only journey request and distinguishes model, local fallback and stale context', async ({page, request}, info) => {
  const {headers, token} = await enterHome(page, request);
  const before = await (await request.get('/api/v1/state', {headers})).json() as GameState;
  const payloads: Record<string, unknown>[] = [];
  await page.route('**/api/v1/advisor', async route => {
    const body = route.request().postDataJSON();payloads.push(body);
    const answer = body.question.includes('本地') ? {source: 'local', title: '', text: '', reason: 'unconfigured'}
      : {source: 'model', title: '先在花房歇歇', text: '可以先看看当前修缮说明，行动由你决定。'};
    await route.fulfill({status: body.question.includes('过期') ? 409 : 200, json: answer});
  });
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole('button', {name: '问阿策', exact: true}).click();
  await expect(dialog(page)).toContainText('花房暖和起来了');
  await expect(dialog(page).locator('.home-advisor-stories')).toHaveCount(0); // QA progress is not personal history.
  await ask(page, '修缮怎么开始？');
  await expect(dialog(page).getByTestId('home-advisor-answer')).toHaveAttribute('data-source', 'model');
  await expect(dialog(page)).toContainText('阿策 · 模型建议');
  expect(payloads[0].scope).toBe('journey');expect(payloads[0].expectedRevision).toBe(before.revision);
  expect(payloads[0].attemptId).toBeUndefined();expect(payloads[0].stageId).toBeUndefined();
  expect(JSON.parse(payloads[0].context as string).当前.阶段).toBeDefined();
  expect(payloads[0].history).toEqual([]);expect(JSON.stringify(payloads[0])).not.toContain(token);
  await page.screenshot({path: info.outputPath('home-advisor-desktop.png')});
  await ask(page, '本地说明：战斗技能怎么蓄能？');
  await expect(dialog(page).getByTestId('home-advisor-answer').last()).toHaveAttribute('data-source', 'local');
  await expect(dialog(page)).toContainText('阿策 · 本地说明');await expect(dialog(page)).toContainText('手动释放');
  expect(payloads[1].history).toHaveLength(2);
  await ask(page, '过期：当前修缮变了吗？');
  await expect(dialog(page)).toContainText('眼前的情况已经变化');
  await expect(dialog(page).getByTestId('home-advisor-answer')).toHaveCount(2);
  expect(await (await request.get('/api/v1/state', {headers})).json()).toEqual(before);
});

test('closing home chat aborts its pending request and reopening never resends it', async ({page, request}) => {
  await enterHome(page, request);
  let count = 0, aborted = false, release: (() => Promise<void>) | undefined;
  page.on('requestfailed', r => {if (r.url().endsWith('/api/v1/advisor')) aborted = true;});
  await page.route('**/api/v1/advisor', route => {
    count++;
    return new Promise<void>(resolve => {release = async () => {
      try {await route.fulfill({json: {source: 'model', title: '过时答复', text: '不应出现在新面板里。'}});} catch { /* Client already aborted. */ }
      resolve();
    };});
  });
  await page.getByRole('button', {name: '问阿策', exact: true}).click();await ask(page, '慢一点回答');
  await expect(dialog(page).getByTestId('home-advisor-loading')).toBeVisible();await expect.poll(() => count).toBe(1);
  await dialog(page).getByRole('button', {name: '关闭阿策 · 花房问答'}).click();
  await expect(dialog(page)).toHaveCount(0);await expect.poll(() => aborted).toBe(true);await release!();
  await page.getByRole('button', {name: '问阿策', exact: true}).click();
  await expect(dialog(page).getByTestId('home-advisor-answer')).toHaveCount(0);expect(count).toBe(1);
  await page.keyboard.press('Escape');await expect(dialog(page)).toHaveCount(0);
  const repair = page.locator('.home-repair-spot:not(:disabled)').first();await repair.click();
  await expect(page.locator('.home-repair-card')).toBeVisible();
  await expect(page.getByRole('button', {name: '问阿策', exact: true, includeHidden: true})).toBeDisabled();
});

test.describe('phone landscape', () => {
  test.use({isMobile: true, hasTouch: true, viewport: {width: 844, height: 390}});
  test('chat, input and close control remain inside the screen', async ({page, request}, info) => {
    await enterHome(page, request);await page.getByRole('button', {name: '问阿策', exact: true}).tap();
    const chat = dialog(page);await expect(chat).toBeVisible();
    for (const element of [chat, chat.getByLabel('询问阿策', {exact: true}), chat.getByRole('button', {name: '问问阿策'}), chat.getByRole('button', {name: '关闭阿策 · 花房问答'})]) {
      const box = (await element.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(845);expect(box.y + box.height).toBeLessThanOrEqual(391);
    }
    expect(await chat.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({path: info.outputPath('home-advisor-phone.png')});
  });
});
