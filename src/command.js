// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — Command Center: a dashboard page built from one ordinary note.
// `# Left` / `# Center` / `# Right` headings pick the column, each `## Heading`
// is a card, and a card holds any Markdown: ```dataview queries, links, lists,
// and ```lantern blocks for what a query cannot say (stats, recent, folders, tags).
// Without that note a built-in layout is shown. The background is the vault
// itself drawn as a galaxy (one star per note) on a plain 2D canvas - no
// graphics card needed - moving, still or off; the Galaxy button explores it.
'use strict';

const CC = (() => {
  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TEMPLATE = [
    '# Command Center',
    '',
    '%% Lanternote shows this note as the Command Center (⌂, Ctrl+Shift+H).',
    '   "# Left", "# Center" and "# Right" choose the column; every "## Heading" is a card.',
    '   Cards take any Markdown: ```dataview queries (TABLE, LIST, TASK, CALENDAR), [[links]], lists, and ```lantern blocks:',
    '   stats · recent 10 · recent 10 Some/Folder · folders · folders A, B/C · tags 12 %%',
    '',
    '# Left',
    '',
    '## Today',
    '```lantern',
    'stats',
    '```',
    '',
    '## Tags',
    '```lantern',
    'tags 12',
    '```',
    '',
    '# Center',
    '',
    '## Folders',
    '```lantern',
    'folders',
    '```',
    '',
    '## Recently edited',
    '```lantern',
    'recent 10',
    '```',
    '',
    '# Right',
    '',
    '## Due in the next 14 days',
    '%% Change "due" to the date field your notes use. %%',
    '```dataview',
    'TABLE WITHOUT ID file.link AS "Note", due AS "Due"',
    'WHERE due AND due >= date(today) AND due <= date(today) + dur(14 days)',
    'SORT due ASC',
    'LIMIT 8',
    '```',
    '',
    '## Open tasks',
    '```dataview',
    'TASK WHERE !completed AND status != "-" SORT file.mtime DESC LIMIT 12',
    '```',
    '',
    '## Calendar',
    '%% A dot for each note on the day it was last edited. %%',
    '```dataview',
    'CALENDAR file.mday',
    '```',
    '',
  ].join('\n');

  const COLS = { left: 'left', 'trái': 'left', trai: 'left', center: 'center', centre: 'center', middle: 'center', 'giữa': 'center', giua: 'center', right: 'right', 'phải': 'right', phai: 'right' };

  let visible = false, seq = 0, clock = 0, source = null;

  const cfgPath = () => String(Prefs.get('ccNote') || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const hasCfg = () => { const p = cfgPath(); return !!p && isNote(p); };

  // ---------------- note → columns and cards ----------------
  function parse(md) {
    const { body } = splitFm(md);
    const cols = { left: [], center: [], right: [], none: [] };
    let title = '', col = 'none', card = null, fence = null, used = false;
    // a card with only %% comments %% in it is not drawn
    const push = () => { if (card && (card.title || card.lines.join('\n').replace(/%%[\s\S]*?%%/g, '').trim())) cols[col].push(card); card = null; };
    for (const line of body.split('\n')) {
      const f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim()) fence = null; }
      else if (f) fence = f[1];
      else {
        const h = /^(#{1,2})\s+(.*?)\s*#*\s*$/.exec(line);
        if (h && h[1] === '#') {
          const c = COLS[h[2].toLowerCase()];
          push();
          if (c) { col = c; used = true; } else if (!title) title = h[2];
          else card = { title: h[2], lines: [] };
          continue;
        }
        if (h) { push(); card = { title: h[2], lines: [] }; continue; }
      }
      if (!card) card = { title: '', lines: [] };
      card.lines.push(line);
    }
    push();
    if (!used) { cols.center = cols.none; cols.none = []; } else cols.left.unshift(...cols.none.splice(0));
    return { title: title || 'Command Center', cols, columns: used };
  }

  // ---------------- drawing ----------------
  async function render() {
    if (!visible) return;
    const my = ++seq;
    const p = hasCfg() ? cfgPath() : null;
    let md = TEMPLATE;
    if (p) {
      try { await ensureLoaded(p); md = V.text.get(p) || ''; } catch (e) { toast('Could not read the Command Center note: ' + e.message); }
    }
    if (my !== seq || !visible) return;
    source = p;
    const L = parse(md);
    g('ccTitle').textContent = L.title;
    g('ccSource').innerHTML = p
      ? `From <a class="internal" data-path="${esc(p)}">${esc(stem(p))}</a>`
      : `Built-in layout · <button class="link" id="ccCreate">Create "${esc(cfgPath() || 'Command Center.md')}" to change it</button>`;
    const cardHtml = (c) => {
      stack.push({ from: p, depth: 1 });
      let html;
      try { html = marked.parse(c.lines.join('\n').replace(/\s\^[\w-]+[ \t]*$/gm, '')); } finally { stack.pop(); }
      return `<section class="cc-card">${c.title ? `<h2 class="cc-h"><span>${esc(c.title)}</span><span class="cc-count"></span></h2>` : ''}<div class="cc-c">${html}</div></section>`;
    };
    const colHtml = (name) => `<div class="cc-col cc-${name}">${L.cols[name].map(cardHtml).join('')}</div>`;
    const body = g('ccBody');
    body.className = L.columns ? 'cc-cols' : 'cc-grid';
    body.innerHTML = sanitize(L.columns ? ['left', 'center', 'right'].map(colHtml).join('') : L.cols.center.map(cardHtml).join(''));
    body.querySelectorAll('pre > code.language-lantern, pre > code.language-lumen').forEach((code) => {
      const d = document.createElement('div');
      d.className = 'cc-block'; d.dataset.cmd = code.textContent.trim();
      code.parentElement.replaceWith(d);
    });
    drawBlocks();
    postProcess(body, p);
    // cards are not the note: no heading ids (they would clash with the note's), no live checkboxes
    body.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    body.querySelectorAll('input[type=checkbox]').forEach((cb) => { cb.disabled = true; delete cb.dataset.task; });
    tick();
  }

  // ```lantern blocks, redrawn whenever the index changes
  function drawBlocks() {
    g('ccBody').querySelectorAll('.cc-block').forEach((d) => {
      const [cmd, ...rest] = d.dataset.cmd.split(/\s+/);
      const arg = rest.join(' ');
      const fn = BLOCKS[cmd.toLowerCase()];
      d.innerHTML = fn ? fn(arg, d) : `<div class="dv-error">Unknown lantern block "${esc(cmd)}" — use stats, recent, folders or tags</div>`;
    });
  }

  const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function ago(ms) {
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
    return new Date(ms).toLocaleDateString();
  }
  const setCount = (el, n) => { const c = el.closest('.cc-card')?.querySelector('.cc-count'); if (c) c.textContent = n.toLocaleString(); };

  const BLOCKS = {
    stats() {
      const t0 = dayStart(), w0 = t0 - 6 * 86400000;
      let today = 0, week = 0;
      for (const p of V.notes) { const t = V.mtimes[V.idx.get(p)] || 0; if (t >= t0) today++; if (t >= w0) week++; }
      const tile = (n, l, c) => `<div class="cc-stat"><b style="--dot:var(--c-${c})">${n.toLocaleString()}</b><span>${l}</span></div>`;
      return `<div class="cc-stats">${tile(V.notes.length, 'notes', 'blue')}${tile(V.edges.length / 2, 'links', 'purple')}${tile(V.tags.size, 'tags', 'cyan')}${tile(today, 'edited today', 'green')}${tile(week, 'edited in 7 days', 'orange')}</div>`;
    },
    recent(arg, el) {
      const m = /^(\d+)?\s*(.*)$/.exec(arg.trim());
      const n = Math.min(+(m[1] || 8), 100);
      const dir = m[2].replace(/^["']|["']$/g, '').replace(/^\/+|\/+$/g, '');
      const top = [];
      for (const p of V.notes) {
        if (p === source || (dir && !p.startsWith(dir + '/'))) continue;
        const t = V.mtimes[V.idx.get(p)] || 0;
        if (top.length < n || t > top[top.length - 1].t) { top.push({ p, t }); top.sort((a, b) => b.t - a.t); if (top.length > n) top.pop(); }
      }
      setCount(el, top.length);
      return top.length ? `<div class="cc-list">${top.map(({ p, t }) => `<a class="cc-item" data-path="${esc(p)}" title="${esc(p)}"><span class="cc-name">${esc(stem(p))}</span><span class="cc-sub">${esc(dirOf(p) || V.name)} · ${esc(ago(t))}</span></a>`).join('')}</div>` : '<div class="muted small">No notes</div>';
    },
    folders(arg) {
      const want = arg.trim();
      let dirs;
      const count = new Map();
      if (want && !/^\d+$/.test(want)) {
        dirs = want.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '').replace(/^\/+|\/+$/g, '')).filter(Boolean);
        for (const d of dirs) count.set(d, 0);
        for (const p of V.notes) for (const d of dirs) if (p.startsWith(d + '/')) count.set(d, count.get(d) + 1);
      } else {
        for (const p of V.notes) { const i = p.indexOf('/'); if (i > 0) { const d = p.slice(0, i); count.set(d, (count.get(d) || 0) + 1); } }
        dirs = [...count.keys()].sort(cmpName).slice(0, +(want || 12));
      }
      if (!dirs.length) return '<div class="muted small">No folders</div>';
      return `<div class="cc-gates">${dirs.map((d, i) => {
        const nm = d.split('/').pop();
        const num = /^(\d+)[-_. ]+(.*)$/.exec(nm);
        return `<a class="cc-gate" data-cc-dir="${esc(d)}" title="${esc(d)}"><span class="cc-gnum">${esc(num ? num[1] : String(i + 1).padStart(2, '0'))}</span><span class="cc-gname">${esc((num ? num[2] : nm).replace(/[-_]+/g, ' '))}</span><span class="cc-sub">${(count.get(d) || 0).toLocaleString()} notes</span></a>`;
      }).join('')}</div>`;
    },
    tags(arg, el) {
      const n = Math.min(+(arg.trim() || 12) || 12, 200);
      const list = [...V.tags.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, n);
      setCount(el, V.tags.size);
      return list.length ? `<div class="cc-tags">${list.map(([t, ps]) => `<a class="tag" data-tag="${esc(t)}">#${esc(t)} <span class="cc-sub">${ps.length.toLocaleString()}</span></a>`).join('')}</div>` : '<div class="muted small">No tags</div>';
    },
  };

  function tick() {
    const d = new Date();
    g('ccDate').textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // ---------------- actions ----------------
  async function editLayout() {
    let p = cfgPath() || 'Command Center.md';
    if (!/\.md$/i.test(p)) p += '.md';
    if (!isNote(p)) {
      if (await window.api.exists(p)) { toast('A file with that name already exists: ' + p); return; }
      try { await window.api.createNote(p, TEMPLATE); } catch (e) { toast('Could not create the note: ' + e.message); return; }
      if (p !== cfgPath()) Prefs.set('ccNote', p);
      for (let i = 0; i < 40 && !isNote(p); i++) await new Promise((r) => setTimeout(r, 100));
    }
    await Ed.toggleTo('edit');
    await openNote(p);
  }
  function showFolder(d) {
    let acc = '';
    for (const seg of d.split('/')) { acc = acc ? acc + '/' + seg : seg; openDirs.add(acc); }
    g('fileFilter').value = '';
    renderTree();
    showLeft();
    const row = g('tree').querySelector(`[data-dir="${CSS.escape(d)}"] > .row`);
    if (row) { row.scrollIntoView({ block: 'start' }); flash(row); }
  }
  g('ccView').addEventListener('click', (e) => {
    const gate = e.target.closest('[data-cc-dir]');
    if (gate) { e.preventDefault(); showFolder(gate.dataset.ccDir); return; }
    if (e.target.closest('#ccCreate')) { editLayout(); return; }
    const b = e.target.closest('[data-cc-act]');
    if (!b) return;
    ({
      open: () => openSwitcher(), search: () => { setTab('search'); showLeft(); }, graph: () => toggleGraph('global'),
      galaxy: () => Sky.setExplore(!Sky.explore), note: () => Ed.newNote(), daily: () => Ed.dailyNote(), edit: editLayout, settings: () => Prefs.open('Command Center'),
    }[b.dataset.ccAct] || (() => {}))();
  });
  // a card holding one query shows its row count in the title
  g('ccBody').addEventListener('dv-done', (e) => {
    const card = e.target.closest('.cc-card');
    if (card && card.querySelectorAll('.dv').length === 1 && e.detail.total != null) setCount(e.target, e.detail.total);
  });

  // ---------------- sky: the vault as a galaxy ----------------
  // Every star is a note. Each top-level folder is a spiral arm (colour as in
  // the graph), notes with many links sit near the core and are bigger, and
  // notes edited in the last 7 days shine and twinkle. The place of a note
  // comes from a hash of its path, so it never moves between visits.
  // All notes are painted once into an offscreen disc; a frame of the moving
  // background is the backdrop + that disc rotated + the few recent stars, at
  // most 30 times a second and only while the page is on screen. "Automatic"
  // drops to a still picture when frames cost too much or motion is reduced.
  // Galaxy mode (dock ✦) hides the cards: scroll to zoom, drag to move,
  // hover for the name, click to open the note.
  const Sky = (() => {
    const cv = g('ccSky'), cx = cv.getContext('2d', { alpha: false });
    const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#86bcb6', '#d37295'];
    const TILT = 0.42;
    const SPEED = { off: 0, slow: 0.000012, normal: 0.00004, fast: 0.00012 }; // radians per ms: one turn in ~9 min, ~2.6 min, ~53 s
    let mode = 'plain', layer = null, W = 0, H = 0, dpr = 1, raf = 0, last = 0, angle = 0.6, cost = 0, frames = 0, slow = false;
    let G = null, explore = false, zoom = 1, panX = 0, panY = 0, hover = -1, hl = -1, pending = 0;

    const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    function hash(s, seed) { let h = 2166136261 ^ seed; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; }
    function want() {
      const s = Prefs.get('ccBackground');
      if (explore && s === 'plain') return 'still';
      if (s === 'plain' || s === 'still' || s === 'moving') return s;
      const still = slow || matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.hardwareConcurrency || 4) <= 2;
      return still ? 'still' : 'moving';
    }

    // ---- the notes → positions, sizes, colours ----
    function buildData() {
      const notes = V.notes, n = notes.length;
      // arms = folders; a folder holding most of the vault is split into its
      // subfolders (a few levels), so one huge library still shows its parts
      const split = new Set();
      const keyOf = (p) => {
        const segs = p.split('/'); segs.pop();
        if (!segs.length) return '';
        let k = segs[0];
        for (let d = 1; d < segs.length && split.has(k); d++) k += '/' + segs[d];
        return k;
      };
      let keys, count;
      for (let round = 0; ; round++) {
        keys = notes.map(keyOf); count = new Map();
        for (const k of keys) count.set(k, (count.get(k) || 0) + 1);
        let big = '', bn = 0;
        for (const [k, c] of count) if (c > bn) { bn = c; big = k; }
        if (round >= 4 || bn < n * 0.6 || !big || split.has(big) || !keys.some((k, i) => k === big && notes[i].split('/').length > big.split('/').length + 1)) break;
        split.add(big);
      }
      const groups = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || cmpName(a, b));
      const gi = new Map(groups.map((f, k) => [f, k]));
      const F = Math.max(1, groups.length);
      // each arm gets a slice of the circle: mostly by its share of notes, a little for every arm
      const slice = groups.map((f) => 0.75 * count.get(f) / n + 0.25 / F);
      const base = []; let acc = 0;
      for (const w of slice) { base.push((acc + w / 2) * Math.PI * 2); acc += w; }
      const deg = new Uint32Array(n); let maxDeg = 1;
      for (let i = 0; i < n; i++) {
        const k = V.idx.get(notes[i]);
        deg[i] = V.outOff[k + 1] - V.outOff[k] + V.backOff[k + 1] - V.backOff[k];
        if (deg[i] > maxDeg) maxDeg = deg[i];
      }
      const lmax = Math.log(1 + maxDeg), now = Date.now();
      const x = new Float32Array(n), y = new Float32Array(n), size = new Float32Array(n), alpha = new Float32Array(n), col = new Uint16Array(n), grp = new Uint16Array(n);
      const recent = [];
      for (let i = 0; i < n; i++) {
        const p = notes[i], k = gi.get(keys[i]);
        const hub = Math.log(1 + deg[i]) / lmax;
        const r = 0.04 + 0.96 * Math.sqrt(hash(p, 1) * (1 - 0.8 * hub));        // hubs near the core
        const off = (hash(p, 2) + hash(p, 3) + hash(p, 4)) / 1.5 - 1;             // about -1..1, most near 0
        const width = slice[k] * Math.PI * (hash(p, 5) < 0.12 ? 1.6 : 0.9);          // an arm fills its slice; a few stars stray between arms
        const th = base[k] + r * 4.2 + off * width * (0.45 + 0.55 * (1 - r));
        x[i] = Math.cos(th) * r; y[i] = Math.sin(th) * r;
        size[i] = 0.9 + 2.6 * hub;
        const age = (now - (V.mtimes[V.idx.get(p)] || 0)) / 86400000;
        alpha[i] = age < 7 ? 1 : age < 30 ? 0.85 : age < 365 ? 0.62 : 0.42;
        col[i] = k % PALETTE.length; grp[i] = k;
        if (age < 7) recent.push(i);
      }
      recent.sort((a, b) => (V.mtimes[V.idx.get(notes[b])] || 0) - (V.mtimes[V.idx.get(notes[a])] || 0));
      // draw order: by colour (fewer style changes), bright on top
      const order = new Uint32Array(n).map((_, i) => i).sort((a, b) => col[a] - col[b] || alpha[a] - alpha[b]);
      G = { n, notes, x, y, size, alpha, col, grp, order, recent: recent.slice(0, 400), folders: groups.map((f, k) => ({ name: f ? f.split('/').pop() : V.name, dir: f, n: count.get(f), colour: PALETTE[k % PALETTE.length] })), disc: null, discFor: 0 };
      drawLegend();
    }
    // every note painted once, face-on, into a square picture of the unit disc
    function paintDisc(px) {
      const D = Math.max(256, Math.min(3072, Math.round(px)));
      const c = document.createElement('canvas'); c.width = c.height = D;
      const l = c.getContext('2d');
      const k = D / 2, dot = Math.max(0.6, D / 1400);
      let fs = -1;
      for (const i of G.order) {
        if (G.col[i] !== fs) { fs = G.col[i]; l.fillStyle = PALETTE[fs]; }
        l.globalAlpha = G.alpha[i];
        const s = G.size[i] * dot;
        l.fillRect(k + G.x[i] * k - s / 2, k + G.y[i] * k - s / 2, s, s);
      }
      G.disc = c; G.discFor = D;
    }

    // ---- geometry ----
    const tilt = () => (explore ? 1 : TILT);
    const radius = () => (explore ? Math.min(W, H) * 0.46 : Math.min(W * 0.46, H * 0.95)) * zoom;
    const centre = () => [W / 2 + panX, (explore ? H / 2 : H * 0.52) + panY];
    function project(i, R, ox, oy, ca, sa, t) {
      const x = G.x[i], y = G.y[i];
      return [ox + (x * ca - y * sa) * R, oy + (x * sa + y * ca) * R * t];
    }

    function build() {
      const r = cv.parentElement.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, mode === 'moving' && !explore ? 1.5 : 2);
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const R = rng(7);
      layer = document.createElement('canvas'); layer.width = cv.width; layer.height = cv.height;
      const l = layer.getContext('2d'); l.scale(dpr, dpr);
      const bg = l.createLinearGradient(0, 0, W * 0.3, H);
      bg.addColorStop(0, '#04060d'); bg.addColorStop(0.55, '#0a1022'); bg.addColorStop(1, '#070a16');
      l.fillStyle = bg; l.fillRect(0, 0, W, H);
      for (const [x, y, rad, c] of [[0.18, 0.25, 0.45, '123,91,214'], [0.82, 0.3, 0.4, '47,111,219'], [0.7, 0.85, 0.5, '214,91,170'], [0.3, 0.8, 0.35, '21,146,166']]) {
        const gr = l.createRadialGradient(x * W, y * H, 0, x * W, y * H, rad * Math.max(W, H));
        gr.addColorStop(0, `rgba(${c},0.14)`); gr.addColorStop(1, `rgba(${c},0)`);
        l.fillStyle = gr; l.fillRect(0, 0, W, H);
      }
      // a thin far-away field, much dimmer than the notes
      const faint = Math.min(700, Math.round(W * H / 3000));
      for (let i = 0; i < faint; i++) { l.fillStyle = `rgba(200,210,240,${0.06 + R() * 0.2})`; l.fillRect(R() * W, R() * H, 1, 1); }
      if (G) G.disc = null;
    }

    function draw(t) {
      if (!layer) return;
      if (!G && V.notes.length) buildData();
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.drawImage(layer, 0, 0);
      if (!G || !G.n) return;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const R = radius(), [ox, oy] = centre(), tl = tilt(), ca = Math.cos(angle), sa = Math.sin(angle);
      // the glowing core
      const cr = Math.min(R * 0.35, Math.max(W, H) * 0.6);
      const core = cx.createRadialGradient(ox, oy, 0, ox, oy, cr);
      core.addColorStop(0, 'rgba(255,225,190,0.42)'); core.addColorStop(1, 'rgba(255,225,190,0)');
      cx.save(); cx.translate(ox, oy); cx.scale(1, tl); cx.fillStyle = core; cx.beginPath(); cx.arc(0, 0, cr, 0, 7); cx.fill(); cx.restore();
      // the notes: the painted disc while it is sharp enough, else one by one
      // (only those on screen), round and with names once zoomed in
      const need = 2 * R * dpr;
      if (hl < 0 && need <= 3072 * 1.1 && !(explore && zoom > 1.4)) {
        if (!G.disc || need > G.discFor * 1.25 || need < G.discFor * 0.5) paintDisc(need);
        cx.save(); cx.translate(ox, oy); cx.scale(R, R * tl); cx.rotate(angle); cx.drawImage(G.disc, -1, -1, 2, 2); cx.restore();
      } else {
        const dot = Math.max(1, Math.min(2.4, R / 600));
        const shown = [];
        let fs = -1;
        for (const i of G.order) {
          const [sx, sy] = project(i, R, ox, oy, ca, sa, tl);
          if (sx < -4 || sy < -4 || sx > W + 4 || sy > H + 4) continue;
          const dim = hl >= 0 && G.grp[i] !== hl;
          if (G.col[i] !== fs) { fs = G.col[i]; cx.fillStyle = PALETTE[fs]; }
          cx.globalAlpha = dim ? 0.07 : G.alpha[i];
          const s = G.size[i] * dot;
          if (s < 2.5) cx.fillRect(sx - s / 2, sy - s / 2, s, s);
          else { cx.beginPath(); cx.arc(sx, sy, s / 2, 0, 7); cx.fill(); }
          if (!dim && explore) shown.push(i);
        }
        cx.globalAlpha = 1;
        // names: the biggest stars first, never on top of each other
        if (explore && zoom >= 2 && shown.length && shown.length <= 60000) {
          shown.sort((a, b) => G.size[b] - G.size[a]);
          const used = new Set();
          cx.font = '11px "Segoe UI", sans-serif'; cx.fillStyle = 'rgba(228,232,244,.85)';
          let drawn = 0;
          for (const i of shown) {
            const [sx, sy] = project(i, R, ox, oy, ca, sa, tl);
            const cell = Math.floor(sx / 120) + ':' + Math.floor(sy / 16);
            if (used.has(cell)) continue;
            used.add(cell);
            cx.fillText(stem(G.notes[i]), sx + 5, sy + 4);
            if (++drawn >= 120) break;
          }
        }
      }
      // notes edited in the last 7 days: white, twinkling when moving
      for (let k = 0; k < G.recent.length; k++) {
        const i = G.recent[k];
        const [sx, sy] = project(i, R, ox, oy, ca, sa, tl);
        if (sx < -4 || sy < -4 || sx > W + 4 || sy > H + 4) continue;
        const a = mode === 'moving' ? 0.55 + 0.45 * Math.sin(t / 700 + k * 1.7) : 0.95;
        cx.fillStyle = `rgba(255,248,230,${a.toFixed(2)})`;
        const s = 1.6 + G.size[i] * 0.6;
        cx.fillRect(sx - s / 2, sy - s / 2, s, s);
      }
      if (explore && hover >= 0) {
        const [sx, sy] = project(hover, R, ox, oy, ca, sa, tl);
        cx.strokeStyle = '#fff'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(sx, sy, 6, 0, 7); cx.stroke();
        const name = stem(G.notes[hover]), where = dirOf(G.notes[hover]) || V.name;
        cx.font = '600 13px "Segoe UI", sans-serif'; const w1 = cx.measureText(name).width;
        cx.font = '11px "Segoe UI", sans-serif'; const w2 = cx.measureText(where).width;
        const bw = Math.max(w1, w2) + 16, bx = Math.min(sx + 12, W - bw - 4), by = Math.max(4, sy - 40);
        cx.fillStyle = 'rgba(8,12,26,.92)'; cx.fillRect(bx, by, bw, 36);
        cx.fillStyle = '#e4e8f4'; cx.font = '600 13px "Segoe UI", sans-serif'; cx.fillText(name, bx + 8, by + 15);
        cx.fillStyle = '#9aa5c2'; cx.font = '11px "Segoe UI", sans-serif'; cx.fillText(where, bx + 8, by + 29);
      }
    }
    // one frame on the next paint (still picture, galaxy mode)
    function redraw() { if (pending || !layer) return; pending = requestAnimationFrame((t) => { pending = 0; draw(t); }); }

    function loop(t) {
      raf = 0;
      if (!visible || mode !== 'moving') return;
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;
      const dt = last ? Math.min(t - last, 100) : 0; last = t;
      // turn at the chosen speed; hold still while a star is pointed at or the galaxy is dragged
      if (!(explore && (drag || hover >= 0))) angle += dt * SPEED[Prefs.get('ccMotion')] || 0;
      const t0 = performance.now(); draw(t); const c = performance.now() - t0;
      cost = frames ? cost * 0.9 + c * 0.1 : c; frames++;
      if (Prefs.get('ccBackground') === 'auto' && !explore && frames > 45 && cost > 9) {
        slow = true; console.log('Command Center: background frames cost', cost.toFixed(1), 'ms — switching to a still picture');
        start();
      }
    }
    function start() {
      stop();
      mode = visible ? want() : 'plain';
      g('ccView').classList.toggle('space', mode !== 'plain');
      cv.hidden = mode === 'plain';
      if (mode === 'plain') { layer = null; if (G) G.disc = null; return; }
      build(); draw(performance.now());
      if (mode === 'moving') { last = 0; frames = 0; raf = requestAnimationFrame(loop); }
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function dataChanged() { G = null; if (visible && layer) redraw(); }

    // ---- galaxy mode ----
    function drawLegend() {
      if (!G) return;
      g('ccLegend').innerHTML = `<div class="cc-lg-head"><b>${G.n.toLocaleString()} notes</b><span class="muted">Scroll to zoom · drag to move · click a star to open · Esc to go back</span></div>` +
        G.folders.slice(0, 40).map((f, k) => `<span class="cc-lg${hl === k ? ' on' : ''}" data-hl="${k}" title="${esc(f.dir || V.name)}"><i style="background:${f.colour}"></i>${esc(f.name)} <span class="cc-sub">${f.n.toLocaleString()}</span></span>`).join('') +
        '<span class="cc-lg"><i style="background:#fff8e6"></i>edited in 7 days</span>';
    }
    function setExplore(on) {
      if (on === explore) return;
      explore = on; zoom = 1; panX = panY = 0; hover = -1; hl = -1;
      g('ccView').classList.toggle('exploring', on);
      drawLegend();
      start();
    }
    function pick(mx, my) {
      if (!G && V.notes.length) buildData();
      if (!G) return -1;
      const R = radius(), [ox, oy] = centre(), ca = Math.cos(angle), sa = Math.sin(angle);
      let best = -1, bd = 100; // within 10 px
      for (let i = 0; i < G.n; i++) {
        if (hl >= 0 && G.grp[i] !== hl) continue;
        const [sx, sy] = project(i, R, ox, oy, ca, sa, 1);
        const d = (sx - mx) ** 2 + (sy - my) ** 2 - G.size[i] * 4;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    let drag = null, moved = false, hT = 0;
    const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('wheel', (e) => {
      if (!explore) return;
      e.preventDefault();
      const [mx, my] = local(e), [ox, oy] = centre();
      const f = Math.exp(-e.deltaY * 0.0015), z = Math.min(400, Math.max(0.3, zoom * f)), k = z / zoom;
      // keep the point under the mouse where it is
      panX += (mx - ox) * (1 - k); panY += (my - oy) * (1 - k);
      zoom = z; redraw();
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => { if (!explore) return; drag = { x: e.clientX, y: e.clientY, px: panX, py: panY }; moved = false; try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } });
    cv.addEventListener('pointermove', (e) => {
      if (!explore) return;
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        if (moved) { panX = drag.px + dx; panY = drag.py + dy; hover = -1; redraw(); }
        return;
      }
      clearTimeout(hT);
      const [mx, my] = local(e);
      hT = setTimeout(() => { const h = pick(mx, my); if (h !== hover) { hover = h; cv.style.cursor = h >= 0 ? 'pointer' : ''; redraw(); } }, 16);
    });
    cv.addEventListener('pointerup', (e) => {
      if (!explore || !drag) return;
      drag = null;
      if (!moved) { const [mx, my] = local(e); const i = pick(mx, my); if (i >= 0) openNote(G.notes[i]); }
    });
    cv.addEventListener('dblclick', (e) => { if (!explore) return; const [mx, my] = local(e), [ox, oy] = centre(); panX += (mx - ox) * -1; panY += (my - oy) * -1; zoom *= 2; redraw(); });
    g('ccLegend').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hl]'); if (!b) return;
      hl = hl === +b.dataset.hl ? -1 : +b.dataset.hl; hover = -1; drawLegend(); redraw();
    });
    document.addEventListener('keydown', (e) => { if (explore && visible && e.key === 'Escape') setExplore(false); });

    let rT = 0;
    new ResizeObserver(() => { if (!visible || mode === 'plain') return; clearTimeout(rT); rT = setTimeout(() => { build(); draw(performance.now()); }, 120); }).observe(cv.parentElement);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && mode === 'moving' && !raf) { last = 0; raf = requestAnimationFrame(loop); } });
    return {
      start, stop, dataChanged, setExplore, redraw,
      get mode() { return mode; }, get cost() { return cost; }, get explore() { return explore; }, get data() { return G; },
      get angle() { return angle; }, get zoom() { return zoom; }, set zoom(z) { zoom = z; redraw(); }, get hover() { return hover; },
      zoomAt(z, sx, sy) { const [ox, oy] = centre(), k = z / zoom; panX += (sx - ox) * (1 - k); panY += (sy - oy) * (1 - k); zoom = z; redraw(); },
      screenOf(i) { const R = radius(), [ox, oy] = centre(); return project(i, R, ox, oy, Math.cos(angle), Math.sin(angle), tilt()); },
    };
  })();

  // ---------------- view ----------------
  function show() {
    if (visible) return;
    visible = true;
    Sky.start();
    render();
    clearInterval(clock); clock = setInterval(tick, 20000);
  }
  function hide() {
    if (!visible) return;
    if (Sky.explore) Sky.setExplore(false);
    visible = false;
    Sky.stop();
    clearInterval(clock);
  }
  // the index changed: the layout note itself → redraw; otherwise refresh counts and queries
  let rT = 0;
  function refresh(changed) {
    Sky.dataChanged();
    if (!visible) return;
    clearTimeout(rT);
    rT = setTimeout(() => {
      if (!changed || changed.includes(source) || (!source && hasCfg())) render();
      else { drawBlocks(); DvView.refresh(g('ccBody')); }
    }, 300);
  }
  function settingsChanged(k) {
    if (!visible) return;
    if (k === 'ccBackground') Sky.start(); else if (k === 'ccNote') render();
  }

  return { show, hide, refresh, render, settingsChanged, editLayout, parse, TEMPLATE, get visible() { return visible; }, get sky() { return Sky; } };
})();
