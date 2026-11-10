// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Edits answered with a delta instead of a whole snapshot (1.25.1): after every edit, the
// indexer's patched snapshot AND a window-side copy kept up to date with the deltas alone must
// equal a snapshot built from scratch by a second indexer. Links, tags, document status,
// modified times; new and deleted files fall back to a full snapshot.
// Runs indexer.js directly on a TEMPORARY folder, no window needed.
//   node tests/update-delta.js
const { Worker } = require('worker_threads');
const fs = require('fs'), path = require('path'), os = require('os');
const Core = require('../src/core.js');
const V = path.join(os.tmpdir(), 'lanternote-delta-vault'), C = path.join(os.tmpdir(), 'lanternote-delta-cache');
fs.rmSync(V, { recursive: true, force: true }); fs.rmSync(C, { recursive: true, force: true });
const w = (p, t) => { fs.mkdirSync(path.dirname(path.join(V, p)), { recursive: true }); fs.writeFileSync(path.join(V, p), t); };

// 300 notes in 6 folders, each linking to a few others
const N = 300;
const name = (i) => `Note ${String(i).padStart(3, '0')}`;
const rel = (i) => `F${i % 6}/${name(i)}.md`;
for (let i = 0; i < N; i++) w(rel(i), `---\nstatus: ${i % 40 === 0 ? 'superseded' : 'current'}\nrevision: Rev ${i % 5}\n---\n# ${name(i)}\n\nSee [[${name((i * 7 + 1) % N)}]] and [[${name((i * 13 + 5) % N)}]]. #group/${i % 9}\n`);
w('Hub.md', '# Hub\n\nStarts with [[Note 001]].\n');
w('board.canvas', '{}');

