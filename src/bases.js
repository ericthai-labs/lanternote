// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — table views saved as `.base` files: YAML with `filters`, `formulas`,
// `properties`, `summaries` and `views`, and the small expression language they use
// (`file.hasTag("x") && note.status != "done"`, `list(tags).contains(this)`, …).
// Pure: the indexer worker supplies the files through an `env` object (see run()).
(function (root) {
  'use strict';

  // ---------------- YAML (the block / flow subset view files use) ----------------
  function stripComment(s) {
    let q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === q) q = null; else if (c === '\\' && q === '"') i++; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
    }
    return s;
  }
  function unquote(s) {
    if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
    if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
      try { return JSON.parse(s); } catch { return s.slice(1, -1); }
    }
    return null;
  }
  function plainScalar(s) {
    if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
    if (/^(true|True|TRUE)$/.test(s)) return true;
    if (/^(false|False|FALSE)$/.test(s)) return false;
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
    return s;
  }
  function scalar(raw) {
    const s = raw.trim();
    if (!s) return null;
    if (s[0] === '"' || s[0] === "'") {
      const u = unquote(stripComment(s));
      if (u !== null) return u;
    }
    if (s[0] === '[' || s[0] === '{') return flow(stripComment(s));
    return plainScalar(stripComment(s));
  }
  // [a, b] and {key: value} on one line
  function flow(s) {
    let i = 0;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    function value(stop) {
      ws();
      if (s[i] === '[') { i++; const out = []; ws(); if (s[i] === ']') { i++; return out; } for (;;) { out.push(value(',]')); ws(); if (s[i] === ',') { i++; continue; } if (s[i] === ']') { i++; return out; } throw new Error('unclosed [ in ' + s); } }
      if (s[i] === '{') {
        i++; const out = {}; ws(); if (s[i] === '}') { i++; return out; }
        for (;;) {
          ws();
          const k = token(':,}');
          if (s[i] === ':') i++;
          out[String(k)] = s[i] === ',' || s[i] === '}' ? null : value(',}');
          ws(); if (s[i] === ',') { i++; continue; } if (s[i] === '}') { i++; return out; } throw new Error('unclosed { in ' + s);
        }
      }
      return token(stop);
    }
    function token(stop) {
      ws();
      if (s[i] === '"' || s[i] === "'") {
        const q = s[i]; let j = i + 1;
        while (j < s.length) { if (s[j] === q) { if (q === "'" && s[j + 1] === "'") { j += 2; continue; } break; } if (s[j] === '\\' && q === '"') j++; j++; }
        const out = unquote(s.slice(i, j + 1)); i = j + 1; return out;
      }
      let j = i;
      while (j < s.length && !stop.includes(s[j])) j++;
      const out = plainScalar(s.slice(i, j).trim()); i = j; return out;
    }
    return value('');
  }
  const KEY_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s'"#-][^:#]*?|-[^\s:][^:#]*?)\s*:(?:\s+(.*))?$/;
  function parseYaml(text) {
    const lines = [];
    for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
      if (!raw.trim() || /^\s*#/.test(raw) || /^(---|\.\.\.)\s*$/.test(raw)) continue;
      if (/^\s*\t/.test(raw)) throw new Error('tabs are not allowed for indentation');
      const indent = raw.length - raw.trimStart().length;
      lines.push({ indent, text: raw.trim() });
    }
    let i = 0;
    const isItem = (l) => l.text === '-' || l.text.startsWith('- ');
    function block(indent) {
      if (i >= lines.length) return null;
      return isItem(lines[i]) ? seq(lines[i].indent) : map(lines[i].indent);
    }
    function blockScalar(parentIndent, folded) {
      const out = [];
      let ind = -1;
      while (i < lines.length && lines[i].indent > parentIndent) { if (ind < 0) ind = lines[i].indent; out.push(' '.repeat(lines[i].indent - ind) + lines[i].text); i++; }
      return folded ? out.join(' ') : out.join('\n');
    }
    function valueAfter(rest, indent) {
      if (rest == null || rest === '') {
        if (i < lines.length && (lines[i].indent > indent || (lines[i].indent === indent && isItem(lines[i])))) return block();
        return null;
      }
      if (/^[|>][-+]?$/.test(rest.trim())) return blockScalar(indent, rest.trim()[0] === '>');
      return scalar(rest);
    }
    function map(indent) {
      const out = {};
      while (i < lines.length && lines[i].indent === indent && !isItem(lines[i])) {
        const m = KEY_RE.exec(lines[i].text);
        if (!m) throw new Error(`line "${lines[i].text}": expected "key: value"`);
        const k = unquote(m[1]) ?? m[1].trim();
        i++;
        out[k] = valueAfter(m[2], indent);
      }
      return out;
    }
    function seq(indent) {
      const out = [];
      while (i < lines.length && lines[i].indent === indent && isItem(lines[i])) {
        const rest = lines[i].text === '-' ? '' : lines[i].text.slice(2).trim();
        if (!rest) { i++; out.push(i < lines.length && lines[i].indent > indent ? block() : null); continue; }
        if (KEY_RE.test(rest) && !/^["'[{]/.test(rest)) {
          // "- key: value" starts a mapping whose keys sit where "key" starts
          lines[i] = { indent: indent + (lines[i].text.length - rest.length), text: rest };
          out.push(map(lines[i].indent));
          continue;
        }
        i++;
        out.push(scalar(rest));
      }
      return out;
    }
    const doc = lines.length ? block() : {};
    if (i < lines.length) throw new Error(`line "${lines[i].text}": unexpected indentation`);
    return doc;
  }

  // ---------------- expressions ----------------
  const PREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  function tokenize(src) {
    const out = [];
    let i = 0;
    const s = String(src);
    const valueEnd = () => { const t = out[out.length - 1]; return t && (t.k === 'num' || t.k === 'str' || t.k === 'id' || t.k === 're' || t.v === ')' || t.v === ']'); };
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || '') && !valueEnd())) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(i));
        // "1.round()" style: a trailing dot belongs to the method, not the number
        let txt = m[0];
        if (txt.endsWith('.') && /[A-Za-z_]/.test(s[i + txt.length] || '')) txt = txt.slice(0, -1);
        out.push({ k: 'num', v: Number(txt), at: i }); i += txt.length; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1, v = '';
        while (j < s.length && s[j] !== c) {
          if (s[j] === '\\' && j + 1 < s.length) { const n = s[j + 1]; v += n === 'n' ? '\n' : n === 't' ? '\t' : n; j += 2; continue; }
          v += s[j++];
        }
        if (j >= s.length) throw new Error('unclosed text ' + c + ' at ' + (i + 1));
        out.push({ k: 'str', v, at: i }); i = j + 1; continue;
      }
      if (c === '/' && !valueEnd()) {
        let j = i + 1, cls = false;
        while (j < s.length && (s[j] !== '/' || cls)) { if (s[j] === '\\') j++; else if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false; j++; }
        if (j >= s.length) throw new Error('unclosed /regular expression/ at ' + (i + 1));
        const body = s.slice(i + 1, j);
        const fl = /^[gimsuy]*/.exec(s.slice(j + 1))[0];
        out.push({ k: 're', v: new RegExp(body, fl), at: i }); i = j + 1 + fl.length; continue;
      }
      const two = s.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { out.push({ k: 'op', v: two, at: i }); i += 2; continue; }
      if ('+-*/%<>!().,[]'.includes(c)) { out.push({ k: 'op', v: c, at: i }); i++; continue; }
      if (c === '=') { out.push({ k: 'op', v: '==', at: i }); i++; continue; }
      const id = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(s.slice(i));
      if (id) { out.push({ k: 'id', v: id[0], at: i }); i += id[0].length; continue; }
      throw new Error(`unexpected "${c}" at ${i + 1}`);
    }
    return out;
  }
  const CACHE = new Map();
  function compile(src) {
    const key = String(src);
    if (CACHE.has(key)) return CACHE.get(key);
    const toks = tokenize(key);
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v) => toks[p] && toks[p].k === 'op' && toks[p].v === v;
    const expect = (v) => { if (!isOp(v)) throw new Error(`expected "${v}"${toks[p] ? ' at ' + (toks[p].at + 1) : ' at the end'}`); p++; };
    function primary() {
      const t = toks[p++];
      if (!t) throw new Error('the expression ends too early');
      if (t.k === 'num' || t.k === 'str' || t.k === 're') return { k: 'lit', v: t.v };
      if (t.k === 'id') {
        if (t.v === 'true') return { k: 'lit', v: true };
        if (t.v === 'false') return { k: 'lit', v: false };
        if (t.v === 'null') return { k: 'lit', v: null };
        return { k: 'id', name: t.v };
      }
      if (t.v === '(') { const e = expr(0); expect(')'); return e; }
      if (t.v === '[') {
        const items = [];
        if (!isOp(']')) for (;;) { items.push(expr(0)); if (isOp(',')) { p++; continue; } break; }
        expect(']');
        return { k: 'list', items };
      }
      if (t.v === '!' || t.v === '-' || t.v === '+') return { k: 'un', op: t.v, a: unary() };
      throw new Error(`unexpected "${t.v}" at ${t.at + 1}`);
    }
    function unary() { return postfix(primary()); }
    function postfix(e) {
      for (;;) {
        if (isOp('.')) { p++; const t = toks[p++]; if (!t || t.k !== 'id') throw new Error('expected a name after "."'); e = { k: 'mem', obj: e, name: t.v }; continue; }
        if (isOp('[')) { p++; const ix = expr(0); expect(']'); e = { k: 'idx', obj: e, index: ix }; continue; }
        if (isOp('(')) {
          p++;
          const args = [];
          if (!isOp(')')) for (;;) { args.push(expr(0)); if (isOp(',')) { p++; continue; } break; }
          expect(')');
          e = { k: 'call', callee: e, args };
          continue;
        }
        return e;
      }
    }
    function expr(min) {
      let left = unary();
      for (;;) {
        const t = peek();
        if (!t || t.k !== 'op' || !(t.v in PREC) || PREC[t.v] < min) break;
        const prec = PREC[t.v];
        p++;
        const right = expr(prec + 1);
        left = { k: 'bin', op: t.v, a: left, b: right };
      }
      return left;
    }
    const ast = expr(0);
    if (p < toks.length) throw new Error(`unexpected "${toks[p].v}" at ${toks[p].at + 1}`);
    if (CACHE.size > 2000) CACHE.clear();
    CACHE.set(key, ast);
    return ast;
  }

  // ---------------- values ----------------
  // null · boolean · number · string · Array · RegExp · plain object, and tagged objects:
  // { t:'date', ms, time } · { t:'dur', ms, mo } · { t:'link', path, display, ok } · { t:'file', path } · { t:'ctx', path }
  const DAY = 864e5;
  const isTag = (v, t) => v != null && typeof v === 'object' && v.t === t;
  const date = (ms, time) => ({ t: 'date', ms, time: !!time });
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;
  function parseDate(s) {
    const m = DATE_RE.exec(String(s).trim());
    if (!m) return null;
    if (m[7]) { const t = Date.parse(String(s).trim()); return Number.isNaN(t) ? null : date(t, true); }
    const t = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
    return Number.isNaN(t) ? null : date(t, !!m[4]);
  }
  // "1d", "2 weeks", "1M 4h" — M is months, m minutes
  const UNITS = [
    [/^(y|years?)$/i, 0, 12], [/^(M|months?)$/, 0, 1], [/^(w|weeks?)$/i, 7 * DAY, 0], [/^(d|days?)$/i, DAY, 0],
    [/^(h|hours?)$/i, 36e5, 0], [/^(m|minutes?)$/, 6e4, 0], [/^(s|seconds?)$/i, 1e3, 0], [/^ms$/i, 1, 0],
  ];
  function parseDur(s) {
    let ms = 0, mo = 0, any = false;
    const str = String(s).trim();
    const rest = str.replace(/([-+]?\d+(?:\.\d+)?)\s*([A-Za-z]+)/g, (all, n, u) => {
      const unit = UNITS.find(([re]) => re.test(u));
      if (!unit) return all;
      ms += +n * unit[1]; mo += +n * unit[2]; any = true;
      return '';
    });
    return any && !rest.replace(/[\s,]/g, '') ? { t: 'dur', ms, mo } : null;
  }
  function addDur(d, du, sign = 1) {
    const x = new Date(d.ms);
    if (du.mo) {
      const day = x.getDate();
      x.setDate(1); x.setMonth(x.getMonth() + sign * du.mo);
      x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
    }
    return date(x.getTime() + sign * du.ms, d.time || du.ms % DAY !== 0);
  }
  const durMs = (d) => d.ms + d.mo * 30 * DAY;
  const p2 = (n) => String(n).padStart(2, '0');
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // moment.js-style tokens (YYYY-MM-DD HH:mm)
  function formatDate(ms, fmt) {
    const d = new Date(ms);
    return String(fmt).replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|SSS|A|a/g, (t, lit) => {
      if (lit !== undefined) return lit;
      const h12 = d.getHours() % 12 || 12;
      return {
        YYYY: d.getFullYear(), YY: String(d.getFullYear()).slice(-2), MMMM: MONTHS[d.getMonth()], MMM: MONTHS[d.getMonth()].slice(0, 3),
        MM: p2(d.getMonth() + 1), M: d.getMonth() + 1, DD: p2(d.getDate()), D: d.getDate(), dddd: WEEKDAYS[d.getDay()], ddd: WEEKDAYS[d.getDay()].slice(0, 3),
        HH: p2(d.getHours()), H: d.getHours(), hh: p2(h12), h: h12, mm: p2(d.getMinutes()), m: d.getMinutes(), ss: p2(d.getSeconds()), s: d.getSeconds(),
        SSS: String(d.getMilliseconds()).padStart(3, '0'), A: d.getHours() < 12 ? 'AM' : 'PM', a: d.getHours() < 12 ? 'am' : 'pm',
      }[t];
    });
  }
  function relative(ms, nowMs) {
    const diff = ms - nowMs, a = Math.abs(diff);
    const steps = [[365 * DAY, 'year'], [30 * DAY, 'month'], [7 * DAY, 'week'], [DAY, 'day'], [36e5, 'hour'], [6e4, 'minute']];
    for (const [size, name] of steps) {
      if (a >= size) { const n = Math.round(a / size); const w = `${n} ${name}${n > 1 ? 's' : ''}`; return diff < 0 ? w + ' ago' : 'in ' + w; }
    }
    return 'just now';
  }

  function truthy(v) {
    if (v == null) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
    if (typeof v === 'string') return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (isTag(v, 'dur')) return durMs(v) !== 0;
    return true;
  }
  const typeOf = (v) => (v == null ? 'null' : Array.isArray(v) ? 'list' : v instanceof RegExp ? 'regexp'
    : typeof v === 'object' ? (v.t === 'date' ? 'date' : v.t === 'dur' ? 'duration' : v.t === 'link' ? 'link' : v.t === 'file' || v.t === 'ctx' ? 'file' : 'object') : typeof v);

  // ---------------- the engine ----------------
  // env: { files: [paths], info(p) → { size, ctime, mtime, tags, fields }, out(p) → [paths], inn(p) → [paths],
  //        resolve(target, from) → path | null, has(p) → bool, now: ms }
  function engine(def, env, thisPath) {
    const formulas = Object.create(null);
    for (const [k, v] of Object.entries((def && def.formulas) || {})) formulas[k] = v == null ? null : compile(String(v));
    const now = env.now || Date.now();
    const LOOP = Symbol('loop');
    const lower = (s) => String(s).toLowerCase();
    let firstError = null;

    // per-file data, built once per query
    const infoCache = new Map();
    const info = (p) => { let x = infoCache.get(p); if (!x) { x = env.info(p) || {}; infoCache.set(p, x); } return x; };
    const ext = (p) => { const b = p.split('/').pop(); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1) : ''; };
    const baseName = (p) => p.split('/').pop();
    const stem = (p) => { const b = baseName(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(0, i) : b; };
    const folder = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
    function link(target, from, display) {
      const raw = String(target).replace(/^!?\[\[|\]\]$/g, '');
      const bar = raw.indexOf('|');
      const t = (bar < 0 ? raw : raw.slice(0, bar)).split('#')[0].trim();
      const alias = bar < 0 ? null : raw.slice(bar + 1);
      const p = env.has(t) ? t : env.resolve(t, from || '');
      return { t: 'link', path: p || t, display: display != null ? String(display) : alias || (p ? stem(p) : t), ok: !!p };
    }
    const fileLink = (p, display) => ({ t: 'link', path: p, display: display != null ? String(display) : stem(p), ok: true });
    // frontmatter values: "[[x]]" → link, dates, numbers, booleans; lists element by element
    function fromRaw(v, from) {
      if (Array.isArray(v)) return v.map((x) => fromRaw(x, from));
      if (v == null || typeof v !== 'string') return v ?? null;
      const s = v.trim();
      if (s === '') return null;
      if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
      if (/^-?\d+(\.\d+)?$/.test(s) && !/^-?0\d/.test(s)) return +s;
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = parseDate(s); if (d) return d; }
      if (/^!?\[\[[^\]]+\]\]$/.test(s)) return link(s, from);
      return s;
    }
    const propCache = new Map();
    function props(p) {
      let o = propCache.get(p);
      if (!o) {
        o = Object.create(null);
        const raw = info(p).fields || {};
        for (const k of Object.keys(raw)) o[k] = fromRaw(raw[k], p);
        propCache.set(p, o);
      }
      return o;
    }
    function prop(p, name) {
      const o = props(p);
      if (name in o) return o[name];
      const low = lower(name);
      for (const k in o) if (lower(k) === low) return o[k];
      return null;
    }
    const linksCache = new Map();
    function fileLinks(p) {
      let l = linksCache.get(p);
      if (l) return l;
      const seen = new Set();
      l = [];
      const add = (lk) => { const k = lower(lk.path); if (!seen.has(k)) { seen.add(k); l.push(lk); } };
      for (const q of env.out(p) || []) add(fileLink(q));
      // links written in the front matter count too
      const raw = info(p).fields || {};
      for (const k of Object.keys(raw)) {
        const vals = Array.isArray(raw[k]) ? raw[k] : [raw[k]];
        for (const v of vals) if (typeof v === 'string') for (const m of v.matchAll(/\[\[([^\]]+)\]\]/g)) add(link(m[1], p));
      }
      linksCache.set(p, l);
      return l;
    }
    // does p link to target? The target's backlinks are read once per query, so a filter such as
    // file.hasLink(this) over every file stays a set lookup; front matter links are checked after.
    const innSets = new Map();
    function linksTo(p, target) {
      let set = innSets.get(target);
      if (!set) { set = new Set(env.inn(target) || []); innSets.set(target, set); }
      if (set.has(p)) return true;
      const raw = info(p).fields;
      if (!raw) return false;
      const want = lower(target);
      for (const k in raw) {
        const vals = Array.isArray(raw[k]) ? raw[k] : [raw[k]];
        for (const v of vals) {
          if (typeof v !== 'string' || !v.includes('[[')) continue;
          for (const m of v.matchAll(/\[\[([^\]]+)\]\]/g)) if (lower(link(m[1], p).path) === want) return true;
        }
      }
      return false;
    }
    const tags = (p) => (info(p).tags || []).map(String);
    function fileField(p, name) {
      const i = info(p);
      switch (name) {
        case 'name': return baseName(p);
        case 'basename': return stem(p);
        case 'path': return p;
        case 'folder': return folder(p);
        case 'ext': return ext(p);
        case 'size': return i.size || 0;
        case 'ctime': return date(i.ctime || i.mtime || 0, true);
        case 'mtime': return date(i.mtime || 0, true);
        case 'links': return fileLinks(p);
        case 'backlinks': return (env.inn(p) || []).map((q) => fileLink(q));
        case 'embeds': return [];
        case 'tags': return tags(p);
        case 'properties': return { ...props(p) };
        case 'file': return { t: 'file', path: p };
        case 'link': return fileLink(p);
      }
      return undefined;
    }

    // identity for ==, contains(), unique()
    function key(v) {
      if (v == null) return 'n:';
      if (Array.isArray(v)) return 'l:[' + v.map(key).join(',') + ']';
      if (v instanceof RegExp) return 'r:' + v;
      switch (typeof v) {
        case 'number': return 'v:' + v;
        case 'boolean': return 'b:' + v;
        case 'string': return 's:' + v;
      }
      if (v.t === 'link' || v.t === 'file' || v.t === 'ctx') return 'p:' + lower(v.path);
      if (v.t === 'date') return 'd:' + v.ms;
      if (v.t === 'dur') return 'u:' + durMs(v);
      return 'o:' + JSON.stringify(v);
    }
    function eq(a, b) {
      if (a == null || b == null) return a == null && b == null;
      const pa = isTag(a, 'link') || isTag(a, 'file') || isTag(a, 'ctx'), pb = isTag(b, 'link') || isTag(b, 'file') || isTag(b, 'ctx');
      // a link and a text: the text names the same note
      if (pa && typeof b === 'string') return lower(a.path) === lower(link(b).path) || lower(a.display || '') === lower(b);
      if (pb && typeof a === 'string') return eq(b, a);
      if (typeof a === 'number' && typeof b === 'string' && b.trim() !== '' && !Number.isNaN(+b)) return a === +b;
      if (typeof b === 'number' && typeof a === 'string') return eq(b, a);
      if (isTag(a, 'date') && typeof b === 'string') { const d = parseDate(b); return !!d && d.ms === a.ms; }
      if (isTag(b, 'date') && typeof a === 'string') return eq(b, a);
      return key(a) === key(b);
    }
    // ordering for < > and sorting; null sorts last
    const COLL = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    function cmp(a, b) {
      if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
      if (isTag(a, 'date') && typeof b === 'string') { const d = parseDate(b); if (d) b = d; }
      if (isTag(b, 'date') && typeof a === 'string') { const d = parseDate(a); if (d) a = d; }
      const num = (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? +v : isTag(v, 'date') ? v.ms : isTag(v, 'dur') ? durMs(v) : null);
      const na = num(a), nb = num(b);
      if (na != null && nb != null) return na < nb ? -1 : na > nb ? 1 : 0;
      if (Array.isArray(a) && Array.isArray(b)) { for (let k = 0; k < Math.min(a.length, b.length); k++) { const c = cmp(a[k], b[k]); if (c) return c; } return a.length - b.length; }
      return COLL.compare(text(a), text(b));
    }
    function text(v) {
      if (v == null) return '';
      if (Array.isArray(v)) return v.map(text).join(', ');
      if (v instanceof RegExp) return String(v);
      if (typeof v !== 'object') return String(v);
      if (v.t === 'date') return formatDate(v.ms, v.time ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD');
      if (v.t === 'dur') return durText(v);
      if (v.t === 'link') return v.display || v.path;
      if (v.t === 'file' || v.t === 'ctx') return stem(v.path);
      return JSON.stringify(v);
    }
    function durText(d) {
      const parts = [];
      let ms = Math.abs(d.ms), mo = Math.abs(d.mo);
      if (mo >= 12) { parts.push(Math.floor(mo / 12) + 'y'); mo %= 12; }
      if (mo) parts.push(mo + 'M');
      for (const [size, u] of [[DAY, 'd'], [36e5, 'h'], [6e4, 'm'], [1e3, 's']]) if (ms >= size) { parts.push(Math.floor(ms / size) + u); ms %= size; }
      return (d.ms < 0 || d.mo < 0 ? '-' : '') + (parts.join(' ') || '0s');
    }
    const asDate = (v) => (isTag(v, 'date') ? v : typeof v === 'string' ? parseDate(v) : typeof v === 'number' ? date(v, true) : null);
    const asDur = (v) => (isTag(v, 'dur') ? v : typeof v === 'string' ? parseDur(v) : null);
    const pathOf = (v, from) => (v == null ? null : isTag(v, 'link') || isTag(v, 'file') || isTag(v, 'ctx') ? v.path : typeof v === 'string' ? link(v, from).path : null);

    function arith(op, a, b) {
      if (op === '+') {
        if (isTag(a, 'date')) { const d = asDur(b); if (d) return addDur(a, d); }
        if (isTag(b, 'date')) { const d = asDur(a); if (d) return addDur(b, d); }
        if (isTag(a, 'dur') && isTag(b, 'dur')) return { t: 'dur', ms: a.ms + b.ms, mo: a.mo + b.mo };
        if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (a == null && b == null) return null;
        return text(a) + text(b);
      }
      if (op === '-') {
        if (isTag(a, 'date') && isTag(b, 'date')) return { t: 'dur', ms: a.ms - b.ms, mo: 0 };
        if (isTag(a, 'date')) { const d = asDur(b); if (d) return addDur(a, d, -1); const bd = asDate(b); if (bd) return { t: 'dur', ms: a.ms - bd.ms, mo: 0 }; }
        if (isTag(a, 'dur') && isTag(b, 'dur')) return { t: 'dur', ms: a.ms - b.ms, mo: a.mo - b.mo };
      }
      if (isTag(a, 'dur') && typeof b === 'number' && (op === '*' || op === '/')) return op === '*' ? { t: 'dur', ms: a.ms * b, mo: a.mo * b } : { t: 'dur', ms: a.ms / b, mo: a.mo / b };
      const x = typeof a === 'number' ? a : typeof a === 'string' && a.trim() !== '' ? +a : NaN;
      const y = typeof b === 'number' ? b : typeof b === 'string' && b.trim() !== '' ? +b : NaN;
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
      switch (op) { case '-': return x - y; case '*': return x * y; case '/': return y === 0 ? null : x / y; case '%': return y === 0 ? null : x % y; }
      return null;
    }

    // ---- evaluation; s = { p: row path, f: formula cache, vars } ----
    function ev(n, s) {
      switch (n.k) {
        case 'lit': return n.v;
        case 'list': return n.items.map((x) => ev(x, s));
        case 'id': return ident(n.name, s);
        case 'mem': return member(ev(n.obj, s), n.name, s);
        case 'idx': return index(ev(n.obj, s), ev(n.index, s), s);
        case 'call': return call(n, s);
        case 'un': { const v = ev(n.a, s); if (n.op === '!') return !truthy(v); if (n.op === '-') return typeof v === 'number' ? -v : isTag(v, 'dur') ? { t: 'dur', ms: -v.ms, mo: -v.mo } : null; return typeof v === 'number' ? v : null; }
        case 'bin': {
          if (n.op === '&&') return truthy(ev(n.a, s)) ? truthy(ev(n.b, s)) : false;
          if (n.op === '||') return truthy(ev(n.a, s)) ? true : truthy(ev(n.b, s));
          const a = ev(n.a, s), b = ev(n.b, s);
          switch (n.op) {
            case '==': return eq(a, b);
            case '!=': return !eq(a, b);
            case '<': return a != null && b != null && cmp(a, b) < 0;
            case '>': return a != null && b != null && cmp(a, b) > 0;
            case '<=': return a != null && b != null && cmp(a, b) <= 0;
            case '>=': return a != null && b != null && cmp(a, b) >= 0;
          }
          return arith(n.op, a, b);
        }
      }
      throw new Error('cannot evaluate ' + n.k);
    }
    function ident(name, s) {
      if (s.vars && name in s.vars) return s.vars[name];
      switch (name) {
        case 'file': return s.p == null ? null : { t: 'file', path: s.p };
        case 'note': return s.p == null ? null : { t: 'note', path: s.p };
        case 'formula': return { t: 'formulas', s };
        case 'this': return thisPath ? { t: 'ctx', path: thisPath } : null;
      }
      return s.p == null ? null : prop(s.p, name);
    }
    function formula(name, s) {
      if (!(name in formulas)) return null;
      if (!s.f) s.f = new Map();
      if (s.f.has(name)) { const v = s.f.get(name); if (v === LOOP) throw new Error(`formula "${name}" refers to itself`); return v; }
      s.f.set(name, LOOP);
      let v = null;
      try { v = formulas[name] ? ev(formulas[name], { p: s.p, f: s.f }) : null; } catch (e) { s.f.delete(name); throw e; }
      s.f.set(name, v);
      return v;
    }
    function member(o, name, s) {
      if (o == null) return null;
      if (typeof o === 'object' && !Array.isArray(o) && !(o instanceof RegExp)) {
        switch (o.t) {
          case 'note': return prop(o.path, name);
          case 'formulas': return formula(name, o.s);
          case 'ctx': return name === 'file' ? { t: 'file', path: o.path } : name === 'note' ? { t: 'note', path: o.path } : prop(o.path, name);
          case 'file': { const v = fileField(o.path, name); return v === undefined ? null : v; }
          case 'link': { if (!o.ok) return null; const v = fileField(o.path, name); return v === undefined ? prop(o.path, name) : v; }
          case 'date': {
            const d = new Date(o.ms);
            return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(), millisecond: d.getMilliseconds() }[name] ?? null;
          }
          case 'dur': return { days: durMs(o) / DAY, hours: durMs(o) / 36e5, minutes: durMs(o) / 6e4, seconds: durMs(o) / 1e3, milliseconds: durMs(o) }[name] ?? null;
        }
        const v = o[name];
        return v === undefined ? null : v;
      }
      if (name === 'length' && (typeof o === 'string' || Array.isArray(o))) return o.length;
      return null;
    }
    function index(o, i, s) {
      if (o == null || i == null) return null;
      if (Array.isArray(o) || typeof o === 'string') { const n = Math.trunc(+i); const v = o[n < 0 ? o.length + n : n]; return v === undefined ? null : v; }
      return member(o, String(i), s);
    }
    const lazy = new Set(['filter', 'map', 'reduce']);
    function call(n, s) {
      const c = n.callee;
      if (c.k === 'id') return globalFn(c.name, n.args, s);
      if (c.k !== 'mem') throw new Error('only functions and methods can be called');
      const recv = ev(c.obj, s);
      if (lazy.has(c.name) && Array.isArray(recv)) return listLazy(c.name, recv, n.args, s);
      const args = n.args.map((a) => ev(a, s));
      return method(recv, c.name, args, s);
    }
    function need(name, args, k) { if (args.length < k) throw new Error(`${name}() needs ${k} argument${k > 1 ? 's' : ''}`); }
    function globalFn(name, argNodes, s) {
      if (name === 'if') { need('if', argNodes, 2); return truthy(ev(argNodes[0], s)) ? ev(argNodes[1], s) : argNodes[2] ? ev(argNodes[2], s) : null; }
      const a = argNodes.map((x) => ev(x, s));
      switch (name) {
        case 'date': { need('date', a, 1); return asDate(a[0]); }
        case 'duration': { need('duration', a, 1); return asDur(a[0]); }
        case 'now': return date(now, true);
        case 'today': { const d = new Date(now); d.setHours(0, 0, 0, 0); return date(d.getTime(), false); }
        case 'list': return a[0] == null ? [] : Array.isArray(a[0]) ? a[0] : [a[0]];
        case 'link': {
          need('link', a, 1);
          if (typeof a[0] === 'string' && /^[a-z][a-z0-9+.-]*:\/\//i.test(a[0])) return a[0];
          const p = pathOf(a[0], s.p);
          return p == null ? null : { ...link(p, s.p), display: a[1] != null ? text(a[1]) : link(p, s.p).display };
        }
        case 'file': { need('file', a, 1); const p = pathOf(a[0], s.p); return p && env.has(p) ? { t: 'file', path: p } : null; }
        case 'number': {
          const v = a[0];
          if (typeof v === 'number') return v;
          if (typeof v === 'boolean') return v ? 1 : 0;
          if (isTag(v, 'date')) return v.ms;
          if (isTag(v, 'dur')) return durMs(v);
          const x = Number(String(v ?? '').trim());
          return v == null || String(v).trim() === '' || Number.isNaN(x) ? null : x;
        }
        case 'max': { const xs = a.flat().filter((x) => typeof x === 'number'); return xs.length ? Math.max(...xs) : null; }
        case 'min': { const xs = a.flat().filter((x) => typeof x === 'number'); return xs.length ? Math.min(...xs) : null; }
        case 'random': return Math.random();
        case 'escapeHTML': return text(a[0]).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
        case 'html': return text(a[0]);
        case 'image': return a[0] == null ? null : (isTag(a[0], 'link') ? a[0] : typeof a[0] === 'string' ? (/^[a-z]+:\/\//i.test(a[0]) ? a[0] : link(a[0], s.p)) : a[0]);
        case 'icon': return '';
      }
      throw new Error(`unknown function ${name}()`);
    }
    function listLazy(name, list, argNodes, s) {
      need(name, argNodes, 1);
      const scope = (value, i, acc) => ({ p: s.p, f: s.f, vars: { ...(s.vars || {}), value, index: i, ...(acc !== undefined ? { acc } : {}) } });
      if (name === 'filter') return list.filter((v, i) => truthy(ev(argNodes[0], scope(v, i))));
      if (name === 'map') return list.map((v, i) => ev(argNodes[0], scope(v, i)));
      let acc = argNodes[1] ? ev(argNodes[1], s) : null;
      list.forEach((v, i) => { acc = ev(argNodes[0], scope(v, i, acc)); });
      return acc;
    }
    // a list's identity keys, kept while the list lives (file.links lists are reused per query)
    const keySets = new WeakMap();
    const keysOf = (l) => { let k = keySets.get(l); if (!k) { k = new Set(l.map(key)); keySets.set(l, k); } return k; };
    function listHas(l, x) {
      if (x == null) return l.some((v) => v == null);
      const k = keysOf(l);
      if (k.has(key(x))) return true;
      if (typeof x === 'string' || typeof x === 'number' || isTag(x, 'date')) return l.some((v) => eq(v, x));
      return l.some((v) => typeof v === 'string' && eq(x, v));
    }
    function method(o, name, a, s) {
      // any value
      switch (name) {
        case 'isTruthy': return truthy(o);
        case 'isType': return typeOf(o) === lower(a[0]) || (lower(a[0]) === 'number' && typeof o === 'number') || (lower(a[0]) === 'string' && typeof o === 'string');
        case 'toString': return text(o);
        case 'isEmpty':
          if (o == null) return true;
          if (typeof o === 'string' || Array.isArray(o)) return o.length === 0;
          if (typeof o === 'object' && !o.t) return Object.keys(o).length === 0;
          return false;
      }
      if (o == null) return null;
      const t = typeOf(o);
      if (t === 'file' || (t === 'link' && o.ok && ['hasLink', 'hasTag', 'hasProperty', 'inFolder', 'asLink'].includes(name))) {
        const p = o.path;
        switch (name) {
          case 'asLink': return fileLink(p, a[0]);
          case 'asFile': return { t: 'file', path: p };
          case 'hasLink': {
            need('hasLink', a, 1);
            const target = pathOf(a[0], p);
            return target != null && linksTo(p, target);
          }
          case 'hasTag': {
            const have = tags(p).map((x) => lower(x).replace(/^#/, ''));
            return a.some((x) => { const w = lower(text(x)).replace(/^#/, ''); return have.some((h) => h === w || h.startsWith(w + '/')); });
          }
          case 'hasProperty': { need('hasProperty', a, 1); const o2 = props(p); const w = lower(a[0]); return Object.keys(o2).some((k) => lower(k) === w); }
          case 'inFolder': {
            need('inFolder', a, 1);
            const f = lower(text(a[0])).replace(/^\/+|\/+$/g, '');
            if (!f) return true;
            const pl = lower(p);
            return pl.startsWith(f + '/');
          }
        }
        if (t === 'file') throw new Error(`unknown file method ${name}()`);
      }
      if (t === 'link') {
        switch (name) {
          case 'asFile': return o.ok ? { t: 'file', path: o.path } : null;
          case 'linksTo': { if (!o.ok) return false; const target = pathOf(a[0], s.p); return target != null && linksTo(o.path, target); }
        }
        return method(text(o), name, a, s);
      }
      if (t === 'date') {
        switch (name) {
          case 'date': { const d = new Date(o.ms); d.setHours(0, 0, 0, 0); return date(d.getTime(), false); }
          case 'format': return formatDate(o.ms, a[0] == null ? 'YYYY-MM-DD' : text(a[0]));
          case 'time': return formatDate(o.ms, 'HH:mm:ss');
          case 'relative': return relative(o.ms, now);
        }
        throw new Error(`unknown date method ${name}()`);
      }
      if (t === 'string') {
        const str = o;
        switch (name) {
          case 'contains': return str.includes(text(a[0]));
          case 'containsAll': return a.every((x) => str.includes(text(x)));
          case 'containsAny': return a.some((x) => str.includes(text(x)));
          case 'startsWith': return str.startsWith(text(a[0]));
          case 'endsWith': return str.endsWith(text(a[0]));
          case 'lower': return str.toLowerCase();
          case 'upper': return str.toUpperCase();
          case 'title': return str.replace(/(^|\s)(\p{L})/gu, (m, sp, ch) => sp + ch.toUpperCase());
          case 'trim': return str.trim();
          case 'reverse': return [...str].reverse().join('');
          case 'repeat': return str.repeat(Math.max(0, Math.trunc(+a[0] || 0)));
          case 'slice': return str.slice(a[0] ?? 0, a[1] ?? undefined);
          case 'split': { const parts = str.split(a[0] instanceof RegExp ? a[0] : text(a[0])); return a[1] != null ? parts.slice(0, a[1]) : parts; }
          case 'replace': return a[0] instanceof RegExp ? str.replace(a[0], text(a[1])) : str.split(text(a[0])).join(text(a[1]));
          case 'matches': return a[0] instanceof RegExp ? a[0].test(str) : false;
        }
        throw new Error(`unknown text method ${name}()`);
      }
      if (t === 'number') {
        switch (name) {
          case 'abs': return Math.abs(o);
          case 'ceil': return Math.ceil(o);
          case 'floor': return Math.floor(o);
          case 'round': { const d = Math.max(0, Math.trunc(+a[0] || 0)); const f = 10 ** d; return Math.round(o * f) / f; }
          case 'toFixed': return o.toFixed(Math.max(0, Math.min(100, Math.trunc(+a[0] || 0))));
        }
        throw new Error(`unknown number method ${name}()`);
      }
      if (t === 'list') {
        const l = o;
        switch (name) {
          case 'contains': return listHas(l, a[0]);
          case 'containsAll': return a.every((x) => listHas(l, x));
          case 'containsAny': return a.some((x) => listHas(l, x));
          case 'flat': return l.flat();
          case 'join': return l.map(text).join(a[0] == null ? ',' : text(a[0]));
          case 'reverse': return l.slice().reverse();
          case 'slice': return l.slice(a[0] ?? 0, a[1] ?? undefined);
          case 'sort': return l.slice().sort(cmp);
          case 'unique': { const seen = new Set(); return l.filter((v) => { const k = key(v); if (seen.has(k)) return false; seen.add(k); return true; }); }
          case 'sum': return l.filter((v) => typeof v === 'number').reduce((x, y) => x + y, 0);
          case 'mean': case 'average': { const xs = l.filter((v) => typeof v === 'number'); return xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null; }
          case 'min': { const xs = l.filter((v) => v != null).sort(cmp); return xs.length ? xs[0] : null; }
          case 'max': { const xs = l.filter((v) => v != null).sort(cmp); return xs.length ? xs[xs.length - 1] : null; }
        }
        throw new Error(`unknown list method ${name}()`);
      }
      if (t === 'regexp') {
        if (name === 'matches') return o.test(text(a[0]));
        throw new Error(`unknown method ${name}()`);
      }
      if (t === 'object') {
        if (name === 'keys') return Object.keys(o);
        if (name === 'values') return Object.values(o);
      }
      throw new Error(`unknown method ${name}()`);
    }

    function safe(fn) {
      try { return fn(); } catch (e) { if (!firstError) firstError = e.message; return null; }
    }
    // filters: "expression" | { and: [...] } | { or: [...] } | { not: [...] } (none of them)
    function compileFilter(f) {
      if (f == null) return () => true;
      if (typeof f === 'string' || typeof f === 'number' || typeof f === 'boolean') {
        const ast = typeof f === 'string' ? compile(f) : { k: 'lit', v: f };
        return (s) => truthy(safe(() => ev(ast, s)));
      }
      if (Array.isArray(f)) { const all = f.map(compileFilter); return (s) => all.every((g) => g(s)); }
      if (typeof f === 'object') {
        const parts = [];
        for (const [k, v] of Object.entries(f)) {
          const list = (Array.isArray(v) ? v : [v]).map(compileFilter);
          if (k === 'and') parts.push((s) => list.every((g) => g(s)));
          else if (k === 'or') parts.push((s) => list.some((g) => g(s)));
          else if (k === 'not') parts.push((s) => !list.some((g) => g(s)));
          else throw new Error(`filters: "${k}" — use and, or, not`);
        }
        return (s) => parts.every((g) => g(s));
      }
      throw new Error('filters: unexpected value');
    }
    // "status" → note.status; "file.name", "formula.x", "note.x" stay
    const normId = (id) => { const s = String(id).trim(); return /^(file|formula|note)\./.test(s) ? s : 'note.' + s; };
    function valueOf(id, s) {
      const dot = id.indexOf('.');
      const ns = id.slice(0, dot), name = id.slice(dot + 1);
      if (ns === 'file') { const v = fileField(s.p, name); return v === undefined ? null : v; }
      if (ns === 'formula') return safe(() => formula(name, s));
      return prop(s.p, name);
    }
    return { ev, compileFilter, normId, valueOf, cmp, text, key, truthy, error: () => firstError, isTag };
  }

  // Default summaries, by name as the view file writes them
  function summarise(name, values, E) {
    const nums = values.filter((v) => typeof v === 'number');
    const dates = values.filter((v) => E.isTag(v, 'date'));
    const filled = values.filter((v) => !(v == null || v === '' || (Array.isArray(v) && !v.length)));
    switch (String(name).toLowerCase()) {
      case 'average': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      case 'sum': return nums.reduce((a, b) => a + b, 0);
      case 'min': return nums.length ? Math.min(...nums) : dates.length ? dates.reduce((a, b) => (b.ms < a.ms ? b : a)) : null;
      case 'max': return nums.length ? Math.max(...nums) : dates.length ? dates.reduce((a, b) => (b.ms > a.ms ? b : a)) : null;
      case 'median': { if (!nums.length) return null; const s = nums.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
      case 'stddev': { if (!nums.length) return null; const m = nums.reduce((a, b) => a + b, 0) / nums.length; return Math.sqrt(nums.reduce((a, b) => a + (b - m) ** 2, 0) / nums.length); }
      case 'range':
        if (nums.length) return Math.max(...nums) - Math.min(...nums);
        if (dates.length) { const ms = dates.map((d) => d.ms); return { t: 'dur', ms: Math.max(...ms) - Math.min(...ms), mo: 0 }; }
        return null;
      case 'earliest': return dates.length ? dates.reduce((a, b) => (b.ms < a.ms ? b : a)) : null;
      case 'latest': return dates.length ? dates.reduce((a, b) => (b.ms > a.ms ? b : a)) : null;
      case 'checked': return values.filter((v) => v === true).length;
      case 'unchecked': return values.filter((v) => v === false).length;
      case 'empty': return values.length - filled.length;
      case 'filled': return filled.length;
      case 'unique': return new Set(filled.map(E.key)).size;
    }
    return undefined;
  }

  // Run one view of a parsed view file over env.files.
  // Returns { views, view, type, columns: [{ id, name }], rows: [{ p, cells }], groups, summaries, total, error, warning }.
  function run(def, viewName, env, thisPath, maxRows = 2000) {
    if (def == null || typeof def !== 'object' || Array.isArray(def)) throw new Error('the file is empty or not a YAML mapping');
    const views = Array.isArray(def.views) && def.views.length ? def.views : [{ type: 'table', name: 'Table' }];
    const want = viewName ? String(viewName).toLowerCase() : null;
    const view = (want && views.find((v) => v && String(v.name || '').toLowerCase() === want)) || views[0] || {};
    const E = engine(def, env, thisPath);
    const pass = E.compileFilter(def.filters);
    const passView = E.compileFilter(view.filters);
    const rows = [];
    for (const p of env.files) {
      const s = { p, f: null };
      if (pass(s) && passView(s)) rows.push(s);
    }
    // columns
    const conf = (def.properties && typeof def.properties === 'object') ? def.properties : {};
    const order = (Array.isArray(view.order) && view.order.length ? view.order : ['file.name']).map(E.normId);
    const nameOf = (id) => {
      const c = conf[id] || conf[id.replace(/^note\./, '')] || null;
      if (c && c.displayName != null) return String(c.displayName);
      return id.startsWith('note.') ? id.slice(5) : id;
    };
    // sort: [{ property | column, direction }] — or one object
    const sorts = (Array.isArray(view.sort) ? view.sort : view.sort ? [view.sort] : [])
      .filter((x) => x && (x.property || x.column))
      .map((x) => ({ id: E.normId(x.property || x.column), dir: String(x.direction || 'ASC').toUpperCase() === 'DESC' ? -1 : 1 }));
    const group = view.groupBy && (view.groupBy.property || typeof view.groupBy === 'string')
      ? { id: E.normId(view.groupBy.property || view.groupBy), dir: String(view.groupBy.direction || 'ASC').toUpperCase() === 'DESC' ? -1 : 1 } : null;
    const val = (s, id) => { s.v = s.v || new Map(); if (!s.v.has(id)) s.v.set(id, E.valueOf(id, s)); return s.v.get(id); };
    if (sorts.length || group) {
      rows.sort((a, b) => {
        // empty values stay last whichever way the column sorts
        const by = (x, y, dir) => (x == null || y == null ? E.cmp(x, y) : E.cmp(x, y) * dir);
        if (group) { const c = by(val(a, group.id), val(b, group.id), group.dir); if (c) return c; }
        for (const so of sorts) { const c = by(val(a, so.id), val(b, so.id), so.dir); if (c) return c; }
        return 0;
      });
    }
    const total = rows.length;
    const limit = Number(view.limit) > 0 ? Math.floor(Number(view.limit)) : Infinity;
    const shown = rows.slice(0, Math.min(limit, maxRows));
    const cells = (s) => order.map((id) => val(s, id));
    const out = shown.map((s) => ({ p: s.p, cells: cells(s) }));
    let groups = null;
    if (group) {
      groups = [];
      let cur = null;
      for (let k = 0; k < shown.length; k++) {
        const g = val(shown[k], group.id);
        const gk = E.key(g);
        if (!cur || cur.k !== gk) { cur = { k: gk, key: g, rows: [] }; groups.push(cur); }
        cur.rows.push(out[k]);
      }
      let keep = view.groupOrder;
      if (Array.isArray(keep)) {
        const want = keep.map((x) => (x == null ? 'n:' : null));
        groups = groups.filter((gr) => keep.some((x, i) => (want[i] ? gr.k === 'n:' : E.text(gr.key).toLowerCase() === String(x).toLowerCase())));
      }
      groups = groups.map((gr) => ({ key: gr.key, rows: gr.rows }));
    }
    // summaries: { property: Average | <custom name> }
    let summaries = null;
    if (view.summaries && typeof view.summaries === 'object') {
      const custom = (def.summaries && typeof def.summaries === 'object') ? def.summaries : {};
      const limited = rows.slice(0, Math.min(limit, rows.length));
      summaries = order.map((id) => {
        const name = view.summaries[id] ?? view.summaries[id.replace(/^note\./, '')];
        if (name == null) return null;
        const values = limited.map((s) => val(s, id));
        let v;
        const cf = Object.keys(custom).find((k) => k.toLowerCase() === String(name).toLowerCase());
        if (cf) v = E.ev(compile(String(custom[cf])), { p: null, vars: { values } });
        else v = summarise(name, values, E);
        return v === undefined ? { name: String(name), value: null, error: 'unknown summary' } : { name: String(name), value: v };
      });
    }
    return {
      views: views.map((v, i) => String((v && v.name) || 'View ' + (i + 1))),
      view: String(view.name || 'View 1'),
      type: String(view.type || 'table'),
      columns: order.map((id) => ({ id, name: nameOf(id) })),
      rows: out,
      groups,
      summaries,
      total,
      truncated: shown.length < Math.min(total, limit),
      warning: E.error(),
    };
  }

  const api = { parseYaml, compile, tokenize, run, parseDur, formatDate };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Bases = api;
})(typeof self !== 'undefined' ? self : this);
