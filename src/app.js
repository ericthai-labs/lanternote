// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — renderer. Everything the reader shows is built here from the
// vault snapshot the main process hands over (file list + note texts).
'use strict';

const g = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
const MD_EXT = /\.(md|markdown)$/i;
const CANVAS_EXT = /\.canvas$/i;
const vaultUrl = (p) => 'vault://v/' + p.split('/').map(encodeURIComponent).join('/');

// ---------------- state ----------------
// The window holds only the compact index the worker sends (paths, link
// arrays, tags) plus a small cache of note texts fetched on demand, so a
// 200,000-note vault costs tens of MB here instead of gigabytes.
const { baseOf, dirOf, stem, safeDecode, splitFm, linkTarget } = Core;
const V = {
  name: '', root: '', files: [], idx: new Map(), notes: [], mtimes: new Float64Array(0), edges: new Uint32Array(0),
  byBase: new Map(), resolve: () => null,
  outOff: new Uint32Array(1), outTo: new Uint32Array(0),  // CSR: note i links to outTo[outOff[i]..outOff[i+1])
  backOff: new Uint32Array(1), backTo: new Uint32Array(0),
  tags: new Map(),    // lower-case tag → Uint32Array of file indices
  text: new Map(),    // LRU cache: path → note text
};
const TEXT_CACHE = 400;
let current = null;        // path of the note on screen
let hist = []; let hIdx = -1; // the active tab's history (panes.js)
const stack = [];          // render context stack (for embeds)
const ctx = () => stack[stack.length - 1] || { from: current, depth: 0 };
const isNote = (p) => p != null && V.idx.has(p) && MD_EXT.test(p);
const resolve = (raw, from) => V.resolve(raw, from);
const outLinks = (p) => { const i = V.idx.get(p); return i === undefined ? [] : [...V.outTo.subarray(V.outOff[i], V.outOff[i + 1])].map((j) => V.files[j]); };
const backLinks = (p) => { const i = V.idx.get(p); return i === undefined ? [] : [...V.backTo.subarray(V.backOff[i], V.backOff[i + 1])].map((j) => V.files[j]); };

// ---------------- note texts (fetched on demand) ----------------
function cacheText(p, t) {
  V.text.delete(p); V.text.set(p, t);
  if (V.text.size > TEXT_CACHE) V.text.delete(V.text.keys().next().value);
}
async function fetchText(p) {
  const t = V.text.get(p);
  if (t != null) { cacheText(p, t); return t; }
  const txt = await window.api.readNote(p);
  cacheText(p, txt);
  return txt;
}
// Load a note plus every note it embeds (3 levels deep) so rendering can stay synchronous.
async function ensureLoaded(p) {
  let level = [p];
  const seen = new Set();
  for (let depth = 0; depth <= 3 && level.length; depth++) {
    const texts = await Promise.all(level.map((q) => { seen.add(q); return fetchText(q).catch(() => null); }));
    const next = [];
    texts.forEach((t, k) => {
      if (t == null) return;
      for (const m of t.matchAll(/!\[\[([^[\]\n]+?)\]\]/g)) {
        const { file } = linkTarget(m[1]);
        const r = file ? resolve(file, level[k]) : null;
        if (r && isNote(r) && !seen.has(r)) { seen.add(r); next.push(r); }
      }
    });
    level = next.slice(0, 50);
  }
}

// ---------------- index ----------------
function buildIndex(d) {
  V.name = d.name; V.root = d.root || '';
  V.files = d.files; V.mtimes = d.mtimes;
  const n = V.files.length;
  V.idx = new Map();
  for (let i = 0; i < n; i++) V.idx.set(V.files[i], i);
  V.notes = V.files.filter((p) => MD_EXT.test(p));
  V.stemLc = V.notes.map((p) => stem(p).toLowerCase());
  V.images = V.files.filter((p) => IMG_EXT.test(p));
  V.canvases = V.files.filter((p) => CANVAS_EXT.test(p));
  V.imgLc = V.images.map((p) => baseOf(p).toLowerCase());
  V.byBase = Core.buildByBase(V.files);
  V.resolve = Core.makeResolver((p) => V.idx.has(p), V.byBase);
  // compressed adjacency, both directions
  const e = d.edges, m = e.length / 2;
  const csr = (from, to) => {
    const off = new Uint32Array(n + 1);
    for (let k = 0; k < m; k++) off[e[2 * k + from] + 1]++;
    for (let i = 0; i < n; i++) off[i + 1] += off[i];
    const pos = off.slice(0, n), arr = new Uint32Array(m);
    for (let k = 0; k < m; k++) arr[pos[e[2 * k + from]]++] = e[2 * k + to];
    return [off, arr];
  };
  [V.outOff, V.outTo] = csr(0, 1);
  [V.backOff, V.backTo] = csr(1, 0);
  V.edges = e;
  V.tags = new Map();
  d.tagNames.forEach((t, k) => V.tags.set(t, d.tagFiles.subarray(d.tagOff[k], d.tagOff[k + 1])));
}

// ---------------- markdown ----------------
const CALLOUTS = {
  note: ['blue', '✎'], info: ['blue', 'ℹ'], todo: ['blue', '☐'], abstract: ['cyan', '≡'], summary: ['cyan', '≡'], tldr: ['cyan', '≡'],
  tip: ['cyan', '✦'], hint: ['cyan', '✦'], important: ['cyan', '✦'], success: ['green', '✓'], check: ['green', '✓'], done: ['green', '✓'],
  question: ['orange', '?'], help: ['orange', '?'], faq: ['orange', '?'], warning: ['orange', '⚠'], caution: ['orange', '⚠'], attention: ['orange', '⚠'],
  failure: ['red', '✗'], fail: ['red', '✗'], missing: ['red', '✗'], danger: ['red', '⚡'], error: ['red', '⚡'], bug: ['red', '✱'],
  example: ['purple', '☰'], quote: ['grey', '❝'], cite: ['grey', '❝'],
};


