import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.runtime');
const frontendPort = 5017;
const apiAddress = process.env.GAME_ADDR || '127.0.0.1:8017';
const apiPort = Number(apiAddress.slice(apiAddress.lastIndexOf(':') + 1));
const dataFile = process.env.GAME_DATA_FILE || path.join(runtime, 'game.json');
const executable = path.join(runtime, process.platform === 'win32' ? 'kitty-api.exe' : 'kitty-api');

function ownersOf(port) {
  if (process.platform === 'win32') {
    const query = `$listener = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener) { $p = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess); [pscustomobject]@{ pid = $listener.OwningProcess; parentPid = $p.ParentProcessId; name = $p.Name; executable = $p.ExecutablePath; commandLine = $p.CommandLine } | ConvertTo-Json -Compress }`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', query], {encoding: 'utf8', windowsHide: true});
    if (result.status !== 0 || !result.stdout.trim()) return [];
    try {return [JSON.parse(result.stdout)];} catch {return [];}
  }

  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], {encoding: 'utf8'});
  if (result.status !== 0) return [];
  const fields = result.stdout.trim().split('\n');
  const pid = fields.find(field => field.startsWith('p'))?.slice(1);
  const command = fields.find(field => field.startsWith('c'))?.slice(1);
  return pid ? [{pid, name: command || 'unknown'}] : [];
}

function describeOwner(owner) {
  const details = [`PID ${owner.pid}`, owner.name, owner.executable, owner.commandLine].filter(Boolean);
  if (owner.parentPid) details.push(`parent PID ${owner.parentPid}`);
  return details.join(' | ');
}

function checkPorts() {
  const conflicts = [];
  for (const port of new Set([frontendPort, apiPort])) {
    const owners = ownersOf(port);
    if (owners.length) conflicts.push({port, owners});
  }
  if (!conflicts.length) return true;
  console.error('Cannot start Stray Kitty because a required development port is already occupied:');
  for (const {port, owners} of conflicts) {
    console.error(`  127.0.0.1:${port}`);
    for (const owner of owners) console.error(`    ${describeOwner(owner)}`);
  }
  console.error('Stop the owning development session with Ctrl+C in its terminal, then retry npm run dev.');
  return false;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, timeoutMs);
    timeout.unref();
    child.once('exit', () => {clearTimeout(timeout); resolve();});
  });
}

fs.mkdirSync(runtime, {recursive: true});
if (!checkPorts()) process.exit(1);

const contentCheck = spawnSync(process.execPath, [path.join(root, 'scripts/content.mjs'), '--check'], {stdio: 'inherit', cwd: root});
if (contentCheck.status !== 0) process.exit(contentCheck.status ?? 1);
const build = spawnSync('go', ['build', '-o', executable, './cmd/api'], {cwd: path.join(root, 'server'), stdio: 'inherit'});
if (build.status !== 0) process.exit(build.status ?? 1);

const vitePath = fs.existsSync(path.join(root, 'web/node_modules/vite/bin/vite.js'))
  ? path.join(root, 'web/node_modules/vite/bin/vite.js')
  : path.join(root, 'node_modules/vite/bin/vite.js');
const children = [
  spawn(executable, [], {cwd: path.join(root, 'server'), stdio: 'inherit', env: {...process.env, GAME_ADDR: apiAddress, GAME_QA_ENABLED: 'true', GAME_DATA_FILE: dataFile}}),
  spawn(process.execPath, [vitePath, '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], {cwd: path.join(root, 'web'), stdio: 'inherit', env: process.env}),
];

let stopping = false;
async function stop(code = 0, signal = 'SIGINT') {
  if (stopping) return;
  stopping = true;
  const running = children.filter(child => child.exitCode === null && child.signalCode === null);
  for (const child of running) {
    try {child.kill(signal);} catch { /* the child may exit between the check and signal */ }
  }
  await Promise.all(running.map(child => waitForExit(child, 5000)));
  for (const child of running) {
    if (child.exitCode === null && child.signalCode === null) {
      console.error(`Child PID ${child.pid} did not stop after ${signal}; terminating it.`);
      try {child.kill('SIGKILL');} catch { /* already exited */ }
    }
  }
  await Promise.all(running.map(child => waitForExit(child, 1000)));
  process.exitCode = code;
}

for (const child of children) {
  child.on('error', error => {
    console.error(`Could not start development child: ${error.message}`);
    void stop(1, 'SIGTERM');
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`Development child PID ${child.pid} exited (${signal || code}); stopping the other service.`);
      const failedPort = child === children[0] ? apiPort : frontendPort;
      const owners = ownersOf(failedPort);
      if (owners.length) console.error(`Port ${failedPort} is now owned by: ${owners.map(describeOwner).join('; ')}`);
      void stop(code && code !== 0 ? code : 1, 'SIGINT');
    }
  });
}

process.on('SIGINT', () => {void stop(0, 'SIGINT');});
process.on('SIGTERM', () => {void stop(0, 'SIGTERM');});
console.log(`Stray Kitty development session: http://127.0.0.1:${frontendPort} | API http://${apiAddress}`);
