// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — search syntax (used by indexer.js; pure, no file access).
//
//   pump motor            both words (each as a word start: "pump" finds "pumps")
//   "hydraulic pump"      the exact phrase (case and accents optional)
//   -draft  -"old rev"    leave out notes with a word / phrase
//   valve OR actuator     either one (OR binds the terms on both sides)
//   *1133                 a fragment anywhere inside a word ("PW1133G", "A1133")
//   path:AMM/29           notes under a folder (or whose path contains the text)
//   title:pump            the note name contains the text
//   tag:#sop              notes with a tag (or a sub-tag: #sop/qa)
//
// parse() turns a query into clauses: a note must satisfy every clause, a
// clause is satisfied by any of its alternatives, and a negated term must not
// match. Unknown "field:" prefixes are searched as plain text, so a code such
// as "ATA:29" still finds something.
'use strict';

const { fold } = require('./search-index.js');

const FIELDS = new Set(['path', 'title', 'file', 'tag']);
const WORD = /[\p{L}\p{N}]+(?:[-._/][\p{L}\p{N}]+)*/gu;
const MIN_FRAGMENT = 3;

// split into raw tokens: quoted strings stay together, a leading "-" or a
// "field:" may precede a quote (-"old rev", path:"03 Library")
function tokens(q) {
  const out = [];
  const re = /(-?)(?:([A-Za-z]+):)?(?:"([^"]*)"?|(\S+))/g;
  let m;
  while ((m = re.exec(q))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out.push({ neg: m[1] === '-', field: m[2] ? m[2].toLowerCase() : null, quoted: m[3] !== undefined, text: m[3] !== undefined ? m[3] : m[4] });
  }
  return out;
}

function term(t) {
  let { neg, field, quoted, text } = t;
  if (field && !FIELDS.has(field)) { text = field + ':' + text; field = null; }
  if (field === 'file') field = 'title';
  const low = text.toLowerCase().trim();
  if (!low) return null;
  if (field === 'tag') return { kind: 'tag', neg, value: low.replace(/^#/, '') };
  if (field) return { kind: field, neg, value: low.replace(/\\/g, '/') };
  if (quoted) {
    const words = [...low.matchAll(WORD)].map((x) => x[0]);
    if (!words.length) return null;
    return words.length === 1 && low === words[0] ? { kind: 'word', neg, value: words[0] } : { kind: 'phrase', neg, value: low.replace(/\s+/g, ' '), words };
  }
  if (low.startsWith('*')) {
    const frag = low.replace(/^\*+|\*+$/g, '');
    if (frag.length >= MIN_FRAGMENT && /^[\p{L}\p{N}][\p{L}\p{N}\-._/]*$/u.test(frag)) return { kind: 'fragment', neg, value: frag };
    if (!frag) return null;
    // too short to look inside words: search it as a word start
  }
  const words = [...low.matchAll(WORD)].map((x) => x[0]);
  if (!words.length) return null;
  // "a,b" or "pump." → the words in it; several words typed together act like a phrase-free AND
  if (words.length === 1) return { kind: 'word', neg, value: words[0] };
  return { kind: 'all', neg, value: low, words };
}

function parse(q) {
  const clauses = [];
  const not = [];
  let joinNext = false;
  for (const raw of tokens(String(q || ''))) {
    if (!raw.neg && !raw.field && !raw.quoted && raw.text === 'OR') { if (clauses.length) joinNext = true; continue; }
    const t = term(raw);
    if (!t) continue;
    if (t.neg) { not.push(t); joinNext = false; continue; }
    if (joinNext && clauses.length) clauses[clauses.length - 1].push(t);
    else clauses.push([t]);
    joinNext = false;
  }
  return { clauses, not, empty: !clauses.length && !not.length };
}

// the text a hit should be highlighted with
function marks(parsed) {
  const out = [];
  for (const c of parsed.clauses) for (const t of c) {
    if (t.kind === 'word' || t.kind === 'phrase' || t.kind === 'fragment') out.push(t.value);
    else if (t.kind === 'all') out.push(...t.words);
  }
  return out;
}

// does a path / name match a field term
const stemOf = (p) => p.replace(/^.*\//, '').replace(/\.(md|markdown|canvas)$/i, '');
const ASCII = /^[\x00-\x7f]*$/;
// `s` contains `v`, accents optional (folding only when either has any)
function has(s, v) { return s.includes(v) || (!(ASCII.test(s) && ASCII.test(v)) && fold(s).includes(fold(v))); }
function fieldMatch(t, p, tags) {
  if (t.kind === 'path') {
    const pl = p.toLowerCase(), v = t.value.replace(/^\/+|\/+$/g, '');
    return has(pl, v);
  }
  if (t.kind === 'title') return has(stemOf(p).toLowerCase(), t.value);
  if (t.kind === 'tag') return (tags || []).some((x) => { const l = x.toLowerCase(); return l === t.value || l.startsWith(t.value + '/'); });
  return false;
}

// is a phrase in a note's text (whitespace-insensitive; accents optional when typed without)
function normText(text) { return text.toLowerCase().replace(/\s+/g, ' '); }
function phraseIn(t, low, folded) {
  if (low.includes(t.value)) return true;
  return folded !== undefined && folded.includes(fold(t.value));
}

module.exports = { parse, marks, fieldMatch, has, phraseIn, normText, stemOf, MIN_FRAGMENT };