function renderWiki(tok) {
  const inner = tok.inner.replace(/\\\|/g, '|');
  const bar = inner.indexOf('|');
  const alias = bar < 0 ? '' : inner.slice(bar + 1).trim();
  const { file, sub } = linkTarget(inner);
  const c = ctx();
  const p = file ? resolve(file, c.from) : c.from;
  const label = alias || (file ? baseOf(file).replace(MD_EXT, '') : '') + (sub ? (file ? ' › ' : '') + sub.replace(/^\^/, '') : '');

  if (tok.embed) {
    if (!p) return `<span class="unresolved-embed muted">![[${esc(inner)}]] — not found</span>`;
    if (IMG_EXT.test(p)) {
      const w = /^(\d+)(?:x(\d+))?$/.exec(alias);
      const size = w ? ` width="${w[1]}"${w[2] ? ` height="${w[2]}"` : ''}` : '';
      return `<img data-vault-src="${esc(p)}" alt="${esc(w ? baseOf(p) : alias || baseOf(p))}"${size}>`;
    }
    if (/\.(mp3|wav|ogg|m4a)$/i.test(p)) return `<audio controls data-vault-src="${esc(p)}"></audio>`;
    if (/\.(mp4|webm|mov)$/i.test(p)) return `<video controls data-vault-src="${esc(p)}"></video>`;
    if (MD_EXT.test(p) && V.text.has(p) && c.depth < 3 && !stack.some((s) => s.from === p)) {
      return `<div class="embed"><div class="embed-title"><a class="internal" data-path="${esc(p)}" data-sub="${esc(sub)}">${esc(stem(p))}${sub ? ' › ' + esc(sub) : ''}</a></div>${renderMarkdown(p, c.depth + 1, sub)}</div>`;
    }
    return `<a class="internal" data-path="${esc(p)}">${esc(label || baseOf(p))}</a>`;
  }
  if (!p) return `<a class="internal unresolved" data-missing="${esc(file)}" title="Note not found">${esc(label)}</a>`;
  return `<a class="internal" data-path="${esc(p)}" data-sub="${esc(sub)}" title="${esc(p)}">${esc(label || stem(p))}</a>`;
}

