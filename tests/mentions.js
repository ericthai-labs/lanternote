// Unlinked mentions (1.23). Folder: the basic one from run-all.js; the notes
// below are added at the start.
const fs = require('fs'), path = require('path');
const dir = process.env.TV, rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const wr = (f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
const waitFile = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return; await sleep(200); } };
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);

await until("typeof V !== 'undefined' && V.notes.length >= 3", 30000);
wr('Pump motor.md', '---\naliases: [PM unit]\n---\n# Pump motor\n\nThe motor of the pump.\n');
wr('Log.md', '# Log\n\nThe pump motor failed.\nAgain: Pump Motor, and `pump motor` in code.\n');
wr('Linked.md', '# Linked\n\nSee [[Pump motor]] — the pump motor.\n');
wr('Plural.md', '# Plural\n\nTwo pump motors.\n');
wr('Deep/Alias.md', '# Alias\n\nCheck the PM unit first.\n');
await until("['Pump motor.md', 'Log.md', 'Linked.md', 'Plural.md', 'Deep/Alias.md'].every(p => V.idx.has(p))", 15000);
await sleep(1500); // the search index takes the new notes in
await ev("openNote('Pump motor.md')"); await until("current === 'Pump motor.md'", 5000);
ok('the section is closed by default (no lookup)', await ev("!g('mentionsBox').open && g('mentions').innerHTML === ''"));
await ev("g('mentionsBox').open = true");
await until("!!g('mentions').querySelector('.um, .muted') && !/Looking/.test(g('mentions').textContent)", 10000);
const rows = await ev("[...g('mentions').querySelectorAll('.um')].map(e => e.dataset.path).sort().join(', ')");
ok('lists the notes naming it without a link (name and alias)', rows === 'Deep/Alias.md, Log.md', rows);
ok('a note that already links is left out, and so are plurals', !/Linked|Plural/.test(rows));
ok('the count of mentions in a note is shown', await ev("g('mentions').querySelector('.um[data-path=\"Log.md\"] .count')?.textContent === '2'"));
ok('the count of notes is shown', await ev("g('umCount').textContent === '2'"));

// Link the first one in Log
await ev("g('mentions').querySelector('.um[data-path=\"Log.md\"] .um-link').click()");
await waitFile(() => /\[\[Pump motor\|pump motor\]\]/.test(rd('Log.md')), 5000);
ok('Link turns the first mention into a link, keeping the text', rd('Log.md').includes('The [[Pump motor|pump motor]] failed.'), JSON.stringify(rd('Log.md')));
ok('only the first mention is changed, code untouched', rd('Log.md').includes('Again: Pump Motor, and `pump motor` in code.'));
ok('the row goes away', await ev("!g('mentions').querySelector('.um[data-path=\"Log.md\"]')"));

// the alias in a sub-folder note
await ev("g('mentions').querySelector('.um[data-path=\"Deep/Alias.md\"] .um-link').click()");
await waitFile(() => /\[\[Pump motor\|PM unit\]\]/.test(rd('Deep/Alias.md')), 5000);
ok('an alias is linked as [[Name|alias]]', rd('Deep/Alias.md').includes('Check the [[Pump motor|PM unit]] first.'), JSON.stringify(rd('Deep/Alias.md')));

// a stale row: the note changed after the list was made
wr('Log2.md', '# Log2\n\nThe pump motor again.\n');
await until("V.idx.has('Log2.md')", 10000); await sleep(1500);
await ev("openNote('A.md')"); await until("current === 'A.md'", 5000);
await ev("openNote('Pump motor.md')"); await until("current === 'Pump motor.md'", 5000);
await until("!!g('mentions').querySelector('.um[data-path=\"Log2.md\"]')", 10000).catch(() => {});
wr('Log2.md', '# Log2\n\nSomething else first. The pump motor again.\n');
await sleep(300);
await ev("g('mentions').querySelector('.um[data-path=\"Log2.md\"] .um-link').click()");
await sleep(1200);
ok('a mention that moved is not written blindly', rd('Log2.md') === '# Log2\n\nSomething else first. The pump motor again.\n', JSON.stringify(rd('Log2.md')));
await ev("g('mentionsBox').open = false");
