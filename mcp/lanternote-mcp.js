#!/usr/bin/env node
// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — MCP server: lets an AI assistant (Claude Desktop, Claude Code,
// any MCP client) search, read, query and edit a notes folder through the same
// indexer the app uses. Speaks MCP over stdio (one JSON-RPC message per line).
//
//   node mcp/lanternote-mcp.js [--vault <folder>] [--read-only] [--only "A, B/C"]
//   (Claude Desktop extension) lanternote-x.y.z.mcpb, built by scripts/make-mcpb.js
//   (packaged app) ELECTRON_RUN_AS_NODE=1 "Lanternote.exe" "<app>\resources\app.asar\mcp\lanternote-mcp.js" …
//
// Without --vault the folder last opened in the app is used; Settings → AI
// connection decides whether the AI may write and which folders it sees. Writes keep the
// previous text as a recovery copy exactly where the app keeps them (the
// note's Versions button shows them) and are listed in mcp.log.
'use strict';
const { Worker } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const Core = require('../src/core.js');

const VERSION = (() => { try { return require('../package.json').version; } catch { return '0'; } })();
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const USER = process.env.LANTERNOTE_USER_DATA || path.join(process.env.APPDATA || path.join(require('os').homedir(), '.config'), 'Lanternote');
const settings = (() => { try { return JSON.parse(fs.readFileSync(path.join(USER, 'settings.json'), 'utf8')); } catch { return {}; } })();
const prefs = settings.prefs || {};
const ROOT = path.resolve(opt('--vault') || process.env.LANTERNOTE_VAULT || settings.lastVault || '.');
// LANTERNOTE_ALLOW_WRITE=true|false (set by the .mcpb bundle's "Let the AI edit notes"
// option) decides when present; otherwise the app's setting does. --read-only always wins.
const ENV_WRITE = process.env.LANTERNOTE_ALLOW_WRITE;
const WRITE = !args.includes('--read-only') && (ENV_WRITE ? ENV_WRITE === 'true' : prefs.mcpWrite !== false);
const ONLY = String(opt('--only') || prefs.mcpOnly || '').split(',').map((s) => s.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter(Boolean);
const EXCLUDE = String(prefs.exclude || '').split(',').map((s) => s.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase()).filter(Boolean);
const log = (...a) => process.stderr.write('[lanternote-mcp] ' + a.join(' ') + '\n'); // stdout is the protocol

// ---------------- the indexer (same worker as the app) ----------------
let seq = 0, snap = null, ready = null, searchReady = false;
const waits = new Map();
const worker = new Worker(path.join(__dirname, '..', 'indexer.js'), {
  workerData: { cacheDir: path.join(USER, 'index-cache') },
  resourceLimits: { maxOldGenerationSizeMb: 4096 },
});
worker.on('message', (m) => {
  if (m.type) { if (m.type === 'log') log('indexer:', m.message); if (m.type === 'search-ready') searchReady = true; return; }
  const w = waits.get(m.id); if (!w) return;
  waits.delete(m.id);
  if (m.error) w.rej(new Error(m.error)); else w.res(m.result);
});
worker.on('error', (e) => log('indexer crashed:', e && e.stack || e));
const ask = (cmd, a) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); worker.postMessage({ id, cmd, args: a }); });

let files = [], idx = new Map(), resolve = () => null, outOf = null, inOf = null;
function take(s) {
  if (!s) return;
  snap = s; files = s.files; idx = new Map(files.map((f, i) => [f, i]));
  resolve = Core.makeResolver((p) => idx.has(p), Core.buildByBase(files));
  outOf = inOf = null; // adjacency is built on first use
}
function adjacency() {
  if (outOf) return;
  outOf = Array.from({ length: files.length }, () => []); inOf = Array.from({ length: files.length }, () => []);
  const e = snap.edges;
  for (let k = 0; k < e.length; k += 2) { outOf[e[k]].push(e[k + 1]); inOf[e[k + 1]].push(e[k]); }
}
ready = (async () => {
  if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) throw new Error('Notes folder not found: ' + ROOT + ' — pass --vault <folder>');
  take(await ask('open', { root: ROOT, exclude: EXCLUDE }));
  log(`${snap.name}: ${files.length} files, write ${WRITE ? 'on' : 'off'}${ONLY.length ? ', only ' + ONLY.join(', ') : ''}`);
  watch();
})();
ready.catch((e) => log(e.message));

