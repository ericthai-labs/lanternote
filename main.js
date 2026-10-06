// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — main process.
// Owns the file system: picks the vault folder, reads it, watches it, and
// serves attachments to the window through the vault:// protocol.
const { app, BrowserWindow, dialog, ipcMain, shell, protocol, net, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');
const { Worker } = require('worker_threads');
const crypto = require('crypto');

const MD_EXT = new Set(['.md', '.markdown']);
const SKIP_DIRS = new Set(['node_modules']); // folders starting with '.' are skipped anyway

let win = null;
let vaultRoot = null;
let watcher = null;
let pendingOpen = null; // file passed on the command line / "Open with"

// ---------- settings (userData/settings.json) ----------
// The app was called "Lumen Notes" before 1.17. Its settings, caches and
// recovery copies are carried over once, so the renamed build starts where the
// old one left off.
(function carryOverUserData() {
  try {
    const now = app.getPath('userData');
    const old = path.join(path.dirname(now), 'Lumen Notes');
    if (fs.existsSync(old) && !fs.existsSync(path.join(now, 'settings.json'))) {
      fs.mkdirSync(now, { recursive: true });
      for (const name of ['settings.json', 'index-cache', 'layout-cache', 'recovery', 'mcp.log']) {
        const from = path.join(old, name);
        if (fs.existsSync(from)) fs.cpSync(from, path.join(now, name), { recursive: true });
      }
    }
  } catch (e) { console.warn('Could not carry over the old settings:', e.message); }
})();

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function writeSettings(s) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); }
  catch (e) { console.error('Could not save settings:', e.message); }
}
function setSetting(k, v) { const s = readSettings(); s[k] = v; writeSettings(s); }

// ---------- vault reading ----------
// All the heavy lifting (walk, parse, cache, search) happens in indexer.js on
// a worker thread; this process only relays requests and watches the folder.
const toPosix = (p) => p.split(path.sep).join('/');
let indexer = null;
let seq = 0;
const waits = new Map();
// Errors of the background threads go to userData/lanternote.log (kept small),
// so a problem on another PC can be looked at afterwards.
function logLine(msg) {
  try {
    const f = path.join(app.getPath('userData'), 'lanternote.log');
    try { if (fs.statSync(f).size > 1024 * 1024) fs.renameSync(f, f + '.1'); } catch { /* no log yet */ }
    fs.appendFileSync(f, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* logging must never break the app */ }
  console.error(msg);
}
let quitting = false, restarts = 0;
function startIndexer() {
  indexer = new Worker(path.join(__dirname, 'indexer.js'), {
    workerData: { cacheDir: path.join(app.getPath('userData'), 'index-cache') },
    resourceLimits: { maxOldGenerationSizeMb: 4096 },
  });
  indexer.on('message', (m) => {
    if (m.type === 'log') { logLine('indexer: ' + m.message); return; }
    if (m.type) { if (win && !win.isDestroyed()) win.webContents.send('index:event', m); return; }
    const w = waits.get(m.id); if (!w) return;
    waits.delete(m.id);
    if (m.error) w.rej(new Error(m.error)); else w.res(m.result);
  });
  indexer.on('error', (e) => logLine('indexer crashed: ' + (e && e.stack || e)));
  indexer.on('exit', (code) => {
    const self = indexer;
    for (const w of waits.values()) w.rej(new Error('indexer stopped (' + code + ')'));
    waits.clear();
    if (indexer === self) indexer = null;
    if (quitting) return;
    logLine('indexer exited with code ' + code);
    // start again and reopen the folder, so the window never talks to an empty index
    if (vaultRoot && restarts < 3) {
      restarts++;
      setTimeout(async () => {
        try {
          const data = await ask('open', { root: vaultRoot, exclude: excluded() });
          if (win && !win.isDestroyed()) win.webContents.send('index:event', { type: 'reopened', data });
        } catch (e) { logLine('reopen after crash failed: ' + e.message); }
      }, 500);
    }
  });
}
function ask(cmd, args) {
  if (!indexer) startIndexer();
  return new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); indexer.postMessage({ id, cmd, args }); });
}

