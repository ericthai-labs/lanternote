// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Search syntax test: phrases, exclusions, OR, fragments inside words, path:,
// title:, tag:, accents, and notes changed after the index was built.
// Runs indexer.js directly on a TEMPORARY folder and cache, no window needed.
//   node tests/search.js
const { Worker } = require('worker_threads');
const fs = require('fs'), path = require('path'), os = require('os');
const V = path.join(os.tmpdir(), 'lanternote-search-vault'), C = path.join(os.tmpdir(), 'lanternote-search-cache');
fs.rmSync(V, { recursive: true, force: true }); fs.rmSync(C, { recursive: true, force: true });
const notes = {
  'AMM/29/Hydraulic pump.md': '# Hydraulic pump\n\nRemove the hydraulic pump PW1133G-JM. Task 29-11-00-710-801-A.\n#ata/29\n',
  'AMM/29/Pump motor.md': '# Pump motor\n\nThe pump motor drives the hydraulic system. Draft.\n',
  'AMM/32/Brake.md': '# Brake\n\nThe brake actuator and the valve. Part 1133-AB.\n#ata/32\n',
  'SOP/SOP-002 Rev 9.md': '---\ntags: [sop]\n---\n# SOP-002\n\nQuy trình bảo dưỡng tàu bay. Old rev replaced.\n',
  'SOP/Notes.md': 'Hydraulic\n\npump wording split   across lines.\n',
  'Misc/Valve list.md': 'valve list only\n',
};
for (const [p, t] of Object.entries(notes)) { fs.mkdirSync(path.dirname(path.join(V, p)), { recursive: true }); fs.writeFileSync(path.join(V, p), t); }

let failed = 0;
const check = (ok, name, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) failed++; };
const w = new Worker(path.join(__dirname, '..', 'indexer.js'), { workerData: { cacheDir: C } });
const waits = new Map(); let seq = 0, ready = null;
const searchReady = new Promise((r) => { ready = r; });
w.on('message', (m) => {
  if (m.type) { if (m.type === 'search-ready') ready(); if (m.type === 'log' && m.level === 'error') console.log('indexer error:', m.message); return; }
  const x = waits.get(m.id); if (!x) return; waits.delete(m.id);
  m.error ? x.rej(new Error(m.error)) : x.res(m.result);
});
const ask = (cmd, args) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); w.postMessage({ id, cmd, args }); });
const names = (r) => r.hits.map((h) => h.p.replace(/^.*\//, '').replace(/\.md$/, '')).sort().join(', ');
async function expect(q, want, name) {
  const r = await ask('search', { q, limit: 50 });
  check(names(r) === want, name || q, `got [${names(r)}]${r.ms !== undefined ? ` in ${r.ms} ms` : ''}`);
  return r;
}

(async () => {
  await ask('open', { root: V });
  await searchReady;
  await expect('pump', 'Hydraulic pump, Notes, Pump motor', 'words still match word starts');
  await expect('pump hydraulic', 'Hydraulic pump, Notes, Pump motor', 'several words: all must appear');
  await expect('"hydraulic pump"', 'Hydraulic pump, Notes', 'a phrase — also across line breaks and spaces');
  await expect('"pump hydraulic"', '', 'a phrase in the wrong order finds nothing');
  await expect('pump -draft', 'Hydraulic pump, Notes', '-word leaves notes out');
  await expect('pump -"pump motor"', 'Hydraulic pump, Notes', '-"phrase" leaves notes out');
  await expect('brake OR motor', 'Brake, Pump motor', 'OR: either word');
  await expect('valve OR actuator brake', 'Brake', 'OR binds only its neighbours');
  await expect('*1133', 'Brake, Hydraulic pump', 'a fragment inside a word (PW1133G, 1133-AB)');
  await expect('*133g', 'Hydraulic pump', 'a fragment in the middle of a code');
  await expect('710-801', 'Hydraulic pump', 'a part of a task code');
  await expect('pump path:AMM/29', 'Hydraulic pump, Pump motor', 'path: limits to a folder');
  await expect('path:SOP', 'Notes, SOP-002 Rev 9', 'path: alone lists a folder');
  await expect('title:valve', 'Valve list', 'title: matches the note name');
  await expect('valve -title:valve', 'Brake', '-title: leaves names out');
  await expect('tag:ata', 'Brake, Hydraulic pump', 'tag: includes sub-tags');
  await expect('tag:ata/29 pump', 'Hydraulic pump', 'tag: together with words');
  await expect('tag:sop', 'SOP-002 Rev 9', 'tag: from the front matter');
  await expect('"tau bay"', 'SOP-002 Rev 9', 'a phrase typed without accents');
  await expect('"tàu bay"', 'SOP-002 Rev 9', 'a phrase with accents');
  await expect('quy trinh', 'SOP-002 Rev 9', 'words typed without accents');
  await expect('ATA:29', 'Hydraulic pump', 'an unknown field: is searched as text');
  const r = await ask('search', { q: '"hydraulic pump" PW1133G', limit: 50 });
  check(r.hits[0] && /PW1133G/.test(r.hits[0].s) || (r.hits[0] && /hydraulic pump/i.test(r.hits[0].s)), 'the snippet shows the match', JSON.stringify(r.hits[0] && r.hits[0].s));
  check(Array.isArray(r.marks) && r.marks.includes('hydraulic pump'), 'the marks for highlighting are returned', JSON.stringify(r.marks));
  const t = await ask('search', { q: 'pump', limit: 50 });
  check(t.hits[0] && /pump/i.test(t.hits[0].p.replace(/^.*\//, '')), 'notes with the word in their name come first', t.hits.map((h) => h.p).join(' | '));

  // a note changed after the index was built (in the delta)
  fs.writeFileSync(path.join(V, 'Misc/Valve list.md'), 'valve list with the hydraulic pump and code ZX4471Q\n');
  fs.writeFileSync(path.join(V, 'Misc/New.md'), 'a new note about the hydraulic pump\n');
  await ask('update', { changed: ['Misc/Valve list.md', 'Misc/New.md'] });
  await expect('"hydraulic pump" path:Misc', 'New, Valve list', 'phrase search sees changed and new notes');
  await expect('*4471', 'Valve list', 'fragment search sees changed notes');
  fs.rmSync(path.join(V, 'Misc/New.md'));
  await ask('update', { changed: ['Misc/New.md'] });
  await expect('"hydraulic pump" path:Misc', 'Valve list', 'a deleted note drops out');

  await w.terminate();
  fs.rmSync(V, { recursive: true, force: true }); fs.rmSync(C, { recursive: true, force: true });
  console.log(failed ? `${failed} failed` : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