marked.use({
  gfm: true,
  breaks: true,
  extensions: [
    {
      name: 'wikilink', level: 'inline',
      start(src) { const i = src.indexOf('[['); if (i < 0) return; return i > 0 && src[i - 1] === '!' ? i - 1 : i; },
      tokenizer(src) {
        const m = /^(!?)\[\[([^[\]\n]+?)\]\]/.exec(src);
        if (m) return { type: 'wikilink', raw: m[0], embed: !!m[1], inner: m[2] };
      },
      renderer: renderWiki,
    },
    {
      name: 'highlight', level: 'inline',
      start(src) { const i = src.indexOf('=='); return i < 0 ? undefined : i; },
      tokenizer(src) {
        const m = /^==(?=\S)([^\n]*?\S)==/.exec(src);
        if (m) return { type: 'highlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(t) { return '<mark>' + this.parser.parseInline(t.tokens) + '</mark>'; },
    },
    {
      name: 'tag', level: 'inline',
      start(src) { const m = /(^|[\s(,;])#[^\s#]/u.exec(src); return m ? m.index + m[1].length : undefined; },
      tokenizer(src) {
        const m = /^#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/u.exec(src);
        if (m) return { type: 'tag', raw: m[0], tag: m[1] };
      },
      renderer(t) { return `<a class="tag" data-tag="${esc(t.tag)}">#${esc(t.tag)}</a>`; },
    },
    {
      // %% comments %% are hidden in reading view
      name: 'comment', level: 'inline',
      start(src) { const i = src.indexOf('%%'); return i < 0 ? undefined : i; },
      tokenizer(src) { const m = /^%%[\s\S]*?%%/.exec(src); if (m) return { type: 'comment', raw: m[0] }; },
      renderer() { return ''; },
    },
  ],
  renderer: {
    link(href, title, text) {
      const t = title ? ` title="${esc(title)}"` : '';
      if (!href) return text;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return `<a class="external" href="${esc(href)}"${t}>${text}</a>`;
      if (href.startsWith('#')) return `<a class="internal" data-path="${esc(ctx().from)}" data-sub="${esc(safeDecode(href.slice(1)))}"${t}>${text}</a>`;
      const [file, sub = ''] = href.split('#');
      const p = resolve(file, ctx().from);
      if (!p) return `<a class="internal unresolved" data-missing="${esc(safeDecode(file))}"${t}>${text}</a>`;
      return `<a class="internal" data-path="${esc(p)}" data-sub="${esc(safeDecode(sub))}"${t}>${text}</a>`;
    },
    image(href, title, text) {
      const t = title ? ` title="${esc(title)}"` : '';
      if (!href) return '';
      if (/^(https?:|data:)/i.test(href)) return `<img src="${esc(href)}" alt="${esc(text)}"${t}>`;
      const p = resolve(href, ctx().from);
      if (!p) return `<span class="muted">[image not found: ${esc(safeDecode(href))}]</span>`;
      return `<img data-vault-src="${esc(p)}" alt="${esc(text)}"${t}>`;
    },
  },
});

// Only the part of a note under one heading (for [[Note#Heading]] embeds).
function sectionOf(body, heading) {
  if (!heading || heading.startsWith('^')) {
    if (heading && heading.startsWith('^')) {
      const id = heading.slice(1);
      const line = body.split('\n').find((l) => new RegExp('\\s\\^' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$').test(l));
      if (line) return line.replace(/\s\^[\w-]+\s*$/, '');
    }
    return body;
  }
  const lines = body.split('\n');
  const want = slug(heading);
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
    if (!m) continue;
    if (start < 0 && slug(m[2]) === want) { start = i; level = m[1].length; continue; }
    if (start >= 0 && m[1].length <= level) return lines.slice(start, i).join('\n');
  }
  return start >= 0 ? lines.slice(start).join('\n') : body;
}

function renderMarkdown(p, depth = 0, sub = '') {
  const { fm, body } = splitFm(V.text.get(p) || '');
  stack.push({ from: p, depth });
  try {
    const src = sub ? sectionOf(body, sub) : body;
    const clean = src.replace(/\s\^[\w-]+[ \t]*$/gm, ''); // hide ^block-ids
    return (depth === 0 && fm ? renderProps(fm) : '') + marked.parse(clean);
  } finally {
    stack.pop();
  }
}

function renderProps(fm) {
  const keys = Object.keys(fm);
  if (!keys.length) return '';
  const val = (k, v) => {
    if (Array.isArray(v)) return v.map((x) => `<span class="chip">${/^tags?$/i.test(k) ? '#' : ''}${marked.parseInline(String(x))}</span>`).join('');
    return marked.parseInline(String(v));
  };
  return '<div class="props">' + keys.map((k) => `<div class="pr"><div class="k">${esc(k)}</div><div class="v">${val(k, fm[k])}</div></div>`).join('') + '</div>';
}

const slug = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');

// ---------------- showing a note ----------------
function sanitize(html) {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-path', 'data-sub', 'data-tag', 'data-missing', 'data-vault-src'] });
}

let openSeq = 0;
async function openCanvas(p, push) {
  await Ed.flush();
  Ed.hide();
  await leaveBoard();
  showView('note');
  if (p === current && CanvasView.active()) return;
  const my = ++openSeq;
  // lay the pane out first: the canvas fits its cards to the pane's size
  g('note').hidden = true; g('welcome').hidden = true;
  g('main').classList.add('canvas-mode');
  if (!(await CanvasView.open(p)) || my !== openSeq) { if (!CanvasView.active()) g('main').classList.remove('canvas-mode'); return; }
  current = p;
  if (push) { hist.splice(hIdx + 1); hist.push(p); hIdx = hist.length - 1; }
  document.title = baseOf(p).replace(CANVAS_EXT, '') + ' — Lanternote';
  g('outline').innerHTML = '<div class="muted small">Canvas</div>';
  renderSide();
  markTree(); updateNav(); Tabs.sync();
  window.api.setSetting('lastNote:' + V.name, p);
}
async function openBoard(p, push) {
  Ed.hide();
  g('note').hidden = true; g('welcome').hidden = true;
  g('main').classList.add('board-mode');
  if (!(await KanbanView.open(p))) { g('main').classList.remove('board-mode'); return; }
  current = p;
  if (push) { hist.splice(hIdx + 1); hist.push(p); hIdx = hist.length - 1; }
  document.title = stem(p) + ' — Lanternote';
  g('outline').innerHTML = '<div class="muted small">Board</div>';
  renderSide(); markTree(); updateNav(); Tabs.sync();
  window.api.setSetting('lastNote:' + V.name, p);
}
function leaveBoard() {
  if (!KanbanView.active()) return Promise.resolve();
  const f = KanbanView.flush();
  KanbanView.hide();
  g('main').classList.remove('board-mode');
  return f;
}
function leaveCanvas() {
  if (!CanvasView.active()) return Promise.resolve();
  const f = CanvasView.flush();
  CanvasView.hide();
  g('main').classList.remove('canvas-mode');
  return f;
}

async function openNote(p, sub = '', { push = true } = {}) {
  if (p && CANVAS_EXT.test(p) && V.idx.has(p)) { await openCanvas(p, push); return; }
  if (!isNote(p)) {
    if (p && V.idx.has(p) && IMG_EXT.test(p)) { Viewer.openFile(p); return; } // a picture → the image viewer
    if (p && V.idx.has(p)) { window.api.reveal(p); return; } // other files → show in Explorer
    toast('Note not found: ' + (p || ''));
    return;
  }
  showView('note');
  if (p === current && push) { if (sub) scrollToSub(sub); else g('main').scrollTop = 0; return; }
  const my = ++openSeq;
  await Ed.flush();
  await leaveCanvas();
  try { await ensureLoaded(p); } catch (e) { toast('Could not read the note: ' + e.message); return; }
  if (my !== openSeq) return; // a newer click won
  if (!V.text.has(p)) { toast('Could not read the note: ' + p); return; }
  if (KanbanView.isBoard(V.text.get(p)) && !KanbanView.raw.has(p)) { await openBoard(p, push); return; }
  await leaveBoard();
  current = p;
  if (push) { hist.splice(hIdx + 1); hist.push(p); hIdx = hist.length - 1; }
  const art = g('note');
  const dir = dirOf(p);
  const words = (V.text.get(p).match(/\S+/g) || []).length;
  const mt = V.mtimes[V.idx.get(p)];
  const mod = mt ? new Date(mt).toLocaleString() : '';
  art.innerHTML = sanitize(
    `<div class="crumbs"><span>${esc(dir ? dir.split('/').join(' / ') : V.name)}</span><span>${words.toLocaleString()} words</span>${mod ? `<span>Modified ${esc(mod)}</span>` : ''}<button class="link" data-reveal>Show in folder</button>${KanbanView.raw.has(p) ? '<button class="link" data-board>Board view</button>' : ''}</div>` +
    `<div class="inline-title">${esc(stem(p))}</div>` + renderMarkdown(p)
  );
  art.hidden = false;
  g('welcome').hidden = true;
  postProcess(art);
  g('main').scrollTop = 0;
  if (sub) scrollToSub(sub);
  document.title = stem(p) + ' — Lanternote';
  markTree();
  renderSide();
  updateNav(); Tabs.sync();
  window.api.setSetting('lastNote:' + V.name, p);
  if (Ed.mode === 'edit') { try { await Ed.show(p); } catch (e) { toast('Could not open for editing: ' + e.message); } }
  else Ed.hide();
  if (matchMedia('(max-width: 900px)').matches) g('layout').classList.remove('show-left', 'show-right');
}

function postProcess(root, origin = current) {
  // heading ids (top level only; embeds keep theirs out of the outline)
  const seen = {};
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    if (h.closest('.embed')) return;
    let id = slug(h.textContent) || 'h';
    if (seen[id] != null) id += '-' + ++seen[id]; else seen[id] = 0;
    h.id = id;
  });
  // attachments
  root.querySelectorAll('[data-vault-src]').forEach((el) => { el.src = vaultUrl(el.getAttribute('data-vault-src')); });
  // task lists
  let task = 0;
  root.querySelectorAll('li > input[type=checkbox]').forEach((cb) => {
    const li = cb.parentElement; li.classList.add('task'); if (cb.checked) li.classList.add('done');
    if (!cb.closest('.embed')) { cb.disabled = false; cb.dataset.task = task++; }
  });
  // callouts:  > [!type]± Title
  root.querySelectorAll('blockquote').forEach((bq) => {
    const p = bq.firstElementChild;
    if (!p || p.tagName !== 'P') return;
    const m = /^\s*\[!([\w-]+)\]([+-]?)[ \t]*([^\n<]*)(?:<br>\s*)?/i.exec(p.innerHTML);
    if (!m) return;
    const type = m[1].toLowerCase();
    const [color, icon] = CALLOUTS[type] || ['blue', '✎'];
    const box = document.createElement('div');
    box.className = 'callout' + (m[2] ? ' foldable' : '') + (m[2] === '-' ? ' folded' : '');
    box.dataset.c = color;
    const title = document.createElement('div');
    title.className = 'callout-title';
    title.innerHTML = `<span class="ico">${icon}</span><span>${m[3].trim() || esc(type[0].toUpperCase() + type.slice(1))}</span>`;
    const content = document.createElement('div');
    content.className = 'callout-content';
    p.innerHTML = p.innerHTML.slice(m[0].length);
    if (!p.innerHTML.trim()) p.remove();
    while (bq.firstChild) content.appendChild(bq.firstChild);
    box.append(title, content);
    bq.replaceWith(box);
  });
  // mermaid diagrams — the library is only loaded when a note uses it
  const blocks = root.querySelectorAll('pre > code.language-mermaid');
  if (blocks.length) {
    const nodes = [...blocks].map((code) => {
      const d = document.createElement('div'); d.className = 'mermaid'; d.textContent = code.textContent;
      code.parentElement.replaceWith(d); return d;
    });
    loadMermaid().then((m) => m.run({ nodes })).catch((e) => { console.error('Mermaid failed', e); toast('Could not draw a diagram: ' + e.message); });
  }
  // ```dataview blocks become live tables / lists
  DvView.mount(root, origin);
}

let mermaidP = null;
function loadMermaid() {
  if (!mermaidP) mermaidP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/mermaid.min.js';
    s.onload = () => { window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'default' }); res(window.mermaid); };
    s.onerror = () => rej(new Error('mermaid library missing'));
    document.head.appendChild(s);
  });
  return mermaidP;
}

