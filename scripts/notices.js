// Lanternote — writes THIRD-PARTY-NOTICES.txt: the licence text of every
// library shipped inside the app. MIT / Apache / MPL licences require these
// notices to travel with any copy that is distributed.
// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

// libraries bundled into src/vendor (and what the graph bundle carries inside)
const direct = ['marked', 'dompurify', 'mermaid', '@cosmos.gl/graph',
  '@codemirror/view', '@codemirror/state', '@codemirror/commands', '@codemirror/language', '@codemirror/lang-markdown',
  '@codemirror/autocomplete', '@codemirror/search', '@lezer/highlight', '@lezer/markdown', '@lezer/common', '@lezer/lr',
  'style-mod', 'w3c-keyname', 'crelt', '@marijn/find-cluster-break'];
const seen = new Set();
const list = [];
function add(name, from) {
  if (seen.has(name)) return;
  let dir = path.join(root, 'node_modules', name);
  if (from && fs.existsSync(path.join(from, 'node_modules', name))) dir = path.join(from, 'node_modules', name);
  if (!fs.existsSync(dir)) return;
  seen.add(name);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = fs.readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  list.push({ name, version: pkg.version, license: pkg.license || '', text: file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : `(${pkg.license} — see ${pkg.homepage || pkg.repository?.url || 'the package'})` });
  return { dir, pkg };
}
for (const n of direct) {
  const r = add(n);
  // the cosmos.gl UMD file bundles its own dependencies (luma.gl, d3, …)
  if (r && n === '@cosmos.gl/graph') for (const d of Object.keys(r.pkg.dependencies || {})) add(d, r.dir);
}
const out = ['Lanternote — third-party software notices', '',
  'Lanternote includes the following open-source components. Each is used under',
  'its own licence, reproduced below. Electron and Chromium notices are shipped',
  'separately as LICENSE.electron.txt and LICENSES.chromium.html.', ''];
for (const l of list) out.push('='.repeat(78), `${l.name} ${l.version} — ${l.license}`, '-'.repeat(78), l.text, '');
fs.writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.txt'), out.join('\n'));
console.log('notices:', list.length, 'packages');
