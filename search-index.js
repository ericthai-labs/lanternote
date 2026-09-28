// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Lanternote — compact full-text index (used by indexer.js).
// Replaces "keep every note's text in memory" (~500 MB for 190k notes) with
// an inverted index of words that is saved to disk and loaded on reopen, so
// a restart does not have to read every note again.
//
//   dictionary: every distinct word, sorted, packed in one UTF-8 buffer
//   postings:   for each word the notes containing it, delta + varint coded
//
// Words are runs of letters/digits, with codes such as "29-11-00-710-801-a"
// or "pw1133g-jm" kept whole *and* split into parts. A query word matches
// any indexed word it is the beginning of ("pump" → "pumps"). Vietnamese
// words are also indexed without diacritics, so "tau bay" finds "tàu bay".
// Notes changed after the index was built live in a small in-memory delta
// until the next rebuild.
'use strict';

const WORD = /[\p{L}\p{N}]+(?:[-._/][\p{L}\p{N}]+)*/gu;
const SPLIT = /[-._/]/;
const fold = (w) => w.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
const MAX_WORD = 48;

// A code like 29-11-00-710-801-a also yields its parts and every tail
// (00-710-801-a, 801-a…), so any run of parts matches as a word start.
function addWord(w, out) {
  out.add(w);
  if (!SPLIT.test(w)) return;
  let start = 0;
  for (let i = 0; i <= w.length; i++) {
    if (i < w.length && !SPLIT.test(w[i])) continue;
    if (i > start) out.add(w.slice(start, i));          // part
    if (i < w.length && w[i + 1]) out.add(w.slice(i + 1)); // tail
    start = i + 1;
  }
}

// the distinct words of a text (lower-cased), with parts, tails and folded forms
function words(text, out = new Set()) {
  for (const m of text.toLowerCase().matchAll(WORD)) {
    const w = m[0];
    if (w.length > MAX_WORD) continue;
    addWord(w, out);
    if (/[^\x00-\x7f]/.test(w)) { const f = fold(w); if (f !== w) addWord(f, out); }
  }
  return out;
}

function writeVarint(arr, v) { while (v >= 0x80) { arr.push((v & 0x7f) | 0x80); v >>>= 7; } arr.push(v); }

class Builder {
  constructor() {
    this.ids = new Map();           // word → id
    this.pairs = new Uint32Array(1 << 20);
    this.n = 0;                     // pairs used (word id, doc id)
    this.docs = [];
  }
  add(path, text) {
    const doc = this.docs.length;
    this.docs.push(path);
    const set = words(text);
    words(path.replace(/\.(md|markdown)$/i, ''), set);
    for (const w of set) {
      let id = this.ids.get(w);
      if (id === undefined) { id = this.ids.size; this.ids.set(w, id); }
      if (this.n + 2 > this.pairs.length) { const b = new Uint32Array(this.pairs.length * 2); b.set(this.pairs); this.pairs = b; }
      this.pairs[this.n++] = id; this.pairs[this.n++] = doc;
    }
  }
  finish() {
    const W = this.ids.size;
    // sort words; old id → rank
    const list = [...this.ids.keys()];
    const order = Uint32Array.from({ length: W }, (_, i) => i).sort((a, b) => (list[a] < list[b] ? -1 : list[a] > list[b] ? 1 : 0));
    const rank = new Uint32Array(W);
    order.forEach((id, r) => { rank[id] = r; });
    // dictionary buffer
    const parts = Array.from(order, (id) => Buffer.from(list[id], 'utf8'));
    const dictOff = new Uint32Array(W + 1);
    parts.forEach((b, r) => { dictOff[r + 1] = dictOff[r] + b.length; });
    const dict = Buffer.concat(parts);
    // postings: count per word, bucket docs, delta + varint
    const cnt = new Uint32Array(W + 1);
    for (let i = 0; i < this.n; i += 2) cnt[rank[this.pairs[i]] + 1]++;
    for (let r = 0; r < W; r++) cnt[r + 1] += cnt[r];
    const fill = cnt.slice(0, W), flat = new Uint32Array(this.n / 2);
    for (let i = 0; i < this.n; i += 2) flat[fill[rank[this.pairs[i]]]++] = this.pairs[i + 1];
    this.pairs = null;
    const bytes = [];
    const postOff = new Uint32Array(W + 1);
    let chunks = [], size = 0;
    for (let r = 0; r < W; r++) {
      let prev = 0;
      for (let q = cnt[r]; q < cnt[r + 1]; q++) { writeVarint(bytes, flat[q] - prev); prev = flat[q]; } // docs arrive in increasing order
      if (bytes.length > 1 << 20) { chunks.push(Buffer.from(bytes)); size += bytes.length; bytes.length = 0; }
      postOff[r + 1] = size + bytes.length;
    }
    chunks.push(Buffer.from(bytes));
    return new Index({ docs: this.docs, dict, dictOff, post: Buffer.concat(chunks), postOff, df: cnt });
  }
}

