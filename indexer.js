// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — indexer (worker thread).
// Owns everything that scales with the vault size so neither the main
// process nor the window has to hold 200,000 notes:
//   • walks the folder, reads and parses notes (links, tags);
//   • keeps a per-vault cache on disk so a reopen only re-reads changed files;
//   • keeps a compact full-text index (search-index.js), saved next to the
//     cache, so a reopen neither re-reads nor holds every note's text;
//   • answers search / snippet requests and incremental updates.
// The window only ever receives the compact snapshot built by snapshot().
'use strict';
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const v8 = require('v8');
const crypto = require('crypto');
const Core = require('./src/core.js');
const SI = require('./search-index.js');
const DQL = require('./src/dataview.js');

const MD_EXT = new Set(['.md', '.markdown']);
const SKIP_DIRS = new Set(['node_modules']); // folders starting with '.' are skipped anyway
const MAX_FILES = 1_000_000;
const CACHE_VERSION = 5; // 4: fields (frontmatter + inline) and ctime for Dataview; 5: tasks
const IO = 64;                         // concurrent file operations
const cacheDir = workerData.cacheDir;

let S = null; // state of the open vault

// Background tasks (search index, verification) are not awaited by anyone:
// report their errors instead of letting an unhandled rejection end the worker.
function logError(e) { parentPort.postMessage({ type: 'log', level: 'error', message: String(e && e.stack || e) }); }
process.on('unhandledRejection', logError);

const isMd = (f) => MD_EXT.has(path.extname(f).toLowerCase());
const now = () => Number(process.hrtime.bigint() / 1000000n);
const progress = (phase, done, total) => parentPort.postMessage({ type: 'progress', phase, done, total });

// Run fn over items with at most `n` in flight.
async function pool(items, n, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}

// Breadth-first walk with parallel readdir: much faster than a recursive
// await-per-folder on network or OneDrive disks.
let EXCLUDE = [];  // lower-case folder paths the user chose to ignore
const isExcluded = (rel) => { const r = rel.toLowerCase(); return EXCLUDE.some((x) => r === x || r.startsWith(x + '/')); };
async function walk(root) {
  const files = [];
  let dirs = [''];
  while (dirs.length && files.length < MAX_FILES) {
    const next = [];
    await pool(dirs, IO, async (rel) => {
      let ents;
      try { ents = await fs.promises.readdir(rel ? path.join(root, rel) : root, { withFileTypes: true }); }
      catch (e) { console.warn('Skip unreadable folder', rel, e.message); return; }
      for (const ent of ents) {
        if (ent.name.startsWith('.') || SKIP_DIRS.has(ent.name)) continue;
        const r = rel ? rel + '/' + ent.name : ent.name;
        if (EXCLUDE.length && isExcluded(r)) continue;
        if (ent.isDirectory()) next.push(r);
        else if (ent.isFile() && files.length < MAX_FILES) files.push(r);
      }
    });
    dirs = next;
  }
  // parallel readdir finishes in any order; a stable order lets a reopen
  // recognise an unchanged folder and reuse the cached link graph
  return files.sort();
}

// ---------------- cache on disk ----------------
const cacheFile = (root) => path.join(cacheDir, crypto.createHash('sha1').update(root.toLowerCase()).digest('hex').slice(0, 16) + '.bin');
function loadCache(root) {
  try {
    const c = v8.deserialize(fs.readFileSync(cacheFile(root)));
    if (c.version === CACHE_VERSION && c.root === root) return { meta: new Map(c.entries), snap: c.snap };
  } catch { /* no cache yet */ }
  return { meta: new Map(), snap: null };
}
const searchFile = (root) => cacheFile(root).replace(/\.bin$/, '.search.bin');
const SEARCH_VERSION = 1;
function loadSearch(root) {
  try {
    const o = v8.deserialize(fs.readFileSync(searchFile(root)));
    if (o.version === SEARCH_VERSION) return SI.Index.from(o.index);
  } catch { /* none yet */ }
  return null;
}
let searchTimer = null;
function saveSearch(soon) {
  clearTimeout(searchTimer);
  const doSave = () => {
    if (!S || !S.sidx) return;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      const tmp = searchFile(S.root) + '.tmp';
      fs.writeFileSync(tmp, v8.serialize({ version: SEARCH_VERSION, index: S.sidx.serialize() }));
      fs.renameSync(tmp, searchFile(S.root));
    } catch (e) { console.warn('Could not save search index:', e.message); }
  };
  if (soon) searchTimer = setTimeout(doSave, soon); else doSave();
}
let saveTimer = null;
function saveCache(soon) {
  clearTimeout(saveTimer);
  const doSave = () => {
    if (!S) return;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      const entries = [];
      for (const [p, m] of S.meta) entries.push([p, m]);
      // Saved while a slow open is still checking notes (the app closed
      // early): keep the old entries not checked yet, or the next open would
      // have to read them all again. They are checked by mtime and size then.
      if (S.prev) for (const [p, m] of S.prev) if (!S.meta.has(p)) entries.push([p, m]);
      const tmp = cacheFile(S.root) + '.tmp';
      fs.writeFileSync(tmp, v8.serialize({ version: CACHE_VERSION, root: S.root, entries, snap: S.snap }));
      fs.renameSync(tmp, cacheFile(S.root));
    } catch (e) { console.warn('Could not save index cache:', e.message); }
  };
  if (soon) saveTimer = setTimeout(doSave, soon); else doSave();
}

