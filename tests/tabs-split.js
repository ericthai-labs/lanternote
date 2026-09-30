// Tabs and the right pane (1.18). Folder: the basic one from run-all.js
// (Home.md links [[A]] and [md](sub/B.md), two tasks; sub/B.md links [[A|alias]]).
const fs = require('fs'), path = require('path');
const dir = process.env.TV, rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const MOD = process.platform === 'darwin' ? 4 : 2; // CDP modifiers: Ctrl = 2, Meta = 4, Alt = 1
async function click(sel, modifiers = 0, button = 'left') {
  const r = JSON.parse(await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'null'; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return JSON.stringify({ x: b.x + Math.min(8, b.width / 2), y: b.y + b.height / 2 }); })()`));
  if (!r) throw new Error('not found: ' + sel);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button, buttons: button === 'middle' ? 4 : 1, clickCount: 1, modifiers });
}
await until("typeof V !== 'undefined' && V.notes.length >= 3 && current === 'Home.md'", 30000);
await ev("Ed.toggleTo('read')"); await sleep(300);

// 1. one tab to start with
ok('one tab for the open note', await ev("Tabs.list.length === 1 && !g('tabbar').hidden && g('tabbar').textContent.includes('Home')"), await ev("g('tabbar').textContent"));
// 2. Ctrl+click a link: a new tab, the first keeps its note
await click('#note a.internal[data-path="A.md"]', MOD);
await until("current === 'A.md'", 5000);
ok('Ctrl+click opens the link in a new tab', await ev("Tabs.list.length === 2 && Tabs.active === 1 && Tabs.list[0].path === 'Home.md'"), await ev("JSON.stringify(Tabs.list.map(t => t.path))"));
// 3. each tab has its own history
await ev("Tabs.switchTo(0)"); await until("current === 'Home.md'", 5000);
await click('#note a.internal[data-path="sub/B.md"]');
await until("current === 'sub/B.md'", 5000);
ok('a plain click stays in the tab', await ev("Tabs.list.length === 2 && Tabs.list[0].path === 'sub/B.md' && Tabs.list[1].path === 'A.md'"));
await ev("go(-1)"); await until("current === 'Home.md'", 5000);
ok('Back works inside the tab', await ev("Tabs.list[0].path === 'Home.md' && Tabs.list[1].path === 'A.md'"));
await ev("Tabs.switchTo(1)"); await until("current === 'A.md'", 5000);
ok('the other tab has its own history', await ev("g('btnBack').disabled === true"), 'back disabled in the A tab');
// 4. close a tab
await ev("closeTab()"); await until("Tabs.list.length === 1", 5000);
ok('closing the active tab shows the next one', await ev("current === 'Home.md'"));
// 5. middle-click a file in the list: a new tab
await ev("(() => { g('fileFilter').value = 'A'; renderTree(); })()"); await sleep(200);
await click('#tree .row.file[data-path="A.md"]', 0, 'middle');
await until("Tabs.list.length === 2", 5000);
ok('middle-click in the file list opens a new tab', await ev("current === 'A.md'"));
await ev("(() => { g('fileFilter').value = ''; renderTree(); })()");
// 6. quick open into a new tab (Ctrl+T)
await ev("Tabs.newTab()"); await sleep(200);
await ev("(() => { g('swInput').value = 'B'; swFilter(); })()"); await sleep(200);
await ev("chooseSw(swItems.find(i => i.p === 'sub/B.md'))");
await until("current === 'sub/B.md'", 5000);
ok('New tab picks a note to open', await ev("Tabs.list.length === 3 && Tabs.active === 2"), await ev("JSON.stringify(Tabs.list.map(t => t.path))"));
// 7. tabs are remembered for the folder
await sleep(600);
const saved = await ev("window.api.getSetting('tabs:' + V.name).then(JSON.stringify)");
ok('tabs are saved for this folder', /Home\.md.*A\.md.*sub\/B\.md/.test(saved), saved);
await ev("Tabs.restore(null)"); await sleep(800);
ok('saved tabs come back', await ev("Tabs.list.length === 3 && current === 'sub/B.md'"), await ev("JSON.stringify(Tabs.list.map(t => t.path)) + ' ' + current"));

// 8. Alt+click: the right pane
await ev("Tabs.switchTo(0)"); await until("current === 'Home.md'", 5000);
await click('#note a.internal[data-path="A.md"]', 1);
await until("Split.visible && Split.path === 'A.md'", 5000);
ok('Alt+click opens the link in the right pane', await ev("current === 'Home.md' && g('splitNote').textContent.includes('Text of A')"));
// 9. links inside the right pane stay there
await ev("Split.open('sub/B.md')"); await until("Split.path === 'sub/B.md'", 5000);
await click('#splitNote a.internal[data-path="A.md"]');
await until("Split.path === 'A.md'", 5000);
ok('a link in the right pane opens in that pane', await ev("current === 'Home.md'"));
await ev("Split.go(-1)"); await until("Split.path === 'sub/B.md'", 5000);
ok('Back in the right pane', true);
// 10. editing in the right pane saves the file
await ev("Split.open('A.md')"); await until("Split.path === 'A.md'", 5000);
await ev("Split.toggleMode()"); await until("!!Split._cm() && !g('splitEditor').hidden", 5000);
await ev("(() => { const v = Split._cm().view; v.dispatch({ changes: { from: v.state.doc.length, insert: '\\nWritten in the right pane.' } }); })()");
await sleep(1800);
ok('the right pane saves its edits', rd('A.md').includes('Written in the right pane.'), await ev("g('splitState').textContent"));
// 11. a change on disk reaches the right pane's editor
fs.writeFileSync(path.join(dir, 'A.md'), rd('A.md') + '\nAdded outside.\n');
await sleep(2500);
ok('an outside change reloads the right pane', (await ev("Split._cm().getValue()")).includes('Added outside.'));
// 12. both panes on one note: an edit in the main pane shows in the right one
await ev("openNote('A.md')"); await until("current === 'A.md'", 5000);
await ev("Ed.toggleTo('edit')"); await until("Ed.path === 'A.md'", 5000);
await ev("(() => { const v = Ed._cm().view; v.dispatch({ changes: { from: v.state.doc.length, insert: '\\nFrom the main pane.' } }); })()");
await sleep(3000);
ok('an edit in the main pane reaches the right pane', (await ev("Split._cm().getValue()")).includes('From the main pane.') && rd('A.md').includes('Written in the right pane.'));
await ev("Ed.toggleTo('read')"); await sleep(300);
// 13. tasks tick in the right pane (reading view)
await ev("Split.toggleMode()"); await ev("Split.open('Home.md')"); await until("Split.path === 'Home.md' && !!document.querySelector('#splitNote input[data-split-task]')", 5000);
await click('#splitNote input[data-split-task="0"]');
await sleep(1200);
ok('a task ticks from the right pane', /- \[x\] first task/.test(rd('Home.md')), rd('Home.md').split('\n')[4]);
// 14. the right pane is remembered, and closes
await sleep(500);
const sp = await ev("window.api.getSetting('split:' + V.name).then(JSON.stringify)");
ok('the right pane is saved for this folder', /Home\.md/.test(sp), sp);
await ev("Split.hide()"); await sleep(400);
ok('closing the right pane', await ev("!Split.visible && g('split').hidden"));