// edits made anywhere (the app, OneDrive, another editor) reach the index
function watch() {
  let timer = null; const changed = new Set();
  try {
    fs.watch(ROOT, { recursive: true }, (_e, f) => {
      if (!f) return;
      const p = String(f).replace(/\\/g, '/');
      if (p.split('/').some((s) => s.startsWith('.') || s === 'node_modules')) return;
      changed.add(p); clearTimeout(timer);
      timer = setTimeout(() => refresh().catch(() => {}), 700);
    });
  } catch (e) { log('file watching unavailable:', e.message); }
  async function refresh() { const list = [...changed]; changed.clear(); const r = await ask('update', { changed: list }); if (r && r.snapshot) take(r.snapshot); }
}
async function reindex(rels) { const r = await ask('update', { changed: rels }); if (r && r.snapshot) take(r.snapshot); }

// ---------------- paths ----------------
const isMd = (p) => /\.(md|markdown)$/i.test(p);
const allowed = (p) => {
  const pl = p.toLowerCase();
  if (EXCLUDE.some((x) => pl === x || pl.startsWith(x + '/'))) return false;
  return !ONLY.length || ONLY.some((o) => p === o || p.startsWith(o + '/') || p === o + '.md');
};
const visible = (p) => allowed(p);
// a note given as a path or a name ("Project Alpha", "03-Du-An/Alpha.md")
function noteOf(ref) {
  if (!ref) throw new Error('Give the note as a path or a name.');
  const clean = String(ref).trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\[\[|\]\]$/g, '').split('|')[0];
  const p = resolve(clean, '') || (idx.has(clean + '.md') ? clean + '.md' : null);
  if (!p || !isMd(p) || !visible(p)) throw new Error(`Note not found: "${ref}". Use find_notes or search to get its path.`);
  return p;
}
// a path to write: inside the folder, a Markdown file, allowed by --only
function writable(rel) {
  if (!WRITE) throw new Error('This server is read-only (started with --read-only).');
  let p = String(rel || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p) throw new Error('A path is needed, e.g. "Inbox/Idea.md".');
  if (!isMd(p)) p += '.md';
  const abs = path.resolve(ROOT, p), r = path.relative(ROOT, abs);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) throw new Error('Not inside the notes folder: ' + rel);
  p = r.replace(/\\/g, '/');
  if (p.split('/').some((s) => s.startsWith('.'))) throw new Error('Hidden folders are not written to.');
  if (!allowed(p)) throw new Error('Outside the folders this server may use: ' + p);
  return { p, abs };
}

