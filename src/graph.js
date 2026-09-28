// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Lanternote — "Live (GPU)" graph engine. The default engine is the map
// (atlas.js); this one runs a live force layout and needs a real GPU.
// Drawn with cosmos.gl: the force layout and the drawing both run on the GPU
// (WebGL 2 shaders), which is what lets a 200,000-note / 2,500,000-link vault
// stay interactive — CPU layouts (d3-force, ForceAtlas2) top out around
// 10–50k nodes. The library (~700 KB) is loaded the first time the graph opens.
//
// Two modes:
//   global — every note; colour = top-level folder, size = number of links
//   local  — the open note and its neighbours up to N steps away
// Reads the window's index (V, from app.js) and never touches the disk.
'use strict';

const GpuGraph = (() => {
  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#86bcb6', '#d37295'];
  const LOCAL_MAX = 3000;       // cap for the neighbourhood view
  const LABELS_MAX = 250;

  let lib = null;               // Promise<Cosmos>
  let graph = null;             // cosmos Graph instance
  let data = null;              // { nodes: file indices, pos, colours, ... } of what is on screen
  let stale = true;             // index changed since the global graph was built
  let running = false;
  let ended = false;            // the layout cooled down by itself
  let hovered = -1;
  let labelTimer = 0;
  // hubCap: links touching a note with more links than this are left out of
  // the global graph. The GPU layout loops over each point's links inside one
  // shader invocation, so a hub with 72,000 links stalls every frame (measured:
  // 19 fps with all 2.49M links, 119 fps without the links of 185 hubs).
  const state = { mode: 'global', depth: 1, orphans: true, focus: null, hubCap: 1000 };

  function load() {
    if (!lib) lib = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/cosmos.min.js';
      s.onload = () => (window.Cosmos ? res(window.Cosmos) : rej(new Error('graph library did not load')));
      s.onerror = () => rej(new Error('graph library missing (run npm install)'));
      document.head.appendChild(s);
    });
    return lib;
  }

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function hexRgba(hex, a = 1) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
  }

  // ---------------- data ----------------
  function topFolder(p) { const i = p.indexOf('/'); return i < 0 ? '(root)' : p.slice(0, i); }

  // Build point/link arrays for a list of file indices (the nodes) using the
  // window's CSR adjacency. `nodes` must be note indices into V.files.
  function build(nodes, hubCap = 0) {
    const n = nodes.length;
    const local = new Int32Array(V.files.length).fill(-1);
    for (let k = 0; k < n; k++) local[nodes[k]] = k;
    const links = [];
    const deg = new Uint32Array(n);
    for (let k = 0; k < n; k++) {
      const i = nodes[k];
      for (let e = V.outOff[i]; e < V.outOff[i + 1]; e++) {
        const t = local[V.outTo[e]];
        if (t >= 0) { links.push(k, t); deg[k]++; deg[t]++; }
      }
    }
    // colour by top-level folder, biggest folders get the first colours
    const count = new Map();
    for (const i of nodes) { const f = topFolder(V.files[i]); count.set(f, (count.get(f) || 0) + 1); }
    const folders = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
    const colourOf = new Map(folders.map((f, k) => [f, PALETTE[k % PALETTE.length]]));
    const colours = new Float32Array(n * 4);
    const sizes = new Float32Array(n);
    const pos = new Float32Array(n * 2);
    const angle = new Map(folders.map((f, k) => [f, (k / folders.length) * Math.PI * 2]));
    for (let k = 0; k < n; k++) {
      const f = topFolder(V.files[nodes[k]]);
      colours.set(hexRgba(colourOf.get(f)), k * 4);
      sizes[k] = 2 + Math.min(18, Math.sqrt(deg[k]) * 1.2);
      // seed each folder in its own sector so the layout starts close to its end state
      const a = angle.get(f) + (Math.random() - 0.5) * (Math.PI * 2 / Math.max(3, folders.length));
      const r = 0.15 + Math.random() * 0.3;
      pos[k * 2] = 0.5 + Math.cos(a) * r;
      pos[k * 2 + 1] = 0.5 + Math.sin(a) * r;
    }
    let shown = links, hidden = 0;
    if (hubCap > 0) {
      shown = [];
      for (let e = 0; e < links.length; e += 2) {
        if (deg[links[e]] > hubCap || deg[links[e + 1]] > hubCap) hidden++;
        else shown.push(links[e], links[e + 1]);
      }
    }
    return { nodes, local, links: Float32Array.from(shown), hiddenLinks: hidden, colours, sizes, pos, deg, folders, colourOf };
  }

  function globalNodes() {
    const out = [];
    for (let i = 0; i < V.files.length; i++) {
      if (!Core.MD_EXT.test(V.files[i])) continue;
      if (!state.orphans && V.outOff[i + 1] === V.outOff[i] && V.backOff[i + 1] === V.backOff[i]) continue;
      out.push(i);
    }
    return out;
  }

  // breadth-first over links in both directions
  function localNodes(p, depth) {
    const start = V.idx.get(p);
    if (start === undefined) return [];
    state.capped = false;
    const seen = new Set([start]);
    let level = [start];
    for (let d = 0; d < depth && seen.size < LOCAL_MAX; d++) {
      const next = [];
      for (const i of level) {
        const add = (j) => { if (seen.has(j)) return; if (seen.size >= LOCAL_MAX) { state.capped = true; return; } seen.add(j); next.push(j); };
        for (let e = V.outOff[i]; e < V.outOff[i + 1]; e++) add(V.outTo[e]);
        for (let e = V.backOff[i]; e < V.backOff[i + 1]; e++) add(V.backTo[e]);
      }
      level = next;
    }
    return [...seen];
  }

  // ---------------- drawing ----------------
  function config(n, links) {
    const dark = document.documentElement.dataset.theme === 'dark';
    const big = n > 20000;
    return {
      backgroundColor: css('--bg') || (dark ? '#0f1422' : '#fcfbf8'),
      spaceSize: big ? 8192 : 4096,
      pointDefaultSize: 3,
      pointSizeScale: big ? 0.6 : 1,
      scalePointsOnZoom: true,
      pointGreyoutOpacity: 0.08,
      linkDefaultColor: dark ? '#8a8a8a' : '#9aa0a6',
      linkDefaultWidth: big ? 0.4 : 1,
      linkOpacity: big ? 0.25 : 0.6,
      linkGreyoutOpacity: 0.02,
      linkVisibilityDistanceRange: big ? [30, 300] : [50, 150],
      linkVisibilityMinTransparency: big ? 0.05 : 0.25,
      linkDefaultArrows: n < 400,
      curvedLinks: false,
      renderHoveredPointRing: true,
      hoveredPointRingColor: dark ? '#ffffff' : '#000000',
      focusedPointRingColor: css('--accent') || '#7c5cff',
      simulationGravity: big ? 0.2 : 0.25,
      simulationRepulsion: big ? 0.6 : 1,
      simulationLinkSpring: big ? 0.6 : 1,
      simulationLinkDistance: big ? 8 : 12,
      simulationFriction: 0.85,
      simulationDecay: big ? 4000 : 3000,
      enableDrag: !big,
      fitViewOnInit: true,
      fitViewDelay: big ? 2500 : 800,
      pointSamplingDistance: 140,
      attribution: '',
      onPointClick: (k) => { const p = V.files[data.nodes[k]]; openNote(p); },
      onPointMouseOver: (k, _pos, ev) => { hovered = k; hoverAt = ev && ev.offsetX != null ? [ev.offsetX, ev.offsetY] : null; drawLabels(); },
      onPointMouseOut: () => { hovered = -1; hoverAt = null; drawLabels(); },
      onSimulationStart: () => { running = true; ended = false; syncButtons(); },
      onSimulationEnd: () => { running = false; ended = true; syncButtons(); drawLabels(); },
      onSimulationPause: () => { running = false; syncButtons(); scheduleLabels(); },
      onSimulationUnpause: () => { running = true; syncButtons(); },
      onSimulationTick: () => { if (!heavy()) scheduleLabels(); },
      onZoom: () => scheduleLabels(),
      onZoomEnd: () => drawLabels(),
    };
  }

  async function draw(d) {
    const C = await load();
    const box = g('graphCanvas');
    if (graph) { try { graph.destroy(); } catch { /* already gone */ } graph = null; box.innerHTML = ''; }
    data = d;
    hitLabels = []; hovered = -1; hoverAt = null;
    const n = d.nodes.length;
    graph = new C.Graph(box, config(n, d.links.length / 2));
    // positions are given in 0..1; scale them to the simulation space
    const space = graph.config.spaceSize;
    const pos = d.pos.map((v) => v * space);
    graph.setPointPositions(pos);
    graph.setPointColors(d.colours);
    graph.setPointSizes(d.sizes);
    graph.setLinks(d.links);
    graph.render(1);
    running = true; ended = false; syncButtons();
    if (state.focus != null) {
      const k = d.local[state.focus];
      if (k >= 0) { graph.setConfigPartial({ focusedPointIndex: k }); }
    }
    retrack();
    legend(d);
    info();
  }

  // ---------------- labels ----------------
  // Reading point positions back from the GPU (getPointPositions, sampled or
  // tracked maps) is a synchronous readPixels: while the layout runs it waits
  // for the simulation step, ~250 ms per read on 190k points / 2.5M links.
  // So on a big graph with the layout running, nothing is read back: only the
  // hovered note is labelled, at the mouse. Full labels come back when the
  // layout pauses or cools down.
  const BIG = 20000;
  let hitLabels = [];
  let hoverAt = null;              // [x, y] mouse position of the hovered point
  const heavy = () => running && data && data.nodes.length > BIG;
  const focusK = () => (state.focus != null && data ? data.local[state.focus] : -1);
  function retrack() {
    if (!graph || !data) return;
    const k = focusK();
    graph.trackPointPositionsByIndices(k >= 0 ? [...new Set([k, ...hitLabels])] : hitLabels);
  }
  function trackHits(hits) {
    hitLabels = hits.slice().sort((a, b) => data.deg[b] - data.deg[a]).slice(0, LABELS_MAX);
    retrack();
    setTimeout(drawLabels, 50);
  }
  function scheduleLabels() {
    if (labelTimer) return;
    labelTimer = setTimeout(() => { labelTimer = 0; drawLabels(); }, 120);
  }
  function drawLabels() {
    const cv = g('graphLabels');
    const box = g('graphCanvas');
    const dpr = window.devicePixelRatio || 1;
    const w = box.clientWidth, h = box.clientHeight;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (!graph || !data) return;
    const font = css('--font') || 'system-ui, sans-serif';
    const fg = css('--text') || '#222';
    const bg = css('--bg') || '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    const text = (k, sx, sy, strong) => {
      const name = Core.stem(V.files[data.nodes[k]]);
      const label = name.length > 40 ? name.slice(0, 38) + '…' : name;
      c.font = (strong ? 'bold ' : '') + '12px ' + font;
      c.lineWidth = 3; c.strokeStyle = bg; c.strokeText(label, sx, sy);
      c.fillStyle = fg; c.fillText(label, sx, sy);
      return c.measureText(label).width;
    };
    if (heavy()) {
      if (hovered >= 0 && hoverAt) text(hovered, hoverAt[0], hoverAt[1] + 12, true);
      return;
    }
    const n = data.nodes.length;
    const want = new Map();
    if (n <= 300) {
      // small graphs: every point gets a name
      const pts = graph.getPointPositions();
      for (let k = 0; k < n; k++) want.set(k, [pts[k * 2], pts[k * 2 + 1]]);
    } else {
      for (const [k, xy] of graph.getTrackedPointPositionsMap()) want.set(k, xy);
      if (!hitLabels.length) {
        let added = 0;
        for (const [k, xy] of graph.getSampledPointPositionsMap()) { if (!want.has(k)) { want.set(k, xy); if (++added >= LABELS_MAX) break; } }
      }
    }
    // hovered / focused first, then the best-linked; skip any label that
    // would overlap one already drawn
    const strongK = new Set([hovered, focusK()]);
    const order = [...want.keys()].sort((a, b) => (strongK.has(b) - strongK.has(a)) || data.deg[b] - data.deg[a]);
    const boxes = [];
    c.font = '12px ' + font;
    for (const k of order) {
      const [x, y] = want.get(k);
      const [sx, sy] = graph.spaceToScreenPosition([x, y]);
      if (sx < -50 || sy < -20 || sx > w + 50 || sy > h + 20) continue;
      const r = graph.spaceToScreenRadius(graph.getPointRadiusByIndex(k) || 2);
      const strong = strongK.has(k);
      const name = Core.stem(V.files[data.nodes[k]]);
      const tw = c.measureText(name.length > 40 ? name.slice(0, 38) + '…' : name).width;
      const bx = sx - tw / 2 - 2, by = sy + r + 2;
      if (!strong && boxes.some((b) => bx < b[2] && bx + tw + 4 > b[0] && by < b[3] && by + 16 > b[1])) continue;
      boxes.push([bx, by, bx + tw + 4, by + 16]);
      text(k, sx, sy + r + 3, strong);
      c.font = '12px ' + font;
    }
    // the hovered point may be outside the tracked/sampled set
    if (hovered >= 0 && !want.has(hovered) && hoverAt) text(hovered, hoverAt[0], hoverAt[1] + 12, true);
  }

  // ---------------- chrome ----------------
  function legend(d) {
    g('graphLegend').innerHTML = d.folders.slice(0, 12).map((f) =>
      `<span class="lg" data-folder="${esc(f)}"><i style="background:${d.colourOf.get(f)}"></i>${esc(f)}</span>`).join('')
      + (d.folders.length > 12 ? `<span class="muted small">+${d.folders.length - 12} folders (colours repeat)</span>` : '');
  }
  function info(extra = '') {
    if (!data) return;
    const hid = data.hiddenLinks ? ` (${data.hiddenLinks.toLocaleString()} hub links hidden)` : '';
    g('graphInfo').textContent = `${data.nodes.length.toLocaleString()} notes · ${(data.links.length / 2).toLocaleString()} links${hid}${extra}`;
    g('graphInfo').title = data.nodes.length > BIG ? 'Names appear when the layout pauses or settles' : '';
  }
  function syncButtons() {
    g('graphRun').textContent = running ? 'Pause' : 'Resume';
    g('graphDepth').disabled = state.mode !== 'local';
    g('graphHubs').disabled = state.mode !== 'global';
    document.querySelectorAll('[data-gmode]').forEach((b) => b.classList.toggle('on', b.dataset.gmode === state.mode));
  }

  // The layout keeps moving points while it runs, so a zoom aimed at a point
  // would miss it: freeze the layout first (Resume starts it again).
  function hold() { if (graph && running) graph.pause(); running = false; syncButtons(); scheduleLabels(); }

  // highlight notes whose name contains the text, and zoom to them
  function find(q) {
    if (!graph || !data) return;
    q = q.trim().toLowerCase();
    if (!q) { graph.setConfigPartial({ highlightedPointIndices: undefined }); trackHits([]); info(); return; }
    const hits = [];
    for (let k = 0; k < data.nodes.length; k++) if (Core.stem(V.files[data.nodes[k]]).toLowerCase().includes(q)) hits.push(k);
    graph.setConfigPartial({ highlightedPointIndices: hits.length ? hits : [] });
    trackHits(hits);
    info(` · ${hits.length.toLocaleString()} match`);
    if (!hits.length) return;
    hold();
    if (hits.length === 1) graph.zoomToPointByIndex(hits[0], 600, 6, true, false);
    else if (hits.length < 5000) graph.fitViewByPointIndices(hits, 600, 0.2, false);
  }

  function highlightFolder(f) {
    if (!graph || !data) return;
    const hits = [];
    for (let k = 0; k < data.nodes.length; k++) if (topFolder(V.files[data.nodes[k]]) === f) hits.push(k);
    graph.setConfigPartial({ highlightedPointIndices: hits });
    trackHits(hits);
    info(` · ${f}: ${hits.length.toLocaleString()} notes`);
  }

  // ---------------- public ----------------
  let building = null;
  async function show(mode, focusPath) {
    state.mode = mode || state.mode;
    state.focus = focusPath != null && V.idx.has(focusPath) ? V.idx.get(focusPath) : null;
    syncButtons();
    const t0 = performance.now();
    try {
      if (state.mode === 'global') {
        if (!stale && data && data.kind === 'global' && graph) {
          const k = state.focus != null ? data.local[state.focus] : -1;
          graph.setConfigPartial({ focusedPointIndex: k >= 0 ? k : undefined });
          retrack();
          if (k >= 0) { hold(); graph.zoomToPointByIndex(k, 700, 4, true, false); }
          drawLabels();
          return;
        }
        g('graphInfo').textContent = 'Building graph…';
        await new Promise((r) => setTimeout(r, 20)); // let the text paint
        const d = build(globalNodes(), state.hubCap);
        d.kind = 'global';
        stale = false;
        building = draw(d);
        await building;
      } else {
        if (state.focus == null) { g('graphInfo').textContent = 'Open a note to see its neighbourhood'; return; }
        const d = build(localNodes(V.files[state.focus], state.depth));
        d.kind = 'local';
        // put the centre note in the middle
        const k = d.local[state.focus];
        if (k >= 0) { d.pos[k * 2] = 0.5; d.pos[k * 2 + 1] = 0.5; }
        stale = true; // the global graph has to be rebuilt after this
        await draw(d);
        if (state.capped) info(` · limited to the first ${LOCAL_MAX.toLocaleString()} neighbours`);
      }
      console.log('graph', state.mode, data.nodes.length, 'nodes in', Math.round(performance.now() - t0), 'ms');
    } catch (e) {
      console.error(e);
      g('graphInfo').textContent = 'Graph unavailable: ' + e.message + ' (needs WebGL 2)';
    }
  }

  function hide() {
    if (graph) graph.pause();
  }

  let observed = false;
  function destroy() {
    building = null;
    if (graph) { try { graph.destroy(); } catch { /* gone */ } }
    graph = null; data = null; stale = true; running = false;
    g('graphCanvas').innerHTML = '';
    const cv = g('graphLabels'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }

  return {
    get mode() { return state.mode; },
    _g: () => graph, _d: () => data, // for the test driver
    hide, destroy, find, highlightFolder,
    // o: { depth, orphans, hubCap } from the toolbar
    show(mode, focusPath, o = {}) {
      if (!observed) { observed = true; new ResizeObserver(() => drawLabels()).observe(g('graphCanvas')); }
      if (o.hubCap !== undefined && o.hubCap !== state.hubCap) stale = true;
      if (o.orphans !== undefined && o.orphans !== state.orphans) stale = true;
      Object.assign(state, { depth: o.depth ?? state.depth, orphans: o.orphans ?? state.orphans, hubCap: o.hubCap ?? state.hubCap });
      return show(mode, focusPath);
    },
    fit() { if (graph) graph.fitView(500); },
    toggleRun() { if (!graph) return; if (running) hold(); else { if (ended) graph.start(0.3); else graph.unpause(); running = true; ended = false; syncButtons(); } },
    invalidate() { stale = true; },
  };
})();
