// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Benchmarks the indexer on a real folder, without the window:
//   node scripts/bench-index.js "<vault folder>" [search words]
// Runs open twice (cold = no cache, warm = with cache), then a search.
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');
const fs = require('fs');

const root = path.resolve(process.argv[2] || '.');
const query = process.argv.slice(3).join(' ') || 'hydraulic pump';
// BENCH_CACHE=<dir> keeps the cache between runs (then only a warm open is timed)
const keep = process.env.BENCH_CACHE;
const cacheDir = keep ? (fs.mkdirSync(keep, { recursive: true }), keep) : fs.mkdtempSync(path.join(os.tmpdir(), 'lanternote-bench-'));

const w = new Worker(path.join(__dirname, '..', 'indexer.js'), { workerData: { cacheDir } });
let seq = 0; const waits = new Map();
let searchReady = () => {};
let ready = null;
w.on('message', (m) => {
  if (m.type === 'progress') { process.stdout.write(`\r  ${m.phase} ${m.done}/${m.total}        `); return; }
  if (m.type === 'search-ready') { console.log('\nsearch text ready', m); searchReady(m); return; }
  const p = waits.get(m.id); waits.delete(m.id);
  if (m.error) p.rej(new Error(m.error)); else p.res(m.result);
});
w.on('error', (e) => { console.error('worker error', e); process.exit(1); });
const call = (cmd, args) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); w.postMessage({ id, cmd, args }); });
const mem = () => { const m = process.memoryUsage(); return `rss ${(m.rss / 2 ** 20).toFixed(0)} MB`; };
let peak = 0; setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 200).unref();

(async () => {
  for (const label of keep && fs.readdirSync(keep).length ? ['warm'] : ['cold', 'warm']) {
    ready = new Promise((r) => { searchReady = r; });
    const t = Date.now();
    const s = await call('open', { root });
    console.log(`\n${label}: ${Date.now() - t} ms`, s.timing, `edges ${s.edges.length / 2}`, `tags ${s.tagNames.length}`, mem());
    const bytes = JSON.stringify(s.files).length + s.edges.byteLength + s.mtimes.byteLength + s.tagFiles.byteLength;
    console.log(`  snapshot ≈ ${(bytes / 2 ** 20).toFixed(1)} MB`);
    if (label === 'cold') await call('flush');
  }
  await ready;
  for (const q of [query, 'zzzz-not-there', '29-11', '801-a', 'tau bay', 'kiểm tra']) {
    const t = Date.now();
    const r = await call('search', { q, limit: 300 });
    console.log(`search "${q}": ${r.total} hits in ${Date.now() - t} ms`, r.hits.slice(0, 3), mem());
  }
  if (global.gc) global.gc();
  await new Promise((r) => setTimeout(r, 500));
  const wm = await call('mem');
  console.log('peak rss', (peak / 2 ** 20).toFixed(0), 'MB; now rss', (process.memoryUsage().rss / 2 ** 20).toFixed(0), 'MB; indexer heap', wm);
  const f = fs.readdirSync(cacheDir).map((x) => `${x} ${(fs.statSync(path.join(cacheDir, x)).size / 2 ** 20).toFixed(1)} MB`);
  console.log('cache files', f);
  await w.terminate();
  if (!keep) fs.rmSync(cacheDir, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
