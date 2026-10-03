// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Runs every UI scenario in tests/ on fresh throw-away folders and prints a summary.
//   node tests/run-all.js                      # from source
//   node tests/run-all.js "<path to app exe>"  # a packaged build
//   ONLY=editing.js,kanban.js node tests/run-all.js
// Exit code 1 if any scenario fails. The folders are made in the temp directory.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const repo = path.join(__dirname, '..');
const exe = process.argv[2];
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lanternote-tests-'));
const w = (dir, f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };

// the small folder described in tests/README.md
function basicVault(name, { archive = true } = {}) {
  const d = path.join(base, name);
  w(d, 'Home.md', '# Home\n\nSee [[A]] and [[Missing]] and [md](sub/B.md).\n\n- [ ] first task\n- [ ] second task\n\n![[sunset.png|400]]\n![[logo.svg]]\n');
  w(d, 'A.md', '# A\n\nText of A.\n');
  w(d, 'sub/B.md', '# B\n\nLink [[A|alias]]\n\n![[A#A]]\n');
  if (archive) w(d, 'Archive/Old.md', '# Old\n');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8DwnwEIGBmgAAAhAgL/2m0y3AAAAABJRU5ErkJggg==', 'base64');
  w(d, 'pics/sunset.png', png); w(d, 'pics/small.png', png);
  w(d, 'pics/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="orange"/></svg>');
  return d;
}
// folders built by the make-*-vault scripts (some scenarios expect the folder name)
function made(name, script) {
  const d = path.join(base, name); fs.mkdirSync(d, { recursive: true });
  const r = spawnSync(process.execPath, [path.join(__dirname, script), d], { cwd: repo, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(script + ': ' + r.stderr);
  return d;
}

const RUNS = [ // [scenario, folder, needs TV=<folder>, extra env]
  ['editing.js', () => basicVault('ed', { archive: false }), true],
  ['settings.js', () => basicVault('st'), true],
  ['guide-about.js', () => basicVault('ga')],
  ['image-viewer.js', () => basicVault('iv')],
  ['web-pictures.js', () => basicVault('wp'), true],
  ['changelog.js', () => basicVault('cl')],
  ['undo-redo.js', () => basicVault('ur')],
  ['tabs-split.js', () => basicVault('ts'), true],
  ['live-preview.js', () => basicVault('lp'), true],
  ['canvas.js', () => made('cv', 'make-canvas-vault.js'), true],
  ['dataview.js', () => made('dv', 'make-dv-vault.js'), true],
  ['kanban.js', () => made('kb', 'make-kanban-vault.js'), true],
  ['tasks-calendar.js', () => made('tc', 'make-task-vault.js'), true],
  ['command-center.js', () => made('lanternote-cc-vault', 'make-cc-vault.js'), true],
  ['open-file.js', () => basicVault('of'), true, { LANTERNOTE_TEST: '1' }],
  ['indexer-recovery.js', () => made('ir', 'make-dv-vault.js'), true, { LANTERNOTE_TEST: '1' }],
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
let failed = 0, steps = 0;
for (const [t, mk, tv, extra] of RUNS) {
  if (only && !only.includes(t)) continue;
  const vault = mk();
  const env = { ...process.env, ...(extra || {}) };
  delete env.FRESH_PROFILE; // it drops the last folder: the app would open nothing
  if (tv) env.TV = vault;
  if (exe) env.APP_EXE = exe;
  const r = spawnSync(process.execPath, ['scripts/drive.js', vault, 'tests/' + t, path.join(base, 'shots-' + t)], { cwd: repo, env, encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const pass = (out.match(/\bPASS /g) || []).length, fails = out.match(/\bFAIL .*/g) || [];
  steps += pass;
  const bad = fails.length || r.status !== 0;
  if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${t}: ${pass} passed, ${fails.length} failed${r.status ? ' (exit ' + r.status + ')' : ''}`);
  if (bad) console.log('     ' + (fails.join('\n     ') || out.split('\n').slice(-12).join('\n     ')));
}
console.log(`${steps} steps passed; ${failed} scenario(s) failed. Folders: ${base}`);
process.exitCode = failed ? 1 : 0;
