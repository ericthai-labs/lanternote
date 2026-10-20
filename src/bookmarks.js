// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — bookmarks: notes kept at hand above the file tree.
// One list per folder, saved in the settings (not in the notes folder, so a
// shared or synced folder is not changed). ☆ in the note's top line, the file
// menu or the command palette adds and removes a note; drag a row to reorder.
'use strict';

const Bookmarks = (() => {
  const g = (id) => document.getElementById(id);
  let list = [], key = '';

  async function load() {
    key = 'bookmarks:' + (V.root || V.name);
    try { const v = await window.api.getSetting(key); list = Array.isArray(v) ? v : []; } catch { list = []; }
    render();
  }
  const save = () => window.api.setSetting(key, list).catch(() => {});
  const has = (p) => !!p && list.includes(p);

  function toggle(p) {
    if (!p) return;
    if (has(p)) { list = list.filter((x) => x !== p); toast('Bookmark removed'); }
    else { list.push(p); toast('Bookmarked: ' + stem(p)); }
    save(); render(); syncButton();
  }
  function renamed(from, to) {
    let changed = false;
    list = list.map((p) => {
      if (p === from) { changed = true; return to; }
      if (p.startsWith(from + '/')) { changed = true; return to + p.slice(from.length); }
      return p;
    });
    if (changed) { save(); render(); }
  }
  function render() {
    const box = g('bmBox'), el = g('bmList');
    if (!box) return;
    const shown = list.filter((p) => V.idx && V.idx.has(p));
    box.hidden = !shown.length;
    g('bmCount').textContent = shown.length ? shown.length : '';
    el.innerHTML = shown.map((p) => `<div class="bl bm${p === current ? ' on' : ''}" draggable="true" data-path="${esc(p)}" title="${esc(p)}"><span class="bm-ico">★</span><span class="bm-name">${esc(stem(p))}</span></div>`).join('');
  }
  // the ☆ button in the note's top line (app.js draws it with data-bm)
  function syncButton() {
    document.querySelectorAll('#note [data-bm]').forEach((b) => { const on = has(current); b.textContent = on ? '★ Bookmarked' : '☆ Bookmark'; b.classList.toggle('on', on); });
    document.querySelectorAll('#bmList .bm').forEach((r) => r.classList.toggle('on', r.dataset.path === current));
  }
  const button = (p) => `<button class="link bm-btn${has(p) ? ' on' : ''}" data-bm title="Keep this note above the file list">${has(p) ? '★ Bookmarked' : '☆ Bookmark'}</button>`;

  document.addEventListener('click', (e) => {
    const b = e.target.closest('#note [data-bm]');
    if (b) { e.preventDefault(); e.stopPropagation(); toggle(current); }
  }, true);
  // drag to reorder
  let dragged = null;
  document.addEventListener('dragstart', (e) => { const r = e.target.closest && e.target.closest('#bmList .bm'); if (!r) return; dragged = r.dataset.path; e.dataTransfer.effectAllowed = 'move'; });
  document.addEventListener('dragover', (e) => { if (dragged && e.target.closest && e.target.closest('#bmList')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!dragged) return;
    const r = e.target.closest && e.target.closest('#bmList .bm');
    if (r && r.dataset.path !== dragged) {
      e.preventDefault();
      const from = list.indexOf(dragged);
      list.splice(from, 1);
      const rect = r.getBoundingClientRect();
      let to = list.indexOf(r.dataset.path);
      if (e.clientY > rect.top + rect.height / 2) to++;
      list.splice(to, 0, dragged);
      save(); render();
    }
    dragged = null;
  });
  document.addEventListener('dragend', () => { dragged = null; });

  return { load, toggle, has, renamed, render, syncButton, button, get list() { return list.slice(); } };
})();
