// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Index cache test: closing the app while a slow open is still checking notes
// must not throw away the cached notes it had not checked yet (otherwise every
// later open reads the whole folder again). Runs indexer.js directly on a
// TEMPORARY folder and cache, no window needed.
//   node tests/index-cache.js
const { Worker } = require('worker_threads');
const fs = require('fs'), path = require('path'), os = require('os'), v8 = require('v8');
const N = 20000;
const V = path.join(os.tmpdir(), 'lanternote-cache-vault'), C = path.join(os.tmpdir(), 'lanternote-cache-dir');
fs.rmSync(V, { recursive: true, force: true }); fs.rmSync(C, { recursive: true, force: true });
for (let d = 0; d < 20; d++) {
  fs.mkdirSync(path.join(V, 'd' + d), { recursive: true });
  for (let i = 0; i < N / 20; i++) fs.writeFileSync(path.join(V, 'd' + d, `n${i}.md`), `# Note ${d}-${i}\n\nSee [[n${(i + 1) % (N / 20)}]] #tag${i % 7}\n`);
}
let failed = 0;
const check = (ok, name, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) failed++; };

function start(onProgress) {
  const w = new Worker(path.join(__dirname, '..', 'indexer.js'), { workerData: { cacheDir: C } });
  const waits = new Map(); let seq = 0;
  w.on('message', (m) => {
    if (m.type === 'progress') { if (onProgress) onProgress(m); return; }
    const x = waits.get(m.id); if (!x) return; waits.delete(m.id);
    m.error ? x.rej(new Error(m.error)) : x.res(m.result);
  });
  const ask = (cmd, args) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); w.postMessage({ id, cmd, args }); });
  return { w, ask };
}
const cached = () => {
  const f = fs.readdirSync(C).find((x) => /^[0-9a-f]{16}\.bin$/.test(x));
  const c = v8.deserialize(fs.readFileSync(path.join(C, f)));
  return { entries: c.entries.length, snap: !!c.snap };
};

(async () => {
  // 1. first open builds a full cache
  let a = start();
  await a.ask('open', { root: V }); await a.ask('flush'); await a.w.terminate();
  let c = cached();
  check(c.entries === N && c.snap, 'first open caches every note', JSON.stringify(c));

  // 2. a sync added a note and changed the others → the file list differs, so
  //    the next open checks and re-reads note by note; the app is closed early
  const t = new Date(Date.now() + 60000);
  for (let d = 0; d < 20; d++) for (let i = 0; i < N / 20; i++) fs.utimesSync(path.join(V, 'd' + d, `n${i}.md`), t, t);
  fs.writeFileSync(path.join(V, 'New.md'), '# New\n');
  let early = null;
  const b = start((m) => { if (!early && (m.phase === 'check' || m.phase === 'read') && m.done >= 2000) early = m; });
  b.ask('open', { root: V }).catch(() => {});
  while (!early) await new Promise((r) => setTimeout(r, 5));
  await b.ask('flush');
  await b.w.terminate(); // the open still running never answers
  c = cached();
  check(c.entries >= N, 'closing during a slow open keeps the notes not checked yet', `${JSON.stringify(c)} closed at ${early.phase} ${early.done}/${early.total}`);

  // 3. the next open finishes and needs to re-read only what changed
  const d = start();
  const snap = await d.ask('open', { root: V }); await d.ask('flush'); await d.w.terminate();
  c = cached();
  check(c.entries === N + 1 && c.snap, 'a full open afterwards leaves a complete cache', `${JSON.stringify(c)} reread ${snap.timing.reread}`);

  fs.rmSync(V, { recursive: true, force: true }); fs.rmSync(C, { recursive: true, force: true });
  console.log(failed ? `${failed} failed` : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
