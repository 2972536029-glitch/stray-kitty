// Local component integration: real five-chapter UI and dispatch, deterministic
// near-defeat setup only. This is not a complete chapter-clearance test.
// Run: node tests/e2e/boss-retreat.browser.mjs [output-directory]
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir, writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium, expect} from '@playwright/test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(process.argv[2] ?? path.join(repo, 'test-results/boss-retreat'));
const supplementalOnly = process.argv.includes('--supplemental');
await mkdir(output, {recursive: true});
const names = {chapter: 'Chapter', market: 'Market', greenhouse: 'Greenhouse', tunnel: 'Tunnel', finale: 'Finale'};
const errors = [], results = [], requests = [];
let server, browser, page, failure;
try {
  server = await createServer({root: repo, publicDir: path.join(repo, 'web/public'), configFile: false,
    optimizeDeps: {include: ['react', 'react-dom/client', 'react-dom', 'react/jsx-dev-runtime']},
    server: {host: '127.0.0.1', port: 8180, strictPort: true},
    plugins: [{name: 'boss-retreat-test-only', enforce: 'pre',
      transform(source, id) {
        const chapter = Object.keys(names).find(name => id.replaceAll('\\', '/').endsWith(`/battle/${name}/engine.ts`));
        if (!chapter) return;
        const factory = `create${names[chapter]}Battle`;
        assert(source.includes(`export function ${factory}(`));
        // This Vite instance is exclusively a test fixture. No production hook,
        // combat action, damage calculation, geometry or timer is replaced.
        return source.replace(`export function ${factory}(`, `function ${factory}Original(`) + `
export function ${factory}(options = {}) {
  const state = ${factory}Original(options);
  state.boss.hp = 1;
  state.boss.cooldown = state.boss.skillCooldown = 9999;
  for (const cat of state.cats) {cat.energy = 100; cat.cooldown = 9999;}
  for (const elite of state.elites ?? []) elite.cooldown = 9999;
  return state;
}`;
      },
      configureServer(vite) {
        vite.middlewares.use('/__boss-retreat-fixture', async (_req, res, next) => {
          try {
            const html = await vite.transformIndexHtml('/__boss-retreat-fixture', '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>首领退场本地验证</title><style>html,body,#root{margin:0;width:100%;height:100vh;overflow:hidden}</style></head><body><div id="root"></div><script type="module" src="/tests/e2e/boss-retreat.fixture.tsx"></script></body></html>');
            res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
          } catch (error) {next(error);}
        });
      },
    }, react()],
  });
  await server.listen();
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined);
  browser = await chromium.launch({headless: true, executablePath});
  page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'no-preference'});
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => requests.push({url: request.url(), error: request.failure()?.errorText}));
  await page.goto('http://127.0.0.1:8180/__boss-retreat-fixture');
  await page.waitForFunction(() => !!window.bossRetreatFixture);

  async function drag(from, to) {
    await from.scrollIntoViewIfNeeded(); await to.scrollIntoViewIfNeeded();
    const start = await from.boundingBox(), end = await to.boundingBox();
    assert(start && end);
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {steps: 8});
    await page.mouse.up();
  }
  async function defeat(chapter, target) {
    const playback = page.getByTestId(chapter === 'chapter' ? 'chapter-start' : `${chapter}-play-toggle`);
    await playback.click();
    await page.getByTestId(`${chapter}-cat-caster`).click();
    await page.getByTestId(`${chapter}-skill-caster`).click();
    await target.click();
    await expect(page.getByTestId(`${chapter}-boss`)).toHaveAttribute('data-boss-phase', 'defeated');
    await expect(page.getByTestId('boss-retreat-feedback')).toBeVisible();
    await playback.click();
    await expect(page.getByTestId(`${chapter}-battle`)).toHaveAttribute('data-effective-speed', '0');
  }
  async function visual() {
    return page.getByTestId('boss-retreat-feedback').evaluate(node => {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      return {opacity: Number(style.opacity), top: rect.top, translate: style.translate,
        animationName: style.animationName, pointerEvents: style.pointerEvents};
    });
  }
  for (const chapter of supplementalOnly ? [] : Object.keys(names)) {
    const map = await page.evaluate(chapter => window.bossRetreatFixture.open(chapter), chapter);
    const board = page.getByTestId(`${chapter}-board`), target = board.locator(`[data-cell="${map.boss.x},${map.boss.y}"]`);
    await expect(page.getByTestId(`${chapter}-battle`)).toHaveAttribute('data-phase', 'ready');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('boss-retreat-feedback')).toHaveCount(0);
    await expect(target).toHaveAttribute('data-deployable', 'false');
    await expect(target).toHaveAttribute('data-boss-footprint', 'true');
    const guard = page.getByTestId(`${chapter}-cat-guard`);
    const before = {x: await guard.getAttribute('data-x'), y: await guard.getAttribute('data-y')};
    await drag(guard, target);
    await expect(guard).toHaveAttribute('data-x', before.x);
    await expect(guard).toHaveAttribute('data-y', before.y);

    await defeat(chapter, target);
    const started = Date.now(), early = await visual();
    assert.equal(early.pointerEvents, 'none');
    for (const cell of map.bossCells) {
      const node = board.locator(`[data-cell="${cell.x},${cell.y}"]`);
      await expect(node).toHaveAttribute('data-deployable', 'true');
      await expect(node).toHaveAttribute('data-boss-footprint', 'false');
    }
    const elapsed = await page.getByTestId(`${chapter}-battle`).getAttribute('data-elapsed');
    await drag(guard, target);
    await expect(guard).toHaveAttribute('data-x', String(map.boss.x));
    await expect(guard).toHaveAttribute('data-y', String(map.boss.y));
    await page.screenshot({path: path.join(output, `${chapter}-retreat-and-deployment.png`)});
    await page.waitForTimeout(Math.max(0, 1550 - (Date.now() - started)));
    const later = await visual();
    assert(later.top < early.top - 10, `${chapter}: label must float upward`);
    assert(later.opacity < early.opacity, `${chapter}: label must fade`);
    await expect(page.getByTestId(`${chapter}-battle`)).toHaveAttribute('data-elapsed', elapsed);
    await expect(page.getByTestId('boss-retreat-feedback')).toHaveCount(0, {timeout: 2000});
    const removedAfterMs = Date.now() - started;
    assert(removedAfterMs >= 2200 && removedAfterMs < 3600);
    await page.screenshot({path: path.join(output, `${chapter}-cleared-floor.png`)});
    await page.waitForTimeout(150);
    await expect(page.getByTestId('boss-retreat-feedback')).toHaveCount(0);

    await page.evaluate(() => window.bossRetreatFixture.retry());
    await expect(page.getByTestId(`${chapter}-battle`)).toHaveAttribute('data-phase', 'ready');
    await expect(target).toHaveAttribute('data-deployable', 'false');
    await expect(target).toHaveAttribute('data-boss-footprint', 'true');
    await expect(page.getByTestId('boss-retreat-feedback')).toHaveCount(0);
    results.push({chapter, liveBossMoveRejected: true, allBossCellsReleased: map.bossCells.length,
      movedOntoFormerBossCell: true, early, later, removedAfterMs, pausedWhileFading: true, retryRestored: true});
  }

  // Reset while feedback is still alive, then defeat again: old cleanup must not
  // suppress the next attempt's feedback or leave a stale label on its live boss.
  const map = await page.evaluate(() => window.bossRetreatFixture.open('chapter'));
  let target = page.getByTestId('chapter-board').locator(`[data-cell="${map.boss.x},${map.boss.y}"]`);
  await defeat('chapter', target);
  await page.waitForTimeout(650);
  await page.evaluate(() => window.bossRetreatFixture.retry());
  await expect(page.getByTestId('boss-retreat-feedback')).toHaveCount(0);
  await expect(target).toHaveAttribute('data-boss-footprint', 'true');
  await page.emulateMedia({reducedMotion: 'reduce'});
  await defeat('chapter', target);
  const reduced = await visual();
  assert.equal(reduced.animationName, 'none');
  assert.equal(await page.locator('.boss-retreat-smoke').evaluate(node => getComputedStyle(node).display), 'none');
  await page.waitForTimeout(2100);
  await expect(page.getByTestId('boss-retreat-feedback')).toHaveCount(1);
  assert.equal((await visual()).top, reduced.top, 'reduced-motion text must not drift');
  await expect(page.getByTestId('boss-retreat-feedback')).toHaveCount(0, {timeout: 1200});
  results.push({retryDuringAnimation: true, nextAttemptFeedbackSurvivedOldDeadline: true, reducedMotion: reduced});

  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.setViewportSize({width: 640, height: 900});
  const narrowMap = await page.evaluate(() => window.bossRetreatFixture.open('market'));
  await page.getByRole('button', {name: '查看全图', exact: true}).click();
  const narrowTarget = page.getByTestId('market-board').locator(`[data-cell="${narrowMap.boss.x},${narrowMap.boss.y}"]`);
  await defeat('market', narrowTarget);
  const bounds = await page.getByTestId('boss-retreat-feedback').boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 640 && bounds.y >= 0 && bounds.y + bounds.height <= 900);
  await drag(page.getByTestId('market-cat-guard'), narrowTarget);
  await expect(page.getByTestId('market-cat-guard')).toHaveAttribute('data-x', String(narrowMap.boss.x));
  await expect(page.getByTestId('market-cat-guard')).toHaveAttribute('data-y', String(narrowMap.boss.y));
  await page.screenshot({path: path.join(output, 'market-narrow-retreat.png')});
  await expect(page.getByTestId('boss-retreat-feedback')).toHaveCount(0, {timeout: 3500});
  results.push({narrowViewport: {width: 640, height: 900}, singleCellBossLabelInViewport: bounds, movedOntoFormerBossCell: true});
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  if (page) await page.screenshot({path: path.join(output, 'failure.png')}).catch(() => {});
} finally {
  await browser?.close(); await server?.close();
  await writeFile(path.join(output, 'summary.json'), JSON.stringify({passed: !failure, suite: supplementalOnly ? 'supplemental' : 'complete', scope: 'Local five-viewport integration with near-defeat fixture; real UI actions, engine dispatch, original artwork and timers. Not full chapter clearance.', results, errors, requests, failure}, null, 2));
}
console.log(JSON.stringify({passed: !failure, results: results.length, output, failure}, null, 2));
if (failure) process.exitCode = 1;