// ---------------- writing, with recovery copies like the app ----------------
function snapDir(rel) {
  return path.join(USER, 'recovery', crypto.createHash('sha1').update(ROOT.toLowerCase()).digest('hex').slice(0, 12), crypto.createHash('sha1').update(rel).digest('hex').slice(0, 16));
}
async function keepCopy(rel, oldText) {
  const dir = snapDir(rel);
  await fs.promises.mkdir(dir, { recursive: true });
  const keep = (prefs.recoveryDays ?? 14) * 864e5, now = Date.now();
  for (const f of (await fs.promises.readdir(dir)).filter((x) => x.endsWith('.md'))) if (now - +f.slice(0, 13) > keep) await fs.promises.rm(path.join(dir, f), { force: true });
  let t = now; while (fs.existsSync(path.join(dir, `${t}.md`))) t++;
  await fs.promises.writeFile(path.join(dir, `${t}.md`), oldText);
  await fs.promises.writeFile(path.join(dir, 'path.txt'), rel);
}
async function writeNote(rel, abs, text, { create = false } = {}) {
  let old = null;
  try { old = await fs.promises.readFile(abs, 'utf8'); } catch { /* new note */ }
  if (create && old != null) throw new Error(`"${rel}" already exists — use append_to_note or replace_in_note, or pass overwrite: true.`);
  if (old != null && old !== text) await keepCopy(rel, old);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  const tmp = path.join(path.dirname(abs), '.' + path.basename(abs) + '.' + process.pid + '.tmp');
  await fs.promises.writeFile(tmp, text);
  try { await fs.promises.rename(tmp, abs); } catch (e) { await fs.promises.rm(tmp, { force: true }); throw e; }
  fs.promises.appendFile(path.join(USER, 'mcp.log'), `${new Date().toISOString()} ${old == null ? 'created' : 'changed'} ${rel}\n`).catch(() => {});
  await reindex([rel]);
  return old;
}
const readText = (p) => fs.promises.readFile(path.join(ROOT, p), 'utf8');
const eol = (t) => (t.includes('\r\n') ? '\r\n' : '\n');

