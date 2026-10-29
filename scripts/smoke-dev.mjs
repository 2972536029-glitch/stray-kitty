import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const root = process.cwd();
const frontendPort = 5017;
const apiPort = 8017;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'stray-kitty-dev-smoke-'));
const dataFile = path.join(scratch, 'game.json');
const env = {...process.env, GAME_ADDR: `127.0.0.1:${apiPort}`, GAME_DATA_FILE: dataFile};

function launch() {
  const child = spawn(process.execPath, ['scripts/dev.mjs'], {cwd: root, env, stdio: ['ignore', 'pipe', 'pipe']});
  child.output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {child.output = (child.output + chunk.toString()).slice(-12000);});
  return child;
}

function exited(child, timeoutMs = 12000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Process ${child.pid} did not exit.\n${child.output}`)), timeoutMs);
    child.once('close', () => {clearTimeout(timeout); resolve();});
  });
}

async function isPortFree(port) {
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()));
    });
    return true;
  } catch (error) {
    if (error.code === 'EADDRINUSE') return false;
    throw error;
  }
}

async function waitForPorts(free) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const statuses = await Promise.all([isPortFree(frontendPort), isPortFree(apiPort)]);
    if (statuses.every(status => status === free)) return;
    await delay(100);
  }
  throw new Error(`Development ports did not become ${free ? 'free' : 'occupied'} in time.`);
}

async function waitForReady(child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Development launcher exited early.\n${child.output}`);
    try {
      const [page, health, content] = await Promise.all([
        fetch(`http://127.0.0.1:${frontendPort}/`),
        fetch(`http://127.0.0.1:${apiPort}/healthz`),
        fetch(`http://127.0.0.1:${frontendPort}/api/v1/content`),
      ]);
      const html = await page.text();
      const catalog = await content.json();
      if (page.ok && html.includes('id="root"') && health.ok && content.ok && catalog.version === '2026.10.22.1') return;
    } catch { /* wait for both processes and the Vite proxy to become ready */ }
    await delay(250);
  }
  throw new Error(`Development startup timed out.\n${child.output}`);
}

async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
  try {await exited(child);} catch {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    try {await exited(child, 3000);} catch {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited(child, 3000);
    }
  }
  await waitForPorts(true);
}

let session;
let active;
try {
  await waitForPorts(true);
  active = launch();
  await waitForReady(active);
  const created = await fetch(`http://127.0.0.1:${apiPort}/api/v1/sessions`, {method: 'POST'});
  if (created.status !== 201) throw new Error(`Session creation failed: HTTP ${created.status}`);
  session = await created.json();
  const before = await fetch(`http://127.0.0.1:${apiPort}/api/v1/state`, {headers: {Authorization: `Bearer ${session.token}`}});
  if (!before.ok) throw new Error(`Initial session state failed: HTTP ${before.status}`);
  const beforeState = await before.json();
  console.log('Cycle 1: frontend, API, content proxy, health check, and fresh session verified.');
  await stop(active);active = null;
  console.log('Cycle 1: Ctrl+C signal stopped the launcher and released both ports.');

  active = launch();
  await waitForReady(active);
  const after = await fetch(`http://127.0.0.1:${apiPort}/api/v1/state`, {headers: {Authorization: `Bearer ${session.token}`}});
  if (!after.ok) throw new Error(`Saved session did not reconnect after restart: HTTP ${after.status}`);
  const afterState = await after.json();
  if (afterState.revision !== beforeState.revision) throw new Error('Saved game state changed unexpectedly across restart.');
  console.log('Cycle 2: restarted API restored the same valid session and revision.');

  const duplicate = launch();
  await exited(duplicate, 10000);
  if (duplicate.exitCode === 0 || !duplicate.output.includes('required development port is already occupied') || !duplicate.output.includes('PID')) {
    throw new Error(`Duplicate start did not give a clear process-owner error.\n${duplicate.output}`);
  }
  const stillReady = await fetch(`http://127.0.0.1:${apiPort}/healthz`);
  if (!stillReady.ok || active.exitCode !== null) throw new Error('Duplicate start damaged the active server.');
  console.log('Duplicate start: refused with owner details and left the active server healthy.');
  await stop(active);active = null;
  console.log('Cycle 2: Ctrl+C signal stopped the launcher and released both ports.');
} finally {
  if (active) await stop(active);
  if (path.dirname(scratch) === os.tmpdir() && path.basename(scratch).startsWith('stray-kitty-dev-smoke-')) fs.rmSync(scratch, {recursive: true, force: true});
}
