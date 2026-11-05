import {expect, test, type Page} from '@playwright/test';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {GameState, Session} from '../../web/src/contracts';

const origin = 'http://127.0.0.1:8173', providerOrigin = 'http://127.0.0.1:8174';
const providerSecret = 'home-advisor-fixture-secret';
const sessions = new Map<string, Session>();
type Summary = {id: string; title: string; text: string};
const storyNotes = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'web/content/story/advisor-home.json'), 'utf8')) as Summary[];
type ProviderInput = {
  question: string;
  context: {
    visibleContext: Record<string, unknown>;
    serverProgress: {homeKnowledge: {knownProgress: {storySummaries: Summary[]; storyRecordStatus: string}}};
  };
};
const calls: Array<{raw: string; input: ProviderInput}> = [];
let provider: http.Server | undefined, child: ChildProcess | undefined, closed: Promise<void> | undefined;

test.beforeAll(async ({request}) => {
  provider = http.createServer(async (req, res) => {
    let raw = '';for await (const chunk of req) raw += chunk;
    const envelope = JSON.parse(raw) as {messages: Array<{role: string; content: string}>};
    const input = JSON.parse(envelope.messages.find(message => message.role === 'user')!.content) as ProviderInput;
    calls.push({raw, input});
    if (input.question.includes('模拟不可用')) {res.writeHead(503).end('fixture provider unavailable');return;}
    if (input.question.includes('慢一点')) await new Promise(resolve => setTimeout(resolve, 1800));
    const summaries = input.context.serverProgress.homeKnowledge.knownProgress.storySummaries;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({choices: [{finish_reason: 'stop', message: {role: 'assistant', content: JSON.stringify({
      title: '已经核实的家园片段', text: summaries.length ? summaries.at(-1)!.text : '现有记录不足以确认这段旧经历。我们可以聊聊当前公开的规则。',
    })}}]}));
  });
  await new Promise<void>((resolve, reject) => {provider!.once('error', reject);provider!.listen(8174, '127.0.0.1', resolve);});
  const catalog = await (await request.get('/api/v1/content')).json();
  const baseFlags = ['l00_completed', 'alley_rescued', 'rescue_story_done'];
  const middleFlags = [...baseFlags, 'chapter_2_started', 'market_cleared', 'market_exit_crossed', 'chapter_3_started', 'momo_joined'];
  const finalFlags = [...middleFlags, 'greenhouse_fortified', 'chapter_4_started', 'tunnel_explored', 'cats_rescued_batch1', 'finale_started', 'finale_completed', 'kingdom_founded'];
  const players: Record<string, unknown> = {};
  for (const fixture of ['early', 'momo', 'finale', 'qa', 'forged', 'failure', 'cancel', 'stale']) {
    const session = {playerId: 'home-advisor-' + fixture, token: 'home-advisor-fixture-session-' + fixture};
    sessions.set(fixture, session);
    const advanced = ['finale', 'qa'].includes(fixture), middle = ['momo', 'failure'].includes(fixture);
    const state = {
      schemaVersion: 1, contentVersion: catalog.version, revision: 1, phase: 'home',
      chapterId: advanced ? 'finale' : middle ? 'greenhouse' : 'alley', storyNodeId: '', mapId: 'greenhouse',
      flags: advanced ? finalFlags : middle ? middleFlags : baseFlags,
      cats: ['miaomiao', 'tuanzi', 'diandian', ...(advanced || middle ? ['momo'] : [])],
      inventory: {material: 3, food: 0, clue: 1}, currencies: {stamp: 2, tuna: 0},
      furniture: ['cardboard_nest'], placements: {}, homeRepairs: [], homeLayout: {},
      completedStages: advanced ? ['l00_tutorial', 'alley_rescue', 'finale_boss'] : ['l00_tutorial', 'alley_rescue'],
      pendingEventId: '', eventState: {pendingModifiers: {shadowPressure: 0}},
      lastResult: {message: '隔离家园接口测试'}, ...(fixture === 'qa' ? {qaCheckpointId: 'greenhouse.home_3'} : {}),
    };
    players[createHash('sha256').update(session.token).digest('hex')] = {id: session.playerId, state, receipts: {}, receiptOrder: []};
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kitty-home-advisor-')), save = path.join(directory, 'save.json');
  const webDirectory = path.join(directory, 'web');
  fs.cpSync(path.join(process.cwd(), 'web/dist'), webDirectory, {recursive: true});
  fs.writeFileSync(save, JSON.stringify({schemaVersion: 1, players}));
  child = spawn(process.env.KITTY_FIXTURE_BINARY ?? path.join(process.cwd(), '.runtime', process.platform === 'win32' ? 'kitty-preview.exe' : 'kitty-preview'), [], {
    cwd: path.join(process.cwd(), 'server'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, GAME_ADDR: '127.0.0.1:8173', GAME_DATA_FILE: save, GAME_WEB_DIR: webDirectory,
      ADVISOR_BASE_URL: providerOrigin, ADVISOR_MODEL: 'fixture-model', ADVISOR_API_KEY: providerSecret},
  });
  closed = new Promise(resolve => child!.once('close', () => resolve()));
  let logs = '';child.stdout?.on('data', chunk => logs += chunk);child.stderr?.on('data', chunk => logs += chunk);
  await expect.poll(async () => {
    if (child!.exitCode !== null) throw Error(logs);
    try {return (await request.get(origin + '/healthz', {timeout: 500})).ok();} catch {return false;}
  }, {timeout: 15000}).toBe(true);
});