// ---------------- values from queries, as plain JSON ----------------
function plain(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') {
    if (v.t === 'link') return v.path;
    if (v.t === 'date') { const d = new Date(v.ms); const p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` + (v.time ? ` ${p2(d.getHours())}:${p2(d.getMinutes())}` : ''); }
    if (v.t === 'dur') return Math.round(v.ms / 864e5 * 100) / 100 + ' days';
    const o = {}; for (const k of Object.keys(v)) o[k] = plain(v[k]); return o;
  }
  return v;
}
async function runQuery(dql, from) {
  const r = await ask('dv', { q: dql, origin: from || null });
  if (r.error) throw new Error('Query: ' + r.error);
  const keep = (p) => p == null || typeof p !== 'string' || !isMd(p) || visible(p);
  if (r.type === 'TASK') return { type: 'TASK', total: r.total, truncated: !!r.truncated, groups: r.groups.map((g) => ({ group: plain(g.key), tasks: g.tasks.filter((t) => visible(t.path)).map((t) => ({ path: t.path, line: t.line + 1, status: t.status, done: t.status === 'x' || t.status === 'X', text: t.text })) })).filter((g) => g.tasks.length) };
  if (r.type === 'CALENDAR') return { type: 'CALENDAR', total: r.total, days: r.days.map((d) => ({ date: plain({ t: 'date', ms: d.ms }), count: d.n, notes: d.items.map(plain).filter(keep) })) };
  const rows = r.rows.map((row) => row.map(plain)).filter((row) => keep(row[0]));
  return r.type === 'TABLE' ? { type: 'TABLE', total: r.total, truncated: !!r.truncated, headers: r.headers, rows } : { type: 'LIST', total: r.total, truncated: !!r.truncated, items: rows.map((x) => (x.length === 1 ? x[0] : x)) };
}
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// ---------------- checking a quotation against its source ----------------
// Markdown marks, table bars, typographic quotes and spacing do not count; letters,
// accents and numbers do. Numbers are compared as written ("1.5", "30-31-01", "12/05/2026").
const flatLine = (s) => s.normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)/, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/[*_`|~]|==/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const flat = (s) => s.split(/\r?\n/).map(flatLine).filter(Boolean).join(' ');
const numbersIn = (s) => (s.match(/\d+(?:[.,:/-]\d+)*%?/g) || []).map((n) => n.replace(/,(?=\d{3}\b)/g, ''));
const wordsIn = (s) => s.match(/[\p{L}\p{N}]+/gu) || [];
function checkQuote(text, quote, near) {
  const lines = text.split(/\r?\n/), fl = lines.map(flatLine);
  const qWords = wordsIn(flat(quote)), qNums = numbersIn(quote);
  if (!qWords.length) throw new Error('The quotation has no words to check.');
  // "exact" compares the words in order: punctuation and line breaks do not count
  const qSeq = ' ' + qWords.join(' ') + ' ', qSet = new Set(qWords);
  const lw = fl.map((l) => wordsIn(l).join(' '));
  // the lines to look in: all, or around the line the quotation is said to be on
  const lo = near ? Math.max(0, near - 1 - 5) : 0, hi = near ? Math.min(lines.length, near + 5) : lines.length;
  let best = null;
  for (let a = lo; a < hi && !(best && best.exact); a++) {
    if (!lw[a]) continue;
    let acc = ' ', n = 0; const have = new Set();
    for (let b = a; b < Math.min(hi, a + 40); b++) {
      if (!lw[b]) continue;
      acc += lw[b] + ' ';
      if (acc.includes(qSeq)) { best = { a, b, exact: true, cover: 1 }; break; }
      for (const x of lw[b].split(' ')) { n++; if (qSet.has(x)) have.add(x); }
      const cover = have.size / qSet.size;
      if (cover > 0 && (!best || cover > best.cover + 1e-9 || (Math.abs(cover - best.cover) < 1e-9 && b - a < best.b - best.a))) best = { a, b, exact: false, cover };
      if (n > qWords.length * 2 + 20 || cover === 1) break;
    }
  }
  // the quotation starts on the last line that still holds all of it
  if (best && best.exact) while (best.a < best.b && (' ' + lw.slice(best.a + 1, best.b + 1).filter(Boolean).join(' ') + ' ').includes(qSeq)) best.a++;
  const src = best ? lines.slice(best.a, best.b + 1).join('\n') : '';
  const srcNums = new Set(numbersIn(src)), have = new Set(wordsIn(flat(src)));
  const missingNums = qNums.filter((n) => !srcNums.has(n));
  const missingWords = [...new Set(qWords.filter((x) => !have.has(x)))];
  const verdict = best && best.exact ? 'exact' : best && best.cover >= 0.8 && !missingNums.length ? 'close' : 'not_supported';
  const out = { verdict, coverage: best ? Math.round(best.cover * 100) / 100 : 0, lines: best ? [best.a + 1, best.b + 1] : null, source: src };
  if (missingNums.length) out.numbers_not_in_source = missingNums;
  if (verdict !== 'exact' && missingWords.length) out.words_not_in_source = missingWords.slice(0, 30);
  if (near && verdict === 'not_supported') {
    const all = checkQuote(text, quote, 0);
    if (all.verdict !== 'not_supported') out.found_elsewhere = { verdict: all.verdict, lines: all.lines };
  }
  return out;
}

// ---------------- tools ----------------
const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const str = (d) => ({ type: 'string', description: d }), int = (d) => ({ type: 'integer', description: d }), bool = (d) => ({ type: 'boolean', description: d });
const note = str('The note: a path from the folder root ("Projects/Alpha.md") or just its name ("Alpha").');

const TOOLS = [
  { name: 'vault_info', description: 'Overview of the notes folder: name, number of notes and links, top folders, most used tags, whether writing is allowed. Call this first to learn the folder layout.', inputSchema: S({}), annotations: { readOnlyHint: true },
    run: async () => {
      const notes = files.filter((f) => isMd(f) && visible(f));
      const folders = new Map(); for (const f of notes) { const i = f.indexOf('/'); const d = i < 0 ? '(root)' : f.slice(0, i); folders.set(d, (folders.get(d) || 0) + 1); }
      const tags = snap.tagNames.map((t, k) => [t, snap.tagOff[k + 1] - snap.tagOff[k]]).sort((a, b) => b[1] - a[1]).slice(0, 30);
      return { folder: snap.name, notes: notes.length, links: snap.edges.length / 2, write: WRITE, only: ONLY.length ? ONLY : undefined, folders: [...folders].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, notes: n })), tags: tags.map(([t, n]) => ({ tag: '#' + t, notes: n })) };
    } },
  { name: 'search', description: 'Full-text search in every note (all words must appear; accents optional). Returns paths with a snippet.', inputSchema: S({ query: str('Words to find.'), limit: int('Maximum results (default 20, at most 100).') }, ['query']), annotations: { readOnlyHint: true },
    run: async ({ query, limit = 20 }) => {
      // right after opening a folder the text index may still be building: wait for it (up to 2 minutes)
      let r = await ask('search', { q: query, limit: Math.min(100, limit) * 3 });
      for (let t = 0; r.partial && t < 240; t++) { await new Promise((ok) => setTimeout(ok, 500)); if (searchReady || t % 10 === 9) r = await ask('search', { q: query, limit: Math.min(100, limit) * 3 }); } const hits = r.hits.filter((h) => visible(h.p)).slice(0, Math.min(100, limit)); return { total: r.total, partial: !!r.partial, hits: hits.map((h) => ({ path: h.p, snippet: h.s })) }; } },
  { name: 'find_notes', description: 'Find notes by name (not content). Words may be in any order; accents optional.', inputSchema: S({ name: str('Part of the note name.'), folder: str('Only inside this folder.'), limit: int('Maximum results (default 30).') }, ['name']), annotations: { readOnlyHint: true },
    run: async ({ name, folder, limit = 30 }) => {
      const words = fold(name).split(/\s+/).filter(Boolean), pre = folder ? folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') + '/' : '';
      const out = [];
      for (const f of files) { if (!isMd(f) || !visible(f) || (pre && !f.startsWith(pre))) continue; const s = fold(Core.stem(f)); if (words.every((w) => s.includes(w))) { out.push(f); if (out.length >= Math.min(200, limit)) break; } }
      return { notes: out };
    } },
  { name: 'read_note', description: 'Read a note (Markdown, with its front matter). Optionally only the part under one heading. Lines are numbered when with_line_numbers is true (useful before set_task).', inputSchema: S({ note, heading: str('Only this section (heading text).'), with_line_numbers: bool('Prefix each line with its number.') }, ['note']), annotations: { readOnlyHint: true },
    run: async ({ note: n, heading, with_line_numbers }) => {
      const p = noteOf(n); let text = await readText(p); let first = 1;
      if (heading) {
        const lines = text.split(/\r?\n/); const want = fold(heading).trim(); let s = -1, lvl = 0, e = lines.length;
        for (let i = 0; i < lines.length; i++) { const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]); if (!m) continue; if (s < 0 && fold(m[2]).trim() === want) { s = i; lvl = m[1].length; } else if (s >= 0 && m[1].length <= lvl) { e = i; break; } }
        if (s < 0) throw new Error(`Heading not found in ${p}: ${heading}`);
        text = lines.slice(s, e).join('\n'); first = s + 1;
      }
      if (with_line_numbers) text = text.split(/\r?\n/).map((l, i) => `${i + first}: ${l}`).join('\n');
      const i = idx.get(p); const mt = snap.mtimes[i];
      return { path: p, modified: mt ? new Date(mt).toISOString() : null, text };
    } },
  { name: 'verify_quote', description: 'Check that a quotation or a stated fact really is in a note before citing it. verdict: "exact" (the words are there, ignoring Markdown marks and spacing), "close" (at least 80% of the words and every number are in the matched lines — check the wording) or "not_supported". Numbers in the quotation that are not in the source are listed; always report them rather than citing.', inputSchema: S({ note, quote: str('The text as it will be quoted or stated.'), line: int('1-based line where the quotation is said to be (optional): only lines around it are checked, and a match elsewhere is reported.') }, ['note', 'quote']), annotations: { readOnlyHint: true },
    run: async ({ note: n, quote, line }) => { const p = noteOf(n); return { path: p, ...checkQuote(await readText(p), String(quote || ''), line > 0 ? line : 0) }; } },
  { name: 'links', description: 'Links of a note: the notes it links to and the notes that link to it (backlinks).', inputSchema: S({ note, limit: int('Maximum per list (default 100).') }, ['note']), annotations: { readOnlyHint: true },
    run: async ({ note: n, limit = 100 }) => { const p = noteOf(n); adjacency(); const i = idx.get(p); const names = (a) => a.map((j) => files[j]).filter(visible); const o = names(outOf[i]), b = names(inOf[i]); return { path: p, outgoing: o.slice(0, limit), outgoing_total: o.length, backlinks: b.slice(0, limit), backlinks_total: b.length }; } },
  { name: 'recent', description: 'Notes edited most recently.', inputSchema: S({ limit: int('How many (default 20).'), folder: str('Only inside this folder.') }), annotations: { readOnlyHint: true },
    run: async ({ limit = 20, folder }) => { const pre = folder ? folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') + '/' : ''; const all = []; files.forEach((f, i) => { if (isMd(f) && visible(f) && (!pre || f.startsWith(pre))) all.push([f, snap.mtimes[i]]); }); all.sort((a, b) => b[1] - a[1]); return { notes: all.slice(0, Math.min(200, limit)).map(([p, t]) => ({ path: p, modified: new Date(t).toISOString() })) }; } },
  { name: 'query', description: 'Run a Dataview-language query over all notes and get the result as JSON. TABLE f1, f2 FROM "folder" / #tag / [[link]] WHERE … SORT … GROUP BY … LIMIT n; LIST; TASK (task lines: text, status, completed, due, …); CALENDAR <date field>. Fields: front matter, inline key:: value, file.name, file.path, file.mtime, file.tags, file.tasks, … Functions: date(today), dur(7 days), contains, startswith, dateformat, length, … Task line numbers in the result are 1-based, as set_task expects.', inputSchema: S({ dql: str('The query, e.g. TABLE status, due FROM "Projects" WHERE status != "done" SORT due ASC'), from_note: str('Note used as "this" in the query (optional).') }, ['dql']), annotations: { readOnlyHint: true },
    run: async ({ dql, from_note }) => runQuery(dql, from_note ? noteOf(from_note) : null) },
  { name: 'list_tasks', description: 'Task lines (- [ ] …) across notes, grouped by note. Due dates come from the task line (📅 2026-10-01 or [due:: 2026-10-01]). Line numbers are 1-based, as set_task expects.', inputSchema: S({ status: { type: 'string', enum: ['open', 'done', 'all'], description: 'open (default), done or all.' }, from: str('A folder ("Projects") or a tag ("#urgent").'), due_within_days: int('Only tasks due within this many days (overdue ones included).'), text: str('Only tasks whose text contains this.'), limit: int('Maximum tasks (default 100).') }), annotations: { readOnlyHint: true },
    run: async ({ status = 'open', from, due_within_days, text, limit = 100 }) => {
      const w = [];
      if (status === 'open') w.push('!completed AND status != "-"'); else if (status === 'done') w.push('completed');
      if (due_within_days != null) w.push(`due AND due <= date(today) + dur(${Math.max(0, +due_within_days)} days)`);
      if (text) w.push(`contains(lower(text), ${JSON.stringify(String(text).toLowerCase())})`);
      const src = from ? (from.startsWith('#') ? ' FROM ' + from : ' FROM ' + JSON.stringify(from.replace(/^\/+|\/+$/g, ''))) : '';
      return runQuery(`TASK${src}${w.length ? ' WHERE ' + w.join(' AND ') : ''}${due_within_days != null ? ' SORT due ASC' : ''} LIMIT ${Math.min(2000, limit)}`);
    } },
  // ---- writing ----
  { name: 'create_note', description: 'Create a new note (Markdown). Folders are created as needed. Fails if the note exists unless overwrite is true (the old text is then kept as a recovery copy).', inputSchema: S({ path: str('Path from the folder root, e.g. "Inbox/Meeting 2026-10-01.md".'), content: str('The full Markdown text.'), overwrite: bool('Replace an existing note.') }, ['path', 'content']), annotations: { readOnlyHint: false, destructiveHint: false },
    run: async ({ path: rel, content, overwrite }) => { const { p, abs } = writable(rel); const old = await writeNote(p, abs, content, { create: !overwrite }); return { path: p, created: old == null, replaced: old != null }; } },
  { name: 'append_to_note', description: 'Add text to the end of a note, or to the end of the section under a heading (the heading is created if missing).', inputSchema: S({ note, content: str('Markdown to add.'), heading: str('Add under this heading instead of at the end.') }, ['note', 'content']), annotations: { readOnlyHint: false, destructiveHint: false },
    run: async ({ note: n, content, heading }) => {
      const p = noteOf(n); const { abs } = writable(p); const old = await readText(p); const nl = eol(old);
      const add = String(content).replace(/\r?\n/g, nl).replace(/\s+$/, '');
      let text;
      if (!heading) text = old.replace(/\s*$/, '') + nl + nl + add + nl;
      else {
        const lines = old.split(/\r?\n/); const want = fold(heading).trim(); let s = -1, lvl = 0, e = lines.length;
        for (let i = 0; i < lines.length; i++) { const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]); if (!m) continue; if (s < 0 && fold(m[2]).trim() === want) { s = i; lvl = m[1].length; } else if (s >= 0 && m[1].length <= lvl) { e = i; break; } }
        if (s < 0) text = old.replace(/\s*$/, '') + nl + nl + '## ' + heading + nl + add + nl;
        else { let end = e; while (end > s + 1 && !lines[end - 1].trim()) end--; lines.splice(end, 0, add); text = lines.join(nl); }
      }
      await writeNote(p, abs, text);
      return { path: p, appended: true };
    } },
  { name: 'replace_in_note', description: 'Replace an exact piece of text in a note. The text must occur exactly once (add surrounding words to make it unique), unless all is true.', inputSchema: S({ note, find: str('Exact text to replace.'), replace: str('New text.'), all: bool('Replace every occurrence.') }, ['note', 'find', 'replace']), annotations: { readOnlyHint: false, destructiveHint: true },
    run: async ({ note: n, find, replace, all }) => {
      const p = noteOf(n); const { abs } = writable(p); const old = await readText(p);
      const count = old.split(find).length - 1;
      if (!find || count === 0) throw new Error(`Text not found in ${p}. Read the note first; the match is exact (spaces and line breaks count).`);
      if (count > 1 && !all) throw new Error(`The text occurs ${count} times in ${p}; add surrounding words to make it unique, or pass all: true.`);
      await writeNote(p, abs, all ? old.split(find).join(replace) : old.replace(find, () => replace));
      return { path: p, replaced: all ? count : 1 };
    } },
  { name: 'set_task', description: 'Tick or untick a task line (- [ ] ↔ - [x]). Give the 1-based line number from list_tasks, query or read_note, and part of the task text as a check.', inputSchema: S({ note, line: int('1-based line number of the task.'), done: bool('true = [x], false = [ ].'), text: str('Part of the task text, to make sure the right line is changed.') }, ['note', 'line', 'done']), annotations: { readOnlyHint: false, destructiveHint: false },
    run: async ({ note: n, line, done, text }) => {
      const p = noteOf(n); const { abs } = writable(p); const old = await readText(p); const nl = eol(old); const lines = old.split(/\r?\n/);
      const i = line - 1; const m = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+\[)(.)(\])(.*)$/.exec(lines[i] || '');
      if (!m) throw new Error(`Line ${line} of ${p} is not a task: ${JSON.stringify(lines[i] ?? '')}`);
      if (text && !fold(m[4]).includes(fold(text))) throw new Error(`Line ${line} of ${p} is a different task: ${JSON.stringify(m[4].trim())}. Get fresh line numbers with list_tasks.`);
      lines[i] = m[1] + (done ? 'x' : ' ') + m[3] + m[4];
      if (lines.join(nl) !== old) await writeNote(p, abs, lines.join(nl));
      return { path: p, line, done, task: m[4].trim() };
    } },
  { name: 'set_property', description: 'Set (or remove, with value null) a front-matter property of a note, e.g. status: done. Lists are written as [a, b].', inputSchema: S({ note, key: str('Property name.'), value: { type: ['string', 'number', 'boolean', 'array', 'null'], items: { type: 'string' }, description: 'New value; null removes the property.' } }, ['note', 'key', 'value']), annotations: { readOnlyHint: false, destructiveHint: false },
    run: async ({ note: n, key, value }) => {
      const p = noteOf(n); const { abs } = writable(p); const old = await readText(p); const nl = eol(old);
      if (!/^[\p{L}\p{N}_ -]+$/u.test(key)) throw new Error('A property name uses letters, digits, spaces, _ and -.');
      const fmt = (v) => (Array.isArray(v) ? '[' + v.map((x) => (/[,:[\]#]/.test(x) ? JSON.stringify(x) : x)).join(', ') + ']' : typeof v === 'string' && (/^[\s[{>|*&!%@`'"#-]|:\s|\s#|^$/.test(v)) ? JSON.stringify(v) : String(v));
      const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(old);
      let text;
      if (!m) { if (value === null) return { path: p, unchanged: true }; text = `---${nl}${key}: ${fmt(value)}${nl}---${nl}` + old; }
      else {
        const lines = m[1].split(/\r?\n/); const re = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:');
        let at = lines.findIndex((l) => re.test(l)), end = at;
        if (at >= 0) { end = at + 1; while (end < lines.length && /^\s+-\s|^\s{2,}\S/.test(lines[end])) end++; } // a list written on the following lines
        if (value === null) { if (at < 0) return { path: p, unchanged: true }; lines.splice(at, end - at); }
        else if (at >= 0) lines.splice(at, end - at, `${key}: ${fmt(value)}`);
        else lines.push(`${key}: ${fmt(value)}`);
        text = `---${nl}${lines.join(nl)}${nl}---${m[2] || nl}` + old.slice(m[0].length);
      }
      await writeNote(p, abs, text);
      return { path: p, key, value };
    } },
];
const WRITERS = new Set(['create_note', 'append_to_note', 'replace_in_note', 'set_task', 'set_property']);
const listed = () => TOOLS.filter((t) => WRITE || !WRITERS.has(t.name)).map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }));

