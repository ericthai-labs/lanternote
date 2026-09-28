// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Lanternote — image viewer.
// Full-window viewer for pictures in the vault: opened by clicking an image
// in a note (← → move through that note's images) or an image file in the
// file list / quick open (← → move through the images of its folder).
//   wheel = zoom at the pointer · drag = move · double-click = fit ⇄ 100 %
//   + − 0 1 R keys, Esc closes.
'use strict';

const Viewer = (() => {
  const g = (id) => document.getElementById(id);
  let list = [];              // [{ src, path, name }]
  let at = 0;
  let scale = 1, fitScale = 1, rot = 0, x = 0, y = 0;
  let nat = { w: 0, h: 0 };
  let drag = null;

  const img = () => g('viewImg');
  function layout() {
    const box = g('viewStage').getBoundingClientRect();
    img().style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`;
    g('viewZoom').textContent = Math.round(scale * 100) + '%';
    void box;
  }
  // scale that shows the whole picture (never enlarges small ones)
  function fit() {
    const box = g('viewStage').getBoundingClientRect();
    const turned = rot % 180 !== 0;
    const w = turned ? nat.h : nat.w, h = turned ? nat.w : nat.h;
    fitScale = Math.min(1, (box.width - 40) / (w || 1), (box.height - 40) / (h || 1));
    scale = fitScale; x = 0; y = 0;
    layout();
  }
  function zoomAt(f, cx, cy) {
    const box = g('viewStage').getBoundingClientRect();
    const ns = Math.max(0.02, Math.min(40, scale * f));
    // keep the point under the pointer where it is
    const px = (cx ?? box.left + box.width / 2) - (box.left + box.width / 2);
    const py = (cy ?? box.top + box.height / 2) - (box.top + box.height / 2);
    x = px - (px - x) * (ns / scale);
    y = py - (py - y) * (ns / scale);
    scale = ns;
    layout();
  }
  const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B');

  async function show(i) {
    at = (i + list.length) % list.length;
    const it = list[at];
    rot = 0;
    g('viewName').textContent = it.name;
    g('viewCount').textContent = list.length > 1 ? `${at + 1} / ${list.length}` : '';
    g('viewPrev').disabled = g('viewNext').disabled = list.length < 2;
    g('viewReveal').hidden = g('viewOpen').hidden = !it.path;
    g('viewInfo').textContent = '';
    const el = img();
    el.style.opacity = '0';
    el.onload = async () => {
      nat = { w: el.naturalWidth, h: el.naturalHeight };
      fit();
      el.style.opacity = '1';
      let size = '';
      if (it.path) { try { const st = await window.api.fileStat(it.path); size = ' · ' + fmtSize(st.size); } catch { /* ignore */ } }
      if (list[at] === it) g('viewInfo').textContent = (nat.w ? `${nat.w} × ${nat.h}` : '') + size;
    };
    el.onerror = () => { g('viewInfo').textContent = 'Could not load this image'; el.style.opacity = '1'; };
    el.src = it.src;
  }

  function open(items, index = 0) {
    if (!items.length) return;
    list = items;
    g('viewer').hidden = false;
    show(index);
  }
  function close() { g('viewer').hidden = true; img().removeAttribute('src'); }
  const isOpen = () => !g('viewer').hidden;

  // ---- entry points ----
  const item = (p) => ({ src: vaultUrl(p), path: p, name: baseOf(p) });
  // an image file of the vault: browse the images of its folder
  function openFile(p) {
    const d = dirOf(p);
    const same = V.images.filter((q) => dirOf(q) === d).sort((a, b) => cmpName(baseOf(a), baseOf(b)));
    open(same.map(item), Math.max(0, same.indexOf(p)));
  }
  // an image inside the open note: browse that note's images
  function openFromNote(el) {
    const imgs = [...g('note').querySelectorAll('img')].filter((i) => i.naturalWidth || i.getAttribute('data-vault-src') || i.src);
    const items = imgs.map((i) => {
      const p = i.getAttribute('data-vault-src');
      return p ? item(p) : { src: i.src, path: null, name: i.alt || i.src.split('/').pop() };
    });
    open(items, Math.max(0, imgs.indexOf(el)));
  }

  // ---- wiring ----
  g('viewClose').onclick = close;
  g('viewPrev').onclick = () => show(at - 1);
  g('viewNext').onclick = () => show(at + 1);
  g('viewFit').onclick = fit;
  g('view100').onclick = () => { scale = 1; x = 0; y = 0; layout(); };
  g('viewIn').onclick = () => zoomAt(1.25);
  g('viewOut').onclick = () => zoomAt(0.8);
  g('viewRot').onclick = () => { rot = (rot + 90) % 360; fit(); };
  g('viewReveal').onclick = () => { const it = list[at]; if (it.path) window.api.reveal(it.path); };
  g('viewOpen').onclick = () => { const it = list[at]; if (it.path) window.api.openWithDefault(it.path); };
  const stage = g('viewStage');
  stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.pow(1.0015, -e.deltaY), e.clientX, e.clientY); }, { passive: false });
  stage.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; drag = { sx: e.clientX, sy: e.clientY, x, y }; stage.setPointerCapture(e.pointerId); stage.classList.add('dragging'); });
  stage.addEventListener('pointermove', (e) => { if (!drag) return; x = drag.x + e.clientX - drag.sx; y = drag.y + e.clientY - drag.sy; layout(); });
  stage.addEventListener('pointerup', () => { drag = null; stage.classList.remove('dragging'); });
  stage.addEventListener('dblclick', (e) => { if (Math.abs(scale - fitScale) < 0.01) zoomAt(1 / scale, e.clientX, e.clientY); else fit(); });
  g('viewer').addEventListener('click', (e) => { if (e.target === g('viewer')) close(); });
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    const k = e.key;
    if (k === 'Escape') close();
    else if (k === 'ArrowLeft') show(at - 1);
    else if (k === 'ArrowRight') show(at + 1);
    else if (k === '+' || k === '=') zoomAt(1.25);
    else if (k === '-') zoomAt(0.8);
    else if (k === '0') fit();
    else if (k === '1') { scale = 1; x = 0; y = 0; layout(); }
    else if (k.toLowerCase() === 'r') { rot = (rot + 90) % 360; fit(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  window.addEventListener('resize', () => { if (isOpen()) fit(); });

  return { openFile, openFromNote, close, isOpen };
})();
