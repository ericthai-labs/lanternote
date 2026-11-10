// Edits reach the window as deltas (1.25.1): backlinks, tags, status and the link count follow
// without the index being rebuilt; a new file still brings a whole snapshot.
// Folder: the basic one from run-all.js; notes are changed on disk.
const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };

await until("typeof V !== 'undefined' && V.notes.length >= 3", 30000);
await ev("Ed.toggleTo('read')");
await ev("openNote('Home.md')"); await until("current === 'Home.md'", 5000);
// record what each change brings, and whether the big tables were built again
await ev("(() => { const o = applyChange, b = buildIndex; window.__kinds = []; window.__built = 0; buildIndex = function (d) { window.__built++; return b(d); }; applyChange = function (r) { window.__kinds.push(r.snapshot ? 'snapshot' : r.delta ? 'delta' : 'none'); return o(r); }; })()");
const links = () => ev("V.edges.length / 2");
const last = () => ev("window.__kinds[window.__kinds.length - 1]");
const waitChange = async (n) => until(`window.__kinds.length > ${n}`, 15000);

const l0 = await links();
let n = await ev('window.__kinds.length');
w('A.md', '# A\n\nText of A. Back to [[Home]].\n');
await waitChange(n);
await until("backLinks('Home.md').includes('A.md')", 5000);
ok('an edited note arrives as a delta', (await last()) === 'delta' && (await ev('window.__built')) === 0, await ev("JSON.stringify(window.__kinds)"));
ok('the link count follows', (await links()) === l0 + 1 && (await ev("g('status').textContent")).includes(`${l0 + 1} links`), await ev("g('status').textContent"));
ok('the backlinks panel shows the new link', await ev("[...document.querySelectorAll('#backlinks .bl')].some(e => e.dataset.path === 'A.md')"));
ok('the note that links has it among its outgoing links', await ev("outLinks('A.md').includes('Home.md')"));

n = await ev('window.__kinds.length');
w('sub/B.md', '# B\n\nLink [[A|alias]]\n\n![[A#A]]\n\n#delta/tag\n');
await waitChange(n);
await until("V.tags.has('delta/tag')", 5000);
ok('a new tag appears in the tag list', (await last()) === 'delta' && await ev("[...document.querySelectorAll('#tagList .tagrow')].some(e => e.dataset.tag === 'delta/tag')"));

n = await ev('window.__kinds.length');
w('A.md', '---\nstatus: superseded\nrevision: Rev 2\n---\n# A\n\nText of A. Back to [[Home]].\n');
await waitChange(n);
await until("(V.status[V.idx.get('A.md')] & 3) === 2", 5000);
ok('document status follows: the file list dims the note', (await last()) === 'delta' && await ev("document.querySelector('.tree .row[data-path=\"A.md\"]').classList.contains('st-old')"));
ok('still no rebuild of the index', (await ev('window.__built')) === 0);

n = await ev('window.__kinds.length');
w('Home.md', '# Home\n\nOnly [[A]] now.\n');
await waitChange(n);
await until("!outLinks('Home.md').some(p => p.endsWith('B.md'))", 5000);
ok('the open note is redrawn after its own change', await ev("g('note').textContent.includes('Only')") && (await last()) === 'delta');
ok('removed links are gone', (await ev("outLinks('Home.md').join()")) === 'A.md', await ev("outLinks('Home.md').join()"));

// a new file changes the list: a whole snapshot, then deltas again
n = await ev('window.__kinds.length');
w('New note.md', '# New note\n\n[[Home]] [[A]]\n');
await waitChange(n);
await until("V.idx.has('New note.md')", 5000);
ok('a new file brings a whole snapshot', (await ev("window.__kinds.includes('snapshot')")) && (await ev('window.__built')) >= 1 && await ev("backLinks('Home.md').includes('New note.md')"));
n = await ev('window.__kinds.length');
w('New note.md', '# New note\n\n[[Home]]\n');
await waitChange(n);
await until("!backLinks('A.md').includes('New note.md')", 5000);
ok('and its next edit is a delta', (await last()) === 'delta');
