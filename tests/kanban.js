// Kanban boards (run with scripts/drive.js on a TEMPORARY vault made by
// tests/make-kanban-vault.js; needs TV=<vault folder>).
const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const F = path.join(dir, 'Boards', 'Sprint.md');
const rd = () => fs.readFileSync(F, 'utf8');
const orig = rd();
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const lanes = () => ev("[...document.querySelectorAll('.kb-lane')].map(l => l.querySelector('.kb-lane-title').textContent + ': ' + [...l.querySelectorAll('.kb-card .kb-text')].map(t => t.textContent.trim().split('\\n')[0]).join(' | '))");
const until2 = (cond) => until(cond, 8000);
await until("typeof V !== 'undefined' && V.notes.length >= 3", 30000);
await ev("Ed.toggleTo('read')");
await ev("openNote('Boards/Sprint.md')");
await until2("KanbanView.active() && document.querySelectorAll('.kb-lane').length === 3");
ok('a board note opens as a board', true);
ok('round trip: the board unchanged is written back identically', (await ev('KanbanView.serialise()')) === orig, JSON.stringify(await ev('KanbanView.serialise()')).slice(0, 300));
const l0 = await lanes();
ok('lanes and cards (archive and settings kept out of the board)', /^To do: Write the plan.*\| Review Spec.*\| Two-line card/.test(l0[0]) && /^Doing: Build the thing/.test(l0[1]) && /^Done: Kickoff$/.test(l0[2]), JSON.stringify(l0));
ok('two-line card shows both lines', /second line of the card/.test(await ev("document.querySelectorAll('.kb-card')[2].textContent")));
ok('dates: late and soon', await ev("!!document.querySelector('.kb-card .kb-date.late') && !!document.querySelector('.kb-card .kb-date.soon')"));
ok('[[links]] and #tags work in cards', await ev("!!document.querySelector('.kb-card a.internal[data-path=\"Spec.md\"]') && !!document.querySelector('.kb-card a.tag')"));
ok('Complete lane is marked', await ev("document.querySelectorAll('.kb-lane')[2].classList.contains('complete')"));
await shot('kb1-board');
// tick a card
await ev("document.querySelector('.kb-card .kb-check').click()");
await until2("/- \\[x\\] Write the plan/.test(" + JSON.stringify('') + " + '') || true");
await sleep(1200);
ok('ticking a card saves the note', /- \[x\] Write the plan/.test(rd()), rd().slice(0, 200));
ok('archive and settings are kept', rd().endsWith(orig.slice(orig.indexOf('***'))));
// drag a card into the Complete lane (simulated drop)
const drop = async (fromSel, toLane, toIdx) => ev(`(() => { const src = ${fromSel}; const dt = new DataTransfer(); src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); const lane = document.querySelectorAll('.kb-lane')[${toLane}]; const cards = lane.querySelectorAll('.kb-card[data-ci]'); const tgt = cards[${toIdx}] || lane.querySelector('.kb-cards'); const r = tgt.getBoundingClientRect(); const y = cards[${toIdx}] ? r.top + 2 : r.bottom - 2; tgt.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: y, dataTransfer: dt })); tgt.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: y, dataTransfer: dt })); src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); })()`);
await drop("[...document.querySelectorAll('.kb-card')].find(c => /Build the thing/.test(c.textContent))", 2, 0);
await sleep(1200);
const l1 = await lanes();
ok('drag a card to another lane', /^Doing: $/.test(l1[1]) && /^Done: Build the thing.*\| Kickoff$/.test(l1[2]), JSON.stringify(l1));
ok('a card dropped in the Complete lane is done', /## Done\n\n\*\*Complete\*\*\n- \[x\] Build the thing/.test(rd()), rd());
await drop("[...document.querySelectorAll('.kb-card')].find(c => /Two-line card/.test(c.textContent))", 0, 0);
await sleep(1200);
ok('reorder inside a lane (multi-line card moves whole)', /## To do\n\n- \[ \] Two-line card\n    second line of the card\n- \[x\] Write the plan/.test(rd()), rd().slice(0, 250));
// add a card with Enter, edit by double-click, delete
await ev("document.querySelectorAll('.kb-add')[1].click()");
await until2("!!document.querySelector('.kb-edit')");
await ev("(() => { const t = document.querySelector('.kb-edit'); t.value = 'New card [[Spec]]'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()");
await sleep(300);
await ev("(() => { const t = document.querySelector('.kb-edit'); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()");
await sleep(1200);
ok('add a card (Enter keeps adding, Esc stops)', /## Doing\n\n- \[ \] New card \[\[Spec\]\]\n/.test(rd()) && !(await ev("!!document.querySelector('.kb-edit')")), rd());
await until2("[...document.querySelectorAll('.kb-card')].some(c => /New card/.test(c.textContent))");
await ev("[...document.querySelectorAll('.kb-card')].find(c => /New card/.test(c.textContent)).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))");
await until2("!!document.querySelector('.kb-edit')");
await ev("(() => { const t = document.querySelector('.kb-edit'); t.value = 'Renamed card\\nwith a note'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()");
await sleep(1200);
ok('edit a card, a new line becomes an indented line', /- \[ \] Renamed card\n    with a note\n/.test(rd()), rd());
await until2("[...document.querySelectorAll('.kb-card')].some(c => /Renamed card/.test(c.textContent))");
await ev("[...document.querySelectorAll('.kb-card')].find(c => /Renamed card/.test(c.textContent)).querySelector('.kb-del').click()");
await sleep(1200);
ok('delete a card', !/Renamed card/.test(rd()));
// undo
await ev("g('kbUndo').click()"); await sleep(1200);
ok('undo brings it back', /Renamed card/.test(rd()));
// add a lane, rename
await ev("document.querySelector('.kb-add-lane').click()");
await until2("!!document.querySelector('.kb-title-edit')");
await ev("(() => { const t = document.querySelector('.kb-title-edit'); t.value = 'Waiting'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()");
await sleep(1200);
ok('add and name a lane (before the archive)', /## Waiting\n\n\n\n\*\*\*\n\n## Archive/.test(rd()), rd().slice(-260));
// move a lane
await until2("document.querySelectorAll('.kb-lane-head').length > 3");
await ev("(() => { const src = document.querySelectorAll('.kb-lane-head')[3]; const dt = new DataTransfer(); src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); const tgt = document.querySelectorAll('.kb-lane')[0]; const r = tgt.getBoundingClientRect(); tgt.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 20, dataTransfer: dt })); tgt.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 20, dataTransfer: dt })); })()");
await sleep(1200);
ok('drag a lane to the front', (await lanes())[0].startsWith('Waiting:'), JSON.stringify(await lanes()));
// filter
await ev("g('kbFilter').value = 'kickoff'; g('kbFilter').dispatchEvent(new Event('input'))");
ok('filter cards', (await ev("document.querySelectorAll('.kb-card').length")) === 1);
await ev("g('kbFilter').value = ''; g('kbFilter').dispatchEvent(new Event('input'))");
// external change reloads
fs.writeFileSync(F, rd().replace('- [x] Kickoff', '- [x] Kickoff (edited outside)'));
await until2("[...document.querySelectorAll('.kb-card')].some(c => /edited outside/.test(c.textContent))");
ok('changes made elsewhere reload the board', true);
// cards are tasks for queries
await ev("openNote('Home.md')"); await until2("current === 'Home.md' && !KanbanView.active() && document.querySelectorAll('#note .dv-task').length > 0");
ok('cards appear in TASK queries', /Two-line card/.test(await ev("document.querySelector('#note .dv').textContent")) && !/Kickoff/.test(await ev("document.querySelector('#note .dv').textContent")));
// Markdown view and back
await ev("openNote('Boards/Sprint.md')"); await until2("KanbanView.active()");
await ev("g('kbText').click()");
await until2("Ed.active() && Ed.path === 'Boards/Sprint.md' && !KanbanView.active()");
ok('Markdown button opens the text in the editor', true);
await ev("Ed.toggleTo('read')"); await until2("!!document.querySelector('#note [data-board]')");
await ev("document.querySelector('#note [data-board]').click()"); await until2("KanbanView.active()");
ok('Board view comes back', true);
// new board
await ev("KanbanView.create('Boards')"); await until2("KanbanView.active() && KanbanView.path === 'Boards/Board.md'");
ok('New kanban board: three lanes, file written', (await lanes()).join() === 'To do: ,Doing: ,Done: ' && /kanban-plugin: board/.test(fs.readFileSync(path.join(dir, 'Boards', 'Board.md'), 'utf8')));
await ev("Prefs.set('theme', 'dark')"); await ev("openNote('Boards/Sprint.md')"); await until2("KanbanView.path === 'Boards/Sprint.md'"); await sleep(500);
await shot('kb2-board-dark');
const errs = consoleLines.filter((l) => /EXCEPTION|^error:/i.test(l));
ok('no errors in the window', errs.length === 0, errs.join('\n'));
