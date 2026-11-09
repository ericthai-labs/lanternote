// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Document status from the front matter: the rules (core.js docStatus), the per-note byte and
// revisions in the snapshot, and search putting superseded documents last.
// Runs indexer.js directly on a TEMPORARY folder, no window needed.
//   node tests/doc-status.js
const { Worker } = require('worker_threads');
const fs = require('fs'), path = require('path'), os = require('os');
const Core = require('../src/core.js');
const V = path.join(os.tmpdir(), 'lanternote-status-vault'), C = path.join(os.tmpdir(), 'lanternote-status-cache');
fs.rmSync(V, { recursive: true, force: true }); fs.rmSync(C, { recursive: true, force: true });

let failed = 0;
const check = (ok, name, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) failed++; };

// ---- rules ----
const today = new Date(2026, 10, 9).getTime();
const st = (f) => { const d = Core.docStatus(f, today); return d ? `${d.state}${d.due ? '+due' : ''}${d.rev != null ? ' ' + d.rev : ''}` : 'none'; };
const rules = [
  [{ status: 'superseded' }, '2'], [{ status: 'Obsolete' }, '2'], [{ state: 'withdrawn' }, '2'], [{ trangthai: 'archived' }, '2'],
  [{ trang_thai: 'Ngừng áp dụng' }, '2'], [{ superseded_by: '[[SOP-002 Rev 10]]' }, '2'], [{ status: 'current', replaced_by: 'X' }, '2'],
  [{ status: 'current' }, '1'], [{ trangthai: 'active', revision: 'Iss04Rev41TR01' }, '1 Iss04Rev41TR01'], [{ trang_thai: 'Đang áp dụng' }, '1'],
  [{ status: 'draft' }, '3'], [{ trang_thai: 'Chờ duyệt' }, '3'], [{ trang_thai: 'nhap' }, '3'],
  [{ trang_thai: 'dang-lam' }, 'none'], [{ tags: ['x'], ngay: '2026-11-01' }, 'none'], [null, 'none'],
  [{ review_due: '2026-10-01' }, '0+due'], [{ review_due: '2026-11-09' }, 'none'], [{ expires: '2026-12-31', status: 'current' }, '1'],
  [{ status: 'superseded', review_due: '2020-01-01' }, '2'], [{ ngay_het_han: '2026-01-15' }, '0+due'], [{ Status: 'Superseded' }, '2'],
  [{ rev: 'B' }, '0 B'], [{ status: ['', 'current'] }, '1'], [{ status: 'something else' }, 'none'],
];
for (const [f, want] of rules) check(st(f) === want, 'rule ' + JSON.stringify(f), '→ ' + st(f));
check(Core.statusByte(Core.docStatus({ status: 'draft', review_due: '2020-01-01' }, today)) === 7, 'status byte: draft + review due = 3 | 4');

// ---- index + search ----
const notes = {
  'SOP/SOP-002 Rev 9.md': '---\nstatus: superseded\nsuperseded_by: "[[SOP-002 Rev 10]]"\nrevision: Rev 9\n---\n# SOP-002\n\nTorque wrench calibration procedure.\n',
  'SOP/SOP-002 Rev 10.md': '---\nstatus: current\nrevision: Rev 10\nreview_due: 2020-01-01\n---\n# SOP-002\n\nTorque wrench calibration procedure, updated.\n',
  'SOP/SOP-003.md': '---\nstatus: draft\n---\n# SOP-003\n\nTorque wrench storage.\n',
  'Notes/Plain.md': '# Plain\n\nTorque wrench mentioned here too.\n',
};
for (const [p, t] of Object.entries(notes)) { fs.mkdirSync(path.dirname(path.join(V, p)), { recursive: true }); fs.writeFileSync(path.join(V, p), t); }
const w = new Worker(path.join(__dirname, '..', 'indexer.js'), { workerData: { cacheDir: C } });
const waits = new Map(); let seq = 0, ready = null;
const searchReady = new Promise((r) => { ready = r; });
w.on('message', (m) => {
  if (m.type) { if (m.type === 'search-ready') ready(); if (m.type === 'log' && m.level === 'error') console.log('indexer error:', m.message); return; }
  const x = waits.get(m.id); if (!x) return; waits.delete(m.id);
  m.error ? x.rej(new Error(m.error)) : x.res(m.result);
});
const ask = (cmd, args) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); w.postMessage({ id, cmd, args }); });

