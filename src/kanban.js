// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — Kanban boards. A board is an ordinary Markdown note:
//   front matter `kanban-plugin: board` (the common board format, so boards
//   made elsewhere open here and the other way round), every `## Heading` a
//   lane, every `- [ ] text` a card (indented lines below it belong to it),
//   a `**Complete**` line marks a lane whose cards count as done.
// Everything before the first lane and after the lanes (`***` archive,
// `%% kanban:settings … %%`) is kept exactly as it was.
// Cards are also ordinary task lines, so TASK queries see them.
'use strict';

const KanbanView = (() => {
  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SAVE_DELAY = 600;
  const CARD = /^- \[(.)\] ?(.*)$/, PLAIN = /^- (?!\[.\])(.*)$/;
  const COMPLETE = /^\*\*Complete\*\*\s*$/;

  let path = null, board = null, base = null, dirty = false, timer = 0, saving = null;
  let filter = '', editing = null;
  const undo = [], redo = [];
  const raw = new Set(); // boards the user chose to see as text

  const isBoard = (text) => { const { fm } = splitFm(text || ''); return !!fm && Object.keys(fm).some((k) => k.trim().toLowerCase() === 'kanban-plugin'); };

  // ---------------- file ↔ board ----------------
  function parse(text) {
    const lines = text.split(/\r?\n/);
    const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
    let i = m ? m[0].split(/\r?\n/).length - (m[0].endsWith('\n') ? 1 : 0) : 0;
    const start = i;
    while (i < lines.length && !/^## /.test(lines[i]) && !isTail(lines[i])) i++;
    const pre = lines.slice(0, i);
    const lanes = [];
    let fence = false;
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (!fence && isTail(l)) break;
      if (/^\s*(```|~~~)/.test(l)) fence = !fence;
      if (!fence && /^## /.test(l)) { lanes.push({ title: l.slice(3).trim(), meta: [], cards: [] }); continue; }
      const lane = lanes[lanes.length - 1];
      const card = lane && lane.cards[lane.cards.length - 1];
      if (!fence && (CARD.test(l) || PLAIN.test(l))) { lane.cards.push({ lines: [l] }); continue; }
      if (card && (/^[ \t]+\S/.test(l) || fence)) { card.lines.push(l); continue; }
      if (lane && l.trim()) lane.meta.push(l);
    }
    const tail = lines.slice(i);
    return { pre, lanes, tail, eol: text.includes('\r\n') ? '\r\n' : '\n', start };
  }
  function isTail(l) { return /^\*\*\*\s*$/.test(l) || /^%% kanban:settings/.test(l); }
  function serialise(b = board) {
    const pre = b.pre.slice(); while (pre.length && !pre[pre.length - 1].trim()) pre.pop();
    let out = pre.join('\n') + (pre.length ? '\n\n' : '');
    for (const lane of b.lanes) out += `## ${lane.title}\n\n` + lane.meta.concat(...lane.cards.map((c) => c.lines)).map((l) => l + '\n').join('') + '\n\n';
    if (b.tail.length) out += b.tail.join('\n'); else out = out.replace(/\n+$/, '\n');
    return b.eol === '\r\n' ? out.replace(/\r?\n/g, '\r\n') : out;
  }
  const cardText = (c) => { const m = CARD.exec(c.lines[0]) || PLAIN.exec(c.lines[0]); const first = m ? m[m.length - 1] : c.lines[0]; return [first, ...c.lines.slice(1).map((l) => l.replace(/^(\t| {1,4})/, ''))].join('\n'); };
  const cardStatus = (c) => { const m = CARD.exec(c.lines[0]); return m ? m[1] : null; };
  function setCard(c, text, status = cardStatus(c)) {
    const [first, ...rest] = String(text).replace(/\r/g, '').split('\n');
    c.lines = [(status == null ? '- ' : `- [${status}] `) + first, ...rest.map((l) => '    ' + l)];
  }
  const doneLane = (lane) => lane.meta.some((l) => COMPLETE.test(l));

  // ---------------- open / save ----------------
  async function open(p) {
    await flush();
    const res = await window.api.loadNote(p);
    path = p; board = parse(res.text); base = { mtime: res.mtime, text: res.text }; dirty = false;
    undo.length = redo.length = 0; editing = null; filter = ''; g('kbFilter').value = '';
    g('boardPane').hidden = false;
    g('kbTitle').textContent = stem(p);
    state('Saved'); render(); sync();
    return true;
  }
  function hide() { g('boardPane').hidden = true; path = null; editing = null; }
  const active = () => !!path && !g('boardPane').hidden;
  const state = (s) => { g('kbState').textContent = s; };
  function sync() { g('kbUndo').disabled = !undo.length; g('kbRedo').disabled = !redo.length; }
  function change(fn) {
    undo.push(serialise()); if (undo.length > 200) undo.shift(); redo.length = 0;
    fn();
    dirty = true; state('Editing…'); clearTimeout(timer); timer = setTimeout(save, SAVE_DELAY);
    render(); sync(); renderSide();
  }
  function restore(from, to) {
    if (!from.length) return;
    to.push(serialise()); board = parse(from.pop());
    dirty = true; state('Editing…'); clearTimeout(timer); timer = setTimeout(save, SAVE_DELAY);
    render(); sync();
  }
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
          if (await Dialog.confirm('This board was changed outside Lanternote.\nOK = keep my version, Cancel = load the other version.')) await save(true);
          else { base = { mtime: res.mtime, text: res.theirs }; board = parse(res.theirs); dirty = false; render(); state('Loaded the version on disk'); }
          return;
        }
        base = { mtime: res.mtime, text }; cacheText(p, text);
        state('Saved');
      } catch (e) { dirty = true; state('Not saved'); toast('Could not save the board: ' + e.message); }
    })();
    await saving; saving = null;
  }
  async function flush() { if (editing) commitEdit(); if (dirty) await save(); else if (saving) await saving; }
  async function externalChange() {
    if (!path) return;
    const res = await window.api.loadNote(path);
    if (res.text === serialise()) { base = { mtime: res.mtime, text: res.text }; return; }
    if (!dirty && !editing) { board = parse(res.text); base = { mtime: res.mtime, text: res.text }; render(); state('Reloaded (changed on disk)'); }
  }

  // ---------------- drawing ----------------
  function inline(text) {
    const t = text
      .replace(/@\{(\d{4}-\d\d-\d\d)\}/g, '📅 $1') // the board format's own date syntax
      .replace(/(📅|⏳|🛫)️?\s*(\d{4}-\d\d-\d\d)/g, (all, e, d) => {
        const day = new Date(d + 'T00:00'), today = new Date(); today.setHours(0, 0, 0, 0);
        const cls = e !== '📅' ? '' : day < today ? ' late' : day - today < 3 * 864e5 ? ' soon' : '';
        return `<span class="kb-date${cls}">${e} ${d}</span>`;
      });
    stack.push({ from: path, depth: 1 });
    try { return sanitize(marked.parse(t, { breaks: true })); } finally { stack.pop(); }
  }
  function render() {
    if (!board) return;
    const f = filter.toLowerCase();
    const host = g('kbLanes');
    const sx = host.scrollLeft;
    host.innerHTML = board.lanes.map((lane, li) => {
      const cards = lane.cards.map((c, ci) => {
        const text = cardText(c), st = cardStatus(c);
        if (f && !text.toLowerCase().includes(f)) return '';
        if (editing && editing.lane === li && editing.card === ci) {
          return `<div class="kb-card editing" data-li="${li}" data-ci="${ci}"><textarea class="kb-edit" rows="3">${esc(text)}</textarea><div class="muted small">Enter saves · Shift+Enter new line · Esc cancels</div></div>`;
        }
        return `<div class="kb-card${st && st !== ' ' ? ' done' : ''}" draggable="true" data-li="${li}" data-ci="${ci}">
          ${st != null ? `<input type="checkbox" class="kb-check"${st !== ' ' ? ' checked' : ''} title="Done">` : ''}
          <div class="kb-text">${inline(text)}</div>
          <button class="kb-del" title="Delete card">✕</button></div>`;
      }).join('');
      const adding = editing && editing.lane === li && editing.card === -1;
      return `<section class="kb-lane${doneLane(lane) ? ' complete' : ''}" data-li="${li}">
        <header class="kb-lane-head" draggable="true" data-li="${li}">
          ${editing && editing.lane === li && editing.card === 'title' ? `<input class="kb-title-edit field" value="${esc(lane.title)}">` : `<span class="kb-lane-title" title="Double-click to rename">${esc(lane.title)}</span>`}
          <span class="kb-count">${lane.cards.length}</span>
          <button class="kb-lane-menu" title="Lane options">⋯</button>
        </header>
        <div class="kb-cards" data-li="${li}">${cards}${adding ? `<div class="kb-card editing"><textarea class="kb-edit" rows="3" placeholder="Card text — [[links]], #tags, 📅 2026-10-01"></textarea><div class="muted small">Enter adds · Esc cancels</div></div>` : ''}</div>
        ${adding ? '' : '<button class="kb-add" title="Add a card">+ Add a card</button>'}
      </section>`;
    }).join('') + '<button class="kb-add-lane" title="Add a lane">+ Add a lane</button>';
    host.scrollLeft = sx;
    host.querySelectorAll('[data-vault-src]').forEach((el) => { el.src = vaultUrl(el.getAttribute('data-vault-src')); });
    const ed = host.querySelector('.kb-edit, .kb-title-edit');
    if (ed) { ed.focus(); if (ed.tagName === 'TEXTAREA') ed.setSelectionRange(ed.value.length, ed.value.length); else ed.select(); }
    const total = board.lanes.reduce((n, l) => n + l.cards.length, 0), done = board.lanes.reduce((n, l) => n + l.cards.filter((c) => { const s = cardStatus(c); return s && s !== ' '; }).length, 0);
    g('kbInfo').textContent = `${total} card${total === 1 ? '' : 's'} · ${done} done`;
  }

  // ---------------- editing ----------------
  function commitEdit(cancel) {
    const e = editing; if (!e) return;
    const el = g('kbLanes').querySelector('.kb-edit, .kb-title-edit');
    const v = el ? el.value : '';
    editing = null;
    if (cancel) { render(); return; }
    const lane = board.lanes[e.lane];
    if (e.card === 'title') { const t = v.trim(); if (t && t !== lane.title) change(() => { lane.title = t; }); else render(); return; }
    if (e.card === -1) { if (v.trim()) change(() => { const c = { lines: [] }; setCard(c, v.trim(), doneLane(lane) ? 'x' : ' '); lane.cards.push(c); }); else render(); return; }
    const c = lane.cards[e.card];
    if (v.trim() && v !== cardText(c)) change(() => setCard(c, v.trimEnd())); else render();
  }
  function move(fromL, fromC, toL, toC) {
    change(() => {
      const [c] = board.lanes[fromL].cards.splice(fromC, 1);
      if (fromL === toL && toC > fromC) toC--;
      const lane = board.lanes[toL];
      const st = cardStatus(c);
      if (st != null && fromL !== toL) {
        if (doneLane(lane)) setCard(c, cardText(c), 'x');
        else if (doneLane(board.lanes[fromL]) && (st === 'x' || st === 'X')) setCard(c, cardText(c), ' ');
      }
      lane.cards.splice(toC, 0, c);
    });
  }
  function moveLane(from, to) {
    if (to === from || to === from + 1) return;
    change(() => { const [l] = board.lanes.splice(from, 1); board.lanes.splice(to > from ? to - 1 : to, 0, l); });
  }
  async function laneMenu(li, x, y) {
    const lane = board.lanes[li];
    const items = [
      ['Rename lane', () => { editing = { lane: li, card: 'title' }; render(); }],
      [doneLane(lane) ? 'Cards here are not done' : 'Cards here count as done', () => change(() => { if (doneLane(lane)) lane.meta = lane.meta.filter((l) => !COMPLETE.test(l)); else { lane.meta.unshift('**Complete**'); lane.cards.forEach((c) => { if (cardStatus(c) === ' ') setCard(c, cardText(c), 'x'); }); } })],
      ['Sort cards by due date', () => change(() => { const due = (c) => (/(?:📅️?\s*|@\{)(\d{4}-\d\d-\d\d)/.exec(cardText(c)) || [, '9999'])[1]; lane.cards.sort((a, b) => due(a).localeCompare(due(b))); })],
      ['Delete done cards in this lane', () => change(() => { lane.cards = lane.cards.filter((c) => { const s = cardStatus(c); return !s || s === ' '; }); })],
      ['Delete lane', async () => { if (!lane.cards.length || (await Dialog.confirm(`Delete the lane "${lane.title}" and its ${lane.cards.length} card(s)?`))) change(() => { board.lanes.splice(li, 1); }); }],
    ];
    const m = g('ctxMenu');
    m.innerHTML = items.map(([t], i) => `<div class="ctx-item" data-kb-mi="${i}">${esc(t)}</div>`).join('');
    m.style.left = x + 'px'; m.style.top = y + 'px'; m.hidden = false;
    m.onclick = (e) => { const d = e.target.closest('[data-kb-mi]'); if (!d) return; m.hidden = true; m.onclick = null; items[+d.dataset.kbMi][1](); };
  }

  // ---------------- wiring ----------------
  function wire() {
    const host = g('kbLanes');
    host.addEventListener('click', (e) => {
      const t = e.target;
      const cardEl = t.closest('.kb-card');
      if (t.matches('.kb-check')) {
        e.preventDefault();
        const li = +cardEl.dataset.li, ci = +cardEl.dataset.ci, c = board.lanes[li].cards[ci];
        change(() => setCard(c, cardText(c), cardStatus(c) === ' ' ? 'x' : ' '));
        return;
      }
      if (t.matches('.kb-del')) { const li = +cardEl.dataset.li, ci = +cardEl.dataset.ci; change(() => board.lanes[li].cards.splice(ci, 1)); return; }
      if (t.matches('.kb-add')) { if (editing) commitEdit(); editing = { lane: +t.closest('.kb-lane').dataset.li, card: -1 }; render(); return; }
      if (t.matches('.kb-add-lane')) {
        if (editing) commitEdit();
        change(() => board.lanes.push({ title: 'New lane', meta: [], cards: [] }));
        editing = { lane: board.lanes.length - 1, card: 'title' }; render();
        return;
      }
      if (t.matches('.kb-lane-menu')) { const r = t.getBoundingClientRect(); laneMenu(+t.closest('.kb-lane').dataset.li, r.left, r.bottom + 4); return; }
      if (editing && !t.closest('.editing, .kb-title-edit')) commitEdit();
    });
    host.addEventListener('dblclick', (e) => {
      if (e.target.closest('a, input, textarea, button')) return;
      const cardEl = e.target.closest('.kb-card:not(.editing)');
      if (cardEl) { if (editing) commitEdit(); editing = { lane: +cardEl.dataset.li, card: +cardEl.dataset.ci }; render(); return; }
      const title = e.target.closest('.kb-lane-title');
      if (title) { if (editing) commitEdit(); editing = { lane: +title.closest('.kb-lane').dataset.li, card: 'title' }; render(); return; }
      const lane = e.target.closest('.kb-cards');
      if (lane) { if (editing) commitEdit(); editing = { lane: +lane.dataset.li, card: -1 }; render(); }
    });
    host.addEventListener('keydown', (e) => {
      if (!e.target.matches('.kb-edit, .kb-title-edit')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commitEdit(true); }
      else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const add = editing && editing.card === -1 ? editing.lane : null;
        commitEdit();
        if (add != null) { editing = { lane: add, card: -1 }; render(); } // keep adding cards
      }
    });
    // drag and drop: cards between and inside lanes, lanes by their header
    let drag = null;
    const clearMarks = () => host.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
    host.addEventListener('dragstart', (e) => {
      const head = e.target.closest('.kb-lane-head'), card = e.target.closest('.kb-card');
      if (head) drag = { lane: +head.dataset.li };
      else if (card) drag = { li: +card.dataset.li, ci: +card.dataset.ci };
      else return;
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'kanban');
      (head ? head.parentElement : card).classList.add('dragging');
    });
    host.addEventListener('dragend', () => { drag = null; clearMarks(); host.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging')); });
    function target(e) {
      const laneEl = e.target.closest('.kb-lane'); if (!laneEl) return null;
      const li = +laneEl.dataset.li;
      if (drag.lane != null) { const r = laneEl.getBoundingClientRect(); return { lane: li, to: e.clientX < r.left + r.width / 2 ? li : li + 1, el: laneEl, before: e.clientX < r.left + r.width / 2 }; }
      const cards = [...laneEl.querySelectorAll('.kb-card[data-ci]')];
      let to = board.lanes[li].cards.length, el = null, before = false;
      for (const c of cards) { const r = c.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { to = +c.dataset.ci; el = c; before = true; break; } el = c; }
      return { li, to, el: el || laneEl.querySelector('.kb-cards'), before, empty: !cards.length };
    }
    host.addEventListener('dragover', (e) => {
      if (!drag) return;
      const t = target(e); if (!t) return;
      e.preventDefault(); clearMarks();
      t.el.classList.add(t.empty ? 'drop-into' : t.before ? 'drop-before' : 'drop-after');
    });
    host.addEventListener('drop', (e) => {
      if (!drag) return;
      const t = target(e); e.preventDefault(); clearMarks();
      if (!t) return;
      if (drag.lane != null) moveLane(drag.lane, t.to);
      else if (!(t.li === drag.li && (t.to === drag.ci || t.to === drag.ci + 1))) move(drag.li, drag.ci, t.li, t.to);
      drag = null;
    });
    g('kbFilter').addEventListener('input', () => { filter = g('kbFilter').value.trim(); render(); });
    g('kbUndo').onclick = () => restore(undo, redo);
    g('kbRedo').onclick = () => restore(redo, undo);
    g('kbText').onclick = () => asText();
    g('boardPane').addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); restore(undo, redo); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(redo, undo); }
    });
  }

  // show the board's Markdown in the editor; "Board view" in the note brings it back
  async function asText() {
    const p = path; if (!p) return;
    await flush();
    raw.add(p); hide(); g('main').classList.remove('board-mode');
    current = null;
    if (Ed.mode !== 'edit') await Ed.toggleTo('edit');
    await openNote(p, '', { push: false });
  }
  async function asBoard(p) { raw.delete(p); await Ed.flush(); Ed.hide(); current = null; await openNote(p, '', { push: false }); }

  async function create(dir) {
    if (dir == null) dir = current ? dirOf(current) : '';
    let rel = null;
    for (let i = 0; i < 1000 && !rel; i++) { const c = (dir ? dir + '/' : '') + 'Board' + (i ? ' ' + i : '') + '.md'; if (!(await window.api.exists(c))) rel = c; }
    await window.api.createNote(rel, TEMPLATE);
    for (let i = 0; i < 40 && !isNote(rel); i++) await new Promise((r) => setTimeout(r, 100));
    current = null;
    await openNote(rel);
  }
  const TEMPLATE = '---\n\nkanban-plugin: board\n\n---\n\n## To do\n\n\n\n## Doing\n\n\n\n## Done\n\n**Complete**\n\n\n%% kanban:settings\n```\n{"kanban-plugin":"board"}\n```\n%%\n';

  wire();
  return {
    isBoard, open, hide, active, flush, externalChange, create, asText, asBoard, raw, parse, serialise,
    get path() { return path; }, get board() { return board; },
  };
})();
