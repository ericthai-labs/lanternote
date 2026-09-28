// Command Center test (run with scripts/drive.js on a TEMPORARY vault made
// by tests/make-cc-vault.js; needs TV=<vault folder>).
const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
await until("typeof V !== 'undefined' && V.notes.length >= 9", 30000);
await ev("Ed.toggleTo('read')");
await ev("Prefs.set('ccBackground', 'auto')");
// open with the toolbar button: built-in layout
await ev("g('btnHome').click()");
await until("view === 'cc' && !g('ccView').hidden && g('main').hidden", 5000);
ok('toolbar button opens the Command Center', true);
ok('built-in layout when the note does not exist', /Built-in layout/.test(await ev("g('ccSource').textContent")));
ok('three columns', (await ev("[...document.querySelectorAll('#ccBody .cc-col')].map(c => c.className).join(',')")) === 'cc-col cc-left,cc-col cc-center,cc-col cc-right');
ok('no empty card from the comment', await ev("[...document.querySelectorAll('#ccBody .cc-card')].every(c => c.textContent.trim())"));
const stats = await ev("[...document.querySelectorAll('.cc-stat b')].map(b => b.textContent)");
ok('stats: notes, links, tags, edited today, 7 days', JSON.stringify(stats) === JSON.stringify(['9', '3', '3', '1', '5']), JSON.stringify(stats));
const gates = await ev("[...document.querySelectorAll('.cc-gate')].map(a => a.querySelector('.cc-gnum').textContent + ' ' + a.querySelector('.cc-gname').textContent + ' ' + a.querySelector('.cc-sub').textContent)");
ok('folder gates with numbers and counts', JSON.stringify(gates) === JSON.stringify(['00 Inbox 2 notes', '01 Process 1 notes', '03 Projects 4 notes']), JSON.stringify(gates));
const recent = await ev("[...document.querySelectorAll('.cc-item .cc-name')].map(a => a.textContent)");
ok('recent: newest first', recent[0] === 'Latest' && recent[1] === 'Home' && recent.length === 9, JSON.stringify(recent));
await until("document.querySelectorAll('#ccBody .dv tbody tr').length > 0", 10000);
const due = await ev("[...document.querySelectorAll('#ccBody .dv tbody tr')].map(tr => tr.cells[0].textContent)");
ok('dataview card: due in 14 days', JSON.stringify(due) === JSON.stringify(['Alpha', 'Beta']), JSON.stringify(due));
ok('query card shows its count', (await ev("[...document.querySelectorAll('.cc-card')].find(c => c.querySelector('.dv')).querySelector('.cc-count').textContent")) === '2');
ok('tags block', /#project/.test(await ev("document.querySelector('.cc-tags').textContent")));
// background
ok('automatic background is drawn (moving or still)', ['moving', 'still'].includes(await ev('CC.sky.mode')) && await ev("g('ccView').classList.contains('space') && !g('ccSky').hidden"), await ev('CC.sky.mode'));
await sleep(2500);
log('sky mode', await ev('CC.sky.mode'), 'frame cost ms', await ev('CC.sky.cost.toFixed(2)'));
await shot('cc1-space');
await ev("Prefs.set('ccBackground', 'moving')");
await sleep(2500);
ok('moving stars animate', (await ev('CC.sky.mode')) === 'moving' && (await ev('CC.sky.cost')) > 0);
log('moving: frame cost ms', await ev('CC.sky.cost.toFixed(2)'));
await ev("Prefs.set('ccBackground', 'still')");
ok('still picture', (await ev('CC.sky.mode')) === 'still');
await ev("Prefs.set('ccBackground', 'plain')");
ok('plain background follows the theme', (await ev('CC.sky.mode')) === 'plain' && await ev("g('ccSky').hidden && !g('ccView').classList.contains('space')"));
await shot('cc2-plain');
await ev("Prefs.set('ccBackground', 'auto')");
// a folder gate opens the folder in the file list, the page stays
await ev("document.querySelector('.cc-gate[data-cc-dir=\"03-Projects\"]').click()");
ok('folder gate opens the folder in the file list', await ev("openDirs.has('03-Projects') && !!g('tree').querySelector('[data-path=\"03-Projects/Alpha.md\"]') && view === 'cc'"));
// a note link leaves the page
await ev("document.querySelector('.cc-item[data-path=\"Home.md\"]').click()");
await until("current === 'Home.md' && view === 'note'", 5000);
ok('clicking a note opens it', true);
ok('sky stops when the page is hidden', !(await ev('CC.visible')));
await ev('toggleCC()'); await until("view === 'cc'", 3000);
ok('toggleCC opens again', true);
// the galaxy: one star per note, explorable
await until('CC.sky.data && CC.sky.data.n === V.notes.length', 5000);
ok('galaxy has one star per note, arms per top folder', (await ev('CC.sky.data.folders.map(f => f.name + ":" + f.n).join()')) === '03-Projects:4,lanternote-cc-vault:2,00-Inbox:2,01-Process:1', await ev('CC.sky.data.folders.map(f => f.name + ":" + f.n).join()'));
ok('notes edited in 7 days shine', (await ev('CC.sky.data.recent.map(i => CC.sky.data.notes[i]).join()')) === 'Latest.md,Home.md,03-Projects/Beta.md,03-Projects/Alpha.md,03-Projects/Gamma.md', await ev('CC.sky.data.recent.map(i => CC.sky.data.notes[i]).join()'));
const pos1 = await ev("JSON.stringify([CC.sky.data.x[0], CC.sky.data.y[0]])");
await ev("document.querySelector('[data-cc-act=\"galaxy\"]').click()");
ok('Galaxy button: cards step aside, legend shows', await ev("CC.sky.explore && g('ccView').classList.contains('exploring') && /9 notes/.test(g('ccLegend').textContent) && getComputedStyle(g('ccBody')).visibility === 'hidden'"));
await sleep(300);
await shot('cc4-galaxy');
const z0 = await ev('CC.sky.zoom');
await ev("(() => { const r = g('ccSky').getBoundingClientRect(); g('ccSky').dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true })); })()");
ok('scroll wheel zooms in', (await ev('CC.sky.zoom')) > z0 * 1.5, await ev('CC.sky.zoom'));
await ev("(() => { const r = g('ccSky').getBoundingClientRect(); g('ccSky').dispatchEvent(new WheelEvent('wheel', { deltaY: 900, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true })); })()");
ok('and out again, smaller than at start', (await ev('CC.sky.zoom')) < z0, await ev('CC.sky.zoom'));
await ev('CC.sky.zoom = 1');
await ev("document.querySelector('.cc-lg[data-hl]').click()");
ok('legend highlights a folder', await ev("!!document.querySelector('.cc-lg.on')"));
await ev("document.querySelector('.cc-lg[data-hl]').click()");
// hover + click a star opens its note
const hi = await ev("CC.sky.data.notes.indexOf('Home.md')");
await ev(`(() => { const [x, y] = CC.sky.screenOf(${hi}); const r = g('ccSky').getBoundingClientRect(); const o = { clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1 }; g('ccSky').dispatchEvent(new PointerEvent('pointermove', o)); })()`);
await until(`CC.sky.hover === ${hi}`, 3000);
ok('hovering a star finds its note', true);
await shot('cc5-hover');
await ev(`(() => { const [x, y] = CC.sky.screenOf(${hi}); const r = g('ccSky').getBoundingClientRect(); const o = { clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1 }; g('ccSky').dispatchEvent(new PointerEvent('pointerdown', o)); g('ccSky').dispatchEvent(new PointerEvent('pointerup', o)); })()`);
await until("current === 'Home.md' && view === 'note'", 5000);
ok('clicking a star opens the note, galaxy mode ends', !(await ev('CC.sky.explore')));
await ev('toggleCC()'); await until("view === 'cc'", 3000);
ok('a star stays in place between visits', (await ev("JSON.stringify([CC.sky.data.x[0], CC.sky.data.y[0]])")) === pos1);
await ev("Prefs.set('ccBackground', 'moving'); Prefs.set('ccMotion', 'fast')");
await ev("document.querySelector('[data-cc-act=\"galaxy\"]').click()");
const a0 = await ev('CC.sky.angle'); await sleep(1200);
ok('the galaxy keeps turning while explored', (await ev('CC.sky.angle')) > a0 + 0.05, `${a0} → ${await ev('CC.sky.angle')}`);
await ev(`(() => { const [x, y] = CC.sky.screenOf(${hi}); const r = g('ccSky').getBoundingClientRect(); g('ccSky').dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + x, clientY: r.top + y, bubbles: true })); })()`);
await until(`CC.sky.hover === ${hi}`, 3000);
const a1 = await ev('CC.sky.angle'); await sleep(800);
ok('and holds still while a star is pointed at', (await ev('CC.sky.angle')) === a1);
await ev("Prefs.set('ccMotion', 'off')"); const a2 = await ev('CC.sky.angle');
await ev("g('ccSky').dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5, bubbles: true }))"); await sleep(800);
ok('turning speed Off stops it', (await ev('CC.sky.angle')) === a2);
await ev("Prefs.set('ccMotion', 'normal'); Prefs.set('ccBackground', 'auto')");
await ev("document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
// the settings page fits a narrow window (no sideways scrolling)
await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 660, deviceScaleFactor: 1, mobile: false });
await ev("Prefs.open('Command Center')"); await sleep(500);
ok('settings fit a narrow window', await ev("(() => { const m = document.querySelector('.set-main'); return m.scrollWidth <= m.clientWidth + 1; })()"), await ev("document.querySelector('.set-main').scrollWidth + ' / ' + document.querySelector('.set-main').clientWidth"));
await shot('cc6-settings-narrow');
await ev("g('settings').hidden = true");
await send('Emulation.clearDeviceMetricsOverride');
await ev("document.querySelector('[data-cc-act=\"galaxy\"]').click()");
await ev("document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
ok('Esc leaves galaxy mode', await ev("!CC.sky.explore && !g('ccView').classList.contains('exploring')"));
// "Layout" creates the note from the template and opens it for editing
await ev("document.querySelector('[data-cc-act=\"edit\"]').click()");
await until("current === 'Command Center.md' && Ed.active()", 8000);
ok('Layout creates the note and opens it for editing', fs.existsSync(path.join(dir, 'Command Center.md')) && fs.readFileSync(path.join(dir, 'Command Center.md'), 'utf8') === await ev('CC.TEMPLATE'));
// a custom layout, changed on disk while the page is open
await ev("Ed.toggleTo('read')");
await ev('toggleCC()'); await until("view === 'cc' && /From/.test(g('ccSource').textContent)", 5000);
ok('page now says where it comes from', /From Command Center/.test(await ev("g('ccSource').textContent")));
fs.writeFileSync(path.join(dir, 'Command Center.md'), '---\nx: 1\n---\n# Mission Control\n\n# Right\n## Focus\n- [ ] Ship it\n- [[Alpha]]\n\n```lantern\nrecent 2 03-Projects\n```\n\n```lantern\nbogus\n```\n\n# Left\n## Notes\nplain text\n');
await until("g('ccTitle').textContent === 'Mission Control'", 8000);
ok('layout note changes redraw the page', true);
ok('cards go to the columns named', await ev("document.querySelector('.cc-right .cc-h span').textContent === 'Focus' && document.querySelector('.cc-left .cc-h span').textContent === 'Notes' && !document.querySelector('.cc-center .cc-card')"));
ok('task checkboxes are read-only on the page', await ev("[...document.querySelectorAll('#ccBody input[type=checkbox]')].length === 1 && [...document.querySelectorAll('#ccBody input[type=checkbox]')].every(c => c.disabled)"));
ok('wiki links work in cards', await ev("!!document.querySelector('#ccBody a.internal[data-path=\"03-Projects/Alpha.md\"]')"));
const r2 = await ev("[...document.querySelectorAll('.cc-right .cc-item .cc-name')].map(a => a.textContent)");
ok('recent in one folder', JSON.stringify(r2) === JSON.stringify(['Beta', 'Alpha']), JSON.stringify(r2));
ok('unknown lantern block explains itself', /Unknown lantern block "bogus"/.test(await ev("document.querySelector('.cc-right').textContent")));
// another note changing refreshes the blocks
fs.writeFileSync(path.join(dir, '03-Projects', 'Delta.md'), '# Delta\n');
await until("[...document.querySelectorAll('.cc-right .cc-item .cc-name')].map(a => a.textContent).join() === 'Delta,Beta'", 8000);
ok('index changes reach the page', true);
await shot('cc3-custom');
const errs = consoleLines.filter((l) => /EXCEPTION|^error:/i.test(l));
ok('no errors in the window', errs.length === 0, errs.join('\n'));
