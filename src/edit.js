// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — editing.
//   • Ctrl+E switches the open note between reading and editing (CodeMirror 6);
//     edits are saved on their own ~0.8 s after typing stops, and before
//     leaving the note or closing the window.
//   • If the file changes on disk meanwhile (OneDrive, another editor…), an unedited
//     note just reloads; an edited one shows a choice instead of overwriting.
//   • New / rename / move / delete (to the recycle bin), new folder, daily
//     note; renaming rewrites every [[link]] and [](link) that pointed to it.
//   • [[ and # completion, pasted images stored as attachments, task
//     checkboxes clickable in reading view, command palette (Ctrl+P).
'use strict';

const Ed = (() => {
  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { stem, dirOf, baseOf, linkTarget } = Core;

  let mode = 'read';          // 'read' | 'edit' (remembered)
  let cm = null;              // editor instance
  let path = null;            // note in the editor
  let base = null;            // { mtime, text } as last read or saved
  let dirty = false, saving = null, timer = 0, conflict = null;
  let renaming = null;        // the note being renamed right now

  // ---------------- editor pane ----------------
  function ensureEditor() {
    if (cm) return;
    cm = LanternoteEditor.create(g('editorHost'), {
      dark: document.documentElement.dataset.theme === 'dark',
      onChange: () => { dirty = true; setState('Editing…'); clearTimeout(timer); timer = setTimeout(save, Prefs.get('autosaveDelay') * 1000); },
      spellcheck: () => Prefs.get('spellcheck'),
      onHistory: syncUndo,
      linkOptions,
      tagOptions,
      onPasteFiles: pasteFiles,
      livePreview: Prefs.get('livePreview'),
      imageUrl: (src, wiki) => pictureUrl(src, path, wiki),
      onOpenLink: (link, how) => followLink(link, path, { ...how, pane: 'main' }),
    });
  }
  function setState(s) { g('editState').textContent = s; }
  // the Undo / Redo buttons follow what the editor can undo for this note
  function syncUndo() {
    g('btnUndo').disabled = !cm || !cm.canUndo();
    g('btnRedo').disabled = !cm || !cm.canRedo();
  }

  // A new name typed in the title is applied when the field is left — and,
  // as a safety net, before another note is shown (blur does not always fire
  // when the window is not focused).
  let titleBusy = null;
  function commitTitle() {
    if (titleBusy) return titleBusy; // a rename from this title is already running
    if (!path || renaming) return Promise.resolve();
    const v = clean(g('editTitle').value);
    if (v && v !== stem(path)) { const from = path; g('editTitle').value = v; titleBusy = rename(from, (dirOf(from) ? dirOf(from) + '/' : '') + v + '.md').finally(() => { titleBusy = null; }); return titleBusy; }
    g('editTitle').value = stem(path);
    return titleBusy || Promise.resolve();
  }

  async function show(p) {
    if (path && path !== p && !renaming) await commitTitle();
    await flush();
    ensureEditor();
    const res = await window.api.loadNote(p);
    path = p; base = { mtime: res.mtime, text: res.text }; dirty = false; hideConflict();
    cm.open(p, res.text);
    syncUndo();
    g('note').hidden = true;
    g('editPane').hidden = false;
    g('main').classList.add('editing');
    const d = dirOf(p);
    g('editCrumbs').textContent = d ? d.split('/').join(' / ') : V.name;
    g('editTitle').value = stem(p);
    setState('Saved');
    renderOutline();
  }
  function hide() {
    if (path && !renaming && clean(g('editTitle').value) !== stem(path)) commitTitle();
    g('editPane').hidden = true;
    g('main').classList.remove('editing');
    path = null;
  }
  const active = () => !!path && !g('editPane').hidden;

  // ---------------- saving ----------------
  async function save(force) {
    clearTimeout(timer);
    if (!path || !cm || (!dirty && !force)) return;
    if (saving) { await saving; if (!dirty && !force) return; }
    const p = path, text = cm.getValue();
    dirty = false;
    setState('Saving…');
    saving = (async () => {
      try {
        const res = await window.api.saveNote(p, text, base.mtime, force === true);
        if (p !== path) return;
        if (res.conflict) { dirty = true; showConflict(res); return; }
        base = { mtime: res.mtime, text };
        cacheText(p, text);
        setState('Saved');
        renderOutline();
      } catch (e) {
        dirty = true;
        setState('Not saved');
        toast('Could not save: ' + e.message);
      }
    })();
    await saving;
    saving = null;
  }
  async function flush() { if (dirty) await save(); else if (saving) await saving; }

  function showConflict(res) {
    conflict = res;
    g('conflict').hidden = false;
    setState('Changed on disk');
  }
  function hideConflict() { conflict = null; g('conflict').hidden = true; }

  // the watcher saw the note change on disk
  async function externalChange() {
    if (!path) return;
    let res;
    try { res = await window.api.loadNote(path); } catch { return; }
    if (res.text === cm.getValue()) { base = { mtime: res.mtime, text: res.text }; return; } // our own save
    if (!dirty && res.text !== base.text) {
      base = { mtime: res.mtime, text: res.text };
      cm.setValue(res.text);
      cacheText(path, res.text);
      setState('Reloaded (changed on disk)');
      return;
    }
    if (dirty) showConflict({ theirs: res.text, mtime: res.mtime });
  }

  // ---------------- completion ----------------
  function linkOptions(q) {
    const hash = q.indexOf('#');
    if (hash >= 0) {
      // headings of a note: [[Note#…
      const file = q.slice(0, hash), sub = q.slice(hash + 1).toLowerCase();
      const p = file ? resolve(file, path) : path;
      const text = p && (p === path ? cm.getValue() : V.text.get(p));
      if (!text) { if (p) fetchText(p).catch(() => {}); return []; }
      return text.split('\n').map((l) => /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l)).filter(Boolean)
        .filter((m) => m[2].toLowerCase().includes(sub))
        .slice(0, 60).map((m) => ({ label: m[2], detail: 'H' + m[1].length, insert: `${file}#${m[2]}` }));
    }
    const lq = q.toLowerCase().trim();
    const out = [];
    if (!lq) {
      // most recently modified notes
      const top = V.notes.map((p, i) => [p, V.mtimes[V.idx.get(p)] || 0]).sort((a, b) => b[1] - a[1]).slice(0, 40);
      return top.map(([p]) => option(p));
    }
    for (let i = 0; i < V.notes.length && out.length < 400; i++) {
      const r = fuzzy(lq, V.stemLc[i]);
      if (r) out.push({ p: V.notes[i], s: r.score });
    }
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, 60).map((o) => option(o.p));
  }
  // the shortest text that still points to this note
  function linkText(p) {
    const s = stem(p);
    const same = V.byBase.get(baseOf(p).toLowerCase()) || [];
    return same.length > 1 ? p.replace(/\.md$/i, '') : s;
  }
  function option(p) { return { label: stem(p), detail: dirOf(p), insert: linkText(p) }; }
  function tagOptions(q) {
    const lq = q.toLowerCase();
    return [...V.tags.entries()].filter(([tg]) => tg.includes(lq)).sort((a, b) => b[1].length - a[1].length).slice(0, 50)
      .map(([tg, ps]) => ({ label: tg, detail: ps.length + ' notes' }));
  }

  // ---------------- attachments ----------------
  async function pasteFiles(files, into = path) {
    if (!into) return '';
    const parts = [];
    for (const f of files) {
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const name = f.name && f.name !== 'image.png' ? f.name : `Pasted image ${stamp}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`;
      try {
        const loc = Prefs.get('attachmentLocation'), nd = dirOf(into);
        const dir = loc === 'sub' ? (nd ? nd + '/' : '') + 'attachments' : loc === 'folder' ? cleanDir(Prefs.get('attachmentFolder')) : nd;
        const rel = await window.api.attach(dir, name, new Uint8Array(await f.arrayBuffer()));
        parts.push(`![[${baseOf(rel)}]]`);
      } catch (e) { toast('Could not store the file: ' + e.message); }
    }
    return parts.join('\n');
  }

  // ---------------- outline while editing ----------------
  function renderOutline() {
    if (!active()) return;
    const lines = cm.getValue().split('\n');
    let fence = false;
    const hs = [];
    lines.forEach((l, i) => {
      if (/^(```|~~~)/.test(l)) fence = !fence;
      const m = !fence && /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
      if (m) hs.push({ level: m[1].length, text: m[2], line: i + 1 });
    });
    g('outline').innerHTML = hs.length
      ? hs.map((h) => `<a data-line="${h.line}" style="padding-left:${(h.level - 1) * 12 + 4}px">${esc(h.text)}</a>`).join('')
      : '<div class="muted small">No headings</div>';
  }

  // ---------------- file operations ----------------
  const ask = (msg, value) => Dialog.prompt(msg, value);
  const clean = (name) => name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();

  async function freeName(dir, name) {
    for (let i = 0; i < 1000; i++) {
      const rel = (dir ? dir + '/' : '') + name + (i ? ' ' + i : '') + '.md';
      if (!(await window.api.exists(rel))) return rel;
    }
    throw new Error('no free name');
  }
  // wait until the index knows about a new file, then open it
  async function openWhenIndexed(rel, edit) {
    for (let i = 0; i < 40 && !isNote(rel); i++) await new Promise((r) => setTimeout(r, 100));
    if (edit) mode = 'edit';
    current = null;
    await openNote(rel);
  }
  async function newNote(dir) {
    await flush();
    if (dir == null) {
      const loc = Prefs.get('newNoteLocation');
      dir = loc === 'root' ? '' : loc === 'folder' ? cleanDir(Prefs.get('newNoteFolder')) : current ? dirOf(current) : '';
    }
    const rel = await freeName(dir, 'Untitled');
    await window.api.createNote(rel, '');
    await openWhenIndexed(rel, true);
    g('editTitle').focus(); g('editTitle').select();
  }
  async function createFromLink(name) {
    const rel = name.replace(/\\/g, '/').replace(/^\/+/, '') + (/\.md$/i.test(name) ? '' : '.md');
    if (!(await window.api.exists(rel))) await window.api.createNote(rel, '');
    await openWhenIndexed(rel, true);
  }
  const cleanDir = (d) => String(d || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  function formatDate(fmt, d) {
    const p2 = (n) => String(n).padStart(2, '0');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return fmt.replace(/YYYY|MM|DD|ddd/g, (t) => ({ YYYY: d.getFullYear(), MM: p2(d.getMonth() + 1), DD: p2(d.getDate()), ddd: days[d.getDay()] }[t]));
  }
  async function dailyNote() {
    const d = new Date();
    const day = formatDate(Prefs.get('dailyFormat') || 'YYYY-MM-DD', d);
    const folder = cleanDir(Prefs.get('dailyFolder'));
    const rel = (folder ? folder + '/' : '') + clean(day) + '.md';
    const body = String(Prefs.get('dailyTemplate')).replace(/\{\{date\}\}/g, day).replace(/\{\{time\}\}/g, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    if (!(await window.api.exists(rel))) await window.api.createNote(rel, Templates.expand(body, day, d).text);
    await openWhenIndexed(rel, true);
  }
  async function newFolder(dir) {
    const name = await ask('New folder name', 'New folder');
    if (!name || !clean(name)) return;
    await window.api.mkdir((dir ? dir + '/' : '') + clean(name));
    toast('Folder created (it appears in the tree once it holds a note)');
  }

  // Rewrite links in `text` (a note at `src`) that pointed to `from`.
  function rewriteLinks(text, src, from, to) {
    let n = 0;
    const newLink = linkText(to);
    text = text.replace(/(!?)\[\[([^[\]\n]+?)\]\]/g, (all, bang, inner) => {
      const { file } = linkTarget(inner);
      if (!file || resolve(file, src) !== from) return all;
      n++;
      return `${bang}[[${newLink}${inner.replace(/\\\|/g, '|').slice(inner.replace(/\\\|/g, '|').indexOf(file) + file.length)}]]`;
    });
    text = text.replace(/(\[[^\]\n]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (all, a, href, b) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) return all;
      const [f, sub] = href.split('#');
      if (resolve(f, src) !== from) return all;
      n++;
      const rel = relPath(dirOf(src), to).split('/').map(encodeURIComponent).join('/');
      return a + rel + (sub != null ? '#' + sub : '') + b;
    });
    return { text, n };
  }
  function relPath(fromDir, to) {
    const a = fromDir ? fromDir.split('/') : [], b = to.split('/');
    let i = 0;
    while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
    return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
  }

  async function rename(from, to) {
    if (!to || to === from) return;
    await flush();
    let sources = MD_EXT.test(from) ? backLinks(from).filter((s) => s !== from) : [];
    const policy = Prefs.get('renameLinks');
    if (policy === 'never') sources = [];
    else if (sources.length && (policy === 'ask' || sources.length > 50) && !(await Dialog.confirm(`Update links in ${sources.length.toLocaleString()} note${sources.length === 1 ? '' : 's'} that point to "${stem(from)}"?`))) sources = [];
    const wasOpen = current === from;
    if (CANVAS_EXT.test(from)) await CanvasView.flush();
    renaming = from;
    try { await window.api.rename(from, to); } catch (e) { renaming = null; toast('Could not rename: ' + e.message); return; }
    // links are rewritten with the old index, which still resolves to `from`
    let notes = 0, links = 0, failed = 0;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      try {
        const cur = await window.api.loadNote(s);
        const r = rewriteLinks(cur.text, s, from, to);
        if (r.n) { const res = await window.api.saveNote(s, r.text, cur.mtime); if (res.conflict) failed++; else { notes++; links += r.n; cacheText(s, r.text); } }
      } catch { failed++; }
      if (i % 25 === 0) setStatus(`Updating links ${i + 1} / ${sources.length}`);
    }
    Tabs.renamed(from, to); Split.renamed(from, to);
    const canvases = policy === 'never' ? 0 : await CanvasView.renameFileIn(from, to);
    toast(`Renamed. ${links} link${links === 1 ? '' : 's'} updated in ${notes} note${notes === 1 ? '' : 's'}` + (canvases ? ` and ${canvases} canvas${canvases === 1 ? '' : 'es'}` : '') + (failed ? ` · ${failed} could not be updated` : ''));
    if (wasOpen) { if (path === from) path = to; await openWhenIndexed(to, mode === 'edit'); }
    renaming = null;
  }
  async function renamePrompt(p) {
    const name = await ask('Rename note', stem(p));
    if (!name || !clean(name)) return;
    await rename(p, (dirOf(p) ? dirOf(p) + '/' : '') + clean(name) + '.md');
  }
  async function movePrompt(p) {
    const dir = await ask('Move to folder (path inside the vault, empty = root)', dirOf(p));
    if (dir == null) return;
    const d = dir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    await rename(p, (d ? d + '/' : '') + baseOf(p));
  }
  async function remove(p) {
    const n = backLinks(p).length;
    if (Prefs.get('confirmDelete') && !(await Dialog.confirm(`Move "${stem(p)}" to the recycle bin?` + (n ? `\n${n} note${n === 1 ? ' links' : 's link'} to it.` : '')))) return;
    await flush();
    if (path === p) { dirty = false; hide(); }
    if (cm) cm.forget(p);
    try { await window.api.trash(p); toast('Moved to the recycle bin'); }
    catch (e) { toast('Could not delete: ' + e.message); return; }
    if (current === p) { current = null; const back = hist.slice(0, hIdx).reverse().find((q) => q !== p && isNote(q)); if (back) openNote(back); }
  }

  // ---------------- task checkboxes in reading view ----------------
  async function toggleTaskAt(index, p = current) {
    const cur = await window.api.loadNote(p);
    const lines = cur.text.split('\n');
    let fence = false, n = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
      if (fence) continue;
      const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(lines[i]);
      if (m && ++n === index) {
        lines[i] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3] + lines[i].slice(m[0].length);
        const text = lines.join('\n');
        const res = await window.api.saveNote(p, text, cur.mtime);
        if (res.conflict) { toast('The note changed on disk — try again'); return; }
        cacheText(p, text);
        if (p === current) { const y = g('main').scrollTop; current = null; await openNote(p, '', { push: false }); g('main').scrollTop = y; }
        Split.refresh([p]);
        return;
      }
    }
  }

  // ---------------- file recovery ----------------
  // Pick one of the copies kept before earlier saves; it replaces the text
  // in the editor as a normal edit, so Ctrl+Z brings the current text back.
  async function restorePrompt(p) {
    const list = await window.api.versions(p);
    if (!list.length) { toast('No earlier versions of this note yet (a copy is kept at most every 5 minutes while you edit)'); return; }
    palItems = list.map((v) => ({
      label: new Date(v.time).toLocaleString() + ' — ' + v.text.split('\n').find((l) => l.trim()).slice(0, 60),
      key: `${v.text.length.toLocaleString()} chars`,
      run: async () => {
        await toggleTo('edit');
        if (path !== p) await show(p);
        const view = cm.view;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v.text } });
        toast('Earlier version restored — Ctrl+Z undoes it');
      },
    }));
    palSel = 0;
    g('palette').hidden = false;
    g('palInput').value = '';
    g('palInput').placeholder = 'Choose a version…';
    drawPal();
    g('palInput').focus();
    g('palInput').oninput = () => {}; // a fixed list
  }

  // ---------------- context menu ----------------
  function menu(x, y, items) {
    const m = g('ctxMenu');
    m.innerHTML = items.map((it, i) => (it === '-' ? '<div class="sep"></div>' : `<div class="mi${it.danger ? ' danger' : ''}" data-mi="${i}">${esc(it.label)}</div>`)).join('');
    m.hidden = false;
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 4) + 'px';
    m.style.top = Math.min(y, innerHeight - r.height - 4) + 'px';
    m.onclick = (e) => { const d = e.target.closest('[data-mi]'); if (!d) return; m.hidden = true; items[+d.dataset.mi].run(); };
  }
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctxMenu')) g('ctxMenu').hidden = true; });
  function noteMenu(p, x, y) {
    menu(x, y, [
      { label: 'Open', run: () => openNote(p) },
      { label: 'Open in new tab', run: () => Tabs.openNew(p) },
      { label: 'Open in the right pane', run: () => Split.open(p, '', { newTab: true }) },
      { label: 'Edit', run: () => { mode = 'edit'; current = null; openNote(p); } },
      '-',
      { label: 'New note in this folder', run: () => newNote(dirOf(p)) },
      { label: 'New canvas in this folder', run: () => CanvasView.create(dirOf(p)) },
      { label: 'Rename…', run: () => renamePrompt(p) },
      { label: 'Move to folder…', run: () => movePrompt(p) },
      { label: 'Show in Explorer', run: () => window.api.reveal(p) },
      '-',
      { label: 'Delete', danger: true, run: () => remove(p) },
    ]);
  }
  function dirMenu(d, x, y) {
    menu(x, y, [
      { label: 'New note here', run: () => newNote(d) },
      { label: 'New canvas here', run: () => CanvasView.create(d) },
      { label: 'New folder here…', run: () => newFolder(d) },
      { label: 'Show in Explorer', run: () => window.api.reveal(d) },
    ]);
  }
  document.addEventListener('contextmenu', (e) => {
    const file = e.target.closest('.row.file[data-path], .result[data-path], .bl[data-path]');
    const dir = e.target.closest('li.dir');
    if (file) { e.preventDefault(); noteMenu(file.dataset.path, e.clientX, e.clientY); }
    else if (dir && e.target.closest('#tree')) { e.preventDefault(); dirMenu(dir.dataset.dir, e.clientX, e.clientY); }
    else if (e.target.closest('#tree')) { e.preventDefault(); dirMenu('', e.clientX, e.clientY); }
  });

  // ---------------- command palette ----------------
  const commands = () => [
    ['New note', 'Ctrl+N', () => newNote()],
    ['New canvas', '', () => CanvasView.create()],
    ['New kanban board', '', () => KanbanView.create()],
    ['Show this note as a kanban board', '', () => { if (current && KanbanView.isBoard(V.text.get(current))) KanbanView.asBoard(current); else toast('This note is not a board (front matter kanban-plugin: board)'); }],
    ['Insert template', 'Alt+E', () => Templates.insert()],
    ['New note from template…', '', () => Templates.newFromTemplate()],
    ['Toggle reading / editing', 'Ctrl+E', () => toggle()],
    ['New tab', 'Ctrl+T', () => Tabs.newTab()],
    ['Close tab', 'Ctrl+W', () => closeTab()],
    ['Next tab', 'Ctrl+Tab', () => cycleTab(1)],
    ['Previous tab', 'Ctrl+Shift+Tab', () => cycleTab(-1)],
    ['Open this note in the right pane', 'Ctrl+Alt+→', () => current && Split.open(current, '', { newTab: true })],
    ['Close the right pane', '', () => Split.hide()],
    ['Toggle live preview', '', () => Prefs.set('livePreview', !Prefs.get('livePreview'))],
    ["Open today's daily note", '', () => dailyNote()],
    ['Rename current note…', '', () => current && renamePrompt(current)],
    ['Move current note to folder…', '', () => current && movePrompt(current)],
    ['Delete current note', '', () => current && remove(current)],
    ['New folder…', '', () => newFolder(current ? dirOf(current) : '')],
    ['Open settings', 'Ctrl+,', () => Prefs.open()],
    ['User guide (Hướng dẫn sử dụng)', 'F1', () => openGuide()],
    ["What's new (Nhật ký thay đổi)", '', () => openDoc('changelog')],
    ['Command Center', 'Ctrl+Shift+H', () => toggleCC()],
    ['Quick open', 'Ctrl+O', () => openSwitcher()],
    ['Search in all notes', 'Ctrl+Shift+F', () => { setTab('search'); showLeft(); }],
    ['Graph of all notes', 'Ctrl+G', () => toggleGraph('global')],
    ['Graph around this note', 'Ctrl+Shift+G', () => toggleGraph('local')],
    ['Toggle dark mode', 'Ctrl+Shift+D', () => setTheme(isDark() ? 'light' : 'dark')],
    ['Show current note in Explorer', '', () => current && window.api.reveal(current)],
    ['Reload folder', 'Ctrl+R', () => reloadVault(false)],
    ['Undo', 'Ctrl+Z', () => { if (cm && active()) { cm.undo(); syncUndo(); } }],
    ['Redo', 'Ctrl+Y', () => { if (cm && active()) { cm.redo(); syncUndo(); } }],
    ['Restore a previous version of this note…', '', () => current && restorePrompt(current)],
    ['Print / save as PDF', '', () => { toggleTo('read').then(() => window.print()); }],
    ['Close window', '', () => window.api.closeWindow()],
  ];
  let palItems = [], palSel = 0;
  function palette() {
    g('palInput').oninput = palFilter;
    g('palInput').placeholder = 'Type a command…';
    g('palette').hidden = false;
    g('palInput').value = '';
    palFilter();
    g('palInput').focus();
  }
  function palFilter() {
    const q = g('palInput').value.trim().toLowerCase();
    palItems = commands().map(([label, key, run]) => ({ label, key, run, s: q ? fuzzy(q, label.toLowerCase()) : { score: 0 } })).filter((c) => c.s);
    if (q) palItems.sort((a, b) => b.s.score - a.s.score);
    palSel = 0;
    drawPal();
  }
  function drawPal() {
    g('palList').innerHTML = palItems.map((c, i) => `<div class="switem${i === palSel ? ' sel' : ''}" data-pi="${i}"><div>${esc(c.label)}</div>${c.key ? `<kbd>${esc(c.key)}</kbd>` : ''}</div>`).join('') || '<div class="muted small" style="padding:8px">No command</div>';
  }
  function palRun(i) { const c = palItems[i]; g('palette').hidden = true; if (c) c.run(); }
  g('palInput').oninput = palFilter;
  g('palInput').onkeydown = (e) => {
    if (e.key === 'ArrowDown') { palSel = Math.min(palSel + 1, palItems.length - 1); drawPal(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { palSel = Math.max(palSel - 1, 0); drawPal(); e.preventDefault(); }
    else if (e.key === 'Enter') palRun(palSel);
    else if (e.key === 'Escape') g('palette').hidden = true;
  };
  g('palList').onclick = (e) => { const d = e.target.closest('[data-pi]'); if (d) palRun(+d.dataset.pi); };
  g('palette').onclick = (e) => { if (e.target === g('palette')) g('palette').hidden = true; };

  // ---------------- mode ----------------
  async function toggleTo(m) {
    if (KanbanView.active()) { await KanbanView.asText(); return; } // Ctrl+E on a board: its Markdown
    if (m === mode) return;
    mode = m;
    window.api.setSetting('noteMode', m);
    if (!current) return;
    if (m === 'edit') await show(current);
    else { await flush(); hide(); const p = current; current = null; await openNote(p, '', { push: false }); }
    g('btnEdit').classList.toggle('on', mode === 'edit');
  }
  const toggle = () => toggleTo(mode === 'edit' ? 'read' : 'edit');

  // wiring
  g('btnEdit').onclick = toggle;
  g('btnUndo').onclick = () => { if (cm) { cm.undo(); syncUndo(); } };
  g('btnRedo').onclick = () => { if (cm) { cm.redo(); syncUndo(); } };
  g('btnVersions').onclick = () => { if (path) restorePrompt(path); };
  g('keepMine').onclick = () => { hideConflict(); save(true); };
  g('loadTheirs').onclick = () => { if (!conflict) return; const c = conflict; hideConflict(); dirty = false; base = { mtime: c.mtime, text: c.theirs }; cm.setValue(c.theirs); dirty = false; setState('Loaded the version on disk'); };
  g('editTitle').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); g('editTitle').blur(); } if (e.key === 'Escape') { g('editTitle').value = stem(path); g('editTitle').blur(); } };
  g('editTitle').onblur = () => { commitTitle(); };
  g('outline').addEventListener('click', (e) => { const a = e.target.closest('[data-line]'); if (a && cm && active()) { cm.scrollToLine(+a.dataset.line); cm.focus(); } });
  // a close started by the page itself (not the X button) also waits for the save
  let closing = false;
  window.addEventListener('beforeunload', (e) => {
    if (!dirty || closing) return;
    e.preventDefault(); e.returnValue = false;
    closing = true;
    flush().finally(() => window.api.closeWindow());
  });
  // which view notes open in: settings → Editor
  async function initMode() {
    const m = await window.api.getSetting('noteMode');
    const d = Prefs.get('defaultMode');
    mode = d === 'remember' ? (m === 'edit' ? 'edit' : 'read') : d;
    g('btnEdit').classList.toggle('on', mode === 'edit');
  }

  return {
    linkOptions, tagOptions, pasteFiles, // shared with the editor in the right pane
    get mode() { return mode; },
    get renaming() { return renaming; },
    get path() { return path; },
    active, show, hide, flush, initMode, externalChange, toggle, toggleTo, newNote, createFromLink, dailyNote, palette, toggleTaskAt,
    themeChanged() { if (cm) cm.setDark(document.documentElement.dataset.theme === 'dark'); Split.themeChanged(); },
    settingsChanged() { if (cm) { cm.setLivePreview(Prefs.get('livePreview')); cm.view.dispatch({}); } Split.settingsChanged(); },
    // insert text at the cursor of the note being edited (templates)
    // atEnd: append after the note's text (used when the user was reading, so the cursor means nothing)
    insertText(t, atEnd) {
      if (!cm || !active()) return;
      const v = cm.view;
      if (atEnd) {
        const doc = v.state.doc.toString();
        // leave one blank line between the note's text and the template
        const sep = !doc.length || doc.endsWith('\n\n') ? '' : doc.endsWith('\n') ? '\n' : '\n\n';
        const at = doc.length + sep.length + t.length;
        v.dispatch({ changes: { from: doc.length, insert: sep + t }, selection: { anchor: at }, scrollIntoView: true });
      }
      else v.dispatch(v.state.replaceSelection(t));
      v.focus();
    },
    _cm: () => cm, // for the test driver
  };
})();

// small promise-based dialogs (window.prompt does not exist in Electron)
const Dialog = (() => {
  const g = (id) => document.getElementById(id);
  function open(msg, value, withInput) {
    return new Promise((res) => {
      g('dlgMsg').textContent = msg;
      g('dlgInput').hidden = !withInput;
      g('dlgInput').value = value || '';
      g('dialog').hidden = false;
      const done = (v) => { g('dialog').hidden = true; g('dlgOk').onclick = g('dlgCancel').onclick = g('dlgInput').onkeydown = null; res(v); };
      g('dlgOk').onclick = () => done(withInput ? g('dlgInput').value : true);
      g('dlgCancel').onclick = () => done(withInput ? null : false);
      g('dlgInput').onkeydown = (e) => { if (e.key === 'Enter') done(g('dlgInput').value); if (e.key === 'Escape') done(null); };
      setTimeout(() => { if (withInput) { g('dlgInput').focus(); g('dlgInput').select(); } else g('dlgOk').focus(); }, 0);
    });
  }
  return { prompt: (m, v) => open(m, v, true), confirm: (m) => open(m, '', false) };
})();
