// Folding in the editor (1.23). Folder: the basic one from run-all.js; a note is added.
const fs = require('fs'), path = require('path');
const dir = process.env.TV, rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const TEXT = '# Fold\n\nIntro.\n\n## One\n\nText one.\nMore one.\n\n## Two\n\n- item\n  - child a\n  - child b\n\nText two.\n';

await until("typeof V !== 'undefined' && V.notes.length >= 3", 30000);
fs.writeFileSync(path.join(dir, 'Fold.md'), TEXT);
await until("V.idx.has('Fold.md')", 10000);
await ev("Prefs.set('folding', true)");
await ev("openNote('Fold.md')"); await until("current === 'Fold.md'", 5000);
await ev("Ed.toggleTo('edit')"); await until("Ed.active() && !!Ed._cm()", 5000); await sleep(400);
const marks = await ev("document.querySelectorAll('#editorHost .cm-foldGutter .cm-fold-mark').length");
ok('fold marks next to headings and lists', marks >= 3, String(marks));
const pos = await ev("(() => { const g = document.querySelector('#editorHost .cm-gutters').getBoundingClientRect(), c = document.querySelector('#editorHost .cm-content').getBoundingClientRect(); return JSON.stringify({ gRight: Math.round(g.right), cLeft: Math.round(c.left) }); })()");
const p = JSON.parse(pos);
ok('the marks sit right beside the text column', Math.abs(p.gRight - p.cLeft) <= 4, pos);

const lines = () => ev("document.querySelectorAll('#editorHost .cm-line').length");
const before = await lines();
// click the mark of "## One"
await ev("(() => { const v = Ed._cm().view; const l = v.state.doc.line(5); const b = v.lineBlockAt(l.from); const el = [...document.querySelectorAll('#editorHost .cm-foldGutter .cm-gutterElement')].find(e => Math.abs(e.getBoundingClientRect().top - (v.documentTop + b.top)) < 3); el.querySelector('.cm-fold-mark').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()");
await sleep(300);
ok('clicking a mark folds that section', (await lines()) < before && await ev("!!document.querySelector('#editorHost .cm-foldPlaceholder')"), `${before} → ${await lines()}`);
ok('folding does not change the file', rd('Fold.md') === TEXT);

await ev("Ed._cm().unfoldAll()"); await sleep(200);
ok('unfold all brings everything back', (await lines()) === before);
await ev("Ed._cm().foldAll()"); await sleep(200);
ok('fold all folds the sections', (await lines()) < before, String(await lines()));
await ev("Ed._cm().unfoldAll()"); await sleep(200);

// keyboard: Ctrl+Shift+[ on the "- item" line folds the list item
await ev("(() => { const v = Ed._cm().view; v.focus(); v.dispatch({ selection: { anchor: v.state.doc.line(12).from + 2 } }); })()");
// the fold key: Ctrl+Shift+[ on Windows and Linux, Cmd+Alt+[ on macOS (CDP modifiers: Alt 1, Ctrl 2, Meta 4, Shift 8)
const foldKey = process.platform === 'darwin' ? { key: '[', modifiers: 4 | 1 } : { key: '{', modifiers: 2 | 8 };
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'BracketLeft', windowsVirtualKeyCode: 219, ...foldKey });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'BracketLeft', windowsVirtualKeyCode: 219, ...foldKey });
await sleep(300);
ok('the fold key folds where the cursor is', (await lines()) < before, `${before} → ${await lines()}`);
await ev("Ed._cm().unfoldAll()"); await sleep(200);

await ev("Prefs.set('folding', false)"); await sleep(300);
ok('Settings can turn folding off', await ev("document.querySelectorAll('#editorHost .cm-foldGutter').length === 0"));
await ev("Prefs.set('folding', true)"); await sleep(300);
ok('and on again', await ev("document.querySelectorAll('#editorHost .cm-foldGutter').length === 1"));
await ev("Ed.toggleTo('read')");