class Index {
  constructor({ docs, dict, dictOff, post, postOff }) {
    this.docs = docs;
    this.dict = dict; this.dictOff = dictOff; this.post = post; this.postOff = postOff;
    this.docOf = new Map(docs.map((p, i) => [p, i]));
    this.stale = new Set();          // doc ids whose postings are out of date
    this.delta = new Map();          // path → Set of words, for notes changed since the build
  }
  get words() { return this.dictOff.length - 1; }
  get bytes() { return this.dict.length + this.post.length + this.dictOff.byteLength + this.postOff.byteLength; }
  word(r) { return this.dict.toString('utf8', this.dictOff[r], this.dictOff[r + 1]); }
  // first dictionary rank whose word is >= w (byte order = UTF-8 order)
  lower(wb) {
    let lo = 0, hi = this.words;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (Buffer.compare(this.dict.subarray(this.dictOff[mid], this.dictOff[mid + 1]), wb) < 0) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
  // docs containing a word that starts with `prefix`
  prefixDocs(prefix, limitWords = 50000) {
    const pb = Buffer.from(prefix, 'utf8');
    const out = new Set();
    for (let r = this.lower(pb), n = 0; r < this.words && n < limitWords; r++, n++) {
      const a = this.dictOff[r], len = this.dictOff[r + 1] - a;
      if (len < pb.length || this.dict.compare(pb, 0, pb.length, a, a + pb.length) !== 0) break;
      let p = this.postOff[r], doc = 0;
      const end = this.postOff[r + 1];
      while (p < end) {
        let v = 0, s = 0, b;
        do { b = this.post[p++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80);
        doc += v;
        if (!this.stale.has(doc)) out.add(doc);
      }
    }
    return out;
  }
  // paths of the notes containing every query word (as a word start);
  // words typed without diacritics also match the folded forms
  query(q) {
    const typed = [];
    for (const m of q.toLowerCase().matchAll(WORD)) typed.push(m[0]);
    if (!typed.length) return [];
    let acc = null;
    for (const t of typed) {
      const set = this.prefixDocs(t);
      if (acc) { for (const d of acc) if (!set.has(d)) acc.delete(d); } else acc = set;
      if (!acc.size) break;
    }
    const out = [];
    for (const d of acc) out.push(this.docs[d]);
    // notes changed since the build
    for (const [p, set] of this.delta) {
      if (typed.every((t) => { for (const w of set) if (w.startsWith(t)) return true; return false; })) out.push(p);
    }
    return out;
  }
  // a note changed or appeared: its old postings no longer count
  update(path, text) {
    const d = this.docOf.get(path);
    if (d !== undefined) this.stale.add(d);
    if (text == null) this.delta.delete(path);
    else { const set = words(text); words(path.replace(/\.(md|markdown)$/i, ''), set); this.delta.set(path, set); }
  }
  serialize() {
    return { docs: this.docs, dict: this.dict, dictOff: this.dictOff, post: this.post, postOff: this.postOff, stale: [...this.stale], delta: [...this.delta].map(([p, s]) => [p, [...s]]) };
  }
  static from(o) {
    const ix = new Index({ docs: o.docs, dict: Buffer.from(o.dict.buffer, o.dict.byteOffset, o.dict.byteLength), dictOff: o.dictOff, post: Buffer.from(o.post.buffer, o.post.byteOffset, o.post.byteLength), postOff: o.postOff });
    for (const d of o.stale || []) ix.stale.add(d);
    for (const [p, s] of o.delta || []) ix.delta.set(p, new Set(s));
    return ix;
  }
}

module.exports = { Builder, Index, words, fold };
