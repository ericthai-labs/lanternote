// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Lanternote — map layout (worker thread).
// Computes a fixed position for every note once, so the graph can be drawn
// as a static map on any PC (no GPU simulation running every frame).
//
//   1. Links of hub notes (more links than `hubCap`) are left out: they would
//      put every note two steps from every other and flatten the layout.
//   2. Each large connected component is placed with Pivot MDS (Brandes &
//      Pich 2006): breadth-first distances from ~40 pivot notes, double
//      centering, and the top two eigenvectors of a 40×40 matrix. Linear in
//      the number of links, so 190k notes / 1.2M links take a few seconds.
//   3. Notes that land on the same spot (same distances to every pivot, e.g.
//      all part numbers of one IPC figure) are fanned out in sunflower
//      spirals, then a few passes of grid-based collision + springs even
//      out overlaps.
//   4. Small components and unlinked notes become islands (grouped by
//      folder) packed in rings around the main component.
//   5. A density picture of all links and notes is rasterised here too, so
//      the window can show the whole vault as one image when zoomed out.
'use strict';
const { parentPort } = require('worker_threads');

const PIVOTS = 40;
const BIG_COMP = 200;

let lastTick = 0;
function progress(id, phase, done, total) {
  const t = Date.now();
  if (t - lastTick < 150 && done < total) return;
  lastTick = t;
  parentPort.postMessage({ id, type: 'progress', phase, done, total });
}

// deterministic pseudo-random in [0,1)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function buildAdjacency(N, edges, hubCap) {
  const deg = new Uint32Array(N);
  for (let e = 0; e < edges.length; e += 2) { deg[edges[e]]++; deg[edges[e + 1]]++; }
  const keep = (a, b) => a !== b && (!hubCap || (deg[a] <= hubCap && deg[b] <= hubCap));
  const cnt = new Uint32Array(N + 1);
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e], b = edges[e + 1];
    if (keep(a, b)) { cnt[a + 1]++; cnt[b + 1]++; }
  }
  for (let i = 0; i < N; i++) cnt[i + 1] += cnt[i];
  const off = cnt;
  const pos = off.slice(0, N);
  const adj = new Uint32Array(off[N]);
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e], b = edges[e + 1];
    if (keep(a, b)) { adj[pos[a]++] = b; adj[pos[b]++] = a; }
  }
  return { deg, off, adj };
}

function components(N, off, adj) {
  const comp = new Int32Array(N).fill(-1);
  const queue = new Uint32Array(N);
  const sizes = [];
  for (let s = 0; s < N; s++) {
    if (comp[s] >= 0) continue;
    const c = sizes.length;
    let h = 0, t = 0;
    queue[t++] = s; comp[s] = c;
    while (h < t) {
      const u = queue[h++];
      for (let e = off[u]; e < off[u + 1]; e++) { const v = adj[e]; if (comp[v] < 0) { comp[v] = c; queue[t++] = v; } }
    }
    sizes.push(t);
  }
  return { comp, sizes };
}

