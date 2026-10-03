// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// A Markdown file opened from Explorer (double-click, "Open with"): a file
// inside the open or a known vault is shown in that vault — its saved index is
// used, nothing is indexed from scratch; a loose file opens its own folder but
// does not become the folder reopened at the next start.
// Needs LANTERNOTE_TEST=1 and the folder from tests/README.md (as editing.js).
const fs = require('fs'), path = require('path'), os = require('os');
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const TV = process.env.TV;
const name = path.basename(TV);
await until("typeof V !== 'undefined' && V.notes.length >= 3", 30000);
const openFile = (f) => ev(`window.api.testOpenFile(${JSON.stringify(f)})`);

// 1. a note in a subfolder of the open vault: same vault, that note
await openFile(path.join(TV, 'sub', 'B.md'));
await until("current === 'sub/B.md'", 10000).catch(() => {});
ok('a note of the open vault is shown in that vault', (await ev('current')) === 'sub/B.md' && (await ev('V.name')) === name, `${await ev('current')} in ${await ev('V.name')}`);

// 2. a note created a moment ago (the watcher may not have seen it yet)
fs.writeFileSync(path.join(TV, 'sub', 'C.md'), '# C\n\nBrand new.\n');
await openFile(path.join(TV, 'sub', 'C.md'));
await until("current === 'sub/C.md'", 10000).catch(() => {});
ok('a brand-new note opens too', (await ev('current')) === 'sub/C.md', String(await ev('current')));

// 3. a loose file elsewhere: its folder opens, the last vault stays
const loose = fs.mkdtempSync(path.join(os.tmpdir(), 'lanternote-loose-'));
fs.writeFileSync(path.join(loose, 'Loose.md'), '# Loose\n');
await openFile(path.join(loose, 'Loose.md'));
await until("current === 'Loose.md'", 15000).catch(() => {});
const last = await ev("window.api.getSetting('lastVault')");
ok('a loose file opens its own folder', (await ev('current')) === 'Loose.md' && (await ev('V.name')) === path.basename(loose), String(await ev('V.name')));
ok('…without replacing the folder opened at start', last && path.resolve(last) === path.resolve(TV), String(last));

// 4. a note of the known vault again: back to that vault, from its saved index
await openFile(path.join(TV, 'A.md'));
await until(`current === 'A.md' && V.name === ${JSON.stringify(name)}`, 15000).catch(() => {});
ok('a note of the last vault reopens that vault', (await ev('current')) === 'A.md' && (await ev('V.name')) === name, `${await ev('current')} in ${await ev('V.name')}`);

// 5. Settings → Advanced shows the Markdown app row on Windows (no button when run from source)
if (process.platform === 'win32') {
  await ev("Prefs.open('Advanced')");
  await sleep(300);
  const row = await ev("g('setBody').textContent");
  ok('Settings → Advanced offers the Markdown app', /Open Markdown files with Lanternote/.test(row));
  await ev("g('settings').hidden = true");
}
fs.rmSync(loose, { recursive: true, force: true });