// ---------- map layout (layout-worker.js) ----------
// Positions are cached per graph: the key is a hash of the links, the folder
// groups and the hub setting, so an unchanged vault reopens its map at once.
let layoutWorker = null;
let lseq = 0;
const lwaits = new Map();
function askLayout(msg, transfer) {
  if (!layoutWorker) {
    layoutWorker = new Worker(path.join(__dirname, 'layout-worker.js'));
    layoutWorker.on('message', (m) => {
      if (m.type === 'progress') { if (win && !win.isDestroyed()) win.webContents.send('index:event', { ...m, type: 'progress', phase: 'layout-' + m.phase }); return; }
      const w = lwaits.get(m.id); if (!w) return;
      lwaits.delete(m.id);
      if (m.error) w.rej(new Error(m.error)); else w.res(m.result);
    });
    layoutWorker.on('exit', () => { for (const w of lwaits.values()) w.rej(new Error('layout stopped')); lwaits.clear(); layoutWorker = null; });
  }
  return new Promise((res, rej) => { const id = ++lseq; lwaits.set(id, { res, rej }); layoutWorker.postMessage({ id, ...msg }, transfer || []); });
}
const LAYOUT_VERSION = 1;
const layoutFile = (a) => path.join(app.getPath('userData'), 'layout-cache', crypto.createHash('sha1')
  .update(`v${LAYOUT_VERSION}|${a.N}|${a.hubCap}|`)
  .update(Buffer.from(a.edges.buffer, a.edges.byteOffset, a.edges.byteLength))
  .update(Buffer.from(a.group.buffer, a.group.byteOffset, a.group.byteLength))
  .digest('hex').slice(0, 20) + '.bin');
async function putLayout(file, pos) {
  const dir = path.dirname(file);
  await fs.promises.mkdir(dir, { recursive: true });
  // keep only the newest few maps
  const old = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.bin'));
  if (old.length > 6) {
    const st = await Promise.all(old.map(async (f) => [f, (await fs.promises.stat(path.join(dir, f))).mtimeMs]));
    st.sort((x, y) => x[1] - y[1]);
    for (const [f] of st.slice(0, old.length - 6)) await fs.promises.rm(path.join(dir, f), { force: true });
  }
  await fs.promises.writeFile(file, Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength));
}
ipcMain.handle('graph:putLayout', async (_e, a) => putLayout(layoutFile(a), a.pos));
ipcMain.handle('graph:layout', async (_e, a) => {
  const file = layoutFile(a);
  if (!a.noCache) {
    try {
      const b = await fs.promises.readFile(file);
      if (b.length === a.N * 8) return { pos: new Float32Array(b.buffer, b.byteOffset, a.N * 2).slice(), cached: true };
    } catch { /* not cached yet */ }
  }
  const res = await askLayout({ cmd: 'layout', N: a.N, edges: a.edges, group: a.group, hubCap: a.hubCap });
  if (!a.noCache) {
    try { await putLayout(file, res.pos); } catch (e) { console.warn('Could not cache the map layout:', e.message); }
  }
  return { ...res, cached: false };
});
ipcMain.handle('graph:raster', async (_e, a) => askLayout({ cmd: 'raster', ...a }));

function watchVault(root) {
  if (watcher) { try { watcher.close(); } catch {} watcher = null; }
  let timer = null;
  const changed = new Set();
  const skipped = (f) => {
    if (f.split('/').some((seg) => seg.startsWith('.') || SKIP_DIRS.has(seg))) return true;
    const fl = f.toLowerCase();
    return excluded().some((x) => fl === x || fl.startsWith(x + '/'));
  };
  const onChange = (f) => { // f: path relative to the vault, with '/'
    if (skipped(f)) return;
    changed.add(f);
    clearTimeout(timer);
    // OneDrive can touch thousands of files in a burst: wait for quiet.
    timer = setTimeout(async () => {
      const list = [...changed]; changed.clear();
      try {
        const res = await ask('update', { changed: list });
        if (res && win && !win.isDestroyed()) win.webContents.send('vault:changed', res);
      } catch (e) { console.warn('Update failed:', e.message); }
    }, 700);
  };
  try {
    if (process.platform === 'linux') watcher = watchTree(root, onChange, skipped);
    else watcher = fs.watch(root, { recursive: true }, (_ev, file) => { if (file) onChange(toPosix(String(file))); });
  } catch (e) {
    console.warn('File watching unavailable:', e.message); // the Reload button still works
  }
}

