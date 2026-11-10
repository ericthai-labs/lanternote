// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — shared parsing core.
// Loaded twice: by the indexer worker (require) and by the window (<script>),
// so link resolution and tag/link extraction agree on both sides.
(function (root) {
  'use strict';

  const MD_EXT = /\.(md|markdown)$/i;
  const baseOf = (p) => p.split('/').pop();
  const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  const stem = (p) => baseOf(p).replace(MD_EXT, '');
  function norm(p) {
    const out = [];
    for (const seg of p.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') out.pop(); else out.push(seg);
    }
    return out.join('/');
  }
  function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

  // ---------------- front matter ----------------
  const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
  function splitFm(text) {
    const m = FM_RE.exec(text);
    if (!m) return { fm: null, body: text };
    return { fm: parseYaml(m[1]), body: text.slice(m[0].length) };
  }
  const unq = (s) => s.replace(/^(["'])(.*)\1$/, '$2');
  function parseYaml(y) {
    const o = {}; let key = null;
    for (const line of y.split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const li = /^\s*-\s+(.*)$/.exec(line);
      if (li && key) { if (!Array.isArray(o[key])) o[key] = []; o[key].push(unq(li[1].trim())); continue; }
      const kv = /^([^:\s][^:]*):\s*(.*)$/.exec(line);
      if (kv) {
        key = kv[1].trim();
        let v = kv[2].trim();
        if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((s) => unq(s.trim())).filter(Boolean);
        else v = unq(v);
        o[key] = v;
      }
    }
    return o;
  }

  // ---------------- links & tags ----------------
  const TAG_RE = /(^|[\s(,;])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;
  const stripCode = (s) => s.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');

  // ---------------- unlinked mentions ----------------
  // Places where a note's name (or an alias) appears as whole words, outside
  // links, code, URLs and the front matter: [{ line, col, len, text }] (0-based).
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  function findMentions(text, names, max = 50) {
    const masked = text
      .replace(FM_RE, blank)
      .replace(/^(```|~~~)[\s\S]*?^\1/gm, blank)
      .replace(/`[^`\n]*`/g, blank)
      .replace(/!?\[\[[^\]\n]*\]\]/g, blank)
      .replace(/\]\([^)\n]*\)/g, blank)
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, blank)
      .replace(/<[^>\n]+>/g, blank);
    const res = names.filter((n) => n && n.trim().length >= 3)
      .map((n) => n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
    if (!res.length) return [];
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${res.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
    const out = [];
    const starts = [0];
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
    let li = 0;
    for (const m of masked.matchAll(re)) {
      if (m[0].includes('\n')) continue;
      while (li + 1 < starts.length && starts[li + 1] <= m.index) li++;
      out.push({ line: li, col: m.index - starts[li], len: m[0].length, text: text.substr(m.index, m[0].length) });
      if (out.length >= max) break;
    }
    return out;
  }

  const INLINE_LINE = /^[ \t]*(?:[-*+][ \t]+)?([^\s:[\]()`][^:[\]()`\n]*?)::[ \t]*(.*)$/gm;
  const INLINE_BRACKET = /[[(]([^\s:[\]()`][^:[\]()`\n]*?)::[ \t]*([^\])\n]*)[\])]/g;

  function linkTarget(inner) {
    const raw = inner.replace(/\\\|/g, '|').split('|')[0];
    const hash = raw.indexOf('#');
    return { file: hash < 0 ? raw : raw.slice(0, hash), sub: hash < 0 ? '' : raw.slice(hash + 1) };
  }

  // Everything the index needs from one note, before resolution:
  // the raw link targets (as written) and the tags.
  function parseNote(text) {
    const { fm, body } = splitFm(text);
    const clean = stripCode(body);
    const links = new Set();
    for (const m of clean.matchAll(/!?\[\[([^[\]\n]+?)\]\]/g)) {
      const { file } = linkTarget(m[1]);
      if (file) links.add(file);
    }
    for (const m of clean.matchAll(/\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(m[1]) || m[1].startsWith('#')) continue;
      const f = m[1].split('#')[0];
      if (f) links.add(f);
    }
    const tags = new Set();
    if (fm) {
      let ft = fm.tags ?? fm.tag;
      if (typeof ft === 'string') ft = ft.split(/[,\s]+/);
      if (Array.isArray(ft)) ft.forEach((t) => { t = String(t).replace(/^#/, '').trim(); if (t) tags.add(t); });
    }
    for (const m of clean.matchAll(TAG_RE)) tags.add(m[2]);
    // fields for Dataview: frontmatter keys plus inline `key:: value`
    // (on their own line, or inside [key:: value] / (key:: value))
    let fields = null;
    if (fm && Object.keys(fm).length) fields = { ...fm };
    if (clean.includes('::')) {
      for (const m of clean.matchAll(INLINE_LINE)) (fields || (fields = {}))[m[1].trim()] = m[2].trim();
      for (const m of clean.matchAll(INLINE_BRACKET)) (fields || (fields = {}))[m[1].trim()] = m[2].trim();
    }
    return { links: [...links], tags: [...tags], fields, tasks: parseTasks(text, text.length - body.length) };
  }

  // Task lines (- [ ] …, 1. [x] …) outside code blocks, for TASK queries:
  // [line (0-based, in the whole file), status character, text, indent].
  // null when the note has none, so notes without tasks cost nothing.
  const TASK_LINE = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+\[(.)\][ \t]*(.*)$/;
  function parseTasks(text, bodyAt) {
    if (!text.includes('[')) return null;
    let out = null, fence = null, line = 0, at = 0;
    for (const raw of text.split('\n')) {
      const ln = raw.replace(/\r$/, '');
      if (at >= bodyAt) {
        const f = /^\s*(`{3,}|~{3,})/.exec(ln);
        if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; }
        else if (f) fence = f[1];
        else {
          const m = TASK_LINE.exec(ln);
          if (m) (out || (out = [])).push([line, m[2], m[3], m[1].replace(/\t/g, '    ').length]);
        }
      }
      at += raw.length + 1; line++;
    }
    return out;
  }

  // Wiki-link resolution: exact path, then relative to the note,
  // then any file with that name (shortest path wins).
  // `has(path)` answers whether a vault file exists; `byBase` maps a
  // lower-case basename to the paths carrying it.
  function makeResolver(has, byBase) {
    return function resolve(raw, from) {
      if (!raw) return null;
      const t = safeDecode(raw).replace(/\\/g, '/').trim();
      if (!t) return null;
      const n = norm(t);
      if (from) {
        const d = dirOf(from);
        const c = norm(d ? d + '/' + t : t);
        if (has(c)) return c;
        if (has(c + '.md')) return c + '.md';
      }
      if (has(n)) return n;
      if (has(n + '.md')) return n + '.md';
      const lc = n.toLowerCase();
      const b = baseOf(lc);
      const a1 = byBase.get(b), a2 = byBase.get(b + '.md');
      let best = null;
      const scan = (arr) => {
        if (!arr) return;
        for (const p of arr) {
          const pl = p.toLowerCase();
          if (pl === lc || pl === lc + '.md' || pl.endsWith('/' + lc) || pl.endsWith('/' + lc + '.md')) {
            if (!best || p.length < best.length) best = p;
          }
        }
      };
      scan(a1); scan(a2);
      return best;
    };
  }

  function buildByBase(files) {
    const byBase = new Map();
    for (const p of files) {
      const b = baseOf(p).toLowerCase();
      const arr = byBase.get(b);
      if (arr) arr.push(p); else byBase.set(b, [p]);
    }
    return byBase;
  }

  // ---------------- edge list ----------------
  // The link graph is a flat Uint32Array of (from, to) pairs, grouped by `from` in ascending order.
  // edgeOffsets: where each note's pairs start (in pairs); null if the list is not grouped that way.
  function edgeOffsets(edges, n) {
    const off = new Uint32Array(n + 1);
    let last = 0;
    for (let k = 0; k < edges.length; k += 2) { const i = edges[k]; if (i < last || i >= n) return null; last = i; off[i + 1]++; }
    for (let i = 0; i < n; i++) off[i + 1] += off[i];
    return off;
  }
  // spliceEdges: the same list with the rows of a few notes replaced — rep: Map(note → its new targets)
  function spliceEdges(edges, off, rep) {
    let m = edges.length / 2;
    for (const [i, o] of rep) m += o.length - (off[i + 1] - off[i]);
    const out = new Uint32Array(2 * m);
    let w = 0, r = 0; // w: next value to write; r: next pair to copy from the old list
    for (const i of [...rep.keys()].sort((a, b) => a - b)) {
      const keep = edges.subarray(2 * r, 2 * off[i]);
      out.set(keep, w); w += keep.length;
      for (const j of rep.get(i)) { out[w++] = i; out[w++] = j; }
      r = off[i + 1];
    }
    out.set(edges.subarray(2 * r), w);
    return out;
  }

  // ---------------- document status ----------------
  // From the front matter: is the document current, superseded or a draft; has its review
  // date passed; its revision. state: 0 unknown · 1 current · 2 superseded · 3 draft.
  const ST_KEYS = ['status', 'state', 'doc_status', 'trangthai', 'trang_thai'];
  const BY_KEYS = ['superseded_by', 'replaced_by', 'thay_the_boi'];
  const DUE_KEYS = ['review_due', 'next_review', 'review_by', 'expires', 'expiry', 'valid_until', 'han_xem_lai', 'ngay_het_han'];
  const REV_KEYS = ['revision', 'rev', 'version', 'phien_ban'];
  const KEYS = new Set([...ST_KEYS, ...BY_KEYS, ...DUE_KEYS, ...REV_KEYS]);
  const ST_OLD = /^(superseded|obsolete|withdrawn|cancell?ed|archived|replaced|expired|retired|deprecated|inactive|revoked|het[-_ ]?hieu[-_ ]?luc|ngung([-_ ]?ap[-_ ]?dung)?|da[-_ ]?thay[-_ ]?the|huy)$/;
  const ST_CUR = /^(current|active|effective|approved|released|valid|in[-_ ]?force|dang[-_ ]?ap[-_ ]?dung|hieu[-_ ]?luc|con[-_ ]?hieu[-_ ]?luc)$/;
  const ST_DRAFT = /^(draft|wip|in[-_ ]?review|for[-_ ]?review|pending|proposed|nhap|ban[-_ ]?nhap|cho[-_ ]?duyet)$/;
  const plainLow = (v) => String(v).trim().toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
  function docStatus(fields, today = Date.now()) {
    if (!fields) return null;
    const got = {};
    for (const k in fields) {
      const lk = k.toLowerCase();
      if (!KEYS.has(lk) || lk in got) continue;
      let v = fields[k];
      if (Array.isArray(v)) v = v.find((x) => x != null && String(x).trim() !== '');
      if (v == null || String(v).trim() === '') continue;
      got[lk] = String(v).trim();
    }
    const first = (keys) => { for (const k of keys) if (k in got) return got[k]; return null; };
    const s = first(ST_KEYS), by = first(BY_KEYS), dueRaw = first(DUE_KEYS), rev = first(REV_KEYS);
    if (s == null && by == null && dueRaw == null && rev == null) return null;
    const sv = s == null ? '' : plainLow(s);
    const state = by != null || ST_OLD.test(sv) ? 2 : ST_DRAFT.test(sv) ? 3 : ST_CUR.test(sv) ? 1 : 0;
    const m = dueRaw == null ? null : /^(\d{4})-(\d{2})-(\d{2})/.exec(dueRaw);
    const dueMs = m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
    const due = state !== 2 && dueMs < new Date(today).setHours(0, 0, 0, 0);
    if (!state && !due && rev == null) return null;
    return { state, due, dueDate: m ? m[0] : null, rev, by, raw: s };
  }
  // one byte per note for the window: bits 0–1 the state, bit 2 a passed review date
  const statusByte = (d) => (d ? d.state | (d.due ? 4 : 0) : 0);

  const api = { MD_EXT, baseOf, dirOf, stem, norm, safeDecode, splitFm, parseYaml, TAG_RE, stripCode, findMentions, linkTarget, parseNote, parseTasks, makeResolver, buildByBase, docStatus, statusByte, edgeOffsets, spliceEdges };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof self !== 'undefined' ? self : this);
