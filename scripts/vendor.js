// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Copies the browser libraries into src/vendor so the app runs offline
// and node_modules never has to be packaged.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'src', 'vendor');
fs.mkdirSync(out, { recursive: true });
for (const [from, to] of [
  ['node_modules/marked/marked.min.js', 'marked.min.js'],
  ['node_modules/dompurify/dist/purify.min.js', 'purify.min.js'],
  ['node_modules/mermaid/dist/mermaid.min.js', 'mermaid.min.js'],
  ['node_modules/@cosmos.gl/graph/dist/index.min.js', 'cosmos.min.js'],
]) {
  fs.copyFileSync(path.join(root, from), path.join(out, to));
  console.log('vendor:', to);
}

// The editor (CodeMirror 6) ships as ES modules: bundle it into one file.
require('esbuild').buildSync({
  entryPoints: [path.join(root, 'editor', 'entry.js')],
  bundle: true, minify: true, format: 'iife', globalName: 'LanternoteEditor',
  target: 'chrome120', outfile: path.join(out, 'editor.js'), logLevel: 'warning',
  banner: { js: '/* Lanternote editor — Copyright © 2026 Eric Thai - Thai Ba Hoa. Apache License 2.0. Includes CodeMirror 6 (MIT, Marijn Haverbeke and others) — see THIRD-PARTY-NOTICES.txt */' },
});
console.log('vendor: editor.js');