function scrollToSub(sub) {
  if (sub.startsWith('^')) {
    const id = sub.slice(1);
    const raw = V.text.get(current) || '';
    const line = raw.split('\n').find((l) => l.trimEnd().endsWith('^' + id));
    if (line) {
      const text = line.replace(/\s\^[\w-]+\s*$/, '').replace(/[#>*_`[\]-]/g, '').trim().slice(0, 40);
      const el = [...g('note').querySelectorAll('p,li,td,blockquote')].find((e) => e.textContent.includes(text));
      if (el) { el.scrollIntoView({ block: 'center' }); flash(el); return; }
    }
  }
  const el = g(slug(sub));
  if (el) { el.scrollIntoView({ block: 'start' }); flash(el); } else toast('Heading not found: ' + sub);
}
function flash(el) { el.animate([{ background: 'var(--accent-bg)' }, { background: 'transparent' }], { duration: 1400 }); }

// ---------------- user guide / changelog ----------------
// Shown in the note area like a note, but they are not part of the vault.
const openGuide = () => openDoc('guide');
async function openDoc(kind) {
  let md;
  try { md = await window.api.doc(kind); } catch (e) { toast('Not found: ' + e.message); return; }
  await Ed.flush();
  Ed.hide();
  await leaveCanvas();
  await leaveBoard();
  showView('note');
  openSeq++; current = null;
  const art = g('note');
  stack.push({ from: null, depth: 1 }); // no note context: nothing resolves against the vault
  try { art.innerHTML = sanitize(`<div class="crumbs"><span>Lanternote</span><span>Help</span></div>` + marked.parse(md)); }
  finally { stack.pop(); }
  art.hidden = false;
  g('welcome').hidden = true;
  postProcess(art);
  g('main').scrollTop = 0;
  document.title = (kind === 'changelog' ? "What's new" : 'User guide') + ' — Lanternote';
  const hs = [...art.querySelectorAll('h1[id],h2[id],h3[id]')];
  g('outline').innerHTML = hs.map((h) => `<a data-h="${esc(h.id)}" style="padding-left:${(+h.tagName[1] - 1) * 12 + 4}px">${esc(h.textContent)}</a>`).join('');
  g('backlinks').innerHTML = g('outlinks').innerHTML = '<div class="muted small">—</div>';
  g('blCount').textContent = g('olCount').textContent = '';
  markTree();
  Tabs.sync(kind === 'changelog' ? "What's new" : 'User guide');
}

// ---------------- links from the editors (live preview) ----------------
// the address of a picture written in note `from`, or null if it is not one
function pictureUrl(src, from, wiki) {
  if (!src) return null;
  if (!wiki && /^(https?:|data:)/i.test(src)) return src;
  const file = wiki ? linkTarget(src).file : src.split('#')[0];
  const p = file ? resolve(file, from) : null;
  return p && IMG_EXT.test(p) ? vaultUrl(p) : null;
}
// a link clicked in pane `how.pane`: newTab (Ctrl), otherPane (Alt)
function followLink(link, from, how = {}) {
  let file, sub = '';
  if (link.href != null) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(link.href)) { window.api.openExternal(link.href); return; }
    const [f, s2 = ''] = link.href.split('#'); file = f; sub = safeDecode(s2);
  } else ({ file, sub } = linkTarget(link.target));
  const p = file ? resolve(file, from) : from;
  if (!p) { Ed.createFromLink(file); return; }
  openIn(p, sub, how);
}
function openIn(p, sub = '', { pane = 'main', newTab = false, otherPane = false } = {}) {
  const to = otherPane ? (pane === 'main' ? 'split' : 'main') : pane;
  if (to === 'split') return Split.open(p, sub, { newTab });
  if (newTab) return Tabs.openNew(p, sub);
  return openNote(p, sub);
}
const closeTab = () => (focusPane === 'split' && Split.visible ? Split.close() : Tabs.close());
const cycleTab = (step) => (focusPane === 'split' && Split.visible ? Split.cycle(step) : Tabs.cycle(step));