// ---------------- MCP over stdio ----------------
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const INSTRUCTIONS = `Lanternote: a folder of Markdown notes${WRITE ? ' you can read and edit' : ' (read-only)'}. Start with vault_info, then search / find_notes / query to locate notes and read_note to read them. Notes are named by their path from the folder root or by name. Links are [[Note name]]; tasks are "- [ ] text 📅 YYYY-MM-DD". ${WRITE ? 'Every change keeps the previous text as a recovery copy (the app\'s Versions button); prefer append_to_note / replace_in_note / set_task / set_property over rewriting a whole note. ' : ''}Answer with note paths so the user can open them.`;
async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notifications (initialized, cancelled…) need no answer
  try {
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: params && params.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'lanternote', title: 'Lanternote', version: VERSION }, instructions: INSTRUCTIONS } });
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: listed() } });
    if (method === 'tools/call') {
      const t = TOOLS.find((x) => x.name === params.name);
      if (!t || (!WRITE && WRITERS.has(t.name))) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Unknown tool: ' + params.name }], isError: true } });
      try {
        await ready;
        const out = await t.run(params.arguments || {});
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }] } });
      } catch (e) { return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: e.message }], isError: true } }); }
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });
  } catch (e) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } }); }
}
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => { if (!line.trim()) return; let m; try { m = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); } handle(m); });
rl.on('close', async () => { try { await ask('flush', {}); } catch {} process.exit(0); });