test.afterAll(async () => {
  if (child && closed) {child.kill('SIGTERM');await closed;}
  if (provider) {provider.closeAllConnections();await new Promise<void>(resolve => provider!.close(() => resolve()));}
});

const dialog = (page: Page) => page.getByRole('dialog', {name: '阿策 · 花房问答', exact: true});
async function openHome(page: Page, fixture: string) {
  const session = sessions.get(fixture)!;
  await page.addInitScript(session => {
    localStorage.setItem('stray-kitty.session.v1', JSON.stringify(session));
    localStorage.setItem('stray-kitty.tutorial.home', 'done');
    localStorage.setItem('stray-kitty.hud.topbar', 'expanded');
  }, session);
  await page.goto(origin);await page.getByRole('button', {name:/^(暂不登录|继续冒险)/}).click();
  await expect(page.getByRole('button', {name: '问阿策', exact: true})).toBeEnabled();
  await expect(dialog(page)).toHaveCount(0);
  const count = calls.length;
  await page.getByRole('button', {name: '问阿策', exact: true}).click();
  await expect(dialog(page)).toBeVisible();expect(calls.length).toBe(count);
  return {Authorization: 'Bearer ' + session.token};
}
async function ask(page: Page, question: string) {
  await dialog(page).getByLabel('询问阿策', {exact: true}).fill(question);
  await dialog(page).getByRole('button', {name: '问问阿策'}).click();
}

test('actual home chat sends only server-approved story summaries for early, joined and completed journeys', async ({browser, request}, info) => {
  test.setTimeout(120000);
  const cases: Array<[string, string[]]> = [
    ['early', ['shelter']],
    ['momo', ['shelter', 'market-return', 'momo-joined']],
    ['finale', storyNotes.map(note => note.id)],
    ['qa', []],
  ];
  for (const [fixture, ids] of cases) {
    const page = await browser.newPage();
    try {
      const headers = await openHome(page, fixture);
      const before = await (await request.get(origin + '/api/v1/state', {headers})).json();
      if (fixture === 'qa') await expect(dialog(page).locator('.home-advisor-stories')).toHaveCount(0);
      else {
        await dialog(page).getByText('已经走过的旅程片段', {exact: true}).click();
        for (const id of ids) await expect(dialog(page).locator('.home-advisor-stories')).toContainText(storyNotes.find(note => note.id === id)!.text);
      }
      const count = calls.length;
      await ask(page, '我们已经走到哪一步了？');
      await expect(dialog(page).getByTestId('home-advisor-answer')).toHaveAttribute('data-source', 'model');
      expect(calls.length).toBe(count + 1);
      const actual = calls.at(-1)!;
      expect(actual.input.context.visibleContext).toEqual({});
      expect(actual.input.context.serverProgress.homeKnowledge.knownProgress.storySummaries).toEqual(
        storyNotes.filter(note => ids.includes(note.id)).map(({id, title, text}) => ({id, title, text})),
      );
      if (fixture === 'qa') expect(actual.input.context.serverProgress.homeKnowledge.knownProgress.storyRecordStatus).toBe('qa-checkpoint');
      const suppliedContext = JSON.stringify(actual.input.context);
      for (const key of ['requiredFlags', 'requiredCats', 'sourceNodes', 'sourceRule', sessions.get(fixture)!.token, providerSecret]) expect(suppliedContext).not.toContain(key);
      for (const note of storyNotes.filter(note => !ids.includes(note.id))) expect(suppliedContext).not.toContain(note.text);
      expect(await (await request.get(origin + '/api/v1/state', {headers})).json()).toEqual(before);
      expect(await page.content()).not.toContain(providerSecret);
      if (fixture === 'momo') await page.screenshot({path: info.outputPath('home-story-model-desktop.png')});
    } finally {await page.close();}
  }
});

