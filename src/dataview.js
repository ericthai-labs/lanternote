// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Lanternote — query language compatible with the Dataview query
// language (DQL), so ```dataview blocks written for it elsewhere give the same
// result here. Loaded by the indexer (require) which runs queries over the
// whole vault index, and by the window (<script>) which formats results.
//
// Supported: TABLE [WITHOUT ID] … | LIST [WITHOUT ID] [expr]; FROM with
// "folder", #tag, [[link]], outgoing([[link]]), AND / OR / - / ( ); WHERE,
// SORT (several keys, ASC/DESC), GROUP BY [AS], FLATTEN [AS], LIMIT, in the
// order written. Expressions: literals, fields (frontmatter, inline `key::`,
// file.*), row["key"], this, a.b / a[i], + - * / %, comparisons, AND OR !,
// and the common functions (date, dur, dateformat, choice, contains,
// startswith, regexmatch, length, round, string, default, join, …).
// TASK lists task lines (fields: text, status, completed, checked, due,
// scheduled, start, completion, created, line, path, children, … and the
// page's fields); CALENDAR <date> gives the notes per day.
// Not supported: dataviewjs, lambdas.
(function (root) {
  'use strict';

  // ---------------- values ----------------
  // date: { t: 'date', ms, time }  duration: { t: 'dur', ms }  link: { t: 'link', path, display, sub }
  const DAY = 86400000;
  const date = (ms, time = false) => ({ t: 'date', ms, time });
  const dur = (ms) => ({ t: 'dur', ms });
  const isDate = (v) => v && v.t === 'date', isDur = (v) => v && v.t === 'dur', isLink = (v) => v && v.t === 'link';
  const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

  const DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;
  function parseDate(s) {
    const m = DATE_RE.exec(String(s).trim());
    if (!m) return null;
    const [, y, mo, d = '01', h, mi, se] = m;
    if (m[7]) { const t = Date.parse(String(s).trim()); return Number.isNaN(t) ? null : date(t, true); }
    const t = new Date(+y, +mo - 1, +d, +(h || 0), +(mi || 0), +(se || 0)).getTime();
    return Number.isNaN(t) ? null : date(t, !!h);
  }
  const DUR_UNITS = [
    [/^(ms|millis(econds?)?)$/, 1], [/^(s|secs?|seconds?)$/, 1e3], [/^(m|mins?|minutes?)$/, 6e4], [/^(h|hrs?|hours?)$/, 36e5],
    [/^(d|days?)$/, DAY], [/^(w|wks?|weeks?)$/, 7 * DAY], [/^(mo|months?)$/, 30 * DAY], [/^(y|yrs?|years?)$/, 365 * DAY],
  ];
  function parseDur(s) {
    let total = 0, any = false;
    for (const m of String(s).toLowerCase().matchAll(/(-?\d+(?:\.\d+)?)\s*([a-z]+)/g)) {
      const u = DUR_UNITS.find(([re]) => re.test(m[2]));
      if (!u) return null;
      total += +m[1] * u[1]; any = true;
    }
    return any ? dur(total) : null;
  }
  // frontmatter / inline values arrive as strings (or lists of strings)
  function fromRaw(v, linkOf) {
    if (Array.isArray(v)) return v.map((x) => fromRaw(x, linkOf));
    if (v == null) return null;
    if (typeof v !== 'string') return v;
    const s = v.trim();
    if (s === '') return null;
    if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
    if (/^-?\d+(\.\d+)?$/.test(s) && !/^0\d/.test(s)) return +s;
    const dt = /^\d{4}-\d{2}-\d{2}/.test(s) ? parseDate(s) : null;
    if (dt) return dt;
    const lk = /^!?\[\[([^\]]+)\]\]$/.exec(s);
    if (lk && linkOf) return linkOf(lk[1]);
    return s;
  }

  function truthy(v) {
    if (v == null) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (isDur(v)) return v.ms !== 0;
    return true;
  }
  function typeRank(v) {
    if (v == null) return 0;
    if (typeof v === 'boolean') return 1;
    if (typeof v === 'number') return 2;
    if (typeof v === 'string') return 3;
    if (isDate(v)) return 4;
    if (isDur(v)) return 5;
    if (isLink(v)) return 6;
    if (Array.isArray(v)) return 7;
    return 8;
  }
  function compare(a, b) {
    const ra = typeRank(a), rb = typeRank(b);
    if (ra !== rb) {
      // a link compares with a string by its path / name
      if (isLink(a) && typeof b === 'string') return compare(a.path, b);
      if (typeof a === 'string' && isLink(b)) return compare(a, b.path);
      return ra - rb;
    }
    switch (ra) {
      case 0: return 0;
      case 1: case 2: return a === b ? 0 : a < b ? -1 : 1;
      case 3: return a === b ? 0 : a < b ? -1 : 1;
      case 4: case 5: return a.ms - b.ms;
      case 6: return compare(a.path, b.path);
      case 7: for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = compare(a[i], b[i]); if (c) return c; } return a.length - b.length;
      default: return 0;
    }
  }
  const equal = (a, b) => (isLink(a) && typeof b === 'string' ? a.path === b || a.display === b : compare(a, b) === 0);

  // ---------------- formatting (Luxon-style tokens, as Dataview uses) ----------------
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function formatDate(v, fmt) {
    const d = new Date(v.ms);
    const p2 = (n) => String(n).padStart(2, '0');
    const h12 = d.getHours() % 12 || 12;
    return fmt.replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|LLLL|LLL|LL|L|dd|d|EEEE|EEE|cccc|ccc|HH|H|hh|h|mm|m|ss|s|a/g, (t, lit) => {
      if (lit !== undefined) return lit;
      switch (t) {
        case 'yyyy': return String(d.getFullYear());
        case 'yy': return String(d.getFullYear()).slice(-2);
        case 'MMMM': case 'LLLL': return MONTHS[d.getMonth()];
        case 'MMM': case 'LLL': return MONTHS[d.getMonth()].slice(0, 3);
        case 'MM': case 'LL': return p2(d.getMonth() + 1);
        case 'M': case 'L': return String(d.getMonth() + 1);
        case 'dd': return p2(d.getDate());
        case 'd': return String(d.getDate());
        case 'EEEE': case 'cccc': return WEEKDAYS[d.getDay()];
        case 'EEE': case 'ccc': return WEEKDAYS[d.getDay()].slice(0, 3);
        case 'HH': return p2(d.getHours());
        case 'H': return String(d.getHours());
        case 'hh': return p2(h12);
        case 'h': return String(h12);
        case 'mm': return p2(d.getMinutes());
        case 'm': return String(d.getMinutes());
        case 'ss': return p2(d.getSeconds());
        case 's': return String(d.getSeconds());
        case 'a': return d.getHours() < 12 ? 'AM' : 'PM';
        default: return t;
      }
    });
  }
  function formatDur(v) {
    let ms = Math.abs(v.ms);
    const parts = [];
    for (const [n, u] of [['year', 365 * DAY], ['month', 30 * DAY], ['week', 7 * DAY], ['day', DAY], ['hour', 36e5], ['minute', 6e4], ['second', 1e3]]) {
      const k = Math.floor(ms / u);
      if (k) { parts.push(`${k} ${n}${k === 1 ? '' : 's'}`); ms -= k * u; }
    }
    return (v.ms < 0 ? '-' : '') + (parts.join(', ') || '0 seconds');
  }

  // ---------------- lexer ----------------
  function lex(src) {
    const out = [];
    let i = 0;
    const push = (type, value, raw) => out.push({ type, value, raw: raw ?? value, pos: i });
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '"') {
        let j = i + 1, s = '';
        while (j < src.length && src[j] !== '"') { if (src[j] === '\\' && (src[j + 1] === '"' || src[j + 1] === '\\')) { s += src[j + 1]; j += 2; } else s += src[j++]; }
        if (j >= src.length) throw new Error('A string is not closed with "');
        push('str', s, src.slice(i, j + 1)); i = j + 1; continue;
      }
      if (c === '[' && src[i + 1] === '[') {
        const j = src.indexOf(']]', i + 2);
        if (j < 0) throw new Error('A [[link is not closed');
        push('wikilink', src.slice(i + 2, j)); i = j + 2; continue;
      }
      if (c === '#' && /[\p{L}\p{N}_]/u.test(src[i + 1] || '')) {
        const m = /^#[\p{L}\p{N}_\-/]+/u.exec(src.slice(i));
        push('tag', m[0].slice(1)); i += m[0].length; continue;
      }
      const num = /^\d+(\.\d+)?/.exec(src.slice(i));
      if (num) { push('num', +num[0]); i += num[0].length; continue; }
      const id = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i));
      if (id) { push('id', id[0]); i += id[0].length; continue; }
      const op = /^(!=|<=|>=|&&|\|\||=>|[=<>+\-*/%!(),.[\]])/.exec(src.slice(i));
      if (op) { push('op', op[0]); i += op[0].length; continue; }
      throw new Error(`Unexpected character "${c}"`);
    }
    out.push({ type: 'eof', value: null, pos: i });
    return out;
  }

  // ---------------- parser ----------------
  const KW = new Set(['FROM', 'WHERE', 'SORT', 'GROUP', 'FLATTEN', 'LIMIT']);
  function parse(src) {
    const t = lex(src);
    let k = 0;
    const peek = () => t[k];
    const isKw = (tok, w) => tok.type === 'id' && tok.value.toUpperCase() === w;
    const eat = (type, value) => {
      const tok = t[k];
      if (tok.type !== type || (value !== undefined && (type === 'id' ? tok.value.toUpperCase() !== value : tok.value !== value))) {
        throw new Error(`Expected ${value || type} but found "${tok.raw ?? 'end of query'}"`);
      }
      k++; return tok;
    };
    const eatKw = (w) => eat('id', w);

    // expressions, lowest precedence first
    function expr() { return or(); }
    function or() { let l = and(); while (isKw(peek(), 'OR') || (peek().type === 'op' && peek().value === '||')) { k++; l = { op: 'or', l, r: and() }; } return l; }
    function and() { let l = cmp(); while (isKw(peek(), 'AND') || (peek().type === 'op' && peek().value === '&&')) { k++; l = { op: 'and', l, r: cmp() }; } return l; }
    function cmp() {
      let l = add();
      while (peek().type === 'op' && ['=', '!=', '<', '<=', '>', '>='].includes(peek().value)) { const o = t[k++].value; l = { op: o, l, r: add() }; }
      return l;
    }
    function add() { let l = mul(); while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) { const o = t[k++].value; l = { op: o, l, r: mul() }; } return l; }
    function mul() { let l = unary(); while (peek().type === 'op' && ['*', '/', '%'].includes(peek().value)) { const o = t[k++].value; l = { op: o, l, r: unary() }; } return l; }
    function unary() {
      if (peek().type === 'op' && peek().value === '!') { k++; return { op: 'not', e: unary() }; }
      if (peek().type === 'op' && peek().value === '-') { k++; return { op: 'neg', e: unary() }; }
      return postfix(primary());
    }
    function postfix(e) {
      for (;;) {
        const p = peek();
        if (p.type === 'op' && p.value === '.') { k++; const name = eat('id').value; e = { op: 'get', e, name }; continue; }
        if (p.type === 'op' && p.value === '[') { k++; const i = expr(); eat('op', ']'); e = { op: 'index', e, i }; continue; }
        return e;
      }
    }
    function primary() {
      const p = t[k];
      if (p.type === 'num') { k++; return { lit: p.value }; }
      if (p.type === 'str') { k++; return { lit: p.value }; }
      if (p.type === 'wikilink') { k++; return { linkLit: p.value }; }
      if (p.type === 'op' && p.value === '(') { k++; const e = expr(); eat('op', ')'); return e; }
      if (p.type === 'op' && p.value === '[') { // list literal
        k++; const items = [];
        if (!(peek().type === 'op' && peek().value === ']')) { items.push(expr()); while (peek().type === 'op' && peek().value === ',') { k++; items.push(expr()); } }
        eat('op', ']'); return { list: items };
      }
      if (p.type === 'id') {
        k++;
        const low = p.value.toLowerCase();
        if (low === 'true' || low === 'false') return { lit: low === 'true' };
        if (low === 'null') return { lit: null };
        if (peek().type === 'op' && peek().value === '(') {
          k++;
          const args = [];
          // dur(7 days) and date(today) take bare words
          if (low === 'dur' && peek().type === 'num') {
            let s = '';
            while (!(peek().type === 'op' && peek().value === ')') && peek().type !== 'eof') { const x = t[k++]; s += (x.type === 'op' && x.value === ',' ? ' ' : x.raw) + ' '; }
            eat('op', ')'); return { lit: parseDur(s) };
          }
          if (low === 'date' && peek().type === 'id' && /^(today|now|tomorrow|yesterday|sow|eow|som|eom|soy|eoy)$/i.test(peek().value) && t[k + 1].type === 'op' && t[k + 1].value === ')') {
            const w = t[k++].value.toLowerCase(); eat('op', ')'); return { dateWord: w };
          }
          if (!(peek().type === 'op' && peek().value === ')')) { args.push(expr()); while (peek().type === 'op' && peek().value === ',') { k++; args.push(expr()); } }
          eat('op', ')');
          return { call: low, args };
        }
        return { field: p.value };
      }
      throw new Error(`Unexpected "${p.raw ?? 'end of query'}"`);
    }
    function sourceExpr() {
      let l = sourceAnd();
      while (isKw(peek(), 'OR')) { k++; l = { or: [l, sourceAnd()] }; }
      return l;
    }
    function sourceAnd() {
      let l = sourceAtom();
      while (isKw(peek(), 'AND')) { k++; l = { and: [l, sourceAtom()] }; }
      return l;
    }
    function sourceAtom() {
      const p = peek();
      if (p.type === 'op' && p.value === '-') { k++; return { not: sourceAtom() }; }
      if (p.type === 'op' && p.value === '!') { k++; return { not: sourceAtom() }; }
      if (p.type === 'op' && p.value === '(') { k++; const s = sourceExpr(); eat('op', ')'); return s; }
      if (p.type === 'str') { k++; return { folder: p.value }; }
      if (p.type === 'tag') { k++; return { tag: p.value }; }
      if (p.type === 'wikilink') { k++; return { linksTo: p.value.split('|')[0] }; }
      if (p.type === 'id' && p.value.toLowerCase() === 'outgoing') { k++; eat('op', '('); const w = eat('wikilink').value; eat('op', ')'); return { linkedFrom: w.split('|')[0] }; }
      throw new Error(`FROM: expected "folder", #tag or [[link]] but found "${p.raw ?? 'end of query'}"`);
    }

    // header
    const q = { type: null, fields: [], withoutId: false, from: null, steps: [] };
    const head = eat('id');
    q.type = head.value.toUpperCase();
    if (!['TABLE', 'LIST', 'TASK', 'CALENDAR'].includes(q.type)) throw new Error(`A query starts with TABLE, LIST, TASK or CALENDAR, not "${head.value}"`);
    if (isKw(peek(), 'WITHOUT')) { k++; eatKw('ID'); q.withoutId = true; }
    const atClause = () => peek().type === 'eof' || (peek().type === 'id' && KW.has(peek().value.toUpperCase()));
    if (q.type === 'TABLE') {
      while (!atClause()) {
        const e = expr();
        let name = null;
        if (isKw(peek(), 'AS')) { k++; const n = t[k++]; name = n.type === 'str' || n.type === 'id' ? n.value : null; if (name == null) throw new Error('AS needs a name'); }
        q.fields.push({ e, name: name ?? exprText(e) });
        if (peek().type === 'op' && peek().value === ',') k++; else break;
      }
    } else if (q.type === 'CALENDAR') {
      if (atClause()) throw new Error('CALENDAR needs a date, e.g. CALENDAR file.mday');
      q.fields.push({ e: expr(), name: 'date' });
    } else if (q.type === 'LIST' && !atClause()) q.fields.push({ e: expr(), name: 'value' });
    while (peek().type !== 'eof') {
      const w = eat('id').value.toUpperCase();
      if (w === 'FROM') { if (q.from || q.steps.length) throw new Error('FROM must come right after the fields'); q.from = sourceExpr(); }
      else if (w === 'WHERE') q.steps.push({ where: expr() });
      else if (w === 'SORT') {
        const keys = [];
        for (;;) {
          const e = expr();
          let desc = false;
          if (peek().type === 'id' && /^(ASC|ASCENDING|DESC|DESCENDING)$/i.test(peek().value)) desc = /^DESC/i.test(t[k++].value);
          keys.push({ e, desc });
          if (peek().type === 'op' && peek().value === ',') k++; else break;
        }
        q.steps.push({ sort: keys });
      } else if (w === 'GROUP') { eatKw('BY'); const e = expr(); let as = null; if (isKw(peek(), 'AS')) { k++; as = t[k++].value; } q.steps.push({ group: e, as: as || exprText(e) }); }
      else if (w === 'FLATTEN') { const e = expr(); let as = null; if (isKw(peek(), 'AS')) { k++; as = t[k++].value; } q.steps.push({ flatten: e, as: as || exprText(e) }); }
      else if (w === 'LIMIT') { q.steps.push({ limit: eat('num').value }); }
      else throw new Error(`Unknown clause "${w}"`);
    }
    return q;
  }
  function exprText(e) {
    if (e.field) return e.field;
    if (e.op === 'get') return exprText(e.e) + '.' + e.name;
    if (e.call) return `${e.call}(${e.args.map(exprText).join(', ')})`;
    if (e.op === 'index') return `${exprText(e.e)}[${exprText(e.i)}]`;
    if ('lit' in e) return typeof e.lit === 'string' ? `"${e.lit}"` : String(e.lit);
    return '…';
  }

  // ---------------- evaluation ----------------
  // env: { row, get(row, name), page(path), linkOf(text, from), now, this }
  function ev(e, env) {
    if ('lit' in e) return e.lit;
    if (e.linkLit) return env.linkOf(e.linkLit);
    if (e.dateWord) {
      const now = env.now, day = startOfDay(now), d = new Date(day);
      switch (e.dateWord) {
        case 'now': return date(now, true);
        case 'today': return date(day);
        case 'tomorrow': return date(day + DAY);
        case 'yesterday': return date(day - DAY);
        case 'sow': return date(day - ((d.getDay() + 6) % 7) * DAY);
        case 'eow': return date(day + (6 - ((d.getDay() + 6) % 7)) * DAY);
        case 'som': return date(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
        case 'eom': return date(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime());
        case 'soy': return date(new Date(d.getFullYear(), 0, 1).getTime());
        default: return date(new Date(d.getFullYear(), 11, 31).getTime());
      }
    }
    if (e.list) return e.list.map((x) => ev(x, env));
    if (e.field) {
      if (e.field === 'this') return env.thisRow;
      if (e.field === 'row') return env.row;
      return env.get(env.row, e.field);
    }
    if (e.call) return call(e.call, e.args, env);
    switch (e.op) {
      case 'or': return truthy(ev(e.l, env)) || truthy(ev(e.r, env));
      case 'and': return truthy(ev(e.l, env)) && truthy(ev(e.r, env));
      case 'not': return !truthy(ev(e.e, env));
      case 'neg': { const v = ev(e.e, env); return typeof v === 'number' ? -v : isDur(v) ? dur(-v.ms) : null; }
      case '=': return equal(ev(e.l, env), ev(e.r, env));
      case '!=': return !equal(ev(e.l, env), ev(e.r, env));
      case '<': case '<=': case '>': case '>=': {
        const a = ev(e.l, env), b = ev(e.r, env);
        if (a == null || b == null) return false;
        const c = compare(a, b);
        return e.op === '<' ? c < 0 : e.op === '<=' ? c <= 0 : e.op === '>' ? c > 0 : c >= 0;
      }
      case '+': case '-': case '*': case '/': case '%': return arith(e.op, ev(e.l, env), ev(e.r, env));
      case 'get': return member(ev(e.e, env), e.name, env);
      case 'index': {
        const o = ev(e.e, env), i = ev(e.i, env);
        if (o == null) return null;
        if (Array.isArray(o) && typeof i === 'number') return o[i < 0 ? o.length + i : i] ?? null;
        if (typeof i === 'string') return member(o, i, env);
        return null;
      }
      default: throw new Error('Cannot evaluate this expression');
    }
  }
  function arith(op, a, b) {
    if (op === '+') {
      if (typeof a === 'string' || typeof b === 'string') return (a == null ? '' : display(a)) + (b == null ? '' : display(b));
      if (a == null || b == null) return null;
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      if (isDate(a) && isDur(b)) return date(a.ms + b.ms, a.time);
      if (isDur(a) && isDate(b)) return date(b.ms + a.ms, b.time);
      if (isDur(a) && isDur(b)) return dur(a.ms + b.ms);
      if (Array.isArray(a)) return a.concat(Array.isArray(b) ? b : [b]);
      return null;
    }
    if (a == null || b == null) return null;
    if (op === '-') {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (isDate(a) && isDate(b)) return dur(a.ms - b.ms);
      if (isDate(a) && isDur(b)) return date(a.ms - b.ms, a.time);
      if (isDur(a) && isDur(b)) return dur(a.ms - b.ms);
      return null;
    }
    if (typeof a === 'number' && typeof b === 'number') return op === '*' ? a * b : op === '/' ? (b === 0 ? null : a / b) : (b === 0 ? null : a % b);
    if (isDur(a) && typeof b === 'number') return op === '*' ? dur(a.ms * b) : op === '/' ? dur(a.ms / b) : null;
    return null;
  }
  function member(o, name, env) {
    if (o == null) return null;
    if (isDate(o)) {
      const d = new Date(o.ms);
      return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), weekday: d.getDay() || 7, hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(), week: isoWeek(d) }[name] ?? null;
    }
    if (isDur(o)) {
      const f = { years: 365 * DAY, months: 30 * DAY, weeks: 7 * DAY, days: DAY, hours: 36e5, minutes: 6e4, seconds: 1e3, milliseconds: 1 }[name];
      return f ? o.ms / f : null;
    }
    if (isLink(o)) {
      if (name === 'path') return o.path;
      if (name === 'display') return o.display;
      const row = env.page(o.path); // link.field reads the target note
      return row ? env.get(row, name) : null;
    }
    if (Array.isArray(o)) {
      if (name === 'length') return o.length;
      return o.map((x) => member(x, name, env)).flat(); // rows.field → list
    }
    if (typeof o === 'object') return env.get(o, name);
    if (typeof o === 'string' && name === 'length') return o.length;
    return null;
  }
  function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / DAY + 1) / 7); }

  function display(v) {
    if (v == null) return '';
    if (isDate(v)) return formatDate(v, v.time ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
    if (isDur(v)) return formatDur(v);
    if (isLink(v)) return v.display || v.path;
    if (Array.isArray(v)) return v.map(display).join(', ');
    return String(v);
  }
  function toStr(v) { return display(v); }

  function call(name, args, env) {
    const a = (i) => ev(args[i], env);
    const need = (n) => { if (args.length < n) throw new Error(`${name}() needs ${n} argument${n > 1 ? 's' : ''}`); };
    const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
    switch (name) {
      case 'date': { need(1); const v = a(0); if (isDate(v)) return v; if (isLink(v)) { const m = /(\d{4}-\d{2}-\d{2})/.exec(v.path); return m ? parseDate(m[1]) : null; } if (typeof v === 'string') return parseDate(v); if (typeof v === 'number') return date(v); return null; }
      case 'dur': { need(1); const v = a(0); return isDur(v) ? v : typeof v === 'string' ? parseDur(v) : null; }
      case 'dateformat': { need(2); const d = a(0), f = a(1); return isDate(d) && typeof f === 'string' ? formatDate(d, f) : null; }
      case 'choice': { need(3); return truthy(a(0)) ? a(1) : a(2); }
      case 'default': { need(2); const v = a(0); return v == null ? a(1) : v; }
      case 'length': { const v = a(0); return Array.isArray(v) || typeof v === 'string' ? v.length : v && typeof v === 'object' && !v.t ? Object.keys(v).length : 0; }
      case 'contains': case 'icontains': case 'econtains': {
        need(2); const h = a(0), n = a(1);
        const low = (x) => (name === 'icontains' && typeof x === 'string' ? x.toLowerCase() : x);
        if (typeof h === 'string') return low(h).includes(low(toStr(n)));
        if (Array.isArray(h)) return h.some((x) => (name === 'econtains' ? equal(x, n) : typeof x === 'string' && typeof n === 'string' ? low(x).includes(low(n)) : equal(x, n)));
        if (isLink(h)) return h.path.includes(toStr(n));
        return false;
      }
      case 'startswith': { need(2); const s = a(0), p = a(1); return typeof s === 'string' && typeof p === 'string' ? s.startsWith(p) : false; }
      case 'endswith': { need(2); const s = a(0), p = a(1); return typeof s === 'string' && typeof p === 'string' ? s.endsWith(p) : false; }
      case 'lower': return typeof a(0) === 'string' ? a(0).toLowerCase() : a(0);
      case 'upper': return typeof a(0) === 'string' ? a(0).toUpperCase() : a(0);
      case 'string': return a(0) == null ? null : toStr(a(0));
      case 'number': { const v = a(0); if (typeof v === 'number') return v; const m = /-?\d+(\.\d+)?/.exec(toStr(v)); return m ? +m[0] : null; }
      case 'round': { const v = a(0), d = args.length > 1 ? a(1) : 0; if (typeof v !== 'number') return null; const f = 10 ** (d || 0); return Math.round(v * f) / f; }
      case 'floor': return typeof a(0) === 'number' ? Math.floor(a(0)) : null;
      case 'ceil': return typeof a(0) === 'number' ? Math.ceil(a(0)) : null;
      case 'abs': return typeof a(0) === 'number' ? Math.abs(a(0)) : null;
      case 'min': case 'max': case 'sum': case 'average': {
        const vs = (args.length === 1 ? list(a(0)) : args.map((_, i) => a(i))).filter((x) => x != null);
        if (!vs.length) return null;
        if (name === 'sum') return vs.reduce((s, x) => arith('+', s, x));
        if (name === 'average') return vs.reduce((s, x) => s + x, 0) / vs.length;
        return vs.reduce((m, x) => ((name === 'min' ? compare(x, m) < 0 : compare(x, m) > 0) ? x : m));
      }
      case 'regexmatch': { need(2); const p = a(0), s = a(1); if (typeof s !== 'string' || typeof p !== 'string') return false; try { return new RegExp('^(?:' + p + ')$').test(s); } catch { return false; } }
      case 'regextest': { need(2); const p = a(0), s = a(1); if (typeof s !== 'string' || typeof p !== 'string') return false; try { return new RegExp(p).test(s); } catch { return false; } }
      case 'regexreplace': { need(3); const s = a(0), p = a(1), r = a(2); if (typeof s !== 'string') return s; try { return s.replace(new RegExp(p, 'g'), r); } catch { return s; } }
      case 'replace': { need(3); const s = a(0); return typeof s === 'string' ? s.split(toStr(a(1))).join(toStr(a(2))) : s; }
      case 'split': { need(2); const s = a(0); return typeof s === 'string' ? s.split(new RegExp(toStr(a(1)))) : null; }
      case 'join': { const l = list(a(0)); return l.map(display).join(args.length > 1 ? toStr(a(1)) : ', '); }
      case 'list': case 'array': return args.map((_, i) => a(i));
      case 'nonnull': return list(a(0)).filter((x) => x != null);
      case 'flat': return list(a(0)).flat();
      case 'reverse': return list(a(0)).slice().reverse();
      case 'sort': return list(a(0)).slice().sort(compare);
      case 'unique': { const out = []; for (const x of list(a(0))) if (!out.some((y) => equal(x, y))) out.push(x); return out; }
      case 'link': { const v = a(0); if (isLink(v)) return v; const l = env.linkOf(toStr(v)); if (l && args.length > 1) l.display = toStr(a(1)); return l; }
      case 'typeof': { const v = a(0); return v == null ? 'null' : isDate(v) ? 'date' : isDur(v) ? 'duration' : isLink(v) ? 'link' : Array.isArray(v) ? 'array' : typeof v; }
      case 'truncate': { const s = a(0), n = a(1); return typeof s === 'string' && s.length > n ? s.slice(0, n) + (args.length > 2 ? toStr(a(2)) : '...') : s; }
      case 'padleft': case 'padright': { const s = toStr(a(0)), n = a(1), c = args.length > 2 ? toStr(a(2)) : ' '; return name === 'padleft' ? s.padStart(n, c) : s.padEnd(n, c); }
      case 'striptime': { const v = a(0); return isDate(v) ? date(startOfDay(v.ms)) : null; }
      case 'meta': { const v = a(0); return isLink(v) ? { path: v.path, display: v.display, subpath: v.sub || null } : null; }
      default: throw new Error(`Unknown function ${name}()`);
    }
  }

  // ---------------- running a query ----------------
  // ctx: { rows(source) → iterable of rows, get(row, name), page(path), linkOf(text, from), thisRow, now }
  // A row is whatever ctx.get understands; group rows are { key, rows }.
  function run(q, ctx) {
    const t0 = Date.now();
    const env = { get: ctx.get, page: ctx.page, linkOf: ctx.linkOf, now: ctx.now || Date.now(), thisRow: ctx.thisRow, row: null };
    let rows = [...ctx.rows(q.from)];
    let grouped = false;
    for (const s of q.steps) {
      if (s.where) rows = rows.filter((r) => { env.row = r; return truthy(ev(s.where, env)); });
      else if (s.sort) {
        const keyed = rows.map((r) => { env.row = r; return { r, k: s.sort.map((x) => ev(x.e, env)) }; });
        keyed.sort((a, b) => { for (let i = 0; i < s.sort.length; i++) { const c = compare(a.k[i], b.k[i]); if (c) return s.sort[i].desc ? -c : c; } return 0; });
        rows = keyed.map((x) => x.r);
      } else if (s.group) {
        const map = new Map();
        for (const r of rows) {
          env.row = r;
          const key = ev(s.group, env);
          const id = JSON.stringify(key && typeof key === 'object' ? (isLink(key) ? key.path : key) : key);
          if (!map.has(id)) map.set(id, { key, rows: [] });
          map.get(id).rows.push(r);
        }
        rows = [...map.values()].map((gr) => ({ __group: true, key: gr.key, rows: gr.rows, [s.as]: gr.key }));
        grouped = true;
      } else if (s.flatten) {
        const out = [];
        for (const r of rows) {
          env.row = r;
          const v = ev(s.flatten, env);
          for (const x of Array.isArray(v) ? v : [v]) out.push({ __flat: true, base: r, name: s.as, value: x });
        }
        rows = out;
      } else if (s.limit != null) rows = rows.slice(0, s.limit);
    }
    const idOf = (r) => (r.__group ? r.key : r.__flat ? ctx.idOf(r.base) : ctx.idOf(r));
    const result = { type: q.type, grouped, total: rows.length, ms: 0 };
    if (q.type === 'TASK') {
      // grouped by the note they are in, unless GROUP BY said otherwise
      if (grouped) result.groups = rows.map((gr) => ({ key: gr.key, tasks: gr.rows.map(ctx.taskOut) }));
      else {
        const by = new Map();
        for (const r of rows) { const o = ctx.taskOut(r); if (!by.has(o.path)) by.set(o.path, { key: idOf(r), tasks: [] }); by.get(o.path).tasks.push(o); }
        result.groups = [...by.values()];
      }
      result.ms = Date.now() - t0;
      return result;
    }
    if (q.type === 'CALENDAR') {
      // one entry per day: how many notes, and the first ones
      const days = new Map();
      let n = 0;
      for (const r of rows) {
        env.row = r;
        let v = ev(q.fields[0].e, env);
        if (typeof v === 'string') v = parseDate(v);
        if (!isDate(v)) continue;
        const key = startOfDay(v.ms);
        let d = days.get(key);
        if (!d) days.set(key, (d = { ms: key, n: 0, items: [] }));
        d.n++; n++;
        if (d.items.length < 30) d.items.push(idOf(r));
      }
      result.days = [...days.values()].sort((a, b) => a.ms - b.ms);
      result.total = n;
      result.ms = Date.now() - t0;
      return result;
    }
    if (q.type === 'TABLE') {
      result.idColumn = !q.withoutId;
      result.headers = [...(q.withoutId ? [] : [grouped ? 'Group' : 'File']), ...q.fields.map((f) => f.name)];
      result.rows = rows.map((r) => { env.row = r; return [...(q.withoutId ? [] : [idOf(r)]), ...q.fields.map((f) => ev(f.e, env))]; });
    } else {
      result.rows = rows.map((r) => {
        env.row = r;
        const v = q.fields.length ? ev(q.fields[0].e, env) : undefined;
        return q.withoutId ? [v] : q.fields.length ? [idOf(r), v] : [idOf(r)];
      });
    }
    result.ms = Date.now() - t0;
    return result;
  }

  // Row field lookup shared by the indexer: exact key, then lower-case,
  // then Dataview's sanitised form ("Trang Thai" → "trang-thai").
  const sanitise = (k) => k.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');

  const api = { parse, run, truthy, compare, display, formatDate, formatDur, parseDate, parseDur, fromRaw, sanitise, isDate, isDur, isLink };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DQL = api;
})(typeof self !== 'undefined' ? self : this);
