// Dataview + templates test (run with scripts/drive.js on a TEMPORARY vault
// made by tests/make-dv-vault.js; needs TV=<vault folder>).
const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
await until("typeof V !== 'undefined' && V.notes.length >= 8", 30000);
await ev("Ed.toggleTo('read')");
await ev("openNote('Dashboard.md')"); await until("current === 'Dashboard.md'", 5000);
await until("document.querySelectorAll('#note .dv').length === 7 && ![...document.querySelectorAll('#note .dv')].some(b => /Running/.test(b.textContent))", 15000);
const box = (i) => `document.querySelectorAll('#note .dv')[${i}]`;
const rows = async (i) => ev(`[...${box(i)}.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim()).join(' | '))`);
const r0 = await rows(0);
ok('TABLE with FROM / WHERE / SORT', r0.length === 2 && /^Alpha \| dang-lam \| Cao/.test(r0[0]) && /^Beta/.test(r0[1]), JSON.stringify(r0));
ok('header shows File and the count', /File \(2\)/.test(await ev(`${box(0)}.querySelector('th').textContent`)));
const r1 = await rows(1);
ok('WITHOUT ID, choice(), link field', r1.length === 3 && /Alpha \|  \| Plan/.test(r1[0]) && /Beta \| ❌ doc_truoc \| -/.test(r1[1]), JSON.stringify(r1));
ok('a [[link]] in a field is clickable', await ev(`!!${box(1)}.querySelector('a.internal[data-path="Plan.md"]')`));
const r2 = await rows(2);
ok('GROUP BY + length(rows)', /^du-an \| 4$/.test(r2[0]) && /^bao-cao \| 1$/.test(r2[1]) && /Group/.test(await ev(`${box(2)}.querySelector('th').textContent`)), JSON.stringify(r2));
const r3 = await rows(3);
ok('date(today) + dur(7 days), date maths', r3.length === 1 && /^Alpha \| .+ \| 3$/.test(r3[0]), JSON.stringify(r3));
const l4 = await ev(`[...${box(4)}.querySelectorAll('li')].map(li => li.textContent)`);
ok('LIST with an inline field', JSON.stringify(l4) === JSON.stringify(['Alpha: Son', 'Beta: Thao']), JSON.stringify(l4));
const l5 = await ev(`[...${box(5)}.querySelectorAll('li')].map(li => li.textContent)`);
ok('LIST with this.file.name and !field', !l5.includes('Dashboard') && l5.includes('Plan'), JSON.stringify(l5));
ok('a wrong query shows an error, not a crash', /Dataview:/.test(await ev(`${box(6)}.textContent`)), await ev(`${box(6)}.textContent`));
await shot('dv1-dashboard');
// live refresh when another note changes
fs.writeFileSync(path.join(dir, '03-Du-An', 'Beta.md'), fs.readFileSync(path.join(dir, '03-Du-An', 'Beta.md'), 'utf8').replace('trang_thai: dang-lam', 'trang_thai: xong'));
await sleep(2500);
const r0b = await rows(0);
ok('tables update when a note changes', r0b.length === 1 && /^Alpha/.test(r0b[0]), JSON.stringify(r0b));
// date format setting
await ev("Prefs.set('dvDateFormat', 'dd/MM/yyyy')"); await sleep(900);
ok('date format setting', /\d\d\/\d\d\/\d{4}/.test((await rows(3))[0] || ''), (await rows(3))[0]);
// templates: Alt+E inserts at the cursor of the edited note
await ev("openNote('Plan.md')"); await until("current === 'Plan.md'", 5000);
ok('templates folder found by itself', (await ev('Templates.folder()')) === '99-Templates');
const ins = ev('Templates.insert()');
await until("!g('switcher').hidden", 5000);
ok('picker lists only templates', /Tpl-Meeting/.test(await ev("g('swList').textContent")) && !/Dashboard/.test(await ev("g('swList').textContent")));
await ev("chooseSw(swItems[0])");
await ins; await sleep(1500);
const plan = fs.readFileSync(path.join(dir, 'Plan.md'), 'utf8');
const dd = new Date(), today = `${String(dd.getDate()).padStart(2, '0')}/${String(dd.getMonth() + 1).padStart(2, '0')}/${dd.getFullYear()}`;
ok('template filled in, added after the text (was reading), saved', plan.startsWith('# Plan\n\n# Plan\nDate: ' + today) && plan.includes('Core: ' + dd.getFullYear()), JSON.stringify(plan));
ok('unknown Templater commands kept as written', plan.includes('<% tp.system.prompt("x") %>'));
await shot('dv2-template');
