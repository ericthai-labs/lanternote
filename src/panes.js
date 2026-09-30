// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — tabs and the right pane.
//   • Tabs: the main pane holds several notes; each tab keeps its own
//     Back / Forward history (the globals `hist` / `hIdx` are the active
//     tab's). Ctrl+T, Ctrl+W, Ctrl+Tab; Ctrl+click or middle-click a link
//     opens it in a new tab. The tabs of each folder are remembered.
//   • Split: a second pane on the right with tabs of its own, for reading
//     one note while writing another. It reads and edits (with its own
//     editor, saved the same way); Alt+click a link to open it in the other pane.
'use strict';

// Loaded before app.js: nothing here runs app.js code until a folder opens.
const { Tabs, Split } = (() => {
const g = (id) => document.getElementById(id);

// the shared tab strip: [{ path, hist, hIdx, scroll }]
function tabStrip(el, { label, onSwitch, onClose, onNew }) {
  const S = { list: [], active: -1 };
  S.cur = () => S.list[S.active];
  S.render = () => {
    el.innerHTML = S.list.map((t, i) => {
      const name = label(t);
      return `<div class="tab${i === S.active ? ' on' : ''}" data-tab-i="${i}" title="${esc(t.path || name)}" draggable="true"><span class="tab-name">${esc(name)}</span><button class="tab-x" data-tab-x="${i}" title="Close tab (Ctrl+W)">×</button></div>`;
    }).join('') + '<button class="tab-new" title="New tab (Ctrl+T)">+</button>';
  };
  el.addEventListener('mousedown', (e) => { if (e.button === 1 && e.target.closest('[data-tab-i]')) e.preventDefault(); });
  el.addEventListener('click', (e) => {
    const x = e.target.closest('[data-tab-x]');
    if (x) { e.stopPropagation(); onClose(+x.dataset.tabX); return; }
    if (e.target.closest('.tab-new')) { onNew(); return; }
    const t = e.target.closest('[data-tab-i]');
    if (t && +t.dataset.tabI !== S.active) onSwitch(+t.dataset.tabI);
  });
  el.addEventListener('auxclick', (e) => { const t = e.target.closest('[data-tab-i]'); if (t && e.button === 1) { e.preventDefault(); onClose(+t.dataset.tabI); } });
  // drag a tab to reorder
  let drag = -1;
  el.addEventListener('dragstart', (e) => { const t = e.target.closest('[data-tab-i]'); if (!t) return; drag = +t.dataset.tabI; e.dataTransfer.effectAllowed = 'move'; });
  el.addEventListener('dragover', (e) => { if (drag >= 0) e.preventDefault(); });
  el.addEventListener('drop', (e) => {
    const t = e.target.closest('[data-tab-i]'); if (drag < 0 || !t) return;
    e.preventDefault();
    const to = +t.dataset.tabI, keep = S.cur();
    const [m] = S.list.splice(drag, 1); S.list.splice(to, 0, m);
    S.active = S.list.indexOf(keep); drag = -1; S.render(); S.moved && S.moved();
  });
  el.addEventListener('dragend', () => { drag = -1; });
  return S;
}
const tabLabel = (t) => (t.label ? t.label : !t.path ? 'New tab' : MD_EXT.test(t.path) ? stem(t.path) : CANVAS_EXT.test(t.path) ? baseOf(t.path).replace(CANVAS_EXT, '') : baseOf(t.path));

// ---------------- tabs of the main pane ----------------
const Tabs = (() => {
  const S = tabStrip(g('tabbar'), { label: tabLabel, onSwitch: (i) => switchTo(i), onClose: (i) => close(i), onNew: () => newTab() });
  S.moved = () => save();
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { if (V.name) window.api.setSetting('tabs:' + V.name, { tabs: S.list.map((t) => t.path).filter(Boolean), active: S.active }); }, 300);
  }
  function stash() { const t = S.cur(); if (t) { t.hIdx = hIdx; t.scroll = g('main').scrollTop; } }
  function adopt(t) { hist = t.hist; hIdx = t.hIdx; }

  // the main pane now shows `current` (or a help page: label)
  function sync(lbl) {
    if (!S.cur()) { S.list = [{ path: null, hist, hIdx }]; S.active = 0; }
    const t = S.cur();
    t.path = current; t.label = current ? '' : lbl || ''; t.hist = hist; t.hIdx = hIdx;
    S.render(); save();
    g('tabbar').hidden = false;
  }
  async function switchTo(i) {
    if (i < 0 || i >= S.list.length || i === S.active) return;
    stash();
    S.active = i;
    const t = S.cur();
    adopt(t);
    S.render();
    if (!t.path) { current = null; if (t.label === 'User guide') openGuide(); else if (t.label === "What's new") openDoc('changelog'); else { await Ed.flush(); Ed.hide(); g('note').hidden = true; g('welcome').hidden = false; } return; }
    current = null;
    await openNote(t.path, '', { push: false });
    if (current === t.path && t.scroll) g('main').scrollTop = t.scroll;
    save();
  }
  // a note in a new tab after the active one
  async function openNew(p, sub = '') {
    stash();
    const t = { path: null, hist: [], hIdx: -1 };
    S.list.splice(S.active + 1, 0, t);
    S.active += 1;
    adopt(t);
    current = null;
    S.render();
    await openNote(p, sub);
    if (!S.list.includes(t)) return;
    if (!t.path && S.list.length > 1) close(S.list.indexOf(t)); // it could not be opened
  }
  // Ctrl+T: pick a note, it opens in a new tab
  function newTab() { openSwitcher({ placeholder: 'Open in a new tab…', newTab: true }); }
  async function close(i = S.active) {
    if (i < 0 || i >= S.list.length) return;
    if (S.list.length === 1) { toast('This is the last tab'); return; }
    if (i === S.active) await Ed.flush();
    const wasActive = i === S.active;
    S.list.splice(i, 1);
    if (!wasActive) { if (i < S.active) S.active--; S.render(); save(); return; }
    S.active = -1;
    await switchTo(Math.min(i, S.list.length - 1));
  }
  const cycle = (step) => switchTo((S.active + step + S.list.length) % S.list.length);

  // a new folder: bring back its tabs, or open `first`
  async function restore(first) {
    const saved = await window.api.getSetting('tabs:' + V.name);
    const ok = (p) => p && (isNote(p) || (CANVAS_EXT.test(p) && V.idx.has(p)));
    const paths = saved && Array.isArray(saved.tabs) ? saved.tabs.filter(ok).slice(0, 30) : [];
    if (!paths.length) {
      S.list = [{ path: null, hist: [], hIdx: -1 }]; S.active = 0; adopt(S.cur()); current = null;
      if (first) await openNote(first); else { g('note').hidden = true; g('welcome').hidden = false; S.render(); }
      return;
    }
    S.list = paths.map((p) => ({ path: p, hist: [p], hIdx: 0 }));
    S.active = Math.min(Math.max(0, saved.active | 0), S.list.length - 1);
    adopt(S.cur()); current = null;
    S.render();
    await openNote(S.cur().path, '', { push: false });
  }
  function renamed(from, to) {
    for (const t of S.list) { if (t.path === from) t.path = to; t.hist.forEach((p, k) => { if (p === from) t.hist[k] = to; }); }
    S.render(); save();
  }
  return {
    sync, switchTo, openNew, newTab, close, cycle, restore, renamed,
    get list() { return S.list; }, get active() { return S.active; },
  };
})();

