// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// View files (`.base`): YAML, filters, formulas, `this` in an embed, sort, group, summaries,
// the expression language, and errors. Runs indexer.js directly on a TEMPORARY folder, no window needed.
//   node tests/bases.js
const { Worker } = require('worker_threads');
const fs = require('fs'), path = require('path'), os = require('os');
const Bases = require('../src/bases.js');
const V = path.join(os.tmpdir(), 'lanternote-bases-vault'), C = path.join(os.tmpdir(), 'lanternote-bases-cache');
fs.rmSync(V, { recursive: true, force: true }); fs.rmSync(C, { recursive: true, force: true });

const MEETINGS = `filters:
  and:
    - categories.contains(link("Meetings"))
    - '!file.name.contains("Template")'
properties:
  note.date:
    displayName: Date
  file.name:
    displayName: Meeting
views:
  - type: table
    name: Meetings
    order:
      - file.name
      - date
      - people
    sort:
      - property: date
        direction: ASC
  - type: table
    name: Person
    filters:
      and:
        - list(people).contains(this)
    order: [file.name, date]
`;
const REPORTS = `# reports about one aircraft, station or anything they link to
filters: 'file.inFolder("Reports") && file.ext == "md"'
formulas:
  next: (ngay + "1M").format("YYYY-MM-DD")
  label: '"R-" + file.basename.lower()'
  tram_or_none: if(tram, tram, "none")
properties:
  file.name: {displayName: Report}
  formula.next: {displayName: "Next check"}
views:
  - type: table
    name: All
    order: [file.name, ngay, formula.next, so]
    sort:
      - column: note.ngay
        direction: DESC
    summaries:
      so: Sum
      ngay: Latest
  - type: table
    name: Tau
    filters: list(tau).contains(this)
    order: [file.name, ngay]
    sort: [{property: ngay, direction: DESC}]
  - type: table
    name: By station
    groupBy: {property: formula.tram_or_none, direction: ASC}
    order: [file.name, formula.label]
    limit: 10
`;
const RELATED = `filters:
  and:
    - file.path != this.file.path
formulas:
  Related: list(this.file.links).filter(list(file.links).containsAny(value)).unique()
  LinksOverlap: formula.Related.length
views:
  - type: table
    name: Related
    filters:
      or:
        - formula.LinksOverlap > 1
        - file.hasLink(this)
    order: [file.name, formula.LinksOverlap]
    sort:
      - property: formula.LinksOverlap
        direction: DESC
`;
const files = {
  'Meetings.md': '# Meetings\n\n![[Meetings.base]]\n',
  'People/Steph.md': '# Steph\n\n![[Meetings.base#Person]]\n',
  'People/Ann.md': '# Ann\n',
  'Notes/2023-10-01 Review.md': '---\ncategories:\n  - "[[Meetings]]"\ndate: 2023-10-01\npeople:\n  - "[[Ann]]"\n  - "[[Steph]]"\n---\nReview.\n',
  'Notes/2023-09-12 Meeting with Steph.md': '---\ncategories:\n  - "[[Meetings]]"\ndate: 2023-09-12\npeople:\n  - "[[Steph]]"\n---\nTalked about [[Out of Control]].\n',
  'Templates/Meeting Template.md': '---\ncategories:\n  - "[[Meetings]]"\ndate:\npeople: []\n---\n',
  'Aircraft/VN-A578.md': '# VN-A578\n\n![[Reports.base#Tau]]\n',
  'Aircraft/VN-A600.md': '# VN-A600\n',
  'Reports/R1.md': '---\nngay: 2026-11-01\ntau: "[[VN-A578]]"\ntram: SGN\nso: 3\ntags: [baocao]\n---\nR1 text [[Hub]] [[Steph]] [[Ann]]\n',
  'Reports/R2.md': '---\nngay: 2026-11-05\ntau: "[[VN-A578]]"\ntram: HAN\nso: 4\ntags: [baocao/dem]\n---\nR2 text [[Hub]] [[Steph]]\n',
  'Reports/R3.md': '---\nngay: 2026-01-31\ntau: "[[VN-A600]]"\nso: 5\n---\nR3 text [[Ann]]\n',
  'Hub.md': '# Hub\n\nLinks [[Steph]] and [[Ann]].\n',
  'Bases/Meetings.base': MEETINGS,
  'Bases/Reports.base': REPORTS,
  'Bases/Related.base': RELATED,
  'Bases/Broken.base': 'views:\n  - name: A\n   order: [x\n',
  'Bases/Empty.base': '',
};
for (const [p, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(V, p)), { recursive: true }); fs.writeFileSync(path.join(V, p), t); }

