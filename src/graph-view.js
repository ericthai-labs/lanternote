// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Lanternote — graph view: toolbar + choice of engine.
//   Map (atlas.js, default) — fixed layout computed once and cached, drawn
//     with Canvas 2D by level of detail; runs on any PC, idle costs nothing.
//   Live (graph.js)          — cosmos.gl force layout on the GPU; lively, but
//     needs a real graphics card (0.5 fps on a PC without one).
'use strict';

const Graph = (() => {
  const g = (id) => document.getElementById(id);
  const state = { mode: 'global', depth: 1, orphans: true, hubCap: 1000, engine: 'map' };
  let active = null;
  const engine = () => (state.engine === 'gpu' ? GpuGraph : Atlas);
  const opts = (extra) => ({ depth: state.depth, orphans: state.orphans, hubCap: state.hubCap, ...extra });

  function sync() {
    const gpu = state.engine === 'gpu';
    g('graphRun').hidden = !gpu;
    g('graphLabels').hidden = !gpu;
    g('graphEngine').value = state.engine;
    g('graphDepth').disabled = state.mode !== 'local';
    g('graphHubs').disabled = state.mode !== 'global';
    document.querySelectorAll('[data-gmode]').forEach((b) => b.classList.toggle('on', b.dataset.gmode === state.mode));
  }

  async function show(mode, focusPath, extra) {
    if (mode) state.mode = mode;
    const e = engine();
    if (active && active !== e) active.destroy();
    active = e;
    sync();
    await e.show(state.mode, focusPath, opts(extra));
  }

  function rebuild() { Atlas.invalidate(); GpuGraph.invalidate(); if (view === 'graph') show(state.mode, current); }

  function wire() {
    state.engine = Prefs.get('graphEngine'); state.hubCap = +Prefs.get('hubCap'); g('graphHubs').value = String(state.hubCap); sync();
    document.querySelectorAll('[data-gmode]').forEach((b) => { b.onclick = () => show(b.dataset.gmode, current); });
    g('graphEngine').onchange = () => {
      Prefs.set('graphEngine', g('graphEngine').value); // → settingsChanged
    };
    g('graphDepth').onchange = () => { state.depth = +g('graphDepth').value; show('local', current); };
    g('graphHubs').onchange = () => Prefs.set('hubCap', g('graphHubs').value);
    g('graphOrphans').onchange = () => { state.orphans = g('graphOrphans').checked; rebuild(); };
    g('graphRun').onclick = () => GpuGraph.toggleRun();
    g('graphFit').onclick = () => active && active.fit();
    let fT; g('graphFind').oninput = () => { clearTimeout(fT); fT = setTimeout(() => active && active.find(g('graphFind').value), 200); };
    g('graphLegend').onclick = (e) => { const s = e.target.closest('[data-folder]'); if (s && active) active.highlightFolder(s.dataset.folder); };
  }

  return {
    get mode() { return state.mode; },
    get engine() { return state.engine; },
    show: (mode, focusPath) => show(mode, focusPath, { zoomToFocus: true }),
    hide() { if (active) active.hide(); },
    wire,
    invalidate() { Atlas.invalidate(); GpuGraph.invalidate(); if (view === 'graph') show(state.mode, current); },
    settingsChanged() {
      const e = Prefs.get('graphEngine'), h = +Prefs.get('hubCap');
      const changed = e !== state.engine || h !== state.hubCap;
      state.engine = e; state.hubCap = h; g('graphHubs').value = String(h); sync();
      if (changed) rebuild();
    },
    themeChanged() { if (active === Atlas) Atlas.redraw(); else if (active === GpuGraph && view === 'graph') { GpuGraph.invalidate(); show(state.mode, current); } },
    _g: () => GpuGraph._g(), _d: () => GpuGraph._d(), // for the test driver
  };
})();
