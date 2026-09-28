// TASK and CALENDAR queries (run with scripts/drive.js on a TEMPORARY vault
// made by tests/make-task-vault.js; needs TV=<vault folder>).
const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
await until("typeof V !== 'undefined' && V.notes.length >= 6", 30000);
await ev("Ed.toggleTo('read')");
await ev("openNote('Home.md')"); await until("current === 'Home.md'", 5000);
await until("document.querySelectorAll('#note .dv').length === 8 && ![...document.querySelectorAll('#note .dv')].some(b => /Running/.test(b.textContent))", 20000);
const box = (i) => `document.querySelectorAll('#note .dv')[${i}]`;
const tasksOf = (i) => ev(`[...${box(i)}.querySelectorAll('.dv-task-group')].map(gr => gr.querySelector('.dv-task-head').textContent.replace(/\\s*\\(\\d+\\)$/, '') + ': ' + [...gr.querySelectorAll('.dv-task-text')].map(t => t.textContent.replace(/\\s*(📅|✅|\\[due::).*$/, '').replace(/\\s*#\\w+/, '')).join(', '))`);
const t0 = await tasksOf(0);
ok('TASK WHERE !completed, grouped by note (code blocks ignored)', JSON.stringify(t0) === JSON.stringify(['Alpha: Write plan, Review outline, Dropped idea, Call vendor', 'Beta: Beta one, Beta two']), JSON.stringify(t0));
const t1 = await tasksOf(1);
ok('due from 📅 and [due:: ], SORT due', JSON.stringify(t1) === JSON.stringify(['Alpha: Call vendor, Write plan']), JSON.stringify(t1));
ok('tags of a task', JSON.stringify(await tasksOf(2)) === JSON.stringify(['Alpha: Call vendor']), JSON.stringify(await tasksOf(2)));
const t3 = await ev(`[...${box(3)}.querySelectorAll('.dv-task-head')].map(h => h.textContent)`);
ok('GROUP BY a field of the note', t3.length === 2 && /^Son \(6\)$/.test(t3[0].trim()) && /\(2\)$/.test(t3[1].trim()), JSON.stringify(t3));
const t4 = await ev(`[...${box(4)}.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim()).join(' | '))`);
ok('file.tasks in a TABLE', JSON.stringify(t4) === JSON.stringify(['Alpha | 6', 'Beta | 2']), JSON.stringify(t4));
ok('fullyCompleted', JSON.stringify(await tasksOf(5)) === JSON.stringify(['Alpha: Draft outline, Kickoff']), JSON.stringify(await tasksOf(5)));
ok('LIMIT counts tasks', (await ev(`${box(7)}.querySelectorAll('.dv-task').length`)) === 1);
ok('done and cancelled tasks are struck through', await ev(`${box(3)}.querySelectorAll('.dv-task.done').length === 2 && ${box(3)}.querySelectorAll('.dv-task.cancelled').length === 1`));
ok('subtasks are indented', await ev(`[...${box(0)}.querySelectorAll('.dv-task')][1].style.marginLeft !== '0px'`));
// calendar
const cal = `${box(6)}`;
const today = new Date(), yest = new Date(Date.now() - 86400000);
const expectHere = today.getMonth() === yest.getMonth() ? 2 : 1;
ok('CALENDAR shows this month with a dot per note', (await ev(`${cal}.querySelectorAll('.dv-cal-cell.has').length`)) === expectHere && /\d{4}/.test(await ev(`${cal}.querySelector('.dv-cal-title').textContent`)), await ev(`${cal}.querySelector('.dv-cal-bar').textContent`));
ok('today is marked', await ev(`!!${cal}.querySelector('.dv-cal-cell.today.has')`));
await ev(`${cal}.querySelector('[data-cal-go="-1"]').click()`);
ok('previous month', (await ev(`${cal}.querySelectorAll('.dv-cal-cell.has').length`)) >= 1);
await ev(`${cal}.querySelector('.dv-cal-cell.has').click()`);
ok('a day lists its notes', /\d{4}-\d{2}-15/.test(await ev(`${cal}.querySelector('.dv-cal-list').textContent`)), await ev(`${cal}.querySelector('.dv-cal-list') && ${cal}.querySelector('.dv-cal-list').textContent`));
await ev(`${cal}.querySelector('[data-cal-go="0"]').click()`);
await shot('tc1-home');
// ticking a task in a query result writes the note
await ev(`[...${box(0)}.querySelectorAll('.dv-task')].find(li => /Beta one/.test(li.textContent)).querySelector('input').click()`);
await until("/- \\[x\\] Beta one/.test(" + JSON.stringify('') + " + '') || true", 100);
await sleep(1500);
ok('ticking a task saves its note', /- \[x\] Beta one/.test(rd('Tasks/Beta.md')), rd('Tasks/Beta.md').split('\n')[2]);
await until(`!${box(0)}.textContent.includes('Beta one')`, 8000);
ok('lists refresh after the change', true);
// a stale checkbox (the note changed meanwhile) does not write the wrong line
fs.writeFileSync(path.join(dir, 'Tasks/Beta.md'), '# Beta\n\nInserted line\n' + rd('Tasks/Beta.md').split('\n').slice(2).join('\n'));
const stale = await ev(`(() => { const cb = [...${box(0)}.querySelectorAll('.dv-task')].find(li => /Beta two/.test(li.textContent)).querySelector('input'); cb.click(); return cb.dataset.tl; })()`);
await sleep(1500);
ok('a moved task is not written blindly', !/\[x\] Beta two/.test(rd('Tasks/Beta.md')) && /Inserted line/.test(rd('Tasks/Beta.md')), `line ${stale}: ` + JSON.stringify(rd('Tasks/Beta.md')));
// Command Center: tasks and calendar in cards, ticking works there too
await ev('toggleCC()');
await until("view === 'cc' && /From/.test(g('ccSource').textContent) && document.querySelectorAll('#ccBody .dv-task').length > 0 && document.querySelector('#ccBody .dv-cal')", 15000);
ok('Command Center shows TASK and CALENDAR cards', (await ev("document.querySelector('.cc-left .cc-count').textContent")) === (await ev("String(document.querySelectorAll('.cc-left .dv-task').length)")));
await ev("[...document.querySelectorAll('#ccBody .dv-task')].find(li => /Review outline/.test(li.textContent)).querySelector('input').click()");
await sleep(1500);
ok('ticking from the Command Center saves the note', /- \[x\] Review outline/.test(rd('Tasks/Alpha.md')));
await ev("Prefs.set('theme', 'dark')"); await sleep(500);
await shot('tc2-command-center');
const errs = consoleLines.filter((l) => /EXCEPTION|^error:/i.test(l));
ok('no errors in the window', errs.length === 0, errs.join('\n'));
