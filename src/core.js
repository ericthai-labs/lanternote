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

  const api = { MD_EXT, baseOf, dirOf, stem, norm, safeDecode, splitFm, parseYaml, TAG_RE, stripCode, linkTarget, parseNote, parseTasks, makeResolver, buildByBase };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof self !== 'undefined' ? self : this);
