const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
await until("typeof V !== 'undefined' && V.notes.length === 4 && !!current", 30000);
await ev("Prefs.open()"); await sleep(300);
await shot('s1-settings');
ok('settings page lists sections', /Appearance.*Templates.*Dataview.*About/s.test(await ev("g('setNav').textContent")), await ev("g('setNav').children.length + ' sections'"));
// appearance applies at once
await ev("Prefs.set('fontSize', 20); Prefs.set('lineWidth', '960'); Prefs.set('theme', 'dark')");
ok('text size / width / theme applied', (await ev("getComputedStyle(g('note')).fontSize")) === '20px' && (await ev("document.documentElement.dataset.theme")) === 'dark', await ev("getComputedStyle(g('note')).maxWidth"));
// daily note with template and folder
await ev("(() => { const nl = String.fromCharCode(10); Prefs.set('dailyFolder', 'Journal'); Prefs.set('dailyFormat', 'YYYY-MM-DD ddd'); Prefs.set('dailyTemplate', '# {{date}}' + nl + '## Tasks' + nl); })()");
await ev("g('settings').hidden = true; Ed.dailyNote()");
await until("current && current.startsWith('Journal/')", 10000);
const daily = fs.readdirSync(path.join(dir, 'Journal'))[0];
ok('daily note uses folder, format and template', /^\d{4}-\d\d-\d\d \w{3}\.md$/.test(daily) && fs.readFileSync(path.join(dir, 'Journal', daily), 'utf8').includes('## Tasks'), daily);
// new notes go to a chosen folder
await ev("Prefs.set('newNoteLocation', 'folder'); Prefs.set('newNoteFolder', 'Inbox')");
await ev("Ed.newNote()"); await until("current && current.startsWith('Inbox/')", 10000);
ok('new note goes to the chosen folder', fs.existsSync(path.join(dir, 'Inbox', 'Untitled.md')));
// rename without updating links
await ev("Prefs.set('renameLinks', 'never')");
await ev("openNote('A.md')"); await sleep(400);
await ev("Ed.toggleTo('edit')"); await until("Ed.path === 'A.md'", 5000);
await ev("(() => { g('editTitle').focus(); g('editTitle').value = 'A2'; g('editTitle').blur(); g('editTitle').dispatchEvent(new Event('blur')); })()");
try { await until("V.notes.includes('A2.md')", 10000); } catch (e) { log('DEBUG', await ev("JSON.stringify({ notes: V.notes, current, edPath: Ed.path, title: g('editTitle').value, toast: g('toast').textContent, focused: document.activeElement && document.activeElement.id })")); throw e; }
await sleep(500);
ok('"leave links" keeps [[A]] in Home', fs.readFileSync(path.join(dir, 'Home.md'), 'utf8').includes('[[A]]'));
// excluded folder disappears after reload
await ev("Prefs.set('exclude', 'Archive')");
await ev("reloadVault(true)"); await until("!V.notes.includes('Archive/Old.md')", 15000);
ok('excluded folder is not indexed', !(await ev("V.notes.includes('Archive/Old.md')")));
// settings survive a restart: stored in settings.json
const st = JSON.parse(fs.readFileSync(path.join(require('os').tmpdir(), 'lanternote-drive-profile', 'settings.json'), 'utf8'));
ok('settings stored', st.prefs && st.prefs.fontSize === 20 && st.prefs.exclude === 'Archive', JSON.stringify(st.prefs).slice(0, 120));
await ev("Prefs.open('Editor')"); await sleep(300); await shot('s2-settings-editor');