// Linux: recursive fs.watch in Electron's Node misses changes, so watch every
// folder on its own (inotify) and add watchers for folders created later.
// Returns an object with close(), like fs.watch. If the system's watch limit
// (fs.inotify.max_user_watches) is reached, the rest of the tree is not watched
// and the Reload button picks those changes up.
function watchTree(root, onChange, skipped) {
  const watchers = new Map(); // relative folder → FSWatcher
  let full = false;
  const add = (rel) => {
    if (watchers.has(rel) || full) return;
    let w;
    try {
      w = fs.watch(rel ? path.join(root, rel) : root, (_ev, name) => {
        if (!name) return;
        const f = rel ? rel + '/' + toPosix(String(name)) : toPosix(String(name));
        onChange(f);
        if (!watchers.has(f)) fs.stat(path.join(root, f), (err, st) => { if (!err && st.isDirectory() && !skipped(f)) walk(f); }); // a new folder
      });
    } catch (e) {
      if (e.code === 'ENOSPC' || e.code === 'EMFILE') { full = true; console.warn('File watching limit reached; use Reload for folders not watched:', e.message); }
      return;
    }
    w.on('error', () => { try { w.close(); } catch {} watchers.delete(rel); });
    watchers.set(rel, w);
  };
  const walk = (rel) => {
    add(rel);
    let entries = [];
    try { entries = fs.readdirSync(rel ? path.join(root, rel) : root, { withFileTypes: true }); } catch { return; }
    for (const d of entries) {
      if (!d.isDirectory()) continue;
      const sub = rel ? rel + '/' + d.name : d.name;
      if (!skipped(sub)) walk(sub);
    }
  };
  walk('');
  return { close: () => { for (const w of watchers.values()) { try { w.close(); } catch {} } watchers.clear(); } };
}

// The saved index is shown at once (instant); the folder is walked and checked
// for edits in the background. A loose file (outside every known vault) opens
// its own folder without becoming the folder reopened at the next start.
async function openVault(dir, openFile, { loose = false } = {}) {
  const root = path.resolve(dir);
  const st = await fs.promises.stat(root);
  if (!st.isDirectory()) throw new Error('Not a folder: ' + root);
  vaultRoot = root;
  const ensure = openFile ? toPosix(path.relative(root, openFile)) : null;
  const data = await ask('open', { root, exclude: excluded(), instant: true, ensure });
  watchVault(root);
  if (!loose) {
    const s = readSettings();
    s.lastVault = root;
    s.recent = [root, ...(s.recent || []).filter((r) => r !== root)].slice(0, 8);
    writeSettings(s);
  }
  if (win) win.setTitle('Lanternote — ' + data.name);
  if (ensure) data.open = ensure;
  return data;
}

// A Markdown file opened from Explorer belongs to the deepest known vault (the
// open one, the last one, the recent ones) that contains it, so its saved index
// is used instead of indexing the file's own folder from scratch.
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
function vaultFor(file) {
  const s = readSettings();
  let best = null;
  for (const r of [vaultRoot, s.lastVault, ...(s.recent || [])]) {
    if (!r) continue;
    const rel = path.relative(r, file);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    // a file the index leaves out (hidden or ignored folder) cannot be shown from that vault
    const segs = toPosix(rel).split('/');
    if (segs.slice(0, -1).some((x) => x.startsWith('.') || SKIP_DIRS.has(x))) continue;
    const low = toPosix(rel).toLowerCase();
    if (excluded().some((x) => low === x || low.startsWith(x + '/'))) continue;
    if (!best || r.length > best.length) best = r;
  }
  return best;
}
async function openPending(f) {
  const root = vaultFor(f);
  if (root && vaultRoot && samePath(root, vaultRoot)) {
    // already open: just show the note (picked up first if it is new)
    const rel = toPosix(path.relative(vaultRoot, f));
    let change = null;
    try { change = await ask('update', { changed: [rel] }); } catch { /* shown anyway if indexed */ }
    return { same: true, open: rel, change };
  }
  if (root) return openVault(root, f);
  return openVault(path.dirname(f), f, { loose: true });
}

// Resolve a vault-relative path and refuse anything that escapes the vault.
function insideVault(rel) {
  if (!vaultRoot) return null;
  const abs = path.resolve(vaultRoot, rel);
  const r = path.relative(vaultRoot, abs);
  if (r.startsWith('..') || path.isAbsolute(r)) return null;
  return abs;
}

