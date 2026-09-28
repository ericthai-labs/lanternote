// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Rebuilds the user guide (Markdown + PDF, English, with pictures) and the
// advert pictures for the current version. RUN THIS FOR EVERY RELEASE.
//   node scripts/make-media.js [work folder] [--to "<project folder>"] [--fresh]
// Steps: made-up demo vault (never real notes) → screenshots (scripts/shots.js)
// → adverts + guide PDF (scripts/render-ads.js) → copied, with --to, into
//   <project folder>/Quang-cao          ad-*.png (1920×1080), sq-*.png (1080×1080)
//   <project folder>/Huong-dan-co-hinh  Lanternote-User-Guide.md / .pdf, img/
// Old pictures there that this run did not make are removed.
// The guide text lives in docs/guide/User-Guide.md — update it with the features.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const fresh = args.includes('--fresh'); if (fresh) args.splice(args.indexOf('--fresh'), 1);
const to = flag('--to');
const work = path.resolve(args[0] || path.join(os.tmpdir(), 'lanternote-media'));
const src = path.join(__dirname, '..');
const demo = path.join(work, 'demo-vault'), shots = path.join(work, 'shots'), out = path.join(work, 'out');
const run = (cmd, a, env = {}) => {
  console.log('>', path.basename(cmd), a.map((x) => path.basename(x)).join(' '));
  const r = spawnSync(cmd, a, { cwd: src, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} failed (${r.status})`);
};
const version = require(path.join(src, 'package.json')).version;

fs.mkdirSync(work, { recursive: true });
if (fresh || !fs.existsSync(path.join(demo, 'Welcome.md'))) run(process.execPath, ['scripts/make-demo-vault.js', demo]);
fs.rmSync(shots, { recursive: true, force: true }); fs.mkdirSync(shots, { recursive: true });
run(process.execPath, ['scripts/drive.js', demo, 'scripts/shots.js', shots], { THEME: 'dark' });
const need = ['g01-main-window', 'g11-command-center', 'g12-galaxy', 'ad-raw-galaxy-wide', 'ad-raw-tasks-square', 'ad-raw-graph-wide'];
for (const n of need) if (!fs.existsSync(path.join(shots, n + '.png'))) throw new Error('screenshot missing: ' + n);

// the guide: text from docs/guide, pictures from the shots
fs.rmSync(out, { recursive: true, force: true });
const guide = path.join(out, 'guide'), ads = path.join(out, 'ads');
fs.mkdirSync(path.join(guide, 'img'), { recursive: true });
fs.writeFileSync(path.join(guide, 'Lanternote-User-Guide.md'), fs.readFileSync(path.join(src, 'docs', 'guide', 'User-Guide.md'), 'utf8').replace(/^version: .*$/m, 'version: ' + version).replace(/\*Version [\d.]+\./, `*Version ${version}.`));
for (const f of fs.readdirSync(shots)) if (/^g\d+-.*\.png$/.test(f)) fs.copyFileSync(path.join(shots, f), path.join(guide, 'img', f));
run(require(path.join(src, 'node_modules', 'electron')), ['scripts/render-ads.js', shots, ads, path.join(guide, 'Lanternote-User-Guide.md'), path.join(guide, 'Lanternote-User-Guide.pdf')], { LANTERNOTE_SRC: src });

if (to) {
  // copy with a few retries: OneDrive may hold a file for a moment
  const copy = (a, b) => { for (let i = 0; ; i++) { try { fs.copyFileSync(a, b); return; } catch (e) { if (i > 5) throw e; spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1500)']); } } };
  const sync = (from, dest, generated) => {
    fs.mkdirSync(dest, { recursive: true });
    const made = new Set(fs.readdirSync(from).filter((f) => fs.statSync(path.join(from, f)).isFile()));
    for (const f of made) copy(path.join(from, f), path.join(dest, f));
    for (const f of fs.readdirSync(dest)) if (generated.test(f) && !made.has(f)) fs.rmSync(path.join(dest, f)); // stale pictures of an older run
  };
  sync(ads, path.join(to, 'Quang-cao'), /^(ad|sq)-.*\.png$/);
  sync(guide, path.join(to, 'Huong-dan-co-hinh'), /^(Huong-dan|Lanternote-User-Guide).*\.(md|pdf)$/);
  sync(path.join(guide, 'img'), path.join(to, 'Huong-dan-co-hinh', 'img'), /^g\d+-.*\.png$/);
  console.log('copied to', to);
}
console.log(`media for ${version} ready in`, out);
