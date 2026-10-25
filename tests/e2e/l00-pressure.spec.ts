import {expect, test, type Page} from '@playwright/test';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {GameState, Session} from '../../web/src/contracts';
import {completeL00Tutorial} from './l00-battle';

const cases = [
  {pressure: -1, difficulty: 'low', label: '简单', hpPercent: 80},
  {pressure: 0, difficulty: 'medium', label: '普通', hpPercent: 100},
  {pressure: 1, difficulty: 'high', label: '困难', hpPercent: 120},
] as const;
const fixturePort = 8137;
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
const root = process.cwd();
const sessions = new Map<string, Session>();
const savedStates = new Map<string, GameState>();
let fixtureServer: ChildProcess | undefined;
let fixtureClosed: Promise<void> | undefined;
let fixtureDirectory = '';
let serverOutput = '';
let spawnError: Error | undefined;

async function assertFixturePortFree() {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', error => reject(new Error(`L00 fixture port ${fixturePort} is occupied or unavailable; no existing process will be stopped. ${error.message}`)));
    probe.listen(fixturePort, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve()));
  });
}

test.beforeAll(async ({request}) => {
  await assertFixturePortFree();
  const catalogResponse = await request.get('/api/v1/content');
  expect(catalogResponse.ok()).toBe(true);
  const catalog = await catalogResponse.json();
  fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stray-kitty-l00-pressure-'));
  const players: Record<string, unknown> = {};
  for (const entry of cases) {
    const session = {playerId: `l00-${entry.difficulty}`, token: `l00-pressure-fixture-${entry.difficulty}`};
    // This is an isolated persisted HTTP fixture, not a claim that random dice
    // produced all three results. Only the current attempt supplies its pressure.
    const state: GameState = {
      schemaVersion: 1, contentVersion: catalog.version, revision: 1, phase: 'battle',
      chapterId: 'prologue', storyNodeId: '', mapId: 'alley', flags: [],
      cats: ['miaomiao', 'tuanzi'], inventory: {food: 0, material: 0}, currencies: {stamp: 0},
      furniture: [], placements: {}, completedStages: [], pendingEventId: '',
      activeBattle: {id: `l00-pressure-${entry.difficulty}`, stageId: 'alley_rescue', status: 'active', modifiers: {shadowPressure: entry.pressure}},
      lastResult: {message: 'E2E 持久化场次 fixture：不经过随机骰子事件。'},
    };
    sessions.set(entry.difficulty, session);
    savedStates.set(entry.difficulty, state);
    players[createHash('sha256').update(session.token).digest('hex')] = {id: session.playerId, state, receipts: {}, receiptOrder: []};
  }
  const saveFile = path.join(fixtureDirectory, 'save.json');
  fs.writeFileSync(saveFile, JSON.stringify({schemaVersion: 1, players}));
  // playwright.config's outer preview server already builds this executable.
  // Reuse it without rebuilding or touching the user's dev server/save file.
  fixtureServer = spawn(path.join(root, '.runtime', process.platform === 'win32' ? 'kitty-preview.exe' : 'kitty-preview'), [], {
    cwd: path.join(root, 'server'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, GAME_ADDR: `127.0.0.1:${fixturePort}`, GAME_DATA_FILE: saveFile, GAME_WEB_DIR: path.join(root, 'web/dist')},
  });
  fixtureClosed = new Promise(resolve => fixtureServer!.once('close', () => resolve()));
  const record = (chunk: Buffer) => {serverOutput += chunk.toString();};
  fixtureServer.stdout?.on('data', record);
  fixtureServer.stderr?.on('data', record);
  fixtureServer.once('error', error => {spawnError = error;});
  await expect.poll(async () => {
    if (spawnError) throw spawnError;
    if (fixtureServer!.exitCode !== null) throw new Error(`Isolated L00 fixture server exited: ${serverOutput}`);
    try {return (await request.get(`${fixtureOrigin}/healthz`, {timeout: 500})).ok();}
    catch {return false;}
  }, {timeout: 10000, message: 'Isolated persisted L00 fixture server must become ready'}).toBe(true);
});

test.afterAll(async () => {
  const child = fixtureServer;
  if (child && fixtureClosed) {
    await new Promise<void>((resolve, reject) => {
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      const timeout = setTimeout(() => {clearTimeout(force); reject(new Error('L00 fixture server did not close after termination.'));}, 5000);
      fixtureClosed!.then(() => {clearTimeout(force); clearTimeout(timeout); resolve();});
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    });
  }
  if (fixtureDirectory) fs.writeFileSync(path.join(fixtureDirectory, 'server.log'), serverOutput);
});

