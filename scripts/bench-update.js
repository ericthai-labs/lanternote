// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// What one saved note costs in the indexer on a big folder, without the window:
//   node scripts/bench-update.js "<vault folder>" "<note, relative>" [times = 5]
// The note is written back with the SAME text (only its modified time changes), then the
// indexer is told about it, as the app does after every auto-save.
// BENCH_CACHE=<dir> uses (and updates) an index cache there, so the open is a warm one.
const { Worker } = require('worker_threads');
const path = require('path'), os = require('os'), fs = require('fs');

const root = path.resolve(process.argv[2] || '.');
const note = process.argv[3];
const times = +(process.argv[4] || 5);
if (!note || !fs.existsSync(path.join(root, note))) { console.error('usage: node scripts/bench-update.js <vault> <note> [times]'); process.exit(1); }
const cacheDir = process.env.BENCH_CACHE || fs.mkdtempSync(path.join(os.tmpdir(), 'lanternote-bench-'));
fs.mkdirSync(cacheDir, { recursive: true });

const w = new Worker(path.join(__dirname, '..', 'indexer.js'), { workerData: { cacheDir } });
let seq = 0; const waits = new Map();
w.on('message', (m) => { if (m.type) return; const p = waits.get(m.id); waits.delete(m.id); if (m.error) p.rej(new Error(m.error)); else p.res(m.result); });
w.on('error', (e) => { console.error('worker error', e); process.exit(1); });
const call = (cmd, args) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); w.postMessage({ id, cmd, args }); });
const size = (r) => {
  if (!r) return 0;
  const s = r.snapshot || r.delta || r;
  let b = 0;
  const add = (v) => { if (ArrayBuffer.isView(v)) b += v.byteLength; else if (Array.isArray(v)) v.forEach((x) => (typeof x === 'string' ? (b += x.length + 2) : add(x))); else if (v && typeof v === 'object') Object.values(v).forEach(add); else if (v != null) b += 8; };
  add(s);
  return b;
};

(async () => {
  let t = Date.now();
  const s = await call('open', { root });
  console.log(`open ${Date.now() - t} ms`, JSON.stringify(s.timing), `files ${s.files.length}, links ${s.edges.length / 2}`);
  const abs = path.join(root, note), text = fs.readFileSync(abs, 'utf8');
  const all = [];
  for (let k = 0; k < times; k++) {
    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(abs, text); // same text, new modified time
    t = Date.now();
    const r = await call('update', { changed: [note], delta: !process.env.FULL }); // the app asks for deltas
    const ms = Date.now() - t;
    all.push(ms);
    console.log(`update ${ms} ms → ${r ? (r.snapshot ? 'full snapshot' : r.delta ? 'delta' : 'no index change') : 'nothing'}, ≈ ${size(r) < 2 ** 20 ? size(r).toLocaleString() + ' bytes' : (size(r) / 2 ** 20).toFixed(1) + ' MB'} to the window`);
  }
  all.sort((a, b) => a - b);
  console.log(`median ${all[all.length >> 1]} ms over ${times} saves`);
  // the index cache is written to disk a few seconds after an edit: how long the indexer is busy with it
  t = Date.now();
  await call('flush');
  console.log(`saving the index cache: ${Date.now() - t} ms`);
  await w.terminate();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
