// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Test driver: starts the app with a throw-away profile, opens a folder and
// runs JS in the window through the DevTools protocol.
//   node scripts/drive.js "<vault folder>" <script.js> [out-dir]
// The script file is evaluated in this process with `ev(expr)` (runs in
// the window and returns the value), `shot(name)` (saves a PNG), `sleep(ms)`,
// `until(expr, ms)` and `log()` in scope.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const [vault, scriptFile, outDir = path.join(os.tmpdir(), 'lanternote-drive')] = process.argv.slice(2);
const profile = path.join(os.tmpdir(), 'lanternote-drive-profile');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
// FRESH_PROFILE=1 starts with an empty profile (to test first-run behaviour)
if (process.env.FRESH_PROFILE) fs.rmSync(path.join(profile, 'settings.json'), { force: true });
else fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ lastVault: path.resolve(vault), theme: process.env.THEME || 'light' }));

const electron = require('electron'); // path to the binary when required from node
const port = 9333;
// APP_EXE=dist/win-unpacked/"Lanternote.exe" tests the packaged build instead of the sources
const exe = process.env.APP_EXE ? path.resolve(process.env.APP_EXE) : electron;
// WEAK=1 imitates a low-end PC: no GPU (WebGL falls back to software) and a 4x slower CPU
const args = [...(process.env.APP_EXE ? [] : ['.']), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', ...(process.env.WEAK ? ['--disable-gpu'] : [])];
const child = spawn(exe, args, { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
const logs = [];
child.stdout.on('data', (d) => logs.push(String(d)));
child.stderr.on('data', (d) => logs.push(String(d)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0; const waits = new Map(); const consoleLines = [];
function send(method, params = {}) {
  return new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const f = path.join(outDir, name + '.png');
  fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
  console.log('screenshot', f);
}
async function until(expr, ms = 60000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (await ev(expr)) return Date.now() - t; } catch { /* not ready */ } await sleep(250); }
  throw new Error('timeout waiting for ' + expr);
}

(async () => {
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* starting */ }
  }
  if (!target) throw new Error('no window — the app printed:\n' + (logs.join('').slice(-3000) || '(nothing)'));
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); if (m.error) w.rej(new Error(m.error.message)); else w.res(m.result); }
    if (m.method === 'Runtime.consoleAPICalled') consoleLines.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') consoleLines.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  if (process.env.WEAK) await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const log = (...a) => console.log(...a);
  const body = fs.readFileSync(scriptFile, 'utf8');
  const fn = new Function('ev', 'shot', 'sleep', 'until', 'log', 'consoleLines', 'require', 'send', `return (async () => { ${body} })();`);
  try { await fn(ev, shot, sleep, until, log, consoleLines, require, send); }
  catch (e) { console.error('SCRIPT FAILED:', e.message); process.exitCode = 1; }
  console.log('--- window console ---\n' + consoleLines.join('\n'));
  console.log('--- main process ---\n' + logs.join('').slice(-4000));
  child.kill();
  setTimeout(() => process.exit(), 500);
})().catch((e) => { console.error(e); child.kill(); process.exit(1); });
