// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — settings (Ctrl+, or the ⚙ button).
// One schema drives the settings page, the defaults and where each value is
// applied. Values live in userData/settings.json under "prefs"; the main
// process reads the same object for file recovery and excluded folders.
'use strict';

const Prefs = (() => {
  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SCHEMA = [
    ['Appearance', [
      { key: 'theme', label: 'Theme', type: 'select', def: 'system', options: [['system', 'Follow Windows'], ['light', 'Light'], ['dark', 'Dark']] },
      { key: 'fontSize', label: 'Text size', type: 'range', def: 16, min: 12, max: 22, unit: 'px' },
      { key: 'lineWidth', label: 'Line width', type: 'select', def: '780', options: [['640', 'Narrow'], ['780', 'Normal'], ['960', 'Wide'], ['none', 'Full window']] },
      { key: 'fontFamily', label: 'Font', type: 'select', def: 'system', options: [['system', 'System (Segoe UI)'], ['serif', 'Serif (Georgia)'], ['mono', 'Monospace']] },
      { key: 'accent', label: 'Accent colour', type: 'color', def: '#c27a12', help: 'Default: Lantern amber.' },
    ]],
    ['Editor', [
      { key: 'defaultMode', label: 'Notes open in', type: 'select', def: 'remember', options: [['remember', 'The mode used last'], ['read', 'Reading view'], ['edit', 'Editing view']] },
      { key: 'autosaveDelay', label: 'Save after typing stops', type: 'number', def: 0.8, min: 0.3, max: 10, step: 0.1, unit: 's' },
      { key: 'spellcheck', label: 'Spell check', type: 'toggle', def: false },
      { key: 'activeLine', label: 'Highlight the line being edited', type: 'toggle', def: true },
      { key: 'livePreview', label: 'Live preview', type: 'toggle', def: true, help: 'While editing, Markdown marks (**, #, [[ ]]…) are hidden except on the line with the cursor; pictures, checkboxes and links show as in reading view. Click a link to open it, Ctrl+click for a new tab, Alt+click for the other pane.' },
    ]],
    ['Files & links', [
      { key: 'newNoteLocation', label: 'New notes go to', type: 'select', def: 'current', options: [['current', 'The folder of the open note'], ['root', 'The vault root'], ['folder', 'The folder below']] },
      { key: 'newNoteFolder', label: 'Folder for new notes', type: 'text', def: '', placeholder: 'e.g. Inbox' },
      { key: 'attachmentLocation', label: 'Pasted images go to', type: 'select', def: 'note', options: [['note', 'The folder of the note'], ['sub', 'An "attachments" folder next to the note'], ['folder', 'The folder below']] },
      { key: 'attachmentFolder', label: 'Folder for attachments', type: 'text', def: 'attachments' },
      { key: 'renameLinks', label: 'When a note is renamed or moved', type: 'select', def: 'always', options: [['always', 'Update links to it'], ['ask', 'Ask first'], ['never', 'Leave links as they are']] },
      { key: 'confirmDelete', label: 'Ask before deleting', type: 'toggle', def: true },
      { key: 'showImages', label: 'Show pictures in the file list and quick open', type: 'toggle', def: true },
      { key: 'remoteImages', label: 'Load pictures from the internet', type: 'toggle', def: false, help: 'Pictures in notes whose address starts with http:// or https://. Loading one tells its web server that the note was opened, and when. Off: a placeholder is shown instead; click it to load that one picture.' },
      { key: 'exclude', label: 'Folders to ignore', type: 'text', def: '', placeholder: 'comma separated, e.g. Archive, 99-Templates', help: 'Not indexed, searched or drawn. Takes effect when the folder is reloaded (Ctrl+R).' },
    ]],
    ['Daily notes', [
      { key: 'dailyFolder', label: 'Folder', type: 'text', def: '', placeholder: 'empty = vault root' },
      { key: 'dailyFormat', label: 'File name', type: 'text', def: 'YYYY-MM-DD', help: 'YYYY year · MM month · DD day · ddd weekday' },
      { key: 'dailyTemplate', label: 'New daily note text', type: 'textarea', def: '# {{date}}\n\n', help: '{{date}} and {{time}} are filled in.' },
    ]],
    ['Templates', [
      { key: 'templatesFolder', label: 'Templates folder', type: 'text', def: '', placeholder: 'empty = find 99-Templates, Templates…', help: 'Alt+E inserts a template from this folder. <% tp.file.title %>, <% tp.date.now("DD/MM/YYYY") %>, {{title}}, {{date}} and {{time}} are filled in.' },
    ]],
    ['Dataview', [
      { key: 'dvDateFormat', label: 'Dates in query results', type: 'text', def: 'MMMM dd, yyyy', help: 'Same tokens as Dataview: yyyy MM dd HH mm. "MMMM dd, yyyy" is the usual default; "dd/MM/yyyy" shows 01/10/2026.' },
      { key: 'dvDateTimeFormat', label: 'Date and time in query results', type: 'text', def: 'h:mm a - MMMM dd, yyyy' },
    ]],
    ['Command Center', [
      { key: 'ccNote', label: 'Built from the note', type: 'text', def: 'Command Center.md', help: 'Path of the note, from the vault root. If it does not exist a built-in layout is shown; "Layout" on the page creates it.' },
      { key: 'ccBackground', label: 'Background', type: 'select', def: 'auto', options: [['auto', 'Automatic'], ['moving', 'Moving'], ['still', 'Still picture'], ['plain', 'Plain']], help: 'Drawn without a graphics card. Automatic moves, but uses the still picture when drawing is slow or Windows has animations turned off. Plain follows the light / dark theme.' },
      { key: 'ccMotion', label: 'Galaxy turning speed', type: 'select', def: 'normal', options: [['off', 'Off (stars still twinkle)'], ['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], help: 'When the background moves. The galaxy also turns while you explore it; it holds still while you point at a star or drag.' },
    ]],
    ['AI connection', [
      { key: 'mcpWrite', label: 'Let the AI edit notes', type: 'toggle', def: true, help: 'Create notes, add text, tick tasks, set properties. The previous text is always kept (the note\'s Versions button); every change is listed in mcp.log. Takes effect when the AI app restarts the connection.' },
      { key: 'mcpOnly', label: 'Folders the AI may use', type: 'text', def: '', placeholder: 'empty = the whole folder; e.g. Projects, Journal', help: 'Comma separated. Other folders are invisible to the AI.' },
    ]],
    ['Graph', [
      { key: 'graphEngine', label: 'Engine', type: 'select', def: 'map', options: [['map', 'Map — any PC'], ['gpu', 'Live — needs a graphics card']] },
      { key: 'hubCap', label: 'Hub links (whole vault)', type: 'select', def: '1000', options: [['200', 'Hide above 200'], ['1000', 'Hide above 1,000'], ['5000', 'Hide above 5,000'], ['0', 'Show all (slow)']] },
    ]],
    ['File recovery', [
      { key: 'recoveryMinutes', label: 'Keep a copy at most every', type: 'number', def: 5, min: 0, max: 240, step: 1, unit: 'min', help: '0 turns copies off. Copies stay on this PC, outside the vault.' },
      { key: 'recoveryDays', label: 'Keep copies for', type: 'number', def: 14, min: 1, max: 365, step: 1, unit: 'days' },
    ]],
  ];
  const FIELDS = SCHEMA.flatMap(([, f]) => f);
  const EXTRA = ['Advanced', 'About'];
  const byKey = new Map(FIELDS.map((f) => [f.key, f]));
  let values = {};

  const get = (k) => (values[k] !== undefined ? values[k] : byKey.get(k).def);

  async function load() {
    values = (await window.api.getSetting('prefs')) || {};
    // older single settings become part of prefs
    for (const k of ['dailyFolder', 'graphEngine']) {
      if (values[k] === undefined) { const v = await window.api.getSetting(k); if (v != null) values[k] = v; }
    }
    apply();
  }
  function set(k, v) {
    values[k] = v;
    window.api.setSetting('prefs', values);
    apply(k);
  }

  // push values into the page
  function apply(changed) {
    const r = document.documentElement.style;
    r.setProperty('--note-size', get('fontSize') + 'px');
    r.setProperty('--note-width', get('lineWidth') === 'none' ? 'none' : get('lineWidth') + 'px');
    r.setProperty('--note-font', { system: '-apple-system, "Segoe UI", Inter, Roboto, Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, Consolas, monospace' }[get('fontFamily')]);
    const acc = get('accent');
    if (acc && acc !== '#c27a12' && acc !== '#7b5bd6') { r.setProperty('--accent', acc); r.setProperty('--link', acc); } else { r.removeProperty('--accent'); r.removeProperty('--link'); }
    document.body.classList.toggle('no-active-line', !get('activeLine'));
    if (!changed || changed === 'theme') applyTheme();
    if ((changed === 'spellcheck' || changed === 'livePreview') && typeof Ed !== 'undefined') Ed.settingsChanged();
    if ((changed === 'dvDateFormat' || changed === 'dvDateTimeFormat') && typeof DvView !== 'undefined') DvView.refresh();
    if (changed === 'showImages' && typeof renderTree === 'function') { T = null; renderTree(); }
    if (changed === 'remoteImages' && typeof openNote === 'function' && current && /\.md$/i.test(current)) openNote(current, '', { push: false });
    if ((changed === 'ccNote' || changed === 'ccBackground') && typeof CC !== 'undefined') CC.settingsChanged(changed);
    if ((changed === 'graphEngine' || changed === 'hubCap') && typeof Graph !== 'undefined') Graph.settingsChanged();
  }
  function applyTheme() {
    const t = get('theme');
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (typeof Graph !== 'undefined') Graph.themeChanged();
    if (typeof Ed !== 'undefined') Ed.themeChanged();
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (get('theme') === 'system') applyTheme(); });

  // ---------------- page ----------------
  let section = SCHEMA[0][0];
  function field(f) {
    const v = get(f.key);
    let input;
    switch (f.type) {
      case 'select': input = `<select data-k="${f.key}">${f.options.map(([o, l]) => `<option value="${esc(o)}"${String(v) === o ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; break;
      case 'toggle': input = `<label class="switch-t"><input type="checkbox" data-k="${f.key}"${v ? ' checked' : ''}><span></span></label>`; break;
      case 'range': input = `<input type="range" data-k="${f.key}" min="${f.min}" max="${f.max}" value="${v}"><span class="val">${v}${f.unit || ''}</span>`; break;
      case 'number': input = `<input type="number" class="field num" data-k="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"><span class="val">${f.unit || ''}</span>`; break;
      case 'color': input = `<input type="color" data-k="${f.key}" value="${esc(v)}"> <button class="link" data-reset="${f.key}">Default</button>`; break;
      case 'textarea': input = `<textarea class="field" rows="4" data-k="${f.key}">${esc(v)}</textarea>`; break;
      default: input = `<input type="text" class="field" data-k="${f.key}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}">`;
    }
    return `<div class="set-row"><div class="set-label"><div>${esc(f.label)}</div>${f.help ? `<div class="muted small">${esc(f.help)}</div>` : ''}</div><div class="set-input">${input}</div></div>`;
  }
  async function draw() {
    g('setNav').innerHTML = [...SCHEMA.map(([s]) => s), ...EXTRA].map((s) => `<div class="set-nav${s === section ? ' on' : ''}" data-sec="${esc(s)}">${esc(s)}</div>`).join('');
    if (section === 'About') {
      const info = await window.api.appInfo();
      g('setBody').innerHTML = `<h3>Lanternote ${esc(info.version)}</h3>
        <p><b>${esc(info.copyright)}</b><br>Author: ${esc(info.author)}</p>
        <p class="muted">Reads and edits a folder of Markdown notes. Nothing leaves this PC.
        Open source under the Apache License 2.0.</p>
        <div class="set-row"><div class="set-label">Licence</div><div class="set-input"><button class="small-btn" data-lic="own">Licence</button><button class="small-btn" data-lic="third">Third-party licences</button></div></div>
        <div class="set-row"><div class="set-label">User guide</div><div class="set-input"><button class="small-btn" data-guide>Open (F1)</button></div></div>
        <div class="set-row"><div class="set-label">What's new in each version</div><div class="set-input"><button class="small-btn" data-changelog>Changelog</button></div></div>`;
      return;
    }
    if (section === 'Advanced') {
      g('setBody').innerHTML = `<h3>Advanced</h3>
        <div class="set-row"><div class="set-label"><div>Settings, caches and recovery copies</div><div class="muted small">Stored on this PC only, outside your notes folder.</div></div><div class="set-input"><button class="small-btn" data-open="userData">Open folder</button></div></div>
        <div class="set-row"><div class="set-label"><div>Problem log</div><div class="muted small">lanternote.log in the settings folder — send it along when reporting a problem.</div></div><div class="set-input"><button class="small-btn" data-open="userData">Open folder</button></div></div>
        ${await mdAppRow()}
        <div class="set-row"><div class="set-label"><div>Reset all settings</div><div class="muted small">Your notes are not touched.</div></div><div class="set-input"><button class="small-btn" data-resetall>Reset</button></div></div>`;
      return;
    }
    const fields = SCHEMA.find(([s]) => s === section)[1];
    g('setBody').innerHTML = `<h3>${esc(section)}</h3>` + fields.map(field).join('') + (section === 'AI connection' ? await mcpHelp() : '');
  }
  // Windows: open .md files with Lanternote (double-click in Explorer)
  async function mdAppRow() {
    const m = await window.api.mdApp();
    if (!m.windows) return '';
    const help = !m.supported ? 'Available in the built app (portable .exe, .zip or win-unpacked), not when run from source.'
      : m.registered ? 'Registered. If .md files still open in another app, pick Lanternote in Settings → Default apps (button opens it).'
      : 'Registers Lanternote for .md and .markdown, then opens Windows Default apps — pick Lanternote there once. Windows does not let an app make itself the default.';
    const port = m.supported && m.portable ? ' The portable .exe unpacks itself on every start; the .zip unpacked to a fixed folder opens faster.' : '';
    return `<div class="set-row"><div class="set-label"><div>Open Markdown files with Lanternote</div><div class="muted small">${esc(help + port)}</div></div><div class="set-input">${m.supported
      ? `<button class="small-btn" data-mdapp="on">${m.registered ? 'Open Default apps' : 'Set as Markdown app'}</button>${m.registered ? '<button class="small-btn" data-mdapp="off">Remove</button>' : ''}`
      : ''}</div></div>`;
  }
  // how to connect an AI assistant: the commands for this copy of the app
  let mcp = null;
  async function mcpHelp() {
    const m = await window.api.mcpInfo();
    const q = (s) => '"' + s.replace(/"/g, '\\"') + '"'; // always quoted: works in cmd, PowerShell and bash
    const code = `claude mcp add lanternote -s user -e ELECTRON_RUN_AS_NODE=1 -- ${q(m.command)} ${q(m.script)}`;
    const desktop = JSON.stringify({ mcpServers: { 'lanternote': { command: m.command, args: [m.script], env: { ELECTRON_RUN_AS_NODE: '1' } } } }, null, 2);
    mcp = { code, desktop };
    return `<div class="set-note">
      <p>An AI assistant that speaks <b>MCP</b> (Claude Code, Claude Desktop…) can search, read, query and — if allowed above — edit your notes through Lanternote. It works with the folder last opened here. When the AI reads a note, that text is sent to the AI provider.</p>
      ${m.portable ? '<p class="dv-error">This is the portable .exe, which unpacks itself to a different temporary folder on each start. For the AI connection use the unzipped version (the win-unpacked folder or the .zip) and open these settings from it.</p>' : ''}
      <div class="set-row"><div class="set-label"><div>Claude Code</div><div class="muted small">Run once in a terminal.</div></div><div class="set-input"><button class="small-btn" data-mcp="code">Copy command</button></div></div>
      <pre class="set-code">${esc(code)}</pre>
      <div class="set-row"><div class="set-label"><div>Claude Desktop</div><div class="muted small">Settings → Developer → Edit config: add this to claude_desktop_config.json, then restart Claude Desktop.</div></div><div class="set-input"><button class="small-btn" data-mcp="desktop">Copy config</button></div></div>
      <pre class="set-code">${esc(desktop)}</pre>
    </div>`;
  }

  function open(sec) {
    if (sec) section = sec;
    g('settings').hidden = false;
    draw();
  }
  g('setNav').onclick = (e) => { const d = e.target.closest('[data-sec]'); if (d) { section = d.dataset.sec; draw(); } };
  g('setBody').addEventListener('input', (e) => {
    const el = e.target.closest('[data-k]'); if (!el) return;
    const f = byKey.get(el.dataset.k);
    let v = f.type === 'toggle' ? el.checked : el.value;
    if (f.type === 'range' || f.type === 'number') {
      v = +v; if (Number.isNaN(v)) return;
      v = Math.min(f.max, Math.max(f.min, v));
      const out = el.parentElement.querySelector('.val'); if (out && f.type === 'range') out.textContent = v + (f.unit || '');
    }
    if (f.type === 'text') v = v.trim();
    set(f.key, v);
  });
  g('setBody').addEventListener('click', async (e) => {
    const r = e.target.closest('[data-reset]');
    if (r) { delete values[r.dataset.reset]; window.api.setSetting('prefs', values); apply(r.dataset.reset); draw(); return; }
    if (e.target.closest('[data-open]')) { window.api.openUserData(); return; }
    const md = e.target.closest('[data-mdapp]');
    if (md) {
      try { await window.api.setMdApp(md.dataset.mdapp === 'on'); toast(md.dataset.mdapp === 'on' ? 'Registered — choose Lanternote for .md in Default apps' : 'Lanternote no longer offered for .md files'); }
      catch (err) { toast('Could not change the Markdown app: ' + err.message); }
      draw(); return;
    }
    const mc = e.target.closest('[data-mcp]');
    if (mc && mcp) { await window.api.copy(mcp[mc.dataset.mcp]); mc.textContent = 'Copied ✓'; setTimeout(() => { mc.textContent = mc.dataset.mcp === 'code' ? 'Copy command' : 'Copy config'; }, 1500); return; }
    if (e.target.closest('[data-guide]')) { g('settings').hidden = true; openGuide(); return; }
    if (e.target.closest('[data-changelog]')) { g('settings').hidden = true; openDoc('changelog'); return; }
    const lic = e.target.closest('[data-lic]');
    if (lic) { window.api.licence(lic.dataset.lic === 'third' ? 'third' : 'own'); return; }
    if (e.target.closest('[data-resetall]') && await Dialog.confirm('Put every setting back to its default?')) { values = {}; window.api.setSetting('prefs', values); apply(); applyTheme(); draw(); }
  });
  g('settings').onclick = (e) => { if (e.target === g('settings')) g('settings').hidden = true; };
  g('setClose').onclick = () => { g('settings').hidden = true; };

  return { load, get, set, open, applyTheme };
})();
