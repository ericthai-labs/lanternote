// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — link preview on hover.
// Resting the pointer on a link to a note shows that note (or the heading /
// block the link points to) in a small card; the card can be scrolled and its
// links clicked. In the editor, hold Ctrl while pointing. Settings → Editor →
// "Preview links on hover" turns it off. Uses the renderer of app.js.
'use strict';

const Hover = (() => {
  const SHOW_MS = 350, HIDE_MS = 250;
  let card = null, timer = null, hideTimer = null, anchor = null, seq = 0;

  function el() {
    if (card) return card;
    card = document.createElement('div');
    card.className = 'hover-card';
    card.hidden = true;
    card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    card.addEventListener('mouseleave', () => scheduleHide());
    document.body.appendChild(card);
    return card;
  }
  const enabled = () => Prefs.get('hoverPreview') !== false;

  // what a hovered element points to: { p, sub } or { missing }
  function targetOf(a) {
    if (a.matches('a.internal')) {
      if (a.dataset.missing != null) return { missing: a.dataset.missing };
      return a.dataset.path ? { p: a.dataset.path, sub: a.dataset.sub || '' } : null;
    }
    if (a.matches('.cm-lp-link')) {
      const from = a.closest('#split') ? Split.path : current;
      let file, sub = '';
      if (a.dataset.target != null) ({ file, sub } = linkTarget(a.dataset.target));
      else {
        const href = a.dataset.href || '';
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null; // web and file: links
        const [f, s2 = ''] = href.split('#'); file = safeDecode(f); sub = safeDecode(s2);
      }
      const p = file ? resolve(file, from) : from;
      return p ? { p, sub } : { missing: file };
    }
    return null;
  }

  function place(a) {
    const r = a.getBoundingClientRect(), c = card.getBoundingClientRect();
    const W = innerWidth, H = innerHeight, gap = 6;
    let top = r.bottom + gap;
    if (top + c.height > H - 8 && r.top - gap - c.height > 8) top = r.top - gap - c.height;
    top = Math.max(8, Math.min(top, H - c.height - 8));
    const left = Math.max(8, Math.min(r.left, W - c.width - 8));
    card.style.top = top + 'px'; card.style.left = left + 'px';
  }

  async function show(a) {
    const t = targetOf(a);
    if (!t) return;
    const my = ++seq;
    const box = el();
    if (t.missing != null) {
      box.innerHTML = `<div class="hover-head"><span class="hover-title">${esc(t.missing)}</span></div><div class="hover-body muted small">This note does not exist yet — click the link to create it.</div>`;
    } else if (IMG_EXT.test(t.p)) {
      box.innerHTML = `<div class="hover-head"><span class="hover-title">${esc(baseOf(t.p))}</span></div><div class="hover-body"><img class="hover-img" alt=""></div>`;
      box.querySelector('img').src = vaultUrl(t.p);
    } else if (isNote(t.p)) {
      try { await ensureLoaded(t.p); } catch { return; }
      if (my !== seq || anchor !== a) return;
      if (!V.text.has(t.p)) return;
      box.innerHTML = sanitize(`<div class="hover-head"><a class="internal hover-title" data-path="${esc(t.p)}" data-sub="${esc(t.sub)}">${esc(stem(t.p))}${t.sub ? ' › ' + esc(t.sub.replace(/^\^/, '^')) : ''}</a><span class="hover-path">${esc(dirOf(t.p))}</span></div>`
        + `<div class="hover-body note">${renderMarkdown(t.p, 1, t.sub)}</div>`);
      const body = box.querySelector('.hover-body');
      postProcess(body, t.p);
      // the card is a preview: no ids that clash with the open note, no task ticking
      body.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
      body.querySelectorAll('input[type=checkbox]').forEach((cb) => { cb.disabled = true; delete cb.dataset.task; });
    } else return;
    if (my !== seq || anchor !== a) return;
    box.hidden = false;
    box.scrollTop = 0;
    const body = box.querySelector('.hover-body'); if (body) body.scrollTop = 0;
    place(a);
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_MS);
  }
  function hide() {
    clearTimeout(timer); clearTimeout(hideTimer);
    seq++; anchor = null;
    if (card) { card.hidden = true; card.innerHTML = ''; }
  }

  const LINKS = 'a.internal, .cm-lp-link';
  document.addEventListener('mouseover', (e) => {
    if (!enabled()) return;
    const a = e.target.closest && e.target.closest(LINKS);
    if (!a || (card && card.contains(a) && a.classList.contains('hover-title'))) return;
    if (a === anchor) { clearTimeout(hideTimer); return; }
    // only links in notes (reading view, editor, embeds, the card itself)
    if (!a.closest('.note, .cm-editor, .hover-card')) return;
    if (a.closest('.cm-editor') && !e.ctrlKey) return;
    clearTimeout(timer); clearTimeout(hideTimer);
    anchor = a;
    timer = setTimeout(() => show(a).catch((err) => console.error('preview failed', err)), SHOW_MS);
  });
  document.addEventListener('mouseout', (e) => {
    if (!anchor) return;
    const a = e.target.closest && e.target.closest(LINKS);
    if (a !== anchor) return;
    if (e.relatedTarget && (anchor.contains(e.relatedTarget) || (card && card.contains(e.relatedTarget)))) return;
    clearTimeout(timer);
    if (card && !card.hidden) scheduleHide(); else anchor = null;
  });
  // anything else the user does closes it
  document.addEventListener('keydown', (e) => { if (card && !card.hidden && e.key !== 'Control') hide(); }, true);
  document.addEventListener('mousedown', (e) => { if (card && !card.hidden && !card.contains(e.target)) hide(); }, true);
  document.addEventListener('wheel', (e) => { if (card && !card.hidden && !card.contains(e.target)) hide(); }, { passive: true, capture: true });
  // a click on a link in the card opens it (app.js handles the click); then close
  document.addEventListener('click', (e) => { if (card && !card.hidden && card.contains(e.target) && e.target.closest('a')) setTimeout(hide, 0); });

  return { hide, get visible() { return !!card && !card.hidden; }, _card: () => card };
})();
