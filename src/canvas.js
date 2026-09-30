// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — Canvas: open and edit `.canvas` files in the JSON Canvas 1.0
// format (jsoncanvas.org), an open format shared by several note apps, so a canvas made in
// either app opens in the other.
//   Cards: text (Markdown), file (a note, an image or any file), link (web
//   address) and group. Arrows between card sides, with labels and colours.
//   Board: drag the background to move, wheel to scroll, Ctrl+wheel to zoom,
//   Shift+drag to select several cards.
//   Editing: double-click the board for a new card, double-click a card to
//   write in it, drag a card to move it, its corner to resize it, a dot on
//   its side to draw an arrow; Delete removes; Ctrl+Z / Ctrl+Y; saved on
//   its own like notes. Unknown fields in the file are kept as they are.
'use strict';

const CanvasView = (() => {
  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PRESET = { 1: '#fb464c', 2: '#e9973f', 3: '#e0de71', 4: '#44cf6e', 5: '#53dfdd', 6: '#a882ff' };
  const colour = (c) => (!c ? null : PRESET[c] || c);
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const SAVE_DELAY = 800;

  let path = null, data = null, base = null;     // open file, its JSON, { mtime, text } on disk
  let dirty = false, timer = 0, saving = null;
  let view = { x: 0, y: 0, k: 1 };               // board offset (px) and zoom
  let sel = new Set();                            // selected node ids
  let selEdge = null;
  let editing = null;                             // id of the text card being written in
  const undo = [], redo = [];

  // ---------------- file ----------------
  function parse(text) {
    let d;
    try { d = text.trim() ? JSON.parse(text) : {}; } catch (e) { throw new Error('this .canvas file is not valid JSON (' + e.message + ')'); }
    if (!Array.isArray(d.nodes)) d.nodes = [];
    if (!Array.isArray(d.edges)) d.edges = [];
    return d;
  }
  const serialise = () => JSON.stringify(data, null, '\t'); // the usual JSON Canvas layout

  async function open(p) {
    await flush();
    const res = await window.api.loadNote(p);
    let d;
    try { d = parse(res.text); } catch (e) { toast('Cannot open ' + p + ': ' + e.message); return false; }
    path = p; data = d; base = { mtime: res.mtime, text: res.text }; dirty = false;
    undo.length = 0; redo.length = 0; sel = new Set(); selEdge = null; editing = null;
    g('canvasPane').hidden = false;
    g('canvasTitle').textContent = baseOf(p).replace(/\.canvas$/i, '');
    state('Saved');
    render();
    fit();
    syncButtons();
    return true;
  }
  function hide() { g('canvasPane').hidden = true; path = null; }
  const active = () => !!path && !g('canvasPane').hidden;
  function state(s) { g('canvasState').textContent = s; }

  // every change goes through here: remembered for undo, saved shortly after
  function change(fn) {
    undo.push(serialise()); if (undo.length > 200) undo.shift();
    redo.length = 0;
    fn();
    dirty = true; state('Editing…');
    clearTimeout(timer); timer = setTimeout(save, SAVE_DELAY);
    render(); syncButtons();
  }
  function restore(from, to) {
    if (!from.length) return;
    to.push(serialise());
    data = JSON.parse(from.pop());
    sel = new Set([...sel].filter((id) => byId(id)));
    dirty = true; state('Editing…');
    clearTimeout(timer); timer = setTimeout(save, SAVE_DELAY);
    render(); syncButtons();
  }
  function syncButtons() { g('cvUndo').disabled = !undo.length; g('cvRedo').disabled = !redo.length; }

  async function save(force) {
    clearTimeout(timer);
    if (!path || (!dirty && !force)) return;
    if (saving) await saving;
    const p = path, text = serialise();
    dirty = false; state('Saving…');
    saving = (async () => {
      try {
        const res = await window.api.saveNote(p, text, base.mtime, force === true);
        if (p !== path) return;
        if (res.conflict) {
          dirty = true; state('Changed on disk');
          if (await Dialog.confirm('This canvas was changed outside Lanternote.\nOK = keep my version, Cancel = load the other version.')) { await save(true); }
          else { base = { mtime: res.mtime, text: res.theirs }; data = parse(res.theirs); dirty = false; render(); state('Loaded the version on disk'); }
          return;
        }
        base = { mtime: res.mtime, text };
        state('Saved');
      } catch (e) { dirty = true; state('Not saved'); toast('Could not save the canvas: ' + e.message); }
    })();
    await saving; saving = null;
  }
  async function flush() { if (dirty) await save(); else if (saving) await saving; }
  async function externalChange() {
    if (!path) return;
    const res = await window.api.loadNote(path);
    if (res.text === serialise()) { base = { mtime: res.mtime, text: res.text }; return; }
    if (!dirty) { try { data = parse(res.text); base = { mtime: res.mtime, text: res.text }; render(); state('Reloaded (changed on disk)'); } catch { /* half-written; the next event retries */ } }
  }

  // ---------------- geometry ----------------
  const byId = (id) => data.nodes.find((n) => n.id === id);
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  function anchor(n, side) {
    switch (side) {
      case 'top': return [n.x + n.width / 2, n.y];
      case 'bottom': return [n.x + n.width / 2, n.y + n.height];
      case 'left': return [n.x, n.y + n.height / 2];
      default: return [n.x + n.width, n.y + n.height / 2];
    }
  }
  // the side of `n` that faces point (px, py)
  function facing(n, px, py) {
    const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
    const dx = (px - cx) / (n.width || 1), dy = (py - cy) / (n.height || 1);
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
  }
  const normal = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
  function edgePath(e) {
    const a = byId(e.fromNode), b = byId(e.toNode);
    if (!a || !b) return null;
    const fs = e.fromSide || facing(a, b.x + b.width / 2, b.y + b.height / 2);
    const ts = e.toSide || facing(b, a.x + a.width / 2, a.y + a.height / 2);
    const [x1, y1] = anchor(a, fs), [x2, y2] = anchor(b, ts);
    const d = Math.min(150, Math.hypot(x2 - x1, y2 - y1) / 2);
    const c1 = [x1 + normal[fs][0] * d, y1 + normal[fs][1] * d], c2 = [x2 + normal[ts][0] * d, y2 + normal[ts][1] * d];
    // midpoint of the cubic, for the label
    const mx = (x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, my = (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8;
    return { d: `M${x1},${y1} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x2},${y2}`, mx, my };
  }
  const toBoard = (cx, cy) => { const r = g('cvViewport').getBoundingClientRect(); return [(cx - r.left - view.x) / view.k, (cy - r.top - view.y) / view.k]; };
  function applyView() {
    g('cvLayer').style.transform = g('cvTempLayer').style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    g('cvZoom').textContent = Math.round(view.k * 100) + '%';
    const s = 20 * view.k; // dotted background follows the board
    g('cvViewport').style.backgroundSize = `${s}px ${s}px`;
    g('cvViewport').style.backgroundPosition = `${view.x}px ${view.y}px`;
  }
  // Fit needs the pane laid out; right after it is shown it may still be
  // 0 px high, which would give a negative zoom — retry on the next frame.
  let fitPending = false;
  function fit() {
    const r = g('cvViewport').getBoundingClientRect();
    if (r.width < 120 || r.height < 120) { if (!fitPending) { fitPending = true; requestAnimationFrame(() => { fitPending = false; if (active()) fit(); }); } return; }
    if (!data.nodes.length) { view = { x: r.width / 2, y: r.height / 2, k: 1 }; applyView(); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of data.nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.width); y1 = Math.max(y1, n.y + n.height); }
    const k = Math.max(0.05, Math.min(1.2, (r.width - 80) / (x1 - x0 || 1), (r.height - 80) / (y1 - y0 || 1)));
    view = { k, x: r.width / 2 - (x0 + x1) / 2 * k, y: r.height / 2 - (y0 + y1) / 2 * k };
    applyView();
  }
  function zoomAt(f, cx, cy) {
    const r = g('cvViewport').getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const k = Math.max(0.05, Math.min(4, view.k * f));
    view.x = px - (px - view.x) * (k / view.k);
    view.y = py - (py - view.y) * (k / view.k);
    view.k = k;
    applyView();
  }

  // ---------------- drawing ----------------
  function cardBody(n) {
    if (n.type === 'text') {
      if (editing === n.id) return `<textarea class="cv-edit" spellcheck="false">${esc(n.text || '')}</textarea>`;
      return `<div class="cv-md" data-md="${esc(n.id)}"></div>`;
    }
    if (n.type === 'file') {
      const p = resolveFile(n.file);
      if (!p) return `<div class="cv-missing">File not found<br><code>${esc(n.file || '')}</code></div>`;
      if (IMG_EXT.test(p)) return `<img class="cv-img" data-vault-src="${esc(p)}" alt="${esc(baseOf(p))}">`;
      if (MD_EXT.test(p)) return `<div class="cv-file-title" data-open="${esc(p)}">${esc(stem(p))}${n.subpath ? ' › ' + esc(n.subpath.replace(/^#/, '')) : ''}</div><div class="cv-md" data-file="${esc(p)}" data-sub="${esc((n.subpath || '').replace(/^#/, ''))}"></div>`;
      return `<div class="cv-file-title" data-open="${esc(p)}">${esc(baseOf(p))}</div><div class="muted small">Double-click to open</div>`;
    }
    if (n.type === 'link') return `<div class="cv-link"><div class="cv-file-title">${esc(n.url || '')}</div><div class="muted small">Web page · double-click to open in the browser</div></div>`;
    return '';
  }
  const resolveFile = (f) => (f && V.idx.has(f) ? f : f ? resolve(f, null) : null);

  function render() {
    if (!data) return;
    const layer = g('cvLayer');
    // groups under everything else, then the file's own order (= z-order)
    const order = [...data.nodes.filter((n) => n.type === 'group'), ...data.nodes.filter((n) => n.type !== 'group')];
    let html = '';
    for (const n of order) {
      const c = colour(n.color);
      const style = `left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;${c ? `--cv-c:${c};` : ''}`;
      const cls = `cv-node cv-${n.type}${sel.has(n.id) ? ' sel' : ''}${c ? ' coloured' : ''}${editing === n.id ? ' editing' : ''}`;
      const label = n.type === 'group' ? `<div class="cv-group-label">${esc(n.label || '')}</div>` : '';
      html += `<div class="${cls}" data-id="${esc(n.id)}" style="${style}">${label}<div class="cv-body">${cardBody(n)}</div>`
        + SIDES.map((s) => `<span class="cv-dot cv-dot-${s}" data-side="${s}"></span>`).join('')
        + `<span class="cv-resize"></span></div>`;
    }
    // arrows
    let svg = '<defs><marker id="cvArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"></path></marker></defs>';
    let labels = '';
    for (const e of data.edges) {
      const p = edgePath(e);
      if (!p) continue;
      const c = colour(e.color) || 'var(--cv-edge)';
      const start = e.fromEnd === 'arrow' ? ' marker-start="url(#cvArrow)"' : '';
      const end = (e.toEnd || 'arrow') === 'arrow' ? ' marker-end="url(#cvArrow)"' : '';
      svg += `<path class="cv-edge-hit" data-edge="${esc(e.id)}" d="${p.d}"></path><path class="cv-edge${selEdge === e.id ? ' sel' : ''}" d="${p.d}" stroke="${c}"${start}${end}></path>`;
      if (e.label) labels += `<div class="cv-edge-label" data-edge="${esc(e.id)}" style="left:${p.mx}px;top:${p.my}px">${esc(e.label)}</div>`;
    }
    layer.innerHTML = `<svg class="cv-edges" width="1" height="1">${svg}</svg>${html}${labels}`;
    // Markdown inside cards: the same renderer as notes
    layer.querySelectorAll('[data-md]').forEach((el) => { const n = byId(el.dataset.md); el.innerHTML = md(n.text || ''); postProcess(el, path); });
    layer.querySelectorAll('[data-file]').forEach(async (el) => {
      const p = el.dataset.file;
      try { await ensureLoaded(p); } catch { el.textContent = 'Could not read ' + p; return; }
      if (!el.isConnected) return;
      stack.push({ from: p, depth: 1 });
      try { el.innerHTML = sanitize(renderMarkdown(p, 1, el.dataset.sub || '')); } finally { stack.pop(); }
      postProcess(el, p);
    });
    layer.querySelectorAll('[data-vault-src]').forEach((el) => { el.src = vaultUrl(el.getAttribute('data-vault-src')); });
    const ta = layer.querySelector('.cv-edit');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    applyView();
    g('cvEmpty').hidden = data.nodes.length > 0;
  }
  function md(text) {
    stack.push({ from: path, depth: 1 });
    try { return sanitize(marked.parse(text)); } finally { stack.pop(); }
  }

  // ---------------- editing actions ----------------
  function addNode(n, edit) {
    const node = { id: newId(), x: Math.round(n.x), y: Math.round(n.y), width: n.width || 260, height: n.height || 80, ...n };
    node.x = Math.round(node.x); node.y = Math.round(node.y);
    change(() => { if (node.type === 'group') data.nodes.unshift(node); else data.nodes.push(node); sel = new Set([node.id]); if (edit) editing = node.id; });
    return node;
  }
  function centre() {
    const r = g('cvViewport').getBoundingClientRect();
    return toBoard(r.left + r.width / 2, r.top + r.height / 2);
  }
  function addText() { const [x, y] = centre(); addNode({ type: 'text', text: '', x: x - 130, y: y - 40 }, true); }
  async function addFile() {
    const p = await Picker.pick('Add a note, picture or file to the canvas…');
    if (!p) return;
    const [x, y] = centre();
    const img = IMG_EXT.test(p);
    addNode({ type: 'file', file: p, x: x - 200, y: y - 150, width: 400, height: img ? 300 : 400 });
  }
  async function addLink() {
    const url = await Dialog.prompt('Web address (https://…)', 'https://');
    if (!url || !/^https?:\/\/\S+/i.test(url)) return;
    const [x, y] = centre();
    addNode({ type: 'link', url: url.trim(), x: x - 200, y: y - 60, width: 400, height: 120 });
  }
  function groupSelection() {
    const ns = [...sel].map(byId).filter(Boolean);
    if (!ns.length) { toast('Select the cards to group first (Shift+drag or Shift+click)'); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of ns) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.width); y1 = Math.max(y1, n.y + n.height); }
    addNode({ type: 'group', label: 'Group', x: x0 - 30, y: y0 - 50, width: x1 - x0 + 60, height: y1 - y0 + 80 });
  }
  function removeSelected() {
    if (!sel.size && !selEdge) return;
    change(() => {
      if (selEdge) data.edges = data.edges.filter((e) => e.id !== selEdge);
      data.nodes = data.nodes.filter((n) => !sel.has(n.id));
      data.edges = data.edges.filter((e) => !sel.has(e.fromNode) && !sel.has(e.toNode));
      sel = new Set(); selEdge = null;
    });
  }
  function setColour(c) {
    if (!sel.size && !selEdge) { toast('Select a card or an arrow first'); return; }
    change(() => {
      for (const id of sel) { const n = byId(id); if (n) { if (c) n.color = c; else delete n.color; } }
      if (selEdge) { const e = data.edges.find((x) => x.id === selEdge); if (e) { if (c) e.color = c; else delete e.color; } }
    });
  }
  function commitEdit() {
    if (!editing) return;
    const ta = g('cvLayer').querySelector('.cv-edit');
    const n = byId(editing);
    const text = ta ? ta.value : n && n.text;
    editing = null;
    if (n && text !== n.text) change(() => { n.text = text; });
    else render();
  }

  // ---------------- pointer ----------------
  let act = null; // current drag: { kind, ... }
  function wire() {
    const vp = g('cvViewport');
    vp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.target.closest('.cv-edit')) return;
      if (e.target.closest('.cv-body a, .cv-body input')) return; // links and boxes inside cards stay clickable
      const nodeEl = e.target.closest('.cv-node');
      const [bx, by] = toBoard(e.clientX, e.clientY);
      if (editing && (!nodeEl || nodeEl.dataset.id !== editing)) commitEdit();
      if (e.target.classList.contains('cv-dot')) {
        act = { kind: 'connect', from: nodeEl.dataset.id, side: e.target.dataset.side, x: bx, y: by };
      } else if (e.target.classList.contains('cv-resize')) {
        const n = byId(nodeEl.dataset.id);
        act = { kind: 'resize', n, w: n.width, h: n.height, sx: bx, sy: by, before: serialise() };
      } else if (nodeEl && e.button === 0) {
        const id = nodeEl.dataset.id;
        if (e.shiftKey) { if (sel.has(id)) sel.delete(id); else sel.add(id); }
        else if (!sel.has(id)) sel = new Set([id]);
        selEdge = null;
        // moving a group carries the cards inside it
        const moving = new Set(sel);
        for (const sid of sel) {
          const gnode = byId(sid);
          if (gnode && gnode.type === 'group') for (const m of data.nodes) if (m !== gnode && m.x >= gnode.x && m.y >= gnode.y && m.x + m.width <= gnode.x + gnode.width && m.y + m.height <= gnode.y + gnode.height) moving.add(m.id);
        }
        act = { kind: 'move', ids: [...moving], start: [...moving].map((i) => { const m = byId(i); return [m.x, m.y]; }), sx: bx, sy: by, before: serialise(), moved: false };
        render();
      } else if (e.target.closest('[data-edge]')) {
        selEdge = e.target.closest('[data-edge]').dataset.edge; sel = new Set(); render();
        return;
      } else if (e.shiftKey && e.button === 0) {
        act = { kind: 'box', sx: bx, sy: by, x: bx, y: by };
      } else {
        if (!e.shiftKey) { sel = new Set(); selEdge = null; render(); }
        act = { kind: 'pan', cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y };
      }
      vp.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    vp.addEventListener('pointermove', (e) => {
      if (!act) return;
      const [bx, by] = toBoard(e.clientX, e.clientY);
      if (act.kind === 'pan') { view.x = act.vx + e.clientX - act.cx; view.y = act.vy + e.clientY - act.cy; applyView(); }
      else if (act.kind === 'move') {
        const dx = Math.round(bx - act.sx), dy = Math.round(by - act.sy);
        if (Math.abs(dx) + Math.abs(dy) > 2) act.moved = true;
        act.ids.forEach((id, i) => { const m = byId(id); m.x = act.start[i][0] + dx; m.y = act.start[i][1] + dy; });
        render();
      } else if (act.kind === 'resize') {
        act.n.width = Math.max(80, Math.round(act.w + bx - act.sx)); act.n.height = Math.max(40, Math.round(act.h + by - act.sy));
        render();
      } else if (act.kind === 'connect' || act.kind === 'box') {
        act.x = bx; act.y = by;
        drawTemp();
      }
    });
    vp.addEventListener('pointerup', (e) => {
      if (!act) return;
      const a = act; act = null;
      g('cvTemp').innerHTML = '';
      if ((a.kind === 'move' && a.moved) || a.kind === 'resize') {
        // the drag already changed the data; record it as one step
        undo.push(a.before); if (undo.length > 200) undo.shift(); redo.length = 0;
        dirty = true; state('Editing…'); clearTimeout(timer); timer = setTimeout(save, SAVE_DELAY); syncButtons();
      } else if (a.kind === 'connect') {
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cv-node');
        if (target && target.dataset.id !== a.from) {
          const t = byId(target.dataset.id);
          const [bx, by] = toBoard(e.clientX, e.clientY);
          change(() => data.edges.push({ id: newId(), fromNode: a.from, fromSide: a.side, toNode: t.id, toSide: facing(t, bx, by) }));
        }
      } else if (a.kind === 'box') {
        const x0 = Math.min(a.sx, a.x), y0 = Math.min(a.sy, a.y), x1 = Math.max(a.sx, a.x), y1 = Math.max(a.sy, a.y);
        for (const n of data.nodes) if (n.x >= x0 && n.y >= y0 && n.x + n.width <= x1 && n.y + n.height <= y1) sel.add(n.id);
        render();
      }
    });
    vp.addEventListener('dblclick', (e) => {
      const nodeEl = e.target.closest('.cv-node');
      const edgeEl = e.target.closest('[data-edge]');
      if (edgeEl && !nodeEl) { editEdgeLabel(edgeEl.dataset.edge); return; }
      if (!nodeEl) { const [bx, by] = toBoard(e.clientX, e.clientY); addNode({ type: 'text', text: '', x: bx - 130, y: by - 40 }, true); return; }
      const n = byId(nodeEl.dataset.id);
      if (n.type === 'text') { editing = n.id; sel = new Set([n.id]); render(); }
      else if (n.type === 'file') { const p = resolveFile(n.file); if (p) openNote(p, (n.subpath || '').replace(/^#/, '')); }
      else if (n.type === 'link') window.api.openExternal(n.url);
      else if (n.type === 'group') renameGroup(n);
    });
    vp.addEventListener('wheel', (e) => {
      if (e.target.closest('.cv-edit') || (e.target.closest('.cv-body') && !e.ctrlKey && canScroll(e.target.closest('.cv-body'), e.deltaY))) return;
      e.preventDefault();
      if (e.ctrlKey) zoomAt(Math.pow(1.0022, -e.deltaY), e.clientX, e.clientY);
      else { view.x -= e.shiftKey ? e.deltaY : e.deltaX; view.y -= e.shiftKey ? 0 : e.deltaY; applyView(); }
    }, { passive: false });
    // links inside cards open notes, like everywhere else (handled by app.js)
    vp.addEventListener('keydown', (e) => { if (e.target.closest('.cv-edit') && e.key === 'Escape') { e.preventDefault(); commitEdit(); } });
    vp.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('.cv-edit')) setTimeout(() => { if (editing && !g('cvLayer').querySelector('.cv-edit:focus')) commitEdit(); }, 0); });

    g('cvText').onclick = addText;
    g('cvFile').onclick = addFile;
    g('cvLink').onclick = addLink;
    g('cvGroup').onclick = groupSelection;
    g('cvDelete').onclick = removeSelected;
    g('cvFit').onclick = fit;
    g('cvUndo').onclick = () => restore(undo, redo);
    g('cvRedo').onclick = () => restore(redo, undo);
    g('cvColour').onchange = () => { setColour(g('cvColour').value); g('cvColour').value = ''; };
    document.addEventListener('keydown', (e) => {
      if (!active() || !g('palette').hidden || !g('dialog').hidden || e.target.closest('input, textarea, select, .cm-editor')) return;
      const k = e.key.toLowerCase();
      if (k === 'delete' || k === 'backspace') { removeSelected(); e.preventDefault(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { restore(undo, redo); e.preventDefault(); }
      else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { restore(redo, undo); e.preventDefault(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'a') { sel = new Set(data.nodes.map((n) => n.id)); render(); e.preventDefault(); }
      else if (e.shiftKey && k === '!') { fit(); }
    });
    let fitted = false;
    new ResizeObserver(() => { if (!active()) return; if (!fitted) { fitted = true; fit(); } else applyView(); }).observe(vp);
  }
  const canScroll = (el, dy) => el.scrollHeight > el.clientHeight && ((dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight) || (dy < 0 && el.scrollTop > 0));
  function drawTemp() {
    const a = act;
    if (a.kind === 'connect') {
      const n = byId(a.from); const [x1, y1] = anchor(n, a.side);
      g('cvTemp').innerHTML = `<path class="cv-edge temp" d="M${x1},${y1} L${a.x},${a.y}"></path>`;
    } else {
      const x0 = Math.min(a.sx, a.x), y0 = Math.min(a.sy, a.y);
      g('cvTemp').innerHTML = `<rect class="cv-box" x="${x0}" y="${y0}" width="${Math.abs(a.x - a.sx)}" height="${Math.abs(a.y - a.sy)}"></rect>`;
    }
  }
  async function editEdgeLabel(id) {
    const e = data.edges.find((x) => x.id === id); if (!e) return;
    const v = await Dialog.prompt('Label on this arrow (empty = none)', e.label || '');
    if (v == null) return;
    change(() => { if (v.trim()) e.label = v.trim(); else delete e.label; });
  }
  async function renameGroup(n) {
    const v = await Dialog.prompt('Group name', n.label || '');
    if (v == null) return;
    change(() => { n.label = v; });
  }

  // ---------------- new canvas ----------------
  async function create(dir) {
    await flush();
    if (dir == null) dir = current ? dirOf(current) : '';
    let rel = null;
    for (let i = 0; i < 1000 && !rel; i++) { const c = (dir ? dir + '/' : '') + 'Untitled' + (i ? ' ' + i : '') + '.canvas'; if (!(await window.api.exists(c))) rel = c; }
    await window.api.createNote(rel, JSON.stringify({ nodes: [], edges: [] }, null, '\t'));
    for (let i = 0; i < 40 && !V.idx.has(rel); i++) await new Promise((r) => setTimeout(r, 100));
    current = null;
    await openNote(rel);
  }

  // when a note is renamed, canvases that show it follow
  async function renameFileIn(from, to) {
    let n = 0;
    for (const c of V.files.filter((f) => /\.canvas$/i.test(f))) {
      try {
        const res = await window.api.loadNote(c);
        const d = parse(res.text);
        let hit = false;
        for (const node of d.nodes) if (node.type === 'file' && node.file === from) { node.file = to; hit = true; }
        if (!hit) continue;
        const r = await window.api.saveNote(c, JSON.stringify(d, null, '\t'), res.mtime);
        if (!r.conflict) n++;
        if (c === path) { data = d; base = { mtime: r.mtime, text: JSON.stringify(d, null, '\t') }; render(); }
      } catch { /* not a canvas we can read */ }
    }
    return n;
  }

  wire();
  return {
    get path() { return path; },
    get data() { return data; }, // for the test driver
    open, hide, active, flush, externalChange, create, renameFileIn, fit,
    addNode, // for the test driver
  };
})();

// A picker for vault files (reuses the quick-open box).
const Picker = (() => {
  let resolveFn = null, filter = null;
  // filter: optional (path) => boolean limiting the choice (e.g. a templates folder)
  function pick(placeholder, f) {
    return new Promise((res) => {
      resolveFn = res; filter = f || null;
      openSwitcher({ picking: true, placeholder });
    });
  }
  function done(p) { const r = resolveFn; resolveFn = null; filter = null; if (r) r(p || null); }
  return { pick, done, get active() { return !!resolveFn; }, get filter() { return filter; } };
})();
