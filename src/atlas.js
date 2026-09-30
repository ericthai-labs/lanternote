// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — "Map" graph engine.
// A graph of any size drawn like a web map, on plain Canvas 2D (no WebGL,
// no GPU needed):
//   • positions are computed once in a worker (layout-worker.js: Pivot MDS +
//     smoothing) and cached on disk, so nothing is simulated while you look;
//   • zoomed out, the whole vault is one pre-rendered density picture plus
//     folder names (level of detail, like map tiles);
//   • zoomed in, only the notes and links inside the view are drawn, with a
//     fixed budget per frame, found through a uniform grid index;
//   • frames are drawn only when something changes (pan, zoom, hover), so an
//     idle graph costs no CPU at all.
'use strict';

const Atlas = (() => {
  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#86bcb6', '#d37295'];
  const DETAIL_MAX = 25000;   // notes and links drawn one by one up to this many notes in view
  const MID_MAX = 80000;      // up to this many: overview picture for links, notes drawn crisp
  const EDGE_BUDGET = 60000;  // links drawn per frame in detail view
  const LOCAL_MAX = 3000;
  const R = 2048;             // overview picture size

  let M = null;               // model of what is on screen
  let overview = null;        // { canvas, minX, minY, scale }
  let grid = null;
  let cv = null, ctx = null;
  const view = { x: 0, y: 0, k: 1 };
  let hovered = -1, hits = null, hitSet = null, drawPending = false;
  let busy = 0;               // bumps on every rebuild, so late async results are dropped
  let opts = { hubCap: 1000, orphans: true, depth: 1 };

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const topFolder = (p) => { const i = p.indexOf('/'); return i < 0 ? '(root)' : p.slice(0, i); };
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

  // ---------------- canvas ----------------
  function ensureCanvas() {
    const box = g('graphCanvas');
    if (cv && cv.parentElement === box) return;
    box.innerHTML = '';
    cv = document.createElement('canvas');
    cv.className = 'atlas';
    box.appendChild(cv);
    ctx = cv.getContext('2d', { alpha: false });
    wireCanvas();
    new ResizeObserver(() => { resize(); requestDraw(); }).observe(box);
    resize();
  }
  function resize() {
    if (!cv) return;
    const box = g('graphCanvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, box.clientWidth * dpr); cv.height = Math.max(1, box.clientHeight * dpr);
    cv.style.width = box.clientWidth + 'px'; cv.style.height = box.clientHeight + 'px';
  }
  const W = () => cv.width, H = () => cv.height;
  const dprNow = () => cv.width / Math.max(1, cv.clientWidth);
  const toScreen = (x, y) => [(x - view.x) * view.k + W() / 2, (y - view.y) * view.k + H() / 2];
  const toWorld = (sx, sy) => [(sx - W() / 2) / view.k + view.x, (sy - H() / 2) / view.k + view.y];
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => { drawPending = false; draw(); });
  }

  // ---------------- model ----------------
  // Notes of the vault (or of a neighbourhood) in their own 0..N-1 space.
  function model(fileIdx) {
    const N = fileIdx.length;
    const local = new Int32Array(V.files.length).fill(-1);
    for (let k = 0; k < N; k++) local[fileIdx[k]] = k;
    const e = [];
    for (let k = 0; k < N; k++) {
      const i = fileIdx[k];
      for (let q = V.outOff[i]; q < V.outOff[i + 1]; q++) { const t = local[V.outTo[q]]; if (t >= 0 && t !== k) e.push(k, t); }
    }
    const edges = Uint32Array.from(e);
    const deg = new Uint32Array(N);
    for (let q = 0; q < edges.length; q += 2) { deg[edges[q]]++; deg[edges[q + 1]]++; }
    const count = new Map();
    for (const i of fileIdx) { const f = topFolder(V.files[i]); count.set(f, (count.get(f) || 0) + 1); }
    const folders = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
    const fIdx = new Map(folders.map((f, k) => [f, k]));
    const group = new Uint16Array(N);
    for (let k = 0; k < N; k++) group[k] = fIdx.get(topFolder(V.files[fileIdx[k]]));
    const colours = folders.map((_, k) => PALETTE[k % PALETTE.length]);
    // links kept for drawing (hub links hidden in the whole-vault view)
    const cap = opts.hubCap;
    const cnt = new Uint32Array(N + 1);
    const keep = (a, b) => !cap || (deg[a] <= cap && deg[b] <= cap);
    for (let q = 0; q < edges.length; q += 2) if (keep(edges[q], edges[q + 1])) { cnt[edges[q] + 1]++; cnt[edges[q + 1] + 1]++; }
    for (let k = 0; k < N; k++) cnt[k + 1] += cnt[k];
    const off = cnt, fill = off.slice(0, N), adj = new Uint32Array(off[N]);
    let hidden = 0;
    for (let q = 0; q < edges.length; q += 2) {
      const a = edges[q], b = edges[q + 1];
      if (keep(a, b)) { adj[fill[a]++] = b; adj[fill[b]++] = a; } else hidden++;
    }
    // the best-linked notes get labels first
    const byDeg = Uint32Array.from({ length: N }, (_, k) => k).sort((a, b) => deg[b] - deg[a]).slice(0, 5000);
    // keep the index this model was built from: V is swapped when files change
    const X = { files: V.files, outOff: V.outOff, outTo: V.outTo, backOff: V.backOff, backTo: V.backTo };
    return { N, fileIdx, local, edges, deg, group, folders, colours, off, adj, hidden, byDeg, links: edges.length / 2 - hidden, X };
  }

  function buildGrid() {
    const { N, pos } = M;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let k = 0; k < N; k++) { const x = pos[k * 2], y = pos[k * 2 + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const span = Math.max(maxX - minX, maxY - minY, 1);
    const cell = span / 400;
    const GW = Math.ceil((maxX - minX) / cell) + 1, GH = Math.ceil((maxY - minY) / cell) + 1;
    const start = new Uint32Array(GW * GH + 1);
    const cid = new Uint32Array(N);
    for (let k = 0; k < N; k++) { const c = Math.floor((pos[k * 2 + 1] - minY) / cell) * GW + Math.floor((pos[k * 2] - minX) / cell); cid[k] = c; start[c + 1]++; }
    for (let c = 0; c < GW * GH; c++) start[c + 1] += start[c];
    const f = start.slice(0, GW * GH), items = new Uint32Array(N);
    for (let k = 0; k < N; k++) items[f[cid[k]]++] = k;
    grid = { minX, minY, maxX, maxY, cell, GW, GH, start, items };
    // folder label anchors: the mean position of each folder's notes
    const sx = new Float64Array(M.folders.length), sy = new Float64Array(M.folders.length), sn = new Uint32Array(M.folders.length);
    for (let k = 0; k < N; k++) { const q = M.group[k]; sx[q] += pos[k * 2]; sy[q] += pos[k * 2 + 1]; sn[q]++; }
    M.anchors = M.folders.map((f, q) => ({ f, x: sx[q] / sn[q], y: sy[q] / sn[q], n: sn[q] }));
  }

  // cells overlapping a world rectangle
  function forCells(x0, y0, x1, y1, fn) {
    const { minX, minY, cell, GW, GH } = grid;
    const cx0 = Math.max(0, Math.floor((x0 - minX) / cell)), cy0 = Math.max(0, Math.floor((y0 - minY) / cell));
    const cx1 = Math.min(GW - 1, Math.floor((x1 - minX) / cell)), cy1 = Math.min(GH - 1, Math.floor((y1 - minY) / cell));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) fn(cy * GW + cx);
  }
  function visibleRect(margin = 0) {
    const [x0, y0] = toWorld(-margin, -margin), [x1, y1] = toWorld(W() + margin, H() + margin);
    return [x0, y0, x1, y1];
  }
  function countVisible() {
    let n = 0;
    const [x0, y0, x1, y1] = visibleRect();
    forCells(x0, y0, x1, y1, (c) => { n += grid.start[c + 1] - grid.start[c]; });
    return n;
  }
  function nearest(sx, sy, radiusPx) {
    if (!grid) return -1;
    const [wx, wy] = toWorld(sx, sy);
    const r = radiusPx / view.k;
    let best = -1, bd = r * r;
    forCells(wx - r, wy - r, wx + r, wy + r, (c) => {
      for (let q = grid.start[c]; q < grid.start[c + 1]; q++) {
        const k = grid.items[q];
        if (!opts.orphans && !M.deg[k]) continue;
        const dx = M.pos[k * 2] - wx, dy = M.pos[k * 2 + 1] - wy, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = k; }
      }
    });
    return best;
  }

  // ---------------- overview picture ----------------
  function composeOverview(r) {
    const dark = document.documentElement.dataset.theme === 'dark';
    const bg = rgb(css('--bg') || (dark ? '#0f1422' : '#fcfbf8'));
    const ec = dark ? [150, 155, 165] : [110, 115, 125];
    let mx = 0;
    for (let p = 0; p < r.dens.length; p += 7) if (r.dens[p] > mx) mx = r.dens[p];
    const lm = Math.log1p(Math.min(mx, 400)) || 1;
    const img = new ImageData(r.R, r.R);
    const d = img.data;
    for (let p = 0, n = r.R * r.R; p < n; p++) {
      const a = r.dens[p] ? Math.min(1, Math.log1p(r.dens[p]) / lm) * (dark ? 0.45 : 0.35) : 0;
      let cr = bg[0] + (ec[0] - bg[0]) * a, cg = bg[1] + (ec[1] - bg[1]) * a, cb = bg[2] + (ec[2] - bg[2]) * a;
      const na = r.nodes[p * 4 + 3] / 255;
      if (na) { cr += (r.nodes[p * 4] - cr) * na; cg += (r.nodes[p * 4 + 1] - cg) * na; cb += (r.nodes[p * 4 + 2] - cb) * na; }
      d[p * 4] = cr; d[p * 4 + 1] = cg; d[p * 4 + 2] = cb; d[p * 4 + 3] = 255;
    }
    const c = document.createElement('canvas');
    c.width = r.R; c.height = r.R;
    c.getContext('2d').putImageData(img, 0, 0);
    // smaller copies, so a zoomed-out frame never scales the full picture
    const levels = [c];
    for (let s = r.R / 2; s >= 256; s /= 2) {
      const m = document.createElement('canvas');
      m.width = s; m.height = s;
      const mc = m.getContext('2d');
      mc.imageSmoothingQuality = 'high';
      mc.drawImage(levels[levels.length - 1], 0, 0, s, s);
      levels.push(m);
    }
    return { levels, minX: r.minX, minY: r.minY, scale: r.scale, raw: r };
  }

  // ---------------- drawing ----------------
  // Budget that follows the machine: a frame slower than ~30 ms lowers it,
  // a fast one raises it again. While the user drags or zooms, a lighter
  // frame is drawn; the full one follows 150 ms after the last movement.
  let quality = 1;
  let interacting = false, settleTimer = 0;
  function touch() {
    interacting = true;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { interacting = false; requestDraw(); }, 150);
  }

  // Snapshot of the last full frame. While the user drags or zooms, that
  // picture is only moved and scaled (a single drawImage), whatever the
  // number of notes; the real frame is drawn once the movement stops.
  let snap = null, snapView = null;
  function drawMoving() {
    const w = W(), h = H();
    const s = view.k / snapView.k;
    // where the snapshot's top-left corner lands now
    const wx = (0 - w / 2) / snapView.k + snapView.x, wy = (0 - h / 2) / snapView.k + snapView.y;
    const dx = (wx - view.x) * view.k + w / 2, dy = (wy - view.y) * view.k + h / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = css('--bg') || '#fff';
    ctx.fillRect(0, 0, w, h);
    if (overview && s < 1.001) {
      // zooming out uncovers the edges: fill them from the overview picture
      const o = overview, size = R / o.scale * view.k;
      let pic = o.levels[0];
      for (const l of o.levels) if (l.width >= size) pic = l;
      ctx.globalAlpha = 0.6;
      ctx.drawImage(pic, o.minX * view.k + w / 2 - view.x * view.k, o.minY * view.k + h / 2 - view.y * view.k, size, size);
      ctx.globalAlpha = 1;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(snap, dx, dy, w * s, h * s);
    lastFrame = { ...lastFrame, moving: true };
  }

  function draw() {
    if (!cv || !M || !M.pos) return;
    if (interacting && snap && snapView && snap.width === cv.width && snap.height === cv.height) { drawMoving(); return; }
    const t0 = performance.now();
    const w = W(), h = H(), dpr = dprNow();
    const dark = document.documentElement.dataset.theme === 'dark';
    const bg = css('--bg') || '#fff', fg = css('--text') || '#222', accent = css('--accent') || '#c27a12';
    const pos = M.pos, k = view.k, ox = w / 2 - view.x * k, oy = h / 2 - view.y * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const visible = countVisible();
    const detail = !overview || visible <= DETAIL_MAX;
    const light = 1;
    let drawnLinks = 0, drawnNotes = 0;
    const labelCand = [];

    if (!detail) {
      // one picture for the whole vault, scaled with the view
      const o = overview;
      const dx = o.minX * k + ox, dy = o.minY * k + oy;
      const size = R / o.scale * k;
      let pic = o.levels[0];
      for (const l of o.levels) if (l.width >= size) pic = l;
      ctx.imageSmoothingEnabled = size < R * 1.5;
      if (visible <= MID_MAX) ctx.globalAlpha = 0.45; // links only as a soft background
      ctx.drawImage(pic, dx, dy, size, size);
      ctx.globalAlpha = 1;
      const [x0, y0, x1, y1] = visibleRect();
      if (visible <= MID_MAX) {
        // mid zoom: the picture is magnified past its resolution, so the
        // notes themselves are drawn on top as small crisp squares
        const r = Math.max(1, dpr * 1.2);
        if (hits && hits.length) ctx.globalAlpha = 0.3; // let the matches stand out
        const byGroup = M.folders.map(() => []);
        forCells(x0, y0, x1, y1, (c) => { for (let q = grid.start[c]; q < grid.start[c + 1]; q++) { const n = grid.items[q]; if (opts.orphans || M.deg[n]) byGroup[M.group[n]].push(n); } });
        byGroup.forEach((list, gq) => {
          ctx.fillStyle = M.colours[gq];
          for (const n of list) { ctx.fillRect(pos[n * 2] * k + ox - r, pos[n * 2 + 1] * k + oy - r, r * 2, r * 2); drawnNotes++; }
        });
        ctx.globalAlpha = 1;
      }
      for (const q of M.byDeg) {
        const x = pos[q * 2], y = pos[q * 2 + 1];
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) labelCand.push(q);
        if (labelCand.length > 400) break;
      }
    } else {
      // notes and links in view, within the budget
      const [x0, y0, x1, y1] = visibleRect(20 * dpr);
      const vis = [];
      forCells(x0, y0, x1, y1, (c) => { for (let q = grid.start[c]; q < grid.start[c + 1]; q++) vis.push(grid.items[q]); });
      if (!M.inView || M.inView.length !== M.N) M.inView = new Uint8Array(M.N);
      const inView = M.inView;
      for (const q of vis) inView[q] = 1;
      // best-linked first, so a cut budget drops the least important links
      vis.sort((a, b) => M.deg[b] - M.deg[a]);
      const edgeBudget = Math.max(500, EDGE_BUDGET * quality * light);
      ctx.lineWidth = Math.max(1, dpr * 0.8);
      ctx.strokeStyle = dark ? 'rgba(160,165,175,0.33)' : 'rgba(100,105,115,0.25)';
      ctx.beginPath();
      outer: for (const u of vis) {
        const ux = pos[u * 2] * k + ox, uy = pos[u * 2 + 1] * k + oy;
        for (let q = M.off[u]; q < M.off[u + 1]; q++) {
          const v = M.adj[q];
          if (inView[v] && v < u) continue; // drawn from the other end
          ctx.moveTo(ux, uy); ctx.lineTo(pos[v * 2] * k + ox, pos[v * 2 + 1] * k + oy);
          if (++drawnLinks >= edgeBudget) break outer;
        }
      }
      ctx.stroke();
      for (const q of vis) inView[q] = 0;
      // notes, one colour at a time
      const base = Math.max(1.2 * dpr, Math.min(6 * dpr, k * 0.3));
      const byGroup = M.folders.map(() => []);
      for (const q of vis) if (opts.orphans || M.deg[q]) byGroup[M.group[q]].push(q);
      if (hits && hits.length) ctx.globalAlpha = 0.3;
      byGroup.forEach((list, gq) => {
        if (!list.length) return;
        ctx.fillStyle = M.colours[gq];
        const round = base * 1.5 >= 2.2 && list.length < 4000 && !interacting;
        if (round) ctx.beginPath();
        for (const q of list) {
          const sx = pos[q * 2] * k + ox, sy = pos[q * 2 + 1] * k + oy;
          if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue;
          const r = base * (1 + Math.min(3, Math.sqrt(M.deg[q]) * 0.15));
          if (round) { ctx.moveTo(sx + r, sy); ctx.arc(sx, sy, r, 0, 6.2832); } else ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
          drawnNotes++;
        }
        if (round) ctx.fill();
      });
      ctx.globalAlpha = 1;
      for (let q = 0; q < Math.min(vis.length, 600); q++) labelCand.push(vis[q]);
    }

    // highlighted notes (find / folder), both views
    if (hits && hits.length) {
      const s = Math.max(4 * dpr, Math.min(9 * dpr, k * 0.5));
      ctx.fillStyle = accent; ctx.strokeStyle = bg; ctx.lineWidth = dpr * 1.5;
      for (let q = 0; q < Math.min(hits.length, 50000); q++) {
        const n = hits[q];
        const sx = pos[n * 2] * k + ox, sy = pos[n * 2 + 1] * k + oy;
        if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue;
        ctx.strokeRect(sx - s / 2, sy - s / 2, s, s);
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      }
      labelCand.unshift(...(M.hitsByDeg || []));
    }

    // the hovered and the open note: all their links (hub links too) and a ring
    const focusK = M.focusFile != null ? M.local[M.focusFile] : -1;
    for (const [n, col] of [[focusK, accent], [hovered, fg]]) {
      if (n < 0 || n >= M.N) continue;
      const i = M.fileIdx[n];
      const sx = pos[n * 2] * k + ox, sy = pos[n * 2 + 1] * k + oy;
      ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = dpr;
      ctx.beginPath();
      let c = 0;
      const each = (arr, a, b) => { for (let q = a; q < b && c < 3000; q++) { const t = M.local[arr[q]]; if (t < 0) continue; ctx.moveTo(sx, sy); ctx.lineTo(pos[t * 2] * k + ox, pos[t * 2 + 1] * k + oy); c++; } };
      each(M.X.outTo, M.X.outOff[i], M.X.outOff[i + 1]);
      each(M.X.backTo, M.X.backOff[i], M.X.backOff[i + 1]);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(sx, sy, 7 * dpr, 0, 6.2832); ctx.stroke();
      labelCand.unshift(n);
    }

    // labels: strongest first, none overlapping
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const boxes = [];
    const fits = (b0, b1, b2, b3) => { for (const o of boxes) if (b0 < o[2] && b2 > o[0] && b1 < o[3] && b3 > o[1]) return false; return true; };
    if (!detail && M.anchors) {
      // folder names over their region (semantic zoom)
      for (const a of M.anchors) {
        if (a.n < M.N * 0.002) continue;
        const sx = a.x * k + ox, sy = a.y * k + oy;
        if (sx < 0 || sy < 0 || sx > w || sy > h) continue;
        const size = Math.round((13 + Math.min(10, Math.log2(a.n))) * dpr);
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        const text = `${a.f} (${a.n.toLocaleString()})`;
        const tw = ctx.measureText(text).width;
        if (!fits(sx - tw / 2 - 4, sy - 2, sx + tw / 2 + 4, sy + size + 2)) continue;
        boxes.push([sx - tw / 2 - 4, sy - 2, sx + tw / 2 + 4, sy + size + 2]);
        ctx.lineWidth = 4 * dpr; ctx.strokeStyle = bg; ctx.globalAlpha = 0.9; ctx.strokeText(text, sx, sy);
        ctx.fillStyle = fg; ctx.globalAlpha = 0.85; ctx.fillText(text, sx, sy); ctx.globalAlpha = 1;
      }
    }
    const max = interacting ? 25 : detail ? 140 : 45;
    let shown = 0;
    const seen = new Set();
    for (const n of labelCand) {
      if (shown >= max) break;
      if (seen.has(n) || n < 0 || n >= M.N) continue;
      seen.add(n);
      const strong = n === hovered || n === focusK;
      const sx = pos[n * 2] * k + ox, sy = pos[n * 2 + 1] * k + oy;
      if (sx < -40 || sy < -20 || sx > w + 40 || sy > h + 20) continue;
      const name = Core.stem(M.X.files[M.fileIdx[n]]);
      const label = name.length > 40 ? name.slice(0, 38) + '…' : name;
      ctx.font = `${strong ? 'bold ' : ''}${12 * dpr}px system-ui, sans-serif`;
      // text widths are measured once per note and zoom-independent
      if (!M.labelW || M.labelDpr !== dpr) { M.labelW = new Float32Array(M.N); M.labelDpr = dpr; }
      let tw = M.labelW[n];
      if (!tw || strong) { tw = ctx.measureText(label).width; if (!strong) M.labelW[n] = tw; }
      const b0 = sx - tw / 2 - 2, b1 = sy + 6 * dpr, b2 = sx + tw / 2 + 2, b3 = sy + 22 * dpr;
      if (!strong && !fits(b0, b1, b2, b3)) continue;
      boxes.push([b0, b1, b2, b3]);
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = bg; ctx.strokeText(label, sx, sy + 7 * dpr);
      ctx.fillStyle = strong && n === focusK ? accent : fg; ctx.fillText(label, sx, sy + 7 * dpr);
      shown++;
    }
    const ms = performance.now() - t0;
    if (!interacting && detail) {
      if (ms > 30) quality = Math.max(0.05, quality * 0.6);
      else if (ms < 12 && drawnLinks >= EDGE_BUDGET * quality - 1) quality = Math.min(1, quality * 1.25);
    }
    lastFrame = { ms, detail, visible, drawnLinks, drawnNotes, quality: +quality.toFixed(2), interacting };
    if (!interacting) {
      if (!snap) snap = document.createElement('canvas');
      if (snap.width !== cv.width || snap.height !== cv.height) { snap.width = cv.width; snap.height = cv.height; }
      snap.getContext('2d').drawImage(cv, 0, 0);
      snapView = { ...view };
    }
  }
  let lastFrame = null;

  // ---------------- interaction ----------------
  function wireCanvas() {
    let drag = null, moved = false;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      const dpr = dprNow();
      if (drag) {
        const dx = (e.clientX - drag.x) * dpr, dy = (e.clientY - drag.y) * dpr;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        view.x = drag.vx - dx / view.k; view.y = drag.vy - dy / view.k;
        touch();
        requestDraw();
        return;
      }
      const k = nearest(e.offsetX * dpr, e.offsetY * dpr, 8 * dpr);
      if (k !== hovered) { hovered = k; cv.style.cursor = k >= 0 ? 'pointer' : 'grab'; requestDraw(); }
    });
    cv.addEventListener('pointerup', (e) => {
      const wasDrag = drag && moved;
      drag = null;
      if (!wasDrag && hovered >= 0) openNote(M.X.files[M.fileIdx[hovered]]);
    });
    cv.addEventListener('pointerleave', () => { if (hovered >= 0) { hovered = -1; requestDraw(); } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      touch();
      const dpr = dprNow();
      zoomAt(e.offsetX * dpr, e.offsetY * dpr, Math.pow(1.0018, -e.deltaY));
    }, { passive: false });
    cv.addEventListener('dblclick', (e) => { const dpr = dprNow(); zoomAt(e.offsetX * dpr, e.offsetY * dpr, 2.5); });
  }
  function zoomAt(sx, sy, f) {
    const [wx, wy] = toWorld(sx, sy);
    view.k = Math.max(1e-4, Math.min(400, view.k * f));
    view.x = wx - (sx - W() / 2) / view.k; view.y = wy - (sy - H() / 2) / view.k;
    requestDraw();
  }
  function fitRect(x0, y0, x1, y1, pad = 0.08) {
    const w = Math.max(x1 - x0, 1e-3), h = Math.max(y1 - y0, 1e-3);
    view.x = (x0 + x1) / 2; view.y = (y0 + y1) / 2;
    view.k = Math.min(W() / w, H() / h) * (1 - pad * 2);
    requestDraw();
  }
  function fitAll() { if (grid) fitRect(grid.minX, grid.minY, grid.maxX, grid.maxY, 0.03); }
  function fitNotes(ks) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of ks) { const x = M.pos[k * 2], y = M.pos[k * 2 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (ks.length === 1) { view.x = x0; view.y = y0; view.k = Math.max(view.k, 12); requestDraw(); } else fitRect(x0, y0, x1, y1, 0.12);
  }

  // ---------------- building ----------------
  function info(msg) { g('graphInfo').textContent = msg; }
  function describe(extra = '') {
    if (!M) return;
    const hid = M.hidden ? ` (${M.hidden.toLocaleString()} hub links hidden)` : '';
    info(`${M.N.toLocaleString()} notes · ${M.links.toLocaleString()} links${hid}${extra}`);
  }
  function legend() {
    g('graphLegend').innerHTML = M.folders.slice(0, 12).map((f, q) =>
      `<span class="lg" data-folder="${esc(f)}"><i style="background:${M.colours[q]}"></i>${esc(f)}</span>`).join('')
      + (M.folders.length > 12 ? `<span class="muted small">+${M.folders.length - 12} folders (colours repeat)</span>` : '');
  }

  // whole vault: cached layout + overview picture
  async function buildGlobal(focusFile) {
    const my = ++busy;
    const notes = [];
    for (let i = 0; i < V.files.length; i++) if (Core.MD_EXT.test(V.files[i])) notes.push(i);
    const m = model(notes);
    info('Preparing the map…');
    const res = await window.api.graphLayout({ N: m.N, edges: m.edges, group: m.group, hubCap: opts.hubCap });
    if (my !== busy) return;
    m.pos = res.pos;
    const palette = new Uint8Array(m.folders.length * 3);
    m.colours.forEach((c, q) => palette.set(rgb(c), q * 3));
    const r = await window.api.graphRaster({ pos: m.pos, N: m.N, edges: m.edges, group: m.group, hubCap: opts.hubCap, R, palette });
    if (my !== busy) return;
    hovered = -1; hits = null; snapView = null; M = m; M.kind = 'global'; M.focusFile = focusFile; M.hubCap = opts.hubCap;
    overview = composeOverview(r);
    buildGrid();
    legend();
    fitAll();
    describe(res.cached ? '' : ` · map laid out in ${(res.ms / 1000).toFixed(1)} s`);
    console.log('atlas global', M.N, 'notes; layout', res.cached ? 'from cache' : res.ms + ' ms', res.medianLink);
  }

  // Files changed while the map exists: keep every known note where it is,
  // put new notes next to what they link to, and redraw the overview. A full
  // layout is only redone when a large part of the vault is new.
  async function patchGlobal(focusFile) {
    const my = ++busy;
    const old = M;
    const notes = [];
    for (let i = 0; i < V.files.length; i++) if (Core.MD_EXT.test(V.files[i])) notes.push(i);
    const m = model(notes);
    const where = new Map();
    for (let k = 0; k < old.N; k++) where.set(old.X.files[old.fileIdx[k]], k);
    const pos = new Float32Array(m.N * 2);
    const missing = [];
    for (let k = 0; k < m.N; k++) {
      const o = where.get(V.files[m.fileIdx[k]]);
      if (o === undefined) missing.push(k); else { pos[k * 2] = old.pos[o * 2]; pos[k * 2 + 1] = old.pos[o * 2 + 1]; }
    }
    if (missing.length > m.N * 0.05) return buildGlobal(focusFile);
    const placed = new Uint8Array(m.N).fill(1);
    for (const k of missing) placed[k] = 0;
    const anchor = new Map(old.anchors.map((a) => [a.f, a]));
    const GOLD = Math.PI * (3 - Math.sqrt(5));
    missing.forEach((k, n) => {
      let sx = 0, sy = 0, c = 0;
      const i = m.fileIdx[k];
      const near = (arr, a, b) => { for (let q = a; q < b; q++) { const t = m.local[arr[q]]; if (t >= 0 && placed[t]) { sx += pos[t * 2]; sy += pos[t * 2 + 1]; c++; } } };
      near(V.outTo, V.outOff[i], V.outOff[i + 1]);
      near(V.backTo, V.backOff[i], V.backOff[i + 1]);
      if (!c) { const a = anchor.get(m.folders[m.group[k]]); if (a) { sx = a.x; sy = a.y; c = 1; } }
      const r = 1 + Math.sqrt(n), th = n * GOLD;
      pos[k * 2] = (c ? sx / c : 0) + Math.cos(th) * r; pos[k * 2 + 1] = (c ? sy / c : 0) + Math.sin(th) * r;
      placed[k] = 1;
    });
    m.pos = pos;
    const palette = new Uint8Array(m.folders.length * 3);
    m.colours.forEach((c, q) => palette.set(rgb(c), q * 3));
    const r = await window.api.graphRaster({ pos: m.pos, N: m.N, edges: m.edges, group: m.group, hubCap: opts.hubCap, R, palette });
    if (my !== busy) return;
    hovered = -1; hits = null; snapView = null; M = m; M.kind = 'global'; M.focusFile = focusFile; M.hubCap = opts.hubCap;
    overview = composeOverview(r);
    buildGrid();
    legend();
    describe(missing.length ? ` · ${missing.length} new note${missing.length > 1 ? 's' : ''} placed` : '');
    requestDraw();
    // store it, so the next open finds this map in the cache
    window.api.graphPutLayout({ N: m.N, edges: m.edges, group: m.group, hubCap: opts.hubCap, pos: m.pos }).catch(() => {});
  }

  async function buildLocal(p) {
    const my = ++busy;
    const start = V.idx.get(p);
    if (start === undefined) { info('Open a note to see its neighbourhood'); return; }
    const seen = new Set([start]);
    let level = [start], capped = false;
    for (let d = 0; d < opts.depth; d++) {
      const next = [];
      for (const i of level) {
        const add = (j) => { if (seen.has(j)) return; if (seen.size >= LOCAL_MAX) { capped = true; return; } seen.add(j); next.push(j); };
        for (let q = V.outOff[i]; q < V.outOff[i + 1]; q++) add(V.outTo[q]);
        for (let q = V.backOff[i]; q < V.backOff[i + 1]; q++) add(V.backTo[q]);
      }
      level = next;
    }
    const saved = opts.hubCap;
    opts.hubCap = 0; // a neighbourhood shows every link
    const m = model([...seen]);
    opts.hubCap = saved;
    const res = await window.api.graphLayout({ N: m.N, edges: m.edges, group: m.group, hubCap: 0, noCache: true });
    if (my !== busy) return;
    m.pos = res.pos;
    hovered = -1; hits = null; snapView = null; M = m; M.kind = 'local'; M.focusFile = start;
    overview = null;
    buildGrid();
    legend();
    fitAll();
    describe(capped ? ` · limited to ${LOCAL_MAX.toLocaleString()} neighbours` : '');
  }

  // ---------------- public ----------------
  let stale = true, mode = 'global';
  return {
    get frame() { return lastFrame; },
    get view() { return { ...view }; },
    async show(m, focusPath, o) {
      opts = { ...opts, ...o };
      mode = m;
      ensureCanvas();
      const focusFile = focusPath != null && V.idx.has(focusPath) ? V.idx.get(focusPath) : null;
      try {
        if (mode === 'global') {
          if (stale && M && M.kind === 'global' && M.hubCap === opts.hubCap) { stale = false; await patchGlobal(focusFile); }
          else if (stale || !M || M.kind !== 'global') { stale = false; await buildGlobal(focusFile); }
          else { M.focusFile = focusFile; requestDraw(); }
          const k = focusFile != null && M ? M.local[focusFile] : -1;
          if (k >= 0 && o && o.zoomToFocus) fitNotes([k]);
        } else {
          stale = true;
          await buildLocal(focusPath);
        }
      } catch (e) {
        console.error(e);
        info('Map unavailable: ' + e.message);
      }
    },
    hide() {},
    destroy() { busy++; M = null; overview = null; grid = null; hits = null; if (cv) cv.remove(); cv = null; stale = true; },
    invalidate() { stale = true; },
    find(q) {
      if (!M) return;
      q = q.trim().toLowerCase();
      if (!q) { hits = null; describe(); requestDraw(); return; }
      const out = [];
      for (let k = 0; k < M.N; k++) if (Core.stem(M.X.files[M.fileIdx[k]]).toLowerCase().includes(q)) out.push(k);
      hits = out;
      M.hitsByDeg = out.slice().sort((a, b) => M.deg[b] - M.deg[a]).slice(0, 200);
      describe(` · ${out.length.toLocaleString()} match`);
      if (out.length) fitNotes(out); else requestDraw();
    },
    highlightFolder(f) {
      if (!M) return;
      const q = M.folders.indexOf(f);
      hits = [];
      for (let k = 0; k < M.N; k++) if (M.group[k] === q) hits.push(k);
      M.hitsByDeg = hits.slice().sort((a, b) => M.deg[b] - M.deg[a]).slice(0, 200);
      describe(` · ${f}: ${hits.length.toLocaleString()} notes`);
      requestDraw();
    },
    fit() { fitAll(); },
    redraw() { if (overview) overview = composeOverview(overview.raw); requestDraw(); },
  };
})();
