// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — shows ```dataview blocks as tables, lists, task lists and
// month calendars (the query runs in the indexer, see dataview.js), and inserts templates (Templater-style
// <% tp.file.title %> / <% tp.date.now("…") %> and core {{title}} / {{date}}).
'use strict';

const DvView = (() => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // turn every ```dataview code block under root into a live result
  function mount(root, origin) {
    root.querySelectorAll('pre > code.language-dataview').forEach((code) => {
      const box = document.createElement('div');
      box.className = 'dv';
      box.dataset.q = code.textContent;
      box.dataset.origin = origin || '';
      code.parentElement.replaceWith(box);
      run(box);
    });
  }
  async function run(box) {
    if (!box.innerHTML) box.innerHTML = '<div class="muted small">Running query…</div>';
    let r;
    try { r = await window.api.dvQuery(box.dataset.q, box.dataset.origin || null); } catch (e) { r = { error: e.message }; }
    if (!box.isConnected) return;
    if (r.loading) { box.innerHTML = `<div class="muted small">${esc(r.error)}</div>`; setTimeout(() => { if (box.isConnected) run(box); }, 2000); return; }
    if (!r.error && r.type === 'CALENDAR') { box._cal = r; if (!box.dataset.month) box.dataset.month = monthOf(Date.now()); }
    box.innerHTML = r.error ? `<div class="dv-error">Dataview: ${esc(r.error)}</div>` : r.type === 'CALENDAR' ? calendar(box) : render(r, box.dataset.origin || null);
    box.querySelectorAll('[data-vault-src]').forEach((el) => { el.src = vaultUrl(el.getAttribute('data-vault-src')); });
    box.dispatchEvent(new CustomEvent('dv-done', { bubbles: true, detail: { total: r.error ? null : r.total } }));
  }
  // re-run the queries on screen (after files changed)
  let timer = 0;
  function refresh(root) {
    clearTimeout(timer);
    timer = setTimeout(() => (root || document).querySelectorAll('.dv').forEach(run), 300);
  }

  // ---- values, formatted the way Dataview shows them ----
  function cell(v, origin) {
    if (v == null) return '<span class="dv-null">-</span>';
    if (Array.isArray(v)) {
      if (!v.length) return '';
      if (v.length === 1) return cell(v[0], origin);
      return '<ul class="dv-list">' + v.map((x) => `<li>${cell(x, origin)}</li>`).join('') + '</ul>';
    }
    if (typeof v === 'object') {
      if (v.t === 'link') return `<a class="internal${isNote(v.path) || V.idx.has(v.path) ? '' : ' unresolved'}" ${isNote(v.path) || V.idx.has(v.path) ? `data-path="${esc(v.path)}"` : `data-missing="${esc(v.path)}"`}>${esc(v.display || stem(v.path))}</a>`;
      if (v.t === 'date') return esc(DQL.formatDate(v, v.time ? Prefs.get('dvDateTimeFormat') : Prefs.get('dvDateFormat')));
      if (v.t === 'dur') return esc(DQL.formatDur(v));
      return '<ul class="dv-list">' + Object.keys(v).map((k) => `<li><b>${esc(k)}</b>: ${cell(v[k], origin)}</li>`).join('') + '</ul>';
    }
    if (typeof v === 'string') {
      // text in fields is Markdown ([[links]], **bold**), as in Dataview
      stack.push({ from: origin, depth: 1 });
      try { return sanitize(marked.parseInline(v)); } finally { stack.pop(); }
    }
    return esc(String(v));
  }
  // ---- TASK: tasks grouped by note, with checkboxes that write to the file ----
  function inline(text, from) {
    stack.push({ from, depth: 1 });
    try { return sanitize(marked.parseInline(text)); } finally { stack.pop(); }
  }
  function tasks(r) {
    if (!r.groups.length) return `<div class="dv-empty muted small">No tasks.</div>`;
    const more = r.truncated ? `<div class="muted small dv-more">Showing the first ${r.groups.reduce((n, g) => n + g.tasks.length, 0).toLocaleString()} of ${r.total.toLocaleString()} tasks.</div>` : '';
    return r.groups.map((gr) => {
      const base = Math.min(...gr.tasks.map((t) => t.indent));
      const items = gr.tasks.map((t) => {
        const cls = t.status === ' ' ? '' : t.status === 'x' || t.status === 'X' ? ' done' : t.status === '-' ? ' cancelled' : ' other';
        return `<li class="dv-task${cls}" style="margin-left:${Math.min(6, Math.round((t.indent - base) / 2)) * 14}px"><input type="checkbox" data-dv-task data-tp="${esc(t.path)}" data-tl="${t.line}" data-ts="${esc(t.status)}"${t.status !== ' ' ? ' checked' : ''} title="${t.status === ' ' ? 'Mark as done' : 'Mark as not done'} — saves the note"><span class="dv-task-text">${inline(t.text, t.path)}</span></li>`;
      }).join('');
      return `<div class="dv-task-group"><div class="dv-task-head">${cell(gr.key, null)} <span class="dv-count">(${gr.tasks.length})</span></div><ul class="dv-tasks">${items}</ul></div>`;
    }).join('') + more;
  }
  // tick / untick one task line in its file; the index sees the change and the lists refresh
  async function toggleTask(cb) {
    const p = cb.dataset.tp, line = +cb.dataset.tl;
    const li = cb.closest('li');
    let cur;
    try { cur = await window.api.loadNote(p); } catch (e) { toast('Could not read the note: ' + e.message); cb.checked = !cb.checked; return; }
    const lines = cur.text.split('\n');
    const m = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+\[)(.)(\])/.exec(lines[line] || '');
    if (!m || m[2] !== cb.dataset.ts) { toast('That task has moved in the note — the list is refreshed'); refresh(); return; }
    const next = m[2] === ' ' ? 'x' : ' ';
    lines[line] = m[1] + next + m[3] + lines[line].slice(m[0].length);
    const text = lines.join('\n');
    const res = await window.api.saveNote(p, text, cur.mtime);
    if (res.conflict) { toast('The note changed on disk — try again'); cb.checked = !cb.checked; return; }
    cacheText(p, text);
    cb.dataset.ts = next; cb.checked = next !== ' ';
    if (li) { li.classList.toggle('done', next === 'x'); li.classList.remove('cancelled', 'other'); }
    if (p === current && !Ed.active()) { const y = g('main').scrollTop; current = null; await openNote(p, '', { push: false }); g('main').scrollTop = y; }
  }
  document.addEventListener('click', (e) => {
    const cb = e.target.closest('input[data-dv-task]');
    if (!cb) return;
    e.stopPropagation();
    toggleTask(cb);
  }, true);

  // ---- CALENDAR: a month, a dot per note on its day; ‹ › change month, a day lists its notes ----
  const monthOf = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function calendar(box) {
    const r = box._cal;
    const [y, mo] = box.dataset.month.split('-').map(Number);
    const first = new Date(y, mo - 1, 1), days = new Date(y, mo, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // weeks start on Monday
    const byDay = new Map(r.days.map((d) => [d.ms, d]));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const inMonth = r.days.filter((d) => { const x = new Date(d.ms); return x.getFullYear() === y && x.getMonth() === mo - 1; }).reduce((n, d) => n + d.n, 0);
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<div class="dv-cal-cell empty"></div>';
    for (let day = 1; day <= days; day++) {
      const ms = new Date(y, mo - 1, day).getTime(), d = byDay.get(ms);
      const dots = d ? '<span class="dv-cal-dots">' + '<i></i>'.repeat(Math.min(4, d.n)) + (d.n > 4 ? `<b>${d.n}</b>` : '') + '</span>' : '';
      cells += `<div class="dv-cal-cell${d ? ' has' : ''}${ms === today.getTime() ? ' today' : ''}${String(ms) === box.dataset.day ? ' sel' : ''}"${d ? ` data-cal-day="${ms}" title="${d.n} note${d.n > 1 ? 's' : ''}"` : ''}><span class="dv-cal-n">${day}</span>${dots}</div>`;
    }
    const sel = box.dataset.day && byDay.get(+box.dataset.day);
    const list = sel && new Date(sel.ms).getMonth() === mo - 1
      ? `<div class="dv-cal-list"><div class="muted small">${esc(new Date(sel.ms).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div><ul class="dv-list-view">${sel.items.map((l) => `<li>${cell(l, null)}</li>`).join('')}</ul>${sel.n > sel.items.length ? `<div class="muted small">… and ${(sel.n - sel.items.length).toLocaleString()} more</div>` : ''}</div>`
      : '';
    return `<div class="dv-cal"><div class="dv-cal-bar"><button class="small-btn" data-cal-go="-1" title="Previous month">‹</button><b class="dv-cal-title">${MONTHS[mo - 1]} ${y}</b><button class="small-btn" data-cal-go="1" title="Next month">›</button><button class="small-btn" data-cal-go="0" title="This month">Today</button><span class="grow"></span><span class="muted small">${inMonth.toLocaleString()} this month · ${r.total.toLocaleString()} in all</span></div>
      <div class="dv-cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => `<div class="dv-cal-wd">${w}</div>`).join('')}${cells}</div>${list}</div>`;
  }
  document.addEventListener('click', (e) => {
    const box = e.target.closest('.dv');
    if (!box || !box._cal) return;
    const go = e.target.closest('[data-cal-go]'), day = e.target.closest('[data-cal-day]');
    if (!go && !day) return;
    e.stopPropagation();
    if (go) {
      const k = +go.dataset.calGo;
      if (!k) box.dataset.month = monthOf(Date.now());
      else { const [y, m] = box.dataset.month.split('-').map(Number); box.dataset.month = monthOf(new Date(y, m - 1 + k, 1).getTime()); }
      delete box.dataset.day;
    } else box.dataset.day = box.dataset.day === day.dataset.calDay ? '' : day.dataset.calDay;
    box.innerHTML = calendar(box);
  }, true);

  function render(r, origin) {
    if (r.type === 'TASK') return tasks(r);
    const count = r.truncated ? `<div class="muted small dv-more">Showing the first ${r.rows.length.toLocaleString()} of ${r.total.toLocaleString()} results.</div>` : '';
    if (r.type === 'TABLE') {
      if (!r.rows.length) return `<div class="dv-empty muted small">No results.</div>`;
      const heads = r.headers.map((h, i) => `<th>${esc(h)}${i === 0 && r.idColumn ? ` <span class="dv-count">(${r.total.toLocaleString()})</span>` : ''}</th>`).join('');
      const body = r.rows.map((row) => '<tr>' + row.map((v) => `<td>${cell(v, origin)}</td>`).join('') + '</tr>').join('');
      return `<div class="dv-table-wrap"><table class="dv-table"><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div>${count}`;
    }
    if (!r.rows.length) return `<div class="dv-empty muted small">No results.</div>`;
    const items = r.rows.map((row) => {
      if (row.length === 1) return `<li>${cell(row[0], origin)}</li>`;
      return `<li>${cell(row[0], origin)}${row[1] != null ? ': ' + cell(row[1], origin) : ''}</li>`;
    }).join('');
    return `<ul class="dv-list-view">${items}</ul>${count}`;
  }

  return { mount, refresh };
})();