// ---------------- the right pane ----------------
const Split = (() => {
  const S = tabStrip(g('splitTabs'), { label: tabLabel, onSwitch: (i) => switchTo(i), onClose: (i) => close(i), onNew: () => openSwitcher({ placeholder: 'Open in the right pane…', split: true }) });
  S.moved = () => save();
  const art = g('splitNote'), host = g('splitEditor');
  let mode = 'read';            // 'read' | 'edit'
  let cm = null, base = null, dirty = false, timer = 0, saving = null, conflict = null;
  let shown = null;             // the note on screen in this pane
  let seq = 0;

  const open_ = () => !g('split').hidden;
  const path = () => (S.cur() ? S.cur().path : null);
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { if (V.name) window.api.setSetting('split:' + V.name, open_() ? { tabs: S.list.map((t) => t.path).filter(Boolean), active: S.active, mode } : null); }, 300);
  }
  function setWidth(pct) { g('panes').style.setProperty('--split', Math.min(80, Math.max(20, pct)) + '%'); }

  // ---- editor of this pane ----
  function ensureEditor() {
    if (cm) return;
    cm = LanternoteEditor.create(host, {
      dark: isDark(),
      onChange: () => { dirty = true; state('Editing…'); clearTimeout(timer); timer = setTimeout(saveNow, Prefs.get('autosaveDelay') * 1000); },
      spellcheck: () => Prefs.get('spellcheck'),
      linkOptions: (q) => Ed.linkOptions(q), tagOptions: (q) => Ed.tagOptions(q),
      onPasteFiles: (files) => Ed.pasteFiles(files, shown),
      livePreview: Prefs.get('livePreview'),
      imageUrl: (src, wiki) => pictureUrl(src, shown, wiki),
      onOpenLink: (link, how) => followLink(link, shown, { ...how, pane: 'split' }),
    });
  }
  function state(s) { g('splitState').textContent = s; }
  async function saveNow(force) {
    clearTimeout(timer);
    if (!shown || !cm || (!dirty && !force)) return;
    if (saving) { await saving; if (!dirty && !force) return; }
    const p = shown, text = cm.getValue();
    dirty = false; state('Saving…');
    saving = (async () => {
      try {
        const res = await window.api.saveNote(p, text, base.mtime, force === true);
        if (p !== shown) return;
        if (res.conflict) { dirty = true; conflict = res; g('splitConflict').hidden = false; state('Changed elsewhere'); return; }
        base = { mtime: res.mtime, text }; cacheText(p, text); state('Saved');
      } catch (e) { dirty = true; state('Not saved'); toast('Could not save: ' + e.message); }
    })();
    await saving; saving = null;
  }
  async function flush() { if (dirty) await saveNow(); else if (saving) await saving; }

  // ---- showing ----
  async function show(sub = '') {
    const p = path();
    const my = ++seq;
    await flush();
    if (!p) { shown = null; art.innerHTML = '<div class="muted small split-empty">Empty — pick a note with +</div>'; art.hidden = false; host.hidden = true; return; }
    if (!isNote(p)) { shown = null; art.innerHTML = `<div class="muted small split-empty">${esc(p)} — not found (renamed or removed?)</div>`; art.hidden = false; host.hidden = true; return; }
    if (mode === 'edit') {
      ensureEditor();
      const res = await window.api.loadNote(p);
      if (my !== seq) return;
      shown = p; base = { mtime: res.mtime, text: res.text }; dirty = false; conflict = null; g('splitConflict').hidden = true;
      cm.open(p, res.text);
      art.hidden = true; host.hidden = false; state('Saved');
    } else {
      try { await ensureLoaded(p); } catch (e) { toast('Could not read the note: ' + e.message); return; }
      if (my !== seq) return;
      shown = p;
      art.innerHTML = sanitize(`<div class="inline-title">${esc(stem(p))}</div>` + renderMarkdown(p));
      postProcess(art, p);
      art.querySelectorAll('input[type=checkbox][data-task]').forEach((cb) => { cb.dataset.splitTask = cb.dataset.task; delete cb.dataset.task; });
      art.hidden = false; host.hidden = true; state('');
      if (sub) scrollIn(sub); else g('splitBody').scrollTop = 0;
    }
    g('splitEdit').classList.toggle('on', mode === 'edit');
    S.render();
  }
  function scrollIn(sub) {
    const el = art.querySelector('#' + CSS.escape(slug(sub)));
    if (el) { el.scrollIntoView({ block: 'start' }); flash(el); }
  }

  // ---- opening ----
  function reveal() {
    if (open_()) return;
    g('split').hidden = false; g('splitHandle').hidden = false;
    g('panes').classList.add('split-on');
  }
  async function open(p, sub = '', { newTab = false } = {}) {
    if (!p) return;
    if (!isNote(p)) { if (V.idx.has(p)) openNote(p); else toast('Note not found: ' + p); return; } // canvases, pictures: main pane
    reveal();
    if (!S.cur() || newTab) { S.list.splice(S.active + 1, 0, { path: p, hist: [p], hIdx: 0 }); S.active += 1; }
    else if (S.cur().path !== p) { const t = S.cur(); t.hist.splice(t.hIdx + 1); t.hist.push(p); t.hIdx = t.hist.length - 1; t.path = p; }
    await show(sub);
    save();
  }
  async function switchTo(i) { if (i < 0 || i >= S.list.length) return; S.active = i; await show(); save(); }
  async function close(i = S.active) {
    if (i === S.active) await flush();
    S.list.splice(i, 1);
    if (!S.list.length) { hide(); return; }
    if (i <= S.active) S.active = Math.max(0, S.active - 1);
    await show(); save();
  }
  async function hide() {
    await flush();
    S.list = []; S.active = -1; shown = null;
    g('split').hidden = true; g('splitHandle').hidden = true;
    g('panes').classList.remove('split-on');
    save();
  }
  async function go(step) {
    const t = S.cur(); if (!t) return;
    const i = t.hIdx + step; if (i < 0 || i >= t.hist.length) return;
    t.hIdx = i; t.path = t.hist[i]; await show(); save();
  }
  async function toggleMode() { mode = mode === 'edit' ? 'read' : 'edit'; await show(); save(); }

  // the indexer saw files change
  async function refresh(changed) {
    if (!open_() || !shown) return;
    if (!changed.includes(shown)) { if (mode === 'read') DvView.refresh(art); return; }
    if (mode === 'read') { const y = g('splitBody').scrollTop; await show(); g('splitBody').scrollTop = y; return; }
    let res; try { res = await window.api.loadNote(shown); } catch { return; }
    if (res.text === cm.getValue()) { base = { mtime: res.mtime, text: res.text }; return; }
    if (!dirty) { base = { mtime: res.mtime, text: res.text }; cm.setValue(res.text); state('Reloaded (changed elsewhere)'); return; }
    conflict = { theirs: res.text, mtime: res.mtime }; g('splitConflict').hidden = false; state('Changed elsewhere');
  }
  function renamed(from, to) {
    for (const t of S.list) { if (t.path === from) t.path = to; t.hist.forEach((p, k) => { if (p === from) t.hist[k] = to; }); }
    if (shown === from) { shown = to; if (cm) cm.forget(from); }
    if (open_()) { S.render(); save(); }
  }
  async function restore() {
    const saved = await window.api.getSetting('split:' + V.name);
    const w = await window.api.getSetting('splitWidth'); if (w) setWidth(w);
    S.list = []; S.active = -1;
    if (!saved || !Array.isArray(saved.tabs)) { if (open_()) hide(); return; }
    const paths = saved.tabs.filter(isNote).slice(0, 30);
    if (!paths.length) { if (open_()) hide(); return; }
    mode = saved.mode === 'edit' ? 'edit' : 'read';
    S.list = paths.map((p) => ({ path: p, hist: [p], hIdx: 0 }));
    S.active = Math.min(Math.max(0, saved.active | 0), S.list.length - 1);
    reveal(); await show();
  }

  // ---- wiring ----
  g('splitEdit').onclick = () => toggleMode();
  g('splitClose').onclick = () => hide();
  g('splitBack').onclick = () => go(-1);
  g('splitSwap').onclick = () => { const p = shown; if (p) openNote(p); };
  g('splitKeep').onclick = () => { g('splitConflict').hidden = true; conflict = null; saveNow(true); };
  g('splitTheirs').onclick = () => { if (!conflict) return; const c = conflict; conflict = null; g('splitConflict').hidden = true; base = { mtime: c.mtime, text: c.theirs }; cm.setValue(c.theirs); dirty = false; state('Loaded the version on disk'); };
  // drag the divider
  g('splitHandle').addEventListener('mousedown', (e) => {
    e.preventDefault();
    const box = g('panes').getBoundingClientRect();
    const move = (ev) => setWidth(((box.right - ev.clientX) / box.width) * 100);
    const up = (ev) => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.api.setSetting('splitWidth', Math.round(((box.right - ev.clientX) / box.width) * 100)); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  });

  return {
    open, close, hide, restore, refresh, renamed, flush, go, toggleMode, switchTo,
    cycle: (step) => { if (S.list.length) switchTo((S.active + step + S.list.length) % S.list.length); },
    get visible() { return open_(); }, get path() { return shown; }, get mode() { return mode; },
    get list() { return S.list; }, get active() { return S.active; },
    themeChanged() { if (cm) cm.setDark(isDark()); },
    settingsChanged() { if (cm) { cm.setLivePreview(Prefs.get('livePreview')); cm.view.dispatch({}); } },
    _cm: () => cm, // for the test driver
  };
})();

return { Tabs, Split };
})();

// which pane the keyboard works on: the one clicked last
let focusPane = 'main';
document.addEventListener('mousedown', (e) => { if (e.target.closest('#split')) focusPane = 'split'; else if (e.target.closest('#main, #tabbar')) focusPane = 'main'; }, true);
document.addEventListener('focusin', (e) => { if (e.target.closest('#split')) focusPane = 'split'; else if (e.target.closest('#main')) focusPane = 'main'; });