let failed = 0;
const check = (ok, name, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) failed++; };
const w = new Worker(path.join(__dirname, '..', 'indexer.js'), { workerData: { cacheDir: C } });
const waits = new Map(); let seq = 0;
w.on('message', (m) => {
  if (m.type) { if (m.type === 'log' && m.level === 'error') console.log('indexer error:', m.message); return; }
  const x = waits.get(m.id); if (!x) return; waits.delete(m.id);
  m.error ? x.rej(new Error(m.error)) : x.res(m.result);
});
const ask = (cmd, args) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); w.postMessage({ id, cmd, args }); });
const stem = (p) => p.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
const names = (r) => (r.rows || []).map((x) => stem(x.p)).join(', ');
const cellText = (v) => (v == null ? '-' : Array.isArray(v) ? v.map(cellText).join('|') : typeof v === 'object' ? (v.t === 'link' ? v.display : v.t === 'date' ? Bases.formatDate(v.ms, 'YYYY-MM-DD') : JSON.stringify(v)) : String(v));
// one expression, evaluated for the note R1 (ngay 2026-11-01, so 3, tags baocao)
async function expr(src) {
  const yaml = `filters: 'file.name == "R1.md"'\nformulas:\n  x: ${JSON.stringify(src)}\nviews:\n  - name: T\n    order: [formula.x]\n`;
  const r = await ask('base', { src: yaml, origin: 'Hub.md' });
  if (r.error) return 'ERROR ' + r.error;
  if (r.warning) return 'WARN ' + r.warning;
  return cellText(r.rows[0] && r.rows[0].cells[0]);
}