// ---------------- reading ----------------
// meta entry: { mtime, size, links: string[], tags: string[] }
// Text only passes through: into the index being built, or into the small
// delta of an existing index. It is never kept.
function keepText(p, text) {
  if (S.builder && S.opening) return; // a first open shows the vault first; the index is built right after
  if (S.builder) { if (!S.added.has(p)) { S.added.add(p); S.builder.add(p, text); } else S.later.add(p); }
  else if (S.sidx) { S.sidx.update(p, text); saveSearch(30000); }
}

async function readNote(p) {
  const abs = path.join(S.root, p);
  const [text, st] = await Promise.all([fs.promises.readFile(abs, 'utf8'), fs.promises.stat(abs)]);
  const { links, tags, fields, tasks } = Core.parseNote(text);
  const m = { mtime: st.mtimeMs, ctime: st.birthtimeMs || st.mtimeMs, size: st.size, links, tags };
  if (fields) m.fields = fields;
  if (tasks) m.tasks = tasks;
  S.meta.set(p, m);
  keepText(p, text);
}

async function open(root) {
  const t0 = now();
  if (S && S.root !== root) saveCache();
  if (S && S.sidx && S.root !== root) saveSearch();
  S = { root, name: path.basename(root), files: [], meta: new Map(), sidx: null, builder: null, added: null, later: null, searchReady: false, gen: (S ? S.gen : 0) + 1 };
  const gen = S.gen;
  S.sidx = loadSearch(root);
  if (!S.sidx) { S.builder = new SI.Builder(); S.added = new Set(); S.later = new Set(); }
  progress('scan', 0, 0);
  S.files = await walk(root);
  const t1 = now();
  const md = S.files.filter(isMd);
  const cache = loadCache(root);

  // Fast path: same file list as last time → show the cached graph at once,
  // then look for edits in the background.
  const cs = cache.snap;
  if (cs && cs.files.length === S.files.length && cs.files.every((f, i) => f === S.files[i]) && md.every((p) => cache.meta.has(p))) {
    S.meta = cache.meta;
    resolveAll();
    S.snap = cs;
    S.timing = { walk: t1 - t0, cached: true, files: S.files.length, notes: md.length };
    cs.timing = S.timing;
    verify(gen, md).then(() => fillSearch(gen)).catch(logError);
    return cs;
  }

  // stat every note; unchanged notes keep their cached parse
  const stale = [];
  let done = 0;
  S.opening = true;
  S.prev = cache.meta;
  await pool(md, IO, async (p) => {
    try {
      const st = await fs.promises.stat(path.join(root, p));
      const c = cache.meta.get(p);
      if (c && c.mtime === st.mtimeMs && c.size === st.size) S.meta.set(p, c);
      else stale.push(p);
    } catch { /* vanished meanwhile */ }
    if (++done % 2000 === 0) progress('check', done, md.length);
  });
  const t2 = now();
  // Many notes to re-read (first start after an update, a big OneDrive
  // sync): feeding each into the saved search index as a change keeps every
  // note's words in memory and ran the worker out of memory on 200k notes.
  // Rebuilding the index from scratch afterwards is cheaper.
  if (S.sidx && stale.length > Math.max(2000, md.length * 0.03)) startSearchRebuild();
  done = 0;
  await pool(stale, IO, async (p) => {
    try { await readNote(p); } catch (e) { console.warn('Could not read', p, e.message); }
    if (++done % 1000 === 0) progress('read', done, stale.length);
  });
  const t3 = now();
  S.opening = false;
  S.prev = null;
  resolveAll();
  const t4 = now();
  S.timing = { walk: t1 - t0, stat: t2 - t1, read: t3 - t2, resolve: t4 - t3, files: S.files.length, notes: md.length, reread: stale.length };
  const snap = snapshot();
  S.timing.snapshot = now() - t4;
  if (stale.length) saveCache(2000);
  // Without a saved search index, the notes that came from the cache are
  // read once more in the background to build it.
  fillSearch(gen).catch(logError);
  return snap;
}

