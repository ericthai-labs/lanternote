// Document status in the window (1.25): banner, labels, file list, quick open, search, the setting.
// Folder: the basic one from run-all.js; notes are added.
const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };

await until("typeof V !== 'undefined' && V.notes.length >= 3", 30000);
w('SOP/SOP-002 Rev 9.md', '---\nstatus: superseded\nsuperseded_by: "[[SOP-002 Rev 10]]"\nrevision: Rev 9\n---\n# SOP-002\n\nTorque wrench calibration.\n');
w('SOP/SOP-002 Rev 10.md', '---\nstatus: current\nrevision: Rev 10\n---\n# SOP-002\n\nTorque wrench calibration, updated.\n');
w('SOP/SOP-004.md', '---\nstatus: draft\nreview_due: 2020-01-01\n---\n# SOP-004\n\nTorque wrench storage.\n');
await until("V.idx.has('SOP/SOP-002 Rev 9.md') && V.idx.has('SOP/SOP-004.md') && V.status[V.idx.get('SOP/SOP-002 Rev 9.md')] === 2", 15000);
await ev("Ed.toggleTo('read')");

await ev("openNote('SOP/SOP-002 Rev 9.md')"); await until("current === 'SOP/SOP-002 Rev 9.md'", 5000);
ok('a superseded note shows a warning at the top', await ev("!!document.querySelector('#note .ds-banner.old') && document.querySelector('#note .ds-banner.old').textContent.includes('Superseded')"));
ok('the warning links to the replacement', await ev("document.querySelector('#note .ds-banner.old a.internal')?.dataset.path === 'SOP/SOP-002 Rev 10.md'"));
ok('the top line shows its labels', await ev("[...document.querySelectorAll('#note .crumbs .ds')].map(e => e.textContent).join('|') === '⚠ superseded|Rev 9'"), await ev("[...document.querySelectorAll('#note .crumbs .ds')].map(e => e.textContent).join('|')"));
await ev("document.querySelector('#note .ds-banner.old a.internal').click()"); await until("current === 'SOP/SOP-002 Rev 10.md'", 5000);
ok('the current revision: green revision label, no warning', await ev("document.querySelector('#note .crumbs .ds-rev.cur')?.textContent === '✓ Rev 10' && !document.querySelector('#note .ds-banner')"));
await ev("openNote('SOP/SOP-004.md')"); await until("current === 'SOP/SOP-004.md'", 5000);
ok('a passed review date: banner and labels', await ev("!!document.querySelector('#note .ds-banner.due') && [...document.querySelectorAll('#note .crumbs .ds')].map(e => e.textContent).join('|') === '✎ draft|⏰ review due'"));
await shot('doc-status-note');

// file list: dimmed
await ev("openDirs.add('SOP'); renderTree()"); await sleep(300);
ok('the file list dims a superseded note', await ev("document.querySelector('.tree .row[data-path=\"SOP/SOP-002 Rev 9.md\"]')?.classList.contains('st-old') && !document.querySelector('.tree .row[data-path=\"SOP/SOP-002 Rev 10.md\"]').classList.contains('st-old')"));

// quick open: superseded last, with labels
await ev("openSwitcher()"); await ev("g('swInput').value = 'sop-002'; swFilter()"); await sleep(200);
const sw = await ev("[...document.querySelectorAll('#swList .switem')].map(e => e.querySelector('div').textContent).join(' || ')");
ok('quick open lists the superseded revision last', sw.split(' || ').length === 2 && sw.split(' || ')[1].includes('Rev 9') && sw.includes('⚠ superseded') && sw.includes('✓ Rev 10'), sw);
await ev("closeSwitcher()");

// search panel
await ev("setTab('search'); g('searchInput').value = 'torque wrench'; runSearch()");
await until("document.querySelectorAll('#searchResults .result').length >= 3", 15000);
const res = await ev("[...document.querySelectorAll('#searchResults .result')].map(e => e.querySelector('.t').textContent).join(' || ')");
ok('search results carry labels; the superseded one is last', res.split(' || ').pop().includes('Rev 9') && res.includes('⚠ superseded') && res.includes('✎ draft'), res);
await shot('doc-status-search');

// the setting turns it all off
await ev("Prefs.set('docStatus', false)"); await sleep(300);
await ev("openNote('SOP/SOP-002 Rev 9.md')"); await until("current === 'SOP/SOP-002 Rev 9.md'", 5000); await sleep(200);
ok('setting off: no warning, no labels', await ev("!document.querySelector('#note .ds-banner') && !document.querySelector('#note .crumbs .ds')"));
await ev("Prefs.set('docStatus', true)"); await sleep(300);
