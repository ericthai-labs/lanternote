// Table view files (`.base`) in the window (1.24). Folder: the basic one from run-all.js; files are added.
const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };

await until("typeof V !== 'undefined' && V.notes.length >= 3", 30000);
const BASE = `filters: 'file.ext == "md" && !file.inFolder("Archive")'
formulas:
  words: file.name.length
properties:
  file.name: {displayName: Note}
  formula.words: {displayName: "Name length"}
views:
  - type: table
    name: All
    order: [file.name, formula.words]
    sort: [{property: file.name, direction: ASC}]
    summaries: {formula.words: Sum}
  - type: table
    name: Linked
    filters: file.hasLink(this)
    order: [file.name]
`;
w('Views/Notes.base', BASE);
w('Views/Broken.base', 'views:\n  - name: A\n   order: [x\n');
w('Hub.md', '# Hub\n\nLinks to [[A]].\n\n![[Notes.base]]\n\n## Second\n\n![[Notes.base#Linked]]\n\n```base\nfilters: file.inFolder("sub")\nviews:\n  - name: Sub\n```\n\n![[Broken.base]]\n');
w('Back.md', '# Back\n\nTo [[Hub]].\n');
await until("V.idx.has('Views/Notes.base') && V.idx.has('Hub.md') && V.idx.has('Back.md')", 10000);
await ev("Ed.toggleTo('read')");
await ev("openNote('Hub.md')"); await until("current === 'Hub.md'", 5000);
await until("document.querySelectorAll('#note .base-embed table').length >= 3", 10000);

const boxes = "[...document.querySelectorAll('#note .base-embed')]";
const rowsOf = (i) => ev(`${boxes}[${i}].querySelectorAll('tbody tr').length`);
const namesOf = (i) => ev(`[...${boxes}[${i}].querySelectorAll('tbody tr td:first-child')].map(td => td.textContent.trim()).join(',')`);
ok('an embed shows the first view as a table', (await namesOf(0)) === 'A,B,Back,Home,Hub', await namesOf(0));
ok('column names come from displayName', await ev(`[...${boxes}[0].querySelectorAll('th')].map(t => t.textContent).join('|') === 'Note|Name length'`));
ok('the summary row adds up a column', await ev(`${boxes}[0].querySelector('tfoot').textContent.replace(/\\s+/g,' ').trim() === 'Sum 28'`), await ev(`${boxes}[0].querySelector('tfoot')?.textContent`));
ok('views show as tabs, the first one on', await ev(`[...${boxes}[0].querySelectorAll('.base-tab')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(',') === 'All*,Linked'`));
ok('the embed title links to the view file', await ev(`${boxes}[0].querySelector('.base-title').dataset.path === 'Views/Notes.base'`));
ok('#View picks the view; this = the note it is embedded in', (await namesOf(1)) === 'Back', await namesOf(1));
ok('a ```base block runs too', (await namesOf(2)) === 'B', await namesOf(2));
ok('a broken view file shows a readable error', await ev(`/not valid YAML/.test(${boxes}[3].querySelector('.dv-error')?.textContent || '')`));
await shot('bases-embed');

// switching views on the tabs
await ev(`${boxes}[0].querySelectorAll('.base-tab')[1].click()`);
await until(`${boxes}[0].querySelector('.base-tab.on')?.textContent === 'Linked'`, 5000);
ok('a tab switches the view in place', (await namesOf(0)) === 'Back', await namesOf(0));

// a link in a cell opens the note
await ev(`${boxes}[0].querySelector('tbody a.internal').click()`);
await until("current === 'Back.md'", 5000);
ok('clicking a row link opens the note', await ev("current === 'Back.md'"));

// the view file on its own: listed in the file tree and the switcher, opens as a page
ok('the view file is in the file list', await ev("listed().includes('Views/Notes.base') && label('Views/Notes.base') === 'Notes'"));
await ev("openNote('Views/Notes.base')"); await until("current === 'Views/Notes.base'", 5000);
await until("document.querySelector('#note .base-page table')", 5000);
ok('opened on its own: title and table', await ev("document.querySelector('#note .inline-title').textContent === 'Notes' && document.querySelectorAll('#note .base-page tbody tr').length === 5"));
ok('the window title names it', await ev("document.title.startsWith('Notes')"));

// edit the YAML on disk: the open table follows
w('Views/Notes.base', BASE.replace('!file.inFolder("Archive")', '!file.inFolder("Archive") && file.name != "Home.md"'));
await until("document.querySelectorAll('#note .base-page tbody tr').length === 4", 10000);
ok('changing the view file refreshes the table', await ev("document.querySelectorAll('#note .base-page tbody tr').length === 4"));

// Ctrl+E: its YAML in the editor, then back
await ev("Ed.toggleTo('edit')"); await until("Ed.active()", 5000);
ok('edit mode shows the YAML', await ev("Ed.active() && document.querySelector('#editPane .cm-content').textContent.includes('views:')"));
await ev("Ed.toggleTo('read')"); await until("!Ed.active() && document.querySelector('#note .base-page table')", 5000);
ok('reading mode shows the table again', await ev("!!document.querySelector('#note .base-page table')"));

// an embedded view refreshes when another note changes
await ev("openNote('Hub.md')"); await until("current === 'Hub.md'", 5000);
await until(`${boxes}.length >= 1 && ${boxes}[0].querySelectorAll('tbody tr').length === 4`, 8000);
w('New one.md', '# New one\n');
await until(`[...${boxes}[0].querySelectorAll('tbody tr td:first-child')].some(td => td.textContent.trim() === 'New one')`, 10000);
ok('a new note appears in the embedded table', true);