// Background check after a fast open: stat every note and re-read the ones
// that changed while the app was closed; the window gets them as an update.
async function verify(gen, md) {
  const t0 = now();
  const changed = [];
  let done = 0;
  await pool(md, IO, async (p) => {
    if (!S || S.gen !== gen) return;
    try {
      const st = await fs.promises.stat(path.join(S.root, p));
      const m = S.meta.get(p);
      if (!m || m.mtime !== st.mtimeMs || m.size !== st.size) changed.push(p);
    } catch { changed.push(p); }
    if (++done % 5000 === 0) progress('check', done, md.length);
  });
  if (!S || S.gen !== gen) return;
  progress('check', md.length, md.length);
  S.timing.verify = now() - t0;
  if (changed.length) {
    const res = await update(changed);
    if (res && S.gen === gen) parentPort.postMessage({ type: 'changed', result: res });
  }
}

function startSearchRebuild() { S.sidx = null; S.builder = new SI.Builder(); S.added = new Set(); S.later = new Set(); }

async function fillSearch(gen) {
  const t0 = now();
  if (S.sidx) {
    // an index that has drifted a lot (many edits since it was built) is rebuilt
    const drift = S.sidx.delta.size + S.sidx.stale.size;
    if (drift > Math.max(2000, S.meta.size * 0.03)) { S.builder = new SI.Builder(); S.added = new Set(); S.later = new Set(); }
    else { searchDone(gen, t0); return; }
  }
  const missing = [...S.meta.keys()].filter((p) => !S.added.has(p));
  let done = 0;
  await pool(missing, IO / 2, async (p) => {
    if (!S || S.gen !== gen || !S.builder || S.added.has(p)) return;
    try { const text = await fs.promises.readFile(path.join(S.root, p), 'utf8'); if (!S.added.has(p)) { S.added.add(p); S.builder.add(p, text); } } catch { /* ignore */ }
    if (++done % 2000 === 0) progress('search-index', done, missing.length);
  });
  if (!S || S.gen !== gen || !S.builder) return;
  const ix = S.builder.finish();
  const redo = [...S.later];
  S.builder = null; S.added = null; S.later = null;
  S.sidx = ix;
  // notes edited while the index was being built
  for (const p of redo) { try { ix.update(p, await fs.promises.readFile(path.join(S.root, p), 'utf8')); } catch { ix.update(p, null); } }
  saveSearch(1000);
  searchDone(gen, t0);
}
function searchDone(gen, t0) {
  if (!S || S.gen !== gen) return;
  S.searchReady = true;
  S.timing.searchFill = now() - t0;
  progress('search-index', 1, 1);
  const ix = S.sidx;
  parentPort.postMessage({ type: 'search-ready', full: true, words: ix.words, mb: +(ix.bytes / 2 ** 20).toFixed(1), ms: S.timing.searchFill });
}

// ---------------- resolution ----------------
function resolveAll() {
  S.index = new Map();
  S.files.forEach((p, i) => S.index.set(p, i));
  S.byBase = Core.buildByBase(S.files);
  const resolve = Core.makeResolver((p) => S.index.has(p), S.byBase);
  // The same link text written in the same folder always resolves the same
  // way, and a big library repeats its links a lot: memoise per folder.
  const memo = new Map();
  S.resolveIdx = (raw, from) => {
    const key = Core.dirOf(from) + '\u0000' + raw;
    let j = memo.get(key);
    if (j === undefined) {
      const r = resolve(raw, from);
      j = r && isMd(r) ? S.index.get(r) : -1;
      if (j === undefined) j = -1;
      memo.set(key, j);
    }
    return j;
  };
}