// ---------------- side panels ----------------
const SIDE_MAX = 500; // a hub note can have tens of thousands of backlinks
function renderSide() {
  const art = g('note');
  const hs = [...art.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')];
  if (KanbanView.active()) g('outline').innerHTML = KanbanView.board.lanes.map((l, i) => `<a data-kb-lane="${i}" style="padding-left:4px">${esc(l.title)} <span class="count">${l.cards.length}</span></a>`).join('') || '<div class="muted small">No lanes</div>';
  else if (!Ed.active() && !CanvasView.active()) g('outline').innerHTML = hs.length
    ? hs.map((h) => `<a data-h="${esc(h.id)}" style="padding-left:${(+h.tagName[1] - 1) * 12 + 4}px">${esc(h.textContent)}</a>`).join('')
    : '<div class="muted small">No headings</div>';
  const more = (n) => (n > SIDE_MAX ? `<div class="muted small">… and ${(n - SIDE_MAX).toLocaleString()} more</div>` : '');
  const bl = backLinks(current).sort((a, b) => stem(a).localeCompare(stem(b)));
  g('blCount').textContent = bl.length ? bl.length.toLocaleString() : '';
  g('backlinks').innerHTML = bl.length
    ? bl.slice(0, SIDE_MAX).map((s) => `<div class="bl" data-path="${esc(s)}"><div>${esc(stem(s))}</div><div class="s" data-snip="${esc(s)}"></div></div>`).join('') + more(bl.length)
    : '<div class="muted small">No notes link here</div>';
  const ol = outLinks(current).sort((a, b) => stem(a).localeCompare(stem(b)));
  g('olCount').textContent = ol.length ? ol.length.toLocaleString() : '';
  g('outlinks').innerHTML = ol.length
    ? ol.slice(0, SIDE_MAX).map((s) => `<div class="bl" data-path="${esc(s)}">${esc(stem(s))}</div>`).join('') + more(ol.length)
    : '<div class="muted small">No links</div>';
  // snippets are read from disk by the indexer, only for the first rows
  const target = current, first = bl.slice(0, 60);
  if (first.length) window.api.snippets(target, first).then((snips) => {
    if (current !== target) return;
    g('backlinks').querySelectorAll('[data-snip]').forEach((el) => { const v = snips[el.dataset.snip]; if (v) el.textContent = v; });
  }).catch(() => {});
  if (view === 'graph' && Graph.mode === 'local') Graph.show('local', current);
}

// ---------------- file tree ----------------
// Folders are drawn only when opened, and long folders in pages, so the
// DOM never holds more than a few thousand rows.
const openDirs = new Set();
const TREE_PAGE = 1000;
const treeMore = new Map(); // folder → rows shown
let T = null;              // folder tree built from the note list
const cmpName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
// what the file list shows: notes, and pictures unless turned off
const listed = () => V.notes.concat(V.canvases, Prefs.get('showImages') ? V.images : []);
const label = (p) => (MD_EXT.test(p) ? stem(p) : CANVAS_EXT.test(p) ? baseOf(p).replace(CANVAS_EXT, '') : baseOf(p));
const kindClass = (p) => (IMG_EXT.test(p) ? ' img' : CANVAS_EXT.test(p) ? ' canvas' : '');
function buildTree() {
  const root = { dirs: new Map(), files: [], path: '' };
  for (const p of listed()) {
    const parts = p.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let d = node.dirs.get(parts[i]);
      if (!d) { d = { dirs: new Map(), files: [], path: parts.slice(0, i + 1).join('/') }; node.dirs.set(parts[i], d); }
      node = d;
    }
    node.files.push(p);
  }
  T = { root, byPath: new Map() };
  const index = (node) => { T.byPath.set(node.path, node); node.sorted = false; for (const d of node.dirs.values()) index(d); };
  index(root);
}
function sortedFiles(node) {
  if (!node.sorted) { node.files.sort((a, b) => cmpName(stem(a), stem(b))); node.sorted = true; }
  return node.files;
}
function drawDir(node) {
  let h = '<ul>';
  for (const name of [...node.dirs.keys()].sort(cmpName)) {
    const d = node.dirs.get(name);
    const open = openDirs.has(d.path);
    h += `<li class="dir${open ? '' : ' closed'}" data-dir="${esc(d.path)}"><div class="row"><span class="caret">▾</span><span class="nm">${esc(name)}</span></div>${open ? drawDir(d) : ''}</li>`;
  }
  const files = sortedFiles(node);
  const shown = treeMore.get(node.path) || TREE_PAGE;
  for (const p of files.slice(0, shown)) {
    h += `<li><div class="row file${kindClass(p)}" data-path="${esc(p)}" title="${esc(p)}"><span class="caret"></span><span class="nm">${esc(label(p))}</span></div></li>`;
  }
  if (files.length > shown) h += `<li><div class="row more" data-more="${esc(node.path)}"><span class="caret"></span><span class="nm muted">Show ${Math.min(TREE_PAGE, files.length - shown).toLocaleString()} more (of ${(files.length - shown).toLocaleString()} left)…</span></div></li>`;
  return h + '</ul>';
}
function renderTree() {
  const filter = g('fileFilter').value.trim().toLowerCase();
  if (filter) {
    // a flat list of matches instead of an expanded tree
    const hits = [];
    for (const p of listed()) { if (p.toLowerCase().includes(filter)) { hits.push(p); if (hits.length > TREE_PAGE) break; } }
    g('tree').innerHTML = hits.length
      ? '<ul>' + hits.slice(0, TREE_PAGE).map((p) => `<li><div class="row file${kindClass(p)}" data-path="${esc(p)}" title="${esc(p)}"><span class="caret"></span><span class="nm">${esc(label(p))} <span class="muted small">${esc(dirOf(p))}</span></span></div></li>`).join('') + '</ul>'
        + (hits.length > TREE_PAGE ? `<div class="muted small">First ${TREE_PAGE.toLocaleString()} matches — type more to narrow</div>` : '')
      : '<div class="muted small">No notes</div>';
  } else {
    if (!T) buildTree();
    g('tree').innerHTML = V.notes.length ? drawDir(T.root) : '<div class="muted small">No notes</div>';
  }
  markTree();
}
function toggleDir(li) {
  const d = li.dataset.dir;
  if (openDirs.has(d)) { openDirs.delete(d); li.classList.add('closed'); return; }
  openDirs.add(d);
  li.classList.remove('closed');
  if (!li.querySelector(':scope > ul')) li.insertAdjacentHTML('beforeend', drawDir(T.byPath.get(d)));
}
function showMore(row) {
  const d = row.dataset.more;
  treeMore.set(d, (treeMore.get(d) || TREE_PAGE) + TREE_PAGE);
  const ul = row.closest('ul');
  ul.outerHTML = drawDir(T.byPath.get(d));
  markTree();
}
function markTree() {
  const mark = () => {
    g('tree').querySelectorAll('.row.file').forEach((r) => r.classList.toggle('active', r.dataset.path === current));
    const a = g('tree').querySelector('.row.active');
    if (a) a.scrollIntoView({ block: 'nearest' });
  };
  if (!current || g('fileFilter').value.trim() || !T) { mark(); return; }
  // open every folder above the current note, drawing those not yet in the DOM
  let acc = '', redraw = false;
  for (const seg of dirOf(current).split('/')) {
    if (!seg) continue;
    acc = acc ? acc + '/' + seg : seg;
    if (!openDirs.has(acc)) { openDirs.add(acc); redraw = true; }
  }
  const node = T.byPath.get(dirOf(current));
  if (node) {
    const at = sortedFiles(node).indexOf(current);
    if (at >= (treeMore.get(node.path) || TREE_PAGE)) { treeMore.set(node.path, at + 1); redraw = true; }
  }
  if (redraw) g('tree').innerHTML = drawDir(T.root);
  mark();
}

