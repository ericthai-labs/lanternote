// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Runs the map layout on a real folder and writes a PNG preview:
//   node scripts/bench-layout.js "<vault folder>" [out.png] [hubCap]
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');
const fs = require('fs');
const zlib = require('zlib');

const root = path.resolve(process.argv[2] || '.');
const outPng = process.argv[3] || path.join(os.tmpdir(), 'lanternote-layout.png');
const hubCap = +(process.argv[4] || 1000);
const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#86bcb6', '#d37295'];

function worker(file, data) {
  const w = new Worker(path.join(__dirname, '..', file), data ? { workerData: data } : undefined);
  let seq = 0; const waits = new Map();
  w.on('message', (m) => {
    if (m.type === 'progress') { process.stdout.write(`\r  ${m.phase} ${m.done}/${m.total}      `); return; }
    if (m.type) return;
    const p = waits.get(m.id); if (!p) return; waits.delete(m.id);
    if (m.error) p.rej(new Error(m.error)); else p.res(m.result);
  });
  return {
    call: (cmd, args) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); w.postMessage({ id, cmd, args, ...args }); }),
    end: () => w.terminate(),
  };
}

function png(file, W, H, rgba) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

(async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanternote-bl-'));
  const ix = worker('indexer.js', { cacheDir });
  let t = Date.now();
  const s = await ix.call('open', { root });
  console.log(`\nindex ${Date.now() - t} ms`);
  await ix.end();
  // notes only, edges re-numbered to note space
  const noteOf = new Int32Array(s.files.length).fill(-1);
  const group = [];
  const folders = new Map();
  let N = 0;
  s.files.forEach((p, i) => {
    if (!/\.(md|markdown)$/i.test(p)) return;
    noteOf[i] = N++;
    const top = p.includes('/') ? p.slice(0, p.indexOf('/')) : '(root)';
    if (!folders.has(top)) folders.set(top, folders.size);
    group.push(folders.get(top));
  });
  const e = [];
  for (let k = 0; k < s.edges.length; k += 2) { const a = noteOf[s.edges[k]], b = noteOf[s.edges[k + 1]]; if (a >= 0 && b >= 0) e.push(a, b); }
  const edges = Uint32Array.from(e);
  const g16 = Uint16Array.from(group);
  const lw = worker('layout-worker.js');
  t = Date.now();
  const L = await lw.call('layout', { N, edges, group: g16, hubCap });
  console.log(`\nlayout ${Date.now() - t} ms`, { components: L.components, kept: L.kept, medianLink: L.medianLink });
  const palette = new Uint8Array(folders.size * 3);
  [...folders.keys()].forEach((f, k) => { const h = parseInt(PALETTE[k % PALETTE.length].slice(1), 16); palette[k * 3] = h >> 16; palette[k * 3 + 1] = (h >> 8) & 255; palette[k * 3 + 2] = h & 255; });
  t = Date.now();
  const R = 2048;
  const r = await lw.call('raster', { pos: L.pos, N, edges, group: g16, hubCap, R, palette });
  console.log(`raster ${Date.now() - t} ms`);
  await lw.end();
  // compose like the window does (light theme)
  let mx = 0; for (const d of r.dens) if (d > mx) mx = d;
  const lm = Math.log1p(Math.min(mx, 400));
  const img = new Uint8ClampedArray(R * R * 4);
  for (let p = 0; p < R * R; p++) {
    const a = r.dens[p] ? Math.min(1, Math.log1p(r.dens[p]) / lm) * 0.35 : 0;
    let cr = 255 - a * 150, cg = 255 - a * 145, cb = 255 - a * 135;
    const na = r.nodes[p * 4 + 3] / 255;
    cr = cr * (1 - na) + r.nodes[p * 4] * na; cg = cg * (1 - na) + r.nodes[p * 4 + 1] * na; cb = cb * (1 - na) + r.nodes[p * 4 + 2] * na;
    img[p * 4] = cr; img[p * 4 + 1] = cg; img[p * 4 + 2] = cb; img[p * 4 + 3] = 255;
  }
  png(outPng, R, R, img);
  console.log('preview', outPng, 'folders', [...folders.keys()].join(', '));
  fs.rmSync(cacheDir, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