// Pivot MDS for one component; `members` are node ids, `local` maps id → row.
function pivotMds(members, local, off, adj, deg, id) {
  const n = members.length;
  const k = Math.min(PIVOTS, n);
  const D = new Float32Array(n * k);        // squared distances, row-major
  const dist = new Int32Array(n);
  const minD = new Float64Array(n).fill(Infinity);
  const queue = new Uint32Array(n);
  // first pivot: best-linked note; then always the note farthest from all pivots
  let p = 0;
  for (let r = 1; r < n; r++) if (deg[members[r]] > deg[members[p]]) p = r;
  for (let j = 0; j < k; j++) {
    dist.fill(-1);
    let h = 0, t = 0;
    queue[t++] = p; dist[p] = 0;
    while (h < t) {
      const r = queue[h++], u = members[r], du = dist[r] + 1;
      for (let e = off[u]; e < off[u + 1]; e++) {
        const q = local[adj[e]];
        if (dist[q] < 0) { dist[q] = du; queue[t++] = q; }
      }
    }
    let far = 0;
    for (let r = 0; r < n; r++) {
      const d = dist[r];
      D[r * k + j] = d * d;
      if (d < minD[r]) minD[r] = d;
      if (minD[r] > minD[far]) far = r;
    }
    p = far;
    progress(id, 'pivots', j + 1, k);
  }
  // double centering: C = -1/2 (D - rowMean - colMean + grand)
  const colMean = new Float64Array(k);
  const rowMean = new Float64Array(n);
  let grand = 0;
  for (let r = 0; r < n; r++) {
    let s = 0;
    for (let j = 0; j < k; j++) { const v = D[r * k + j]; s += v; colMean[j] += v; }
    rowMean[r] = s / k; grand += s;
  }
  for (let j = 0; j < k; j++) colMean[j] /= n;
  grand /= n * k;
  for (let r = 0; r < n; r++) for (let j = 0; j < k; j++) D[r * k + j] = -0.5 * (D[r * k + j] - rowMean[r] - colMean[j] + grand);
  // B = CᵀC (k×k)
  const B = new Float64Array(k * k);
  for (let r = 0; r < n; r++) {
    const o = r * k;
    for (let a = 0; a < k; a++) { const ca = D[o + a]; if (!ca) continue; for (let b = a; b < k; b++) B[a * k + b] += ca * D[o + b]; }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) B[a * k + b] = B[b * k + a];
  // top two eigenvectors by power iteration with deflation
  const eig = [];
  const rand = rng(12345);
  for (let m = 0; m < 2; m++) {
    let v = Float64Array.from({ length: k }, () => rand() - 0.5);
    for (let it = 0; it < 200; it++) {
      const w = new Float64Array(k);
      for (let a = 0; a < k; a++) { let s = 0; for (let b = 0; b < k; b++) s += B[a * k + b] * v[b]; w[a] = s; }
      for (const u of eig) { let d = 0; for (let a = 0; a < k; a++) d += w[a] * u[a]; for (let a = 0; a < k; a++) w[a] -= d * u[a]; }
      let norm = 0; for (let a = 0; a < k; a++) norm += w[a] * w[a];
      norm = Math.sqrt(norm) || 1;
      for (let a = 0; a < k; a++) w[a] /= norm;
      v = w;
    }
    eig.push(v);
  }
  const xy = new Float64Array(n * 2);
  for (let r = 0; r < n; r++) {
    let x = 0, y = 0;
    for (let j = 0; j < k; j++) { const c = D[r * k + j]; x += c * eig[0][j]; y += c * eig[1][j]; }
    xy[r * 2] = x; xy[r * 2 + 1] = y;
  }
  return xy;
}