// ---------------- search ----------------
// Full-text search runs in the indexer (it holds every note's text);
// tag search is answered here from the tag index.
let searchSeq = 0;
async function runSearch() {
  const q = g('searchInput').value.trim();
  const box = g('searchResults');
  const my = ++searchSeq;
  if (!q) { box.innerHTML = ''; g('searchInfo').textContent = ''; return; }
  const tagM = /^tag:#?(\S+)$/i.exec(q);
  let hits = [], total = 0, note = '';
  if (tagM) {
    const want = tagM[1].toLowerCase();
    const set = new Set();
    for (const [t, ps] of V.tags) if (t === want || t.startsWith(want + '/')) ps.forEach((i) => set.add(V.files[i]));
    total = set.size;
    hits = [...set].sort((a, b) => stem(a).localeCompare(stem(b))).slice(0, 300).map((p) => ({ p, s: '' }));
  } else {
    g('searchInfo').textContent = 'Searching…';
    let r;
    try { r = await window.api.search(q, 300); } catch (e) { if (my === searchSeq) g('searchInfo').textContent = 'Search failed: ' + e.message; return; }
    if (my !== searchSeq) return;
    hits = r.hits; total = r.total;
    if (r.partial) note = ` — index not complete (${r.indexed.toLocaleString()} of ${r.notes.toLocaleString()} notes searched)`;
  }
  g('searchInfo').textContent = total.toLocaleString() + (total === 1 ? ' note' : ' notes') + (total > 300 ? ' (first 300 shown)' : '') + note;
  const terms = tagM ? [] : q.toLowerCase().split(/\s+/).filter(Boolean);
  const hl = (s) => { let h = esc(s); for (const t of terms) h = h.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`); return h; };
  box.innerHTML = hits.map(({ p, s }) =>
    `<div class="result" data-path="${esc(p)}"><div class="t">${hl(stem(p))}</div><div class="p">${esc(dirOf(p))}</div>${s ? `<div class="s">…${hl(s)}…</div>` : ''}</div>`).join('');
}

function renderTags() {
  const list = [...V.tags.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  g('tagList').innerHTML = list.length
    ? list.slice(0, 3000).map(([t, ps]) => `<div class="tagrow" data-tag="${esc(t)}"><span>#${esc(t)}</span><span class="count">${ps.length.toLocaleString()}</span></div>`).join('')
    : '<div class="muted small">No tags</div>';
}

function searchTag(t) {
  setTab('search');
  g('searchInput').value = 'tag:#' + t;
  runSearch();
  showLeft();
}

// ---------------- quick switcher ----------------
let swSel = 0, swItems = [];
function fuzzy(q, s) {
  // subsequence match; consecutive and word-start hits score higher
  let qi = 0, score = 0, run = 0; const pos = [];
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) { pos.push(i); run++; score += run * 2 + (i === 0 || /[\s/_-]/.test(s[i - 1]) ? 5 : 0); qi++; } else run = 0;
  }
  return qi === q.length ? { score: score - s.length * 0.05, pos } : null;
}
let swTarget = null; // 'tab' or 'split' when the pick opens there
function openSwitcher(o = {}) {
  if (!V.name) return pickVault();
  swTarget = o.newTab ? 'tab' : o.split ? 'split' : null;
  g('switcher').hidden = false;
  g('swInput').placeholder = o.placeholder || 'Type a note name…';
  g('swInput').value = '';
  swFilter();
  g('swInput').focus();
}
function swFilter() {
  const q = g('swInput').value.trim().toLowerCase();
  if (Picker.active && Picker.filter) {
    const list = V.notes.filter(Picker.filter);
    swItems = (q ? list.map((p) => { const r = fuzzy(q, stem(p).toLowerCase()); return r ? { p, score: r.score, pos: r.pos } : null; }).filter(Boolean).sort((a, b) => b.score - a.score)
      : list.slice().sort((a, b) => cmpName(stem(a), stem(b))).map((p) => ({ p, pos: [] }))).slice(0, 100);
    swSel = 0; drawSw(); return;
  }
  const all = V.notes;
  if (!q) {
    const recentHist = [...new Set(hist.slice().reverse())];
    const inHist = new Set(recentHist);
    // 60 most recently modified notes, without sorting the whole vault
    const top = [];
    for (const p of all) {
      if (inHist.has(p)) continue;
      const t = V.mtimes[V.idx.get(p)] || 0;
      if (top.length < 60 || t > top[top.length - 1].t) {
        top.push({ p, t }); top.sort((a, b) => b.t - a.t); if (top.length > 60) top.pop();
      }
    }
    swItems = [...recentHist, ...top.map((x) => x.p)].slice(0, 60).map((p) => ({ p, pos: [] }));
  } else {
    // cheap pre-check (every query letter present) before the fuzzy scorer on the full path
    const letters = [...new Set(q)].filter((c) => c !== ' ');
    const found = [];
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      const r = fuzzy(q, V.stemLc[i]);
      if (r) { found.push({ p, score: r.score + 10, pos: r.pos }); continue; }
      const pl = p.toLowerCase();
      if (!letters.every((c) => pl.includes(c))) continue;
      const r2 = fuzzy(q, pl);
      if (r2) found.push({ p, score: r2.score, pos: [] });
    }
    // pictures by file name, after notes of equal score
    if (Prefs.get('showImages') || Picker.active) for (let i = 0; i < V.images.length; i++) { const r = fuzzy(q, V.imgLc[i]); if (r) found.push({ p: V.images[i], score: r.score + 9, pos: r.pos }); }
    for (const c of V.canvases) { const r = fuzzy(q, label(c).toLowerCase()); if (r) found.push({ p: c, score: r.score + 9, pos: r.pos }); }
    swItems = found.sort((a, b) => b.score - a.score).slice(0, 60);
  }
  swSel = 0;
  drawSw();
}
function drawSw() {
  g('swList').innerHTML = swItems.length ? swItems.map(({ p, pos }, i) => {
    const n = label(p); const set = new Set(pos);
    const name = [...n].map((ch, j) => (set.has(j) ? `<b>${esc(ch)}</b>` : esc(ch))).join('');
    return `<div class="switem${i === swSel ? ' sel' : ''}" data-i="${i}"><div>${IMG_EXT.test(p) ? '🖼 ' : CANVAS_EXT.test(p) ? '🧩 ' : ''}${name}</div><div class="p">${esc(dirOf(p))}</div></div>`;
  }).join('') : '<div class="muted small" style="padding:8px">No matching notes</div>';
  const sel = g('swList').querySelector('.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}
function closeSwitcher() { g('switcher').hidden = true; if (Picker.active) Picker.done(null); }
// Enter / click in the quick-open box: open the file, or hand it to a picker
function chooseSw(it) {
  const pick = Picker.active, to = swTarget; swTarget = null;
  if (pick) Picker.done(it && it.p);
  closeSwitcher();
  if (pick || !it) return;
  if (to === 'tab') Tabs.openNew(it.p); else if (to === 'split') Split.open(it.p, '', { newTab: true }); else openNote(it.p);
}

// ---------------- vault loading ----------------
function afterIndex() {
  T = null; treeMore.clear();
  g('vaultName').textContent = V.name;
  g('vaultName').title = V.root;
  renderTree(); renderTags();
  if (g('searchInput').value) runSearch();
  setStatus(`${V.notes.length.toLocaleString()} notes · ${(V.edges.length / 2).toLocaleString()} links`);
  Graph.invalidate();
  CC.refresh();
}
function loadVault(data, keepNote) {
  if (!data) return;
  const t0 = performance.now();
  buildIndex(data);
  V.text.clear();
  afterIndex();
  console.log('window index built in', Math.round(performance.now() - t0), 'ms; indexer timing', data.timing);
  if (data.truncated) toast('Very large folder — only the first 1,000,000 files were read.');
  const target = data.open || (keepNote && (isNote(keepNote) || (CANVAS_EXT.test(keepNote) && V.idx.has(keepNote))) ? keepNote : null);
  if (target) { current = null; openNote(target, '', { push: !keepNote }); return; }
  window.api.getSetting('lastNote:' + V.name).then((last) => {
    const first = [last, 'README.md', 'Home.md', 'index.md'].find((p) => p && (isNote(p) || (CANVAS_EXT.test(p) && V.idx.has(p))))
      || V.notes.reduce((a, b) => (a == null || b < a ? b : a), null);
    Tabs.restore(first).then(() => Split.restore());
    if (!first) toast('No Markdown files in this folder.');
  });
}
// The indexer noticed edits on disk: swap in the new index and re-show
// the open note if it was one of the changed files.
function applyChange({ snapshot, changed }) {
  for (const p of changed) V.text.delete(p);
  Split.refresh(changed);
  if (!snapshot) {
    // only canvases / pictures were rewritten; the index did not change
    if (CanvasView.active() && changed.includes(CanvasView.path)) CanvasView.externalChange();
    return;
  }
  const keep = current;
  buildIndex(snapshot);
  afterIndex();
  CC.refresh(changed);
  if (!keep) return;
  if (!isNote(keep) && !(CANVAS_EXT.test(keep) && V.idx.has(keep))) { if (Ed.renaming !== keep) toast('The open note was removed or renamed'); return; }
  if (Ed.active() && changed.includes(Ed.path)) { Ed.externalChange(); renderSide(); return; }
  if (CanvasView.active()) { if (changed.includes(CanvasView.path)) CanvasView.externalChange(); return; }
  if (KanbanView.active()) { if (changed.includes(KanbanView.path)) KanbanView.externalChange(); else renderSide(); return; }
  if (changed.includes(keep) && view !== 'note') { staleNote = true; return; } // redrawn when the note area comes back
  if (changed.includes(keep)) {
    const y = g('main').scrollTop;
    current = null;
    openNote(keep, '', { push: false }).then(() => { g('main').scrollTop = y; });
  } else { renderSide(); DvView.refresh(g('note')); } // other notes changed: queries may show new rows
}

async function pickVault() {
  try { loadVault(await window.api.pickVault()); } catch (e) { toast('Could not open the folder: ' + e.message); }
}
async function reloadVault(quiet) {
  if (!V.name) return;
  try { loadVault(await window.api.reload(), current); if (!quiet) toast('Folder reloaded'); }
  catch (e) { toast('Reload failed: ' + e.message); }
}

// ---------------- chrome ----------------
let view = 'note';           // 'note', 'graph' or 'cc' (Command Center) in the main area
let staleNote = false;       // the open note changed on disk while another view was shown
function showView(v) {
  if (v === view) return;
  view = v;
  if (v === 'note' && staleNote) { staleNote = false; if (isNote(current)) { const p = current; current = null; openNote(p, '', { push: false }); } }
  g('graphView').hidden = v !== 'graph';
  g('ccView').hidden = v !== 'cc';
  g('main').hidden = v !== 'note';
  g('center').hidden = v !== 'note';
  g('btnGraph').classList.toggle('on', v === 'graph');
  g('btnHome').classList.toggle('on', v === 'cc');
  if (v === 'cc') CC.show(); else CC.hide();
  if (v === 'graph') Graph.show(Graph.mode, current); else Graph.hide();
}
function toggleCC() {
  if (view === 'cc') { showView('note'); return; }
  if (!V.name) return;
  showView('cc');
}
function toggleGraph(mode) {
  if (view === 'graph' && (!mode || mode === Graph.mode)) { showView('note'); return; }
  if (!V.name) return;
  if (mode && mode !== Graph.mode) { if (view !== 'graph') { view = 'graph'; g('graphView').hidden = false; g('main').hidden = true; g('center').hidden = true; g('ccView').hidden = true; CC.hide(); g('btnHome').classList.remove('on'); g('btnGraph').classList.add('on'); } Graph.show(mode, current); return; }
  showView('graph');
}
function setStatus(msg) { g('status').textContent = msg; }
function toast(msg) {
  const t = g('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}
function setTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + name));
  if (name === 'search') setTimeout(() => g('searchInput').focus(), 0);
}
const narrow = () => matchMedia('(max-width: 900px)').matches;
function toggleSide(side) {
  const L = g('layout');
  if (narrow()) { L.classList.toggle('show-' + side); L.classList.remove('show-' + (side === 'left' ? 'right' : 'left')); return; }
  L.classList.toggle('no-' + side);
  window.api.setSetting('hide-' + side, L.classList.contains('no-' + side));
}
function showLeft() { const L = g('layout'); if (narrow()) L.classList.add('show-left'); else L.classList.remove('no-left'); }
const isDark = () => document.documentElement.dataset.theme === 'dark';
function setTheme(t) { Prefs.set('theme', t); }
function updateNav() { g('btnBack').disabled = hIdx <= 0; g('btnFwd').disabled = hIdx >= hist.length - 1; }
function go(step) {
  const i = hIdx + step;
  if (i < 0 || i >= hist.length) return;
  hIdx = i; current = null;
  openNote(hist[i], '', { push: false });
}

// one click handler for every link-like element in the app
document.addEventListener('click', (e) => {
  // task checkboxes in reading view write back to the file
  const pic = e.target.closest('#note img, #splitNote img');
  if (pic && !e.target.closest('a')) { e.preventDefault(); Viewer.openFromNote(pic); return; }
  const cb = e.target.closest('#note input[type=checkbox][data-task]');
  if (cb) { e.preventDefault(); Ed.toggleTaskAt(+cb.dataset.task); return; }
  const scb = e.target.closest('#splitNote input[type=checkbox][data-split-task]');
  if (scb) { e.preventDefault(); Ed.toggleTaskAt(+scb.dataset.splitTask, Split.path); return; }
  const a = e.target.closest('a, [data-kb-lane], [data-path], [data-tag], [data-h], [data-reveal], [data-board], .callout.foldable > .callout-title, .row, [data-i]');
  if (!a) return;
  if (a.matches('.callout-title')) { a.parentElement.classList.toggle('folded'); return; }
  if (a.matches('[data-reveal]')) { window.api.reveal(current); return; }
  if (a.matches('[data-board]')) { KanbanView.asBoard(current); return; }
  if (a.dataset.kbLane != null) { const l = document.querySelectorAll('.kb-lane')[+a.dataset.kbLane]; if (l) l.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' }); return; }
  if (a.matches('[data-i]')) { chooseSw(swItems[+a.dataset.i]); return; }
  if (a.dataset.h) { e.preventDefault(); const h = g(a.dataset.h); if (h) h.scrollIntoView({ block: 'start' }); return; }
  if (a.dataset.tag) { e.preventDefault(); searchTag(a.dataset.tag); return; }
  if (a.dataset.missing != null) { e.preventDefault(); Ed.createFromLink(a.dataset.missing); return; }
  if (a.dataset.path) {
    e.preventDefault();
    const how = { pane: a.closest('#split') ? 'split' : 'main', newTab: e.ctrlKey || e.metaKey, otherPane: e.altKey };
    // links in notes follow the pane they are in; lists (files, search, backlinks) open in the main pane
    if (a.closest('#note, #splitNote') || how.newTab || how.otherPane) openIn(a.dataset.path, a.dataset.sub || '', how);
    else openNote(a.dataset.path, a.dataset.sub || '');
    return;
  }
  if (a.matches('.row.more')) { showMore(a); return; }
  if (a.closest('li.dir') && a.matches('.row')) { toggleDir(a.parentElement); return; }
  if (a.tagName === 'A' && a.getAttribute('href')) { e.preventDefault(); window.api.openExternal(a.href); }
});
// middle click on a link or a file: a new tab
document.addEventListener('auxclick', (e) => {
  if (e.button !== 1) { if (e.target.closest('a')) e.preventDefault(); return; }
  const a = e.target.closest('[data-path]');
  if (a && !a.closest('#tabbar, #splitTabs')) { e.preventDefault(); openIn(a.dataset.path, a.dataset.sub || '', { pane: a.closest('#split') ? 'split' : 'main', newTab: true }); return; }
  if (e.target.closest('a')) e.preventDefault();
});

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
g('btnOpen').onclick = g('btnOpen2').onclick = pickVault;
g('btnReload').onclick = () => reloadVault(false);
g('btnTheme').onclick = () => setTheme(isDark() ? 'light' : 'dark');
g('btnLeft').onclick = () => toggleSide('left');
g('btnRight').onclick = () => toggleSide('right');
g('btnBack').onclick = () => go(-1);
g('btnFwd').onclick = () => go(1);
g('btnSwitch').onclick = openSwitcher;
g('btnGraph').onclick = () => toggleGraph();
g('btnHome').onclick = () => toggleCC();
g('btnSettings').onclick = () => Prefs.open();
g('aboutLink').onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.api.about(); };
g('guideLink').onclick = (e) => { e.preventDefault(); e.stopPropagation(); openGuide(); };
Graph.wire();
let fT; g('fileFilter').oninput = () => { clearTimeout(fT); fT = setTimeout(renderTree, 120); };
let sT; g('searchInput').oninput = () => { clearTimeout(sT); sT = setTimeout(runSearch, 150); };
let wT; g('swInput').oninput = () => { clearTimeout(wT); wT = setTimeout(swFilter, V.notes.length > 20000 ? 80 : 0); };
g('swInput').onkeydown = (e) => {
  if (e.key === 'ArrowDown') { swSel = Math.min(swSel + 1, swItems.length - 1); drawSw(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { swSel = Math.max(swSel - 1, 0); drawSw(); e.preventDefault(); }
  else if (e.key === 'Enter') chooseSw(swItems[swSel]);
};
g('switcher').onclick = (e) => { if (e.target === g('switcher')) closeSwitcher(); };
document.addEventListener('keydown', (e) => {
  if (Viewer.isOpen()) return; // the viewer has its own keys
  if (e.key === 'Escape') { closeSwitcher(); g('palette').hidden = true; g('settings').hidden = true; g('ctxMenu').hidden = true; g('layout').classList.remove('show-left', 'show-right'); }
  if (e.defaultPrevented || e.target.closest('.cm-editor')) return; // the editor handled it
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openSwitcher(); }
});
window.addEventListener('mouseup', (e) => { if (e.button === 3) go(-1); if (e.button === 4) go(1); });

window.api.onMenu((cmd) => {
  ({
    open: pickVault, reload: () => reloadVault(false), print: () => window.print(), switcher: openSwitcher,
    search: () => { setTab('search'); showLeft(); }, back: () => go(-1), forward: () => go(1),
    'toggle-left': () => toggleSide('left'), 'toggle-right': () => toggleSide('right'),
    theme: () => setTheme(isDark() ? 'light' : 'dark'),
    'pending-open': async () => loadVault(await window.api.lastVault()),
    'command-center': () => toggleCC(), graph: () => toggleGraph('global'), 'graph-local': () => toggleGraph('local'),
    guide: openGuide, changelog: () => openDoc('changelog'),
    'insert-template': () => Templates.insert(), 'new-from-template': () => Templates.newFromTemplate(),
    'new-tab': () => Tabs.newTab(), 'close-tab': () => closeTab(), 'next-tab': () => cycleTab(1), 'prev-tab': () => cycleTab(-1),
    'split-open': () => current && Split.open(current, '', { newTab: true }), 'split-close': () => Split.hide(),
    'new-note': () => Ed.newNote(), 'new-canvas': () => CanvasView.create(), 'new-board': () => KanbanView.create(), 'toggle-edit': () => Ed.toggle(), palette: () => Ed.palette(), settings: () => Prefs.open(),
    flush: async () => { try { await Ed.flush(); await Split.flush(); await KanbanView.flush(); } finally { window.api.flushed(); } },
  }[cmd] || (() => {}))();
});
// files changed on disk (edited in another app, VS Code, synced by OneDrive…)
// the indexer already re-read only the changed files; this just swaps the index in
window.api.onChanged((res) => applyChange(res));
// progress of a long open / background indexing
const PHASES = { scan: 'Scanning folders', check: 'Checking for changes', read: 'Reading notes', 'search-index': 'Indexing text for search' };
window.api.onIndexEvent((m) => {
  if (m.type === 'progress') {
    const label = PHASES[m.phase] || m.phase;
    const txt = m.total ? `${label} ${m.done.toLocaleString()} / ${m.total.toLocaleString()}` : label + '…';
    if (m.phase.startsWith('layout-')) {
      const steps = { 'layout-pivots': 'distances', 'layout-smooth': 'smoothing', 'layout-spread': 'spacing', 'layout-components': 'islands' };
      if (view === 'graph') g('graphInfo').textContent = `Laying out the map — ${steps[m.phase] || m.phase} ${m.done}/${m.total}`;
      return;
    }
    if (m.phase === 'search-index') { if (m.done < m.total) setStatus(txt); else setStatus(`${V.notes.length.toLocaleString()} notes · ${(V.edges.length / 2).toLocaleString()} links`); }
    else { setStatus(txt); if (!V.name) g('loading').textContent = txt; }
  } else if (m.type === 'reopened') {
    // the indexer had to restart; it reopened the folder — take its index again
    loadVault(m.data, current);
    toast('The index was rebuilt after a problem; everything is up to date again.');
  } else if (m.type === 'changed') {
    applyChange(m.result); // edits made while the app was closed
  } else if (m.type === 'search-ready') {
    if (g('searchInput').value) runSearch();
    if (!m.full) toast('Search covers only part of this very large folder (memory limit).');
  }
});

// ---------------- start ----------------
(async function boot() {
  await Prefs.load();
  await Ed.initMode();
  Graph.settingsChanged();
  if (await window.api.getSetting('hide-left')) g('layout').classList.add('no-left');
  if (await window.api.getSetting('hide-right')) g('layout').classList.add('no-right');
  updateNav();
  const recent = await window.api.recent();
  g('recent').innerHTML = recent.length
    ? '<div class="muted small" style="margin:18px 0 6px">Recent folders</div>' + recent.map((r) => `<a class="recent-item" data-recent="${esc(r)}">${esc(r)}</a>`).join('')
    : '';
  g('recent').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-recent]'); if (!a) return;
    e.stopPropagation();
    try { loadVault(await window.api.openVault(a.dataset.recent)); } catch (err) { toast('Could not open: ' + err.message); }
  }, true);
  try { loadVault(await window.api.lastVault()); }
  catch (e) { toast('Could not reopen the last folder: ' + e.message); }
})();
