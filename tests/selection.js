// Selected text must be visible while editing (1.24), also on the cursor's line. Folder: the basic one from run-all.js.
const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);

await until("typeof V !== 'undefined' && V.notes.length >= 3", 30000);
fs.writeFileSync(path.join(dir, 'Sel.md'), '# Sel\n\nLine one has words to select.\nLine two too.\nLine three.\n');
await until("V.idx.has('Sel.md')", 10000);
await ev("openNote('Sel.md')"); await until("current === 'Sel.md'", 5000);
await ev("Ed.toggleTo('edit')"); await until("Ed.active()", 5000); await sleep(300);

const select = (l1, c1, l2, c2) => ev(`(() => { const ls = [...document.querySelectorAll('#editPane .cm-line')]; const tn = (n) => { while (n && n.nodeType !== 3) n = n.firstChild; return n; };
  document.querySelector('#editPane .cm-content').focus(); const r = document.createRange(); r.setStart(tn(ls[${l1}]), ${c1}); r.setEnd(tn(ls[${l2}]), ${c2});
  const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`);
// a colour as [r, g, b, alpha] (handles rgb() and color(srgb …))
const rgba = (expr) => ev(`(() => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = '#000'; c.fillStyle = ${expr}; c.fillRect(0, 0, 1, 1); const bg = getComputedStyle(document.querySelector('#editPane')).backgroundColor; return [...c.getImageData(0, 0, 1, 1).data]; })()`);

for (const theme of ['light', 'dark']) {
  await ev(`document.documentElement.dataset.theme = '${theme}'`); await sleep(200);
  await select(2, 5, 3, 4); await sleep(300);
  const n = await ev("document.querySelectorAll('#editPane .cm-selectionBackground').length");
  ok(`${theme}: the selection is drawn`, n >= 2, n + ' boxes');
  ok(`${theme}: no cursor-line tint while text is selected`, await ev("!document.querySelector('#editPane .cm-activeLine')"));
  // the selection colour, laid over the page, must differ clearly from the page
  const page = await ev("getComputedStyle(document.body).getPropertyValue('--bg').trim()");
  const sel = await ev("getComputedStyle(document.querySelector('#editPane .cm-selectionBackground')).backgroundColor");
  const mixed = await ev(`(() => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = ${JSON.stringify(page)}; c.fillRect(0, 0, 1, 1); c.fillStyle = ${JSON.stringify(sel)}; c.fillRect(0, 0, 1, 1); const a = [...c.getImageData(0, 0, 1, 1).data]; c.fillStyle = ${JSON.stringify(page)}; c.fillRect(0, 0, 1, 1); const b = [...c.getImageData(0, 0, 1, 1).data]; return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]); })()`);
  ok(`${theme}: the selection stands out from the page`, mixed >= 60, `colour distance ${mixed} (${sel} on ${page})`);
  await shot('selection-' + theme);
}
// a plain cursor: the line tint is back
await ev("(() => { const s = getSelection(); s.collapseToStart(); return true; })()"); await sleep(300);
ok('without a selection the cursor line is tinted again', await ev("!!document.querySelector('#editPane .cm-activeLine')"));
await ev("document.documentElement.dataset.theme = 'light'");
await ev("Ed.toggleTo('read')");