// Compact, transferable picture of the vault for the window.
function snapshot() {
  const files = S.files;
  const n = files.length;
  const mtimes = new Float64Array(n);
  const edges = [];
  const tagMap = new Map();
  for (let i = 0; i < n; i++) {
    const p = files[i];
    const m = S.meta.get(p);
    if (!m) continue;
    mtimes[i] = m.mtime;
    const start = edges.length;
    for (const raw of m.links) {
      const j = S.resolveIdx(raw, p);
      if (j < 0 || j === i) continue;
      let dup = false;
      for (let k = start + 1; k < edges.length; k += 2) if (edges[k] === j) { dup = true; break; }
      if (!dup) edges.push(i, j);
    }
    for (const t of m.tags) {
      const k = t.toLowerCase();
      let arr = tagMap.get(k);
      if (!arr) tagMap.set(k, (arr = []));
      arr.push(i);
    }
  }
  const tagNames = [...tagMap.keys()];
  const tagOff = new Uint32Array(tagNames.length + 1);
  let total = 0;
  tagNames.forEach((t, k) => { tagOff[k] = total; total += tagMap.get(t).length; });
  tagOff[tagNames.length] = total;
  const tagFiles = new Uint32Array(total);
  tagNames.forEach((t, k) => tagFiles.set(tagMap.get(t), tagOff[k]));
  S.snap = {
    root: S.root, name: S.name, files, mtimes, edges: Uint32Array.from(edges),
    tagNames, tagOff, tagFiles, truncated: files.length >= MAX_FILES, timing: S.timing,
  };
  return S.snap;
}

// ---------------- incremental updates ----------------
async function update(changed) {
  if (!S) return null;
  const gen = S.gen;
  let setChanged = false;
  const touched = [];
  const others = [];   // existing files that are not notes (canvas, pictures)
  await pool([...new Set(changed)], IO, async (p) => {
    const abs = path.join(S.root, p);
    let st = null;
    try { st = await fs.promises.stat(abs); } catch { /* deleted */ }
    if (S.gen !== gen) return;
    if (!st) {
      // a deleted file, or a deleted folder (drop everything below it)
      const pre = p + '/';
      const gone = S.files.filter((f) => f === p || f.startsWith(pre));
      if (gone.length) {
        const g = new Set(gone);
        S.files = S.files.filter((f) => !g.has(f));
        gone.forEach((f) => { S.meta.delete(f); if (S.sidx) S.sidx.update(f, null); else if (S.added) S.added.delete(f); touched.push(f); });
        setChanged = true;
      }
      return;
    }
    if (st.isDirectory()) {
      // a new or renamed folder: pick up whatever is inside it
      const inner = (await walk(abs)).map((f) => p + '/' + f);
      const have = new Set(S.files);
      for (const f of inner) {
        if (have.has(f)) continue;
        S.files.push(f); setChanged = true;
        if (isMd(f)) { try { await readNote(f); touched.push(f); } catch { /* ignore */ } }
      }
      return;
    }
    if (!S.index.has(p)) { S.files.push(p); setChanged = true; }
    else if (!isMd(p)) { others.push(p); return; } // a canvas or picture was rewritten
    if (isMd(p)) {
      const m = S.meta.get(p);
      if (m && m.mtime === st.mtimeMs && m.size === st.size) return;
      try { await readNote(p); touched.push(p); } catch { /* locked while syncing — next event retries */ }
    }
  });
  if (S.gen !== gen) return null;
  if (!touched.length && !setChanged) {
    // only non-note files changed: the index is the same, just say which files
    return others.length ? { snapshot: null, changed: others } : null;
  }
  if (setChanged) { S.files.sort(); resolveAll(); }
  // a big batch of edits (e.g. a sync) → rebuild the search index instead of growing its delta
  if (S.sidx && S.searchReady && S.sidx.delta.size > Math.max(5000, S.meta.size * 0.05)) { startSearchRebuild(); S.searchReady = false; fillSearch(gen).catch(logError); }
  saveCache(10000);
  return { snapshot: snapshot(), changed: touched.concat(others) };
}