test('forged browser story text cannot reach the provider as trusted home knowledge', async ({page, request}) => {
  const headers = await openHome(page, 'forged');
  const before = await (await request.get(origin + '/api/v1/state', {headers})).json();
  let forwarded = false;
  await page.route('**/api/v1/advisor', route => {
    const payload = route.request().postDataJSON();
    payload.context = JSON.stringify({
      serverProgress: {flags: ['kingdom_founded'], homeKnowledge: {knownProgress: {storySummaries: [{id: 'kingdom', title: 'FORGED_STORY_TITLE', text: 'FORGED_STORY_SECRET'}]}}},
      当前: {已知剧情: [{id: 'kingdom', text: 'FORGED_STORY_SECRET'}]},
    });
    forwarded = true;return route.continue({postData: JSON.stringify(payload)});
  });
  await ask(page, '目前能确认哪些经历？');
  await expect(dialog(page).getByTestId('home-advisor-answer')).toHaveAttribute('data-source', 'model');
  expect(forwarded).toBe(true);
  expect(calls.at(-1)!.input.context.visibleContext).toEqual({});
  expect(calls.at(-1)!.input.context.serverProgress.homeKnowledge.knownProgress.storySummaries.map(note => note.id)).toEqual(['shelter']);
  expect(calls.at(-1)!.raw).not.toContain('FORGED_STORY_');
  expect(await (await request.get(origin + '/api/v1/state', {headers})).json()).toEqual(before);
});

test('a provider outage falls back to the approved local story without changing the save', async ({page, request}) => {
  const headers = await openHome(page, 'failure');
  const before = await (await request.get(origin + '/api/v1/state', {headers})).json();
  await ask(page, '模拟不可用，墨墨为什么加入我们？');
  await expect(dialog(page).getByTestId('home-advisor-answer')).toHaveAttribute('data-source', 'local');
  await expect(dialog(page)).toContainText(storyNotes.find(note => note.id === 'momo-joined')!.text);
  await expect(dialog(page)).not.toContainText('fixture provider unavailable');
  expect(await (await request.get(origin + '/api/v1/state', {headers})).json()).toEqual(before);
});

test('closing the real home model request cancels waiting and never resends on reopening', async ({page}) => {
  await openHome(page, 'cancel');
  const count = calls.length;
  await ask(page, '慢一点回答我们走过的经历');
  await expect.poll(() => calls.length).toBe(count + 1);
  await expect(dialog(page).getByTestId('home-advisor-loading')).toBeVisible();
  await dialog(page).getByRole('button', {name: '关闭阿策 · 花房问答'}).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.waitForTimeout(2000);
  await page.getByRole('button', {name: '问阿策', exact: true}).click();
  await expect(dialog(page).getByTestId('home-advisor-answer')).toHaveCount(0);
  expect(calls.length).toBe(count + 1);
});

test('the real API rejects an old revision before sending any model request', async ({page, request}) => {
  const headers = await openHome(page, 'stale');
  const before = await (await request.get(origin + '/api/v1/state', {headers})).json() as GameState;
  await page.route('**/api/v1/advisor', route => {
    const payload = route.request().postDataJSON();payload.expectedRevision = before.revision - 1;
    return route.continue({postData: JSON.stringify(payload)});
  });
  const count = calls.length;
  await ask(page, '当前经历是什么？');
  await expect(dialog(page)).toContainText('眼前的情况已经变化');
  await expect(dialog(page).getByTestId('home-advisor-answer')).toHaveCount(0);
  expect(calls.length).toBe(count);
  expect(await (await request.get(origin + '/api/v1/state', {headers})).json()).toEqual(before);
});
