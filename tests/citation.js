// Copy selection as citation (1.25): reading and editing view, heading, doc id, revision, status.
// Folder: the basic one from run-all.js; notes are added.
const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };

await until("typeof V !== 'undefined' && V.notes.length >= 3", 30000);
w('Docs/Torque SOP.md', '---\ndoc_id: SOP-007\nrevision: Iss02Rev03\neffective: 2026-10-01\nstatus: current\n---\n# Torque SOP\n\n## 1. Purpose\n\nIntro text.\n\n```\n## not a heading\n```\n\n## 3. Scope\n\nApply torque per the AMM task and record it.\nSecond line here.\n');
w('Docs/Old SOP.md', '---\nstatus: superseded\nrevision: Rev 1\n---\n# Old SOP\n\nOld rule text.\n');
await until("V.idx.has('Docs/Torque SOP.md') && V.idx.has('Docs/Old SOP.md')", 10000);

// reading view: select a sentence under "3. Scope"
await ev("Ed.toggleTo('read')");
await ev("openNote('Docs/Torque SOP.md')"); await until("current === 'Docs/Torque SOP.md'", 5000);
await ev(`(() => { const p = [...document.querySelectorAll('#note p')].find(e => e.textContent.startsWith('Apply torque')); const t = p.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 'Apply torque per the AMM task'.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`);
let out = await ev('copyCitation()');
const want = '> Apply torque per the AMM task\n>\n> — [[Torque SOP#3. Scope|Torque SOP › 3. Scope]] · SOP-007 · Iss02Rev03 · effective 2026-10-01 · copied ';
ok('reading view: quote, heading link, doc id, revision, effective date', out.startsWith(want), JSON.stringify(out));
ok('the date it was copied', /copied \d{4}-\d{2}-\d{2}\n$/.test(out));
ok('the clipboard holds it', await ev("navigator.clipboard.readText().then(t => t.startsWith('> Apply torque')).catch(() => 'n/a')") !== false);

// the link in the citation resolves to the heading
w('Docs/Uses.md', '# Uses\n\n' + out);
await until("V.idx.has('Docs/Uses.md')", 10000);
await ev("openNote('Docs/Uses.md')"); await until("current === 'Docs/Uses.md'", 5000);
await ev("document.querySelector('#note blockquote a.internal').click()"); await until("current === 'Docs/Torque SOP.md'", 5000); await sleep(300);
ok('the citation link opens the note at that heading', await ev("(() => { const h = [...document.querySelectorAll('#note h2')].find(e => e.textContent === '3. Scope'); const r = h.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()"));

// editing view: two lines; a "## …" inside a code block is not a heading
await ev("Ed.toggleTo('edit')"); await until("Ed.active()", 5000); await sleep(300);
await ev(`(() => { const ls = [...document.querySelectorAll('#editPane .cm-line')]; const a = ls.find(l => l.textContent.startsWith('Apply torque')); const b = ls.find(l => l.textContent.startsWith('Second line')); const tn = (n) => { while (n && n.nodeType !== 3) n = n.lastChild || n.firstChild; return n; }; document.querySelector('#editPane .cm-content').focus(); const r = document.createRange(); const ta = tn(a), tb = tn(b); r.setStart(ta, 0); r.setEnd(tb, tb.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`);
await sleep(200);
out = await ev('copyCitation()');
ok('editing view: two lines quoted, heading found from the text', out.startsWith('> Apply torque per the AMM task and record it.\n> Second line here.\n>\n> — [[Torque SOP#3. Scope|'), JSON.stringify(out));
await ev("Ed.toggleTo('read')");

// a superseded document says so in the citation
await ev("openNote('Docs/Old SOP.md')"); await until("current === 'Docs/Old SOP.md'", 5000);
await ev(`(() => { const p = [...document.querySelectorAll('#note p')].find(e => e.textContent.startsWith('Old rule')); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`);
out = await ev('copyCitation()');
ok('a superseded document is marked in the citation', out.includes('· Rev 1 · ⚠ SUPERSEDED · copied'), JSON.stringify(out));
// nothing selected
await ev("getSelection().removeAllRanges()");
ok('nothing selected: nothing copied', (await ev('copyCitation()')) == null);