// Scale to about one unit of space per note, fan out stacked notes, and even
// out overlaps. Works in place on xy (component-local, centred at 0,0).
function spread(xy, n, rows, off, adj, local, id) {
  // Radial density equalisation. MDS lets a few long chains of notes own
  // most of the spread and squeezes the dense core into a corner. Keep each
  // note's direction from the centre but re-space the distances by rank so
  // the component fills a disc evenly: neighbours stay neighbours, the core
  // opens up, the chains fold in.
  const R = Math.sqrt(n / Math.PI) * 1.25; // disc with ~1.2 units² per note
  const rad = new Float64Array(n);
  const byRad = new Uint32Array(n);
  const equalise = () => {
    let cx = 0, cy = 0;
    for (let r = 0; r < n; r++) { cx += xy[r * 2]; cy += xy[r * 2 + 1]; }
    cx /= n; cy /= n;
    for (let r = 0; r < n; r++) { rad[r] = Math.hypot(xy[r * 2] - cx, xy[r * 2 + 1] - cy); byRad[r] = r; }
    byRad.sort((a, b) => rad[a] - rad[b]);
    for (let q = 0; q < n; q++) {
      const r = byRad[q];
      const k = rad[r] ? R * Math.sqrt((q + 0.5) / n) / rad[r] : 0;
      xy[r * 2] = (xy[r * 2] - cx) * k; xy[r * 2 + 1] = (xy[r * 2 + 1] - cy) * k;
    }
  };
  equalise();
  // Neighbour smoothing: pull each note halfway to the mean of the notes it
  // links with, then re-equalise so the whole does not collapse. A few
  // rounds bring linked notes together (linear cost per round).
  const tmp = new Float64Array(n * 2);
  const ROUNDS = +(process.env.LANTERNOTE_SMOOTH || 30);
  for (let round = 0; round < ROUNDS; round++) {
    for (let r = 0; r < n; r++) {
      const u = rows[r];
      const a = off[u], b = off[u + 1];
      if (a === b) { tmp[r * 2] = xy[r * 2]; tmp[r * 2 + 1] = xy[r * 2 + 1]; continue; }
      let mx = 0, my = 0;
      for (let e = a; e < b; e++) { const o = local[adj[e]]; mx += xy[o * 2]; my += xy[o * 2 + 1]; }
      const d = b - a;
      tmp[r * 2] = 0.5 * xy[r * 2] + 0.5 * mx / d; tmp[r * 2 + 1] = 0.5 * xy[r * 2 + 1] + 0.5 * my / d;
    }
    xy.set(tmp);
    equalise();
    progress(id, 'smooth', round + 1, ROUNDS);
  }

  // sunflower spirals for notes sharing a cell
  const cell = new Map();
  for (let r = 0; r < n; r++) {
    const key = Math.floor(xy[r * 2]) * 65536 + Math.floor(xy[r * 2 + 1]);
    const a = cell.get(key);
    if (a) a.push(r); else cell.set(key, [r]);
  }
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  for (const rs of cell.values()) {
    if (rs.length < 2) continue;
    let mx = 0, my = 0;
    for (const r of rs) { mx += xy[r * 2]; my += xy[r * 2 + 1]; }
    mx /= rs.length; my /= rs.length;
    rs.forEach((r, i) => {
      const rad = 0.55 * Math.sqrt(i + 0.5), th = i * GOLD;
      xy[r * 2] = mx + Math.cos(th) * rad; xy[r * 2 + 1] = my + Math.sin(th) * rad;
    });
  }

  // collision + weak springs on a uniform grid
  const rand = rng(777);
  const ITER = 24;
  const dx = new Float64Array(n * 2);
  for (let it = 0; it < ITER; it++) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let r = 0; r < n; r++) { const x = xy[r * 2], y = xy[r * 2 + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const W = Math.max(1, Math.ceil(maxX - minX) + 1), H = Math.max(1, Math.ceil(maxY - minY) + 1);
    const cells = W * H;
    if (cells > 64e6) break; // pathological spread; stop refining
    const start = new Uint32Array(cells + 1);
    const cid = new Uint32Array(n);
    for (let r = 0; r < n; r++) { const c = Math.floor(xy[r * 2 + 1] - minY) * W + Math.floor(xy[r * 2] - minX); cid[r] = c; start[c + 1]++; }
    for (let c = 0; c < cells; c++) start[c + 1] += start[c];
    const fill = start.slice(0, cells), items = new Uint32Array(n);
    for (let r = 0; r < n; r++) items[fill[cid[r]]++] = r;
    dx.fill(0);
    const cool = 1 - it / ITER;
    for (let r = 0; r < n; r++) {
      const x = xy[r * 2], y = xy[r * 2 + 1];
      const gx = Math.floor(x - minX), gy = Math.floor(y - minY);
      for (let oy = -1; oy <= 1; oy++) {
        const yy = gy + oy; if (yy < 0 || yy >= H) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = gx + ox; if (xx < 0 || xx >= W) continue;
          const c = yy * W + xx;
          const s = start[c], e = Math.min(start[c + 1], s + 24); // cap work in dense cells
          for (let q = s; q < e; q++) {
            const o = items[q]; if (o === r) continue;
            let ddx = x - xy[o * 2], ddy = y - xy[o * 2 + 1];
            let d2 = ddx * ddx + ddy * ddy;
            if (d2 >= 1) continue;
            if (d2 < 1e-9) { ddx = rand() - 0.5; ddy = rand() - 0.5; d2 = ddx * ddx + ddy * ddy; }
            const d = Math.sqrt(d2), f = (1 - d) / d * 0.25;
            dx[r * 2] += ddx * f; dx[r * 2 + 1] += ddy * f;
          }
        }
      }
    }
    // springs pull linked notes to ~1.5 units apart
    for (let r = 0; r < n; r++) {
      const u = rows[r];
      for (let e = off[u]; e < off[u + 1]; e++) {
        const o = local[adj[e]];
        if (o <= r) continue;
        const ddx = xy[o * 2] - xy[r * 2], ddy = xy[o * 2 + 1] - xy[r * 2 + 1];
        const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1e-6;
        const f = (d - 1.5) / d * 0.02;
        dx[r * 2] += ddx * f; dx[r * 2 + 1] += ddy * f;
        dx[o * 2] -= ddx * f; dx[o * 2 + 1] -= ddy * f;
      }
    }
    for (let r = 0; r < n * 2; r++) { let m = dx[r]; if (m > 2) m = 2; else if (m < -2) m = -2; xy[r] += m * cool; }
    progress(id, 'spread', it + 1, ITER);
  }
}

