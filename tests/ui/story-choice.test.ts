import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium, type Browser, type Page} from '@playwright/test';
import fs from 'node:fs';

let browser: Browser;
let bundle: string;
let styles: string;
test.before(async () => {
  const result = await build({entryPoints:['tests/ui/story-choice.fixture.tsx'], outfile:'story-choice.js', bundle:true, write:false, format:'iife', jsx:'automatic', define:{'process.env.NODE_ENV':'"test"'}});
  bundle = result.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  styles = result.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (process.platform === 'win32' && fs.existsSync(edge) ? edge : undefined);
  browser = await chromium.launch({headless:true, executablePath});
});
test.after(async () => { await browser?.close(); });

async function fixture(id: string, disabled = false): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({content:styles});
  await page.addScriptTag({content:bundle});
  await page.evaluate(([node, isDisabled]) => (window as any).storyChoice.render(node, isDisabled), [id, disabled]);
  const choosing = id === 'prologue_banter' || id === 'prologue_sneak';
  await (choosing ? page.getByRole('dialog', {name:'这一刻，想怎么回应？'}) : page.getByRole('button', {name:'继续故事'})).waitFor();
  return page;
}
const calls = (page: Page) => page.evaluate(() => (window as any).storyChoice.calls);

test('both story choices send the selected attitude once on click', async () => {
  for (const id of ['prologue_banter', 'prologue_sneak']) for (const attitude of ['proud', 'honest']) {
    const page = await fixture(id);
    try {
      assert.equal(await page.getByRole('region', {name:'剧情对话'}).count(), 0);
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').isVisible(), true);
      await page.getByRole('button', {name:attitude === 'proud' ? /傲娇嘴硬/ : /诚实撒娇/}).click();
      assert.deepEqual(await calls(page), []);
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.locator('.story-dialogue button').filter({hasText:/傲娇嘴硬|诚实撒娇/}).count(), 0);
      await page.getByRole('button', {name:'继续故事'}).click();
      assert.deepEqual(await calls(page), [{optionId:attitude}]);
    } finally { await page.close(); }
  }
});

test('keyboard advances once and preserves the chosen attitude', async () => {
  const page = await fixture('prologue_banter');
  try {
    await page.getByRole('button', {name:/诚实撒娇/}).click();
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Space');
    assert.deepEqual(await calls(page), [{optionId:'honest'}]);
  } finally { await page.close(); }
});

test('keyboard activation of choice controls does not advance the story', async () => {
  const page = await fixture('prologue_sneak');
  try {
    await page.getByRole('button', {name:/诚实撒娇/}).focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await calls(page), []);
    await page.getByRole('button', {name:'继续故事'}).focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await calls(page), [{optionId:'honest'}]);
  } finally { await page.close(); }
});

test('ordinary dialogue omits choices and disabled dialogue does not advance', async () => {
  const page = await fixture('prologue_1');
  try {
    await page.getByRole('button', {name:'继续故事'}).click();
    assert.deepEqual(await calls(page), [{optionId:undefined}]);
  } finally { await page.close(); }
  const disabledPage = await fixture('prologue_banter', true);
  try {
    assert.equal(await disabledPage.getByRole('button', {name:/诚实撒娇/}).isDisabled(), true);
    await disabledPage.keyboard.press('Enter');
    assert.deepEqual(await calls(disabledPage), []);
  } finally { await disabledPage.close(); }
});

test('each new choice opens a fresh window before showing its dialogue', async () => {
  const page = await fixture('prologue_sneak');
  try {
    await page.getByRole('button', {name:/傲娇嘴硬/}).click();
    await page.evaluate(() => (window as any).storyChoice.render('prologue_banter'));
    await page.getByRole('dialog', {name:'这一刻，想怎么回应？'}).waitFor();
    assert.equal(await page.getByRole('button', {name:'继续故事'}).count(), 0);
    await page.getByRole('button', {name:/诚实撒娇/}).click();
    await page.getByRole('button', {name:'继续故事'}).click();
    assert.deepEqual(await calls(page), [{optionId:'honest'}]);
  } finally { await page.close(); }
});