(async () => {
  let snap = await ask('open', { root: V });
  const byte = (p) => snap.status[snap.files.indexOf(p)];
  const rev = (p) => { const i = snap.files.indexOf(p); const k = [...snap.revIdx].indexOf(i); return k < 0 ? null : snap.revStr[k]; };
  check(snap.status && snap.status.length === snap.files.length, 'snapshot has one status byte per file');
  check(byte('SOP/SOP-002 Rev 9.md') === 2 && byte('SOP/SOP-002 Rev 10.md') === (1 | 4) && byte('SOP/SOP-003.md') === 3 && byte('Notes/Plain.md') === 0,
    'status bytes: superseded, current + review due, draft, none', ['SOP/SOP-002 Rev 9.md', 'SOP/SOP-002 Rev 10.md', 'SOP/SOP-003.md', 'Notes/Plain.md'].map(byte).join(','));
  check(rev('SOP/SOP-002 Rev 9.md') === 'Rev 9' && rev('SOP/SOP-002 Rev 10.md') === 'Rev 10' && rev('Notes/Plain.md') === null, 'revisions in the snapshot');

  await searchReady;
  const r = await ask('search', { q: 'torque wrench', limit: 20 });
  const order = r.hits.map((h) => h.p.replace(/^.*\//, '').replace(/\.md$/, ''));
  check(order.length === 4 && order[order.length - 1] === 'SOP-002 Rev 9', 'search: the superseded document comes last', order.join(' | '));
  const h9 = r.hits.find((h) => h.p.endsWith('Rev 9.md')), h10 = r.hits.find((h) => h.p.endsWith('Rev 10.md')), hp = r.hits.find((h) => h.p.endsWith('Plain.md'));
  check(h9.st && h9.st.state === 2 && h9.st.rev === 'Rev 9' && h10.st.state === 1 && h10.st.due === true && hp.st === null, 'search hits carry the status', JSON.stringify([h9.st, h10.st, hp.st]));

  // editing a note updates its status in the next snapshot
  fs.writeFileSync(path.join(V, 'SOP/SOP-003.md'), '---\nstatus: current\nrevision: Rev 1\n---\n# SOP-003\n\nTorque wrench storage.\n');
  const u = await ask('update', { changed: ['SOP/SOP-003.md'] });
  snap = (u && u.snapshot) || snap;
  check(byte('SOP/SOP-003.md') === 1 && rev('SOP/SOP-003.md') === 'Rev 1', 'a changed note gets its new status', byte('SOP/SOP-003.md'));

  // a snapshot from an older cache (no status) gets one when the folder is opened again
  await ask('flush');
  const cf = fs.readdirSync(C).find((f) => f.endsWith('.bin') && !f.includes('search'));
  const v8 = require('v8');
  const c = v8.deserialize(fs.readFileSync(path.join(C, cf)));
  delete c.snap.status; delete c.snap.revIdx; delete c.snap.revStr; delete c.snap.statusDay;
  fs.writeFileSync(path.join(C, cf), v8.serialize(c));
  await w.terminate();
  const w2 = new Worker(path.join(__dirname, '..', 'indexer.js'), { workerData: { cacheDir: C } });
  const s2 = await new Promise((res, rej) => { w2.on('message', (m) => { if (m.id === 1) (m.error ? rej(new Error(m.error)) : res(m.result)); }); w2.postMessage({ id: 1, cmd: 'open', args: { root: V, instant: true } }); });
  check(s2.timing && s2.timing.cached && s2.status && s2.status[s2.files.indexOf('SOP/SOP-002 Rev 9.md')] === 2, 'an older cached snapshot gets the status when opened', JSON.stringify(s2.timing));
  await w2.terminate();

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  fs.rmSync(V, { recursive: true, force: true }); fs.rmSync(C, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
