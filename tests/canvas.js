// Canvas test (run with scripts/drive.js on a TEMPORARY vault — it writes files).
// Vault: Home.md, Plan.md ("## Goals"), pics/sunset.png (1600×900), Board.canvas
// (made by tests/make-canvas-vault.js). Needs TV=<vault folder>.
const fs = require('fs'), path = require('path');
const dir = process.env.TV, rd = () => JSON.parse(fs.readFileSync(path.join(dir, 'Board.canvas'), 'utf8'));
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
await until("typeof V !== 'undefined' && V.notes.length === 2", 30000);
ok('canvas listed in the tree', (await ev("g('tree').querySelectorAll('.row.canvas').length")) === 1);
await ev("document.querySelector('#tree .row.canvas').click()");
await until("CanvasView.active()", 5000); await sleep(800);
ok('5 cards and 2 arrows drawn', (await ev("g('cvLayer').querySelectorAll('.cv-node').length")) === 5 && (await ev("g('cvLayer').querySelectorAll('path.cv-edge').length")) === 2);
ok('text card renders Markdown with a working [[link]]', (await ev("!!g('cvLayer').querySelector('[data-id=t1] a.internal[data-path=\"Plan.md\"]')")) && (await ev("!!g('cvLayer').querySelector('[data-id=t1] strong')")));
ok('note card shows the note', /Goals/.test(await ev("g('cvLayer').querySelector('[data-id=f1]').textContent")));
ok('image card shows the picture', (await ev("g('cvLayer').querySelector('[data-id=f2] img').naturalWidth")) === 1600);
ok('arrow label + group label', /details/.test(await ev("g('cvLayer').textContent")) && /Project/.test(await ev("g('cvLayer').textContent")));
await shot('c2-canvas');
const R = JSON.parse(await ev("JSON.stringify(g('cvViewport').getBoundingClientRect())"));
const rectOf = async (id) => JSON.parse(await ev(`JSON.stringify(g('cvLayer').querySelector('[data-id=${id}]').getBoundingClientRect())`));
const mouse = async (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });

// move a card by dragging
const t1 = await rectOf('t1');
await mouse('mousePressed', t1.x + 30, t1.y + 30);
for (let i = 1; i <= 5; i++) await mouse('mouseMoved', t1.x + 30 + i * 12, t1.y + 30 + i * 6);
await mouse('mouseReleased', t1.x + 90, t1.y + 60);
await sleep(1500);
const moved = rd().nodes.find((n) => n.id === 't1');
ok('dragging a card moves it and saves', moved.x !== 0 && moved.y !== 0, `x=${moved.x} y=${moved.y}`);
ok('unknown fields kept', moved['x-extra'] === 'keep me' && rd()['x-top'] === 'also keep');
ok('saved with tab indentation (usual JSON Canvas layout)', fs.readFileSync(path.join(dir, 'Board.canvas'), 'utf8').includes('\n\t"nodes"'));
await ev("g('cvUndo').click()"); await sleep(1500);
ok('undo puts it back', rd().nodes.find((n) => n.id === 't1').x === 0);

// double-click the empty board → new text card, type into it
const ex = R.x + R.width - 60, ey = R.y + R.height - 60;
await ev(`g('cvViewport').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: ${ex}, clientY: ${ey} }))`);
await sleep(300);
if (await ev("!!g('cvLayer').querySelector('.cv-edit')")) {
  await send('Input.insertText', { text: 'New card from test' });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
}
await sleep(1500);
ok('double-click creates a text card, typing saves', rd().nodes.some((n) => n.type === 'text' && n.text === 'New card from test'), rd().nodes.length + ' nodes');

// draw an arrow from the left dot of l1 to f2
await ev("CanvasView.fit()"); await sleep(200);
await ev("g('cvLayer').querySelector('[data-id=l1]').classList.add('sel')");
const dot = JSON.parse(await ev("JSON.stringify(g('cvLayer').querySelector('[data-id=l1] .cv-dot-left').getBoundingClientRect())"));
const f2 = await rectOf('f2');
await mouse('mousePressed', dot.x + dot.width / 2, dot.y + dot.height / 2);
for (let i = 1; i <= 6; i++) await mouse('mouseMoved', dot.x + (f2.x + f2.width / 2 - dot.x) * i / 6, dot.y + (f2.y + f2.height / 2 - dot.y) * i / 6);
await mouse('mouseReleased', f2.x + f2.width / 2, f2.y + f2.height / 2);
await sleep(1500);
ok('dragging from a side dot draws an arrow', rd().edges.some((e) => e.fromNode === 'l1' && e.toNode === 'f2'), rd().edges.length + ' edges');

// Ctrl+wheel zoom
const z0 = await ev("g('cvZoom').textContent");
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: R.x + 50, y: R.y + 50, deltaX: 0, deltaY: -300, modifiers: 2 });
await sleep(200);
ok('Ctrl+wheel zooms', (await ev("g('cvZoom').textContent")) !== z0, z0 + ' → ' + await ev("g('cvZoom').textContent"));

// a change made outside the app is loaded
const d = rd(); d.nodes.push({ id: 'ext', type: 'text', x: 900, y: 0, width: 200, height: 60, text: 'from outside' });
fs.writeFileSync(path.join(dir, 'Board.canvas'), JSON.stringify(d, null, '\t'));
await sleep(2500);
ok('change made outside is loaded', await ev("!!g('cvLayer').querySelector('[data-id=ext]')"));

// renaming a note updates the card that shows it
await ev("openNote('Plan.md')"); await until("current === 'Plan.md'", 5000);
await ev("Ed.toggleTo('edit')"); await until("Ed.path === 'Plan.md'", 5000);
await ev("(() => { g('editTitle').focus(); g('editTitle').value = 'Roadmap'; g('editTitle').blur(); g('editTitle').dispatchEvent(new Event('blur')); })()");
await until("V.notes.includes('Roadmap.md')", 10000); await sleep(1500);
ok('renaming a note updates the canvas card', rd().nodes.some((n) => n.file === 'Roadmap.md'), await ev("g('toast').textContent"));
await ev("Ed.toggleTo('read')");

// a [[link]] inside a card opens the note
await ev("openNote('Board.canvas')"); await until("CanvasView.active()", 5000); await sleep(600);
await ev("g('cvLayer').querySelector('[data-id=t1] a.internal').click()"); await sleep(800);
ok('a [[link]] inside a card opens the note', (await ev("current")) !== 'Board.canvas', await ev("current"));

// a new canvas
await ev("CanvasView.create('')"); await until("current && /Untitled\\.canvas$/.test(current)", 10000);
ok('new canvas created and opened', fs.existsSync(path.join(dir, 'Untitled.canvas')) && (await ev("!g('cvEmpty').hidden")));