const Templates = (() => {
  // moment.js tokens, as Templater and core templates use
  function moment(fmt, d) {
    const p2 = (n) => String(n).padStart(2, '0');
    const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const W = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g, (t, lit) => {
      if (lit !== undefined) return lit;
      const h12 = d.getHours() % 12 || 12;
      return {
        YYYY: d.getFullYear(), YY: String(d.getFullYear()).slice(-2), MMMM: M[d.getMonth()], MMM: M[d.getMonth()].slice(0, 3),
        MM: p2(d.getMonth() + 1), M: d.getMonth() + 1, DD: p2(d.getDate()), D: d.getDate(), dddd: W[d.getDay()], ddd: W[d.getDay()].slice(0, 3),
        HH: p2(d.getHours()), H: d.getHours(), hh: p2(h12), h: h12, mm: p2(d.getMinutes()), m: d.getMinutes(), ss: p2(d.getSeconds()), s: d.getSeconds(),
        A: d.getHours() < 12 ? 'AM' : 'PM', a: d.getHours() < 12 ? 'am' : 'pm',
      }[t];
    });
  }
  // fill a template for the note `title`; unknown <% … %> commands stay as written
  function expand(text, title, d = new Date()) {
    let unknown = 0;
    const arg = (s, def) => { const m = /^\s*["']([^"']*)["']/.exec(s || ''); return m ? m[1] : def; };
    let out = text.replace(/<%[-_*]?\s*([\s\S]*?)\s*[-_]?%>/g, (all, code) => {
      let m;
      if (/^tp\.file\.title$/.test(code)) return title;
      if ((m = /^tp\.date\.now\(([^)]*)\)$/.exec(code))) {
        const fmt = arg(m[1], 'YYYY-MM-DD');
        const off = /,\s*(-?\d+)/.exec(m[1]);
        const day = new Date(d); if (off) day.setDate(day.getDate() + +off[1]);
        return moment(fmt, day);
      }
      if ((m = /^tp\.date\.(tomorrow|yesterday)\(([^)]*)\)$/.exec(code))) { const day = new Date(d); day.setDate(day.getDate() + (m[1] === 'tomorrow' ? 1 : -1)); return moment(arg(m[2], 'YYYY-MM-DD'), day); }
      if ((m = /^tp\.file\.creation_date\(([^)]*)\)$/.exec(code))) return moment(arg(m[1], 'YYYY-MM-DD HH:mm'), d);
      if (/^tp\.file\.folder\(\s*\)$/.test(code)) return current ? dirOf(current).split('/').pop() : '';
      if (/^tp\.file\.cursor\(.*\)$/.test(code)) return '';
      unknown++;
      return all;
    });
    out = out.replace(/\{\{\s*(title|date|time)(?::([^}]*))?\s*\}\}/gi, (all, k, fmt) => {
      k = k.toLowerCase();
      if (k === 'title') return title;
      return moment(fmt || (k === 'date' ? 'YYYY-MM-DD' : 'HH:mm'), d);
    });
    return { text: out, unknown };
  }
  // the templates folder: the setting, or a folder that looks like one
  function folder() {
    const set = String(Prefs.get('templatesFolder') || '').replace(/^\/+|\/+$/g, '');
    if (set) return set;
    const tops = new Set(V.notes.map((p) => p.split('/')[0]));
    return ['99-Templates', '90-Templates', 'Templates', 'templates', '_templates', 'Template'].find((f) => tops.has(f)) || '';
  }
  async function pick() {
    const f = folder();
    if (!f) { toast('Set the templates folder first (Settings → Templates)'); Prefs.open('Templates'); return null; }
    const p = await Picker.pick(`Choose a template from "${f}"…`, (q) => q.startsWith(f + '/'));
    return p;
  }
  // Alt+E: insert a template at the cursor of the note being edited
  async function insert() {
    if (!current || !isNote(current)) { toast('Open a note first'); return; }
    const p = await pick();
    if (!p) return;
    const tpl = await fetchText(p);
    const r = expand(tpl, stem(current));
    // editing: at the cursor; reading: after the note's text
    const wasEditing = Ed.mode === 'edit' && Ed.active();
    await Ed.toggleTo('edit');
    Ed.insertText(r.text, !wasEditing);
    if (r.unknown) toast(`${r.unknown} Templater command${r.unknown > 1 ? 's were' : ' was'} not understood and left as written`);
  }
  // a new note that starts from a template
  async function newFromTemplate() {
    const p = await pick();
    if (!p) return;
    const name = await Dialog.prompt('Name of the new note', 'Untitled');
    if (!name || !name.trim()) return;
    const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
    const loc = Prefs.get('newNoteLocation');
    const dir = loc === 'root' ? '' : loc === 'folder' ? String(Prefs.get('newNoteFolder') || '').replace(/^\/+|\/+$/g, '') : current ? dirOf(current) : '';
    const rel = (dir ? dir + '/' : '') + clean + '.md';
    if (await window.api.exists(rel)) { toast('A note with that name already exists'); return; }
    const r = expand(await fetchText(p), clean);
    await window.api.createNote(rel, r.text);
    for (let i = 0; i < 40 && !isNote(rel); i++) await new Promise((res) => setTimeout(res, 100));
    await Ed.toggleTo('edit');
    current = null;
    await openNote(rel);
    if (r.unknown) toast(`${r.unknown} Templater command${r.unknown > 1 ? 's were' : ' was'} not understood and left as written`);
  }
  return { expand, insert, newFromTemplate, folder, moment };
})();
