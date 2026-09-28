// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Runs every ```dataview block found in a vault through the indexer, without
// the window, and prints what each returns — a check that queries written for
// other note apps work here. Read-only.
//   node scripts/dv-run.js "<vault>" [cache dir]
const { Worker } = require('worker_threads');
const path = require('path'), fs = require('fs'), os = require('os');
const root = path.resolve(process.argv[2]);
const cacheDir = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'lanternote-dv-'));
fs.mkdirSync(cacheDir, { recursive: true });
const w = new Worker(path.join(__dirname, '..', 'indexer.js'), { workerData: { cacheDir } });
let seq = 0; const waits = new Map();
w.on('message', (m) => { if (m.type) return; const p = waits.get(m.id); waits.delete(m.id); if (m.error) p.rej(new Error(m.error)); else p.res(m.result); });
const call = (cmd, args) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); w.postMessage({ id, cmd, args }); });
const show = (v) => (v == null ? '-' : Array.isArray(v) ? '[' + v.map(show).join(', ') + ']' : typeof v === 'object' ? (v.t === 'link' ? `[[${v.display}]]` : v.t === 'date' ? new Date(v.ms).toISOString().slice(0, 10) : v.t === 'dur' ? `${Math.round(v.ms / 864e5)}d` : JSON.stringify(v)) : String(v));

(async () => {
  const t = Date.now();
  const snap = await call('open', { root, exclude: [] });
  console.log(`indexed ${snap.files.length} files in ${Date.now() - t} ms`);
  let n = 0, errors = 0;
  for (const p of snap.files.filter((f) => /\.md$/i.test(f))) {
    const text = fs.readFileSync(path.join(root, p), 'utf8');
    if (!text.includes('```dataview')) continue;
    for (const m of text.matchAll(/^```dataview[ \t]*\r?\n([\s\S]*?)^```/gm)) {
      n++;
      const r = await call('dv', { q: m[1], origin: p });
      const first = m[1].trim().split('\n')[0];
      if (r.error) { errors++; console.log(`\n✗ ${p}\n  ${first}\n  ERROR: ${r.error}`); continue; }
      console.log(`\n✓ ${p}  (${r.total} row${r.total === 1 ? '' : 's'}, ${r.ms} ms)\n  ${first}`);
      if (r.headers) console.log('  | ' + r.headers.join(' | '));
      for (const row of r.rows.slice(0, 3)) console.log('  | ' + row.map(show).join(' | ').slice(0, 160));
    }
  }
  console.log(`\n${n} queries, ${errors} errors`);
  await w.terminate();
})().catch((e) => { console.error(e); process.exit(1); });