let failed = 0;
const check = (ok, what, info = '') => { console.log(ok ? 'PASS' : 'FAIL', what, info); if (!ok) failed++; };
function start(cacheDir) {
  const wk = new Worker(path.join(__dirname, '..', 'indexer.js'), { workerData: { cacheDir } });
  const waits = new Map(); let seq = 0;
  wk.on('message', (m) => { if (m.type) return; const x = waits.get(m.id); if (!x) return; waits.delete(m.id); m.error ? x.rej(new Error(m.error)) : x.res(m.result); });
  return { ask: (cmd, args) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); wk.postMessage({ id, cmd, args }); }), stop: () => wk.terminate() };
}
// a snapshot built from nothing, by another indexer with an empty cache
let fresh = 0;
async function truth() {
  const dir = path.join(C, 'truth-' + (++fresh));
  const b = start(dir);
  const s = await b.ask('open', { root: V });
  await b.stop();
  return s;
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const tagsOf = (s) => JSON.stringify(s.tagNames.map((t, k) => [t, [...s.tagFiles.subarray(s.tagOff[k], s.tagOff[k + 1])].sort((x, y) => x - y).join(',')]).sort((x, y) => (x[0] < y[0] ? -1 : 1)));
const revsOf = (s) => JSON.stringify([...s.revIdx].map((i, k) => [i, s.revStr[k]]));
function equal(x, t) {
  const bad = [];
  if (!same(x.files, t.files)) bad.push('files');
  if (!same(x.edges, t.edges)) bad.push(`links ${x.edges.length / 2} vs ${t.edges.length / 2}`);
  if (!same(x.mtimes, t.mtimes)) bad.push('modified times');
  if (tagsOf(x) !== tagsOf(t)) bad.push('tags');
  if (!same(x.status, t.status)) bad.push('status');
  if (revsOf(x) !== revsOf(t)) bad.push('revisions');
  return bad.join(', ');
}
// what the window does with a delta (applyDelta in src/app.js)
function apply(model, d) {
  for (let k = 0; k < d.idx.length; k++) model.mtimes[d.idx[k]] = d.mtimes[k];
  const rep = new Map();
  for (let k = 0; k < d.idx.length; k++) if (d.outs[k]) rep.set(d.idx[k], d.outs[k]);
  if (rep.size) model.edges = Core.spliceEdges(model.edges, Core.edgeOffsets(model.edges, model.files.length), rep);
  if (d.tags) Object.assign(model, d.tags);
  if (d.status) Object.assign(model, d.status);
}
const read = (p) => fs.readFileSync(path.join(V, p), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const a = start(path.join(C, 'a'));
  let model = await a.ask('open', { root: V });
  check(!equal(model, await truth()), 'the first snapshot equals one built from nothing');

  // one edit: write files, tell the indexer, compare everything
  async function edit(what, changes, expect) {
    await sleep(15); // a new modified time
    for (const [p, t] of Object.entries(changes)) { if (t === null) fs.rmSync(path.join(V, p)); else w(p, t); }
    const r = await a.ask('update', { changed: Object.keys(changes), delta: true });
    const kind = !r ? 'nothing' : r.delta ? 'delta' : r.snapshot ? 'full' : 'none';
    if (r && r.delta) apply(model, r.delta); else if (r && r.snapshot) model = r.snapshot;
    const t = await truth();
    const d1 = equal(model, t), d2 = equal(await a.ask('snap'), t);
    const detail = r && r.delta ? ` (links changed: ${r.delta.outs.filter(Boolean).length}, tags: ${!!r.delta.tags}, status: ${!!r.delta.status})` : '';
    check(kind === expect.kind && !d1 && !d2 && (!expect.test || expect.test(r)), what, `→ ${kind}${detail}${d1 ? ' | window copy differs: ' + d1 : ''}${d2 ? ' | indexer differs: ' + d2 : ''}`);
    return r;
  }
  const only = (o) => (r) => r.delta.outs.some(Boolean) === !!o.links && !!r.delta.tags === !!o.tags && !!r.delta.status === !!o.status;

  await edit('more text, nothing else', { 'Hub.md': read('Hub.md') + '\nA line of plain text.\n' }, { kind: 'delta', test: only({}) });
  await edit('the same text written again (modified time only)', { 'Hub.md': read('Hub.md') }, { kind: 'delta', test: only({}) });
  const before = model.edges.length / 2;
  await edit('a new link', { 'Hub.md': read('Hub.md') + '\nAlso [[Note 250]].\n' }, { kind: 'delta', test: (r) => only({ links: 1 })(r) && r.delta.links === before + 1 });
  await edit('a repeated link, a link to itself and one to a missing note change nothing', { 'Hub.md': read('Hub.md') + '\n[[Note 250]] [[Hub]] [[No such note]]\n' }, { kind: 'delta', test: only({}) });
  await edit('a link removed', { 'Hub.md': read('Hub.md').replace('Starts with [[Note 001]].', 'Starts here.') }, { kind: 'delta', test: (r) => only({ links: 1 })(r) && r.delta.links === before });
  await edit('a link by path, in another order', { [rel(10)]: read(rel(10)).replace('See ', `See [[${rel(200).replace(/\.md$/, '')}]] then `) }, { kind: 'delta', test: only({ links: 1 }) });
  await edit('a new tag', { 'Hub.md': read('Hub.md') + '\n#fresh/tag\n' }, { kind: 'delta', test: only({ tags: 1 }) });
  await edit('a tag removed from a note that shares it', { [rel(9)]: read(rel(9)).replace(' #group/0', '') }, { kind: 'delta', test: only({ tags: 1 }) });
  await edit('document status: current → superseded', { [rel(3)]: read(rel(3)).replace('status: current', 'status: superseded') }, { kind: 'delta', test: only({ status: 1 }) });
  await edit('a new revision', { [rel(4)]: read(rel(4)).replace('revision: Rev 4', 'revision: Rev 9') }, { kind: 'delta', test: only({ status: 1 }) });
  await edit('front matter added to a note without one', { 'Hub.md': '---\nstatus: draft\ntags: [hub]\n---\n' + read('Hub.md') }, { kind: 'delta', test: only({ tags: 1, status: 1 }) });
  await edit('three notes at once: links, tags and text', {
    [rel(20)]: read(rel(20)) + '\n[[Hub]] [[Note 021]]\n', [rel(21)]: read(rel(21)) + '\n#another\n', [rel(22)]: read(rel(22)) + '\nplain\n',
  }, { kind: 'delta', test: (r) => r.delta.idx.length === 3 && only({ links: 1, tags: 1 })(r) });
  await edit('the first and the last note of the list', { [model.files.find((f) => f.endsWith('.md'))]: '# First\n\n[[Hub]]\n', [[...model.files].reverse().find((f) => f.endsWith('.md'))]: '# Last\n\n[[Hub]] [[Note 100]]\n' }, { kind: 'delta', test: only({ links: 1, tags: 1, status: 1 }) }); // both lose their tags and status too
  await edit('every link of a note removed', { [rel(30)]: '# Empty now\n' }, { kind: 'delta', test: only({ links: 1, tags: 1, status: 1 }) });

  // a query sees the change at once, and still answers after an edit that changed no link
  await edit('a link to Note 299', { 'Hub.md': read('Hub.md') + '\n[[Note 299]]\n' }, { kind: 'delta', test: only({ links: 1 }) });
  const q = async () => (await a.ask('dv', { q: 'LIST FROM [[Note 299]]', origin: 'Hub.md' })).rows.map((r) => r[0].path).join(',');
  check((await q()).includes('Hub.md'), 'a query follows the new link', await q());
  await edit('text only, after a query', { 'Hub.md': read('Hub.md') + '\nmore\n' }, { kind: 'delta', test: only({}) });
  check((await q()).includes('Hub.md'), 'the query still answers');

  // the file list changes: a whole snapshot, then deltas again
  await edit('a new note: whole snapshot', { 'F0/Brand new.md': '# Brand new\n\n[[Hub]] #group/0\n' }, { kind: 'full' });
  await edit('an edit right after: delta again', { 'F0/Brand new.md': '# Brand new\n\n[[Hub]] [[Note 002]]\n' }, { kind: 'delta', test: only({ links: 1, tags: 1 }) });
  await edit('a link to the new note from an old one', { [rel(40)]: read(rel(40)) + '\n[[Brand new]]\n' }, { kind: 'delta', test: only({ links: 1 }) });
  await edit('a note deleted: whole snapshot', { [rel(41)]: null }, { kind: 'full' });
  await edit('an edit after the deletion: delta', { [rel(42)]: read(rel(42)) + '\n[[Hub]]\n' }, { kind: 'delta', test: only({ links: 1 }) });
  await edit('a new note and an edit together: whole snapshot', { 'F1/Another new.md': '# Another\n', 'Hub.md': read('Hub.md') + '\n[[Another new]]\n' }, { kind: 'full' });
  const r = await edit('a canvas rewritten: the index is not touched', { 'board.canvas': '{"nodes":[]}' }, { kind: 'none' });
  check(r && r.snapshot === null && !r.delta && r.changed.join() === 'board.canvas', 'only the changed file is named');

  // callers that do not ask for a delta still get the whole snapshot
  await sleep(15);
  w('Hub.md', read('Hub.md') + '\n[[Note 150]]\n');
  const full = await a.ask('update', { changed: ['Hub.md'] });
  check(full && full.snapshot && !full.delta && !equal(full.snapshot, await truth()), 'without delta: true the answer is a whole, correct snapshot');
  model = full.snapshot;

  // many edits in a row stay exact
  let drift = '';
  for (let k = 0; k < 40 && !drift; k++) {
    await sleep(3);
    const i = (k * 37) % N; if (i === 41) continue;
    w(rel(i), read(rel(i)) + (k % 3 === 0 ? `\n[[${name((k * 11) % N)}]]\n` : k % 3 === 1 ? `\n#t${k % 4}\n` : '\ntext\n'));
    const u = await a.ask('update', { changed: [rel(i)], delta: true });
    if (!u || !u.delta) { drift = 'edit ' + k + ' was not a delta'; break; }
    apply(model, u.delta);
  }
  const end = await truth();
  drift = drift || equal(model, end) || equal(await a.ask('snap'), end);
  check(!drift, '40 edits in a row: the window copy and the indexer still equal a fresh build', drift);

  // the saved cache holds the patched snapshot: a second start shows the same graph
  await a.ask('flush');
  await a.stop();
  const a2 = start(path.join(C, 'a'));
  const again = await a2.ask('open', { root: V, instant: true });
  check(again.timing.cached && !equal(again, end), 'reopened from the cache: the same snapshot', JSON.stringify(again.timing));
  await sleep(10);
  w('Hub.md', read('Hub.md') + '\n[[Note 111]]\n');
  const u2 = await a2.ask('update', { changed: ['Hub.md'], delta: true });
  check(u2 && u2.delta && u2.delta.outs.some(Boolean), 'the first edit after a cached start is a delta too');
  apply(again, u2.delta);
  check(!equal(again, await truth()), 'and it is exact');
  await a2.stop();

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  fs.rmSync(V, { recursive: true, force: true }); fs.rmSync(C, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