// ---------- IPC ----------
ipcMain.handle('vault:pick', async () => {
  const res = await dialog.showOpenDialog(win, { title: 'Open a notes folder', properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths[0]) return null;
  return openVault(res.filePaths[0]);
});
ipcMain.handle('vault:open', async (_e, dir) => openVault(dir));
ipcMain.handle('vault:reload', async () => (vaultRoot ? ask('open', { root: vaultRoot, exclude: excluded() }) : null));
ipcMain.handle('note:read', async (_e, rel) => {
  const abs = insideVault(rel);
  if (!abs) throw new Error('outside the folder');
  return fs.promises.readFile(abs, 'utf8');
});

// ---------- editing ----------
// Every path is checked to stay inside the vault; the vault root itself can
// never be renamed or removed.
function target(rel) {
  const abs = insideVault(rel);
  if (!abs || path.resolve(abs) === path.resolve(vaultRoot)) throw new Error('not allowed: ' + rel);
  return abs;
}
// write through a temporary file, so a crash never leaves half a note
async function writeAtomic(abs, data) {
  const tmp = path.join(path.dirname(abs), '.' + path.basename(abs) + '.' + process.pid + '.tmp');
  await fs.promises.writeFile(tmp, data);
  try { await fs.promises.rename(tmp, abs); }
  catch (e) { await fs.promises.rm(tmp, { force: true }); throw e; }
}
// open a note for editing: its text plus the modification time it was read at
ipcMain.handle('note:load', async (_e, rel) => {
  const abs = target(rel);
  const [text, st] = await Promise.all([fs.promises.readFile(abs, 'utf8'), fs.promises.stat(abs)]);
  return { text, mtime: st.mtimeMs };
});
// File recovery: before a note is overwritten,
// its previous text is kept in userData/recovery — at most one copy per note
// every 5 minutes, for 14 days. Never inside the vault, never synced.
const prefs = () => readSettings().prefs || {};
// Pictures from the internet (![](https://…) or <img src="https://…"> in a note) are
// not fetched unless Settings → Files & links allows it or the reader clicks one to
// load it: fetching a picture tells its web server who opened the note, and when.
// Nothing else in the window uses the network, so every http(s) request is checked here.
const allowedPictures = new Set();
function guardWeb(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, done) =>
    done({ cancel: !(prefs().remoteImages === true || allowedPictures.has(d.url)) }));
}
ipcMain.handle('picture:allow', (_e, url) => { if (/^https?:\/\//i.test(url)) allowedPictures.add(url); });
const snapDir = (rel) => path.join(app.getPath('userData'), 'recovery',
  crypto.createHash('sha1').update(vaultRoot.toLowerCase()).digest('hex').slice(0, 12),
  crypto.createHash('sha1').update(rel).digest('hex').slice(0, 16));
async function snapshot(rel, oldText) {
  const every = (prefs().recoveryMinutes ?? 5) * 60e3, keep = (prefs().recoveryDays ?? 14) * 24 * 3600e3;
  if (!every) return; // turned off in settings
  const dir = snapDir(rel);
  await fs.promises.mkdir(dir, { recursive: true });
  const list = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  const now = Date.now();
  for (const f of list) if (now - +f.slice(0, 13) > keep) await fs.promises.rm(path.join(dir, f), { force: true });
  const last = list.length ? +list[list.length - 1].slice(0, 13) : 0;
  if (now - last < every) return;
  await fs.promises.writeFile(path.join(dir, `${now}.md`), oldText);
  await fs.promises.writeFile(path.join(dir, 'path.txt'), rel);
}
ipcMain.handle('note:versions', async (_e, rel) => {
  try {
    const dir = snapDir(rel);
    const list = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.md')).sort().reverse();
    return Promise.all(list.map(async (f) => ({ time: +f.slice(0, 13), text: await fs.promises.readFile(path.join(dir, f), 'utf8') })));
  } catch { return []; }
});

// Save. If the file changed on disk since `baseMtime` (OneDrive, another editor,
// another program), nothing is written and the other version is returned.
ipcMain.handle('note:save', async (_e, rel, text, baseMtime, force) => {
  const abs = target(rel);
  let st = null;
  try { st = await fs.promises.stat(abs); } catch { /* deleted meanwhile: write it back */ }
  if (st && !force && baseMtime && Math.abs(st.mtimeMs - baseMtime) > 1) {
    const theirs = await fs.promises.readFile(abs, 'utf8');
    if (theirs !== text) return { conflict: true, theirs, mtime: st.mtimeMs };
  }
  if (st) {
    try { const old = await fs.promises.readFile(abs, 'utf8'); if (old !== text) await snapshot(rel, old); }
    catch (e) { console.warn('No recovery copy for', rel, e.message); }
  }
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await writeAtomic(abs, text);
  return { mtime: (await fs.promises.stat(abs)).mtimeMs };
});
// create a new file; fails rather than overwrite
ipcMain.handle('note:create', async (_e, rel, text) => {
  const abs = target(rel);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, text || '', { flag: 'wx' });
  return { mtime: (await fs.promises.stat(abs)).mtimeMs };
});
ipcMain.handle('app:info', async () => ({ version: app.getVersion(), userData: app.getPath('userData'), copyright: COPYRIGHT, author: 'Eric Thai - Thai Ba Hoa' }));
ipcMain.handle('app:openUserData', async () => shell.openPath(app.getPath('userData')));
// the AI connection (MCP): this very exe runs mcp/lanternote-mcp.js as plain Node
ipcMain.handle('app:mcp', async () => ({
  command: process.execPath,
  script: app.isPackaged ? path.join(process.resourcesPath, 'app.asar', 'mcp', 'lanternote-mcp.js') : path.join(__dirname, 'mcp', 'lanternote-mcp.js'),
  portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
  log: path.join(app.getPath('userData'), 'mcp.log'),
}));
// ---------- Markdown app (Windows) ----------
// Registers this exe for .md / .markdown under HKCU (no admin rights): a ProgID,
// "Open with" entries and Default-apps capabilities. Windows does not let a
// program make itself the default; the person picks it once in Settings →
// Default apps, which is opened afterwards.
const { execFile } = require('child_process');
const appExe = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const reg = (args) => new Promise((res, rej) => execFile('reg', args, { windowsHide: true }, (e, _o, err) => (e ? rej(new Error(String(err || e.message).trim())) : res())));
const regSet = (key, name, value) => reg(['add', key, ...(name == null ? ['/ve'] : ['/v', name]), '/t', 'REG_SZ', '/d', value, '/f']);
const MD_PROGID = 'Lanternote.md';
async function registerMarkdown() {
  const exe = appExe();
  const C = 'HKCU\\Software\\Classes';
  await regSet(`${C}\\${MD_PROGID}`, null, 'Markdown note');
  await regSet(`${C}\\${MD_PROGID}`, 'FriendlyTypeName', 'Markdown note');
  await regSet(`${C}\\${MD_PROGID}\\DefaultIcon`, null, `"${exe}",0`);
  await regSet(`${C}\\${MD_PROGID}\\shell\\open`, 'FriendlyAppName', 'Lanternote');
  await regSet(`${C}\\${MD_PROGID}\\shell\\open\\command`, null, `"${exe}" "%1"`);
  const cap = 'HKCU\\Software\\Lanternote\\Capabilities';
  await regSet(cap, 'ApplicationName', 'Lanternote');
  await regSet(cap, 'ApplicationDescription', 'Markdown notes with links, graph and editing');
  for (const ext of ['.md', '.markdown']) {
    await regSet(`${C}\\${ext}\\OpenWithProgids`, MD_PROGID, '');
    await regSet(`${cap}\\FileAssociations`, ext, MD_PROGID);
  }
  await regSet('HKCU\\Software\\RegisteredApplications', 'Lanternote', 'Software\\Lanternote\\Capabilities');
  setSetting('mdApp', exe);
}
async function unregisterMarkdown() {
  const C = 'HKCU\\Software\\Classes';
  const del = (args) => reg(['delete', ...args, '/f']).catch(() => {});
  for (const ext of ['.md', '.markdown']) await del([`${C}\\${ext}\\OpenWithProgids`, '/v', MD_PROGID]);
  await del([`${C}\\${MD_PROGID}`]);
  await del(['HKCU\\Software\\RegisteredApplications', '/v', 'Lanternote']);
  await del(['HKCU\\Software\\Lanternote']);
  setSetting('mdApp', null);
}
ipcMain.handle('app:mdApp', async () => ({
  supported: process.platform === 'win32' && app.isPackaged,
  windows: process.platform === 'win32',
  registered: !!readSettings().mdApp,
  portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
  exe: appExe(),
}));
ipcMain.handle('app:mdAppSet', async (_e, on) => {
  if (process.platform !== 'win32' || !app.isPackaged) throw new Error('Only the installed Windows app can register itself');
  if (!on) { await unregisterMarkdown(); return false; }
  await registerMarkdown();
  // Windows 11 opens Lanternote's own page; older builds open the Default apps list
  await shell.openExternal('ms-settings:defaultapps?registeredAppUser=Lanternote').catch(() => shell.openExternal('ms-settings:defaultapps'));
  return true;
});

ipcMain.handle('app:copy', async (_e, text) => { clipboard.writeText(String(text)); return true; });
// folders the user chose to ignore (settings → Files & links)
const excluded = () => String(prefs().exclude || '').split(',').map((s) => s.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase()).filter(Boolean);
ipcMain.on('window:close', () => { if (win && !win.isDestroyed()) win.close(); });
ipcMain.handle('file:stat', async (_e, rel) => { const st = await fs.promises.stat(target(rel)); return { size: st.size, mtime: st.mtimeMs }; });
ipcMain.handle('file:openDefault', async (_e, rel) => shell.openPath(target(rel)));
ipcMain.handle('file:exists', async (_e, rel) => { try { await fs.promises.access(target(rel)); return true; } catch { return false; } });
ipcMain.handle('file:rename', async (_e, from, to) => {
  const a = target(from), b = target(to);
  if (a.toLowerCase() !== b.toLowerCase()) {
    try { await fs.promises.access(b); throw new Error('A file with that name already exists'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  await fs.promises.mkdir(path.dirname(b), { recursive: true });
  await fs.promises.rename(a, b);
});
// deleting only ever moves to the recycle bin
ipcMain.handle('file:trash', async (_e, rel) => { await shell.trashItem(target(rel)); });
ipcMain.handle('file:mkdir', async (_e, rel) => { await fs.promises.mkdir(target(rel), { recursive: true }); });
// pasted or dropped attachment: store next to the note under a free name
ipcMain.handle('file:attach', async (_e, dirRel, name, bytes) => {
  const safe = String(name).replace(/[\\/:*?"<>|]/g, '-');
  const ext = path.extname(safe), stem = path.basename(safe, ext);
  for (let i = 0; i < 1000; i++) {
    const rel = (dirRel ? dirRel + '/' : '') + stem + (i ? ' ' + i : '') + ext;
    try { await fs.promises.writeFile(target(rel), Buffer.from(bytes), { flag: 'wx' }); return rel; }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  throw new Error('no free name for ' + safe);
});
ipcMain.handle('index:search', async (_e, q, limit) => ask('search', { q, limit }));
// test hook (only with LANTERNOTE_TEST=1): end the indexer as a crash would
if (process.env.LANTERNOTE_TEST) ipcMain.handle('test:crash-indexer', async () => { if (indexer) await indexer.terminate(); });
// test hook: a file opened from Explorer while the app runs (as second-instance does)
if (process.env.LANTERNOTE_TEST) ipcMain.handle('test:open-file', async (_e, f) => { pendingOpen = f; win.webContents.send('menu', 'pending-open'); });
ipcMain.handle('index:dv', async (_e, q, origin) => ask('dv', { q, origin }));
ipcMain.handle('index:snippets', async (_e, target, sources) => ask('snippets', { target, sources }));
ipcMain.handle('vault:last', async () => {
  if (pendingOpen) {
    const f = pendingOpen; pendingOpen = null;
    return openPending(f);
  }
  const last = readSettings().lastVault;
  if (last && fs.existsSync(last)) return openVault(last);
  return null;
});
ipcMain.handle('vault:recent', async () => (readSettings().recent || []).filter((r) => fs.existsSync(r)));
ipcMain.handle('file:reveal', async (_e, rel) => { const abs = insideVault(rel); if (abs) shell.showItemInFolder(abs); });
// A document a note links outside the folder (file:///…/datasheet.pdf) opens in its own app —
// only documents and pictures, never anything that runs (.exe, .bat, .lnk, scripts, macros).
const OPENABLE_EXT = /\.(pdf|png|jpe?g|gif|webp|svg|bmp|tiff?|txt|csv)$/i;
ipcMain.handle('shell:external', async (_e, url) => {
  if (/^(https?|mailto):/i.test(url)) await shell.openExternal(url);
  else if (/^file:/i.test(url) && prefs().localImages !== false) {
    let p;
    try { p = fileURLToPath(url); } catch { return false; }
    if (OPENABLE_EXT.test(p) && fs.existsSync(p)) return (await shell.openPath(p)) === '';
  }
  return false;
});
ipcMain.handle('settings:get', async (_e, k) => readSettings()[k]);
ipcMain.handle('settings:set', async (_e, k, v) => setSetting(k, v));

// A picture outside the folder that a note links as file:///… (drawings kept on another
// drive, say): served as vault://ext/<path> only if it is a picture file and Settings →
// Files & links allows it. Nothing else outside the folder is ever read this way.
const PICTURE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
function outsidePicture(u) {
  let p = decodeURIComponent(u.pathname);
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);                 // '/F:/pics/a.svg' -> 'F:/pics/a.svg'
  if (prefs().localImages === false || !PICTURE_EXT.test(p) || !path.isAbsolute(p)) return new Response('Not found', { status: 404 });
  return net.fetch(pathToFileURL(p).toString());
}

// ---------- window ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'vault', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ---------- authorship ----------
const COPYRIGHT = 'Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0.';
const licenceFile = (name) => path.join(app.isPackaged ? process.resourcesPath : __dirname, name);
function openLicence(name) { shell.openPath(licenceFile(name)); }
async function about() {
  const r = await dialog.showMessageBox(win, {
    type: 'info', title: 'About Lanternote', message: `Lanternote ${app.getVersion()}`,
    detail: `${COPYRIGHT}
Author: Eric Thai - Thai Ba Hoa

Open source under the Apache License 2.0. See the licence.`,
    buttons: ['OK', 'Licence', 'Third-party licences'], defaultId: 0, cancelId: 0,
  });
  if (r.response === 1) openLicence('LICENSE.txt');
  if (r.response === 2) openLicence('THIRD-PARTY-NOTICES.txt');
}
ipcMain.handle('app:about', () => about());
// documents that ship inside the app and open in the note area
// (electron-builder leaves CHANGELOG.md out of app.asar; the packaged app
// reads the copy shipped in resources/)
const DOCS = {
  guide: () => path.join(__dirname, 'src', 'guide', 'huong-dan.md'),
  changelog: () => path.join(app.isPackaged ? process.resourcesPath : __dirname, 'CHANGELOG.md'),
};
ipcMain.handle('app:doc', (_e, kind) => fs.promises.readFile((DOCS[kind] || DOCS.guide)(), 'utf8'));
ipcMain.handle('app:licence', (_e, which) => openLicence(which === 'third' ? 'THIRD-PARTY-NOTICES.txt' : 'LICENSE.txt'));

function buildMenu() {
  const send = (cmd) => () => win && win.webContents.send('menu', cmd);
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Open folder…', accelerator: 'CmdOrCtrl+Shift+O', click: send('open') },
      { label: 'Reload folder', accelerator: 'CmdOrCtrl+R', click: send('reload') },
      { type: 'separator' },
      { label: 'New note', accelerator: 'CmdOrCtrl+N', click: send('new-note') },
      { label: 'New canvas', click: send('new-canvas') },
      { label: 'New kanban board', click: send('new-board') },
      { label: 'New note from template…', click: send('new-from-template') },
      { label: 'Insert template', accelerator: 'Alt+E', click: send('insert-template') },
      { label: 'Toggle reading / editing', accelerator: 'CmdOrCtrl+E', click: send('toggle-edit') },
      { label: 'Command palette…', accelerator: 'CmdOrCtrl+P', click: send('palette') },
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: send('settings') },
      { type: 'separator' },
      { label: 'Print / Save as PDF…', click: send('print') },
      { type: 'separator' },
      isMac ? { role: 'close', accelerator: 'Cmd+Shift+W' } : { role: 'quit' },
    ] },
    { label: 'Go', submenu: [
      { label: 'Command Center', accelerator: 'CmdOrCtrl+Shift+H', click: send('command-center') },
      { label: 'Quick open…', accelerator: 'CmdOrCtrl+O', click: send('switcher') },
      { label: 'Search in all notes', accelerator: 'CmdOrCtrl+Shift+F', click: send('search') },
      { label: 'Graph of all notes', accelerator: 'CmdOrCtrl+G', click: send('graph') },
      { label: 'Graph around this note', accelerator: 'CmdOrCtrl+Shift+G', click: send('graph-local') },
      { label: 'Back', accelerator: 'Alt+Left', click: send('back') },
      { label: 'Forward', accelerator: 'Alt+Right', click: send('forward') },
      { type: 'separator' },
      { label: 'New tab', accelerator: 'CmdOrCtrl+T', click: send('new-tab') },
      { label: 'Close tab', accelerator: 'CmdOrCtrl+W', click: send('close-tab') },
      { label: 'Next tab', accelerator: 'CmdOrCtrl+Tab', click: send('next-tab') },
      { label: 'Previous tab', accelerator: 'CmdOrCtrl+Shift+Tab', click: send('prev-tab') },
      { label: 'Open this note in the right pane', accelerator: 'CmdOrCtrl+Alt+Right', click: send('split-open') },
      { label: 'Close the right pane', click: send('split-close') },
    ] },
    { label: 'View', submenu: [
      { label: 'Toggle file panel', accelerator: 'CmdOrCtrl+\\', click: send('toggle-left') },
      { label: 'Toggle outline panel', accelerator: 'CmdOrCtrl+Shift+\\', click: send('toggle-right') },
      { label: 'Toggle dark mode', accelerator: 'CmdOrCtrl+Shift+D', click: send('theme') },
      { type: 'separator' },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      { type: 'separator' },
      { role: 'toggleDevTools' },
    ] },
    // Help is always the last menu
    { label: 'Help', submenu: [
      { label: 'User guide', accelerator: 'F1', click: send('guide') },
      { label: "What's new (changelog)", click: send('changelog') },
      { type: 'separator' },
      { label: 'About Lanternote', click: about },
      { label: 'Licence', click: () => openLicence('LICENSE.txt') },
      { label: 'Third-party licences', click: () => openLicence('THIRD-PARTY-NOTICES.txt') },
    ] },
  ]));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 420, minHeight: 360,
    title: 'Lanternote',
    backgroundColor: '#1e1e1e',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  guardWeb(win.webContents.session);
  // Links never navigate the app window away; web links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  // unsaved edits are written before the window goes away
  let flushedWin = false;
  win.on('close', (e) => {
    if (flushedWin) return;
    e.preventDefault();
    const done = () => { flushedWin = true; if (win && !win.isDestroyed()) win.close(); };
    ipcMain.once('window:flushed', done);
    win.webContents.send('menu', 'flush');
    setTimeout(done, 3000);
  });
}

function argFile(argv) {
  const f = argv.slice(1).find((a) => !a.startsWith('-') && MD_EXT.has(path.extname(a).toLowerCase()) && fs.existsSync(a));
  return f ? path.resolve(f) : null;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  pendingOpen = argFile(process.argv);
  app.on('second-instance', (_e, argv) => {
    const f = argFile(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) { pendingOpen = f; win.webContents.send('menu', 'pending-open'); }
    }
  });
  app.on('open-file', (e, f) => { e.preventDefault(); pendingOpen = f; if (win) win.webContents.send('menu', 'pending-open'); });

  app.whenReady().then(() => {
    protocol.handle('vault', (req) => {
      const u = new URL(req.url);
      if (u.hostname === 'ext') return outsidePicture(u);
      const abs = insideVault(decodeURIComponent(u.pathname.replace(/^\//, '')));
      if (!abs) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(abs).toString());
    });
    buildMenu();
    createWindow();
    const mdApp = readSettings().mdApp;
    if (mdApp && process.platform === 'win32' && app.isPackaged && mdApp !== appExe()) {
      registerMarkdown().catch((e) => logLine('Could not update the Markdown app registration: ' + e.message));
    }
  });
  app.on('window-all-closed', () => app.quit());
  // let the indexer write its cache before the process goes away
  let flushed = false;
  app.on('before-quit', (e) => {
    quitting = true;
    if (flushed || !indexer) return;
    e.preventDefault(); flushed = true;
    Promise.race([ask('flush'), new Promise((r) => setTimeout(r, 4000))]).catch(() => {}).finally(() => app.quit());
  });
}