// ---------------- search ----------------
// Candidates come from the word index; snippets are read from the files.
async function search(q, limit) {
  if (!S) return { total: 0, hits: [] };
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { total: 0, hits: [] };
  if (!S.sidx) return { total: 0, hits: [], partial: true, indexed: S.added ? S.added.size : 0, notes: S.meta.size };
  const found = [];
  for (const p of S.sidx.query(q)) {
    if (!S.meta.has(p)) continue; // deleted since
    const st = Core.stem(p).toLowerCase();
    found.push({ p, score: terms.some((t) => st.includes(t) || SI.fold(st).includes(t)) ? 0 : 1 });
  }
  found.sort((a, b) => a.score - b.score || Core.stem(a.p).localeCompare(Core.stem(b.p)));
  const top = found.slice(0, limit);
  const ft = SI.fold(terms[0]);
  await pool(top, IO, async (h) => {
    try {
      const text = await fs.promises.readFile(path.join(S.root, h.p), 'utf8');
      const low = text.toLowerCase();
      let i = low.indexOf(terms[0]);
      if (i < 0) i = SI.fold(low).indexOf(ft); // typed without diacritics
      h.s = i < 0 ? '' : text.slice(Math.max(0, i - 50), i + 110).replace(/\s+/g, ' ');
    } catch { h.s = ''; }
  });
  return { total: found.length, hits: top.map(({ p, s }) => ({ p, s })), partial: false, indexed: S.meta.size, notes: S.meta.size };
}