async function moveCat(page: Page, cat: 'guard' | 'caster', target: string) {
  await page.getByTestId(`battle-cat-${cat}`).click();
  await page.getByTestId('battle-move-selected').click();
  await page.getByTestId(`battle-cell-${target}`).press('Enter');
  await expect(page.getByTestId(`battle-cat-${cat}`)).toHaveAttribute('aria-label', new RegExp(`，${target}，`));
}

for (const entry of cases) {
  test(`持久化场次 fixture：压力 ${entry.pressure} → ${entry.difficulty}，免费重整与刷新保留难度`, async ({page, request}, testInfo) => {
    test.setTimeout(90000);
    page.setDefaultTimeout(10000);
    const session = sessions.get(entry.difficulty)!;
    const expectedState = savedStates.get(entry.difficulty)!;
    const headers = {Authorization: `Bearer ${session.token}`};
    const readSavedState = async () => {
      const response = await request.get(`${fixtureOrigin}/api/v1/state`, {headers});
      expect(response.status()).toBe(200);
      return await response.json() as GameState;
    };
    expect(await readSavedState()).toEqual(expectedState);
    await page.addInitScript(({origin, session}) => {
      if (location.origin === origin) localStorage.setItem('stray-kitty.session.v1', JSON.stringify(session));
    }, {origin: fixtureOrigin, session});
    const battleCommands: string[] = [];
    page.on('request', request => {
      if (request.url() === `${fixtureOrigin}/api/v1/commands` && request.method() === 'POST') {
        const type = request.postDataJSON().command?.type;
        if (type === 'START_BATTLE' || type === 'COMPLETE_BATTLE') battleCommands.push(type);
      }
    });
    await page.goto(fixtureOrigin);
    await page.getByRole('button', {name: '继续冒险'}).click();
    const battle = page.locator('section[aria-label="序章塔防战斗"]');
    const difficulty = page.getByRole('status', {name: '本次战斗难度'});
    await expect(battle).toHaveAttribute('data-phase', 'ready');
    await expect(difficulty).toContainText(`${entry.label} · 新手保护开启`);

    // All following battle actions are actual player controls, including teaching.
    await completeL00Tutorial(page, battle);
    await expect(difficulty).toContainText(`黑影体力 ${entry.hpPercent}%`);
    await page.getByTestId('battle-play-toggle').click();
    await expect(battle).toHaveAttribute('data-effective-speed', '0');
    // Leave the lane unblocked. Both cats only reach the entrance column, so
    // normal movement/leak rules (not state injection) trigger the novice reform.
    await moveCat(page, 'caster', 'A7');
    await moveCat(page, 'guard', 'C7');
    await page.getByTestId('battle-play-toggle').click();
    await expect(battle).toHaveAttribute('data-phase', 'reform', {timeout: 45000});
    const waveBeforeReform = await page.getByTestId('battle-wave-progress').textContent();
    await expect(difficulty).toContainText(`${entry.label} · 黑影体力 ${entry.hpPercent}%`);
    expect(await readSavedState()).toEqual(expectedState);
    await page.getByRole('button', {name: '免费重整当前波'}).click();
    await expect(battle).toHaveAttribute('data-phase', 'battle');
    await page.getByTestId('battle-play-toggle').click();
    await expect(battle).toHaveAttribute('data-effective-speed', '0');
    await expect(page.getByTestId('battle-wave-progress')).toHaveText(waveBeforeReform!);
    await expect(difficulty).toContainText(`${entry.label} · 黑影体力 ${entry.hpPercent}%`);
    await expect(page.getByTestId('battle-cat-caster')).toHaveAttribute('aria-label', /体力 80 \/ 80，A4，/);
    await expect(page.getByTestId('battle-cat-guard')).toHaveAttribute('aria-label', /体力 240 \/ 240，B5，/);
    await page.screenshot({path: testInfo.outputPath(`pressure-${entry.difficulty}-reformed.png`), fullPage: true});

    await page.reload();
    await page.getByRole('button', {name: '继续冒险'}).click();
    await expect(battle).toHaveAttribute('data-phase', 'ready');
    await expect(difficulty).toContainText(`${entry.label} · 新手保护开启`);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await readSavedState()).toEqual(expectedState);
    expect(battleCommands).toEqual([]);
    await page.screenshot({path: testInfo.outputPath(`pressure-${entry.difficulty}-refreshed.png`), fullPage: true});
    await testInfo.attach('persisted-pressure-fixture', {contentType: 'application/json', body: JSON.stringify({
      setup: 'isolated persisted server fixture; no random-event coverage claim',
      pressure: entry.pressure, difficulty: entry.difficulty, attemptId: expectedState.activeBattle!.id,
      reformedWave: waveBeforeReform, refreshedPhase: 'ready', browserBattleCommands: battleCommands,
    }, null, 2)});
  });
}