// small components: best-linked note in the middle, the rest in a sunflower
// ordered by distance from it
function smallLayout(members, local, off, adj, deg) {
  const n = members.length;
  let root = 0;
  for (let r = 1; r < n; r++) if (deg[members[r]] > deg[members[root]]) root = r;
  const order = [root], seen = new Set([root]);
  for (let h = 0; h < order.length; h++) {
    const u = members[order[h]];
    for (let e = off[u]; e < off[u + 1]; e++) { const q = local[adj[e]]; if (!seen.has(q)) { seen.add(q); order.push(q); } }
  }
  const xy = new Float64Array(n * 2);
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  order.forEach((r, i) => { const rad = 0.9 * Math.sqrt(i); xy[r * 2] = Math.cos(i * GOLD) * rad; xy[r * 2 + 1] = Math.sin(i * GOLD) * rad; });
  return xy;
}

function layout({ id, N, edges, group, hubCap }) {
  const t0 = Date.now();
  const { deg, off, adj } = buildAdjacency(N, edges, hubCap);
  const { comp, sizes } = components(N, off, adj);
  const byComp = sizes.map(() => []);
  for (let i = 0; i < N; i++) byComp[comp[i]].push(i);
  const local = new Int32Array(N);
  const pos = new Float32Array(N * 2);

  // islands: { members, xy, r, group }
  const islands = [];
  const singles = new Map(); // folder group → unlinked notes
  let done = 0;
  const order = sizes.map((s, c) => c).sort((a, b) => sizes[b] - sizes[a]);
  for (const c of order) {
    const members = byComp[c];
    if (members.length === 1) {
      const gq = group[members[0]];
      const arr = singles.get(gq);
      if (arr) arr.push(members[0]); else singles.set(gq, [members[0]]);
      continue;
    }
    members.forEach((u, r) => { local[u] = r; });
    let xy;
    if (members.length >= BIG_COMP) {
      xy = pivotMds(members, local, off, adj, deg, id);
      spread(xy, members.length, members, off, adj, local, id);
    } else {
      xy = smallLayout(members, local, off, adj, deg);
    }
    let r = 0;
    for (let q = 0; q < members.length; q++) r = Math.max(r, Math.hypot(xy[q * 2], xy[q * 2 + 1]));
    // majority folder, so islands of one folder sit together
    const cnt = new Map();
    for (const u of members) cnt.set(group[u], (cnt.get(group[u]) || 0) + 1);
    const gMaj = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
    islands.push({ members, xy, r: r + 1, group: gMaj });
    done += members.length;
    progress(id, 'components', done, N);
  }
  // unlinked notes: one sunflower per folder
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  for (const [gq, members] of singles) {
    const xy = new Float64Array(members.length * 2);
    members.forEach((u, i) => { const rad = 0.8 * Math.sqrt(i); xy[i * 2] = Math.cos(i * GOLD) * rad; xy[i * 2 + 1] = Math.sin(i * GOLD) * rad; });
    islands.push({ members, xy, r: 0.8 * Math.sqrt(members.length) + 1, group: gq });
  }

  // pack: the largest island in the middle, the rest on rings around it,
  // ordered by folder then size so a folder's islands are neighbours
  islands.sort((a, b) => b.members.length - a.members.length);
  const place = (isl, x, y) => { isl.members.forEach((u, q) => { pos[u * 2] = isl.xy[q * 2] + x; pos[u * 2 + 1] = isl.xy[q * 2 + 1] + y; }); };
  if (islands.length) {
    const [first, ...rest] = islands;
    place(first, 0, 0);
    rest.sort((a, b) => a.group - b.group || b.r - a.r);
    const margin = 2;
    let ringR = first.r + margin, ringMax = 0, ang = 0;
    for (const isl of rest) {
      let R = ringR + isl.r;
      let step = (2 * isl.r + margin) / R;
      if (ang + step > Math.PI * 2) { ringR += 2 * ringMax + margin; ringMax = 0; ang = 0; R = ringR + isl.r; step = (2 * isl.r + margin) / R; }
      const a = ang + step / 2;
      place(isl, Math.cos(a) * R, Math.sin(a) * R);
      ang += step;
      ringMax = Math.max(ringMax, isl.r);
    }
  }
  // quality: median length of kept links, in units of the main disc radius
  const lens = [];
  for (let u = 0; u < N; u += 7) for (let e = off[u]; e < off[u + 1]; e++) { const v = adj[e]; lens.push(Math.hypot(pos[u * 2] - pos[v * 2], pos[u * 2 + 1] - pos[v * 2 + 1])); }
  lens.sort((a, b) => a - b);
  const mainR = islands.length ? islands[0].r : 1;
  return { pos, ms: Date.now() - t0, components: sizes.length, kept: off[N] / 2, medianLink: +(lens[lens.length >> 1] / mainR).toFixed(4) };
}

