import {expect, test, type APIRequestContext, type Page} from '@playwright/test';
import type {Session} from '../../web/src/contracts';

async function prepareCheckpoint(page: Page, request: APIRequestContext, checkpointId: string) {
  const session = (await (await request.post('/api/v1/sessions')).json()) as Session;
  const headers = {Authorization: `Bearer ${session.token}`};
  const before = await (await request.get('/api/v1/state', {headers})).json();
  const res = await request.post('/api/v1/commands', {
    headers: {...headers, 'Idempotency-Key': `audio-setup-${checkpointId.replace(/[^a-zA-Z0-9_-]/g, '-')}`},
    data: {expectedRevision: before.revision, command: {type: 'QA_CHECKPOINT', checkpointId}},
  });
  expect(res.ok(), await res.text()).toBe(true);
  await page.goto('/');
  await expect(page.locator('.start-screen')).toBeVisible();
  await page.evaluate(saved => {
    localStorage.setItem('stray-kitty.session.v1', JSON.stringify(saved));
    localStorage.setItem('stray-kitty.tutorial.home', 'done');
  }, session);
}

test('start screen speaker toggle persists device mute and unmuting requests title BGM', async ({page}) => {
  const bgmRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('request', req => {
    const pathname = new URL(req.url()).pathname;
    if (pathname.startsWith('/assets/bgm/')) bgmRequests.push(pathname);
  });

  await page.goto('/');
  const speaker = page.locator('.start-audio-toggle');
  await expect(speaker).toBeVisible();
  await expect(speaker).toHaveAttribute('aria-pressed', 'false');

  // Click to mute on the title screen: saves device flag and keeps BGM unloaded.
  await speaker.click();
  await expect(speaker).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('stray-kitty.audio.muted'))).toBe('1');
  expect(bgmRequests).toEqual([]);

  // Reload retains muted state across page refresh on this device.
  await page.reload();
  await expect(page.locator('.start-audio-toggle')).toHaveAttribute('aria-pressed', 'true');

  // Unmute again -> requests and begins loading title BGM MP3.
  await page.locator('.start-audio-toggle').click();
  await expect(page.locator('.start-audio-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('stray-kitty.audio.muted'))).toBe('0');
  await expect.poll(() => bgmRequests.includes('/assets/bgm/title-first-stars.mp3')).toBe(true);
  expect(errors).toEqual([]);
});

test('settings panel manages volume, mute, unlocked home BGM selection, lottery BGM, and preserves audio prefs on journey reset', async ({page, request}) => {
  const bgmRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('request', req => {
    const pathname = new URL(req.url()).pathname;
    if (pathname.startsWith('/assets/bgm/')) bgmRequests.push(pathname);
  });

  // Home stage 1 checkpoint unlocks earlier chapters & early home (7 tracks),
  // while stage 3/4 warm home, chapter 4 tunnel, and finale warehouse stay locked.
  await prepareCheckpoint(page, request, 'greenhouse.home_1');
  await page.reload();
  await page.getByRole('button', {name: '暂不登录', exact: true}).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-phase', 'home');
  await expect.poll(() => bgmRequests.includes('/assets/bgm/home-paws-quiet.mp3')).toBe(true);

  await page.locator('.topbar').getByRole('button', {name: '游戏设置', exact: true}).click();
  const settings = page.getByRole('dialog', {name: '游戏设置', exact: true});
  await expect(settings).toBeVisible();

  // Check volume sliders (including live persistence) & locked vs unlocked Home BGM tracks.
  const musicSlider = settings.getByRole('slider', {name: '背景音乐音量'});
  const sfxSlider = settings.getByRole('slider', {name: '音效音量'});
  await expect(musicSlider).toBeVisible();
  await expect(sfxSlider).toBeVisible();
  await musicSlider.fill('72');
  await sfxSlider.fill('84');
  await expect.poll(() => page.evaluate(() => ({
    music: localStorage.getItem('stray-kitty.audio.music'),
    sfx: localStorage.getItem('stray-kitty.audio.sfx'),
  }))).toEqual({music: '72', sfx: '84'});

  const bgmGrid = settings.locator('.settings-bgm-grid');
  await expect(bgmGrid.getByRole('button', {name: /木板日光/})).toBeDisabled();
  await expect(bgmGrid.getByRole('button', {name: /拱洞足音/})).toBeDisabled();
  await expect(bgmGrid.getByRole('button', {name: /封锁门扉/})).toBeDisabled();
  await expect(bgmGrid.getByRole('button', {name: /午夜集市灯笼/})).toBeEnabled();

  // Choose an unlocked track ("雨与街灯间") and verify immediate BGM request + persistence.
  await bgmGrid.getByRole('button', {name: /雨与街灯间/}).click();
  await expect(bgmGrid.getByRole('button', {name: /雨与街灯间/})).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('stray-kitty.audio.homeBgm'))).toBe('alley');
  await expect.poll(() => bgmRequests.includes('/assets/bgm/alley-rain-streetlights.mp3')).toBe(true);

  // Mute via Settings panel -> outputs reflect muted status, then unmute back to saved values.
  await settings.getByRole('button', {name: /开启中 · 点击静音/}).click();
  await expect(settings.getByRole('button', {name: /已静音 · 点击恢复/})).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.locator('.setting-row output').first()).toContainText('已静音 (72%)');
  expect(await page.evaluate(() => localStorage.getItem('stray-kitty.audio.muted'))).toBe('1');
  await settings.getByRole('button', {name: /已静音 · 点击恢复/}).click();
  await expect(settings.getByRole('button', {name: /开启中 · 点击静音/})).toHaveAttribute('aria-pressed', 'false');
  await expect(settings.locator('.setting-row output').first()).toHaveText('72%');

  // Verify reset section is reachable inside the scrollable window without being clipped.
  const resetBtn = settings.getByRole('button', {name: '清空本机旅程', exact: true});
  await resetBtn.scrollIntoViewIfNeeded();
  await expect(resetBtn).toBeVisible();
  await settings.getByRole('button', {name: '关闭游戏设置', exact: true}).click();

  // Open postal parcels overlay -> switches to lottery BGM MP3, then closing keeps chosen home track.
  await page.locator('.topbar').getByRole('button', {name: '猫爪邮局', exact: true}).click();
  await expect(page.getByRole('dialog', {name: '猫爪邮局', exact: true})).toBeVisible();
  await expect.poll(() => bgmRequests.includes('/assets/bgm/lottery-stamps-starlight.mp3')).toBe(true);
  await page.keyboard.press('Escape');

  // Reopen settings -> mute on device -> reset local journey -> mute, volume & homeBgm stay saved on device!
  await page.locator('.topbar').getByRole('button', {name: '游戏设置', exact: true}).click();
  await settings.getByRole('button', {name: /开启中 · 点击静音/}).click();
  await settings.getByRole('button', {name: '清空本机旅程', exact: true}).click();
  await Promise.all([
    page.waitForNavigation(),
    settings.getByRole('button', {name: '确认清空并重新开始', exact: true}).click(),
  ]);

  await expect(page.locator('.start-audio-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => ({
    muted: localStorage.getItem('stray-kitty.audio.muted'),
    music: localStorage.getItem('stray-kitty.audio.music'),
    sfx: localStorage.getItem('stray-kitty.audio.sfx'),
    homeBgm: localStorage.getItem('stray-kitty.audio.homeBgm'),
  }))).toEqual({muted: '1', music: '72', sfx: '84', homeBgm: 'alley'});
  expect(errors).toEqual([]);
});