(async () => {
  await ask('open', { root: V });

  // ---- YAML ----
  const y = Bases.parseYaml(REPORTS);
  check(y.filters === 'file.inFolder("Reports") && file.ext == "md"' && y.views.length === 3 && y.views[1].sort[0].direction === 'DESC'
    && y.properties['file.name'].displayName === 'Report' && y.views[2].groupBy.property === 'formula.tram_or_none' && y.views[2].limit === 10,
  'YAML: block maps, lists of maps, flow {…} and [...], quotes, comments');
  const m = Bases.parseYaml(MEETINGS);
  check(m.filters.and[1] === '!file.name.contains("Template")' && m.views[1].order.join() === 'file.name,date', 'YAML: quoted filter, inline list in a list item');

  // ---- views ----
  let r = await ask('base', { file: 'Bases/Meetings.base', origin: 'Meetings.md' });
  check(names(r) === '2023-09-12 Meeting with Steph, 2023-10-01 Review', 'categories filter, Template left out, sort by date', `[${names(r)}] ${r.error || ''}`);
  check(r.columns.map((c) => c.name).join() === 'Meeting,Date,people' && r.views.join() === 'Meetings,Person' && r.view === 'Meetings', 'columns use displayName; view names listed', r.columns.map((c) => c.name).join());
  check(r.rows[0].cells[0].t === 'link' && r.rows[0].cells[0].display === '2023-09-12 Meeting with Steph', 'file.name shows as a link to the note');
  check(r.rows[1].cells[2].length === 2 && r.rows[1].cells[2][0].t === 'link' && r.rows[1].cells[2][0].path === 'People/Ann.md', 'front matter [[links]] resolve to notes');

  r = await ask('base', { file: 'Bases/Meetings.base', view: 'Person', origin: 'People/Steph.md' });
  check(names(r) === '2023-09-12 Meeting with Steph, 2023-10-01 Review', 'embed #Person: this = the embedding note (Steph)', `[${names(r)}]`);
  r = await ask('base', { file: 'Bases/Meetings.base', view: 'person', origin: 'People/Ann.md' });
  check(names(r) === '2023-10-01 Review', 'view name is case-insensitive; this = Ann', `[${names(r)}]`);

  r = await ask('base', { file: 'Bases/Reports.base', view: 'Tau', origin: 'Aircraft/VN-A578.md' });
  check(names(r) === 'R2, R1', 'aircraft note lists its own reports, newest first', `[${names(r)}]`);
  r = await ask('base', { file: 'Bases/Reports.base', view: 'Tau', origin: 'Aircraft/VN-A600.md' });
  check(names(r) === 'R3', 'same view, another aircraft', `[${names(r)}]`);

  r = await ask('base', { file: 'Bases/Reports.base' });
  check(names(r) === 'R2, R1, R3', 'sort with the older "column:" key, DESC', `[${names(r)}]`);
  check(r.rows[1].cells.map(cellText).join() === 'R1,2026-11-01,2026-12-01,3', 'formula: date + "1M" then format()', r.rows[1].cells.map(cellText).join());
  check(cellText(r.rows[2].cells[2]) === '2026-02-28', 'adding a month keeps to the end of a short month', cellText(r.rows[2].cells[2]));
  check(r.summaries && r.summaries[3].value === 12 && r.summaries[3].name === 'Sum' && cellText(r.summaries[1].value) === '2026-11-05' && r.summaries[0] === null, 'summaries: Sum and Latest', JSON.stringify(r.summaries));

  r = await ask('base', { file: 'Bases/Reports.base', view: 'By station' });
  const gk = (r.groups || []).map((gr) => `${gr.key}:${gr.rows.map((x) => stem(x.p)).join('+')}`).join(' ');
  check(gk === 'HAN:R2 none:R3 SGN:R1', 'groupBy a formula, groups in order (case-insensitive)', gk);
  check(r.groups[0].rows[0].cells[1] === 'R-r2', 'formula: text + method', cellText(r.groups[0].rows[0].cells[1]));

  r = await ask('base', { file: 'Bases/Related.base', origin: 'Hub.md' });
  check(names(r).split(', ').sort().join() === '2023-10-01 Review,R1,R2', 'related notes by shared links, front matter links too (filter with value, containsAny)', `[${names(r)}]`);
  check(r.rows.find((x) => stem(x.p) === 'R1').cells[1] === 2 && r.rows[r.rows.length - 1].p === 'Reports/R2.md', 'R1 shares two links with Hub; R2 only links to it', r.rows.map((x) => stem(x.p) + '=' + x.cells[1]).join(' '));

  // `this` when the view file is opened on its own = the view file
  r = await ask('base', { src: 'filters: file.folder == this.file.folder\nviews:\n  - name: A\n    order: [file.name]\n', file: 'Bases/Reports.base' });
  check(names(r) === 'Broken, Empty, Meetings, Related, Reports' || names(r).split(', ').sort().join() === 'Broken,Empty,Meetings,Related,Reports', 'opened on its own: this = the view file', `[${names(r)}]`);

  // ```base block text, tags (nested tags count)
  r = await ask('base', { src: 'filters: file.hasTag("baocao")\nviews:\n  - name: A\n    order: [file.name]\n    sort: [{property: file.name, direction: ASC}]\n', origin: 'Hub.md' });
  check(names(r) === 'R1, R2', 'hasTag includes nested tags', `[${names(r)}]`);
  r = await ask('base', { src: 'filters:\n  not:\n    - file.ext == "md"\n    - file.inFolder("Bases") == false\nviews:\n  - name: A\n', origin: 'Hub.md' });
  check(names(r).split(', ').sort().join() === 'Broken,Empty,Meetings,Related,Reports', 'not: none of the listed statements', `[${names(r)}]`);
  r = await ask('base', { src: 'views:\n  - name: A\n    filters: file.name.startsWith("R") && file.inFolder("Reports")\n    limit: 2\n    sort: [{property: file.name, direction: ASC}]\n', origin: 'Hub.md' });
  check(names(r) === 'R1, R2' && r.total === 3 && !r.truncated, 'limit: total stays the full count, not marked as cut off', `[${names(r)}] total ${r.total}`);

  // ---- expressions ----
  const cases = [
    ['1 + 2 * 3 == 7 && !(2 > 3)', 'true'],
    ['(10 - 4) / 3 % 2', '0'],
    ['"a" + 1 + 2', 'a12'],
    ['so * 2 + 1', '7'],
    ['[1, 2, 3].contains(2) && ![1,2].contains(5)', 'true'],
    ['[3, 1, 2].sort().reverse().join("-")', '3-2-1'],
    ['[1,2,3,4].filter(value > 2).map(value * 10)', '30|40'],
    ['[1,2,3].reduce(acc + value, 0)', '6'],
    ['if(so > 2, "big", "small")', 'big'],
    ['if(false, 1)', '-'],
    ['/R\\d/.matches(file.basename)', 'true'],
    ['"John Smith".replace(/(\\w+) (\\w+)/, "$2, $1")', 'Smith, John'],
    ['"a,b,c".split(",", 2).length', '2'],
    ['"hello world".title()', 'Hello World'],
    ['(2.3333).round(2)', '2.33'],
    ['(3.14159).toFixed(2)', '3.14'],
    ['date("2024-12-01") + "1M" + "4h" + "3m"', '2025-01-01'],
    ['(date("2024-12-01 10:00:00") + "30m").format("HH:mm")', '10:30'],
    ['(date("2026-11-09") - date("2026-11-01")).days', '8'],
    ['ngay > date("2026-10-31") && ngay < "2026-11-02"', 'true'],
    ['ngay.year * 100 + ngay.month', '202611'],
    ['tau == link("VN-A578")', 'true'],
    ['tau.asFile().name', 'VN-A578.md'],
    ['file.hasLink("Hub") && file.hasLink(link("Steph")) && !file.hasLink("VN-A600")', 'true'],
    ['file.links.length', '4'],
    ['this.file.name', 'Hub.md'],
    ['this.file.backlinks.length', '2'],
    ['file.hasProperty("TRAM") && !file.hasProperty("missing")', 'true'],
    ['missing == null && missing.isEmpty() && !missing', 'true'],
    ['list("x").length + list(missing).length', '1'],
    ['note["so"] + note.so', '6'],
    ['file.properties.tram', 'SGN'],
    ['number("3.5") + number(true)', '4.5'],
    ['max(1, 9, 4) - min(4, 2)', '7'],
    ['"x".isType("string") && (5).isTruthy()', 'true'],
    ['nosuchfn(1)', 'WARN unknown function nosuchfn()'],
    ['1 +', 'ERROR the expression ends too early'],
  ];
  for (const [src, want] of cases) {
    const got = await expr(src);
    check(got === want || (want.startsWith('ERROR') && got.startsWith(want)), 'expr ' + src, `→ ${got}`);
  }

  // ---- errors ----
  r = await ask('base', { file: 'Bases/Broken.base' });
  check(/not valid YAML/.test(r.error || ''), 'broken YAML: a readable error', r.error);
  r = await ask('base', { file: 'Bases/Empty.base' });
  check(!r.error && r.rows.length > 10, 'empty view file: every file, one table', r.error || r.rows.length);
  r = await ask('base', { file: 'Bases/Nope.base' });
  check(/not found/.test(r.error || ''), 'missing view file: error', r.error);
  r = await ask('base', { src: "filters: 'file.name ==== 1'\nviews:\n  - name: A\n" });
  check(!!r.error, 'bad filter syntax: error, no rows', r.error);

  // ---- speed: 20,000 more notes ----
  const many = path.join(V, 'Many');
  fs.mkdirSync(many, { recursive: true });
  for (let k = 0; k < 20000; k++) fs.writeFileSync(path.join(many, `N${k}.md`), `---\ntram: ${k % 3 ? 'SGN' : 'HAN'}\nngay: 2026-10-${String(1 + (k % 28)).padStart(2, '0')}\n---\nSee [[Hub]] [[N${(k + 1) % 20000}]]\n`);
  await ask('open', { root: V, ensure: true });
  const t0 = Date.now();
  r = await ask('base', { file: 'Bases/Related.base', origin: 'Hub.md' });
  const ms = Date.now() - t0;
  check(!r.error && r.total > 20000 && ms < 5000, 'Related view over 20,000+ notes', `${r.total} rows in ${ms} ms (worker ${r.ms} ms)`);
  r = await ask('base', { src: 'filters: tram == "HAN" && ngay >= date("2026-10-15")\nviews:\n  - name: A\n    sort: [{property: ngay, direction: DESC}]\n    limit: 5\n', origin: 'Hub.md' });
  check(!r.error && r.rows.length === 5 && r.total > 3000, 'property filter + sort over 20,000 notes', `${r.total} rows, worker ${r.ms} ms`);

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  await w.terminate();
  fs.rmSync(V, { recursive: true, force: true }); fs.rmSync(C, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