// Density picture of links and notes, R×R pixels, in world coordinates.
function raster({ pos, N, edges, group, hubCap, R, palette }) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) { const x = pos[i * 2], y = pos[i * 2 + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const pad = span * 0.02;
  minX -= pad; minY -= pad;
  const scale = (R - 1) / (span + 2 * pad);
  const deg = new Uint32Array(N);
  for (let e = 0; e < edges.length; e += 2) { deg[edges[e]]++; deg[edges[e + 1]]++; }
  const dens = new Uint16Array(R * R);
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e], b = edges[e + 1];
    if (hubCap && (deg[a] > hubCap || deg[b] > hubCap)) continue;
    let x0 = (pos[a * 2] - minX) * scale, y0 = (pos[a * 2 + 1] - minY) * scale;
    const x1 = (pos[b * 2] - minX) * scale, y1 = (pos[b * 2 + 1] - minY) * scale;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    const sx = steps ? (x1 - x0) / steps : 0, sy = steps ? (y1 - y0) / steps : 0;
    for (let s = 0; s <= steps; s++) {
      const p = (y0 | 0) * R + (x0 | 0);
      if (dens[p] < 65535) dens[p]++;
      x0 += sx; y0 += sy;
    }
  }
  const acc = new Uint32Array(R * R * 3), cnt = new Uint16Array(R * R);
  for (let i = 0; i < N; i++) {
    const p = (((pos[i * 2 + 1] - minY) * scale) | 0) * R + (((pos[i * 2] - minX) * scale) | 0);
    const c = group[i] * 3;
    acc[p * 3] += palette[c]; acc[p * 3 + 1] += palette[c + 1]; acc[p * 3 + 2] += palette[c + 2];
    if (cnt[p] < 65535) cnt[p]++;
  }
  const nodes = new Uint8ClampedArray(R * R * 4);
  for (let p = 0; p < R * R; p++) {
    const k = cnt[p]; if (!k) continue;
    nodes[p * 4] = acc[p * 3] / k; nodes[p * 4 + 1] = acc[p * 3 + 1] / k; nodes[p * 4 + 2] = acc[p * 3 + 2] / k;
    nodes[p * 4 + 3] = Math.min(255, 200 + 25 * Math.log2(k));
  }
  return { dens, nodes, R, minX, minY, scale };
}

parentPort.on('message', (msg) => {
  try {
    if (msg.cmd === 'layout') {
      const res = layout(msg);
      parentPort.postMessage({ id: msg.id, result: res }, [res.pos.buffer]);
    } else if (msg.cmd === 'raster') {
      const res = raster(msg);
      parentPort.postMessage({ id: msg.id, result: res }, [res.dens.buffer, res.nodes.buffer]);
    }
  } catch (e) {
    parentPort.postMessage({ id: msg.id, error: e.stack || e.message });
  }
});