// ---------------- Dataview queries ----------------
// Runs a ```dataview block over the whole index; the window only formats.
const DV_MAX_ROWS = 2000;
function dvAdjacency() {
  if (S.dvAdj && S.dvAdj.snap === S.snap) return S.dvAdj;
  const n = S.files.length, e = S.snap.edges;
  const out = Array.from({ length: n }, () => []), inn = Array.from({ length: n }, () => []);
  for (let k = 0; k < e.length; k += 2) { out[e[k]].push(e[k + 1]); inn[e[k + 1]].push(e[k]); }
  S.dvAdj = { snap: S.snap, out, inn };
  return S.dvAdj;
}
function dvQuery(src, origin) {
  const t0 = now();
  const q = DQL.parse(src);
  const notes = S.files.filter(isMd);
  const link = (p) => ({ t: 'link', path: p, display: Core.stem(p) });
  function linkOf(text, from) {
    const inner = String(text).replace(/^!?\[\[|\]\]$/g, '');
    const bar = inner.indexOf('|');
    const target = (bar < 0 ? inner : inner.slice(0, bar)).split('#')[0];
    const alias = bar < 0 ? null : inner.slice(bar + 1);
    const j = S.resolveIdx ? S.resolveIdx(target, from || '') : -1;
    const p = j >= 0 ? S.files[j] : target;
    return { t: 'link', path: p, display: alias || Core.stem(p) };
  }
  const fileObj = (p) => {
    const m = S.meta.get(p) || {};
    const i = S.index.get(p);
    const day = /(\d{4}-\d{2}-\d{2})/.exec(Core.stem(p));
    return {
      name: Core.stem(p), path: p, folder: Core.dirOf(p), ext: path.extname(p).slice(1), link: link(p),
      mtime: { t: 'date', ms: m.mtime || 0, time: true }, ctime: { t: 'date', ms: m.ctime || m.mtime || 0, time: true },
      mday: { t: 'date', ms: new Date(m.mtime || 0).setHours(0, 0, 0, 0), time: false },
      cday: { t: 'date', ms: new Date(m.ctime || m.mtime || 0).setHours(0, 0, 0, 0), time: false },
      size: m.size || 0, tags: (m.tags || []).map((t) => '#' + t), etags: (m.tags || []).map((t) => '#' + t),
      day: day ? DQL.parseDate(day[1]) : null, frontmatter: m.fields || {},
      tasks: (m.tasks || []).map((_, k) => taskRow(p, k)),
      get outlinks() { return i === undefined ? [] : dvAdjacency().out[i].map((j) => link(S.files[j])); },
      get inlinks() { return i === undefined ? [] : dvAdjacency().inn[i].map((j) => link(S.files[j])); },
    };
  };
  const pageRow = (p) => ({ __page: true, p });
  // a task row: the k-th task line of note p (see Core.parseTasks)
  const taskRow = (p, k) => ({ __task: true, p, k });
  const TASK_EMOJI = { due: '📅', scheduled: '⏳', start: '🛫', completion: '✅', created: '➕' };
  function taskInfo(row) {
    if (row.info) return row.info;
    const all = (S.meta.get(row.p) || {}).tasks || [];
    const [line, status, text, indent] = all[row.k];
    const fields = {};
    for (const m of text.matchAll(/[[(]([^\s:[\]()`][^:[\]()`\n]*?)::[ \t]*([^\])\n]*)[\])]/g)) fields[m[1].trim()] = m[2].trim();
    for (const [name, e] of Object.entries(TASK_EMOJI)) {
      if (fields[name] != null) continue;
      const m = new RegExp(e + '\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})').exec(text);
      if (m) fields[name] = m[1];
    }
    const children = [];
    for (let j = row.k + 1; j < all.length && all[j][3] > indent; j++) if (children.length === 0 || all[j][3] <= all[children[0]][3]) children.push(j);
    row.info = { line, status, text, indent, fields, children, all };
    return row.info;
  }
  function taskField(row, name) {
    const t = taskInfo(row);
    const done = (s) => s === 'x' || s === 'X';
    switch (name) {
      case 'text': return t.text;
      case 'status': return t.status;
      case 'completed': return done(t.status);
      case 'checked': return t.status !== ' ';
      case 'fullyCompleted': { const all = (k) => done(t.all[k][1]) && taskInfo(taskRow(row.p, k)).children.every(all); return all(row.k); }
      case 'line': return t.line;
      case 'path': return row.p;
      case 'task': return true;
      case 'link': return link(row.p);
      case 'file': return fileObj(row.p);
      case 'children': case 'subtasks': return t.children.map((k) => taskRow(row.p, k));
      case 'tags': return [...t.text.matchAll(Core.TAG_RE)].map((m) => '#' + m[2]);
      case 'outlinks': return [...t.text.matchAll(/\[\[([^[\]\n]+?)\]\]/g)].map((m) => linkOf(m[1], row.p));
    }
    const own = field(t.fields, name);
    if (own !== undefined) return DQL.fromRaw(own, (x) => linkOf(x, row.p));
    if (name in TASK_EMOJI) return null; // a task's dates come only from its own line
    return get(pageRow(row.p), name); // other fields: the note's
  }
  const taskOut = (row) => { const t = taskInfo(row); return { path: row.p, line: t.line, status: t.status, text: t.text, indent: t.indent }; };
  function field(fields, name) {
    if (!fields) return undefined;
    if (name in fields) return fields[name];
    const low = name.toLowerCase();
    for (const k in fields) if (k.toLowerCase() === low || DQL.sanitise(k) === low) return fields[k];
    return undefined;
  }
  function get(row, name) {
    if (row == null) return null;
    if (row.__group) return name === 'rows' ? row.rows : name === 'key' ? row.key : (name in row ? row[name] : null);
    if (row.__flat) return name === row.name ? row.value : get(row.base, name);
    if (row.__task) return taskField(row, name);
    if (row.__page) {
      if (name === 'file') return fileObj(row.p);
      const raw = field((S.meta.get(row.p) || {}).fields, name);
      return raw === undefined ? null : DQL.fromRaw(raw, (t) => linkOf(t, row.p));
    }
    if (typeof row === 'object') { const v = row[name]; return v === undefined ? null : v; }
    return null;
  }
  // FROM: folders, #tags, [[links]] combined with AND / OR / -
  function from(src) {
    if (!src) return notes;
    if (src.or) { const a = new Set(from(src.or[0])); for (const p of from(src.or[1])) a.add(p); return [...a]; }
    if (src.and) { const b = new Set(from(src.and[1])); return from(src.and[0]).filter((p) => b.has(p)); }
    if (src.not) { const x = new Set(from(src.not)); return notes.filter((p) => !x.has(p)); }
    if (src.folder != null) {
      const f = src.folder.replace(/^\/+|\/+$/g, '');
      if (!f) return notes;
      const fl = f.toLowerCase(), pre = fl + '/';
      return notes.filter((p) => { const pl = p.toLowerCase(); return pl.startsWith(pre) || pl === fl + '.md' || pl === fl; });
    }
    if (src.tag) {
      const tg = src.tag.toLowerCase();
      return notes.filter((p) => ((S.meta.get(p) || {}).tags || []).some((t) => { const tl = t.toLowerCase(); return tl === tg || tl.startsWith(tg + '/'); }));
    }
    const target = linkOf(src.linksTo || src.linkedFrom, origin).path;
    const i = S.index.get(target);
    if (i === undefined) return [];
    const adj = dvAdjacency();
    return (src.linksTo ? adj.inn[i] : adj.out[i]).map((j) => S.files[j]).filter(isMd);
  }
  const res = DQL.run(q, {
    rows: (src) => (q.type === 'TASK' ? from(src).flatMap((p) => ((S.meta.get(p) || {}).tasks || []).map((_, k) => taskRow(p, k))) : from(src).map(pageRow)),
    taskOut,
    get,
    page: (p) => (S.meta.has(p) ? pageRow(p) : null),
    linkOf: (t) => linkOf(t, origin),
    idOf: (row) => link(row.p),
    thisRow: origin && S.meta.has(origin) ? pageRow(origin) : null,
    now: Date.now(),
  });
  // only plain values cross to the window
  const plain = (v) => {
    if (v == null) return null;
    if (Array.isArray(v)) return v.map(plain);
    if (typeof v === 'object') {
      if (v.t) return { t: v.t, ms: v.ms, time: v.time, path: v.path, display: v.display };
      if (v.__page) return link(v.p);
      if (v.__task) return taskInfo(v).text;
      if (v.__group) return plain(v.key);
      const o = {};
      for (const k of Object.keys(v)) { if (k === 'outlinks' || k === 'inlinks') continue; o[k] = plain(v[k]); }
      return o;
    }
    return v;
  };
  if (res.type === 'TASK') {
    // at most DV_MAX_ROWS tasks cross to the window
    let left = DV_MAX_ROWS;
    res.groups = res.groups.map((gr) => { const tasks = gr.tasks.slice(0, Math.max(0, left)); left -= tasks.length; return { key: plain(gr.key), tasks }; }).filter((gr) => gr.tasks.length);
    res.truncated = res.total > DV_MAX_ROWS;
    res.ms = now() - t0;
    return res;
  }
  if (res.type === 'CALENDAR') { res.days = res.days.map((d) => ({ ms: d.ms, n: d.n, items: d.items.map(plain) })); res.ms = now() - t0; return res; }
  res.truncated = res.rows.length > DV_MAX_ROWS;
  res.rows = res.rows.slice(0, DV_MAX_ROWS).map((r) => r.map(plain));
  res.ms = now() - t0;
  return res;
}

