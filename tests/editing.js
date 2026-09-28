const fs = require('fs'), path = require('path');
// the editor's undo key: Cmd on macOS, Ctrl elsewhere (CDP modifiers: 4 = Meta, 2 = Ctrl)
const MOD = process.platform === 'darwin' ? 4 : 2;
const dir = process.env.TV, rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
await until("typeof V !== 'undefined' && V.notes.length === 3 && current === 'Home.md'", 30000);
// 1. edit + autosave
await ev("Ed.toggleTo('edit')");
await until("Ed.active() && !!Ed._cm()", 5000);
await ev("(() => { const v = Ed._cm().view; v.dispatch({ selection: { anchor: v.state.doc.length } }); v.focus(); })()");
await send('Input.insertText', { text: '\nTyped line. ' });
await sleep(1800);
ok('autosave writes the file', rd('Home.md').includes('Typed line.'), await ev("g('editState').textContent"));
// 2. [[ completion
await send('Input.insertText', { text: '[[Ho' });
await sleep(600);
const opts = await ev("[...document.querySelectorAll('.cm-tooltip-autocomplete li')].map(l => l.textContent).join(' | ')");
ok('[[ completion lists notes', /Home/.test(opts), opts);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await sleep(1500);
ok('completion inserts [[Home]]', rd('Home.md').includes('[[Home]]'), JSON.stringify(rd('Home.md').split('\n').slice(-1)[0]));
// 3. external change while not dirty → editor reloads
fs.writeFileSync(path.join(dir, 'Home.md'), rd('Home.md') + '\nAdded outside.\n');
await sleep(2500);
ok('external change reloads the editor', (await ev("Ed._cm().getValue()")).includes('Added outside.'));
// 4. conflict: type, and the file changes before the save
await ev("Ed._cm().view.dispatch({ changes: { from: 0, insert: 'MINE ' } })");
fs.writeFileSync(path.join(dir, 'Home.md'), 'THEIRS\n' + rd('Home.md'));
await sleep(2500);
ok('conflict banner shown, nothing overwritten', !(await ev("g('conflict').hidden")) && rd('Home.md').startsWith('THEIRS'), await ev("g('editState').textContent"));
await ev("g('keepMine').click()"); await sleep(1200);
ok('keep my version saves mine', rd('Home.md').startsWith('MINE ') && !rd('Home.md').includes('THEIRS'));
// 5. rename A → Alpha via the title; links in Home and sub/B follow
await ev("openNote('A.md')"); await until("Ed.path === 'A.md'", 5000);
await ev("(() => { g('editTitle').focus(); g('editTitle').value = 'Alpha'; g('editTitle').blur(); g('editTitle').dispatchEvent(new Event('blur')); })()");
await until("V.notes.includes('Alpha.md')", 10000);
await sleep(800);
ok('rename moved the file', fs.existsSync(path.join(dir, 'Alpha.md')) && !fs.existsSync(path.join(dir, 'A.md')));
ok('wikilink updated in Home', rd('Home.md').includes('[[Alpha]]'), rd('Home.md').split('\n')[1]);
ok('alias + embed updated in sub/B', rd('sub/B.md').includes('[[Alpha|alias]]') && rd('sub/B.md').includes('![[Alpha#A]]'), rd('sub/B.md').split('\n')[1]);
// 6. click an unresolved link → note created
await ev("Ed.toggleTo('read')"); await ev("openNote('Home.md')"); await sleep(500);
await ev("document.querySelector('#note a.unresolved').click()");
await until("current === 'Missing.md'", 10000);
ok('unresolved link creates the note', fs.existsSync(path.join(dir, 'Missing.md')));
// 7. task checkbox in reading view
await ev("Ed.toggleTo('read')"); await ev("openNote('Home.md')"); await sleep(500);
await ev("document.querySelector('#note input[data-task=\"1\"]').click()"); await sleep(1200);
ok('checkbox toggles the second task', /- \[ \] first task/.test(rd('Home.md')) && /- \[x\] second task/.test(rd('Home.md')));
// 8. new note, palette
await ev("Ed.newNote('')"); await until("current && current.startsWith('Untitled')", 10000);
ok('new note created', fs.existsSync(path.join(dir, 'Untitled.md')), await ev('current'));
await ev("Ed.palette()"); await sleep(200);
ok('palette lists commands', (await ev("g('palList').children.length")) > 10);
await ev("g('palette').hidden = true");
await shot('e1-editor');
// 9. delete to recycle bin
await ev("(() => { setTimeout(() => g('dlgOk').click(), 400); })()");
await ev("(async () => { Ed.palette(); g('palInput').value = 'delete current'; g('palInput').oninput(); g('palInput').onkeydown({ key: 'Enter', preventDefault(){} }); })()");
await sleep(1500);
ok('delete moves the note to the recycle bin', !fs.existsSync(path.join(dir, 'Untitled.md')));
// 10. undo stays inside one note
await ev("openNote('Home.md')"); await ev("Ed.toggleTo('edit')"); await until("Ed.path === 'Home.md'", 5000);
await ev("(() => { const v = Ed._cm().view; v.dispatch({ changes: { from: v.state.doc.length, insert: ' H-EDIT' } }); })()");
await sleep(1500);
await ev("openNote('Alpha.md')"); await until("Ed.path === 'Alpha.md'", 5000);
const before = rd('Alpha.md');
await ev("(() => { Ed._cm().focus(); })()");
for (let i = 0; i < 5; i++) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: MOD }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: MOD }); }
await sleep(1500);
ok('Ctrl+Z in another note does not bring Home text in', rd('Alpha.md') === before && !(await ev("Ed._cm().getValue()")).includes('Home'));
await ev("openNote('Home.md')"); await until("Ed.path === 'Home.md'", 5000);
await ev("Ed._cm().focus()");
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: MOD }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: MOD });
await sleep(1500);
ok('coming back, Ctrl+Z undoes the last edit of that note', !rd('Home.md').includes('H-EDIT'));
// 11. earlier versions were kept
const vers = await ev("window.api.versions('Home.md').then(l => l.length)");
ok('recovery copies kept', vers >= 1, vers + ' version(s)');
// 12. unsaved text is written when the window closes
await ev("(() => { const v = Ed._cm().view; v.dispatch({ changes: { from: v.state.doc.length, insert: String.fromCharCode(10) + 'LAST WORDS' } }); })()");
await ev("window.api.closeWindow()").catch(() => {});
await sleep(2500);
ok('closing the window saves pending edits', rd('Home.md').includes('LAST WORDS'));
