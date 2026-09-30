// Live preview in the editor (1.18). Folder: the basic one from run-all.js
// (Home.md: "# Home", links [[A]] [[Missing]] [md](sub/B.md), two tasks, two pictures).
const fs = require('fs'), path = require('path');
const dir = process.env.TV, rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
async function click(sel, modifiers = 0) {
  const r = JSON.parse(await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'null'; const b = e.getBoundingClientRect(); return JSON.stringify({ x: b.x + Math.min(6, b.width / 2), y: b.y + b.height / 2 }); })()`));
  if (!r) throw new Error('not found: ' + sel);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1, modifiers });
}
await until("typeof V !== 'undefined' && V.notes.length >= 3 && current === 'Home.md'", 30000);
const before = rd('Home.md');
await ev("Prefs.set('livePreview', true)");
await ev("Ed.toggleTo('edit')"); await until("Ed.active() && !!Ed._cm()", 5000);
// cursor inside [[A]] on the "See [[A]]…" line
await ev("(() => { const v = Ed._cm().view; const l = v.state.doc.line(3); v.dispatch({ selection: { anchor: l.from + l.text.indexOf('[[A]]') + 3 } }); })()");
await sleep(300);
const line1 = () => ev("document.querySelector('#editorHost .cm-line').textContent");
ok('heading mark hidden away from the cursor', (await line1()) === 'Home', JSON.stringify(await line1()));
ok('the link with the cursor shows its Markdown', (await ev("document.querySelectorAll('#editorHost .cm-line')[2].textContent")).includes('[[A]]'));
// cursor elsewhere: links, tasks and pictures render
await ev("(() => { const v = Ed._cm().view; v.dispatch({ selection: { anchor: 0 } }); })()");
await sleep(300);
const links = await ev("[...document.querySelectorAll('#editorHost .cm-lp-link')].map(e => e.textContent + '>' + (e.dataset.target || e.dataset.href)).join(' | ')");
ok('wiki and Markdown links render as links', /A>A/.test(links) && /md>sub\/B\.md/.test(links) && !(await ev("document.querySelectorAll('#editorHost .cm-line')[2].textContent")).includes('[['), links);
ok('tasks render as checkboxes', await ev("document.querySelectorAll('#editorHost .cm-lp-check').length === 2"));
ok('pictures render in the editor', await ev("document.querySelectorAll('#editorHost img.cm-lp-img').length === 2"), await ev("[...document.querySelectorAll('#editorHost img.cm-lp-img')].map(i => i.src).join(' ')"));
ok('the cursor line (heading) shows its marks', (await line1()) === '# Home', JSON.stringify(await line1()));
ok('the file text is untouched', rd('Home.md') === before);
// click a checkbox: the text changes, and is saved
await click('#editorHost .cm-lp-check');
await sleep(1800);
ok('clicking a checkbox ticks the task in the file', /- \[x\] first task/.test(rd('Home.md')), rd('Home.md').split('\n')[4]);
// click a link: it opens
await ev("(() => { const v = Ed._cm().view; v.dispatch({ selection: { anchor: 0 } }); })()"); await sleep(200);
await click('#editorHost .cm-lp-link[data-target="A"]');
await until("current === 'A.md'", 5000);
ok('clicking a link opens the note', true);
await ev("openNote('Home.md')"); await until("Ed.path === 'Home.md'", 5000);
// Alt+click: the right pane
await ev("(() => { const v = Ed._cm().view; v.dispatch({ selection: { anchor: 0 } }); })()"); await sleep(300);
await click('#editorHost .cm-lp-link[data-target="A"]', 1);
await until("Split.visible && Split.path === 'A.md'", 5000);
ok('Alt+click on a link opens it in the right pane', await ev("current === 'Home.md'"));
await ev("Split.hide()");
// turned off: plain Markdown again
await ev("Prefs.set('livePreview', false)"); await sleep(300);
ok('turning live preview off shows plain Markdown', (await line1()) === '# Home' && await ev("document.querySelectorAll('#editorHost .cm-lp-link, #editorHost .cm-lp-check').length === 0"));
await ev("Prefs.set('livePreview', true)"); await sleep(300);
ok('turning it back on', await ev("document.querySelectorAll('#editorHost .cm-lp-check').length === 2"));
// front matter is shown as properties, not read as a rule and a heading
fs.writeFileSync(path.join(dir, 'FM.md'), '---\ntype: project\nstatus: done\n---\n# Title\n\nBody\n');
await until("V.notes.includes('FM.md')", 10000);
await ev("openNote('FM.md')"); await until("Ed.path === 'FM.md'", 5000);
await ev("(() => { const v = Ed._cm().view; v.dispatch({ selection: { anchor: v.state.doc.length } }); })()"); await sleep(300);
const fmInfo = await ev("JSON.stringify([...document.querySelectorAll('#editorHost .cm-line')].slice(0, 5).map(l => [l.classList.contains('cm-lp-fm'), l.textContent, Math.round(parseFloat(getComputedStyle(l.querySelector('span') || l).fontSize))]))");
const rows = JSON.parse(fmInfo);
ok('front matter lines are shown as properties', rows.slice(0, 4).every((r) => r[0]) && rows[2][1] === 'status: done' && rows[2][2] <= rows[4][2] + 1 && !rows[4][0], fmInfo);