// First line in each source note that mentions the target (for backlinks).
async function snippets(target, sources) {
  const names = [Core.stem(target).toLowerCase(), target.toLowerCase()];
  const out = {};
  await pool(sources, IO, async (src) => {
    try {
      const text = await fs.promises.readFile(path.join(S.root, src), 'utf8');
      const line = text.split('\n').find((l) => { const ll = l.toLowerCase(); return names.some((n) => ll.includes(n)); });
      out[src] = line ? line.trim().slice(0, 160) : '';
    } catch { out[src] = ''; }
  });
  return out;
}

// ---------------- message loop ----------------
const handlers = {
  open: ({ root, exclude }) => { EXCLUDE = exclude || []; return open(root); },
  update: ({ changed }) => update(changed),
  search: ({ q, limit }) => (S ? search(q, limit || 300) : { total: 0, hits: [], partial: true, indexed: 0, notes: 0 }),
  snippets: ({ target, sources }) => (S ? snippets(target, sources) : {}),
  dv: ({ q, origin }) => {
    if (!S || !S.snap) return { error: 'The folder is still loading — the query runs as soon as it is ready.', loading: true };
    try { return dvQuery(q, origin); } catch (e) { return { error: e.message }; }
  },
  flush: () => { saveCache(); saveSearch(); return true; },
  mem: () => { if (global.gc) global.gc(); const h = v8.getHeapStatistics(); return `${(h.used_heap_size / 2 ** 20).toFixed(0)} MB used`; },
};
parentPort.on('message', async (msg) => {
  const { id, cmd, args } = msg;
  try {
    const result = await handlers[cmd](args || {});
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({ id, error: e.message || String(e) });
  }
});
